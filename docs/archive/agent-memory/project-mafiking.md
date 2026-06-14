---
name: project-mafiking
description: "MAFIKING app - current feature state and touched areas"
metadata:
  node_type: memory
  type: project
  originSessionId: 565135b7-999d-442b-ab83-beabde9bb03f
---

# MAFIKING - Current Project State

Purpose: study platform for ITB TPB students covering Matematika, Fisika, and Kimia. The app combines a public marketing landing page, structured practice, timed Try Out, AI canvas correction, gamification, admin content management, profile reporting, and QRIS-first payments.

Working directory:

```text
/home/abiyulinx/computing/king/new_mafiking
```

## Current Feature State

| Area | Current state |
| --- | --- |
| Runtime | Express serves the Vite-built `dist/index.html` in production. `MAFIKING.html` is a non-production Babel fallback. |
| Landing | `/` is auth-aware and redirects registered sessions to `/belajar`; `/landing` always opens marketing. Admin mode can replace landing media inline, but the old Admin Panel `Landing Page` tab is removed. |
| Auth | Local email/password requires email verification. Clerk Google auth syncs into local SQLite users. New users complete mandatory onboarding; phone is optional except for packages with `bimbel` access. |
| Belajar | Sections are `Try Out`, `Matematika`, `Fisika`, and `Kimia`. Free Try Out is 15 questions / 30 minutes. |
| Practice | Multiple-choice-first flow with optional canvas mode. Canvas correction supports streamed evaluation, multi-provider AI fallback, redlines, and deterministic follow-up recommendations. |
| Peringkat | Live overall, weekly, and per-Try-Out leaderboards read from `/api/progress/leaderboard*`. |
| Admin | Role-gated Admin Panel manages chapters, problems, AI imports, users, payments, Try Out packages/questions/results, and monitoring. The old Landing Page tab is removed. |
| Payment | QRIS-first checkout supports pending-order reuse, SSE paid events, manual/admin resolution, reconciliation webhooks, self-healing collector health, invoices, and legacy Duitku fallback. |
| Profile | Profile editing and avatar uploads use `profile-media/`; recommendations are deterministic and Gemma writes narrative text only. |
| Security | Central security headers, CSP/reporting, CSRF, request guard, SQLite sessions, rate limits, audit logs, shadow-route checks, and payment security regressions are wired into `npm run check`. |

## Browser Routes

| Route | Component | Notes |
| --- | --- | --- |
| `lobby` / `landing` | `Lobby` | Marketing and auth shell. |
| `belajar` | `Belajar` | Free Try Out and subject cards. |
| `misi` | `Misi` | Access-gated daily missions. |
| `tryout` | `Tryout` | Package list, timed sessions, and review. |
| `leaderboard` | `Leaderboard` | Live rankings. |
| `admin` | `AdminPanel` | Admin-only management. |
| `profile` | `Profile` | Profile, stats, and recommendations. |
| `invoices` | `Invoices` | Current-user purchase history and printable invoice. |
| `payment` | `Payment` | Status/deep-link route; normal checkout opens as a modal. |
| `practice` | `Practice` | Multiple-choice and canvas practice. |

## Admin Mode

- Visible only when `currentUser.role === "admin"`.
- Shield activation adds `Admin Panel` to the top navigation.
- Backend admin routes remain protected by `isAuthenticated` and `isAdmin`.
- Localhost bypass exists only in non-production unless `LOCAL_ADMIN_MODE=false`.

Current Admin Panel tabs:

```text
Bab & Subtopik
Soal
Import AI
Pengguna
Pembayaran
Users & Token Monitoring
```

## Main Frontend Files

| File | Purpose |
| --- | --- |
| `src/main.jsx` | Vite shell entry and browser-global bootstrap. |
| `src/app.jsx` | Route state, auth/onboarding gates, dynamic route loading, admin shield. |
| `src/route-prefetch.js` | Cached route loaders and network-aware prefetch. |
| `src/lobby.jsx` | Landing and auth UI. |
| `src/belajar.jsx` | Section selector and free/premium Try Out entry. |
| `src/tryout.jsx` | Timed Try Out session, autosave, submit, and review. |
| `src/practice.jsx` | Practice question flow and correction submit. |
| `src/profile.jsx` | Profile editing, avatar UI, stats, and recommendations. |
| `src/payment.jsx` | Checkout, QRIS/manual status, SSE, and polling fallback. |
| `src/invoices.jsx` | Purchase history and printable invoice. |
| `src/leaderboard.jsx` | Live overall/weekly/Try-Out rankings. |
| `src/admin.jsx` | Admin content, users, payments, imports, and tab shell. |
| `src/admin-monitoring.jsx` | Admin monitoring dashboard. |

## Backend And Data

- Runtime database: `db/database.sqlite`; schema source: `db/schema.sql`.
- Portable content: `db/seeds/question-bank.json`, `db/seeds/tryout-bank.json`, and `db/seeds/daily-missions.json`.
- Runtime profile files: `profile-media/`; back up and restore them together with SQLite.
- Core routes: `auth`, `quiz`, `tryouts`, `progress`, `correction`, `payment`, `admin`, `admin-import`, `admin-payments`, `internal`, `auth-popup`, and `webhooks`.
- Payment v3 helpers include `server/payments/payment-reconciler.js`, `server/payments/payment-broadcaster.js`, `server/payments/confidence-matcher.js`, and `server/payments/self-healing-collector.js`.

## Validation

```bash
npm run check
npm run build
```

Focused runtime checks:

1. `/` redirects registered sessions to `/belajar`; `/landing` remains public marketing.
2. Free Try Out starts a 15-question / 30-minute session.
3. Admin tabs include `Pembayaran` and do not include `Landing Page`.
4. Profile avatar upload survives deploy/backup workflows.
5. Payment status can reopen from `/payment?merchantOrderId=...` and receive SSE or polling updates.
