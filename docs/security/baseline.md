# Mafiking security baseline

OWASP ASVS L2 baseline snapshot. Tracks what is currently enabled, what is
exempt, and how to operate the security-critical knobs. Updated by Phase 0 of
the hardening roadmap and refreshed at every review gate.

**Status:** Phase 0 — initial lock-in.
**Branch:** `security/p0-baseline`.
**Target posture:** OWASP ASVS Level 2.
**Last verified:** `npm run check` green (12 contract tests).

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
- Per-route rate-limit inventory — Phase 1.
- WAF (ModSecurity + OWASP CRS) — Phase 4.
- TLS 1.3 / HSTS at the edge — Phase 4.
- Cloud CIS benchmark for Nevacloud VPS — Phase 4.
- CI security workflow (SBOM, TruffleHog, semgrep, DAST) — Phases 3 and 4.
- Threat model DFD in OWASP Threat Dragon — Phase 4.
- Incident response runbook — Phase 4.
