# new_mafiking

`new_mafiking` is a local Mafiking web app that keeps the copied MAFIKING UI intact while adding a working Express + SQLite backend for question practice, canvas answer correction, profile reports, progress, admin data management, and payment hooks.

The active browser entry point is `MAFIKING.html`, served by `server.js`. The frontend is intentionally loaded as static JSX through React UMD + Babel in the browser, so do not treat this project as a normal bundled Vite SPA unless that architecture is intentionally changed.

## Current Status

- UI shell: copied Mafiking static UI with tweaks panel.
- Practice UI: multiple-choice first, with `Try Canvas` as the optional stylus/canvas path.
- Backend: Express 5, SQLite through `better-sqlite3`, session auth, API routes.
- Question bank: exported from `../Mafiking/db/database.sqlite` into `db/question-bank.json`.
- Imported question data at time of writing: 2 chapters, 4 subtopics, 23 problems, 86 problem steps.
- Available real practice bank: Integral only. The static Belajar UI has more chapter cards, but only `Teknik Integrasi` currently maps to real backend problems.
- Canvas correction: calls Gemini when `GEMINI_KEY_1` or later keys are configured; profile summary has a fallback when keys are missing.

## Quick Start

```bash
cd /home/abiyulinx/computing/king/new_mafiking
npm install
cp .env.example .env
npm run import:questions
PORT=3001 npm start
```

Open:

```text
http://127.0.0.1:3001
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
| `DUITKU_MERCHANT_CODE` | Required for payments | Duitku merchant code. |
| `DUITKU_API_KEY` | Required for payments | Duitku API key. |
| `DUITKU_CALLBACK_URL` | Required for deployed payments | Payment callback URL. |
| `DUITKU_RETURN_URL` | Required for deployed payments | Browser return URL after payment. |

Without Gemini keys, practice pages still open, but canvas evaluation endpoints return an API-key error. The profile summary endpoint can still return a local fallback summary.

## Commands

| Command | Description |
| --- | --- |
| `npm start` | Start the Express server. |
| `PORT=3001 npm start` | Start on port 3001, useful when port 3000 is occupied. |
| `npm run dev` | Start Express with `node --watch`. |
| `npm run build` | Run Vite build against `index.html`. This is a build check, not the active runtime path. |
| `npm run check` | Run build plus Node syntax checks for server, correction route, and import/export scripts. |
| `npm run export:questions` | Export question tables from the old Mafiking SQLite database into `db/question-bank.json`. |
| `npm run import:questions` | Import `db/question-bank.json` into `db/database.sqlite`. |
| `npm run import:questions -- --force` | Replace question tables even if existing progress/correction rows reference old problems. |

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
|   `-- database.sqlite        # Local runtime DB, generated/ignored
|-- routes/
|   |-- auth.js                # Register, login, logout, current user
|   |-- quiz.js                # Chapters, subtopics, problems, full quiz payload
|   |-- progress.js            # XP, streaks, progress, leaderboard
|   |-- correction.js          # Gemini transcription, evaluation, profile summary
|   |-- admin.js               # Admin CRUD for content/users
|   `-- payment.js             # Duitku create/status/callback
|-- middleware/
|   |-- auth.js
|   `-- admin.js
|-- scripts/
|   |-- export-question-bank.js
|   `-- import-question-bank.js
|-- src/
|   |-- app.jsx                # Static React router and tweaks defaults
|   |-- shared.jsx             # Nav, footer, icons, shared UI primitives
|   |-- belajar.jsx            # Static chapter cards and practice routing
|   |-- practice.jsx           # Multiple-choice first practice, optional canvas mode
|   |-- toolbar.jsx            # Canvas drawing toolbar and focus-mode actions
|   |-- drawing-canvas.jsx     # Low-level canvas drawing surface
|   |-- answer-board.jsx       # Stylus answer board wrapper
|   |-- profile.jsx            # Profile/report view
|   |-- backend-api.jsx        # Fetch helper for same-origin API calls
|   |-- lobby.jsx
|   |-- misi.jsx
|   |-- tryout.jsx
|   `-- styles.css
|-- tweaks-panel.jsx
|-- vite.config.js
|-- tailwind.config.js
`-- package.json
```

## User Flows

### App Load

1. Browser opens `/`.
2. `server.js` sends `MAFIKING.html`.
3. The HTML loads Tailwind CDN, React UMD, Babel standalone, then JSX files from `src/`.
4. `src/app.jsx` mounts the in-browser React app into `#root`.

### Opening a Chapter

1. User opens `Belajar`.
2. `src/belajar.jsx` sends the selected card context into the `practice` route.
3. `src/practice.jsx` calls `/api/quiz/init`.
4. `chooseQuestionSource()` maps only supported static chapters to real backend questions.
5. `Teknik Integrasi` loads all Integral subtopics with problems and starts in multiple-choice mode.
6. Unsupported chapters show an empty-state message instead of incorrectly falling back to the first question.

### Practice Modes

- The global top navigation is hidden on the `practice` route; the practice page uses its own session bar.
- Multiple choice is the default mode. The chapter title is centered as `Bab 7: Teknik Integrasi` and can be opened as a chapter switcher.
- The multiple-choice card is intentionally narrow. Actions are `Sebelumnya`, `Hint`, and a right-side `Lewati` button that changes to `Cek Jawaban` after the user selects an option.
- `Try Canvas` switches into canvas mode.
- Canvas mode has `Kembali` on the left, `Try Pilgan` on the right, and `Lewati Soal` aligned to the right in the canvas question card.
- Canvas focus/fullscreen mode keeps navigation inside the top drawing toolbar: left `< sebelumnya`, right `lewati >`; labels hide on narrow screens. The regular middle `Submit ->` toolbar button is hidden in focus mode, and the right edge action can become `Submit` after the user writes.

### Canvas Correction

1. User enters canvas mode through `Try Canvas`.
2. User writes on the canvas in `src/practice.jsx` / `src/answer-board.jsx`.
3. Submit exports the canvas image as PNG data URL.
4. Frontend posts to `POST /api/correction/evaluate`.
5. Backend validates image size/type, calls Gemini with key/model fallback, normalizes the JSON response, stores a row in `correction_attempts`, then returns feedback.
6. Frontend shows the correction modal and posts progress to `POST /api/progress/submit`.

### Profile Report

1. `src/profile.jsx` loads `/api/auth/me`, `/api/progress/stats`, and `/api/correction/attempts`.
2. It posts attempts to `/api/correction/profile-summary`.
3. Backend returns a Gemini-generated summary or local fallback summary.

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
| `GET/POST/PUT/PATCH/DELETE` | `/api/admin/*` | Admin-only content/user management. |
| `POST` | `/api/payment/create` | Create Duitku invoice. |
| `GET` | `/api/payment/status/:merchantOrderId` | Check payment status. |
| `POST` | `/api/payment/callback` | Duitku server callback. |

## Development Notes

- Preserve the copied UI unless a task explicitly asks for UI changes.
- Do not convert `src/*.jsx` to module imports casually. Files rely on globals and load order from `MAFIKING.html`.
- `src/app.jsx` owns the route state and tweaks defaults.
- `src/app.jsx` intentionally does not render the global `Nav` while `route === "practice"`.
- `src/belajar.jsx` owns static chapter cards. Backend question availability is separate from those static cards.
- `src/belajar.jsx` exposes `window.chapterData` so the practice chapter switcher can use the same static chapter list.
- `src/practice.jsx` owns the current strict chapter-to-question mapping and the choice/canvas mode state.
- `src/toolbar.jsx`, `src/drawing-canvas.jsx`, and `src/answer-board.jsx` are part of the canvas practice surface and must keep their global script load order.
- `server.js` applies SQLite schema on startup and includes inline migrations for older local DBs.
- `db/database.sqlite` is local runtime state and should not be treated as source of truth.
- `db/question-bank.json` is the portable source for seeded question content.
- `npm run build` can print Vite warnings about non-module scripts. That is expected for the current static-Babel architecture as long as the command exits successfully.

## Verification

Run the standard check after code or documentation changes:

```bash
npm run check
```

Useful manual smoke checks:

```bash
curl -s http://127.0.0.1:3001/api/health
curl -s http://127.0.0.1:3001/api/quiz/init
```

Browser checks:

- Open `/`.
- Open `Belajar`.
- Click `Teknik Integrasi`; it should open multiple-choice practice with 23 questions.
- Click `Try Canvas`; it should open canvas mode. `Try Pilgan` should return to multiple choice.
- In canvas focus mode, the drawing toolbar should show edge navigation and no middle `Submit ->` button.
- Click an unsupported chapter such as `Bentuk Tak Tentu & Integral Tak Wajar`; it should show the empty state.
- Open profile from the profile icon or login/profile entry point.

## Known Gotchas

- Active runtime is Express serving `MAFIKING.html`, not the `dist/` bundle.
- The HTML loads React 18 UMD from CDN, while `package.json` includes React 19 for local tooling. Do not assume package React is what the browser runtime uses.
- Auto-guest sessions create users for API requests. Clean local guest users when running repeated browser automation if needed.
- Only Integral question data is currently imported. Static chapter cards for other subjects are placeholders until their question banks exist.
- Practice starts in multiple-choice mode even though canvas correction is still available.
- Duitku routes point at sandbox base URL in code. Review payment environment and base URL before production use.
