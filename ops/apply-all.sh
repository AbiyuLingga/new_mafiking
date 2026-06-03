#!/usr/bin/env bash
# ops/apply-all.sh — orchestrate the full Phase 4 hardening in the right order.
#
# This is the "do everything" entry point. It expects:
#   - root SSH access to the target VPS
#   - ops/ directory shipped to /opt/mafiking-ops/ on the target
#   - rclone B2 config at /root/.config/rclone/rclone.conf
#   - 9router maintenance process is left alone
#
# Each step is idempotent. Re-run is safe. Stops on first failure
# unless --skip-failed is given.
#
# Usage:
#   ssh root@mafiking.com 'bash /opt/mafiking-ops/apply-all.sh'           # apply
#   ssh root@mafiking.com 'bash /opt/mafiking-ops/apply-all.sh --audit'   # report only
#
# After completion, see docs/security/posture.md for the verification checklist.

set -euo pipefail

AUDIT_ONLY=0
[[ "${1:-}" == "--audit" ]] && AUDIT_ONLY=1

step() { echo; echo "================ $1 ================"; }
run()  { local f=$1; [[ -x "$f" ]] || { echo "MISSING: $f"; return 1; }; "$f" || return 1; }

step "0/9  apt update + security upgrade"
if [[ $AUDIT_ONLY = 0 ]]; then
  DEBIAN_FRONTEND=noninteractive apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" dist-upgrade
fi

step "1/9  install base packages"
if [[ $AUDIT_ONLY = 0 ]]; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    fail2ban ufw auditd audispd-plesz rclone sqlite3 zstd libpam-pwquality logrotate rsync
fi

step "2/9  create ssh-users group + deploy user"
if [[ $AUDIT_ONLY = 0 ]]; then
  getent group ssh-users >/dev/null || groupadd ssh-users
  if ! id mafiking-deploy >/dev/null 2>&1; then
    echo "WARN: mafiking-deploy not created. Run ops/provision-deploy-user.sh manually"
    echo "      after placing the pubkey at /root/.ssh/mafiking-deploy.pub"
  fi
fi

step "3/9  create app user (mafiking)"
run bash ops/provision-app-user.sh

step "4/9  migrate app /root/new_mafiking -> /opt/mafiking"
run bash ops/migrate-app-path.sh

step "5/9  install PM2 systemd unit + start app"
if [[ $AUDIT_ONLY = 0 ]]; then
  cp ops/systemd-pm2.service /etc/systemd/system/pm2-mafiking.service
  systemctl disable pm2-root 2>/dev/null || true
  systemctl stop pm2-root 2>/dev/null || true
  systemctl daemon-reload
  systemctl enable --now pm2-mafiking.service || true
  bash ops/pm2-start.sh
fi

step "6/9  SSH hardening drop-in"
if [[ $AUDIT_ONLY = 0 ]]; then
  cp ops/sshd-hardening.conf /etc/ssh/sshd_config.d/99-mafiking.conf
  chmod 600 /etc/ssh/sshd_config.d/99-mafiking.conf
  echo "  -> verify you can ssh mafiking-deploy@host BEFORE reloading sshd"
  echo "  -> once verified, run:  systemctl reload ssh"
fi

step "7/9  fail2ban + auditd + ufw"
if [[ $AUDIT_ONLY = 0 ]]; then
  cp ops/fail2ban/mafiking.local /etc/fail2ban/jail.d/
  cp ops/fail2ban/filter-mafiking-auth.conf   /etc/fail2ban/filter.d/
  cp ops/fail2ban/filter-nginx-http-flood.conf /etc/fail2ban/filter.d/
  systemctl enable --now fail2ban

  cp ops/auditd-rules.conf /etc/audit/rules.d/99-mafiking.rules
  augenrules --load || true
  systemctl enable --now auditd

  # UFW baseline.
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw deny 3000/tcp
  ufw --force enable
  ufw status verbose
fi

step "8/9  nginx hardening + ModSecurity"
if [[ $AUDIT_ONLY = 0 ]]; then
  # TLS 1.2+ only.
  cat > /etc/nginx/conf.d/ssl-params.conf <<'EOF'
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;
EOF

  bash ops/modsecurity/install.sh
  cp ops/nginx-hardened.conf /etc/nginx/sites-available/new_mafiking
  cp ops/proxy_params_hardened.conf /etc/nginx/proxy_params_hardened.conf
  nginx -t && systemctl reload nginx
fi

step "9/9  backups + crons + logrotate"
if [[ $AUDIT_ONLY = 0 ]]; then
  mkdir -p /opt/mafiking-ops
  cp ops/backup.sh /opt/mafiking-ops/backup.sh
  chmod 700 /opt/mafiking-ops/backup.sh
  cp ops/cron/mafiking-backup       /etc/cron.d/mafiking-backup
  cp ops/cron/mafiking-audit-analyze /etc/cron.d/mafiking-audit-analyze
  cp ops/logrotate.d/mafiking        /etc/logrotate.d/mafiking
  chmod 644 /etc/cron.d/mafiking-*  /etc/logrotate.d/mafiking

  echo
  echo "VERIFY: ssh mafiking-deploy@mafiking.com"
  echo "VERIFY: curl -I https://mafiking.com (HSTS preload header present)"
  echo "VERIFY: tail /var/log/modsecurity/audit.log"
  echo "VERIFY: fail2ban-client status"
fi

step "CIS baseline"
run bash ops/cis-hardening.sh --audit-only

echo
echo "================ ALL DONE ================"
echo "Next:"
echo "  1. Verify SSH as mafiking-deploy"
echo "  2. Verify HTTPS + HSTS at https://mafiking.com"
echo "  3. After 7 days of ModSecurity logs: flip SecRuleEngine to On"
echo "  4. Fill in docs/security/posture.md"
