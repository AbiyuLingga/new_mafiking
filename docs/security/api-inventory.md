# Mafiking API inventory

Static inventory of every HTTP route exposed by `server.js` and the route
files in `routes/`. Generated for Phase 1 of the OWASP ASVS L2 hardening
roadmap. Drives the OWASP API Top 10 review, the BOLA scan, the rate-limit
gap analysis, and the CSRF / CORS coverage tests.

**Source of truth:** `grep -nE "router\.(get|post|put|patch|delete)\(" routes/*.js` and `server.js` mounts, cross-checked by hand.
**Generated:** Phase 1, commit `64afa11` + 1.

## Legend

- **Auth class**
  - `public` — no auth required.
  - `session` — `req.session.userId` (auto-guest for `/api/*`).
  - `registered` — `requireRegisteredUser` (rejects auto-guests).
  - `registered/local-dev-guest` — production requires `registered`; non-production
    may allow auto-guest checkout only when `PAYMENT_LOCAL_GUEST_CHECKOUT`
    is enabled. Set it to `false` for stricter local security debugging.
  - `admin` — `isAdmin` middleware.
  - `clerk-public` — public, but the data is per-Clerk-user and verified
    when applicable (webhooks, payment callback).
- **CSRF**
  - `✓` — `csrfProtection` middleware is in front of the route.
  - `exempt` — listed in `CSRF_EXEMPT_PATHS` (webhook / signed callback /
    CSP report / performance vitals).
  - `n/a` — `GET`/`HEAD` only.
- **BOLA**
  - `user-scoped` — handler filters by `req.session.userId` or an
    admin guard; ownership check is the design.
  - `id-scoped` — handler takes `:id` but verifies ownership before
    reading / writing.
  - `admin` — admin-only, ownership is implicit.
  - `none` — public data, no per-user claim.
- **Rate limit** — `express-rate-limit` mount, if any.

## Routes

### Health, config, public

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| GET | `/api/health` | public | n/a | none | Liveness. Returns counts. |
| GET | `/api/config/clerk` | public | n/a | none | Returns publishable key only. `CLERK_SECRET_KEY` must never appear. |
| GET | `/api/performance/summary` | admin | n/a | admin | Admin-only perf summary. |
| GET | `/api/payment/config` | public | n/a | none | Returns `paymentGatewayState()` (QRIS local, mock, or Duitku). Cached 30s. |
| GET | `/api/payment/active-packages` | session | n/a | user-scoped | Filters by `user_id`. No `:id` exposure. |
| GET | `/api/payment/mock-gateway` | public | n/a | none | Dev-only mock payment UI; refuses to render in production. |
| GET | `/api/payment/mock-complete` | public | n/a | none | Dev-only mock completion; only when `isMockPaymentEnabled()`. |
| POST | `/api/csp-report`, `/api/csp-report/` | public | exempt | none | CSP violation sink. 32 KB cap, 204. |
| POST | `/api/performance/client-error` | public | exempt | none | Client runtime error sink. Behind `performanceLimiter`. |
| POST | `/api/performance/vitals` | public | exempt | none | Web Vitals ingest. Behind `performanceLimiter`. |
| POST | `/api/webhooks/clerk`, `/` | clerk-public | exempt | n/a | svix signature verified. Raw body. |
| POST | `/api/payment/callback` | clerk-public | exempt | n/a | Duitku MD5 signature verified. URL-encoded body. |
| POST | `/api/payment/reconcile/webhook` | public | exempt | n/a | QRIS reconciliation webhook. HMAC SHA-256 signature + timestamp required. |
| POST | `/api/payment/reconcile/mutasiku-webhook` | public | exempt | n/a | Mutasiku webhook. HMAC SHA-256 `X-Webhook-Signature` over `data` required. |
| GET | `/api/csrf-token` | session | n/a | n/a | Issues double-submit token. |
| GET | `/api/landing-media` | public | n/a | none | Reads from `landing_media` table. Cached 60s. |
| GET | `/api/missions` | public | n/a | none | Daily missions catalog. `?admin=1` returns drafts only if `canReadMissionDrafts` (admin/local). `hasMissionManualAccess` for free users. |
| GET | `/api/missions/premium-practice/:mapel` | session | n/a | user-scoped | Premium daily-mission practice bank by subject. Validates mission/practice package access and returns released mission problems for the requested mapel. |
| GET | `/api/missions/practice/:track/:lesson` | session | n/a | user-scoped | Daily mission practice page for premium users/admin only. Validates package mission/practice access, then returns the single released mission problem for `latsol-N`. |
| GET | `/api/tryout-packages` | public | n/a | none | Public read of `tryout_packages` only when package access is enabled; locked user response is `[]` with private no-store. Exempt from auto-guest. |
| GET | `/api/tryout-packages/access` | public | n/a | none | Returns package access state for the viewer. Private no-store. Exempt from auto-guest. |
| GET | `/SOP-DEEPSEEK-IMPORT-SOAL.md` | admin | n/a | admin | Static file. 403 unless `req.session.role === 'admin'`. |
| GET | `/tweaks-panel.jsx` | public | n/a | none | Dev-only tweak panel source. 404 when `canServeLegacySource()` is false (production / built client). |
| GET | `/syarat-ketentuan.html`, `/terms.html`, `/tnc.html` | public | n/a | none | Static T&C page. |
| GET | `/auth-popup` | public | n/a | none | Static popup HTML shim served by `routes/auth-popup.js`. Loads Clerk in a popup window, writes pending OAuth to `sessionStorage`, and posts the result back to `window.opener` via `postMessage` on `/sso-callback?popup=1`. No-store. Same-origin target only. |
| GET | `/robots.txt` | public | n/a | none | Static crawler policy. Plain text, allows indexing. |
| GET | `/`, `/index.html`, `/MAFIKING.html` | session | n/a | none | SPA shell. Registered (non-guest) sessions are 302-redirected to `/belajar`. Otherwise serves `dist/index.html` (or `MAFIKING.html` when no client bundle exists). |
| GET | `/landing` | public | n/a | none | SPA shell explicit marketing deep link. Bypasses the auth-aware redirect so logged-in users can still open the marketing page. |

### Auth (routes/auth.js)

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| POST | `/api/auth/login` | public | ✓ | none | Per-username lockout (`MAX_ATTEMPTS=5`, `LOCKOUT_MS=5*60*1000`). Bcrypt. Beta gate via `BETA_USERNAME`. |
| POST | `/api/auth/register` | public | ✓ | none | bcrypt cost 10. XSS-sanitizes display_name/fakultas/email. Min 8 chars password. Creates local user pending email verification; no session until verify link is consumed. |
| POST | `/api/auth/resend-verification` | public | ✓ | none | Generic success to avoid account enumeration. Per-IP limiter and per-user 60s resend cooldown. Sends a new single-use verification link for unverified local users only. |
| GET | `/api/auth/verify-email` | public | n/a | none | Consumes a 24h single-use token. DB stores only SHA-256 token hash. Sets `email_verified_at` and creates a session when valid. |
| POST | `/api/auth/logout` | session | ✓ | user-scoped | `req.session.destroy`. |
| POST | `/api/auth/clerk-onboard` | session | ✓ | user-scoped | Requires Clerk user. Merges guest via `mergeGuestIntoUser` if `guest_user_id !== userId`. |
| POST | `/api/auth/profile-onboarding` | session | ✓ | user-scoped | Strict validation (semester ∈ {1,2}, faculty in allowlist, major in faculty→major map, mapel in priority set, phone regex, referral allowlist). |
| POST | `/api/auth/profile` | session | ✓ | user-scoped | Updates only the viewer's display name and phone number. Phone remains optional. |
| POST | `/api/auth/avatar` | session | ✓ | user-scoped | Uploads only the viewer's profile photo. Accepts JPG/PNG/WEBP/GIF up to 2MB and stores under `/profile-media/avatars/`. |
| POST | `/api/auth/phone-number` | session | ✓ | user-scoped | Updates only the viewer's WhatsApp/phone number. Used by the optional one-time phone prompt and required bimbel checkout path. |
| GET | `/api/auth/me` | session | n/a | user-scoped | Returns own user only. |

### Quiz (routes/quiz.js)

All `GET` and `isAuthenticated`. No `:id` ownership risk because the data is
public catalog data. All routes are `GET` so CSRF is `n/a`.

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| GET | `/api/quiz/chapters` | session | n/a | none | Catalog read. |
| GET | `/api/quiz/chapters/:id/subtopics` | session | n/a | id-scoped | Reads chapter by id; no per-user claim. |
| GET | `/api/quiz/init` | session | n/a | none | Bootstrap data for Belajar. |
| GET | `/api/quiz/subtopics/:id/problems` | session | n/a | id-scoped | Catalog. |
| GET | `/api/quiz/problems/:id` | session | n/a | id-scoped | Catalog. |
| GET | `/api/quiz/subtopics/:id` | session | n/a | id-scoped | Catalog. |
| GET | `/api/quiz/subtopics/:id/full` | session | n/a | id-scoped | Catalog. |
| GET | `/api/quiz/tryout/free-math-session` | session | n/a | none | Issues a free tryout session token. |

### Tryout (routes/tryouts.js)

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| GET | `/api/tryouts/:tryoutId/full` | session | n/a | user/id-scoped | Reads tryout by id and creates/resumes the viewer's active timed session. |
| PUT | `/api/tryouts/:tryoutId/session` | session | ✓ | user/id-scoped | Autosaves answers/choice snapshot for the viewer's active timed session before final submit. |

### Progress (routes/progress.js)

All non-`GET` routes are `requireRegisteredUser`. BOLA pattern: every query
filters by `req.session.userId`.

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| POST | `/api/progress/submit` | registered | ✓ | user-scoped | Body: `problemId`, `correct`, `hintsUsed`, `mode`, `selectedAnswer`, `correctAnswer`, `selectedChoiceIndex`, `correctChoiceIndex`. Validates `mode ∈ {canvas, multiple}`. |
| GET | `/api/progress/me` | session | n/a | user-scoped | Reads own progress. |
| GET | `/api/progress/stats` | session | n/a | user-scoped | Reads own stats. |
| GET | `/api/progress/leaderboard` | session | n/a | none | Cross-user leaderboard (intended). |
| GET | `/api/progress/leaderboard/weekly` | session | n/a | none | Cross-user leaderboard. |
| GET | `/api/progress/leaderboard/tryout` | session | n/a | none | Cross-user tryout leaderboard. |
| GET | `/api/progress/leaderboard/tryout-options` | session | n/a | none | Lists tryouts that already have non-admin, non-guest attempts for leaderboard filters. |
| GET | `/api/progress/tryout-attempts/latest` | registered | n/a | user-scoped | Reads own latest. |
| POST | `/api/progress/tryout-attempts` | registered | ✓ | user-scoped | Saves own attempt. Uses `verifyTryoutSessionToken` to bind to a session. |

### Correction (routes/correction.js)

All routes `isAuthenticated`. Body validation lives in
`validateImagePayload` and the schema validation in the call sites.

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| GET | `/api/correction/attempts` | session | n/a | user-scoped | Reads own. LIMIT 50. |
| POST | `/api/correction/transcribe` | registered | ✓ | user-scoped | Image OCR via Gemini. MIME + size validated. `questionText` interpolated into a system prompt — see Phase 2 LLM inventory. |
| POST | `/api/correction/evaluate` | registered | ✓ | user-scoped | Image evaluation via Gemini. Owns the bulk of the Gemini cost. |
| POST | `/api/correction/evaluate-stream` | registered | ✓ | user-scoped | SSE wrapper for image evaluation. Uses the same backend evaluation helper as `/evaluate`. |
| POST | `/api/correction/profile-summary` | session | ✓ | user-scoped | Gemma 4 31B profile summary. Catalogs + AI prose. |
| GET | `/api/correction/pool/stats` | session | n/a | admin | Admin/local-admin only. Read-only AI provider pool counters; no user data. |
| GET | `/api/correction/latency/summary` | session | n/a | admin | Admin/local-admin only. Read-only latency percentiles and provider breakdown. |

### Payment (routes/payment.js)

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| GET | `/api/payment/config` | public | n/a | none | `paymentGatewayState`. Cached 30s. |
| POST | `/api/payment/pending` | registered/local-dev-guest | ✓ | user-scoped | Reopens only the current user's unexpired `PENDING` QRIS/manual order for the resolved server-side package. Production rejects auto-guests; local debugging should set `PAYMENT_LOCAL_GUEST_CHECKOUT=false` when testing auth gates. |
| POST | `/api/payment/create` | registered/local-dev-guest | ✓ | user-scoped | QRIS local, Duitku, or mock. Body: `email`, `name`, package selector. Production rejects auto-guests; local debugging should set `PAYMENT_LOCAL_GUEST_CHECKOUT=false` when testing auth gates. |
| POST | `/api/payment/toggle-package-access` | session | ✓ | user-scoped | Dev utility. Toggles tryout access grant for the current user by `tryout_id`. |
| GET | `/api/payment/status/:merchantOrderId` | session | n/a | id-scoped | Filters by `user_id = ? AND merchant_order_id = ?` — explicit ownership check. |
| GET | `/api/payment/stream/:merchantOrderId` | session | n/a | id-scoped | SSE stream that pushes `event: paid` via `lib/payment-broadcaster`. Filters by `payment.user_id === req.session.userId` (403 otherwise). Per-user connection cap (`SSE_MAX_CONN_PER_USER`, 429 when exceeded). 15s `: heartbeat` keepalive (`.unref()` so SMTP/event-loop blocks don't block shutdown). Gated by `SSE_PAYMENT_PUSH` feature flag — returns 503 when off. |
| GET | `/api/payment/active-packages` | session | n/a | user-scoped | Own data only. |
| POST | `/api/payment/callback` | clerk-public | exempt | n/a | Duitku MD5-signed. Updates `payments` by `merchant_order_id`. |
| POST | `/api/payment/reconcile/webhook` | public | exempt | n/a | QRIS HMAC-signed reconciliation endpoint. Calls idempotent reconciler. |
| POST | `/api/payment/reconcile/mutasiku-webhook` | public | exempt | n/a | Mutasiku `payment.completed` or `mutations.created` reconciliation endpoint. |
| POST | `/api/payment/reconcile/mutation-batch` | collector-signed | exempt | n/a | Phase 4 internal collector ingestion. HMAC SHA-256 over `keyId:nonce:timestamp:rawBody`, 5-min clock skew, IP allowlist via `COLLECTOR_IP_ALLOWLIST`. |
| GET | `/api/payment/invoices` | registered | n/a | user-scoped | Returns up to 100 current-user transactions across all statuses; response excludes buyer email and QR payloads. |
| GET | `/api/payment/mock-gateway` | public | n/a | none | Dev-only. |
| GET | `/api/payment/mock-complete` | public | n/a | none | Dev-only. |

### Admin payments (routes/admin-payments.js)

All routes `isAuthenticated` + `isAdmin` and use `adminPaymentLimiter`.

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| GET | `/api/admin/payments/pending` | admin | n/a | admin | Pending QRIS/gateway payments for manual reconciliation. |
| GET | `/api/admin/payments/` | admin | n/a | admin | Filterable payment list by status/search. |
| GET | `/api/admin/payments/dashboard` | admin | n/a | admin | Phase 7 dashboard: payment counts, 24h ambiguous/invalid-webhook counts, recent errors, last webhook ingest, collector stats. |
| GET | `/api/admin/payments/ambiguous` | admin | n/a | admin | Reads unresolved rows from `payment_ambiguous_queue` (most recent 100). Returns `[]` if the table is missing. Gated by `BULK_ADMIN` feature flag — returns 503 when off. |
| POST | `/api/admin/payments/ambiguous/:mutationId/resolve` | admin | ✓ | admin | Force-matches an ambiguous mutation to a target `merchantOrderId` by calling `markPaymentPaid(source: 'admin_force')`, then records `resolution='matched'` in `payment_ambiguous_queue`. Body: `merchantOrderId` (required), optional `fullAmount`, `force`, `note`. Gated by `BULK_ADMIN`. |
| POST | `/api/admin/payments/bulk-mark-paid` | admin | ✓ | admin | Up to 50 items/call. Each item invokes `markPaymentPaid(source: 'admin_bulk')`; per-item errors are collected and the response carries `summary { total, success, failed }`. Stricter `adminBulkMarkPaidLimiter` (5-min/5) in addition to the shared `adminPaymentLimiter`; the bulk limiter is a no-op when `BULK_ADMIN` is off. |
| POST | `/api/admin/payments/:merchantOrderId/mark-paid` | admin | ✓ | admin | Marks payment `SUCCESS`, releases suffix, grants access, logs audit row. Stricter 5-min/10-action per-admin rate limit; IP allowlist if `ADMIN_IP_ALLOWLIST` is set. |
| POST | `/api/admin/payments/:merchantOrderId/mark-failed` | admin | ✓ | admin | Marks payment `FAILED`, releases suffix, logs audit row. |
| POST | `/api/admin/payments/:merchantOrderId/resend-email` | admin | ✓ | admin | Re-renders the success email via `lib/email-templates.renderPaymentSuccess` and resends it through `lib/mailer`. Only allowed for `status=SUCCESS` payments (409 otherwise). Writes a `payment_reconciliation_log` row with `action='email_resent'`. Returns 503 if the mailer has no `sendMail`/`send`. |
| GET | `/api/admin/payments/:merchantOrderId/audit-log` | admin | n/a | admin | Reads reconciliation audit log for one order. |
| GET | `/api/admin/payments/metrics` | admin | n/a | admin | 24h rollups from `payment_reconciliation_log` (auto_paid, manual_paid, bulk_paid, force_paid, webhook_paid, ambiguous_resolved, ambiguous_open, emails_sent, emails_resent) plus the latest `collectorHeartbeat` snapshot and `paymentBroadcaster.getStats()`. Tolerates missing tables by reporting 0. |

### Admin import (routes/admin-import.js)

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| POST | `/api/admin/import/draft` | admin | ✓ | admin | `multer.single('file')` upload, 12 MB cap. Body schema validated. |
| POST | `/api/admin/import/commit` | admin | ✓ | admin | DeepSeek call + transaction. |

### Admin (routes/admin.js)

All routes `isAdmin`. Routes that take `:id` operate on catalog content
(chapters, problems, missions, tryout packages/questions) or on `users`.

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| GET | `/api/admin/chapters` | admin | n/a | admin | |
| POST | `/api/admin/chapters` | admin | ✓ | admin | |
| PUT | `/api/admin/chapters/:id` | admin | ✓ | admin | |
| DELETE | `/api/admin/chapters/:id` | admin | ✓ | admin | |
| GET | `/api/admin/subtopics` | admin | n/a | admin | |
| POST | `/api/admin/subtopics` | admin | ✓ | admin | |
| PUT | `/api/admin/subtopics/:id` | admin | ✓ | admin | |
| DELETE | `/api/admin/subtopics/:id` | admin | ✓ | admin | |
| GET | `/api/admin/problems` | admin | n/a | admin | |
| POST | `/api/admin/problems` | admin | ✓ | admin | |
| PUT | `/api/admin/problems/:id` | admin | ✓ | admin | |
| PATCH | `/api/admin/problems/:id/sort` | admin | ✓ | admin | |
| DELETE | `/api/admin/problems/:id` | admin | ✓ | admin | |
| GET | `/api/admin/problems/:id/steps` | admin | n/a | admin | |
| POST | `/api/admin/problems/:id/steps` | admin | ✓ | admin | |
| PUT | `/api/admin/steps/:id` | admin | ✓ | admin | |
| DELETE | `/api/admin/steps/:id` | admin | ✓ | admin | |
| GET | `/api/admin/missions` | admin | n/a | admin | |
| POST | `/api/admin/missions` | admin | ✓ | admin | |
| PUT | `/api/admin/missions/:id` | admin | ✓ | admin | |
| DELETE | `/api/admin/missions/:id` | admin | ✓ | admin | |
| GET | `/api/admin/settings/tryout-packages-access` | admin | n/a | admin | Reads the admin-controlled package access switch. |
| PUT | `/api/admin/settings/tryout-packages-access` | admin | ✓ | admin | Toggles whether users can view and buy tryout packages. |
| GET | `/api/admin/tryout-packages` | admin | n/a | admin | |
| POST | `/api/admin/tryout-packages` | admin | ✓ | admin | |
| PUT | `/api/admin/tryout-packages/:id` | admin | ✓ | admin | |
| DELETE | `/api/admin/tryout-packages/:id` | admin | ✓ | admin | |
| PUT | `/api/admin/tryout-packages/:id/toggle-hidden` | admin | ✓ | admin | Toggles `is_hidden` on tryout package. |
| GET | `/api/admin/tryout-questions` | admin | n/a | admin | |
| POST | `/api/admin/tryout-questions` | admin | ✓ | admin | |
| PUT | `/api/admin/tryout-questions/:id` | admin | ✓ | admin | |
| PATCH | `/api/admin/tryout-questions/:id/sort` | admin | ✓ | admin | |
| DELETE | `/api/admin/tryout-questions/:id` | admin | ✓ | admin | |
| GET | `/api/admin/tryout-questions/:id/steps` | admin | n/a | admin | |
| POST | `/api/admin/tryout-questions/:id/steps` | admin | ✓ | admin | |
| PUT | `/api/admin/tryout-question-steps/:id` | admin | ✓ | admin | |
| DELETE | `/api/admin/tryout-question-steps/:id` | admin | ✓ | admin | |
| GET | `/api/admin/tryout-attempts` | admin | n/a | admin | |
| DELETE | `/api/admin/tryout-attempts/:id` | admin | ✓ | admin | |
| GET | `/api/admin/dashboard-data` | admin | n/a | admin | |
| GET | `/api/admin/users` | admin | n/a | admin | |
| PUT | `/api/admin/users/:id/password` | admin | ✓ | admin | bcrypt hash. |
| POST | `/api/admin/users/:id/reset-password` | admin | ✓ | admin | New password, bcrypt. |
| POST | `/api/admin/users/:id/grant-access` | admin | ✓ | admin | |
| DELETE | `/api/admin/users/:id/access-grants/:grantId` | admin | ✓ | admin | |
| POST | `/api/admin/users/:id/role` | admin | ✓ | admin | |
| DELETE | `/api/admin/users/:id` | admin | ✓ | admin | Refuses to delete the current admin (per AGENTS.md). |

### Internal (routes/internal.js)

Worker-only endpoints. Not consumed by browsers or admins; mounted at
`/api/internal` in `server.js:483` so the file header explicitly states
"NOT exposed to browsers or admins". Auth is a shared secret in the
`x-internal-secret` request header (env `INTERNAL_API_SECRET`). Mounted
before `csrfProtection` (`server.js:630`) so CSRF is bypassed by mount
order, not by `CSRF_EXEMPT_PATHS`.

| Method | Path | Auth | CSRF | BOLA | Notes |
|---|---|---|---|---|---|
| POST | `/api/internal/collector-heartbeat` | collector-secret | exempt | none | Self-healing mutation collector heartbeat (every 30s). Returns 503 if `INTERNAL_API_SECRET` is unset and 401 on header mismatch. Stores the normalized snapshot in `req.app.locals.collectorHeartbeat` (read by `GET /api/admin/payments/metrics` and `/api/admin/payments/dashboard`). Tolerates missing/empty `breaker` and `totals` blocks. |

## Cross-cutting observations

- All browser-facing `POST`/`PUT`/`PATCH`/`DELETE` are mounted after
  `csrfProtection` in `server.js:630`, so CSRF coverage is uniform across
  the user/admin surface. The `/api/internal/*` mount at
  `server.js:483` is the only state-changing prefix mounted before
  `csrfProtection`; it relies on the `x-internal-secret` header for
  auth and is intended for worker-to-server calls only.
- The CSRF exempt list (`lib/csrf-protection.js:4`) and
  `lib/request-guard.js` `STATE_CHANGE_EXEMPT_PATHS` are kept in sync
  and both name `/api/internal/collector-heartbeat` so the worker
  heartbeat cannot be silently rejected by a future CSRF layer that
  moves past the `/api/internal` mount point.
- BOLA pattern across `progress.js`, `correction.js`, `payment.js`,
  `auth.js` is `WHERE user_id = req.session.userId`. No `users` cross-id
  leak found in the inventory.
- Admin routes all live under `/api/admin/*` and use `isAdmin` middleware;
  no admin route is exposed without that middleware.
- The only routes that take a `merchantOrderId` (the `:id` for payment
  status) explicitly filter by `user_id`. Good.
- The free tryout session token binding (`verifyTryoutSessionToken`)
  prevents a user from submitting attempts on behalf of another session.
- `register` does not have a rate limit at the route level; only the in-app
  per-username lockout on `login`. Could be hardened in 1.6.
- The CSP and CSRF report endpoints are both exempt from CSRF. CSP report
  receives arbitrary browser POSTs (must be unauthenticated to allow
  browser reports from any origin); CSRF report endpoint is internal and
  protected by the `__Host-` cookie.

## Coverage gaps to verify in 1.2

- CORS: confirm no `Access-Control-Allow-Origin` header on any `/api/*`
  response (same-origin only).
- CSRF: confirm every state-changing route returns 403 when called without
  a token (the only allowed responses are 2xx for exempt paths and the
  `/api/csrf-token` GET).
- Rate limits: confirm login, register, correction/transcribe, correction/evaluate
  are all rate-limited; document the rest as candidates for 1.6.
