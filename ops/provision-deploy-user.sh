#!/usr/bin/env bash
# ops/provision-deploy-user.sh — create the non-root deploy user.
#
# ASVS V14.1 — principle of least privilege. App + deploy never run as root.
# The app user 'mafiking' is created by ops/provision-app-user.sh; this script
# creates a separate 'mafiking-deploy' human user with NOPASSWD sudo for
# operational access.
#
# Pre-reqs:
#   - Run as root.
#   - Caller has already placed a pubkey at /root/.ssh/mafiking-deploy.pub,
#     or stdin provides one.
#
# Usage:
#   sudo bash ops/provision-deploy-user.sh [path-to-pubkey]
#
# After this:
#   1. Verify you can SSH as:  ssh mafiking-deploy@mafiking.com
#   2. Then apply ops/sshd-hardening.conf (disables root + password).

set -euo pipefail

USER=mafiking-deploy
PUBKEY_SRC="${1:-/root/.ssh/${USER}.pub}"

if id -u "$USER" >/dev/null 2>&1; then
  echo "[skip] user $USER already exists (uid=$(id -u "$USER"))"
  exit 0
fi

# Create user with bash, no password (key only).
useradd -m -s /bin/bash -G ssh-users,sudo "$USER"
passwd -l "$USER"  # disable password login

# SSH key.
mkdir -p /home/"$USER"/.ssh
chmod 700 /home/"$USER"/.ssh
if [[ ! -f "$PUBKEY_SRC" ]]; then
  echo "ERROR: pubkey not found at $PUBKEY_SRC" >&2
  echo "  Create one first:  ssh-keygen -t ed25519 -f /root/.ssh/${USER}.pub" >&2
  exit 1
fi
cp "$PUBKEY_SRC" /home/"$USER"/.ssh/authorized_keys
chmod 600 /home/"$USER"/.ssh/authorized_keys
chown -R "$USER":"$USER" /home/"$USER"/.ssh

# NOPASSWD sudo for ops.
cat > /etc/sudoers.d/"$USER" <<'EOF'
mafiking-deploy ALL=(ALL) NOPASSWD:ALL
EOF
chmod 440 /etc/sudoers.d/"$USER"
visudo -c -f /etc/sudoers.d/"$USER" >/dev/null

# Login banner copy.
cp /etc/issue.net /home/"$USER"/.issue 2>/dev/null || true
chown "$USER":"$USER" /home/"$USER"/.issue 2>/dev/null || true

echo "[ok] created $USER (uid=$(id -u "$USER")) with NOPASSWD sudo + ssh key"
echo "  test: ssh $USER@$(hostname -f)"
