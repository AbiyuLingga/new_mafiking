# AGENTS.md

Project-specific instructions for coding agents working in this repository.

## Project Identity

This project is `new_mafiking`, located at:

```text
/home/abiyulinx/computing/king/new_mafiking
```

It is a copied Mafiking web UI with added backend features. The production runtime is:

```text
Express server -> dist/index.html -> Vite-built React route chunks
```

The source still uses browser globals for compatibility. In non-production, `MAFIKING.html` remains a Babel-standalone fallback when `dist/index.html` is unavailable.

## Highest-Priority Local Rules

1. Preserve the UI unless the user explicitly asks for UI changes.
2. Treat `MAFIKING.html`, `src/styles.css`, and the copied static UI files as reference-sensitive.
3. Add backend/features surgically around the current UI instead of redesigning pages.
4. Preserve the shared `window.*` component contract across both the Vite build and legacy fallback unless the task explicitly asks for an architecture migration.
5. Run `npm run build`, then verify runtime behavior through the Express server.
6. Do not delete or reset local SQLite data unless the user explicitly asks.
7. Never revert user changes. If the worktree is dirty, inspect and work around unrelated edits.

## Required Context Before Non-Trivial Changes

Before planning or implementing non-trivial work, inspect:

```text
server.js
db/schema.sql
server/routes/
server/middleware/clerk-auth.js
server/auth/clerk-user-sync.js
src/core/app.jsx
src/pages/belajar.jsx
src/features/practice/practice.jsx
src/pages/profile.jsx
src/core/backend-api.jsx
src/core/onboarding.jsx
src/core/clerk-auth.jsx
MAFIKING.html
README.md
ARCHITECTURE.md
docs/project-layout.md
```

For question-bank tasks, also inspect:

```text
scripts/data/export-question-bank.js
scripts/data/import-question-bank.js
db/seeds/question-bank.json
```

For profile recommendation tasks, also inspect:

```text
data/recommendation-catalog.json
docs/product/purcell-inspired-question-bank.md
server/learning/recommendation-engine.js
tests/learning/test-recommendation-engine.js
server/ai/prompts/SOP-PROFILE-SUMMARY.md
```

For visual/UI tasks, inspect the actual rendered page in a browser after changes.

## Runtime Facts

- `server.js` binds to `0.0.0.0` and defaults to `PORT=3000`.
- `server.js` serves `dist/index.html` for app routes when the built client exists. `MAFIKING.html` is a non-production fallback.
- The Vite entry is `index.html -> src/main.jsx`; route chunks load through `src/core/route-prefetch.js`.
- The fallback `MAFIKING.html` loads Tailwind CDN, React UMD, ReactDOM UMD, Babel standalone, then `type="text/babel"` scripts.
- Frontend JSX files use global symbols and assign shared components to `window.*`.
- `src/core/app.jsx` owns route state and tweaks defaults.
- `src/core/app.jsx` must preserve `/payment?merchantOrderId=...` when syncing route state to browser history. Do not normalize payment status URLs down to `/payment`, or refresh/deep-link QRIS status will break.
- Normal package purchase must open `PaymentCheckoutModal` from `src/pages/payment.jsx` over the current page when user presses `Beli`; do not restore the old full-page checkout at `/payment`.
- If a user closes a pending QRIS/manual payment and clicks `Beli` for the same package again before expiry, reuse the existing order through `POST /api/payment/pending` instead of creating a duplicate QR/unique-code order.
- `src/core/backend-api.jsx` is the same-origin API helper.
- `src/core/clerk-auth.jsx` is the static-Babel Clerk bridge. It fetches only the public publishable key from `/api/config/clerk`, loads Clerk browser scripts, and exposes `window.MafikingClerk`.
- `src/core/onboarding.jsx` owns the mandatory non-admin profile-completion modal. It must load after `src/core/shared.jsx` and before `src/core/app.jsx`.
- `server/middleware/clerk-auth.js` maps verified Clerk Bearer tokens to local SQLite users before API routes run.
- `server/auth/clerk-user-sync.js` owns Clerk-to-local linking and guest-to-Google merge behavior.
- `/` opens the public landing for guests and redirects registered sessions to `/belajar`; `/landing` is the explicit marketing route for logged-in users.
- `Coba Gratis` routes into `Belajar` with the `Try Out` section selected.
- The `Belajar` mapel tabs use a measured sliding underline; keep `Try Out` on the ink underline color (`rgb(11 19 38)`) and subject tabs on their mapel accent colors.
- The app top nav labels are `Beranda`, `Misi Harian`, `Paket`, and `Peringkat`; `Beranda` maps to the `belajar` route, `Paket` maps to `tryout`, and `Peringkat` maps to `leaderboard`.
- `Belajar` sections are `Try Out`, `Matematika`, `Fisika`, and `Kimia`. The `Try Out` section is the free entry point.
- `src/pages/leaderboard.jsx` owns the live Peringkat page and reads overall, weekly, and per-Try-Out rankings from `/api/progress/leaderboard*`.
- `src/core/shared.jsx` owns the sliding top-nav active pill and reusable `SlidingSegmented` control. Keep those globals loaded before pages that use them.
- `src/features/admin/admin.jsx` owns the admin page. The monitoring tab is implemented by `src/features/admin/admin-monitoring.jsx`, which must load before `src/features/admin/admin.jsx` in `MAFIKING.html`.
- `src/styles.css` owns shared `.app-page-bg` variants for Belajar, Misi Harian, Paket, Peringkat, Profil, Admin Panel, and locked access gates. Keep those as background layers; do not change page flow just to alter glow colors.
- Landing media is stored in `landing_media` and served through `GET /api/landing-media`. Admin mode can replace media inline through `/api/admin/landing-media`; do not restore the removed Admin Panel `Landing Page` tab unless requested.
- Profile avatar uploads are resized in the browser to 256x256 WebP (PNG fallback) before upload. `profile-media/` is runtime state protected from `deploy.sh --delete`; do not remove that protection.
- Treat `db/database.sqlite` and `profile-media/` as a recovery pair. Run `npm run audit:profile-media` before using `-- --apply`; apply mode backs up the DB and clears only local avatar references whose files are missing.
- The startup `Cek Payment` package seed may create the package or repair its missing `tryout_id`, but must not overwrite admin-managed fields such as `price`.
- Profile `Switch account` signs out the active session and opens Login directly; it is separate from the confirmed Logout flow. Successful login routes to Beranda (`belajar`), not Profil.
- The public landing uses local reveal/pop animations in `src/pages/lobby.jsx` and `src/styles.css`. The demo video section should not have the old grid background.
- The global `Nav` is intentionally not rendered on the `practice` route; practice owns its own compact session bars/toolbars.
- The global `Nav` is also intentionally not rendered for `/payment?merchantOrderId=...`; QRIS/manual status owns a full-viewport popup overlay.
- `db/database.sqlite` is generated local runtime state.
- `db/seeds/question-bank.json` is the portable seeded question-bank source.

## Frontend Rules

Do:

- Keep route names consistent with `src/core/app.jsx`: `lobby`, `belajar`, `misi`, `tryout`, `leaderboard`, `admin`, `profile`, `invoices`, `payment`, `practice`.
- Keep Vite route-loader registration and fallback script order valid when adding frontend files.
- Export browser components/functions on `window` when they must be used by later scripts.
- Use existing utility classes, card styles, icon globals, and layout patterns.
- Keep the `practice` route free of the global top navigation unless the user explicitly asks to restore it.
- Keep the `lobby` route using its own marketing header; do not add the global app `Nav` to the public landing.
- Keep logged-out access behavior: the free Try Out confirmation and 15-question / 30-minute session can open, but protected review paths and subject chapters should route through login/sign-up.
- Keep tweaks defaults in `src/core/app.jsx` aligned with the user's selected defaults:
  - `heroLayout: "split"`
  - `density: "normal"`
  - `chapterCard: "soft"`
  - `mapelSelector: "tabs"`
  - `missionCard: "mafiking1"`

Do not:

- Break the shared global exports that let the same route components work in Vite and the Babel fallback.
- Add route components to the initial Vite shell when they can remain dynamically loaded.
- Redesign the lobby, belajar cards, mission cards, profile, or practice UI unless requested.
- Add large instructional text inside the UI just to explain features.
- Add new dependencies for simple static frontend behavior.

## Practice Page Rules

The practice page is in:

```text
src/features/practice/practice.jsx
```

Important behavior:

- `Teknik Integrasi` maps to all imported Integral subtopics with problems.
- Unsupported static chapters must show an empty state.
- Do not fallback every unknown chapter to the first backend subtopic. That bug makes unrelated chapters open Integral questions.
- Practice opens in multiple-choice mode first. Canvas is optional through `Try Canvas`.
- The multiple-choice session bar uses centered chapter switching in the format `Bab 7: Teknik Integrasi`.
- The multiple-choice question card is intentionally narrow, matching the `koreksi-jawaban` style.
- Choice actions are `Sebelumnya` on the left, `Hint` in the center, and `Lewati` or `Cek Jawaban` on the right. `Cek Jawaban` appears only after a choice is selected.
- Canvas mode has a top `Kembali` button back to the chapter list and `Try Pilgan` back to multiple choice.
- Canvas focus/fullscreen mode uses edge navigation inside the drawing toolbar: left `< sebelumnya`, right `lewati >`; labels hide on narrow screens. The middle toolbar submit button is hidden in focus mode, while the right edge button can become `Submit` after writing.
- Canvas submit posts to `POST /api/correction/evaluate`.
- After correction, progress is posted to `POST /api/progress/submit`.

When editing this area, browser-smoke at least:

1. `/ -> Coba Gratis` opens `Belajar -> Try Out`.
2. `Belajar -> Try Out -> Mulai Try Out` opens the free Try Out confirmation, then starts the 15-question / 30-minute session.
3. Logged-out protected review paths still open the login/sign-up gate.
4. `Belajar -> Matematika -> Teknik Integrasi` opens multiple-choice practice with 23 questions and a `Try Canvas` entry when the user is logged in.
5. `Belajar -> Bentuk Tak Tentu & Integral Tak Wajar` shows empty state.
6. `Belajar -> Fisika -> Kinematika` shows empty state until Fisika bank soal exists.
7. `Try Canvas` opens canvas practice, `Try Pilgan` returns to multiple choice, and focus mode keeps navigation at toolbar edges.

## Backend Rules

Backend entry:

```text
server.js
```

Route files:

```text
server/routes/auth.js
server/routes/quiz.js
server/routes/progress.js
server/routes/correction.js
server/routes/admin.js
server/routes/admin-import.js
server/routes/admin-payments.js
server/routes/payment.js
server/routes/tryouts.js
server/routes/internal.js
server/routes/auth-popup.js
server/routes/webhooks.js
```

Rules:

- Keep API responses JSON.
- Keep session auth behavior compatible with `src/core/backend-api.jsx`.
- Keep Clerk auth compatible with the existing session/local-user model. Clerk users must sync to local SQLite `users` before app features read progress, role, XP, or payments.
- Keep `/api/health` public.
- Keep `/api/config/clerk` public but never expose `CLERK_SECRET_KEY`.
- Keep `/api/webhooks/clerk` public but signature-verified with `CLERK_WEBHOOK_SIGNING_SECRET` and raw body parsing.
- Keep `/api/payment/callback` public for server-to-server callbacks.
- Keep auto-guest session behavior unless the user asks to change auth.
- Validate request payloads before calling external services.
- Keep Gemini image payload validation in `server/routes/correction.js` for MIME type and size.
- Keep rate limiting for login/register/correction.

## Database Rules

Schema source:

```text
db/schema.sql
```

Runtime DB:

```text
db/database.sqlite
```

Portable question bank:

```text
db/seeds/question-bank.json
```

Rules:

- Do not edit `db/database.sqlite` directly as source code.
- Use `db/schema.sql` for schema changes.
- If changing seeded question content, update/export `db/seeds/question-bank.json`.
- Preserve foreign key behavior and WAL mode.
- The current question bank only has real problems for Integral.
- Be careful with `npm run import:questions -- --force`; it can reset question references for existing progress/correction rows.

## API and Session Notes

- Most API routes require `req.session.userId`.
- Clerk-signed API requests can set `req.userId` and `req.session.userId` after the server verifies the Bearer token with `@clerk/express`.
- First-time or incomplete non-admin users are forced through `src/core/onboarding.jsx`; `POST /api/auth/profile-onboarding` saves name, phone, semester, faculty/major, and subject priorities. Keep this modal non-dismissible and fixed center.
- `server.js` creates a guest user for API requests that lack a session, except `/api/health`, `/api/config/clerk`, `/api/payment/callback`, `/api/landing-media`, and `/api/webhooks/clerk`.
- Admin routes require both `isAuthenticated` and `isAdmin`.
- Admin monitoring/users uses `GET /api/admin/dashboard-data`, `POST /api/admin/users/:id/reset-password`, `POST /api/admin/users/:id/grant-access`, `POST /api/admin/users/:id/role`, and `DELETE /api/admin/users/:id`. Keep those endpoints admin-only, validate user IDs/access payloads, and never allow deleting the current admin account from the panel.
- Landing media is read through `GET /api/landing-media` and admin-only inline replacement posts to `/api/admin/landing-media`; keep the removed Admin Panel `Landing Page` tab out unless requested.
- Admin content management starts with a `Try Out` / `Matematika` / `Fisika` / `Kimia` selector in the `Bab & Subtopik` tab. `Try Out` opens package CRUD; subject options open chapter/subtopic CRUD filtered by `chapters.mapel`.
- The admin shield is frontend-visible only for `currentUser.role === "admin"`; do not expose it to every user. Admin mode adds an `Admin Panel` button to the top nav, and that button navigates to the dedicated `admin` route/page.
- Logout and return-to-landing confirmation dialogs are centered modals with Mafiking yellow/ink styling, not browser confirms or blue theme popups.
- Payment checkout and QRIS/manual status dialogs are rendered through a portal from `src/pages/payment.jsx` into `document.body` so they are not clipped by the route shell or hidden under app navigation. Keep the overlay scroll-safe for browser zoom and preserve the `merchantOrderId` URL query for status/deep-link routes.
- Gemini/Gemma token usage is observational data in `ai_token_usage`, written by `server/ai/log-token-usage.js`. Logging failures must not break correction/transcription/profile AI requests.
- `server/routes/correction.js` supports up to 20 Gemini keys: `GEMINI_KEY_1` through `GEMINI_KEY_20`.
- Profile summary uses Gemma 4 31B via the Gemini API key pool and can fall back locally when keys/model calls are unavailable.
- Profile recommendations are catalog-backed and deterministic. Preserve `recommendedItems`, `recommendedQuestions`, and `skillNeedScores` in `/api/correction/profile-summary`; Gemma writes summary prose but must not choose follow-up question refs at runtime. Keep the larger local recommendation window separate from the smaller AI prompt window.
- Clerk CLI writes `.env.local`; do not read, print, or commit secret env files. `.env.local` and `env` are ignored.

## Performance & Quality Invariants (mobile perf plan, applied 2026-06-12)

These invariants prevent mobile performance regressions and ensure image / KaTeX / Clerk / auth / route-splitting quality is preserved. Measured baseline 2026-06-12 (Lighthouse 76/77, LCP 5,16s/5,22s, transfer 7,43MB landing / 750KB `/belajar`, JS ~175KB gzip). The current performance contract reports a 1.8 KB gzip initial JS entry with 9 route chunks.

### Image Optimization
- Hero images (above-fold, LCP candidates): AVIF q=70, WebP q=85.
- Default images: AVIF q=65, WebP q=80.
- Below-fold images: AVIF q=60, WebP q=75.
- All landing images served via `<picture>` with AVIF + WebP + JPEG/PNG fallback chain.
- All landing images served with 3 responsive size variants (mobile 640w, tablet 960w, desktop 1280w).
- LCP image must have `loading="lazy"` + `decoding="async"` if CSS genuinely hides it; otherwise `loading="eager"` + `fetchpriority="high"`.
- New images must pass per-asset visual review in `docs/performance/image-quality-review.md` before commit (S1).
- Responsive variants are committed to `assets/` and copied to `dist/assets/` by the `mafiking-responsive-images` Vite plugin.

### Route Splitting (Phase 2)
- **Vite path**: `src/main.jsx` statically imports only the shell (`shared.jsx`, `backend-api.jsx`, `math-loader.js`, `onboarding.jsx`, `clerk-auth.jsx`, `app.jsx`). Each route (`lobby` / `belajar` / `practice` / `misi` / `tryout` / `leaderboard` / `payment` / `profile` / `invoices`) is dynamic-imported as its own chunk.
- **Babel-standalone path** (`MAFIKING.html`): each route.jsx is loaded as a classic `<script>` and exposes `window.<Name>` at the end. The same `app.jsx` works because the lazy load falls back to `window.<Name>` when the dynamic import is not available.
- **`vite.config.js` `mafikingRouteExportPlugin`** appends `export { X };` to every route file (skipping `generated-*` and files that already export) so Vite sees them as proper ESM modules. Do NOT remove this plugin — the dynamic imports will fail without it.
- **Route prefetch**: `src/core/route-prefetch.js` owns the explicit route loader registry and cached import Promises. `src/core/app.jsx` must load routes through `window.MafikingRoutePrefetch.loadRoute()` so prefetched chunks are reused.
- **Mobile navigation intent**: primary nav buttons carry `data-route`; `pointerdown` immediately warms the exact target. Idle/hover/focus prefetch remains disabled on Save-Data or 2G and is capped at three sequential adjacent routes.
- **Adding a new route**: (1) create `src/pages/<name>.jsx` or a domain route under `src/features/`, (2) append `window.<Name> = <Name>;` at the end, (3) add it to the route regex in `vite.config.js` if not already matched, (4) add `<name>Comp` state + dynamic-import `useEffect` in `src/core/app.jsx`, (5) replace direct JSX with `React.createElement(<name>Comp || window.<Name>, props)`.
- **Removing a route**: just delete the file and its `useState`/`useEffect` in `src/core/app.jsx`. The plugin's regex matches by name so it auto-skips.
- **Adding a non-route component to a route**: do NOT add it to `src/main.jsx` (it would defeat the split). If the new component is shared, put it in `src/core/shared.jsx`; if route-specific, put it next to the route file and dynamic-import it from there.
- Per-asset quality — no universal q value. Faces need q=65-70; illustrations can drop to q=50-55.
- Responsive variants are committed to `assets/` and copied to `dist/assets/` by the `mafiking-responsive-images` Vite plugin. Do not remove the variants when removing the source PNG — the `<picture>` element still references them.

### Lazy Resource Loading
- KaTeX CSS+JS: lazy-loaded on first math component (`src/core/math-loader.js`). NOT eager in MAFIKING.html/index.html/dist/index.html. The `useKatexReady()` hook fires `mafiking:katex-ready` when the load resolves; `Eq` and `MissionQuestionText` re-render on that event.
- Clerk SDK+UI: lazy-loaded on first auth action (login click, OAuth callback, getToken for auth endpoint). NOT auto-loaded for guest public API calls. `clerkAuthHeaders()` in `src/core/backend-api.jsx` short-circuits when `window.MafikingAppState.isLoggedIn === false`.
- Mentor image and landing image: `<picture>` with `loading="lazy"` + responsive srcSet. The PNG fallback stays so legacy browsers and Safari < 16 still render.

### Performance Budgets (CI gate)
- Bundle initial: ≤175KB gzip after Phase 1, ≤120KB gzip after Phase 2 incremental splitting. **Current contract result: 1.8 KB gzip initial JS entry with 9 route chunks** — well under budget.
- LCP element: ≤100KB transferred for mobile viewport (mentor image AVIF 640w = 33KB passes).
- Total page weight (landing): ≤1.2MB.
- Main thread TBT: ≤100ms median.
- Lighthouse Performance mobile: ≥90 (when CI is wired in).
- Lighthouse Accessibility: ≥95.

### Core Web Vitals Targets (field p75)
- LCP < 2.5s on 4G mobile
- INP < 200ms
- CLS < 0.1 (target: < 0.05)
- FCP < 1.8s

### RUM Data Collection
- Table `web_vital_metrics` (db/schema.sql) captures field p75 metrics with `navigationType` and `deviceClass`.
- 30-day retention via `retention_until` column + `purgeExpiredVitals()` called every 6 hours.
- No PII, no URL query, no user ID.
- `server/observability/performance.js` exports `persistVitalsToDb`, `purgeExpiredVitals`, `summarizeVitalsFromDb`.
- `/api/performance/summary` (admin) exposes `fieldP75Last7Days` per metric.
- INP is calculated via `processingEnd - processingStart` from the `event-timing` API (not `max(event.duration)`).

### Routing Contract
- Guest membuka `/` → SPA shell, renders lobby (landing).
- Logged-in (registered, non-guest) membuka `/` → server 302 redirects to `/belajar`. No landing chunk downloaded.
- `/landing` → always renders lobby, even for logged-in users (deep link for pricing comparison / marketing re-read).
- `window.MafikingAppState.route` mirrors the SPA route for browser-side observers (CWV attribution).

### Network-Aware Behavior (progressive only, NEVER blocker)
- `navigator.connection.saveData` → OPTIONAL enhancement, not a feature gate.
- `navigator.deviceMemory < 2` → hint, not trigger to disable pages.
- `prefers-reduced-motion: reduce` → respect (existing).

### Rejected (do NOT reintroduce)
- ❌ Service Worker (assets already immutable-cached, SW adds lifecycle risk without clear need).
- ❌ `sessionStorage` currentUser/role/access cache (stale auth UI risk, no cross-tab sync).
- ❌ Universal image q value (per-asset review instead).
- ❌ Full ES-module migration (separate RFC, not in scope here).

## Documentation Rules

When changing architecture, data flow, commands, or setup:

- Update `README.md`.
- Update `ARCHITECTURE.md`.
- Update this `AGENTS.md` if future agents need a new invariant or gotcha.

Avoid documenting aspirational features as if they already exist. Mark limitations clearly.

## Validation Commands

Standard check:

```bash
npm run check
```

Useful API checks:

```bash
curl -s http://127.0.0.1:3001/api/health
curl -s http://127.0.0.1:3001/api/quiz/init
```

Useful server command when port 3000 is occupied:

```bash
PORT=3001 npm start
```

`npm run build` may print warnings about non-module scripts in `index.html`. That is expected for this static-Babel architecture as long as the command exits successfully.

## Common Mistakes To Avoid

- Treating `dist/` as the deployed app.
- Moving the practice page to a new SPA router.
- Making all Belajar cards open the first available backend question.
- Editing copied UI layout while doing backend-only work.
- Assuming all static chapters have backend question banks.
- Forgetting that React in the browser comes from CDN UMD scripts.
- Cleaning or deleting guest users without first confirming the user wants local data cleanup.

## Security Notes (Phase 0-4, ASVS L2)

Canonical security docs live under `docs/security/`:

- `baseline.md` — controls in effect, including the Phase 4 VPS section.
- `threat-model.json` — OWASP Threat Dragon 2.0 DFD (13 nodes, 12 flows,
  20 STRIDE threats). `threat-model.md` is a narrative companion only.
- `audit-2026-06.md` — OWASP API Top 10 review (findings F-1 to F-9).
- `posture.md` — monthly snapshot template.
- `phase4-summary-2026-06-03.txt` — VPS post-state from the Phase 4
  apply.
- `incident-response.md`, `secrets.md`, `llm.md`, `llm-inventory.md` —
  operational runbooks.

Open items at last review: F-10 (id coercion in `/evaluate`), F-11
(EXIF strip — `sharp` blocked on the 957 MB VPS, deferred), F-12
(per-user adaptive throttle), F-13 (ModSecurity v3 connector — Path A
source build or Path B Cloudflare-fronted), F-14 (sshd drop-in reload
waits for `mafiking-deploy` pubkey at `/root/.ssh/mafiking-deploy.pub`),
F-15 (B2 rclone config — needs `/root/.config/rclone/rclone.conf`).

## Email Verification

- Local email/password signups (`auth_provider = 'local'`) must verify the supplied email before login is allowed.
- Verification is enforced with `users.email_verified_at`; Clerk/Google users, linked Clerk users, and admins bypass it.
- Verification links are single-use, expire after 24 hours, and only the SHA-256 token hash is stored.
- Resend cooldown is 60 seconds per user; `/api/auth/resend-verification` returns generic success to avoid account enumeration.
- Outbound email is sent through `server/notifications/mailer.js` using Gmail SMTP and `mafikingsolusitpb@gmail.com`; production needs a Gmail App Password in `SMTP_PASS`.
- Local development can set `MAIL_DRY_RUN=true`; the server logs the verification URL instead of sending SMTP mail.
- The verification link is a SPA hash route: `https://mafiking.com/#verify-email?token=...`.

## GitHub Push Gotcha (workflow scope)

The default GitHub PAT used to push `main` does not have the
`workflow` scope. This blocks any push that touches
`.github/workflows/*.yml`. The workflow files (added in `fb42f58`) are
therefore NOT on `origin/main` as of 2026-06-03; they live on local
`main` and on `security/p0-baseline`. To publish them, push from a
token that has the `workflow` scope, or push via SSH. If you need to
rebuild `main` without the workflow files, the cleanest pattern is
cherry-pick each non-workflow commit, and for the workflow commit
itself use `git cherry-pick -n` + `git restore --staged .github/
workflows/` + `rm -rf .github/workflows/` + commit with a note.
