#!/usr/bin/env bash
#
# Deploy new_mafiking ke VPS Nevacloud.
#
# Cara pakai Linux / WSL / Git Bash:
#   ./deploy.sh 202.155.94.210 root
#
# Cara pakai Windows PowerShell:
#   .\deploy.ps1 202.155.94.210 root
#
# Catatan:
# - .env lokal tidak dikirim. Jika .env server belum ada, script membuat .env
#   production dasar dan kamu perlu mengisi API key langsung di server.
# - database.sqlite lokal hanya dipakai untuk bootstrap jika database server
#   belum ada. Untuk memaksa overwrite database server: DEPLOY_DB=1 ./deploy.sh ...

set -euo pipefail

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ]; then
  echo "Cara pakai: ./deploy.sh <IP_SERVER> <USERNAME>"
  echo "Contoh:    ./deploy.sh 202.155.94.210 root"
  exit 1
fi

SERVER_IP="$1"
SERVER_USER="$2"
APP_NAME="${APP_NAME:-new_mafiking}"
APP_PORT="${APP_PORT:-3000}"
REMOTE_DIR="${REMOTE_DIR:-/home/$SERVER_USER/new_mafiking}"

if [ "$SERVER_USER" = "root" ]; then
  REMOTE_DIR="${REMOTE_DIR:-/root/new_mafiking}"
  REMOTE_DIR="/root/new_mafiking"
fi

SSH_TARGET="$SERVER_USER@$SERVER_IP"
LOCAL_DB="db/database.sqlite"
REMOTE_DB="$REMOTE_DIR/db/database.sqlite"
REMOTE_TMP_DB="/tmp/${APP_NAME}-database.sqlite"
DEPS_HASH="$(sha256sum package.json package-lock.json | sha256sum | awk '{print $1}')"

echo "========================================"
echo " Deploy new_mafiking ke Nevacloud"
echo "========================================"
echo "Server : $SSH_TARGET"
echo "Folder : $REMOTE_DIR"
echo "Port   : $APP_PORT"
echo ""

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Command '$1' belum tersedia di laptop ini."
    exit 1
  fi
}

require_command ssh
require_command rsync
require_command npm

if [ ! -f "package.json" ] || [ ! -f "server.js" ]; then
  echo "Jalankan deploy.sh dari root folder new_mafiking."
  exit 1
fi

echo "[1/6] Menjalankan check lokal..."
npm run check

echo ""
echo "[1/6] Membuat bundle production lokal..."
npm run build

echo ""
echo "[2/6] Menyiapkan server..."
ssh "$SSH_TARGET" "APP_PORT='$APP_PORT' APP_NAME='$APP_NAME' REMOTE_DIR='$REMOTE_DIR' bash -s" <<'ENDSSH'
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

$SUDO apt-get update -y
$SUDO apt-get install -y curl ca-certificates build-essential python3 rsync nginx openssl

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
fi

if [ "$NODE_MAJOR" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash -
  $SUDO apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  $SUDO npm install -g pm2
fi

mkdir -p "$REMOTE_DIR"
mkdir -p "$REMOTE_DIR/db"

echo "Server siap: node $(node -v), npm $(npm -v), pm2 $(pm2 -v)"
ENDSSH

echo ""
echo "[3/6] Mengirim file aplikasi..."
rsync -az --delete --human-readable --info=progress2,stats2 \
  --exclude ".git" \
  --exclude ".agents" \
  --exclude ".codex" \
  --exclude "node_modules" \
  --exclude ".env*" \
  --exclude "env" \
  --exclude ".deploy-deps.sha" \
  --exclude "*.log" \
  --exclude "logs" \
  --exclude "assets/saas_demo_video.mp4" \
  --exclude "db/*.sqlite" \
  --exclude "db/*.sqlite-shm" \
  --exclude "db/*.sqlite-wal" \
  --exclude "db/*.backup-*" \
  ./ "$SSH_TARGET:$REMOTE_DIR/"

if [ -f "$LOCAL_DB" ]; then
  if [ "${DEPLOY_DB:-0}" = "1" ] || ssh "$SSH_TARGET" "test ! -f '$REMOTE_DB'"; then
    echo "Mengirim database lokal sebagai kandidat bootstrap..."
    rsync -az --human-readable --info=progress2 "$LOCAL_DB" "$SSH_TARGET:$REMOTE_TMP_DB"
  else
    echo "Database server sudah ada, skip upload database lokal."
  fi
fi

echo ""
echo "[4/6] Menyiapkan .env dan database..."
ssh "$SSH_TARGET" "APP_PORT='$APP_PORT' APP_NAME='$APP_NAME' REMOTE_DIR='$REMOTE_DIR' REMOTE_DB='$REMOTE_DB' REMOTE_TMP_DB='$REMOTE_TMP_DB' DEPLOY_DB='${DEPLOY_DB:-0}' bash -s" <<'ENDSSH'
set -euo pipefail

cd "$REMOTE_DIR"

if [ ! -f .env ]; then
  SECRET="$(openssl rand -hex 48)"
  cat > .env <<EOF
NODE_ENV=production
PORT=$APP_PORT
SESSION_SECRET=$SECRET
GEMINI_KEY_1=
GEMINI_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_MAX_TOKENS=12000
DEEPSEEK_TIMEOUT_MS=90000
LOCAL_ADMIN_MODE=false
EOF
  chmod 600 .env
  echo ".env production dibuat. Isi API key di $REMOTE_DIR/.env jika fitur AI dibutuhkan."
else
  echo ".env server sudah ada, tidak ditimpa."
fi

if grep -q '^PORT=' .env; then
  sed -i "s/^PORT=.*/PORT=$APP_PORT/" .env
else
  printf "\nPORT=%s\n" "$APP_PORT" >> .env
fi

mkdir -p db
if [ "$DEPLOY_DB" = "1" ] && [ -f "$REMOTE_TMP_DB" ]; then
  if [ -f "$REMOTE_DB" ]; then
    cp "$REMOTE_DB" "$REMOTE_DB.backup-$(date +%Y%m%d-%H%M%S)"
  fi
  mv "$REMOTE_TMP_DB" "$REMOTE_DB"
  echo "Database server dioverwrite karena DEPLOY_DB=1."
elif [ ! -f "$REMOTE_DB" ] && [ -f "$REMOTE_TMP_DB" ]; then
  mv "$REMOTE_TMP_DB" "$REMOTE_DB"
  echo "Database awal dipasang dari lokal."
else
  rm -f "$REMOTE_TMP_DB"
  echo "Database server dipertahankan."
fi
ENDSSH

echo ""
echo "[5/6] Install dependency dan setup Nginx..."
ssh "$SSH_TARGET" "APP_PORT='$APP_PORT' APP_NAME='$APP_NAME' REMOTE_DIR='$REMOTE_DIR' SERVER_IP='$SERVER_IP' DEPS_HASH='$DEPS_HASH' bash -s" <<'ENDSSH'
set -euo pipefail

if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

cd "$REMOTE_DIR"
if [ -f .deploy-deps.sha ] && [ "$(cat .deploy-deps.sha)" = "$DEPS_HASH" ] && [ -d node_modules ]; then
  echo "Dependency tidak berubah, skip npm ci."
elif [ ! -f .deploy-deps.sha ] && [ -d node_modules ] && npm ls --omit=dev --depth=0 >/dev/null 2>&1; then
  echo "Dependency server sudah valid, menyimpan hash dan skip npm ci."
  printf "%s\n" "$DEPS_HASH" > .deploy-deps.sha
else
  echo "Dependency berubah atau belum terpasang, menjalankan npm ci..."
  npm ci --omit=dev
  printf "%s\n" "$DEPS_HASH" > .deploy-deps.sha
fi

if [ -f /etc/letsencrypt/live/mafiking.com/fullchain.pem ] && [ -f /etc/letsencrypt/live/mafiking.com/privkey.pem ]; then
  $SUDO tee "/etc/nginx/sites-available/$APP_NAME" >/dev/null <<EOF
server {
    listen 443 ssl;
    server_name mafiking.com www.mafiking.com;

    client_max_body_size 25m;

    ssl_certificate /etc/letsencrypt/live/mafiking.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mafiking.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 80;
    server_name mafiking.com www.mafiking.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF
else
  $SUDO tee "/etc/nginx/sites-available/$APP_NAME" >/dev/null <<EOF
server {
    listen 80;
    server_name mafiking.com www.mafiking.com;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
fi

$SUDO ln -sfn "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/$APP_NAME"
$SUDO rm -f /etc/nginx/sites-enabled/mafiking /etc/nginx/sites-enabled/new-mafiking /etc/nginx/sites-enabled/mafiking.bak.*
$SUDO rm -f /etc/nginx/sites-enabled/default
$SUDO nginx -t
$SUDO systemctl enable nginx >/dev/null 2>&1 || true
$SUDO systemctl reload nginx

if command -v ufw >/dev/null 2>&1; then
  $SUDO ufw allow 22/tcp >/dev/null || true
  $SUDO ufw allow 80/tcp >/dev/null || true
  $SUDO ufw allow 443/tcp >/dev/null || true
fi
ENDSSH

echo ""
echo "[6/6] Menjalankan aplikasi dengan PM2..."
ssh "$SSH_TARGET" "APP_PORT='$APP_PORT' APP_NAME='$APP_NAME' REMOTE_DIR='$REMOTE_DIR' bash -s" <<'ENDSSH'
set -euo pipefail

cd "$REMOTE_DIR"

pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 delete mafiking >/dev/null 2>&1 || true
pm2 delete new-mafiking >/dev/null 2>&1 || true
pm2 start server.js --name "$APP_NAME" --time
pm2 save

STARTUP_CMD="$(pm2 startup systemd -u "$(whoami)" --hp "$HOME" | tail -n 1 || true)"
if echo "$STARTUP_CMD" | grep -q "sudo\\|env PATH"; then
  eval "$STARTUP_CMD" || true
fi

sleep 2
curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/tmp/"$APP_NAME"-health.json
cat /tmp/"$APP_NAME"-health.json
echo ""
ENDSSH

echo ""
echo "========================================"
echo "Deploy selesai."
echo "Buka: http://$SERVER_IP"
echo ""
echo "Perintah server:"
echo "  ssh $SSH_TARGET"
echo "  cd $REMOTE_DIR"
echo "  nano .env"
echo "  pm2 logs $APP_NAME"
echo "  pm2 restart $APP_NAME"
echo ""
echo "Jika ingin deploy ulang sambil overwrite database server:"
echo "  DEPLOY_DB=1 ./deploy.sh $SERVER_IP $SERVER_USER"
echo "========================================"
