#!/usr/bin/env bash
# ops/provision-app-user.sh — create the 'mafiking' service user.
#
# ASVS V14.1 — services must not run as root. The 'mafiking' user owns
# /opt/mafiking and runs node there. No login shell, no home directory
# writing rights, no sudo.
#
# Pre-reqs: run as root.
#
# Idempotent: re-running is safe.

set -euo pipefail

USER=mafiking
APP=/opt/mafiking

if id -u "$USER" >/dev/null 2>&1; then
  echo "[skip] user $USER already exists (uid=$(id -u "$USER"))"
else
  # -r = system user, no home, no login shell, no group.
  useradd -r -s /usr/sbin/nologin -d "$APP" -M "$USER"
  echo "[ok] created system user $USER (uid=$(id -u "$USER"))"
fi

# Ensure /opt/mafiking exists and is owned.
mkdir -p "$APP"/{logs,data,tmp}
chown -R "$USER":"$USER" "$APP"
chmod 750 "$APP"
chmod 700 "$APP"/data
chmod 750 "$APP"/logs

# Allow PM2 to manage this user. PM2 will be re-installed in the mafiking
# user's home — see ops/pm2-start.sh.
echo "[ok] $APP owned by $USER:$USER (mode 750; data 700; logs 750)"
