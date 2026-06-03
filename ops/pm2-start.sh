#!/usr/bin/env bash
# ops/pm2-start.sh — start the new_mafiking app under the mafiking user.
#
# Replaces the root-owned PM2 process with a user-scoped one. PM2 keeps
# its dump file in $HOME/.pm2; the systemd unit 'pm2-${USER}' is created
# by ops/systemd-pm2.service.
#
# Pre-reqs: ops/migrate-app-path.sh, ops/provision-app-user.sh.
# Pre-reqs: ops/systemd-pm2.service installed and started.
#
# Idempotent.

set -euo pipefail

USER=mafiking
APP=/opt/mafiking
NAME=new_mafiking

# Hand off to the mafiking user.
sudo -u "$USER" -H bash -c "
  set -euo pipefail
  export PM2_HOME=/opt/mafiking/.pm2
  mkdir -p \"\$PM2_HOME\"
  cd $APP
  if [[ ! -d node_modules ]]; then
    echo '[install] npm ci --omit=dev'
    npm ci --omit=dev
  fi
  echo '[start] pm2 start server.js --name $NAME'
  pm2 delete $NAME 2>/dev/null || true
  pm2 start server.js --name $NAME --time
  pm2 save --force
  pm2 startup | grep -v 'sudo' > /tmp/pm2-startup.sh
  echo '[ok] pm2 running as $USER'
"

# Persist the startup line globally (one-time).
if [[ -f /tmp/pm2-startup.sh ]]; then
  bash /tmp/pm2-startup.sh 2>/dev/null || true
  rm -f /tmp/pm2-startup.sh
fi
