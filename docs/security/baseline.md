# Mafiking security baseline

OWASP ASVS L2 baseline snapshot. Tracks what is currently enabled, what is
exempt, and how to operate the security-critical knobs. Initial lock-in was
Phase 0; the document is now the consolidated record of Phases 0–4 (app
hardening + Nevacloud VPS hardening).

**Status:** Phase 4 — applied to production VPS at `202.155.94.210` (mafiking.com).
**Branch:** `main` (merged from `security/p4-vps-hardening`, commit `7b90be2`).
**Target posture:** OWASP ASVS Level 2.
**Last verified:** 2026-06-03 — `npm run check` green (22 contract tests + 8
scanners); VPS Phase 4 applied via `ops/apply-all.sh`; see
`docs/security/phase4-summary-2026-06-03.txt` for the full VPS post-state.

## Runtime identity

- Server: Express, binds `0.0.0.0:PORT` (default 3000).
- Static app: `MAFIKING.html` + React UMD + Babel runtime + `src/*.jsx` (per
  AGENTS.md rule 4 — do not migrate the load model without an explicit ask).
- Auth: Clerk Bearer (verified with `@clerk/express`) plus a server-side
  `express-session` for first-time/guest users. Guest users are created on
  demand for any `/api/*` request that lacks a session, except the public
  endpoints listed below.
- Webhooks: Clerk (svix) and Duitku (MD5 callback signature). Both have raw
  body parsers in front of signature verification.

## Public endpoints (do not require auth, do not require CSRF)

- `GET  /api/health`
- `GET  /api/config/clerk` — returns only the publishable key.
- `POST /api/webhooks/clerk` — svix signature verified.
- `POST /api/payment/callback` — Duitku MD5 signature verified.
- `POST /api/csp-report` and `/api/csp-report/` — accepts
  `application/csp-report`, `application/reports+json`, `application/json`,
  32 KB cap, 204 response.
- `POST /api/performance/vitals` — behind `performanceLimiter`.

## Cookies

| Cookie | Dev | Production | Notes |
|---|---|---|---|
| Session | `mafiking.sid` | `__Host-mafiking.sid` | `httpOnly: true`, `sameSite: 'strict'`, `secure: 'auto'`, `maxAge: 7d`, stored in custom SQLite store (`lib/sqlite-session-store.js`). |
| CSRF | `mafiking.csrf-token` | `__Host-mafiking.csrf-token` | `httpOnly: true`, `sameSite: 'strict'`, `secure: true` (prod), `path: '/'`. Set by `csrf-csrf@4.0.3` double-submit. |

## CSRF (lib/csrf-protection.js, lib/csrf-secret.js)

- Library: `csrf-csrf@^4.0.3` (double-submit cookie + HMAC).
- Secret resolution order: `CSRF_SECRET` → `SESSION_SECRET` (hashed) →
  ephemeral dev secret with a `console.warn` notice. In production both
  `CSRF_SECRET` and `SESSION_SECRET` must be set; the loader throws on boot
  if either is missing or shorter than 32 characters.
- Token endpoint: `GET /api/csrf-token` returns `{ csrfToken }`. The frontend
  helper `src/backend-api.jsx` fetches this once and attaches
  `X-CSRF-Token` on every state-changing request.
- Exempt paths (no CSRF check): `/api/payment/callback`, `/api/webhooks/clerk`,
  `/api/csp-report`, `/api/csp-report/`, `/api/performance/vitals`.
- Defense in depth: `lib/request-guard.js` enforces Origin / Referer /
  `Sec-Fetch-Site: same-origin` on state-changing requests, with the same
  exempt path list.

## Content Security Policy (lib/csp.js, server.js:323)

- Mode: **report-only by default**. Set `CSP_ENFORCE=1` to flip to enforcing
  (or `CSP_REPORT_ONLY=0`). The 7-day report-only observation window is
  enforced by code review; do not flip without product + admin sign-off.
- `frame-ancestors 'none'` (clickjacking) and `object-src 'none'` (legacy
  plugin abuse) are always enforced, even in report-only.
- Allowlist: no broad `https:` token. Third-party origins are listed
  explicitly:
  - `script-src 'self' 'unsafe-inline' cdn.jsdelivr.net unpkg.com
    cdn.tailwindcss.com + ClerkFrontendApi`
  - `style-src 'self' 'unsafe-inline' fonts.googleapis.com cdn.jsdelivr.net
    cdn.tailwindcss.com`
  - `img-src 'self' data: images.unsplash.com + ClerkFrontendApi`
  - `font-src 'self' fonts.gstatic.com cdn.jsdelivr.net`
  - `connect-src 'self' unpkg.com cdn.jsdelivr.net + ClerkFrontendApi`
  - `frame-src 'self' + ClerkFrontendApi`
  - `worker-src 'self' blob:`
  - `base-uri 'self'`, `form-action 'self'`
- `'unsafe-inline'` is intentional for now (Tailwind CDN runtime styles and
  Babel inline `<script type="text/babel">`). A nonce migration is tracked
  as a follow-up; it requires changing the static-Babel load model.
- Report endpoint: `reportingEndpoints: { csp: '/api/csp-report' }` and a
  matching `report-uri` / `report-to` directive. Reports are written to
  `logs/csp-reports.log` as NDJSON.

## Audit log (lib/audit-log.js)

- NDJSON writer to `logs/audit.log` (and `logs/csp-reports.log`).
- Best-effort: never throws to the caller. A failure to write a log line
  must not compound the original error.
- Line budget: 16 KB per line, ellipsized if longer.
- **Known ASVS L2 gap:** the log is not tamper-evident (no HMAC chain). Tracked
  in `docs/security/posture.md` as a "post-L2" hardening item.

## Rate limiting

- `express-rate-limit` mounted on auth and correction endpoints.
- `performanceLimiter` mounted on `/api/performance/vitals`.
- Per-route limits live in `routes/auth.js` and `routes/correction.js`. A
  full per-route rate-limit table is produced in Phase 1 (`api-inventory.md`).

## Webhooks

- Clerk: raw body (`express.raw({ type: '*/*' })`), svix headers verified with
  `CLERK_WEBHOOK_SIGNING_SECRET`. Missing secret returns 400.
- Duitku: MD5 signature verified against `merchantCode + amount + merchantOrderId + API_KEY`.
  Failure returns 401.

## Helmet defaults

`app.use(helmet({ contentSecurityPolicy, crossOriginEmbedderPolicy: false,
reportingEndpoints }))`. COEP disabled because the static-Babel app does not
isolate origins; COOP and the rest of Helmet's defaults are active.

## Test coverage (npm run check)

12 contract tests wired into `npm run check`:

1. `node --check` for every entry file and route handler (catches syntax).
2. `test:admin-import` — admin import flow.
3. `test:recommendations` — recommendation engine.
4. `test:profile-summary` — profile summary window.
5. `test:ai-profile` — AI profile provider.
6. `test:auth-registered-user` — registered-user auth.
7. `test:admin-local-mode` — local admin mode.
8. `test:payment-contract` — payment router contract.
9. `test:performance-contract` — performance contract.
10. `test:request-guard` — Origin / Sec-Fetch-Site guard.
11. `test:tryout-ranking` — tryout ranking.
12. `test:tryout-session` — tryout session.
13. `test:csp-report` — CSP report endpoint + report-only header.
14. `test:csrf-protection` — double-submit CSRF.
15. `test:session-store` — SQLite session store.

Baseline run: all green. Any new file referenced by `npm run check` must
appear in both the syntax-check list and the test runner.

## How to operate the security knobs

- **Flip CSP to enforcing**: set `CSP_ENFORCE=1` (or unset `CSP_REPORT_ONLY`)
  in the env. The header switches from
  `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. A clean
  7-day report window in `logs/csp-reports.log` is a prerequisite.
- **Rotate CSRF secret**: replace `CSRF_SECRET` (or `SESSION_SECRET` if used
  as fallback) in `.env`. All existing double-submit tokens invalidate;
  users are silently reissued tokens on next page load.
- **Rotate session secret**: same as CSRF. All sessions are invalidated.
- **Inspect CSP reports**: `tail -f logs/csp-reports.log | jq .`. Each line is
  NDJSON with the original browser report and a `ts` field.
- **Inspect audit log**: `tail -f logs/audit.log | jq .`.

## Out of scope for this baseline (tracked elsewhere)

- Tamper-evident audit log (HMAC chain) — tracked in `posture.md`.
- ModSecurity v3 nginx connector (jammy has no package; CRS 3.3.2 staged
  under `/opt/owasp-crs-3.3.2`, `libmodsecurity3` installed, directives
  commented in `ops/nginx-hardened.conf`). See `ops/modsecurity/STATUS.md`
  for Path A (build on a beefier host) and Path B (Cloudflare in front).
- B2 rclone config — script `ops/backup.sh` skips upload until
  `/root/.config/rclone/rclone.conf` exists with a `type = b2` remote.
  See `docs/security/b2-backup-setup.md` for the one-time setup
  walkthrough (bucket, app key, rclone.conf template, end-to-end
  verification).
- sshd drop-in reload — `/etc/ssh/sshd_config.d/99-mafiking.conf` is
  installed but `systemctl reload ssh` is gated on
  `ops/provision-deploy-user.sh` provisioning `mafiking-deploy` with a
  real pubkey at `/root/.ssh/mafiking-deploy.pub`.

## Phase 4 — Edge / VPS hardening (applied 2026-06-03 to 202.155.94.210)

The application-layer controls above sit behind an edge and host baseline
applied with `ops/apply-all.sh`. Verified state as of 2026-06-03:

### Edge — nginx 1.18.0 (TLS, HSTS, headers, rate limits)

- `ssl_protocols TLSv1.2 TLSv1.3;` in `/etc/nginx/nginx.conf`; TLS 1.0/1.1
  rejected; `ssl_session_cache shared:SSL:10m;` + `ssl_session_timeout 1d;`
  + `ssl_session_tickets off;` set inline.
- `ops/nginx-hardened.conf` shipped to `/etc/nginx/sites-available/new_mafiking`:
  HSTS preload 2y via
  `add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;`,
  plus `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`,
  `Referrer-Policy strict-origin-when-cross-origin`, `Permissions-Policy`.
- Per-route `limit_req_zone`s: `mafiking_login` 15r/m, `mafiking_register`
  4r/m, `mafiking_correction` 20r/m, `mafiking_payment` 8r/m,
  `mafiking_perf` 120r/m.
- App behind reverse proxy on 127.0.0.1:3000; node runs as the
  `mafiking` system user (`/usr/sbin/nologin`, no home write).

### Edge — ModSecurity (deferred)

- `libmodsecurity3` 3.0.6-1 installed.
- OWASP CRS 3.3.2 extracted to `/opt/owasp-crs-3.3.2` (symlink
  `/opt/owasp-crs`).
- jammy main has no `libnginx-mod-http-modsecurity` package; v3 nginx
  connector needs source build. ModSecurity directives in
  `ops/nginx-hardened.conf` are commented. See `ops/modsecurity/STATUS.md`.

### Edge — fail2ban 0.11.2

- 4 jails active: `sshd`, `nginx-botsearch`, `nginx-http-flood`,
  `mafiking-auth` (custom filter on `/api/auth/*` 401/403).

### Host — auditd

- 29 rules loaded via `augenrules --load` in `/etc/audit/rules.d/99-mafiking.rules`:
  identity, sshd, mafiking-config, nginx-config, modsecurity-config,
  setuid/setgid/execve(uid=0), network-bind, network-connect, cron,
  auth-log, syslog, mafiking-logs, mafiking-backup, time-change, modules.
  Excludes 9router maintenance tunnel noise.

### Host — CIS Ubuntu 22.04 L1

- `/etc/sysctl.d/99-mafiking-cis.conf`: forward=0, send_redirects=0,
  source_route=0, redirects=0, syncookies=1, rp_filter=1, log_martians=1,
  ignore_broadcasts=1, ASVS extras: randomize_va_space=2, kptr_restrict=2,
  dmesg_restrict=1, protected_hardlinks=1, protected_symlinks=1.
- PAM: `pwquality` minlen=14 + 1 of each class, `faillock` deny=5
  unlock_time=900, `UMASK 027` in `/etc/login.defs`.
- Permission baselines: `/etc/{passwd,shadow,group,gshadow}` and their
  backups.
- Banner at `/etc/issue.net` (authorized-use).

### Operations — backups, logrotate, cron

- `/opt/mafiking-ops/backup.sh` (mode 700): daily sqlite3 `.backup` +
  tar/zstd to `/var/backups/mafiking/`, optional rclone crypt to B2.
- `/etc/cron.d/mafiking-backup` runs 03:00 UTC.
- `/etc/cron.d/mafiking-audit-analyze` runs 04:00 UTC,
  `node scripts/analyze-audit-log.js` as `mafiking`.
- `/etc/logrotate.d/mafiking`: 6mo rotation for app logs, 12mo for
  audit-summary, 4wk for ModSecurity.

### Snapshot

Pre-change artefacts preserved at `/root/mafiking-rollback/20260603T003239Z/`
on the VPS: `env.original` (mode 600), `nginx-original.conf`, `nginx.conf.original`,
`sshd_config.original`, `ufw.original`, `pm2-dump.pm2`, `pm2-jlist.json`. The
123-line post-hardening summary is at
`docs/security/phase4-summary-2026-06-03.txt` (also at
`/root/mafiking-phase4-summary.txt` on the VPS).

### CI security workflow (Phase 3)

- `.github/workflows/security.yml` (5 jobs: npm-audit, CycloneDX SBOM,
  semgrep, TruffleHog, contract tests); runs on push to `main` and
  `security/**`, every PR, and weekly Sunday 02:00 UTC.
- `.github/workflows/dast.yml` runs a weekly OWASP ZAP baseline scan.
- `.zap/rules.tsv` documents 90 tuned IGNORE rules (intentional overlap
  with CSP, helmet, csrf-csrf, `__Host-` cookies).
