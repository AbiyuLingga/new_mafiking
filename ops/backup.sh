#!/usr/bin/env bash
# ops/backup.sh — daily offsite backup to Backblaze B2.
#
# ASVS V14.2.4 — recover from data loss. Backups are: encrypted at rest
# (rclone crypt), versioned, retained 30 days, integrity-checked weekly.
# NEVER touches the live SQLite database directly — uses sqlite3 .backup
# for a consistent snapshot.
#
# Local archives are always created. B2 upload is attempted only when rclone
# and its root configuration are available.
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
#   DB_PATH         /opt/mafiking/db/database.sqlite
#   BACKUP_DST      /var/backups/mafiking
#   KEEP_LOCAL_DAYS 7
#   KEEP_B2_DAYS    30

set -euo pipefail
shopt -s nullglob

# -- Config --
APP="${BACKUP_SRC:-/opt/mafiking}"
DB_PATH="${DB_PATH:-$APP/db/database.sqlite}"
BACKUP_DST="${BACKUP_DST:-/var/backups/mafiking}"
LOG="${BACKUP_LOG:-/var/log/mafiking-backup.log}"
B2_REMOTE="${B2_REMOTE:-b2:mafiking-backups}"
B2_CRYPT_REMOTE="${B2_CRYPT_REMOTE:-b2crypt:}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-7}"
KEEP_B2_DAYS="${KEEP_B2_DAYS:-30}"

mkdir -p "$BACKUP_DST" "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1
echo "=== backup $(date -Iseconds) ==="

# -- Pre-flight --
command -v sqlite3 >/dev/null || { echo "FATAL: sqlite3 not installed"; exit 1; }
command -v rsync >/dev/null || { echo "FATAL: rsync not installed"; exit 1; }
command -v zstd >/dev/null || { echo "FATAL: zstd not installed"; exit 1; }
[[ -d "$APP" ]] || { echo "FATAL: $APP not found"; exit 1; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d -p "$BACKUP_DST" "snap-$stamp-XXXX")
trap 'rm -rf "$work"' EXIT

# 1) Consistent SQLite snapshot (this is the critical part — without it
#    we can copy a half-written DB file).
if [[ -f "$DB_PATH" ]]; then
  mkdir -p "$work/app/db"
  sqlite3 "$DB_PATH" ".timeout 5000" ".backup '$work/app/db/database.sqlite'"
  echo "[ok] sqlite3 .backup -> $work/app/db/database.sqlite ($(stat -c %s "$work/app/db/database.sqlite") bytes)"
else
  echo "[warn] database tidak ditemukan di $DB_PATH"
fi

# 2) Application snapshot. Runtime profile-media is intentionally included and
#    paired with the consistent database snapshot above.
mkdir -p "$work/app"
rsync -aHAX --numeric-ids \
      --exclude='node_modules' \
      --exclude='.pm2' \
      --exclude='.git' \
      --exclude='logs/*.log' \
      --exclude='.env' \
      --exclude='db/*.sqlite' \
      --exclude='db/*.sqlite-shm' \
      --exclude='db/*.sqlite-wal' \
      --exclude='db/backups/' \
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
if tar --zstd -tf "$archive" >/dev/null 2>&1; then
  echo "[ok] integrity check passed"
else
  echo "[FATAL] integrity check FAILED — aborting upload" >&2
  exit 1
fi

# 6) Upload to B2 (encrypted remote) when configured.
if command -v rclone >/dev/null 2>&1 && [[ -r /root/.config/rclone/rclone.conf ]]; then
  rclone copy "$archive" "$B2_CRYPT_REMOTE" \
    --log-level INFO --log-file "$LOG" --stats 30s
  echo "[ok] uploaded to $B2_CRYPT_REMOTE"
else
  echo "[warn] rclone/B2 belum dikonfigurasi; arsip lokal tetap tersedia"
fi

# 7) Retention — local.
find "$BACKUP_DST" -name '*.tar.zst' -mtime +"$KEEP_LOCAL_DAYS" -delete -print | sed 's/^/[prune-local] /'

# 8) Retention — B2 (use rclone's --min-age to avoid race).
if command -v rclone >/dev/null 2>&1 && [[ -r /root/.config/rclone/rclone.conf ]]; then
  rclone delete "$B2_CRYPT_REMOTE" --min-age "${KEEP_B2_DAYS}d" --log-level INFO --log-file "$LOG" || true
fi

# 9) Symlink "latest" for ops convenience.
ln -sfn "$archive" "$BACKUP_DST/latest.tar.zst"

echo "=== done $(date -Iseconds) ==="
