# new_mafiking

`new_mafiking` is a local Mafiking web app that keeps the copied MAFIKING UI intact while adding a working Express + SQLite backend for question practice, canvas answer correction, profile reports, progress, admin data management, and payment hooks.

The active browser entry point is `MAFIKING.html`, served by `server.js`. The frontend is intentionally loaded as static JSX through React UMD + Babel in the browser, so do not treat this project as a normal bundled Vite SPA unless that architecture is intentionally changed.

## Current Status

- UI shell: copied Mafiking static UI with tweaks panel + full UX improvements.
- Practice UI: segmented control (Pilgan | Kanvas), Submit always visible in focus mode, ResultModal with wrong-step visualization, XP toast on correct answers.
- Lobby: auto-splits into `Landing` (marketing, for guest/`Tamu_*` users) vs `Dashboard` (logged-in users with greeting, continue card, progress stats).
- Shared: global toast system (`showToast`), `Skeleton` loading states, `OfflineBanner`.
- Payment: package selection → Duitku redirect → status polling page (`src/payment.jsx`).
- Admin mode: shield toggle button (bottom-right corner). Pressing shield **auto-opens `AdminPanel`** (full CRUD modal). On Belajar page shows `AdminBelajarView` with DB-wired chapter CRUD (mapel, semester, description, topics per chapter). On Practice page, clicking any question card in admin mode opens the inline `AdminProblemModal` to edit/delete; a floating `+` FAB adds new questions.
- SOP: `SOP-AI-INPUT-SOAL.md` documents the general AI question-entry guide. `SOP-DEEPSEEK-IMPORT-SOAL.md` is the stricter prompt contract for admin file import via DeepSeek.
- Backend: Express 5, SQLite through `better-sqlite3`, session auth, API routes.
- Question bank: exported from `../Mafiking/db/database.sqlite` into `db/question-bank.json`.
- Imported question data at time of writing: 2 chapters, 4 subtopics, 23 problems, 86 problem steps.
- Available real practice bank: Integral only. The static Belajar UI has more chapter cards, but only `Teknik Integrasi` currently maps to real backend problems.
- Canvas correction: calls Gemini when `GEMINI_KEY_1` or later keys are configured; profile summary has a fallback when keys are missing.
- Recommendation engine: profile recommendations are deterministic from correction attempts plus `data/recommendation-catalog.json` (`2026-05-20.purcell-v1`) and `docs/purcell-inspired-question-bank.md`; Gemini may write the report text, but the selected follow-up questions come from the local engine.

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
| `GEMINI_KEY_1` ... `GEMINI_KEY_20` | Required for AI correction | Gemini API keys used with fallback rotation. |
| `GEMINI_MODELS` | No | Comma-separated model preference before built-in fallbacks. |
| `AI_PROFILE_PROVIDER` | No | `gemini` by default. Set `9router` to use 9Router only for profile narrative text. |
| `NINEROUTER_BASE_URL` | Required if `AI_PROFILE_PROVIDER=9router` | 9Router OpenAI-compatible base URL, usually `http://127.0.0.1:20128/v1`. |
| `NINEROUTER_API_KEY` | Required if `AI_PROFILE_PROVIDER=9router` | API key copied from the 9Router dashboard. Server-side only. |
| `NINEROUTER_MODEL` | No | 9Router fallback model for profile narrative when `NINEROUTER_MODELS` is not set. |
| `NINEROUTER_MODELS` | No | Comma-separated allowlist for round-robin. Use only models that pass smoke tests. Overrides `NINEROUTER_MODEL`. |
| `NINEROUTER_MAX_TOKENS` | No | Max output tokens for profile narrative. Defaults to `1200`. |
| `NINEROUTER_TIMEOUT_MS` | No | Timeout for profile narrative. Defaults to `60000`. |
| `DEEPSEEK_API_KEY` | Required for admin AI import | DeepSeek API key used only by the server-side admin import route. |
| `DEEPSEEK_BASE_URL` | No | DeepSeek API base URL. Defaults to `https://api.deepseek.com`. |
| `DEEPSEEK_MODEL` | No | DeepSeek chat model. Defaults to `deepseek-v4-pro`. |
| `DEEPSEEK_MAX_TOKENS` | No | Max output tokens for import JSON. Defaults to `12000`. |
| `DEEPSEEK_TIMEOUT_MS` | No | Import request timeout. Defaults to `90000`. |
| `DUITKU_MERCHANT_CODE` | Required for payments | Duitku merchant code. |
| `DUITKU_API_KEY` | Required for payments | Duitku API key. |
| `DUITKU_CALLBACK_URL` | Required for deployed payments | Payment callback URL. |
| `DUITKU_RETURN_URL` | Required for deployed payments | Browser return URL after payment. |

Without Gemini keys, practice pages still open, but canvas evaluation endpoints return an API-key error. The profile summary endpoint can still return a local fallback summary. If `AI_PROFILE_PROVIDER=9router`, only profile narrative text uses 9Router; catalog recommendation items still come from the local deterministic engine.

For 9Router model rotation, prefer a tested allowlist:

```env
AI_PROFILE_PROVIDER=9router
NINEROUTER_MODEL=kr/claude-haiku-4.5
NINEROUTER_MODELS=kr/auto,kr/claude-haiku-4.5,kr/deepseek-3.2,kr/qwen3-coder-next,kr/glm-5,kr/minimax-m2.5,kr/minimax-m2.1,ag/gemini-3-flash
```

`auto` is supported and fetches `GET /v1/models`, but it can hit providers with invalid tokens or unsuitable models. Use `NINEROUTER_MODELS` for production so profile summaries only rotate through verified working models.

## Commands

| Command | Description |
| --- | --- |
| `npm start` | Start the Express server. |
| `PORT=3001 npm start` | Start on port 3001, useful when port 3000 is occupied. |
| `npm run dev` | Start Express with `node --watch`. |
| `npm run build` | Run Vite build against `index.html`. This is a build check, not the active runtime path. |
| `npm run check` | Run Node syntax checks plus focused admin-import and recommendation-engine tests. |
| `npm run test:admin-import` | Run focused tests for admin file-import validation helpers. |
| `npm run test:recommendations` | Run focused tests for skill mapping, need-score formula, Purcell-inspired parsing, and recommendation difficulty gating. |
| `npm run test:profile-summary` | Run focused tests for profile-summary attempt window splitting. |
| `npm run test:ai-profile` | Run focused tests for the 9Router/OpenAI-compatible profile provider adapter. |
| `npm run export:questions` | Export question tables from the old Mafiking SQLite database into `db/question-bank.json`. |
| `npm run import:questions` | Import `db/question-bank.json` into `db/database.sqlite`. |
| `npm run import:questions -- --force` | Replace question tables even if existing progress/correction rows reference old problems. |

## Production Deployment

Nevacloud production should run only this checkout from `/root/new_mafiking`.
The canonical PM2 process and Nginx site name is `new_mafiking`; legacy
process/site names such as `mafiking` and `new-mafiking` should be removed when
deploying so `mafiking.com` cannot accidentally point at an older app process.

Deploy from Linux, WSL, or Git Bash:

```bash
./deploy.sh 202.155.94.210 root
```

Deploy from Windows PowerShell:

```powershell
.\deploy.ps1 202.155.94.210 root
```

`deploy.ps1` is a wrapper that runs the same `deploy.sh` through WSL first, then
Git Bash if WSL is unavailable. The Bash environment must have `ssh`, `rsync`,
and `npm`.

If PowerShell blocks local scripts, run it with a one-time execution-policy
bypass:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 202.155.94.210 root
```

To overwrite the server database during deploy, set `DEPLOY_DB=1`.

Linux, WSL, or Git Bash:

```bash
DEPLOY_DB=1 ./deploy.sh 202.155.94.210 root
```

Windows PowerShell:

```powershell
$env:DEPLOY_DB = "1"; .\deploy.ps1 202.155.94.210 root
```

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

The admin mode toggle does **not** require login — it is a testing convenience.

- Tap the **shield button** (⛨) at the bottom-right corner of any page to enter admin mode (button turns yellow). This also **automatically opens `AdminPanel`** — the full CRUD modal for chapters, subtopics, problems, steps, and users.
- Tap again to exit (button returns to black, panel closes).
- While admin mode is active, a **floating `+` FAB** (bottom-right) reopens `AdminPanel` if it was closed.
- Local development bypass: in non-production, `/api/admin/*` accepts localhost requests even when the current session is only an auto-guest. Set `LOCAL_ADMIN_MODE=false` to force real admin login again.

**What changes in admin mode:**

| Page | Admin behavior |
| --- | --- |
| Belajar | Chapter list replaced by `AdminBelajarView`: DB-wired CRUD — each chapter has ✏ Edit and ✕ Delete buttons, plus a "+ Tambah Bab Baru" row at bottom. Chapter form fields: title, mapel (Matematika/Fisika/Kimia), semester (1/2), garis besar isi (topics), estimated time, sort order. Changes persist to DB via `/api/admin/chapters`. |
| Practice | A compact `Admin Soal` card deck appears above the question: drag short question cards to reorder, click a card to jump to it, use `+ Soal` to add, and `Hapus` to delete the active question. Clicking any question card (title area) still opens inline editing for question text and choices, while `AdminPanel` can edit full problem details and solution steps. |

### Admin AI Import

`AdminPanel` has an `Import AI` tab for bulk question entry:

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
SOURCE_DB=/path/to/database.sqlite OUTPUT=db/question-bank.json npm run export:questions
```

Import into another target database:

```bash
INPUT=db/question-bank.json TARGET_DB=db/database.sqlite npm run import:questions
```

The import script refuses to replace question tables when user progress or correction attempts reference existing problems. Use `--force` only when intentionally resetting those references.

## Project Structure

```text
.
|-- MAFIKING.html              # Active HTML shell served by Express
|-- index.html                 # Vite build mirror/check target
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
|   `-- recommendation-engine.js # Deterministic weakness scoring and follow-up question picker
|-- SOP-9ROUTER-PROFILE-SUMMARY.md # Required profile narrative prompt for 9Router/Gemini
|-- routes/
|   |-- auth.js                # Register, login, logout, current user
|   |-- quiz.js                # Chapters, subtopics, problems, full quiz payload
|   |-- progress.js            # XP, streaks, progress, leaderboard
|   |-- correction.js          # Gemini transcription, evaluation, profile summary
|   |-- admin.js               # Admin CRUD for content/users
|   |-- admin-import.js        # Admin DeepSeek draft/commit import from PDF/DOCX/TXT/MD
|   `-- payment.js             # Duitku create/status/callback
|-- middleware/
|   |-- auth.js
|   `-- admin.js
|-- scripts/
|   |-- test-admin-import.js   # Focused tests for admin import helpers
|   |-- test-recommendation-engine.js
|   |-- export-question-bank.js
|   `-- import-question-bank.js
|-- src/
|   |-- app.jsx                # Router, isAdmin toggle state, shield button, root render
|   |-- shared.jsx             # Nav, footer, icons, Skeleton, showToast, ToastContainer, OfflineBanner
|   |-- backend-api.jsx        # Fetch helper for same-origin API calls
|   |-- lobby.jsx              # Landing (guest/marketing) + Dashboard (logged-in)
|   |-- belajar.jsx            # Static chapter cards; admin branch to AdminBelajarView
|   |-- practice.jsx           # Practice route: ChoiceView, CanvasView, ModeSegment, ResultModal
|   |-- toolbar.jsx            # Canvas drawing toolbar and focus-mode actions
|   |-- drawing-canvas.jsx     # Low-level canvas drawing surface
|   |-- answer-board.jsx       # Stylus answer board wrapper
|   |-- profile.jsx            # Profile/report view
|   |-- misi.jsx               # Daily mission screen
|   |-- tryout.jsx             # Tryout screen
|   |-- payment.jsx            # Payment package selection + Duitku redirect + status polling
|   |-- admin.jsx              # Admin UI: AdminBelajarView, slide AdminPracticeBar, plug problem editor, CRUD modals
|   `-- styles.css             # All CSS including admin styles appended at end
|-- tweaks-panel.jsx
|-- vite.config.js
|-- tailwind.config.js
`-- package.json
```

## User Flows

### App Load

1. Browser opens `/`.
2. `server.js` sends `MAFIKING.html`.
3. The HTML loads Tailwind CDN, React UMD, Babel standalone, then JSX files from `src/` in order.
4. `src/app.jsx` mounts the in-browser React app into `#root`.

### Lobby / Home

- Guest (`Tamu_XXXX`) users see the `Landing` component: full marketing page.
- Registered users see the `Dashboard` component: dynamic greeting, continue card (last chapter with progress > 0), XP/streak stats, mapel grid.

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
3. Submit exports the canvas image as PNG data URL.
4. Frontend posts to `POST /api/correction/evaluate`.
5. Backend validates image size/type, calls Gemini with key/model fallback, normalizes the JSON response, stores a row in `correction_attempts`, then returns feedback.
6. Frontend shows the ResultModal and posts progress to `POST /api/progress/submit`.

### Profile Report

1. `src/profile.jsx` loads `/api/auth/me`, `/api/progress/stats`, and `/api/correction/attempts`.
2. It posts attempts to `/api/correction/profile-summary`.
3. Backend computes deterministic skill need scores from up to 200 recent canvas correction attempts using wrong frequency, recency, low score, attempt pressure, and prerequisite gap.
4. Backend adds recent multiple-choice evidence from `practice_attempts` so the narrative can mention repeated wrong subtopics, difficulty, selected answer, and correct answer.
5. If the AI narrative cooldown allows it, backend sends only the 20 newest correction attempts plus summarized multiple-choice evidence to the configured profile provider.
6. Normal users can refresh the AI narrative at most once per hour; admin user `123` with password `135` bypasses this cooldown.
7. Backend returns `recommendedItems` from the Purcell-aligned local bank, `skillNeedScores` for debugging/explainability, and `recommendedQuestions` as a backward-compatible string list.

### Payment

1. User navigates to `payment` route.
2. Selects a package (Trial 7 hari Rp29k, Bulanan Rp99k, Semester Rp249k).
3. Frontend posts to `POST /api/payment/create` → redirects to Duitku `paymentUrl`.
4. On return, `?merchantOrderId=X` in URL triggers `PaymentStatus` component.
5. Status is polled every 5s from `GET /api/payment/status/:merchantOrderId`.
6. Shows pending / success / failed/timeout states.

## API Overview

All API routes except `/api/health` and `/api/payment/callback` require a session. If an API request has no session, `server.js` creates an auto-guest user before routing.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service and question counts. |
| `POST` | `/api/auth/register` | Create user and session. |
| `POST` | `/api/auth/login` | Login with rate limiting and per-username lockout. |
| `POST` | `/api/auth/logout` | Destroy session. |
| `GET` | `/api/auth/me` | Current user profile. |
| `GET` | `/api/quiz/init` | Chapters, subtopics, and problem counts. |
| `GET` | `/api/quiz/subtopics/:id/full` | Subtopic with full problems and steps. |
| `POST` | `/api/progress/submit` | Save correctness, XP, level, streak. |
| `GET` | `/api/progress/stats` | Current user's progress stats. |
| `GET` | `/api/correction/attempts` | Recent correction attempts. |
| `POST` | `/api/correction/transcribe` | Transcribe canvas image. |
| `POST` | `/api/correction/evaluate` | Evaluate answer and store attempt. |
| `POST` | `/api/correction/profile-summary` | Generate or fallback profile summary. |
| `GET/POST` | `/api/admin/chapters` | List or create chapters (admin only). |
| `PUT/DELETE` | `/api/admin/chapters/:id` | Update or delete chapter (admin only). |
| `GET/POST` | `/api/admin/subtopics` | List or create subtopics (admin only). |
| `PUT/DELETE` | `/api/admin/subtopics/:id` | Update or delete subtopic (admin only). |
| `GET/POST` | `/api/admin/problems` | List or create problems (admin only). |
| `PUT/DELETE` | `/api/admin/problems/:id` | Update or delete problem (admin only). |
| `GET/POST` | `/api/admin/problems/:id/steps` | List or create steps (admin only). |
| `PUT/DELETE` | `/api/admin/steps/:id` | Update or delete step (admin only). |
| `GET` | `/api/admin/users` | List users (admin only). |
| `PUT` | `/api/admin/users/:id/password` | Reset user password (admin only). |
| `POST` | `/api/admin/import/draft` | Upload file and ask DeepSeek for a reviewable import draft (admin only). |
| `POST` | `/api/admin/import/commit` | Insert reviewed draft questions and steps into SQLite (admin only). |
| `POST` | `/api/payment/create` | Create Duitku invoice. |
| `GET` | `/api/payment/status/:merchantOrderId` | Check payment status. |
| `POST` | `/api/payment/callback` | Duitku server callback. |

## Development Notes

- Preserve the copied UI unless a task explicitly asks for UI changes.
- Do not convert `src/*.jsx` to module imports. Files rely on globals and load order from `MAFIKING.html`.
- **Do not use IIFE `(function(){...})()`** in `src/*.jsx` files — variables inside are scoped and invisible to other scripts. Define components at top level.
- `src/app.jsx` owns route state, tweaks defaults, and `isAdmin` toggle.
- `src/app.jsx` intentionally does not render the global `Nav` while `route === "practice"`.
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

- Open `/` — lobby loads (Landing for guest, Dashboard for registered user).
- Shield button appears at bottom-right; pressing it turns yellow (admin mode).
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
- Open `payment` route → package selection renders.

## Known Gotchas

- Active runtime is Express serving `MAFIKING.html`, not the `dist/` bundle.
- The HTML loads React 18 UMD from CDN, while `package.json` includes React 19 for local tooling. Do not assume package React is what the browser runtime uses.
- Auto-guest sessions create users for API requests. Guest names start with `Tamu_`.
- Only Integral question data is currently imported. Static chapter cards for other subjects are placeholders.
- Admin mode toggle requires no login — it is a testing convenience. Restrict in production.
- Duitku routes point at sandbox base URL in code. Review payment environment and base URL before production use.
- `db/mafiking.db` exists but is the wrong file — use `db/database.sqlite`.
