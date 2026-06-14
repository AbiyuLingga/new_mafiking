# new_mafiking

`new_mafiking` is a local Mafiking web app that keeps the copied MAFIKING UI intact while adding a working Express + SQLite backend for question practice, canvas answer correction, profile reports, progress, admin data management, and payment hooks.

The active browser entry point is served by `server.js`. When `dist/index.html` exists, the server serves the Vite-built shell; otherwise, non-production falls back to `MAFIKING.html` and static JSX through React UMD + Babel. The source `src/*.jsx` files still rely on browser globals and load order, so route/components should keep the current global contract unless the frontend architecture is intentionally migrated.

## Current Status

- UI shell: copied Mafiking static UI with tweaks panel + full UX improvements.
- Practice UI: segmented control (Pilgan | Kanvas), Submit always visible in focus mode, ResultModal with wrong-step visualization, XP toast on correct answers.
- Lobby: `/` opens marketing for guests and redirects registered sessions to `/belajar`; `/landing` always opens marketing. `Coba Gratis` enters the app at `Belajar -> Try Out`, while login/sign up can redirect back into the intended app route.
- Onboarding: after first login/sign-up, non-admin users with incomplete profile data get a mandatory centered profile modal for name, optional phone, semester, faculty/major, and subject priorities. It cannot be skipped and saves through `/api/auth/profile-onboarding`. Registered users who already completed onboarding but still have no phone number get a one-time dismissible phone prompt; packages with the `bimbel` access feature require a phone number at checkout.
- Belajar: mapel selector now includes `Try Out`, `Matematika`, `Fisika`, and `Kimia`. The tabs selector uses a moving underline, with `Try Out` using the ink accent. Free users can start the free 15-question / 30-minute Try Out after a confirmation screen. The Try Out tab also shows the premium Try Out card, but only users with an active package/manual grant can open it. Submitted Try Out sessions reopen as a history/review view with the user's selected answers and the saved solution snapshot.
- Shared: global toast system (`showToast`), `Skeleton` loading states, `OfflineBanner`.
- Peringkat: app nav includes a live `Peringkat` route with overall, weekly, and per-Try-Out rankings from `/api/progress/leaderboard*`.
- Motion polish: app route transitions, the top-nav active pill, Belajar mapel underline, shared segmented controls, landing reveal effects, testimonial marquee, and mission carousel motion use local CSS/JS motion; no new frontend runtime dependency is required.
- App backgrounds: Belajar, Misi Harian, Paket, Peringkat, Profil, Admin Panel, and their locked access gates share a soft grid/glow page background with per-page color variants from `src/styles.css`.
- Paket: `Semua Paket` and `Paket Saya` render the same `PackageCard` layout; accessible packages show `Mulai`, while locked packages route through login or open the checkout popup directly. Payment flow is `Beli` → checkout popup → `POST /api/payment/create` → QRIS/manual payment popup in `src/payment.jsx`; `/payment?merchantOrderId=...` reopens the status popup without the global app nav.
- Invoice: logged-in users open `Riwayat Pembelian` from Profil. `/invoices` reads only the current user's transactions from `GET /api/payment/invoices`, can reopen pending payment status, and prints a selected invoice without exposing QR payloads or buyer email in the list response.
- Admin mode: role-gated shield toggle button (bottom-right corner). Pressing shield enables admin mode; the top nav then shows an `Admin Panel` entry that opens the full admin page. The admin page can manage Try Out packages, per-package Try Out questions/import/results, Matematika/Fisika/Kimia chapters and subtopics, users/access, and Gemini usage backend data. The Users tab has quick manual grants for premium Try Out and daily missions. On Practice page, clicking any question card in admin mode opens the inline `AdminProblemModal` to edit/delete.
- SOP: `docs/sop/SOP-AI-INPUT-SOAL.md` documents the general AI question-entry guide. `docs/sop/SOP-DEEPSEEK-IMPORT-SOAL.md` is the stricter prompt contract for admin file import via DeepSeek.
- Backend: Express 5, SQLite through `better-sqlite3`, session auth, API routes.
- Question bank: exported from `../Mafiking/db/database.sqlite` into `db/seeds/question-bank.json`.
- Imported question data at time of writing: 2 chapters, 4 subtopics, 23 problems, 86 problem steps.
- Available real practice bank: Integral only. The static Belajar UI has more chapter cards, but only `Teknik Integrasi` currently maps to real backend problems.
- Canvas correction: one submit sends a compressed JPEG canvas image to `/api/correction/evaluate-stream` with `/api/correction/evaluate` fallback. OCR + evaluation can route through the multi-provider pool (Gemini + Groq + optional OpenRouter), or direct Gemini fallback when the pool is disabled. Wrong-answer redline data is preserved through `wrongSteps` and `redlineTargets` so the result modal can redraw the user's canvas with incorrect strokes marked red. Profile summary has a local fallback when keys are missing.
- Recommendation engine: profile recommendations are deterministic from correction attempts, multiple-choice mistakes, `data/recommendation-catalog.json` (`2026-05-20.purcell-v1`), and `docs/purcell-inspired-question-bank.md`; Gemma writes the profile narrative text only. The local engine applies half-life review scoring, BKT-lite mastery estimates, KST-style frontier/review tagging, recall interleaving, and per-item evidence metadata so selected follow-up questions stay catalog-backed and auditable.

## Quick Start

```bash
cd /home/abiyulinx/computing/king/new_mafiking
npm install
cp .env.example .env
npm run import:questions
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

For another device on the same network, open the machine IP with the same port. The server binds to `0.0.0.0`.

## Environment

Create `.env` from `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP port. Defaults to `3000`. |
| `SESSION_SECRET` | Yes for real use | Express session signing secret. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Required for Clerk Google auth | Public Clerk browser key. Generated by `clerk init` into `.env.local`. Safe to expose to the browser through `/api/config/clerk`. |
| `CLERK_PUBLISHABLE_KEY` | Alternative public Clerk key | Server also accepts this name and maps it for the static browser bridge. |
| `CLERK_SECRET_KEY` | Required for Clerk Google auth | Server-only Clerk key used by `@clerk/express`. Never expose this in client code. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Required for production Clerk webhook | Secret used by `svix` to verify Clerk webhook signatures at `/api/webhooks/clerk`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Required for local email signup verification | SMTP connection settings. Gmail production uses `smtp.gmail.com`, `465`, and `true`. |
| `SMTP_USER`, `SMTP_PASS` | Required for local email signup verification | Gmail sender account and Google App Password. Do not use the normal Google account password. |
| `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_DRY_RUN` | No | Sender address, friendly sender name, and local dry-run mode. For Gmail SMTP, keep `MAIL_FROM` exactly the same as `SMTP_USER`; the mailer enforces this to avoid spoof-like From headers. |
| `PUBLIC_BASE_URL` | Required for production email links | Base URL used in verification emails, e.g. `https://mafiking.com`. |
| `GEMINI_KEY_1` ... `GEMINI_KEY_20` | Required for AI correction/profile narrative | Gemini API keys used with fallback rotation for Gemini and Gemma models. |
| `GEMINI_MODELS` | No | Comma-separated model preference for OCR/evaluation before built-in fallbacks. Defaults to Gemini 3.1 Flash Lite. |
| `GEMMA_PROFILE_MODEL` | No | Gemma model used for profile narrative. Defaults to `gemma-4-31b-it`. |
| `GEMMA_PROFILE_MODELS` | No | Comma-separated profile narrative model fallback list. Overrides `GEMMA_PROFILE_MODEL`. |
| `MAFIKING_POOL_ENABLED` | No | Enables the multi-provider AI pool. Defaults to enabled when keys exist; set `false` to use direct Gemini fallback. |
| `MAFIKING_POOL_GEMINI_WEIGHT` | No | Weighted-random Gemini share for pool calls. Defaults to `0.5`. |
| `MAFIKING_POOL_GROQ_WEIGHT` | No | Weighted-random Groq share for pool calls. Defaults to `0.3`. |
| `MAFIKING_POOL_OPENROUTER_WEIGHT` | No | Weighted-random OpenRouter share for pool calls when `OPENROUTER_API_KEY` is set. Defaults to `0.2`. |
| `MAFIKING_POOL_MAX_CONCURRENT` | No | Global AI pool concurrency limit. Defaults to `5`. |
| `MAFIKING_POOL_CACHE_TTL_MS` | No | In-memory AI response cache TTL. Defaults to `3600000`. |
| `GROQ_API_KEY` | Required for Groq pool capacity | Server-only Groq key for `meta-llama/llama-4-scout-17b-16e-instruct`. |
| `OPENROUTER_API_KEY` | Optional for OpenRouter pool capacity | Server-only OpenRouter key. If empty, the OpenRouter provider is skipped. |
| `OPENROUTER_MODEL` | No | OpenRouter model for canvas evaluation. Defaults to `google/gemma-4-31b-it:free`. |
| `MAFIKING_FAST_PATH_ENABLED` | No | Enables the answer-equivalence fast path after AI OCR/evaluation. Defaults to enabled unless set to `false`, `0`, `off`, or `no`. |
| `GEMINI_REQUEST_DAILY_LIMIT` | No | Admin monitoring request limit display per Gemini key. Defaults to `1500`. |
| `GEMINI_TOKEN_DAILY_LIMIT` | No | Admin monitoring token limit display per Gemini key. Defaults to `1000000`. |
| `DEEPSEEK_API_KEY` | Required for admin AI import | DeepSeek API key used only by the server-side admin import route. |
| `DEEPSEEK_BASE_URL` | No | DeepSeek API base URL. Defaults to `https://api.deepseek.com`. |
| `DEEPSEEK_MODEL` | No | DeepSeek chat model. Defaults to `deepseek-v4-pro`. |
| `DEEPSEEK_MAX_TOKENS` | No | Max output tokens for import JSON. Defaults to `12000`. |
| `DEEPSEEK_TIMEOUT_MS` | No | Import request timeout. Defaults to `90000`. |
| `DUITKU_MERCHANT_CODE` | Required for payments | Duitku merchant code. |
| `DUITKU_API_KEY` | Required for payments | Duitku API key. |
| `DUITKU_CALLBACK_URL` | Required for deployed payments | Payment callback URL. |
| `DUITKU_RETURN_URL` | Required for deployed payments | Browser return URL after payment. |
| `PAYMENT_PROVIDER` | Optional | `qris` by default; use `duitku` for legacy gateway or `both` for QRIS-first fallback. |
| `PAYMENT_LOCAL_GUEST_CHECKOUT` | Optional | Non-production helper for QRIS/manual/mock checkout without a registered user. Production always disables it; set `false` during local security/payment debugging. |
| `QRIS_STATIC_STRING` | Required when `PAYMENT_PROVIDER=qris` | Static QRIS merchant payload scanned from the owner QRIS. |
| `QRIS_EXPIRY_MINUTES` | Optional | Pending QR expiry window, default `20`. |
| `QRIS_ADMIN_WHATSAPP` | Optional | WhatsApp number shown on QRIS fallback confirmation. |
| `PAYMENT_WEBHOOK_SECRET` | Optional | HMAC secret for `/api/payment/reconcile/webhook`. |
| `MUTASIKU_API_KEY` | Optional | Enables polling `GET /api/v1/mutations` for CREDIT transactions. |
| `MUTASIKU_ACCOUNT_ID` | Optional | Limits Mutasiku polling to one connected account/wallet. |
| `MUTASIKU_WEBHOOK_SECRET` | Optional | Enables `/api/payment/reconcile/mutasiku-webhook` with `X-Webhook-Signature`. |
| `MUTASIKU_POLL_INTERVAL` | Optional | Mutasiku polling interval in ms, minimum `30000`, default `60000`. |

Without Gemini or Groq keys, practice pages still open, but canvas evaluation endpoints return an API-key error. With only Gemini keys, the pool can still serve via Gemini; with `MAFIKING_POOL_ENABLED=false`, correction uses the direct Gemini fallback path. The profile summary endpoint can still return a local fallback summary. Profile narrative uses Gemma through Gemini keys; catalog recommendation items still come from the local deterministic engine.

Clerk CLI setup writes `.env.local`. That file is intentionally ignored by git. The server loads `.env.local` first and then `.env`, without printing secrets. Before testing Google login, create/confirm the Clerk application, enable Google in SSO Connections, and make sure `CLERK_SECRET_KEY` plus one publishable key are present in ignored env files. For production webhooks, copy the Clerk endpoint signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`.

For profile narrative, the default model is:

```env
GEMMA_PROFILE_MODEL=gemma-4-31b-it
```

## Commands

| Command | Description |
| --- | --- |
| `npm start` | Start the Express server. |
| `PORT=3001 npm start` | Start on port 3001, useful when port 3000 is occupied. |
| `PORT=3001 MUTATION_COLLECTOR_ENABLED=false PAYMENT_LOCAL_GUEST_CHECKOUT=false MAIL_DRY_RUN=true npm start` | Debug-safe local server: no collector side effects, stricter checkout gating, and dry-run mail. |
| `npm run dev` | Start Express with `node --watch`. |
| `npm run build` | Build the Vite shell into `dist/`; when `dist/index.html` exists, `server.js` serves this shell. |
| `npm run perf:audit` | Run the local Lighthouse wrapper. Pass URL/output path explicitly for targeted audits. |
| `npm run perf:mobile-nav` | Benchmark cold/warm mobile tab transitions against a running server. |
| `npm run test:route-prefetch` | Verify route loader deduplication, network guards, and mobile intent prefetch. |
| `npm run check` | Run Node syntax checks plus focused admin-import and recommendation-engine tests. |
| `npm run test:admin-import` | Run focused tests for admin file-import validation helpers. |
| `npm run test:recommendations` | Run focused tests for skill mapping, need-score formula, Purcell-inspired parsing, and recommendation difficulty gating. |
| `npm run test:profile-summary` | Run focused tests for profile-summary attempt window splitting. |
| `npm run export:questions` | Export question tables from the old Mafiking SQLite database into `db/seeds/question-bank.json`. |
| `npm run import:questions` | Import `db/seeds/question-bank.json` into `db/database.sqlite`. |
| `npm run import:questions -- --force` | Replace question tables even if existing progress/correction rows reference old problems. |
| `npm run export:tryouts` | Export local Try Out packages/questions/steps into `db/seeds/tryout-bank.json`. |
| `npm run import:tryouts` | Import bundled Try Out data into SQLite; skips replacing a Try Out when user attempts already exist. |

## Production Deployment

Nevacloud production should run only this checkout from `/root/new_mafiking`.
The canonical PM2 process and Nginx site name is `new_mafiking`; legacy
process/site names such as `mafiking` and `new-mafiking` should be removed when
deploying so `mafiking.com` cannot accidentally point at an older app process.

`deploy.sh` does not overwrite the server database by default. Normal deploys
also preserve runtime-uploaded profile photos under `profile-media/` and skip
bundled content imports so admin/server-side content edits stay intact.
Before syncing, deploy creates a `profile-media` snapshot under
`/var/backups/mafiking/` and aborts if the avatar file count decreases.
Deploy also installs the current `ops/backup.sh` to
`/opt/mafiking-ops/backup.sh`; the script always creates a local archive and
uploads to B2 only when rclone is configured.
Treat `db/database.sqlite` and `profile-media/` as one recovery pair. Use
`npm run audit:profile-media` for a dry-run missing-file audit and add
`-- --apply` only after reviewing the report; apply mode backs up the database
before clearing broken local avatar references.
Server startup also preserves admin edits to the built-in `Cek Payment` package;
it only creates that package when missing or repairs a legacy missing ID.
It also skips OS bootstrap and `npm ci` when the server tooling and production
dependency hash have not changed. Dependency installs reuse the server npm cache.
Use `FORCE_NPM_CI=1 ./deploy.sh <ip> <user>` only when intentionally rebuilding
production dependencies.
After PM2 starts, deploy waits up to roughly one minute for `/api/health`
instead of assuming the app is ready after two seconds. Override this with
`HEALTHCHECK_ATTEMPTS` and `HEALTHCHECK_INTERVAL` when a server needs longer.
Use `DEPLOY_IMPORTS=1 ./deploy.sh <ip> <user>` only when intentionally syncing
`db/seeds/tryout-bank.json`, `db/seeds/question-bank.json`, and `db/seeds/daily-missions.json`
into production. Fresh database bootstrap and `DEPLOY_DB=1` still run imports
once to populate the initial content. Use `FORCE_IMPORT=1 npm run import:tryouts`
only when intentionally accepting replacement of Try Out questions with existing
attempt history.

## Admin Account

A local admin user is pre-created in `db/database.sqlite`:

```
Username: admin
Password: admin1234
Role:     admin
```

To create additional admin users or promote a user:

```bash
node -e "
const db = require('better-sqlite3')('./db/database.sqlite');
db.prepare(\"UPDATE users SET role = 'admin' WHERE username = ?\").run('username');
"
```

## Admin Mode (Frontend)

The admin mode toggle is visible only to users whose `role` is `admin`.

- Tap the **shield button** (⛨) at the bottom-right corner of any page to enter admin mode (button turns yellow). This does not open a popup by itself; use the top-nav `Admin Panel` button to enter the admin page.
- Tap again to exit (button returns to black). If you are on the Admin Panel page, exiting returns you to Belajar.
- While admin mode is active, the top nav shows an **Admin Panel** button. Click it to open the dedicated Admin Panel page.
- Local development bypass: in non-production, `/api/admin/*` accepts localhost requests even when the current session is only an auto-guest. Set `LOCAL_ADMIN_MODE=false` to force real admin login again.
- `Users & Token Monitoring` is implemented by `src/admin-monitoring.jsx` and reads backend data from `/api/admin/dashboard-data`.
- `Bab & Subtopik` starts with a content selector: `Try Out`, `Matematika`, `Fisika`, or `Kimia`. Try Out opens package CRUD; the subject options open chapter/subtopic CRUD.
- The old `Landing Page` tab is removed from Admin Panel. Admin mode can still replace landing media inline through `Ganti gambar` / `Ganti video`, backed by `/api/landing-media` and `/api/admin/landing-media`.

**What changes in admin mode:**

| Page | Admin behavior |
| --- | --- |
| Belajar | Chapter list replaced by `AdminBelajarView`: DB-wired CRUD — each chapter has ✏ Edit and ✕ Delete buttons, plus a "+ Tambah Bab Baru" row at bottom. Chapter form fields: title, mapel (Matematika/Fisika/Kimia), semester (1/2), garis besar isi (topics), estimated time, sort order. Changes persist to DB via `/api/admin/chapters`. |
| Practice | A compact `Admin Soal` card deck appears above the question: drag short question cards to reorder, click a card to jump to it, use `+ Soal` to add, and `Hapus` to delete the active question. Clicking any question card (title area) still opens inline editing for question text and choices, while the Admin Panel page can edit full problem details and solution steps. |

### Admin AI Import

The Admin Panel page has an `Import AI` tab for bulk question entry:

1. Choose the destination subtopic.
2. Upload a PDF, DOCX, TXT, or MD file.
3. Pick the import mode:
   - `AI lengkap`: DeepSeek creates answer keys, options, and explanations.
   - `Hybrid`: admin supplies answer keys, DeepSeek creates options and explanations.
   - `Manual`: DeepSeek only splits/cleans questions; admin fills answers/options in the preview.
4. Review and edit the draft cards.
5. Click `Import ke List Soal` to insert the questions and steps into SQLite.

The upload route is admin-only, keeps the file in memory, limits files to 10MB, and allowlists only PDF, DOCX, TXT, and MD.

## Question Bank Workflow

Default export source:

```text
/home/abiyulinx/computing/king/Mafiking/db/database.sqlite
```

Export from another database:

```bash
SOURCE_DB=/path/to/database.sqlite OUTPUT=db/seeds/question-bank.json npm run export:questions
```

Import into another target database:

```bash
INPUT=db/seeds/question-bank.json TARGET_DB=db/database.sqlite npm run import:questions
```

The import script refuses to replace question tables when user progress or correction attempts reference existing problems. Use `--force` only when intentionally resetting those references.

## Project Structure

```text
.
|-- MAFIKING.html              # Legacy fallback shell for non-production without dist/
|-- index.html                 # Vite HTML entry used by npm run build
|-- server.js                  # Express app, SQLite boot, middleware, static serving
|-- db/
|   |-- schema.sql             # SQLite schema
|   |-- question-bank.json     # Exported question bank
|   `-- database.sqlite        # Local runtime DB (NOT db/mafiking.db)
|-- data/
|   `-- recommendation-catalog.json # Versioned skill aliases, prerequisites, scoring weights, difficulty policy
|-- docs/
|   `-- purcell-inspired-question-bank.md # Original Purcell-aligned reference questions for recommendations
|-- lib/
|   |-- admin-import.js        # Admin import normalization and DeepSeek helper logic
|   |-- clerk-user-sync.js     # Clerk user -> local SQLite user sync and guest merge helpers
|   |-- gemini-client.js       # Pool-compatible Gemini client
|   |-- groq-client.js         # Pool-compatible Groq vision client
|   |-- log-token-usage.js     # Non-blocking AI token usage logger
|   |-- multi-provider-pool.js # AI provider routing, cache, queue, fallback
|   `-- recommendation-engine.js # Deterministic weakness scoring and follow-up question picker
|-- server/ai/prompts/SOP-PROFILE-SUMMARY.md # Required profile narrative prompt for Gemma
|-- server/routes/
|   |-- auth.js                # Register, login, logout, current user
|   |-- webhooks.js            # Clerk webhook verification and user-created sync
|   |-- quiz.js                # Chapters, subtopics, problems, full quiz payload
|   |-- progress.js            # XP, streaks, progress, leaderboard
|   |-- correction.js          # Gemini transcription/evaluation and Gemma profile summary
|   |-- admin.js               # Admin CRUD for content/users
|   |-- admin-import.js        # Admin DeepSeek draft/commit import from PDF/DOCX/TXT/MD
|   `-- payment.js             # QRIS/manual/Duitku payment create/status/reconciliation
|-- server/middleware/
|   |-- auth.js
|   |-- clerk-auth.js          # Dual auth bridge from Clerk Bearer token to local req/session user
|   `-- admin.js
|-- scripts/
|   |-- test-admin-import.js   # Focused tests for admin import helpers
|   |-- test-recommendation-engine.js
|   |-- export-question-bank.js
|   `-- import-question-bank.js
|-- src/
|   |-- app.jsx                # Router, isAdmin toggle state, shield button, root render
|   |-- shared.jsx             # Nav, footer, icons, Skeleton, showToast, ToastContainer, OfflineBanner
|   |-- clerk-auth.jsx         # ClerkJS browser bridge for static Babel runtime
|   |-- backend-api.jsx        # Fetch helper for same-origin API calls
|   |-- onboarding.jsx         # Mandatory first-login profile completion modal
|   |-- lobby.jsx              # Public landing + login/signup screen using the existing auth shell
|   |-- belajar.jsx            # Try Out tab + static chapter cards; admin branch to AdminBelajarView
|   |-- practice.jsx           # Practice route: ChoiceView, CanvasView, ModeSegment, ResultModal
|   |-- toolbar.jsx            # Canvas drawing toolbar and focus-mode actions
|   |-- drawing-canvas.jsx     # Low-level canvas drawing surface
|   |-- answer-board.jsx       # Stylus answer board wrapper
|   |-- profile.jsx            # Profile/report view
|   |-- misi.jsx               # Daily mission screen
|   |-- tryout.jsx             # Paket / paid tryout package screen
|   |-- leaderboard.jsx        # Peringkat page with isolated-scroll leaderboard
|   |-- payment.jsx            # Checkout popup + QRIS/manual popup + status polling
|   |-- admin.jsx              # Admin UI: content CRUD, users, import, and monitoring tab shell
|   `-- styles.css             # All CSS including admin styles appended at end
|-- tweaks-panel.jsx
|-- vite.config.js
|-- tailwind.config.js
`-- package.json
```

## User Flows

### App Load

1. Browser opens `/`.
2. `server.js` sends `dist/index.html` when the built client exists, or `MAFIKING.html` as a non-production fallback.
3. In the built path, `src/main.jsx` exposes `window.React` / `window.ReactDOM` and loads the global shell modules in legacy order before `src/app.jsx` mounts.
4. In the fallback path, `MAFIKING.html` loads Tailwind CDN, React UMD, Babel standalone, then JSX files from `src/` in order.

### Lobby / Home

- Everyone opening `/` sees the `Landing` component.
- The Mafiking logo returns to this landing page from app routes.
- `Coba Gratis` opens `Belajar` with the `Try Out` tab selected. If the user is already logged in, the same button continues into their account context.
- The login screen uses the existing auth UI. Email/password sign up asks for email and password, then requires the user to click a verification link sent by email before login is allowed.
- The auth screen also includes Clerk Google login/sign-up controls. Clerk is loaded through `src/clerk-auth.jsx`, using `/api/config/clerk` to fetch only the publishable key.
- Clerk users are synced into local SQLite users on API requests through `@clerk/express`; the local `users.id` remains the source of truth for progress, XP, admin role, and payments.
- First-time Google users are synced into the local account model, then incomplete non-admin profiles are completed through the mandatory modal in `src/onboarding.jsx`.
- The profile modal stores draft progress in localStorage, stays fixed in the center of the viewport, and saves through `POST /api/auth/profile-onboarding`. Admin users are exempt.

### Belajar / Free Entry

- The `Belajar` mapel selector is `Try Out`, `Matematika`, `Fisika`, `Kimia`.
- The `Try Out` tab exposes the free tryout entry point plus a premium Try Out entry point.
- Free users open a confirmation screen before starting the free 15-question / 30-minute Try Out session. Premium Try Out opens only for users with a matching paid package/manual access grant or admin role.
- Pembahasan/canvas review outside the free Try Out session requires login or sign up.
- Clicking protected subject chapters such as Matematika Integral while logged out opens the login/sign-up gate, then returns to the intended chapter.
- `Misi Harian`, profile history, and premium learning areas show a package/access gate when the user does not have access.
- The top nav uses `Beranda` for the app belajar home and `Paket` for package selection; there is no separate `Belajar` nav item.

### Opening a Chapter

1. User opens `Belajar`.
2. `src/belajar.jsx` sends the selected card context into the `practice` route.
3. `src/practice.jsx` calls `/api/quiz/init`.
4. `chooseQuestionSource()` maps only supported static chapters to real backend questions.
5. `Teknik Integrasi` loads all Integral subtopics with problems and starts in multiple-choice mode.
6. Unsupported chapters show an empty-state message with a "Pilih bab lain" CTA.

### Practice Modes

- The global top navigation is hidden on the `practice` route.
- **Pilgan (multiple choice)** is the default mode. A `ModeSegment` control (Pilgan | Kanvas) in the session bar lets users switch modes.
- **Canvas mode:** user writes on the canvas; Submit button is always visible but disabled until the canvas is dirty (`boardDirty = true`).
- After submitting, a `ResultModal` shows score badge, detected text, and wrong-step list with colored badges.
- Correct answers trigger a "+10 XP" toast; level-up is shown via toast.

### Canvas Correction

1. User enters canvas mode via `ModeSegment`.
2. User writes on the canvas in `src/practice.jsx` / `src/answer-board.jsx`.
3. Submit exports the canvas image as WEBP data URL.
4. Frontend posts once to `POST /api/correction/evaluate`; the old `/api/correction/transcribe` route remains for compatibility and is marked deprecated.
5. Backend validates image size/type, calls the multi-provider pool for merged OCR + evaluation when enabled, logs successful token usage in `ai_token_usage`, normalizes the JSON response, stores a row in `correction_attempts`, then returns feedback.
6. Frontend shows the ResultModal and posts progress to `POST /api/progress/submit`.

### Profile Report

1. `src/profile.jsx` loads `/api/auth/me`, `/api/progress/stats`, and `/api/correction/attempts`.
2. It posts attempts to `/api/correction/profile-summary`.
3. Backend computes deterministic skill need scores from up to 200 recent canvas correction attempts using wrong frequency, recency, low score, attempt pressure, and prerequisite gap.
4. Backend adds recent multiple-choice evidence from `practice_attempts` so the narrative can mention repeated wrong subtopics, difficulty, selected answer, and correct answer.
5. If the AI narrative cooldown allows it, backend sends only the 20 newest correction attempts plus summarized multiple-choice evidence to Gemma 4 31B.
6. Normal users can refresh the AI narrative at most once per hour; admin user `123` with password `135` bypasses this cooldown.
7. Backend returns `recommendedItems` from the Purcell-aligned local bank, `skillNeedScores` for debugging/explainability, and `recommendedQuestions` as a backward-compatible string list.

### Payment

1. User presses `Beli` from a locked package; `src/app.jsx` intercepts the payment route intent and opens `PaymentCheckoutModal` instead of navigating to a checkout page.
2. `GET /api/payment/config` determines whether QRIS/manual/Duitku is active.
3. Pressing `Bayar Sekarang` first checks `POST /api/payment/pending` for an unexpired pending order for the same package.
4. If a pending QRIS/manual order exists, the old QR/payment popup is reopened with the remaining countdown; otherwise the frontend posts to `POST /api/payment/create`.
5. QRIS/manual responses render as a centered payment popup via `ReactDOM.createPortal`, so the overlay is mounted at `document.body` instead of inside the app shell.
6. The URL is updated to `/payment?merchantOrderId=X`; `src/app.jsx` preserves that query during history sync and hides the global `Nav` while the payment status popup is active.
7. Status is polled every 5s from `GET /api/payment/status/:merchantOrderId`.
8. Duitku remains available for legacy/fallback provider modes that return `paymentUrl`; QRIS/local/manual payments stay in-app.
9. Shows pending / success / failed/timeout states.
10. Logged-in users can open `/invoices` from Profil to view their own payment history, continue a pending payment, or print an invoice.

## API Overview

Most API routes require either a local session or a verified Clerk Bearer token. If an API request has neither, `server.js` creates an auto-guest user before routing, except for public/config/callback endpoints such as `/api/health`, `/api/config/clerk`, `/api/landing-media`, `/api/webhooks/clerk`, and `/api/payment/callback`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service and question counts. |
| `GET` | `/api/config/clerk` | Public Clerk config; returns only whether Clerk is enabled and the publishable key. |
| `POST` | `/api/auth/register` | Create user and session. |
| `POST` | `/api/auth/login` | Login with rate limiting and per-username lockout. |
| `POST` | `/api/auth/logout` | Destroy session. |
| `POST` | `/api/auth/clerk-onboard` | Save display name and merge guest data after first Google sign-in. |
| `POST` | `/api/auth/profile-onboarding` | Save mandatory first-login profile data: name, phone, semester, faculty/major, and subject priorities. |
| `POST` | `/api/auth/phone-number` | Save only the logged-in user's WhatsApp/phone number for the optional phone prompt or bimbel checkout requirement. |
| `GET` | `/api/auth/me` | Current user profile. |
| `POST` | `/api/webhooks/clerk` | Clerk webhook, verified with `CLERK_WEBHOOK_SIGNING_SECRET`, for user-created sync. |
| `GET` | `/api/quiz/init` | Chapters, subtopics, and problem counts. |
| `GET` | `/api/quiz/subtopics/:id/full` | Subtopic with full problems and steps. |
| `POST` | `/api/progress/submit` | Save correctness, XP, level, streak, and return updated progress metadata. |
| `GET` | `/api/progress/stats` | Current user's real XP, level, daily streak, mastery, and progress toward the next level. |
| `GET` | `/api/correction/attempts` | Recent correction attempts. |
| `POST` | `/api/correction/transcribe` | Deprecated compatibility route for OCR-only canvas image transcription. |
| `POST` | `/api/correction/evaluate` | Evaluate answer and store attempt; image-only canvas submissions run merged OCR + evaluation in one request. |
| `POST` | `/api/correction/profile-summary` | Generate or fallback profile summary. |
| `GET` | `/api/correction/pool/stats` | Admin/local-admin read-only AI pool counters. |
| `GET` | `/api/tryouts/:tryoutId/full` | Load one Try Out package/question bank with solution steps. |
| `GET` | `/api/progress/tryout-attempts/latest` | Load the current registered user's latest attempt for one Try Out. |
| `POST` | `/api/progress/tryout-attempts` | Submit a registered user's Try Out answers; rejects duplicate submissions until admin reset. |
| `GET/POST` | `/api/admin/chapters` | List or create chapters (admin only). |
| `PUT/DELETE` | `/api/admin/chapters/:id` | Update or delete chapter (admin only). |
| `GET/POST` | `/api/admin/subtopics` | List or create subtopics (admin only). |
| `PUT/DELETE` | `/api/admin/subtopics/:id` | Update or delete subtopic (admin only). |
| `GET/POST` | `/api/admin/problems` | List or create problems (admin only). |
| `PUT/DELETE` | `/api/admin/problems/:id` | Update or delete problem (admin only). |
| `GET/POST` | `/api/admin/problems/:id/steps` | List or create steps (admin only). |
| `PUT/DELETE` | `/api/admin/steps/:id` | Update or delete step (admin only). |
| `GET/POST/PUT/DELETE` | `/api/admin/tryout-packages` | Manage Try Out package cards (admin only). |
| `GET/POST/PUT/DELETE` | `/api/admin/tryout-questions` | Manage per-package Try Out questions (admin only). |
| `GET/POST` | `/api/admin/tryout-questions/:id/steps` | List or create Try Out solution steps (admin only). |
| `PUT/DELETE` | `/api/admin/tryout-question-steps/:id` | Update or delete Try Out solution steps (admin only). |
| `GET` | `/api/admin/tryout-attempts` | List submitted Try Out scores for one package (admin only). |
| `DELETE` | `/api/admin/tryout-attempts/:id` | Delete one Try Out attempt so the user can retake it (admin only). |
| `GET` | `/api/admin/users` | List users (admin only). |
| `PUT` | `/api/admin/users/:id/password` | Reset user password (admin only). |
| `GET` | `/api/admin/dashboard-data` | Combined user/access and Gemini usage dashboard data (admin only). |
| `POST` | `/api/admin/users/:id/reset-password` | Reset a user password to `123456` (admin only). |
| `POST` | `/api/admin/users/:id/grant-access` | Add a manual user access grant (admin only). |
| `DELETE` | `/api/admin/users/:id/access-grants/:grantId` | Revoke one existing manual user access grant (admin only). |
| `POST` | `/api/admin/users/:id/role` | Promote or demote Admin Panel access by setting user role (admin only). |
| `DELETE` | `/api/admin/users/:id` | Delete a non-admin user account (admin only; self/admin deletion is blocked). |
| `POST` | `/api/admin/import/draft` | Upload file and ask DeepSeek for a reviewable import draft for a subtopic or Try Out package (admin only). |
| `POST` | `/api/admin/import/commit` | Insert reviewed draft questions and steps into SQLite for a subtopic or Try Out package (admin only). |
| `POST` | `/api/payment/pending` | Reopen unexpired pending QRIS/manual order for the same package. |
| `POST` | `/api/payment/create` | Create QRIS/manual/Duitku payment. |
| `GET` | `/api/payment/status/:merchantOrderId` | Check payment status. |
| `POST` | `/api/payment/callback` | Duitku server callback. |

## Security Posture

Mafiking targets **OWASP ASVS Level 2** on a Nevacloud VPS at
`202.155.94.210` (Ubuntu 22.04, domain `mafiking.com`). The current
posture is the result of Phases 0–4 of a structured hardening roadmap:

- **Application layer:** `helmet` with a tight CSP (no broad `https:`,
  Clerk-derived allowlist, `frame-ancestors 'none'`, `object-src 'none'`),
  `csrf-csrf` double-submit CSRF with `__Host-mafiking.csrf-token` in
  production, custom SQLite session store with `__Host-mafiking.sid`
  cookies, NDJSON audit log, and `express-rate-limit` on auth,
  correction, performance, and payment endpoints.
- **Frontend scan:** `scripts/security/scan-xss-patterns.js` (8 hits, all routed
  through known-safe helpers), `scripts/security/discover-shadow-routes.js`
  (93/93 reconciled), `scripts/security/scan-npm-typosquats.js` (28 deps clean).
- **CI:** `.github/workflows/security.yml` (npm-audit, CycloneDX SBOM,
  semgrep, TruffleHog, contract tests) on push to `main`, every PR, and
  weekly Sunday 02:00 UTC. `.github/workflows/dast.yml` runs a weekly
  ZAP baseline scan.
- **VPS / edge:** TLS 1.2/1.3 only, HSTS preload (`max-age=63072000;
  includeSubDomains; preload`), per-route nginx rate-limit zones, 4
  fail2ban jails, 29 auditd rules, CIS Ubuntu 22.04 L1 sysctl + PAM,
  app running as the `mafiking` system user at `/opt/mafiking`.

Canonical security docs:

- `docs/security/baseline.md` — ASVS L2 controls, including the
  Phase 4 VPS section.
- `docs/security/threat-model.json` — OWASP Threat Dragon 2.0 DFD
  (13 nodes, 12 flows, 20 STRIDE threats).
- `docs/security/audit-2026-06.md` — OWASP API Top 10 review.
- `docs/security/posture.md` — monthly snapshot (last verified
  2026-06-03).
- `docs/security/phase4-summary-2026-06-03.txt` — VPS post-state.
- `docs/security/incident-response.md` — NIST 800-61r2-aligned runbook.
- `docs/security/secrets.md` — rotation runbook.

Open items (tracked in `posture.md` § 8): ModSecurity v3 connector
(deferred — Path A build or Path B Cloudflare), sshd drop-in reload
(waits for `mafiking-deploy` pubkey), B2 rclone config (waits for
owner), F-10 / F-11 / F-12 LLM-side follow-ups.

## Development Notes

- Preserve the copied UI unless a task explicitly asks for UI changes.
- Do not convert route/component `src/*.jsx` files to normal module-import architecture casually. The built path uses `src/main.jsx` as a compatibility bootstrap, while the source files still rely on globals and legacy load order.
- **Do not use IIFE `(function(){...})()`** in `src/*.jsx` files — variables inside are scoped and invisible to other scripts. Define components at top level.
- Clerk auth is integrated through the browser-global bridge in `src/clerk-auth.jsx`, not `@clerk/react` components. Both the Vite-built app and legacy fallback load Clerk's browser scripts dynamically.
- `src/app.jsx` owns route state, tweaks defaults, and `isAdmin` toggle.
- `src/app.jsx` intentionally does not render the global `Nav` while `route === "practice"` or while `/payment?merchantOrderId=...` is showing payment status.
- `src/shared.jsx` owns the sliding top-nav active pill and reusable `SlidingSegmented` control used by Paket and Peringkat.
- `src/styles.css` owns the shared `.app-page-bg` grid/glow background variants used by Belajar, Misi Harian, Paket, Peringkat, Profil, Admin Panel, and locked access gates.
- `src/leaderboard.jsx` reads live overall, weekly, and per-Try-Out ranking data from `/api/progress/leaderboard*`.
- `src/belajar.jsx` loads chapter data from `/api/quiz/init` on mount and maps DB rows to display cards. `window.chapterData` is set here for use by practice.jsx. Static fallback is used while loading.
- Admin mode in `belajar.jsx` shows `AdminBelajarView` — API-wired CRUD that persists to DB. Admin mode in `practice.jsx` enables inline click-to-edit on question cards and a compact admin question control for add/delete/reorder; `AdminPracticeBar` (separate bar) has been removed.
- `server.js` applies SQLite schema on startup and includes inline migrations for older local DBs.
- Correct DB file is `db/database.sqlite`. The file `db/mafiking.db` is unused/empty.
- `npm run build` can print Vite warnings about non-module scripts. That is expected for the current static-Babel architecture as long as the command exits successfully.

## Verification

Run the standard check after code or documentation changes:

```bash
npm run check
```

Useful manual smoke checks:

```bash
curl -s http://127.0.0.1:3000/api/health
curl -s http://127.0.0.1:3000/api/quiz/init
```

Browser checks:

- Open `/` - public landing loads for both guests and logged-in users.
- Click `Coba Gratis` - app opens `Belajar` with the `Try Out` tab selected.
- Click the Mafiking logo from an app route - returns to the public landing page.
- From `Belajar -> Matematika`, click `Integral` while logged out - login/sign-up gate opens.
- From `Belajar -> Try Out`, click `Mulai Try Out` - the Try Out confirmation opens; starting it enters the free 15-question / 30-minute session.
- Log in as an admin; shield button appears at bottom-right. Pressing it turns yellow and adds `Admin Panel` to the top nav.
- Click `Admin Panel`, open `Pengguna` or `Users & Token Monitoring`, and confirm user/access data plus quick manual grant/revoke controls render.
- Open `Belajar` in admin mode — numbered chapter list with ✏/✕ buttons; "+ Tambah Bab Baru" row at bottom. Changes persist to DB.
- Open `Belajar` in normal mode — chapter cards render normally (no admin buttons).
- Click `Teknik Integrasi` → practice opens with 23 questions in Pilgan mode.
- In practice admin mode, confirm the `Admin Soal` card deck appears with short question cards, `+ Soal`, and `Hapus`; drag a card over another card to reorder, then hover/click a question title to edit the question inline.
- `ModeSegment` (Pilgan | Kanvas) in session bar switches modes.
- In Kanvas mode, Submit button is visible but disabled until drawing; after drawing it becomes active.
- Submit correct answer → "+10 XP" toast appears.
- Click an unsupported chapter → empty state with "Pilih bab lain" button.
- Open profile from nav.
- In profile, confirm "Rekomendasi Soal Latihan" can show catalog refs, difficulty, Purcell reference, target skill, and recommendation reason when correction attempts contain mapped weakness tags.
- Press `Beli` on a locked package → checkout popup opens without navigating to `/payment`; pressing `Bayar Sekarang` creates an order and opens the QRIS/manual status popup directly. Refreshing `/payment?merchantOrderId=...` must keep the order query, hide the global nav, and show the popup without clipping the QR.

## Known Gotchas

- Active runtime is Express serving `dist/index.html` when it exists, with `MAFIKING.html` as the non-production fallback.
- Both delivery paths use React 18 UMD globals before the legacy-style JSX modules run; the built path loads them from `src/main.jsx` before bootstrapping route modules. Check which shell the server is serving before debugging frontend runtime issues.
- Clerk secret values live in ignored env files. Do not print or commit `.env`, `.env.local`, or `env`.
- Auto-guest sessions create users for API requests. Guest names start with `Tamu_`.
- Only Integral question data is currently imported. Static chapter cards for other subjects are placeholders.
- Admin shield visibility is role-gated in the frontend, and admin APIs remain protected by backend middleware. Local development still has localhost admin API bypass unless `LOCAL_ADMIN_MODE=false`.
- `src/admin-monitoring.jsx` must load before `src/admin.jsx` because it exports `window.AdminMonitoringPanel`.
- Gemini/Gemma token "remaining" values are monitoring estimates from configured daily limits, not a live Google quota lookup.
- QRIS is the default payment provider; Duitku routes remain as legacy/fallback provider code and point at sandbox base URL unless deliberately configured. Review payment environment, QRIS static string, reconciliation secrets, and any Duitku base URL before production use.
- Before production deploy with `DEPLOY_IMPORTS=1`, confirm bundled JSON contains the intended content and run the import against a temporary DB if the bank changed.
- `db/mafiking.db` exists but is the wrong file — use `db/database.sqlite`.
