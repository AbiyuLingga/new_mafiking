---
name: architecture-mafiking
description: "MAFIKING technical architecture - runtime, load order, globals, current constraints"
metadata:
  node_type: memory
  type: project
  originSessionId: 565135b7-999d-442b-ab83-beabde9bb03f
---

# MAFIKING Technical Architecture

## Runtime

- Backend: Express 5 + `better-sqlite3`, default port `3000`.
- Frontend: `MAFIKING.html` loads React 18 UMD, ReactDOM UMD, Babel standalone, then static `src/*.jsx`.
- This is not a conventional Vite SPA at runtime. `index.html` and Vite are build/check mirrors.
- `npm run dev` runs `node --watch server.js`.
- `npm run check` runs Node syntax checks plus focused test scripts.

## Script Load Order

Current `MAFIKING.html` script order:

```text
tweaks-panel.jsx
src/clerk-auth.jsx
src/backend-api.jsx
src/shared.jsx
src/lobby.jsx
src/belajar.jsx
src/profile.jsx
src/toolbar.jsx
src/drawing-canvas.jsx
src/answer-board.jsx
src/practice.jsx
src/misi.jsx
src/tryout.jsx
src/payment.jsx
src/admin.jsx
src/app.jsx
```

`src/app.jsx` mounts the root and must stay last. There is no `src/admin-monitoring.jsx` file in the current tree; admin monitoring UI must either live in `src/admin.jsx` or a new script must be added before `src/admin.jsx`.

## Global Scope Pattern

- Babel standalone evaluates the JSX files in browser global scope.
- Do not wrap files in IIFEs if later scripts need their components.
- Use `window.*` for components that must be consumed by later files.
- `src/backend-api.jsx` exposes `MafikingAPI`.
- `src/clerk-auth.jsx` exposes `window.MafikingClerk`.
- `src/shared.jsx` exposes shared UI helpers such as `Icon`, `Skeleton`, `showToast`, `ToastContainer`, and `OfflineBanner`.
- `src/belajar.jsx` exposes `window.chapterData` for practice route chapter switching.

## Route Model

`src/app.jsx` owns route state:

```text
lobby
belajar
misi
tryout
admin
profile
practice
payment
```

Important route behavior:

- `/` renders the public landing page for guests and logged-in users.
- Mafiking logo returns to the public landing page.
- Landing `Coba Gratis` routes to `Belajar -> Try Out`.
- Global app nav is hidden on `lobby`, `practice`, and `/payment?merchantOrderId=...`.
- App nav labels are `Beranda`, `Misi Harian`, and `Paket`; `Beranda` maps to `belajar`, `Paket` maps to `tryout`.
- Payment package selection uses the app shell, but payment status is a popup overlay rendered through a React portal into `document.body`. `appStateToPath()` must preserve `merchantOrderId` in `/payment?merchantOrderId=...` so deep links and refreshes reopen the order status instead of falling back to package selection.
- Admin role users see the shield. Turning it on adds an `Admin Panel` nav entry that routes to `admin`.
- Logout and return-to-landing confirmations are centered modals using the Mafiking yellow/ink theme.
- Auth supports both local username/password and Clerk Google sign-in. Clerk browser scripts are loaded dynamically from the publishable key, and backend requests include a Clerk Bearer token when signed in.

## Landing Page

`src/lobby.jsx` owns:

- Google AI Studio-inspired marketing landing.
- Scroll and click reveal animations implemented with local CSS/JS, not a bundled Framer Motion dependency.
- Login and sign-up shells.
- Clerk Google sign-in/sign-up controls inside the auth shell.
- Inline admin media editing when admin mode is active.

Landing media flow:

```text
GET /api/landing-media
  -> reads landing_media slots
Admin Landing Page tab or inline edit
  -> POST /api/admin/landing-media
  -> stores uploaded file under assets/landing/
```

The video demo section intentionally has no background grid after the latest UI correction.

## Belajar And Practice

`src/belajar.jsx` has four sections:

```text
Try Out
Matematika
Fisika
Kimia
```

- The free Try Out entry opens a confirmation screen before the 15-question / 15-minute session.
- Free Try Out review paths outside the session and protected subject chapters route through login/sign-up.
- The mapel tab underline slides between sections; `Try Out` uses the ink accent while subject tabs use their mapel accent colors.
- The heading copy is split/highlighted as `Selamat datang` plus `pejuang IP 4.0`.
- Unsupported subject chapters show an empty state instead of falling back to Integral.

`src/practice.jsx` starts in multiple-choice mode and supports optional canvas mode through `Try Canvas`.

## Admin Architecture

Admin is role-gated:

- Frontend shield visibility depends on `currentUser.role === "admin"`.
- Backend admin routes require `isAuthenticated` and `isAdmin`.
- Local development still has a localhost admin API bypass unless `LOCAL_ADMIN_MODE=false`.

Admin page tabs in `src/admin.jsx`:

```text
Bab & Subtopik
Soal
Import AI
Landing Page
Pengguna
Users & Token Monitoring
```

Current implementation notes:

- `Bab & Subtopik` starts with a content selector: `Try Out`, `Matematika`, `Fisika`, `Kimia`.
- `Try Out` uses `/api/admin/tryout-packages`.
- Subject options use chapter/subtopic/problem CRUD.
- `Landing Page` manages promo image, feature images, and demo video media slots.
- `Pengguna` manages users and roles.
- `Users & Token Monitoring` has backend data available at `/api/admin/dashboard-data`; the current tree does not include a separate `src/admin-monitoring.jsx`, so any richer monitoring UI must be implemented or restored before documenting it as loaded.

## Backend Routes

Core route modules:

```text
routes/auth.js
routes/quiz.js
routes/progress.js
routes/correction.js
routes/admin.js
routes/payment.js
routes/admin-import.js
```

Important admin endpoints:

```text
GET/POST/PUT/DELETE /api/admin/chapters
GET/POST/PUT/DELETE /api/admin/subtopics
GET/POST/PUT/DELETE /api/admin/problems
GET/POST/PUT/DELETE /api/admin/problems/:id/steps
GET/POST/DELETE     /api/admin/landing-media
GET/POST/PUT/DELETE /api/admin/tryout-packages
GET                 /api/admin/users
PUT                 /api/admin/users/:id/password
GET                 /api/admin/dashboard-data
POST                /api/admin/users/:id/reset-password
POST                /api/admin/users/:id/grant-access
POST                /api/admin/users/:id/role
POST                /api/admin/import/draft
POST                /api/admin/import/commit
```

Public frontend data endpoints:

```text
GET /api/config/clerk
GET /api/landing-media
GET /api/tryout-packages
```

Clerk webhook endpoint:

```text
POST /api/webhooks/clerk
```

The webhook uses raw request body parsing and `svix` signature verification with `CLERK_WEBHOOK_SIGNING_SECRET`.

## Database

Runtime DB: `db/database.sqlite`.

Schema source: `db/schema.sql`.

Important tables:

```text
users
chapters
subtopics
problems
problem_steps
payments
user_progress
correction_attempts
practice_attempts
profile_ai_refreshes
tryout_packages
user_access_grants
ai_token_usage
landing_media
```

Clerk integration adds `users.clerk_id`, `users.email`, and `users.auth_provider`. Clerk users are linked by `clerk_id` first, then by email/username match, so existing local progress can be preserved. First-time Google users can complete onboarding through `POST /api/auth/clerk-onboard`, which also supports merging auto-guest data into the linked account.

`server.js` executes `db/schema.sql` on startup and applies compatibility migrations for older local DBs.

## AI And Recommendations

- Canvas OCR/evaluation uses Gemini 3.1 Flash Lite with key fallback from `GEMINI_KEY_1` through `GEMINI_KEY_20`.
- Successful AI usage is logged in `ai_token_usage` through `lib/log-token-usage.js`; logging must not break user requests.
- Profile recommendations are deterministic and catalog-backed through `lib/recommendation-engine.js`.
- Gemma 4 31B writes profile narrative text by default, but should not select final recommendation refs.

## Known Constraints

- Browser runtime still uses Babel in the browser and CDN UMD scripts.
- `dist/` is not the deployed runtime.
- Only Integral has real imported question data today.
- Monitoring quota values are estimates from configured limits, not live Google quota reads.
- `src/admin.jsx` references `window.AdminMonitoringPanel`, but no separate component script exists in the current tree.
- QRIS is the default payment provider. Duitku remains legacy/fallback code and uses the sandbox base URL unless deliberately configured.
