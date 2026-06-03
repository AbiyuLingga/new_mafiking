#!/usr/bin/env bash
# ops/migrate-app-path.sh — move /root/new_mafiking -> /opt/mafiking.
#
# ASVS V14.1 — services must not run from a root-owned path. The
# application is moved to /opt/mafiking and chowned to the 'mafiking'
# service user. The active code is symlinked so future deployments
# only update the symlink.
#
# Pre-reqs: ops/provision-app-user.sh must have run.
# Pre-reqs: PM2 has been stopped (or this script stops it).
#
# Idempotent: re-running is safe. If /opt/mafiking is already in place
# and owned by mafiking, this is a no-op.

set -euo pipefail

SRC=/root/new_mafiking
DST=/opt/mafiking
USER=mafiking

if [[ ! -d "$SRC" ]]; then
  echo "[skip] source $SRC not found — already migrated?"
fi

# 1) Stop the running app cleanly.
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop new_mafiking 2>/dev/null || true
  pm2 delete new_mafiking 2>/dev/null || true
  pm2 save --force 2>/dev/null || true
fi

# 2) Move (rsync because we need a real migration, not just a symlink now).
if [[ -d "$SRC" ]] && [[ ! -L "$DST" ]]; then
  echo "[move] $SRC -> $DST"
  rsync -aHAX --numeric-ids --info=progress2 --delete \
        --exclude='.git/objects/pack' \
        --exclude='node_modules' \
        --exclude='logs/*.log' \
        --exclude='data/*.sqlite' \
        "$SRC/" "$DST/"
  echo "[move] complete"
elif [[ -L "$DST" ]]; then
  echo "[skip] $DST is a symlink (deployment-style install)"
else
  echo "[skip] $DST already exists (not a symlink)"
fi

# 3) Re-own.
chown -R "$USER":"$USER" "$DST"
chmod 750 "$DST"
[[ -d "$DST/data" ]] && chmod 700 "$DST/data" || true
[[ -d "$DST/logs" ]] && chmod 750 "$DST/logs" || true

# 4) Tighten .env permissions.
if [[ -f "$DST/.env" ]]; then
  chown "$USER":"$USER" "$DST/.env"
  chmod 600 "$DST/.env"
  echo "[ok] chmod 600 $DST/.env"
fi

# 5) PM2 will be re-installed under $USER — see ops/pm2-start.sh.
echo "[ok] migration complete: $DST"
