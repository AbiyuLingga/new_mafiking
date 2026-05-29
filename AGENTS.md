# AGENTS.md

Project-specific instructions for coding agents working in this repository.

## Project Identity

This project is `new_mafiking`, located at:

```text
/home/abiyulinx/computing/king/new_mafiking
```

It is a copied Mafiking web UI with added backend features. The active runtime is:

```text
Express server -> MAFIKING.html -> React UMD + Babel runtime JSX files
```

Do not assume this is a conventional bundled React/Vite app. Vite is present as a build/check tool and `index.html` mirror, but `server.js` serves `MAFIKING.html` for the real app.

## Highest-Priority Local Rules

1. Preserve the UI unless the user explicitly asks for UI changes.
2. Treat `MAFIKING.html`, `src/styles.css`, and the copied static UI files as reference-sensitive.
3. Add backend/features surgically around the current UI instead of redesigning pages.
4. Keep the frontend load model as globals loaded by `MAFIKING.html` unless the task explicitly asks for an architecture migration.
5. Verify runtime behavior through the Express server, not only through Vite build output.
6. Do not delete or reset local SQLite data unless the user explicitly asks.
7. Never revert user changes. If the worktree is dirty, inspect and work around unrelated edits.

## Required Context Before Non-Trivial Changes

Before planning or implementing non-trivial work, inspect:

```text
server.js
db/schema.sql
routes/
middleware/clerk-auth.js
lib/clerk-user-sync.js
src/app.jsx
src/belajar.jsx
src/practice.jsx
src/profile.jsx
src/backend-api.jsx
src/clerk-auth.jsx
MAFIKING.html
README.md
ARCHITECTURE.md
```

For question-bank tasks, also inspect:

```text
scripts/export-question-bank.js
scripts/import-question-bank.js
db/question-bank.json
```

For profile recommendation tasks, also inspect:

```text
data/recommendation-catalog.json
docs/purcell-inspired-question-bank.md
lib/recommendation-engine.js
lib/ai-profile-provider.js
scripts/test-recommendation-engine.js
SOP-9ROUTER-PROFILE-SUMMARY.md
```

For visual/UI tasks, inspect the actual rendered page in a browser after changes.

## Runtime Facts

- `server.js` binds to `0.0.0.0` and defaults to `PORT=3000`.
- `/`, `/index.html`, `/MAFIKING.html`, and non-API fallbacks serve `MAFIKING.html`.
- `MAFIKING.html` loads Tailwind CDN, React UMD, ReactDOM UMD, Babel standalone, then `type="text/babel"` scripts.
- `src/*.jsx` files use global symbols and assign components to `window.*`.
- `src/app.jsx` owns route state and tweaks defaults.
- `src/backend-api.jsx` is the same-origin API helper.
- `src/clerk-auth.jsx` is the static-Babel Clerk bridge. It fetches only the public publishable key from `/api/config/clerk`, loads Clerk browser scripts, and exposes `window.MafikingClerk`.
- `middleware/clerk-auth.js` maps verified Clerk Bearer tokens to local SQLite users before API routes run.
- `lib/clerk-user-sync.js` owns Clerk-to-local linking and guest-to-Google merge behavior.
- `/` intentionally opens the public landing page for guests and logged-in users. The Mafiking logo returns to that landing page from app routes.
- `Coba Gratis` routes into `Belajar` with the `Try Out` section selected.
- The app top nav labels are `Beranda`, `Misi Harian`, and `Paket`; `Beranda` maps to the `belajar` route and `Paket` maps to the `tryout` route.
- `Belajar` sections are `Try Out`, `Matematika`, `Fisika`, and `Kimia`. The `Try Out` section is the free entry point.
- `src/admin.jsx` owns the admin page. The monitoring tab is implemented by `src/admin-monitoring.jsx`, which must load before `src/admin.jsx` in `MAFIKING.html`.
- Landing media is stored in `landing_media` and served through `GET /api/landing-media`. Admin uploads for promo image, feature images, and demo video live in the Admin Panel `Landing Page` tab.
- The public landing uses local reveal/pop animations in `src/lobby.jsx` and `src/styles.css`. The demo video section should not have the old grid background.
- The global `Nav` is intentionally not rendered on the `practice` route; practice owns its own compact session bars/toolbars.
- `db/database.sqlite` is generated local runtime state.
- `db/question-bank.json` is the portable seeded question-bank source.

## Frontend Rules

Do:

- Keep route names consistent with `src/app.jsx`: `lobby`, `belajar`, `misi`, `tryout`, `admin`, `profile`, `practice`.
- Keep script order in `MAFIKING.html` valid when adding frontend files.
- Export browser components/functions on `window` when they must be used by later scripts.
- Use existing utility classes, card styles, icon globals, and layout patterns.
- Keep the `practice` route free of the global top navigation unless the user explicitly asks to restore it.
- Keep the `lobby` route using its own marketing header; do not add the global app `Nav` to the public landing.
- Keep logged-out access behavior: free Try Out multiple-choice can open, but free Try Out pembahasan/canvas review and protected subject chapters should route through login/sign-up.
- Keep tweaks defaults in `src/app.jsx` aligned with the user's selected defaults:
  - `heroLayout: "split"`
  - `density: "normal"`
  - `chapterCard: "soft"`
  - `mapelSelector: "tabs"`
  - `missionCard: "mafiking1"`

Do not:

- Introduce module imports inside static `src/*.jsx` files without changing the whole load architecture.
- Replace `MAFIKING.html` with the Vite bundle by accident.
- Redesign the lobby, belajar cards, mission cards, profile, or practice UI unless requested.
- Add large instructional text inside the UI just to explain features.
- Add new dependencies for simple static frontend behavior.

## Practice Page Rules

The practice page is in:

```text
src/practice.jsx
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
2. `Belajar -> Try Out -> Mulai Try Out` opens free multiple-choice practice.
3. Logged-out free Try Out canvas/pembahasan entry opens the login/sign-up gate.
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
routes/auth.js
routes/quiz.js
routes/progress.js
routes/correction.js
routes/admin.js
routes/payment.js
```

Rules:

- Keep API responses JSON.
- Keep session auth behavior compatible with `src/backend-api.jsx`.
- Keep Clerk auth compatible with the existing session/local-user model. Clerk users must sync to local SQLite `users` before app features read progress, role, XP, or payments.
- Keep `/api/health` public.
- Keep `/api/config/clerk` public but never expose `CLERK_SECRET_KEY`.
- Keep `/api/webhooks/clerk` public but signature-verified with `CLERK_WEBHOOK_SIGNING_SECRET` and raw body parsing.
- Keep `/api/payment/callback` public for server-to-server callbacks.
- Keep auto-guest session behavior unless the user asks to change auth.
- Validate request payloads before calling external services.
- Keep Gemini image payload validation in `routes/correction.js` for MIME type and size.
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
db/question-bank.json
```

Rules:

- Do not edit `db/database.sqlite` directly as source code.
- Use `db/schema.sql` for schema changes.
- If changing seeded question content, update/export `db/question-bank.json`.
- Preserve foreign key behavior and WAL mode.
- The current question bank only has real problems for Integral.
- Be careful with `npm run import:questions -- --force`; it can reset question references for existing progress/correction rows.

## API and Session Notes

- Most API routes require `req.session.userId`.
- Clerk-signed API requests can set `req.userId` and `req.session.userId` after the server verifies the Bearer token with `@clerk/express`.
- First-time Clerk users may need `POST /api/auth/clerk-onboard` to save a Mafiking display name and merge auto-guest data into the Google-linked account.
- `server.js` creates a guest user for API requests that lack a session, except `/api/health`, `/api/config/clerk`, `/api/payment/callback`, `/api/landing-media`, and `/api/webhooks/clerk`.
- Admin routes require both `isAuthenticated` and `isAdmin`.
- Admin monitoring/users uses `GET /api/admin/dashboard-data`, `POST /api/admin/users/:id/reset-password`, `POST /api/admin/users/:id/grant-access`, `POST /api/admin/users/:id/role`, and `DELETE /api/admin/users/:id`. Keep those endpoints admin-only, validate user IDs/access payloads, and never allow deleting the current admin account from the panel.
- Admin landing media uses `GET /api/admin/landing-media`, `POST /api/admin/landing-media`, and `DELETE /api/admin/landing-media/:slot`. Keep uploads admin-only, MIME allowlisted, and stored under `assets/landing/`.
- Admin content management starts with a `Try Out` / `Matematika` / `Fisika` / `Kimia` selector in the `Bab & Subtopik` tab. `Try Out` opens package CRUD; subject options open chapter/subtopic CRUD filtered by `chapters.mapel`.
- The admin shield is frontend-visible only for `currentUser.role === "admin"`; do not expose it to every user. Admin mode adds an `Admin Panel` button to the top nav, and that button navigates to the dedicated `admin` route/page.
- Logout and return-to-landing confirmation dialogs are centered modals with Mafiking yellow/ink styling, not browser confirms or blue theme popups.
- Gemini token usage is observational data in `ai_token_usage`, written by `lib/log-token-usage.js`. Logging failures must not break correction/transcription/profile AI requests.
- `routes/correction.js` supports up to 20 Gemini keys: `GEMINI_KEY_1` through `GEMINI_KEY_20`.
- Profile summary can fall back locally when Gemini keys are missing.
- Profile recommendations are catalog-backed and deterministic. Preserve `recommendedItems`, `recommendedQuestions`, and `skillNeedScores` in `/api/correction/profile-summary`; Gemini or 9Router can write summary prose but should not choose follow-up question refs at runtime. Keep the larger local recommendation window separate from the smaller AI prompt window.
- Clerk CLI writes `.env.local`; do not read, print, or commit secret env files. `.env.local` and `env` are ignored.

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
