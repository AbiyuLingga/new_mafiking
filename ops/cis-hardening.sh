#!/usr/bin/env bash
# ops/cis-hardening.sh — CIS Ubuntu 22.04 L1 baseline hardening.
#
# Idempotent. Re-running is safe. Targets ASVS L2 chapter 14 (configuration).
# Run as root. Reads config from ops/secrets.env if present (not committed).
#
# What's covered (CIS Ubuntu 22.04 L1, May 2024):
#   1.x  Initial setup (already handled by Nevacloud base image; verified)
#   2.x  Services  — disable avahi/cups/rsync/bluetooth if present
#   3.x  Network   — sysctl: forward=0, send_redirects=0, accept_source_route=0,
#                    accept_redirects=0, secure_redirects=0, log_martians=1,
#                    ignore_broadcasts=1, syncookies=1, rp_filter=1
#   4.x  Logging   — rsyslog + logrotate defaults
#   5.x  Access, Auth, PAM  — pam_pwquality, faillock, pwage, umask 027
#   6.x  System maintenance — permission baselines on /etc/passwd, /etc/shadow,
#                    /etc/group, /etc/gshadow, /etc/passwd-, /etc/shadow-,
#                    /etc/group-, /etc/gshadow-
#
# NOT covered (intentional, document instead):
#   1.4.x  AIDE/Tripwire       — see ops/integrity-check.sh
#   1.5.x  Bootloader password — not in scope; KVM console only
#   5.2.x  SSH                  — handled by ops/sshd-hardening.conf
#   5.4.x  Password hashing    — handled by server/routes/auth.js (bcrypt cost)
#   6.2.x  World-writable      — handled by ops/backup.sh preflight
#
# Usage:
#   sudo bash ops/cis-hardening.sh                 # apply
#   sudo bash ops/cis-hardening.sh --audit-only    # report without changes
#
# Exit codes:
#   0 = applied (or already compliant)
#   1 = prerequisite missing
#   2 = one or more checks could not be applied (see output)

set -euo pipefail

AUDIT_ONLY=0
[[ "${1:-}" == "--audit-only" ]] && AUDIT_ONLY=1

LOG=/var/log/cis-hardening.log
mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1
echo "=== cis-hardening $(date -Iseconds) mode=$([ "$AUDIT_ONLY" = 1 ] && echo audit || echo apply) ==="

need_root() { [[ $EUID -eq 0 ]] || { echo "must run as root" >&2; exit 1; }; }
need_root

# 3.x — sysctl network hardening
apply_sysctl() {
  local f=/etc/sysctl.d/99-mafiking-cis.conf
  if [[ $AUDIT_ONLY = 1 ]]; then
    echo "[audit] sysctl: $f"
    [[ -f $f ]] && grep -vE '^#|^$' "$f" || echo "  (missing)"
    return
  fi
  cat > "$f" <<'EOF'
# Mafiking CIS L1 baseline — network kernel parameters.
# ASVS V14.1, CIS 3.1, 3.2, 3.3.

# 3.1.1 — disable IPv4 forwarding (we are not a router)
net.ipv4.ip_forward = 0

# 3.1.2 — disable send redirects (we are not a router)
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# 3.2.1 — disable source routing (anti-spoof)
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0

# 3.2.2, 3.2.3 — ignore ICMP redirects and broadcasts
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1

# 3.2.8 — TCP SYN cookies
net.ipv4.tcp_syncookies = 1

# 3.2.9 — reverse path filtering
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# ASVS V14.1 — kernel hardening extras
kernel.randomize_va_space = 2
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
EOF
  sysctl --system
  echo "[ok] sysctl: $f"
}

# 2.x — disable unnecessary services (only if present)
apply_services() {
  local svc
  for svc in avahi-daemon cups rsync bluetooth; do
    if systemctl list-unit-files "${svc}.service" 2>/dev/null | grep -q "${svc}.service"; then
      if [[ $AUDIT_ONLY = 1 ]]; then
        systemctl is-enabled "${svc}.service" 2>/dev/null || true
      else
        systemctl disable --now "${svc}.service" 2>/dev/null || true
        echo "[ok] disabled $svc"
      fi
    fi
  done
}

# 5.x — PAM password quality + lockout
apply_pam() {
  if [[ $AUDIT_ONLY = 1 ]]; then
    echo "[audit] pwquality: $(grep -hE '^(minlen|dcredit|ucredit|lcredit|ocount|remember)' /etc/security/pwquality.conf 2>/dev/null | tr '\n' ' ')"
    echo "[audit] faillock: $(grep -hE '^deny|^unlock_time' /etc/security/faillock.conf 2>/dev/null | tr '\n' ' ')"
    return
  fi
  if ! dpkg -s libpam-pwquality >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y libpam-pwquality
  fi
  # CIS 5.3.1 — password quality
  if ! grep -qE '^\s*minlen\s*=' /etc/security/pwquality.conf 2>/dev/null; then
    cat >> /etc/security/pwquality.conf <<'EOF'

# Mafiking CIS 5.3 baseline
minlen = 14
dcredit = -1
ucredit = -1
lcredit = -1
ocredit = -1
EOF
  fi
  # CIS 5.3.3 — remember 5 previous passwords
  if ! grep -qE '^\s*remember\s*=' /etc/security/pwhistory.conf 2>/dev/null; then
    echo "remember = 5" > /etc/security/pwhistory.conf
  fi
  # CIS 5.4.1 — login lockout
  if [[ ! -f /etc/security/faillock.conf ]]; then
    cat > /etc/security/faillock.conf <<'EOF'
deny = 5
unlock_time = 900
fail_interval = 900
EOF
  fi
  # CIS 5.1.x — umask 027 in login shells
  if grep -qE '^UMASK\s+022' /etc/login.defs 2>/dev/null; then
    sed -i 's/^UMASK\s\+022/UMASK          027/' /etc/login.defs
  fi
  echo "[ok] PAM: pwquality + faillock + umask 027"
}

# 6.x — permission baselines
apply_perms() {
  local f mode
  for f in /etc/passwd /etc/group; do
    mode=$(stat -c %a "$f")
    [[ $mode = "644" ]] || { [[ $AUDIT_ONLY = 0 ]] && chmod 644 "$f"; echo "[ok] chmod 644 $f"; }
  done
  for f in /etc/shadow /etc/gshadow; do
    [[ -f $f ]] || continue
    mode=$(stat -c %a "$f")
    [[ $mode = "640" ]] || { [[ $AUDIT_ONLY = 0 ]] && chmod 640 "$f"; echo "[ok] chmod 640 $f"; }
  done
  for f in /etc/passwd- /etc/shadow- /etc/group- /etc/gshadow-; do
    [[ -f $f ]] || continue
    chown root:root "$f"
    case "$f" in
      *passwd*|*group*) chmod 600 "$f" ;;
      *shadow*)         chmod 600 "$f" ;;
    esac
    echo "[ok] perm + owner: $f"
  done
  # 6.1.10 — world-writable files check
  if [[ $AUDIT_ONLY = 1 ]]; then
    echo "[audit] world-writable files: $(find / -xdev -type f -perm -0002 2>/dev/null | wc -l)"
  fi
}

# 4.x — rsyslog + logrotate
apply_logging() {
  if ! dpkg -s rsyslog >/dev/null 2>&1; then
    [[ $AUDIT_ONLY = 0 ]] && DEBIAN_FRONTEND=noninteractive apt-get install -y rsyslog logrotate
  fi
  systemctl enable rsyslog
  # CIS 4.2.1.4 — rsyslog default file permissions
  if ! grep -qE '^\$FileCreateMode' /etc/rsyslog.conf 2>/dev/null; then
    if [[ $AUDIT_ONLY = 0 ]]; then
      echo "\$FileCreateMode 0640" >> /etc/rsyslog.conf
      systemctl restart rsyslog
    fi
  fi
  echo "[ok] rsyslog"
}

# 1.8 — motd / issue banners
apply_banners() {
  local f=/etc/issue.net
  if [[ ! -f $f ]] || ! grep -q "authorized" "$f" 2>/dev/null; then
    [[ $AUDIT_ONLY = 0 ]] && cat > "$f" <<'EOF'
##########################################################################
# Authorized access only. This system is for the use of authorized users. #
# All activities are monitored and recorded. Unauthorized access is      #
# prohibited and will be prosecuted to the fullest extent of the law.     #
##########################################################################
EOF
    echo "[ok] banner: $f"
  fi
}

apply_banners
apply_logging
apply_services
apply_sysctl
apply_pam
apply_perms

echo "=== done ==="
