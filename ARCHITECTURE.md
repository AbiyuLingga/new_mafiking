# Architecture

This document describes the current architecture of `new_mafiking`. It is intentionally descriptive, not aspirational.

## System Overview

`new_mafiking` combines:

- A copied Mafiking static frontend.
- An Express backend.
- A local SQLite database.
- A multiple-choice-first practice flow with optional stylus canvas mode.
- Multi-provider AI canvas correction through Gemini/Groq, with direct Gemini fallback when the pool is disabled.
- Deterministic Purcell-aligned follow-up recommendations for profile reports.
- Import/export scripts for practice and Try Out bank portability.

High-level runtime:

```text
Browser
  |
  | GET /
  v
Express server.js
  |
  | serves MAFIKING.html and static assets
  v
MAFIKING.html
  |
  | loads Tailwind CDN, React UMD, Babel, src/*.jsx scripts
  v
Static React app in browser
  |
  | same-origin fetch via MafikingAPI
  v
/api/* Express routes
  |
  | better-sqlite3
  v
db/database.sqlite
  |
  | optional Gemini/Groq/Duitku calls
  v
External services
```

## Runtime Entry Points

### Server Entry

File:

```text
server.js
```

Responsibilities:

- Load `.env`.
- Create `db/` if missing.
- Open `db/database.sqlite` with `better-sqlite3`.
- Enable SQLite WAL mode and foreign keys.
- Execute `db/schema.sql`.
- Apply inline compatibility migrations for older Mafiking local databases.
- Configure Helmet CSP, request body limits, sessions, and rate limits.
- Create guest users for API requests without a session.
- Mount API routes.
- Serve static assets and JSX.
- Serve `MAFIKING.html` for app routes.

### Frontend Entry

File:

```text
MAFIKING.html
```

Responsibilities:

- Load fonts.
- Load `src/styles.css`.
- Configure Tailwind CDN.
- Load React 18 UMD, ReactDOM UMD, and Babel standalone.
- Load `type="text/babel"` scripts in order.

Script load order matters:

```text
tweaks-panel.jsx
src/clerk-auth.jsx
src/backend-api.jsx
src/shared.jsx
src/onboarding.jsx
src/lobby.jsx
src/belajar.jsx
src/profile.jsx
src/toolbar.jsx
src/drawing-canvas.jsx
src/answer-board.jsx
src/practice.jsx
src/misi.jsx
src/tryout.jsx
src/leaderboard.jsx
src/payment.jsx
src/admin-monitoring.jsx
src/admin.jsx
src/app.jsx
```

`src/app.jsx` must load last because it mounts the React root and expects previous components to exist globally.

## Frontend Architecture

The frontend is not module-based. Components are defined in browser global scope and exported as needed through `window.*`.

### Main Files

| File | Role |
| --- | --- |
| `src/app.jsx` | Route state, tweaks defaults, root render. |
| `src/shared.jsx` | Navigation, footer, icons, shared components. |
| `src/backend-api.jsx` | Same-origin `fetch` helper. |
| `src/clerk-auth.jsx` | Static-Babel Clerk bridge: loads Clerk browser scripts, opens sign-in/sign-up, and syncs Clerk users to local sessions. |
| `src/onboarding.jsx` | Mandatory profile completion modal for non-admin users whose local profile fields are incomplete. |
| `src/lobby.jsx` | Public marketing landing plus login/sign-up screen. |
| `src/belajar.jsx` | Free Try Out tab, static chapter cards, animated mapel selector, chapter-to-practice navigation. |
| `src/practice.jsx` | Practice route, multiple-choice/canvas mode state, question-source mapping, correction submit. |
| `src/toolbar.jsx` | Canvas drawing toolbar, eraser/lasso controls, focus-mode edge navigation. |
| `src/drawing-canvas.jsx` | Low-level writable canvas surface. |
| `src/answer-board.jsx` | Stylus answer board wrapper and canvas export surface. |
| `src/profile.jsx` | Profile/report view using progress and correction APIs. |
| `src/misi.jsx` | Daily mission screen. |
| `src/tryout.jsx` | Paket / paid tryout package screen; `Semua Paket` and `Paket Saya` share the same `PackageCard` layout. |
| `src/leaderboard.jsx` | Peringkat page with isolated-scroll leaderboard and `Semua` / `Top Mingguan` views. |
| `src/payment.jsx` | Checkout popup plus QRIS/manual popup rendering and status polling. |
| `src/admin.jsx` | Admin page/modal shell, subject/Try Out content CRUD, import tab, users tab, and monitoring tab shell. |
| `src/styles.css` | Local custom CSS and appended feature styles. |
| `tweaks-panel.jsx` | Tweaks panel and persisted tweak state. |

### Route Model

`src/app.jsx` keeps a simple route string in React state:

```text
lobby
belajar
misi
tryout
leaderboard
admin
profile
practice
```

For practice navigation, `setRoute` can receive an object:

```js
{
  route: "practice",
  practice: { ...chapterCardContext, mapel }
}
```

Route objects are also used for auth redirects, payment context, and Belajar section selection:

```js
{
  route: "lobby",
  authMode: "login",
  authRedirect: { route: "practice", practice: context }
}

{
  route: "belajar",
  section: "Try Out"
}
```

`src/app.jsx` stores `practice` as `practiceContext` and passes it into `Practice`. It also stores the selected Belajar section so `Coba Gratis` can land directly on the free Try Out tab.

The global `Nav` is intentionally not rendered while `route === "practice"`, `route === "lobby"`, or while `route === "payment"` has a `merchantOrderId` query. The practice route owns its own session bar and canvas toolbar, the public landing owns its own marketing header, and payment status owns a modal-style popup that must not be pushed under the app shell nav.

Payment status URLs preserve their order query:

```text
/payment?merchantOrderId=MFK-...
```

`appStateToPath()` must keep that query when syncing route state to browser history; otherwise the app cannot reopen the order status popup. Normal package purchase should not navigate to `/payment`; `src/app.jsx` intercepts `{ route: "payment", payment: ... }` and renders `PaymentCheckoutModal` over the current page.

### Public Landing And Access Gates

- `/` always renders the public landing page, even when the user already has a logged-in session.
- Clicking the Mafiking logo from app routes returns to the public landing.
- The landing `Coba Gratis` CTA routes to `Belajar -> Try Out`.
- Landing media slots are loaded from `GET /api/landing-media`; the public landing no longer exposes inline media replacement controls to admins.
- The landing page uses local reveal/pop animations in `src/lobby.jsx` and `src/styles.css`; it does not rely on a bundled Framer Motion runtime in this static-Babel app.
- The demo video section intentionally has no grid background after the latest landing UI correction.
- Login/sign-up screens expose the local email/password flow and Clerk Google auth. New local email/password accounts must verify their email via a single-use verification link before login is allowed. Clerk browser scripts are loaded dynamically by `src/clerk-auth.jsx`.
- After auth succeeds, `GET /api/auth/me` marks incomplete non-admin profiles with `profile_needs_completion`; `src/app.jsx` then renders the fixed, non-dismissible `ProfileOnboardingModal`.
- The top app nav uses `Beranda` for `belajar`, `Misi Harian` for `misi`, `Paket` for `tryout`, and `Peringkat` for `leaderboard`; there is no separate `Belajar` nav link.
- The app route shell uses a small vertical fade/slide transition. `src/shared.jsx` measures nav and segmented-control buttons so the active oval moves instead of teleporting. `src/belajar.jsx` separately measures the active mapel tab so its underline slides between `Try Out`, `Matematika`, `Fisika`, and `Kimia`; the `Try Out` underline uses the ink accent.
- Belajar, Misi Harian, Paket, Peringkat, Profil, Admin Panel, and locked access gates use shared `.app-page-bg` variants from `src/styles.css` for the soft grid/glow background while keeping page-specific content/layout components unchanged.
- The leaderboard is currently frontend-static display data; `routes/progress.js` already exposes leaderboard APIs but this first page does not consume them yet.
- Logged-out users can open the free Try Out confirmation and start the free 15-question / 30-minute session.
- Free Try Out review paths outside the session and protected subject chapters route through login/sign-up with an auth redirect back to the intended route.
- Try Out packages are backed by `tryout_packages.tryout_id` plus per-package rows in `tryout_questions` and `tryout_question_steps`. The Belajar Try Out tab shows both free and premium entries; premium opens only when admin role, paid product title, subscription title, or manual `user_access_grants` value matches the package. The exam route loads `/api/tryouts/:tryoutId/full`; after a registered user submits, `/api/progress/tryout-attempts` stores answers and a review snapshot. Reopening the same Try Out reads `/api/progress/tryout-attempts/latest` and shows history/review instead of a timer. Admin reset deletes only the specific `tryout_attempts` row so the user can retake that Try Out.
- Premium-only pages such as Misi Harian show an access gate when the user lacks an active package.

### Tweaks

Tweaks are controlled by `src/app.jsx` defaults and `tweaks-panel.jsx`.

Current defaults:

```json
{
  "heroLayout": "split",
  "density": "normal",
  "chapterCard": "soft",
  "mapelSelector": "tabs",
  "missionCard": "mafiking1",
  "accentColor": "#FFF44F",
  "cardRadius": "default",
  "navStyle": "ghost",
  "statsStyle": "strip",
  "ctaStyle": "dark"
}
```

### Practice Question Mapping

`src/belajar.jsx` has static chapter card data for Matematika, Fisika, and Kimia, plus a `Try Out` tab for the free package entry point.

Backend question data is currently narrower:

```text
Integral
  - u-Substitution: 9 problems
  - Integration by Parts: 7 problems
  - Trigonometric Integrals: 7 problems
limit
  - no problems
```

`src/practice.jsx` owns the mapping between static chapter cards and backend question sources.

Important invariant:

- `Teknik Integrasi` maps to all Integral subtopics with problems.
- Unsupported chapters return no question source and show an empty state.
- Unknown chapters must not silently fall back to the first available subtopic.

### Practice UI Modes

Practice starts in multiple-choice mode:

```text
Belajar chapter card
  -> route: practice
  -> mode: choice
  -> ChoiceView
```

Multiple-choice behavior:

- The question card is deliberately narrow and centered.
- The chapter title is centered in the session bar as `Bab 7: Teknik Integrasi`.
- `src/belajar.jsx` exposes `window.chapterData`; `src/practice.jsx` uses it for the chapter switcher.
- The action row keeps `Sebelumnya` on the left, `Hint` in the center, and `Lewati` or `Cek Jawaban` on the right.
- `Cek Jawaban` appears only after the user selects an option.
- `Try Canvas` switches to canvas mode.

Canvas behavior:

- Canvas mode keeps a compact session bar with `Kembali` on the left and `Try Pilgan` on the right.
- `Kembali` returns to the chapter list; `Try Pilgan` returns to multiple-choice mode.
- The canvas question card keeps `Lewati Soal` aligned to the right.
- Focus/fullscreen mode uses `focusActions` passed from `Practice` through `AnswerBoard` to `Toolbar`.
- In focus mode, toolbar edge buttons show `< sebelumnya` and `lewati >` when there is room; CSS hides those labels on narrower screens.
- In focus mode, the regular middle `Submit ->` toolbar button is hidden. The right edge button changes to `Submit` after the canvas is dirty.

## Backend Architecture

Backend is a single Express application with route modules.

```text
server.js
  |-- routes/webhooks.js
  |-- routes/auth.js
  |-- routes/quiz.js
  |-- routes/progress.js
  |-- routes/correction.js
  |-- routes/admin.js
  `-- routes/payment.js
```

### Middleware and Cross-Cutting Behavior

| Concern | Location | Behavior |
| --- | --- | --- |
| Environment | `server.js` | Loads `.env.local` first, then `.env`, without printing secrets. |
| Database | `server.js` | Opens SQLite, applies schema and compatibility migrations. |
| Security headers | `server.js` | Helmet with CSP that allows required CDN scripts/styles. |
| Body limits | `server.js` | JSON limit `12mb`; URL encoded limit `100kb`. |
| Sessions | `server.js` | `express-session`, 7-day cookie, `sameSite: strict`. |
| Clerk auth | `server.js` + `middleware/clerk-auth.js` + `src/clerk-auth.jsx` | `@clerk/express` verifies Clerk sessions; frontend sends Bearer token when Clerk is signed in, then middleware maps Clerk users to local SQLite users. |
| Email verification | `routes/auth.js` + `lib/email-verification.js` + `lib/mailer.js` | Local email/password signups store only a SHA-256 verification-token hash, send a Gmail SMTP verification link, and hard-block login until `users.email_verified_at` is set. |
| Rate limits | `server.js` | Login, register, and correction route limits. |
| Auth guard | `middleware/auth.js` | Requires either `req.userId` from Clerk or `req.session.userId`. |
| Admin guard | `middleware/admin.js` | Requires admin role from either Clerk-mapped request state or session. |
| Auto guest | `server.js` | Creates a guest user for most API requests without a session. |
| Error handler | `server.js` | JSON errors; hides details in production. |

### API Route Responsibilities

#### `routes/auth.js`

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/clerk-onboard`
- `POST /api/auth/profile-onboarding`
- `GET /api/auth/me`

Uses bcrypt for passwords, XSS sanitization for registration fields, route-level login lockout, and sessions for auth state.

Clerk-signed requests are synced before this route runs. `GET /api/auth/me` still returns the local SQLite user because the rest of the app keys progress, XP, role, and payments by local `users.id`. `POST /api/auth/clerk-onboard` remains for legacy display-name completion and guest merge. New first-login profile completion uses `POST /api/auth/profile-onboarding`, which validates phone, semester, faculty/major, and subject priorities before marking `users.onboarding_completed_at`.

#### `routes/webhooks.js`

- `POST /api/webhooks/clerk`

The route receives a raw JSON body before the normal Express JSON parser, verifies Clerk signatures with `svix` and `CLERK_WEBHOOK_SIGNING_SECRET`, and currently handles `user.created` by creating or linking a local SQLite user. It is skipped by auto-guest creation and does not expose env secrets.

#### `routes/quiz.js`

- `GET /api/quiz/chapters`
- `GET /api/quiz/chapters/:id/subtopics`
- `GET /api/quiz/init`
- `GET /api/quiz/subtopics/:id/problems`
- `GET /api/quiz/problems/:id`
- `GET /api/quiz/subtopics/:id`
- `GET /api/quiz/subtopics/:id/full`

`/api/quiz/init` is the lightweight bootstrap call used by `src/practice.jsx` to discover available chapters, subtopics, and problem counts.

#### `routes/progress.js`

- `POST /api/progress/submit`
- `GET /api/progress/me`
- `GET /api/progress/stats`
- `GET /api/progress/leaderboard`
- `GET /api/progress/leaderboard/weekly`

Computes XP, penalties, level, badge tier, streaks, solved counts, mastery, and leaderboards. `/api/progress/stats` is the source of truth for gamified UI chips: it returns real `xp`, `level`, `streak_days`, `highest_streak`, `level_progress`, and next-level XP metadata from SQLite.

#### `routes/correction.js`

- `GET /api/correction/attempts`
- `POST /api/correction/transcribe`
- `POST /api/correction/evaluate`
- `POST /api/correction/profile-summary`
- `GET /api/correction/pool/stats`

Core responsibilities:

- Validate image MIME type and size.
- Route OCR/evaluation through `lib/multi-provider-pool.js` when enabled.
- Use up to 20 Gemini API keys for Gemini/Gemma calls and an optional `GROQ_API_KEY` for Groq vision calls.
- Try configured OCR/evaluation models plus the Gemini 3.1 Flash Lite default on the direct Gemini fallback path.
- Retry only retryable provider overload/rate-limit errors.
- Keep `POST /api/correction/transcribe` for compatibility, but the current canvas UI posts image-only submissions directly to `/api/correction/evaluate` for merged OCR + evaluation.
- Normalize evaluation/profile JSON.
- Store correction attempts in SQLite.
- Log successful AI token usage to `ai_token_usage` without blocking the request.
- Provide local fallback profile summaries when Gemma is unavailable.
- Compute deterministic `recommendedItems` from local skill metadata and the Purcell-inspired reference bank; Gemma does not freely choose those follow-up questions.
- Use Gemma 4 31B for profile narrative text.
- Rate-limit AI profile narrative refreshes to once per hour for normal users; admin `123`/`135` bypasses the cooldown.
- Include summarized multiple-choice mistakes from `practice_attempts` as profile narrative evidence, without letting AI choose final catalog refs.

#### `routes/admin.js`

Admin-only CRUD for:

- Chapters.
- Subtopics.
- Problems.
- Problem steps.
- Users' passwords.
- Dashboard data for user progress/access grants and Gemini usage.
- Manual user access grants, including quick grant/revoke controls for premium Try Out (`tryout-premium-tpb-prep`) and daily missions (`daily-missions`).
- Admin role promotion/demotion and guarded deletion of non-admin user accounts.
- Read-only landing media delivery for the promo image, feature images, and demo video through `GET /api/landing-media`.
- Try Out package CRUD separated from Matematika/Fisika/Kimia chapter/subtopic CRUD.

This route requires both session auth and admin role.

The backend dashboard endpoint is present at `GET /api/admin/dashboard-data`. The richer monitoring UI lives in `src/admin-monitoring.jsx`, exports `window.AdminMonitoringPanel`, and is loaded before `src/admin.jsx` in `MAFIKING.html`.

#### `routes/payment.js`

QRIS-first payment integration with legacy Duitku fallback:

- `POST /api/payment/create` creates a QRIS/manual/Duitku payment depending on `PAYMENT_PROVIDER`.
- `POST /api/payment/pending` reopens an unexpired pending QRIS/manual order for the same user and package before the frontend creates a new order.
- QRIS/manual responses are rendered in-app by `src/payment.jsx` as a popup portal, then polled by `GET /api/payment/status/:merchantOrderId`.
- Duitku responses may still redirect to `paymentUrl` in legacy/fallback mode.
- `POST /api/payment/callback` verifies Duitku callback signatures.
- QRIS reconciliation webhooks and admin payment actions update the `payments` table through the reconciler helpers.

The base URL is currently sandbox:

```text
https://api-sandbox.duitku.com/api
```

Review this before production.

## Database Architecture

Schema source:

```text
db/schema.sql
```

Runtime state:

```text
db/database.sqlite
```

Portable seed/source data:

```text
db/question-bank.json
```

Recommendation metadata:

```text
data/recommendation-catalog.json
docs/purcell-inspired-question-bank.md
```

### Tables

| Table | Purpose |
| --- | --- |
| `users` | Login identity, role, XP, level, streak, Clerk link, and onboarding profile fields. |
| `chapters` | Top-level learning chapters. |
| `subtopics` | Chapter subdivisions. |
| `problems` | Questions, answer display, acceptable answers, type, options. |
| `problem_steps` | Worked solution steps and mistake metadata. |
| `tryout_packages` | Package cards plus stable `tryout_id` used by Try Out sessions. |
| `tryout_questions` | Per-`tryout_id` question bank used by Try Out exams. |
| `tryout_question_steps` | Worked solution steps for Try Out review snapshots and admin preview. |
| `tryout_attempts` | Per-user submitted Try Out scores, answers JSON, and immutable review snapshots. |
| `payments` | Duitku invoice/status records. |
| `user_progress` | Per-user per-problem attempts, solved state, XP. |
| `correction_attempts` | Canvas correction outputs and normalized evaluation JSON. |
| `user_access_grants` | Manual admin grants such as tryout, mission, package, or subscription access. |
| `ai_token_usage` | Successful AI provider token usage for admin monitoring. |
| `landing_media` | Admin-managed image/video slots used by the public landing page. |

### Key Relationships

```text
chapters 1 -> many subtopics
subtopics 1 -> many problems
problems 1 -> many problem_steps
users 1 -> many user_progress
users 1 -> many correction_attempts
users 1 -> many user_access_grants
users 1 -> many payments
users 1 -> many tryout_attempts
tryout_packages 1 -> many tryout_questions by tryout_id
tryout_questions 1 -> many tryout_question_steps
problems 1 -> many user_progress
problems 1 -> many correction_attempts, nullable on delete
```

Clerk adds `users.clerk_id`, `users.email`, and `users.auth_provider`. Local email verification adds `users.email_verified_at`, `users.email_verification_token_hash`, `users.email_verification_expires_at`, and `users.email_verification_last_sent_at`. A partial unique index protects non-empty `clerk_id` values. `auth_provider` uses `local`, `clerk`, or `linked`; old `password` values are normalized to `local` at startup. If a Clerk user's email matches an existing local username/email, the account is linked instead of duplicating progress.

### Startup Schema Behavior

`server.js` runs `db/schema.sql` every startup. Because the schema uses `CREATE TABLE IF NOT EXISTS`, this is idempotent for table creation.

After that, `server.js` runs several `ALTER TABLE ... ADD COLUMN` compatibility migrations in `try/catch`. Failed migrations are assumed to mean the column already exists.

There is no versioned migration directory yet.

## Data Flows

### Page Load Flow

```text
GET /
  -> server.js sends MAFIKING.html
  -> browser loads CSS/CDN scripts/static JSX
  -> src/app.jsx renders App
```

### Practice Load Flow

```text
Click chapter card in src/belajar.jsx
  -> setRoute({ route: "practice", practice: context })
  -> src/app.jsx passes context to Practice
  -> Practice calls GET /api/quiz/init
  -> chooseQuestionSource(init, context)
  -> loadQuestionSource(questionSource)
  -> GET /api/quiz/subtopics/:id/full for one or more subtopics
  -> render multiple-choice practice
  -> optionally switch to canvas practice through Try Canvas
```

### Canvas Evaluation Flow

```text
User opens Try Canvas
  -> user writes on canvas
  -> exportCanvasImage() as compressed JPEG
  -> POST /api/correction/evaluate-stream
  -> fallback POST /api/correction/evaluate when streaming fails
  -> validateImagePayload()
  -> callAiWithPoolFallback()
  -> callWithPool() when enabled, else callGeminiWithFallback()
  -> pool selects Gemini, Groq, or optional OpenRouter with queue limits
  -> merged OCR + evaluation JSON
  -> optional answer-equivalence fast path only when detected answer matches expected answer
  -> logTokenUsage()
  -> normalizeEvaluation()
  -> INSERT correction_attempts
  -> INSERT correction_latency_metrics
  -> return evaluation
  -> frontend opens result modal
  -> POST /api/progress/submit
```

Wrong-answer visualization depends on the merged AI response retaining
`wrongSteps` and `redlineTargets`. Latency work must not remove these fields:
`src/practice.jsx` stores the original stroke snapshot with the attempt, and
the result modal redraws those strokes while overlaying matched wrong strokes
in red. The fast path is only allowed to clear redline fields when the detected
answer is equivalent to the expected answer and the final result is correct.

The streaming endpoint sends phase events such as `reading`, `evaluating`, and
`fast-path` before the final `result` event. It shares the same backend helper
as the non-streaming endpoint, so correctness, persistence, and redline output
stay aligned between both paths.

### Profile Report Flow

```text
Open profile
  -> GET /api/auth/me
  -> GET /api/progress/stats
  -> GET /api/correction/attempts
  -> POST /api/correction/profile-summary
  -> load up to 200 recent attempts for deterministic recommendations
  -> compute skill need scores from recommendation attempt window
  -> summarize recent multiple-choice mistakes from practice_attempts
  -> skip AI narrative if normal user refreshed within the last 1 hour
  -> send only 20 newest correction attempts plus MC evidence to the profile narrative provider
  -> merge Gemma report text with deterministic recommendedItems
  -> render total answered, weaknesses, recommended questions, catalog refs, difficulty, Purcell reference, and reason
```

The recommendation formula is:

```text
need_score =
  confidence * 100 * (
    0.30 * wrong_frequency
  + 0.25 * recency_error
  + 0.20 * low_score
  + 0.15 * prerequisite_gap
  + 0.10 * attempt_pressure
  )
```

`data/recommendation-catalog.json` owns official skill aliases, prerequisites, scoring weights, and difficulty gating. `docs/purcell-inspired-question-bank.md` owns the original Purcell-aligned question references used by the recommendation engine.

Runtime recommendation selection must stay deterministic: Gemma can contribute `overallSummary` text, but `recommendedItems`, `recommendedQuestions`, and `skillNeedScores` are merged from `lib/recommendation-engine.js` so profile recommendations point at real catalog refs instead of invented items.

The local engine enriches selected DB-backed recommendations with half-life review signals, BKT-lite per-skill mastery, KST-style frontier versus review tags, recall-slot interleaving, and recent multiple-choice evidence. High mastery reduces recency-error pressure, very low mastery increases prerequisite-gap weight, and the frontend receives `evidence`, `frontier`, `kind`, `halfLifeDays`, and `evidenceAt` metadata for each selected item while AI remains prose-only.

The profile endpoint intentionally uses two attempt windows: `PROFILE_RECOMMENDATION_ATTEMPT_LIMIT = 200` for local recommendation stability and `PROFILE_AI_ATTEMPT_LIMIT = 20` for AI prompt cost/latency control. Multiple-choice evidence has its own `PROFILE_MC_ATTEMPT_LIMIT = 120` because it is summarized before reaching the AI prompt.

AI narrative refreshes are recorded in `profile_ai_refreshes`. Normal users can refresh AI narrative text once per hour; admin account `123`/`135` bypasses the cooldown for testing and operations. When cooldown blocks the AI call or Gemma fails, the endpoint still returns the deterministic local profile summary.

Profile narrative calls must read `SOP-PROFILE-SUMMARY.md` through `routes/correction.js` before producing summary JSON. This SOP is the source of truth for what Gemma may infer and what it must leave to the deterministic recommendation engine.

### Question Bank Export/Import Flow

```text
Old Mafiking SQLite DB
  -> scripts/export-question-bank.js
  -> db/question-bank.json
  -> scripts/import-question-bank.js
  -> db/database.sqlite
```

Export script reads only content tables:

```text
chapters
subtopics
problems
problem_steps
```

Import script replaces those four tables in a transaction after checking whether existing progress/correction rows reference current problems.

### Try Out Bank Export/Import Flow

```text
Local db/database.sqlite
  -> scripts/export-tryout-bank.js
  -> db/tryout-bank.json
  -> scripts/import-tryout-bank.js
  -> db/database.sqlite or production DB
```

The Try Out import updates package metadata and replaces questions only for Try Outs without submitted `tryout_attempts`, unless `--force` or `FORCE_IMPORT=1` is used. `deploy.sh` runs `npm run import:tryouts` after dependencies are ready so production receives bundled Try Out content without overwriting user history by default.

## Security and Safety Notes

- Helmet CSP allows the current CDN-based frontend runtime. Tightening CSP requires changing the frontend delivery model first.
- CSP allows HTTPS script/connect/frame sources for Clerk browser auth. Do not expose `CLERK_SECRET_KEY` in client code; only `/api/config/clerk` exposes the publishable key.
- Session cookies are `httpOnly`, `sameSite: strict`, and `secure: auto`.
- Login/register/correction are rate-limited.
- Registration fields are sanitized with `xss`.
- Admin routes require role check.
- Admin monitoring endpoints validate user IDs/access payloads, verify access grants belong to the selected user before revoking, and use parameterized SQL.
- The frontend only renders the admin shield for `currentUser.role === "admin"`; shield activation adds an Admin Panel route entry, while backend middleware remains the real authorization boundary.
- Gemini image input is limited to PNG, JPEG, WEBP, and 10,000,000 base64 characters.
- Payment callbacks verify Duitku MD5 callback signatures.
- `SESSION_SECRET` must be changed before real deployment.
- Duitku production use requires switching the base URL and callback/return URLs deliberately.

## Build and Tooling Architecture

`package.json` includes Vite and React dependencies. Current command roles:

- `npm start`: real app server.
- `npm run dev`: real app server with watch mode.
- `npm run build`: Vite build check for `index.html`.
- `npm run check`: Node syntax checks plus focused admin-import and recommendation-engine tests.

Important: `npm run build` does not prove that `MAFIKING.html` bundled a production SPA. The real runtime still executes static JSX through Babel in the browser.

## Known Limitations

- The active frontend is not bundled for production.
- React CDN runtime is React 18, while package dependencies include React 19.
- There is no automated unit/integration test suite yet.
- There is no versioned database migration system yet.
- Static Belajar chapter cards outnumber imported backend question data.
- Try Out content is portable through `db/tryout-bank.json`; SQLite runtime files remain ignored and are not the source of truth for deployment.
- Practice is multiple-choice-first; canvas correction is still available but no longer the default entry mode.
- Auto-guest users can accumulate during browser/API testing.
- Payment route uses sandbox URL by default in code.
- Admin monitoring reads token usage from local logging only; it does not query Google live quota APIs.
- User deletion from admin tools is intentionally limited to non-admin accounts and blocks deleting the current account.

## Extension Points

### Add New Question Banks

1. Export or create rows for `chapters`, `subtopics`, `problems`, and `problem_steps`.
2. Update `db/question-bank.json`.
3. Import into local DB.
4. Update `src/practice.jsx` mapping if the new static chapter title should open the new backend data.
5. Smoke-test the chapter in browser.

### Add New Frontend Route

1. Create `src/<route>.jsx`.
2. Export the component globally if needed.
3. Add the script to `MAFIKING.html` before `src/app.jsx`.
4. Add route state/rendering in `src/app.jsx`.
5. Keep visual style aligned with existing copied Mafiking UI.

### Add New API Route

1. Create or update `routes/<name>.js`.
2. Mount it in `server.js`.
3. Add auth/rate limiting if needed.
4. Document the endpoint in `README.md`.
5. Update this architecture file if the route changes data flow.

### Change Schema

1. Update `db/schema.sql`.
2. Add a compatibility migration in `server.js` if existing local DBs need it.
3. Update import/export scripts if content tables changed.
4. Update `ARCHITECTURE.md` database section.
5. Validate with `npm run check` and a fresh local DB if possible.

## Operational Checklist

Before handing off:

```bash
npm run check
curl -s http://127.0.0.1:3001/api/health
```

Manual browser smoke:

- Home loads.
- Belajar loads.
- `Teknik Integrasi` opens multiple-choice practice.
- `Try Canvas` opens canvas practice, and `Try Pilgan` returns to multiple choice.
- Canvas focus mode keeps navigation at toolbar edges and hides the middle submit button.
- Unsupported chapter shows empty state.
- Profile page opens.
