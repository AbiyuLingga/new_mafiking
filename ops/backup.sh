#!/usr/bin/env bash
# ops/backup.sh — daily offsite backup to Backblaze B2.
#
# ASVS V14.2.4 — recover from data loss. Backups are: encrypted at rest
# (rclone crypt), versioned, retained 30 days, integrity-checked weekly.
# NEVER touches the live SQLite database directly — uses sqlite3 .backup
# for a consistent snapshot.
#
# Pre-reqs:
#   - rclone installed (apt: rclone)
#   - rclone remote 'b2:' configured at /root/.config/rclone/rclone.conf
#     with: type = b2, account = <key>, key = <key>
#   - rclone crypt remote 'b2crypt:' layered over b2:mafiking-backups
#
# Install:
#   1. cp ops/backup.sh /opt/mafiking-ops/backup.sh
#   2. chmod 700 /opt/mafiking-ops/backup.sh
#   3. Add to /etc/cron.d/mafiking-backup (see ops/cron/mafiking-backup):
#        0 3 * * *  root  /opt/mafiking-ops/backup.sh
#   4. Add logrotate at /etc/logrotate.d/mafiking-backup
#
# Environment:
#   B2_REMOTE       b2:mafiking-backups    (raw)
#   B2_CRYPT_REMOTE b2crypt:               (encrypted)
#   BACKUP_SRC      /opt/mafiking
#   BACKUP_DST      /var/backups/mafiking
#   KEEP_LOCAL_DAYS 7
#   KEEP_B2_DAYS    30

set -euo pipefail
shopt -s nullglob

# -- Config --
APP=/opt/mafiking
BACKUP_DST=/var/backups/mafiking
LOG=/var/log/mafiking-backup.log
B2_REMOTE="${B2_REMOTE:-b2:mafiking-backups}"
B2_CRYPT_REMOTE="${B2_CRYPT_REMOTE:-b2crypt:}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-7}"
KEEP_B2_DAYS="${KEEP_B2_DAYS:-30}"

mkdir -p "$BACKUP_DST" "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1
echo "=== backup $(date -Iseconds) ==="

# -- Pre-flight --
command -v sqlite3 >/dev/null || { echo "FATAL: sqlite3 not installed"; exit 1; }
command -v rclone  >/dev/null || { echo "FATAL: rclone not installed";  exit 1; }
[[ -d "$APP" ]] || { echo "FATAL: $APP not found"; exit 1; }
[[ -r /root/.config/rclone/rclone.conf ]] || { echo "FATAL: rclone.conf missing"; exit 1; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d -p "$BACKUP_DST" "snap-$stamp-XXXX")
trap 'rm -rf "$work"' EXIT

# 1) Consistent SQLite snapshot (this is the critical part — without it
#    we can copy a half-written DB file).
db="$APP/data/mafiking.sqlite"
if [[ -f "$db" ]]; then
  mkdir -p "$work/data"
  sqlite3 "$db" ".timeout 5000" ".backup '$work/data/mafiking.sqlite'"
  echo "[ok] sqlite3 .backup -> $work/data/mafiking.sqlite ($(stat -c %s "$work/data/mafiking.sqlite") bytes)"
fi

# 2) Code snapshot (no node_modules, no logs, no .env).
mkdir -p "$work/app"
rsync -aHAX --numeric-ids \
      --exclude='node_modules' \
      --exclude='.pm2' \
      --exclude='.git' \
      --exclude='logs/*.log' \
      --exclude='.env' \
      "$APP/" "$work/app/"

# 3) Configuration snapshots (ops/ + nginx + sshd).
mkdir -p "$work/config"
cp -a /etc/nginx/sites-available/new_mafiking "$work/config/" 2>/dev/null || true
cp -a /etc/modsecurity/modsecurity.conf        "$work/config/" 2>/dev/null || true
cp -a /etc/modsecurity/crs/mafiking-exclusions.conf "$work/config/" 2>/dev/null || true
cp -a /etc/ssh/sshd_config.d/                  "$work/config/" 2>/dev/null || true
cp -a /etc/ufw/                                "$work/config/ufw" 2>/dev/null || true

# 4) Tar + zstd.
archive="$BACKUP_DST/${stamp}.tar.zst"
tar -C "$work" -cf - --zstd . > "$archive"
size=$(stat -c %s "$archive")
echo "[ok] archive: $archive ($((size/1024/1024)) MiB)"

# 5) Integrity check.
if tar -tzf <(zstd -d "$archive" -c 2>/dev/null) >/dev/null 2>&1; then
  echo "[ok] integrity check passed"
else
  echo "[FATAL] integrity check FAILED — aborting upload" >&2
  exit 1
fi

# 6) Upload to B2 (encrypted remote).
rclone copy "$archive" "$B2_CRYPT_REMOTE" \
  --log-level INFO --log-file "$LOG" --stats 30s
echo "[ok] uploaded to $B2_CRYPT_REMOTE"

# 7) Retention — local.
find "$BACKUP_DST" -name '*.tar.zst' -mtime +"$KEEP_LOCAL_DAYS" -delete -print | sed 's/^/[prune-local] /'

# 8) Retention — B2 (use rclone's --min-age to avoid race).
rclone delete "$B2_CRYPT_REMOTE" --min-age "${KEEP_B2_DAYS}d" --log-level INFO --log-file "$LOG" || true

# 9) Symlink "latest" for ops convenience.
ln -sfn "$archive" "$BACKUP_DST/latest.tar.zst"

echo "=== done $(date -Iseconds) ==="
