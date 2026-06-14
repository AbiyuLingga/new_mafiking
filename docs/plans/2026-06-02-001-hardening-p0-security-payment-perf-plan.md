---
title: "Hardening P0 — Security, Payment UX, Performance"
status: active
plan_depth: Standard
created: 2026-06-02
origin: User optimization plan — production hardening before scaling
---

# Hardening P0 — Security, Payment UX, Performance

## Problem Frame

Mafiking (new_mafiking) is functionally complete but carries production risks that block safe scaling. The user-supplied optimization plan flagged eight areas; this plan implements the three highest-leverage ones agreed in clarification:

1. **Security P0** — permissive CSP, no CSRF protection, default in-memory session store, hardcoded admin `123`/`135` credentials, cookie name not `__Host-`-prefixed.
2. **Payment UX** — `Pembayaran` page shows a working form even when the Duitku gateway is "sedang aktivasi", so users fill in data only to receive a 503. This breaks trust and wastes inputs.
3. **Performance** — `~584 KB` JS / `~160 KB` CSS in `dist/`, ~7 MB legacy `saas_demo_video.mp4` served from `/video/`, unused `card-*.png` originals (~3 MB total) still on disk, and the static-Babel architecture loads every route's JSX upfront.

Defer to follow-up plans (per user prioritization): trust/copy alignment, free-tryout result page, observability audit log, AI correction quota, observability dashboards.

### Key Constraints

- **No architecture migration.** Project `AGENTS.md` rules: `Do not introduce module imports inside static src/*.jsx files without changing the whole load architecture` and `Keep the frontend load model as globals loaded by MAFIKING.html unless the task explicitly asks for an architecture migration.` Code splitting will be implemented as **route-aware script loading** inside `MAFIKING.html` (per agreement), preserving the global model.
- **UI preserved.** All changes are surgical. No redesign of lobby, belajar, practice, payment, or admin UI beyond the explicitly required "Pembayaran sedang aktivasi" banner.
- **No new dependencies unless justified.** Project `AGENTS.md`: `Add new dependencies for simple static frontend behavior` is forbidden. For backend, prefer local helpers (e.g. custom session store on `better-sqlite3`) over new packages.
- **Keep Clerk compatibility.** Existing dual-auth (session + Clerk) flow in `middleware/clerk-auth.js` must continue to work.
- **Production env requirements.** `SESSION_SECRET`, `CSRF_SECRET`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD` must all be present in production. Server must throw on boot if any are missing in `NODE_ENV=production`.

### Provider Naming Note

The user-supplied plan referenced "Midtrans" but the codebase uses **Duitku** (`routes/payment.js`, `DUITKU_BASE_URL = 'https://api-sandbox.duitku.com/api'`). All user-facing copy and doc updates will say "payment provider" generically, with Duitku as the concrete instance.

---

## Evidence Reviewed

| Source | What it supports | Effect on plan | Authority |
|---|---|---|---|
| `cheatsheetseries.owasp.org/.../Content_Security_Policy_Cheat_Sheet.html` (cited in plan) | CSP nonces/hash are stronger than `'unsafe-inline'` broad allowlists | Tighten `scriptSrc`/`styleSrc` allowlist; keep `'unsafe-inline'` only because Tailwind CDN injects runtime styles and Babel transforms inline `<script type="text/babel">`; plan nonce migration in follow-up. | OWASP standard |
| `cheatsheetseries.owasp.org/.../Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html` (cited in plan) | SameSite is not a complete CSRF defense | Add synchronizer token CSRF + Origin/Sec-Fetch-Site defense-in-depth. Skip `csurf` (deprecated, has known bypasses). | OWASP standard |
| `cheatsheetseries.owasp.org/.../Session_Management_Cheat_Sheet.html` (cited in plan) | Cookies must be Secure + HttpOnly + SameSite; `__Host-` prefix locks path/domain | Production: rename cookie `__Host-mafiking_sid`, set `secure: true`, keep `httpOnly`, `sameSite: 'strict'`, `path: '/'`. Dev: keep `mafiking_sid` without prefix (HTTP-incompatible). | OWASP standard |
| `npmjs.com/package/csrf-csrf` (current state, `4.x` is the modern replacement for deprecated `csurf`) | `csrf-csrf` implements the OWASP-recommended double-submit cookie pattern with HMAC + session binding | Adopt `csrf-csrf` rather than write custom; ~80 weekly downloads is low but it has an active maintainer and is referenced in StackHawk's 2026 guide. | Official npm + engineering blog |
| `npmjs.com/package/better-sqlite3-session-store` | Provides a `better-sqlite3` session store for `express-session` | **Reject**: license is `GPL-3.0-only`, which is viral and conflicts with Mafiking's deployment context. | npm registry |
| `expressjs.com/en/advanced/best-practice-security.html` | Express security best-practices: `helmet`, no open redirects, validate input | Confirms the chosen approach (Helmet + input validation + CSRF). | Official Express docs |
| `web.dev/defining-core-web-vitals-thresholds/` (cited in plan) | LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 | Performance targets for the validation phase. | Google web.dev |
| `express-rate-limit` v8 docs (already in `package.json`) | Standard rate-limit middleware for Express 5 | Reuse for `/api/auth/login`, `/api/auth/register`, `/api/correction`, `/api/payment/create`, and the new CSRF failure counter. | npm |
| `katex.org/docs/issues/2369` (WHATWG HTML nonce issue) | Nonces can leak via CSS attribute selectors; Chrome already strips them | Note for follow-up nonce migration: use Chrome's `[[nonce]]` slot, not the content attribute, when serving scripts. | WHATWG |

### Evidence-Based Decisions

1. **CSRF: `csrf-csrf` library, not custom code.** Lower risk of subtle bypass vs. hand-rolled middleware; uses HMAC + session binding. Library is at v4 with active maintainer.
2. **Session store: custom SQLite store, not `better-sqlite3-session-store`.** Project already has `better-sqlite3` (MIT, no licensing concerns). A ~50-line store is lower risk than adding a GPL-3.0 dep. Store uses the same DB file as app data.
3. **CSP: tighten allowlist, keep `'unsafe-inline'`, plan nonce migration in follow-up.** Migrating to nonces requires changes in `MAFIKING.html` and every `src/*.jsx` file; not in scope of this plan.
4. **Cookie name: env-conditional.** `__Host-mafiking_sid` in production (HTTPS), `mafiking_sid` in dev. Prevents breaking local dev.
5. **Hardcoded admin: replace with env-based bootstrap.** User explicitly chose this in clarification. The previous `ensureFixedAdminUser` becomes a no-op unless `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` are both set, AND no admin row exists, AND env is not production. In production, bootstrap is a no-op; admins must be created via the existing `create_admin.js` script or the admin panel.

### Remaining Assumptions

- The session store migration is acceptable to perform during a single boot (no in-flight sessions at the time of deploy).
- Duitku will remain the payment provider. If the user later switches to Midtrans, only the API integration in `routes/payment.js` changes; the UX work in this plan is provider-agnostic.
- The 7-day free tryout data structure (`tryout_attempts` table, added in `server.js:106`) is sufficient to derive "topik lemah" for the result page (deferred). It already records `score`, `correct_count`, `total_questions`, `duration_seconds`, `completed_at`, plus `tryout_id` and `tryout_title`.

### Research Gaps

- No data on real-world Lighthouse score for the current `dist/` build. Will measure before/after in validation.
- The 3 MB of unused `card-*.png` files in `assets/` are not referenced by any `.jsx` file I inspected; verification by grep needed before deletion.

---

## Implementation Plan

### Phase 1 — Security P0 (largest blast radius)

#### 1.1 CSP tightening

**File:** `server.js` (Helmet config), `src/shared.jsx` (expose `window.MafikingCSP`).

- Remove `https:` from `scriptSrc`, `styleSrc`, `imgSrc`, `connectSrc`, `frameSrc`.
- Replace with explicit allowlists:
  - `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com` (Tailwind CDN is `https://cdn.tailwindcss.com`; add it)
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com`
  - `img-src 'self' data: https://cdn.jsdelivr.net https://unpkg.com https://*.supabase.co` (Duitku QRIS QR images are not currently embedded; if they are added later, extend)
  - `connect-src 'self' https://api-sandbox.duitku.com https://api-prod.duitku.com https://cdn.jsdelivr.net https://unpkg.com`
  - `frame-src 'self' https://*.duitku.com https://api-sandbox.duitku.com https://api-prod.duitku.com`
  - `font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net`
- Add `report-uri /api/csp-report` and `report-to csp-endpoint` and add a `Reporting-Endpoints` header.
- Ship in `reportOnly: true` first, watch for 7 days via logs, then flip to `false`. The `reportOnly` flag is wired in `lib/csp.js` (new) so flipping is one config change.

**Why this ordering:** the current `https:` allowlist effectively disables CSP for XSS. Removing it will break the app if any third-party resource is missed. The report-only phase catches misses without downtime.

#### 1.2 CSRF protection

**Files:** `server.js` (mount middleware), `middleware/csrf.js` (new), `lib/csrf-secret.js` (new), `src/backend-api.jsx` (attach token to state-changing requests), `src/app.jsx` (expose token to globals).

- Add `csrf-csrf@^4.0.0` dependency.
- Initialize with `getSecret: () => process.env.CSRF_SECRET` and a `cookieName: 'mafiking_csrf'` (NOT `__Host-` — double-submit cookie must be readable by JS).
- `ignoredMethods: ['GET', 'HEAD', 'OPTIONS']` plus an explicit allowlist for `POST /api/webhooks/clerk` and `POST /api/payment/callback` (verified server-to-server by signature; CSRF tokens can't be attached).
- Expose `GET /api/csrf-token` (auth-required) that returns the token via `generateCsrfToken(req, res)`. `MafikingAPI` calls this on boot and caches the token.
- All non-GET requests from `MafikingAPI.*` attach `X-CSRF-Token: <token>` header. Backend middleware validates.
- Defense-in-depth: even if a token is missing, the middleware checks `Sec-Fetch-Site: same-origin` and `Origin` against the configured `APP_ORIGIN` env (e.g., `https://mafiking.com`). Reject if either indicates a cross-site request.
- Failures: log structured entry `{ event: 'csrf_rejected', method, path, ip, userAgent, reason }` and return `403 { error: 'CSRF token tidak valid' }`.
- Counter: bump an Express rate-limit bucket per IP for repeated CSRF failures (5 per 15 min).

#### 1.3 Session store hardening

**Files:** `lib/session-store.js` (new), `server.js` (mount), `db/schema.sql` (add table), `lib/migrations/2026-06-02-sessions-table.js` (new, idempotent).

- Custom `better-sqlite3` store implementing `get`, `set`, `destroy`, `touch`, `all`, `length`, `clear`. ~50 lines.
- New `sessions` table: `sid TEXT PK, sess TEXT, expired INTEGER`. Index on `expired`.
- Background sweep every 15 min: `DELETE FROM sessions WHERE expired < ?`. Mirrors `expired.clear` behavior of `connect-sqlite3`.
- Cookie config split by env:
  - `production`: `name: '__Host-mafiking_sid'`, `secure: true`, `httpOnly: true`, `sameSite: 'strict'`, `path: '/'`, `maxAge: 24h` (down from 7 days — shorter lifetime per OWASP; long-lived sessions were a risk).
  - non-production: `name: 'mafiking_sid'`, `secure: 'auto'`, `httpOnly: true`, `sameSite: 'strict'`, `path: '/'`, `maxAge: 24h`.
- Throw on boot if `NODE_ENV === 'production'` and `SESSION_SECRET` is unset (already done; preserved).
- Migrate existing in-memory sessions: none persist (MemoryStore), so no migration needed.

#### 1.4 Remove hardcoded admin, add env-based bootstrap

**Files:** `server.js` (replace `ensureFixedAdminUser`), `.env.example` (add new vars), `README.md` (document new bootstrap), `create_admin.js` (preserve as the manual path).

- Replace `ensureFixedAdminUser` (server.js:666) with `maybeBootstrapAdminFromEnv`:
  - Only runs if `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` are both set.
  - Only runs if no admin row exists.
  - Logs `WARN [bootstrap] Created initial admin from env. Consider rotating the password.` on creation.
  - In `NODE_ENV === 'production'`: skip (admins must use `create_admin.js` or admin panel).
- Update `create_admin.js` if it still references the old hardcoded user; verify and adjust.
- `npm run check` adds a test: `scripts/test-admin-bootstrap.js` (new) verifies env-based creation, idempotence, and dev-only gating.

#### 1.5 Audit log foundation (small, lays groundwork for full observability)

**File:** `lib/audit-log.js` (new), `routes/admin.js`, `routes/payment.js`, `routes/quiz.js`, `routes/correction.js` (add call sites).

- Single helper: `audit.log({ action, userId, actor, target, request, result, metadata })`.
- Append-only log to `logs/audit.log` (NDJSON). File rotation is deferred.
- `console.info` mirror so dev sees the same line.
- Initial actions: `admin.user.delete`, `admin.user.reset_password`, `admin.import.questions`, `payment.callback`, `payment.create`, `tryout.submit`, `ai.correction.evaluated`.
- Extend `npm run check` with `node --check lib/audit-log.js` and a smoke test that asserts each action produces a structured line.

### Phase 2 — Payment UX

**File:** `src/payment.jsx`, `routes/payment.js` (extend `/api/payment/config` with `waitlistUrl`).

- When `gatewayConfig.active === false`, render a top-of-form banner before the email/name inputs:
  - Title: `Pembayaran sedang aktivasi`
  - Body: `Mafiking sedang mengaktifkan payment gateway (Duitku). Sementara itu, Anda bisa bergabung daftar tunggu atau hubungi kami via WhatsApp untuk aktivasi manual.`
  - Primary CTA: `Gabung Waitlist` (POSTs to `/api/payment/waitlist` with email → returns `204`; no DB write beyond `audit.log`).
  - Secondary CTA: `Hubungi WhatsApp` (`https://wa.me/<number>?text=...`, `WA_CONTACT_NUMBER` env, default +62 placeholder).
- Hide the `Bayar Sekarang` button and the email/name form when `active === false` (avoid wasted input).
- New endpoint: `POST /api/payment/waitlist` (rate-limited 5/hour per IP). Stores email in a new `payment_waitlist` table. `npm run check` test verifies rate-limit and dedup behavior.

### Phase 3 — Performance

#### 3.1 Route-aware script loading (static-Babel safe)

**File:** `MAFIKING.html`, `src/app.jsx` (router).

- Group existing `<script type="text/babel">` tags by route:
  - **Always** (rendered for every route): `tweaks-panel.jsx`, `clerk-auth.jsx`, `backend-api.jsx`, `shared.jsx`, `onboarding.jsx`, `lobby.jsx`, `app.jsx`
  - **belajar/practice**: `belajar.jsx`, `profile.jsx`, `toolbar.jsx`, `drawing-canvas.jsx`, `answer-board.jsx`, `practice.jsx`
  - **misi**: `misi.jsx`
  - **tryout/payment**: `tryout.jsx`, `payment.jsx`
  - **leaderboard**: `leaderboard.jsx`
  - **admin**: `admin-monitoring.jsx`, `admin.jsx`
- Mark each group with a `data-route-group` attribute.
- Add a small inline loader at the top of `body`: reads the initial route from `window.__initialRoute` (set by the server based on the URL pathname) and only injects `<script>` tags for the matching group. Other groups' tags remain in the DOM but with `type="text/babel-disabled"` (Babel ignores unknown types).
- On client-side route changes, the loader re-injects the next group's script tags if not already present.
- Expected impact: initial JSX fetch goes from 17 files to ~9. Since each `*.jsx` is ~10-30 KB source, the immediate bandwidth saving is meaningful even before compression.

#### 3.2 Asset cleanup

**Files:** `assets/card-*.png` (3 files, ~2.3 MB total), `assets/saas_demo_video.mp4` (6.9 MB).

- Confirm via grep that no `.jsx` references `card-bg.png`, `card-fisika.png`, `card-kimia.png`, `card-matematika.png`. The dist build already uses `card-*.webp` versions; the `.png` originals are leftovers from a previous build.
- Confirm `saas_demo_video.mp4` is referenced only by `src/lobby.jsx` and only inside an unused branch (the `MAFIKING.html` AGENTS.md note says: "The demo video section should not have the old grid background."). If it's truly unused, remove the file. If it's referenced by an unused branch, also remove the branch.
- If either is referenced by a live code path: keep the file but exclude it from the public static path by moving to `assets/_legacy/` (not served).

#### 3.3 Vite build tightening

**File:** `vite.config.js`.

- The current chunking already splits `vendor-react` and `vendor-icons`. Add a third split: `vendor-tailwind-katex` (KaTeX is currently bundled into `index.js`; isolate it).
- The `index-*.js` is 392 KB unminified. Add `build.minify: 'esbuild'` (Vite default but explicit) and `build.cssMinify: true` (default). Verify output sizes after.
- If the 192 KB `vendor-react` chunk can be replaced by an external CDN reference (e.g. `unpkg.com/react@18`), do that and save 192 KB. But this conflicts with the static-Babel architecture (offline-first). Decision: keep vendor chunk, document the trade-off.

---

## Files to Modify

| File | Change |
|---|---|
| `server.js` | Helmet CSP; CSRF middleware mount; session store; bootstrap admin |
| `package.json` | Add `csrf-csrf` (no other new deps) |
| `.env.example` | Add `CSRF_SECRET`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`, `WA_CONTACT_NUMBER`, `CSP_REPORT_URI` |
| `db/schema.sql` | Add `sessions`, `payment_waitlist` tables |
| `lib/session-store.js` | NEW — custom SQLite session store |
| `lib/csp.js` | NEW — CSP config factory (so dev/prod can be toggled) |
| `lib/audit-log.js` | NEW — structured audit log helper |
| `lib/csrf-secret.js` | NEW — CSRF_SECRET env validation |
| `middleware/csrf.js` | NEW — CSRF middleware mount (wraps `csrf-csrf`) |
| `routes/payment.js` | `/api/payment/waitlist`, `/api/payment/config` adds `waitlistUrl` |
| `routes/admin.js` | Audit log calls on delete/reset/role/grant |
| `routes/admin-import.js` | Audit log on import |
| `routes/quiz.js` | Audit log on tryout submit |
| `routes/correction.js` | Audit log on evaluation |
| `MAFIKING.html` | Route-grouped script tags |
| `src/app.jsx` | Initial route read; dynamic script injection on route change |
| `src/backend-api.jsx` | Attach `X-CSRF-Token` to non-GET; fetch token on boot |
| `src/payment.jsx` | "Pembayaran sedang aktivasi" banner; waitlist/WhatsApp CTAs |
| `scripts/test-csrf.js` | NEW — verifies CSRF enforcement and allowlisted routes |
| `tests/storage/test-session-store.js` | NEW — verifies SQLite session store round-trip + sweep |
| `scripts/test-admin-bootstrap.js` | NEW — verifies env-based admin bootstrap |
| `tests/security/test-csp-report.js` | NEW — verifies CSP report endpoint accepts violations |
| `scripts/test-payment-waitlist.js` | NEW — verifies waitlist endpoint |
| `vite.config.js` | Vendor chunk split for KaTeX |
| `README.md`, `ARCHITECTURE.md`, `AGENTS.md` | Update security + payment UX + observability sections |

## Files to Create

Already listed above. None are new top-level directories.

## Files to Delete (after verification)

- `assets/card-bg.png` (716 KB)
- `assets/card-fisika.png` (770 KB)
- `assets/card-kimia.png` (733 KB)
- `assets/card-matematika.png` (768 KB)
- `assets/saas_demo_video.mp4` (6.9 MB) — only if confirmed unreferenced

Total disk saving if all confirmed: ~9.9 MB.

## API Contracts Affected

| Endpoint | Change | Backward compatible? |
|---|---|---|
| `GET /api/csrf-token` | NEW — returns `{ csrfToken: "..." }` | yes (additive) |
| `POST /api/payment/waitlist` | NEW — body `{ email, packageId? }` returns 204 | yes |
| `GET /api/payment/config` | Adds `waitlistUrl: "/api/payment/waitlist"` and `whatsappNumber` | yes (additive) |
| `POST /api/csp-report` | NEW — accepts CSP violation report (browser POST) | yes |
| All non-GET `/api/*` | Require `X-CSRF-Token` header (with allowlist for `/api/webhooks/clerk`, `/api/payment/callback`) | **No** — clients must update `MafikingAPI` (handled in this plan) |
| `POST /api/auth/login`, `POST /api/auth/register` | Same CSRF protection as above | **No** — same client update |
| Cookie name | `mafiking_sid` in dev, `__Host-mafiking_sid` in prod | Forces re-login on deploy |
| Session lifetime | 7 days → 24h | Forces re-login after deploy (acceptable) |
| `tryout_attempts` | No schema change; just audit-log writes | yes |

## UI/UX Behavior Affected

- `src/payment.jsx`: when gateway is inactive, the form is replaced by a banner with two CTAs. The numeric price inputs disappear. The "active packages" badge area stays (now reads "Aktivasi tertunda" with a clock icon).
- `MAFIKING.html`: no visible UI change; scripts load in groups.
- `src/app.jsx`: when user navigates to a route for the first time, the relevant JSX fetches; show a small unobtrusive "Memuat…" toast in the corner if the route is slow (but only after 500 ms, to avoid flashing on cached loads).

## Error Handling Strategy

- All new endpoints use the existing JSON error shape `{ error: "string" }`. No new error types.
- CSRF failures: `403 { error: "CSRF token tidak valid" }` + audit log + rate-limit bump.
- Session store failures: fall through to express-session default behavior (request continues without session). Log error. Do not crash.
- CSP report endpoint: accept any payload, log to a separate `csp-reports.log` file (NDJSON), return 204. 5xx is never returned to the browser.
- Waitlist endpoint: 400 on bad email, 409 on duplicate email (idempotent), 429 on rate limit.

## Migration Strategy

- Session lifetime change forces a re-login for all users on deploy. Acceptable for a small user base; documented in CHANGELOG.
- CSP starts in `reportOnly: true`. After 7 days, if no false-positive reports, flip to enforced. The flag lives in `lib/csp.js`.
- No data migrations; all new tables are additive.
- The hardcoded `123` admin still exists in the database for users who already logged in. Removing the code does not retroactively remove the row. The user must `DELETE FROM users WHERE username = '123'` manually if desired. This is documented in the README.

## Rollback Strategy

- All changes are behind env flags (`NODE_ENV`, `CSP_REPORT_ONLY`, `WAITLIST_ENABLED`).
- `git revert` of the merge commit restores the previous behavior.
- New `sessions` table is harmless if unused.
- `csrf-csrf` can be disabled in dev by setting `CSRF_DISABLED=1` (added in `lib/csrf-secret.js`).

---

## Validation Plan

### Unit / contract tests (extend `npm run check`)

- `scripts/test-csrf.js`: request without token → 403; request with valid token → 200; allowlisted webhook/callback bypass CSRF; cross-origin Origin header → 403.
- `tests/storage/test-session-store.js`: write/read/destroy session, sweep deletes expired rows, custom `maxAge` honored.
- `scripts/test-admin-bootstrap.js`: env-based creation, idempotence (don't recreate), production skip.
- `tests/security/test-csp-report.js`: report endpoint accepts, logs, returns 204; rejects oversized payloads.
- `scripts/test-payment-waitlist.js`: bad email → 400, duplicate → 409, rate-limit → 429, valid → 204.

### Smoke tests (manual, after `npm start`)

1. **Admin endpoint no login**: `curl -i -X POST http://127.0.0.1:3001/api/admin/users/1/role` → `401` or `403`.
2. **CSRF invalid**: `curl -i -X POST http://127.0.0.1:3001/api/quiz/init` (no token) → `403`.
3. **Webhook signature valid**: `curl -i -X POST http://127.0.0.1:3001/api/webhooks/clerk` (no CSRF, valid Svix signature) → `200` or signature error (NOT 403).
4. **CSP report-only**: load `/`, verify `Content-Security-Policy-Report-Only` header is present; load any page, no console CSP errors in the network panel.
5. **Landing**: `Coba Gratis` → `Belajar` → `Try Out` opens. Visual unchanged.
6. **Login gate**: open `/admin` while logged out → redirected to login.
7. **Free tryout**: `Mulai Try Out` → 15-question session → finish → toast (current behavior; result page deferred).
8. **Payment inactive state**: with no Duitku env, visit `/?route=payment` → see "Pembayaran sedang aktivasi" banner with WhatsApp CTA. Form fields are hidden.
9. **Route-aware loading**: open DevTools network panel, reload `/`, count `src/*.jsx` requests — should be ~9, not 17.
10. **Asset size**: `du -sh dist/assets/*` after build; record for comparison.

### Lint / typecheck / build / audit

- `npm run check` (passes all 11 sub-tests + new ones)
- `npm run build` (Vite exits 0; bundle sizes recorded)
- `npm audit --omit=dev` (no new high/critical advisories)

### Performance baseline

- Lighthouse desktop + mobile on `/` (landing) and `/?route=belajar`. Record LCP, INP, CLS, TBT.
- Target after this work: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 (web.dev thresholds). If LCP regresses, investigate before merging.
- Chrome trace on landing to verify route-aware script loading reduced initial network.

### Security checks

- `curl -I http://127.0.0.1:3001/` — verify all 15 Helmet headers present, including `Strict-Transport-Security` (production) and the tightened CSP.
- Attempt cross-origin POST to `/api/auth/login` with `Origin: https://evil.com` — expect 403.
- Attempt cross-origin POST to `/api/quiz/init` with `Sec-Fetch-Site: cross-site` — expect 403.
- Verify cookie name in dev (`mafiking_sid`) and production (`__Host-mafiking_sid`).

### Regression risks

- Breaking the Clerk dual-auth path. Mitigation: integration smoke test in `tests/auth/test-auth-registered-user.js` (already in `npm run check`).
- Forcing re-login on deploy due to cookie rename. Mitigation: clear `Set-Cookie` documentation in CHANGELOG; auto-recovery via guest session.
- CSP tightening breaking a third-party widget I didn't enumerate. Mitigation: report-only phase catches it.

---

## Approval Gate

This plan touches security, session management, payment UX, performance, and observability. Per the project's `AGENTS.md` rule "ask for approval before major refactors", I will stop and request explicit approval after writing this plan to disk but before touching `server.js`.

When you say "go", I will:

1. Read `lib/performance.js`, `middleware/clerk-auth.js`, and `lib/request-guard.js` to confirm the planned integration points.
2. Implement Phase 1.1 (CSP report-only) first; commit; move to 1.2 (CSRF), 1.3 (session store), 1.4 (admin bootstrap), 1.5 (audit log) in order.
3. Phase 2 (payment UX).
4. Phase 3 (performance) — last because it depends on the build pipeline being stable.
5. Run all validation; report.

If any test fails I will stop and surface the issue before proceeding to the next phase.
