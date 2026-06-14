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
# - Deploy biasa mempertahankan isi database server dan tidak mengimpor ulang
#   bank JSON. Untuk sengaja sinkron konten bundled: DEPLOY_IMPORTS=1 ./deploy.sh ...

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
if [ -n "${REMOTE_DIR:-}" ]; then
  REMOTE_DIR="$REMOTE_DIR"
elif [ "$SERVER_USER" = "root" ]; then
  REMOTE_DIR="/opt/mafiking"
else
  REMOTE_DIR="/home/$SERVER_USER/new_mafiking"
fi
APP_RUN_USER="${APP_RUN_USER:-}"
if [ -z "$APP_RUN_USER" ]; then
  if [ "$REMOTE_DIR" = "/opt/mafiking" ]; then
    APP_RUN_USER="mafiking"
  else
    APP_RUN_USER="$SERVER_USER"
  fi
fi

SSH_TARGET="$SERVER_USER@$SERVER_IP"
LOCAL_DB="db/database.sqlite"
REMOTE_DB="$REMOTE_DIR/db/database.sqlite"
REMOTE_TMP_DB="/tmp/${APP_NAME}-database.sqlite"
DEPS_HASH="$(
  {
    node -e 'const p=require("./package.json"); process.stdout.write(JSON.stringify({dependencies:p.dependencies||{},optionalDependencies:p.optionalDependencies||{},engines:p.engines||{}}));'
    sha256sum package-lock.json | awk '{print $1}'
  } | sha256sum | awk '{print $1}'
)"
LEGACY_DEPS_HASH="$(sha256sum package.json package-lock.json | sha256sum | awk '{print $1}')"

echo "========================================"
echo " Deploy new_mafiking ke Nevacloud"
echo "========================================"
echo "Server : $SSH_TARGET"
echo "Folder : $REMOTE_DIR"
echo "Port   : $APP_PORT"
echo "Run as : $APP_RUN_USER"
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

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
fi

BOOTSTRAP_REQUIRED=0
for command_name in curl rsync nginx openssl make g++ python3; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    BOOTSTRAP_REQUIRED=1
  fi
done
if [ "$NODE_MAJOR" -lt 20 ] || ! command -v pm2 >/dev/null 2>&1; then
  BOOTSTRAP_REQUIRED=1
fi

if [ "$BOOTSTRAP_REQUIRED" = "1" ]; then
  echo "Komponen server belum lengkap, menjalankan bootstrap apt/npm..."
  $SUDO apt-get update -y
  $SUDO apt-get install -y curl ca-certificates build-essential python3 rsync nginx openssl
else
  echo "Komponen server sudah lengkap, skip apt-get update/install."
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
echo "[3/6] Membuat snapshot media profil server..."
REMOTE_AVATAR_COUNT_BEFORE="$(
  ssh "$SSH_TARGET" "REMOTE_DIR='$REMOTE_DIR' bash -s" <<'ENDSSH'
set -euo pipefail
mkdir -p "$REMOTE_DIR/profile-media/avatars" /var/backups/mafiking
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tar -C "$REMOTE_DIR" -czf "/var/backups/mafiking/profile-media-pre-deploy-$stamp.tar.gz" profile-media
find "$REMOTE_DIR/profile-media/avatars" -maxdepth 1 -type f | wc -l
ENDSSH
)"
echo "Avatar sebelum deploy: $REMOTE_AVATAR_COUNT_BEFORE"

echo ""
echo "[3/6] Mengirim file aplikasi..."
rsync -az --delete --human-readable --info=progress2,stats2 \
  --filter "P dist/assets/***" \
  --filter "P profile-media/***" \
  --exclude ".git" \
  --exclude ".agents" \
  --exclude ".codex" \
  --exclude ".pm2" \
  --exclude ".npm" \
  --exclude "node_modules" \
  --exclude ".env*" \
  --exclude "env" \
  --exclude ".deploy-deps.sha" \
  --exclude "*.log" \
  --exclude "logs" \
  --exclude "db/*.sqlite" \
  --exclude "db/*.sqlite-shm" \
  --exclude "db/*.sqlite-wal" \
  --exclude "db/*.backup-*" \
  ./ "$SSH_TARGET:$REMOTE_DIR/"

REMOTE_AVATAR_COUNT_AFTER="$(
  ssh "$SSH_TARGET" "find '$REMOTE_DIR/profile-media/avatars' -maxdepth 1 -type f | wc -l"
)"
echo "Avatar setelah deploy: $REMOTE_AVATAR_COUNT_AFTER"
if [ "$REMOTE_AVATAR_COUNT_AFTER" -lt "$REMOTE_AVATAR_COUNT_BEFORE" ]; then
  echo "FATAL: jumlah avatar berkurang saat deploy. Snapshot tersimpan di /var/backups/mafiking."
  exit 1
fi

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
ssh "$SSH_TARGET" "APP_PORT='$APP_PORT' APP_NAME='$APP_NAME' REMOTE_DIR='$REMOTE_DIR' REMOTE_DB='$REMOTE_DB' REMOTE_TMP_DB='$REMOTE_TMP_DB' DEPLOY_DB='${DEPLOY_DB:-0}' DEPLOY_IMPORTS='${DEPLOY_IMPORTS:-0}' bash -s" <<'ENDSSH'
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
RUN_CONTENT_IMPORTS="$DEPLOY_IMPORTS"
if [ "$DEPLOY_DB" = "1" ] && [ -f "$REMOTE_TMP_DB" ]; then
  if [ -f "$REMOTE_DB" ]; then
    cp "$REMOTE_DB" "$REMOTE_DB.backup-$(date +%Y%m%d-%H%M%S)"
  fi
  mv "$REMOTE_TMP_DB" "$REMOTE_DB"
  RUN_CONTENT_IMPORTS="1"
  echo "Database server dioverwrite karena DEPLOY_DB=1."
elif [ ! -f "$REMOTE_DB" ] && [ -f "$REMOTE_TMP_DB" ]; then
  mv "$REMOTE_TMP_DB" "$REMOTE_DB"
  RUN_CONTENT_IMPORTS="1"
  echo "Database awal dipasang dari lokal."
else
  rm -f "$REMOTE_TMP_DB"
  echo "Database server dipertahankan."
fi

printf "%s\n" "$RUN_CONTENT_IMPORTS" > .deploy-run-content-imports
ENDSSH

echo ""
echo "[5/6] Install dependency dan setup Nginx..."
ssh "$SSH_TARGET" "APP_PORT='$APP_PORT' APP_NAME='$APP_NAME' REMOTE_DIR='$REMOTE_DIR' SERVER_IP='$SERVER_IP' DEPS_HASH='$DEPS_HASH' LEGACY_DEPS_HASH='$LEGACY_DEPS_HASH' APP_RUN_USER='$APP_RUN_USER' DEPLOY_IMPORTS='${DEPLOY_IMPORTS:-0}' FORCE_NPM_CI='${FORCE_NPM_CI:-0}' bash -s" <<'ENDSSH'
set -euo pipefail

if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

cd "$REMOTE_DIR"
if [ "$APP_RUN_USER" != "root" ] && id "$APP_RUN_USER" >/dev/null 2>&1; then
  $SUDO chown -R "$APP_RUN_USER:$APP_RUN_USER" "$REMOTE_DIR"
fi

if [ -f ops/backup.sh ]; then
  $SUDO mkdir -p /opt/mafiking-ops
  $SUDO install -m 700 ops/backup.sh /opt/mafiking-ops/backup.sh
  echo "Skrip backup operasional diperbarui."
fi

run_app() {
  if [ "$APP_RUN_USER" != "root" ] && id "$APP_RUN_USER" >/dev/null 2>&1; then
    $SUDO -u "$APP_RUN_USER" env HOME="$REMOTE_DIR" PM2_HOME="$REMOTE_DIR/.pm2" "$@"
  else
    "$@"
  fi
}

if [ "$FORCE_NPM_CI" = "1" ]; then
  echo "FORCE_NPM_CI=1 aktif, memasang ulang dependency production..."
  run_app npm ci --omit=dev --prefer-offline --no-audit --no-fund
  printf "%s\n" "$DEPS_HASH" > .deploy-deps.sha
elif [ -f .deploy-deps.sha ] && [ "$(cat .deploy-deps.sha)" = "$DEPS_HASH" ] && [ -d node_modules ]; then
  echo "Dependency tidak berubah, skip npm ci."
elif [ -f .deploy-deps.sha ] && [ "$(cat .deploy-deps.sha)" = "$LEGACY_DEPS_HASH" ] && [ -d node_modules ]; then
  echo "Dependency sudah dipasang oleh deploy versi lama, memperbarui hash tanpa npm ci."
  printf "%s\n" "$DEPS_HASH" > .deploy-deps.sha
elif [ ! -f .deploy-deps.sha ] && [ -d node_modules ] && run_app npm ls --omit=dev --depth=0 >/dev/null 2>&1; then
  echo "Dependency server sudah valid, menyimpan hash dan skip npm ci."
  printf "%s\n" "$DEPS_HASH" > .deploy-deps.sha
else
  echo "Dependency berubah atau belum terpasang, menjalankan npm ci..."
  run_app npm ci --omit=dev --prefer-offline --no-audit --no-fund
  printf "%s\n" "$DEPS_HASH" > .deploy-deps.sha
fi

RUN_CONTENT_IMPORTS="0"
if [ -f .deploy-run-content-imports ]; then
  RUN_CONTENT_IMPORTS="$(cat .deploy-run-content-imports)"
fi
rm -f .deploy-run-content-imports

if [ "$RUN_CONTENT_IMPORTS" = "1" ]; then
  if [ "$DEPLOY_IMPORTS" = "1" ]; then
    echo "DEPLOY_IMPORTS=1 aktif, mengimpor konten bundled ke database server."
  else
    echo "Database baru/overwrite terdeteksi, mengimpor konten bundled awal."
  fi

  if [ -f db/seeds/tryout-bank.json ]; then
    echo "Mengimpor bank Try Out bundled secara aman..."
    run_app npm run import:tryouts
  else
    echo "db/seeds/tryout-bank.json tidak ada, skip import Try Out bundled."
  fi

  if [ -f db/seeds/question-bank.json ]; then
    echo "Mengimpor bank latihan bundled secara merge aman..."
    run_app npm run import:questions -- --merge
  else
    echo "db/seeds/question-bank.json tidak ada, skip import latihan bundled."
  fi

  if [ -f db/seeds/daily-missions.json ]; then
    echo "Mengimpor misi harian bundled..."
    run_app npm run import:missions
  else
    echo "db/seeds/daily-missions.json tidak ada, skip import misi harian bundled."
  fi
else
  echo "Database server sudah ada dan DEPLOY_IMPORTS!=1, skip import konten bundled."
  echo "Perubahan konten langsung di server dipertahankan."
fi

NGINX_SITE="/etc/nginx/sites-available/$APP_NAME"
PRESERVE_HARDENED_NGINX=0
if [ -f "$NGINX_SITE" ] && grep -q '^# ops/nginx-hardened.conf' "$NGINX_SITE"; then
  PRESERVE_HARDENED_NGINX=1
  echo "Konfigurasi nginx hardened aktif; deploy mempertahankannya."
fi

if [ "$PRESERVE_HARDENED_NGINX" != "1" ] && [ -f /etc/letsencrypt/live/mafiking.com/fullchain.pem ] && [ -f /etc/letsencrypt/live/mafiking.com/privkey.pem ]; then
  $SUDO tee "/etc/nginx/sites-available/$APP_NAME" >/dev/null <<EOF
server {
    listen 443 ssl;
    server_name mafiking.com www.mafiking.com;

    client_max_body_size 25m;

    ssl_certificate /etc/letsencrypt/live/mafiking.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mafiking.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # HSTS is edge-owned. Other security headers are emitted by the app.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

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
elif [ "$PRESERVE_HARDENED_NGINX" != "1" ]; then
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
ssh "$SSH_TARGET" "APP_PORT='$APP_PORT' APP_NAME='$APP_NAME' REMOTE_DIR='$REMOTE_DIR' APP_RUN_USER='$APP_RUN_USER' HEALTHCHECK_ATTEMPTS='${HEALTHCHECK_ATTEMPTS:-30}' HEALTHCHECK_INTERVAL='${HEALTHCHECK_INTERVAL:-2}' bash -s" <<'ENDSSH'
set -euo pipefail

cd "$REMOTE_DIR"

run_pm2() {
  if [ "$APP_RUN_USER" != "root" ] && id "$APP_RUN_USER" >/dev/null 2>&1; then
    sudo -u "$APP_RUN_USER" env HOME="$REMOTE_DIR" PM2_HOME="$REMOTE_DIR/.pm2" pm2 "$@"
  else
    pm2 "$@"
  fi
}

run_pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
run_pm2 delete mafiking >/dev/null 2>&1 || true
run_pm2 delete new-mafiking >/dev/null 2>&1 || true
run_pm2 start server.js --name "$APP_NAME" --time
run_pm2 save

if [ "$APP_RUN_USER" != "root" ]; then
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  pm2 delete mafiking >/dev/null 2>&1 || true
  pm2 delete new-mafiking >/dev/null 2>&1 || true
fi

if systemctl is-enabled "pm2-$APP_RUN_USER.service" >/dev/null 2>&1; then
  echo "PM2 startup service sudah aktif, skip setup startup."
else
  STARTUP_CMD="$(run_pm2 startup systemd -u "$APP_RUN_USER" --hp "$REMOTE_DIR" | tail -n 1 || true)"
  if echo "$STARTUP_CMD" | grep -q "sudo\\|env PATH"; then
    eval "$STARTUP_CMD" || true
  fi
fi

HEALTH_URL="http://127.0.0.1:$APP_PORT/api/health"
HEALTH_FILE="/tmp/$APP_NAME-health.json"
HEALTH_OK=0

echo "Menunggu aplikasi siap di $HEALTH_URL..."
for attempt in $(seq 1 "$HEALTHCHECK_ATTEMPTS"); do
  if curl --connect-timeout 2 --max-time 5 -fsS "$HEALTH_URL" >"$HEALTH_FILE" 2>/dev/null; then
    HEALTH_OK=1
    break
  fi

  if [ "$attempt" -lt "$HEALTHCHECK_ATTEMPTS" ]; then
    sleep "$HEALTHCHECK_INTERVAL"
  fi
done

if [ "$HEALTH_OK" != "1" ]; then
  echo "Aplikasi belum sehat setelah $HEALTHCHECK_ATTEMPTS percobaan."
  echo "Status PM2:"
  run_pm2 describe "$APP_NAME" || true
  echo "Log PM2 terakhir:"
  run_pm2 logs "$APP_NAME" --nostream --lines 120 || true
  exit 1
fi

cat "$HEALTH_FILE"
echo ""

if [ -f /etc/letsencrypt/live/mafiking.com/fullchain.pem ]; then
  HEADER_FILE="/tmp/$APP_NAME-security-headers.txt"
  curl -ksSI --resolve mafiking.com:443:127.0.0.1 https://mafiking.com/login >"$HEADER_FILE"

  require_public_header() {
    local pattern="$1"
    local label="$2"
    if ! grep -Eiq "$pattern" "$HEADER_FILE"; then
      echo "Header publik wajib tidak ditemukan: $label"
      cat "$HEADER_FILE"
      exit 1
    fi
  }

  require_public_header '^strict-transport-security:' 'Strict-Transport-Security'
  require_public_header '^permissions-policy:' 'Permissions-Policy'
  require_public_header '^cross-origin-opener-policy:' 'Cross-Origin-Opener-Policy'
  require_public_header '^x-content-type-options:[[:space:]]*nosniff' 'X-Content-Type-Options'
  require_public_header '^content-security-policy(-report-only)?:' 'Content-Security-Policy'
  echo "Kontrak header publik terverifikasi."
fi
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
if [ "$APP_RUN_USER" = "root" ]; then
  echo "  pm2 logs $APP_NAME"
  echo "  pm2 restart $APP_NAME"
else
  echo "  sudo -u $APP_RUN_USER PM2_HOME=$REMOTE_DIR/.pm2 pm2 logs $APP_NAME"
  echo "  sudo -u $APP_RUN_USER PM2_HOME=$REMOTE_DIR/.pm2 pm2 restart $APP_NAME"
fi
echo ""
echo "Jika ingin deploy ulang sambil overwrite database server:"
echo "  DEPLOY_DB=1 ./deploy.sh $SERVER_IP $SERVER_USER"
echo "Jika ingin sinkron konten bundled JSON ke database server:"
echo "  DEPLOY_IMPORTS=1 ./deploy.sh $SERVER_IP $SERVER_USER"
echo "Jika ingin memaksa install ulang dependency production:"
echo "  FORCE_NPM_CI=1 ./deploy.sh $SERVER_IP $SERVER_USER"
echo "========================================"
