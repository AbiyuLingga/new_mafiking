# ops/modsecurity/install.sh — install ModSecurity + OWASP CRS for nginx.
#
# ModSecurity 2.9.x is in Ubuntu 22.04 universe as `libnginx-mod-http-modsecurity`.
# OWASP CRS 3.3.x is fetched as a tagged release from the GitHub mirror.
#
# Install order:
#   1. apt install libnginx-mod-http-modsecurity modsecurity
#   2. download OWASP CRS 3.3.2
#   3. drop in /etc/modsecurity/{modsecurity.conf,crs/crs-setup.conf}
#   4. enable modsecurity in /etc/nginx/nginx.conf via:
#        load_module modules/ngx_http_modsecurity_module.so;
#      and add `modsecurity on;` to the server block (already in nginx-hardened.conf)
#   5. nginx -t && systemctl reload nginx
#   6. review /var/log/modsecurity/audit.log daily for 7 days before
#      flipping SecRuleEngine from DetectionOnly to On.
#
# Idempotent.

set -euo pipefail

CRS_VERSION="${CRS_VERSION:-3.3.2}"
CRS_TARBALL="coreruleset-${CRS_VERSION}-lts.tar.gz"
CRS_URL="https://github.com/coreruleset/coreruleset/archive/refs/tags/v${CRS_VERSION}-lts.tar.gz"

if [[ $EUID -ne 0 ]]; then
  echo "must run as root" >&2
  exit 1
fi

echo "[1/6] apt install"
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  libnginx-mod-http-modsecurity modsecurity modsecurity-crs

# 2.6 — fetch CRS.
if [[ ! -d /etc/modsecurity/crs ]]; then
  echo "[2/6] download OWASP CRS ${CRS_VERSION}"
  tmp=$(mktemp -d)
  curl -fsSL "$CRS_URL" -o "$tmp/$CRS_TARBALL"
  tar -xzf "$tmp/$CRS_TARBALL" -C "$tmp"
  mv "$tmp"/coreruleset-"${CRS_VERSION}-lts" /opt/owasp-crs-"${CRS_VERSION}"
  ln -sfn /opt/owasp-crs-"${CRS_VERSION}" /opt/owasp-crs
  rm -rf "$tmp"
fi

# 3 — copy our custom configs.
echo "[3/6] install modsecurity.conf + crs-setup.conf"
install -m 644 ops/modsecurity/modsecurity.conf /etc/modsecurity/modsecurity.conf
install -m 644 ops/modsecurity/crs-setup.conf    /etc/modsecurity/crs/crs-setup.conf
install -m 644 ops/modsecurity/mafiking-exclusions.conf /etc/modsecurity/crs/mafiking-exclusions.conf
ln -sfn /opt/owasp-crs/rules /etc/modsecurity/crs/rules
ln -sfn /opt/owasp-crs/plugins /etc/modsecurity/crs/plugins 2>/dev/null || true

# 4 — load nginx module.
if ! grep -q "ngx_http_modsecurity_module" /etc/nginx/nginx.conf 2>/dev/null; then
  sed -i '1i load_module modules/ngx_http_modsecurity_module.so;' /etc/nginx/nginx.conf
  echo "[4/6] modsecurity module loaded in nginx.conf"
fi

# 5 — test.
echo "[5/6] nginx -t"
nginx -t

# 6 — log directory.
mkdir -p /var/log/modsecurity
chown www-data:adm /var/log/modsecurity
chmod 750 /var/log/modsecurity
echo "[6/6] done. Review /var/log/modsecurity/audit.log for 7 days, then"
echo "       edit /etc/modsecurity/modsecurity.conf: SecRuleEngine On"
