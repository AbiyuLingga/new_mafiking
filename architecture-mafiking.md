---
name: architecture-mafiking
description: "MAFIKING technical architecture - runtime, route loading, backend modules, and current constraints"
metadata:
  node_type: memory
  type: project
  originSessionId: 565135b7-999d-442b-ab83-beabde9bb03f
---

# MAFIKING Technical Architecture

## Runtime

- Backend: Express 5 + `better-sqlite3`, default port `3000`.
- Production frontend: `server.js` serves Vite-built `dist/index.html`.
- Non-production fallback: `MAFIKING.html` loads React UMD, Babel standalone, and global JSX files when no built client exists.
- Source components preserve `window.*` exports so Vite route chunks and the fallback share one component contract.
- `npm run build` is the frontend validation gate; `npm run check` runs syntax, contract, and security checks.

```text
Browser
  -> Express server.js
  -> dist/index.html
  -> src/main.jsx shell
  -> dynamic route chunk via src/route-prefetch.js
  -> same-origin /api/*
  -> SQLite and optional external providers
```

## Frontend Shell And Routes

`src/main.jsx` loads the small shared shell. `src/app.jsx` owns route state and requests route chunks through `window.MafikingRoutePrefetch.loadRoute()`. The loader caches import promises and applies network-aware prefetch rules.

Current route names:

```text
lobby
belajar
misi
tryout
leaderboard
admin
profile
invoices
payment
practice
```

Important route contracts:

- Registered sessions opening `/` are redirected server-side to `/belajar`.
- `/landing` always opens marketing, including for logged-in users.
- Normal purchases open `PaymentCheckoutModal`; `/payment?merchantOrderId=...` reopens status.
- Practice and full-screen Try Out own their navigation chrome.
- `invoices` is authenticated and maps back to Profil in the top-nav state.
- Free Try Out is 15 questions / 30 minutes. Premium duration comes from package data.

## Frontend Ownership

| File | Responsibility |
| --- | --- |
| `src/app.jsx` | Routing, auth state, onboarding/phone prompts, dynamic route rendering. |
| `src/shared.jsx` | Navigation, shared UI, icons, toasts. |
| `src/backend-api.jsx` | Same-origin API and Clerk/CSRF headers. |
| `src/clerk-auth.jsx` | Lazy Clerk browser bridge and popup auth flow. |
| `src/route-prefetch.js` | Cached route imports and mobile intent prefetch. |
| `src/belajar.jsx` | Subject/Try Out entry cards. |
| `src/tryout.jsx` | Timed session, autosave, submit, and review. |
| `src/practice.jsx` | Multiple-choice/canvas practice. |
| `src/leaderboard.jsx` | Live overall, weekly, and Try-Out rankings. |
| `src/profile.jsx` | Profile editing, avatar upload, stats, recommendations. |
| `src/payment.jsx` | Checkout, QRIS/manual status, SSE, polling fallback. |
| `src/invoices.jsx` | Current-user transaction history and print view. |
| `src/admin.jsx` | Admin content, users, payments, imports, and tabs. |
| `src/admin-monitoring.jsx` | Monitoring panel consumed by `src/admin.jsx`. |

Landing media is read through `GET /api/landing-media`. Admin mode can replace media inline through `/api/admin/landing-media`, while the old `Landing Page` Admin Panel tab remains removed.

## Backend Modules

Mounted route modules:

```text
routes/auth.js
routes/auth-popup.js
routes/webhooks.js
routes/quiz.js
routes/tryouts.js
routes/progress.js
routes/correction.js
routes/payment.js
routes/admin.js
routes/admin-import.js
routes/admin-payments.js
routes/internal.js
```

Key backend boundaries:

- `middleware/clerk-auth.js` verifies Clerk Bearer sessions and maps them to local users.
- `middleware/auth.js` and `middleware/admin.js` enforce registered/admin access.
- `lib/security-headers.js`, `lib/csp.js`, `lib/csrf-protection.js`, and `lib/request-guard.js` own HTTP hardening.
- `lib/sqlite-session-store.js` persists sessions.
- `lib/profile-media.js` validates profile files; `scripts/reconcile-profile-media.js` audits missing files.
- `lib/recommendation-engine.js` chooses deterministic catalog-backed recommendations.
- `lib/multi-provider-pool.js` coordinates Gemini, Groq, and optional OpenRouter for canvas evaluation.

## Payment Architecture

QRIS is the default provider; Duitku remains legacy/fallback.

```text
create/reopen order
  -> QRIS/manual status modal
  -> SSE /api/payment/stream/:merchantOrderId
  -> polling fallback
  -> reconciler markPaymentPaid()
  -> access grant + email + audit log
```

Payment v3 adds:

- pending-order reuse and unique QRIS suffix allocation;
- signed reconciliation endpoints and collector ingestion;
- confidence matching and ambiguous-payment queue;
- admin manual/bulk resolution and audit history;
- payment broadcaster SSE with connection limits;
- self-healing collector heartbeat/circuit breaker;
- current-user invoices with printable detail.

## Admin Architecture

Admin is role-gated in both frontend and backend. Current tabs:

```text
Bab & Subtopik
Soal
Import AI
Pengguna
Pembayaran
Users & Token Monitoring
```

The `Pembayaran` tab uses `/api/admin/payments/*` for pending, ambiguous, manual, bulk, audit, email-resend, and metrics workflows. Content CRUD and Try Out management remain under `/api/admin/*`.

## Database And Runtime State

Primary source/runtime files:

```text
db/schema.sql
db/database.sqlite
db/question-bank.json
db/tryout-bank.json
db/daily-missions.json
profile-media/
```

Important state groups:

- User/auth/profile: `users`, sessions, verification tokens, onboarding fields, `avatar_url`.
- Learning: chapters, subtopics, problems, attempts, Try Out sessions/attempts, missions.
- AI/reporting: correction attempts, token usage, recommendation evidence, latency.
- Payment: payments, grants, suffix locks, reconciliation/audit/ambiguous rows, collector state.

`db/database.sqlite` and `profile-media/` are one recovery pair. Deploy and backup workflows preserve both.

## Current Constraints

- Browser globals remain part of the frontend compatibility contract.
- `MAFIKING.html` must remain functional as a development fallback, but it is not the production entry when `dist/` exists.
- Static chapter cards still outnumber real imported practice problems.
- There is no versioned migration framework; startup applies schema and compatibility migrations.
- Some security/posture documents are dated snapshots and should not be rewritten as current-state guides.
