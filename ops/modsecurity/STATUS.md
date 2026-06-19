# ModSecurity status — Mafiking

## Current state (2026-06-03)

- **libmodsecurity3** (ModSecurity v3 library) is installed.
- **OWASP CRS 3.3.2** is extracted to /opt/owasp-crs-3.3.2 with rules ready.
- **nginx connector (modsecurity-nginx)** is **NOT** in the Ubuntu 22.04 main repo.
  - Ubuntu 20.04 had `libnginx-mod-http-modsecurity` (ModSecurity v2).
  - Ubuntu 22.04 dropped the package; v2 is end-of-life.
  - ModSecurity v3 nginx connector is a separate build: `modsecurity-nginx`
    (https://github.com/owasp-modsecurity/ModSecurity-nginx).
- The hardened nginx config (`/etc/nginx/sites-available/new_mafiking`)
  has ModSecurity directives **commented out**; nginx has been reloaded
  without ModSecurity. Comments in the file point here.

## Why it is not installed

- Building `modsecurity-nginx` requires libmodsecurity3-dev (installed),
  nginx source matching the running version (1.18.0-6ubuntu14.12), gcc, and
  ~10 minutes of compilation.
- The Nevacloud VPS has 957 MB RAM; safe headroom for `node-gyp` is unclear
  on this size of box. We chose to skip the build here.
- The risk of breaking the live nginx is also non-trivial — a misconfigured
  load_module directive would refuse to reload, taking the site down.

## Path A — build on this VPS

```bash
apt install -y libmodsecurity3 libmodsecurity-dev git build-essential
cd /opt
git clone --depth 1 -b v1.0.3 https://github.com/owasp-modsecurity/ModSecurity-nginx
cd ModSecurity-nginx
git submodule init && git submodule update
# Need nginx source matching 1.18.0-6ubuntu14.12
apt source nginx  # downloads 1.18.0 source
./configure --with-compat --add-dynamic-module=.
make modules
# install .so
cp objs/ngx_http_modsecurity_module.so /usr/lib/nginx/modules/
# enable in /etc/nginx/nginx.conf: load_module modules/ngx_http_modsecurity_module.so;
# uncomment the modsecurity on; and modsecurity_rules_file lines in
# /etc/nginx/sites-available/new_mafiking
nginx -t && systemctl reload nginx
```

## Path B — Cloudflare in front

Place Cloudflare as a reverse proxy (orange-cloud). The free plan ships with
the Cloudflare Managed Ruleset, which is functionally equivalent to OWASP CRS
with auto-tuning, plus DDoS protection and a global CDN. Mafiking would still
listen on its current IP for direct (Cloudflare-bypassing) traffic, but the
default-dns path would be fronted.

Recommended: Path B, then Path A as defense-in-depth for non-CF paths.

## Existing Mafiking defenses (Layer 1 — independent of ModSecurity)

- **helmet** security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- **csrf-csrf** double-submit token on all 25 state-changing routes
- **express-rate-limit** per route (login 15/15min, register 5/15min,
  correction 20/60s, payment 8/60s, performance 120/60s)
- **fail2ban** 4 jails: sshd, nginx-botsearch, nginx-http-flood, mafiking-auth
- **nginx hardened config** with HSTS preload, TLS 1.2/1.3, OCSP, rate limits
- **auditd** 29 rules, syscall + file auditing
