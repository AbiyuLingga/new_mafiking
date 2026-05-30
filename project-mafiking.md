---
name: project-mafiking
description: "MAFIKING app - current feature state and touched areas"
metadata:
  node_type: memory
  type: project
  originSessionId: 565135b7-999d-442b-ab83-beabde9bb03f
---

# MAFIKING - Bimbel TPB ITB

Purpose: study platform for ITB TPB students covering Matematika, Fisika, and Kimia. The app combines a public marketing landing page, free Try Out entry, structured practice, AI canvas correction, gamification, admin content management, and payment hooks.

Working directory in this Windows checkout:

```text
C:\Coding\new_mafiking
```

Historical WSL path used by older notes:

```text
/home/abiyulinx/computing/king/new_mafiking
```

## Current Feature State

| Area | Current state |
| --- | --- |
| Runtime | Express serves `MAFIKING.html`; React UMD + Babel standalone loads static JSX files. |
| Landing | Public landing always opens at `/`, uses the new Google AI Studio-inspired interface, local reveal animations, logo-to-landing behavior, and admin-editable media slots. |
| Auth | Login works through the existing shell. Sign-up temporarily reuses the auth shell with sign-up labels. Clerk Google auth is available through the auth shell, syncs to local SQLite users, and can prompt first-time Google users for a Mafiking display name. |
| Belajar | Sections are `Try Out`, `Matematika`, `Fisika`, `Kimia`. Copy uses `Selamat datang pejuang IP 4.0`. |
| Free Try Out | `Coba Gratis` routes to `Belajar -> Try Out`; free multiple-choice entry opens without login. Canvas/pembahasan requires login/sign-up. |
| Practice | Multiple-choice-first flow with optional canvas mode and Gemini correction. Unsupported chapters show empty state. |
| Admin | Role-gated shield adds an `Admin Panel` page entry. Admin page manages content, landing media, users, AI import, and Try Out packages. |
| Payment | Duitku create/status/callback routes exist; code uses sandbox base URL by default. |
| Profile | Deterministic recommendation engine plus optional Gemini/9Router narrative text. |

## Routes

| Route | Component | Notes |
| --- | --- | --- |
| `lobby` | `Landing` / auth shell in `src/lobby.jsx` | Public landing and login/sign-up. |
| `belajar` | `Belajar` | Free Try Out plus subject cards. |
| `misi` | `Misi` | Access-gated daily mission screen. |
| `tryout` | `Tryout` | Package / paid tryout screen; nav label is `Paket`. |
| `admin` | `AdminPanel` | Dedicated admin page when admin mode is enabled. |
| `profile` | `Profile` | Stats, attempts, AI/local recommendations. |
| `practice` | `Practice` | Multiple-choice and canvas modes. |

## Admin Mode

- Visible only when `currentUser.role === "admin"`.
- Shield sits at the bottom-right and turns yellow when active.
- Activating the shield adds `Admin Panel` to the top nav instead of opening a popup.
- Admin route is still protected by backend middleware.
- Local dev can bypass admin API auth on localhost unless `LOCAL_ADMIN_MODE=false`.
- Logout and return-to-landing use centered yellow/ink confirmation modals.

Admin page tabs:

```text
Bab & Subtopik
Soal
Import AI
Landing Page
Pengguna
Users & Token Monitoring
```

Important caveat: `src/admin.jsx` currently references `window.AdminMonitoringPanel`, but there is no `src/admin-monitoring.jsx` file in the repository. Backend dashboard data exists at `/api/admin/dashboard-data`; the richer monitoring UI needs to live in `src/admin.jsx` or be restored as a script before claiming it is loaded.

## Frontend Files

| File | Purpose |
| --- | --- |
| `src/app.jsx` | Route state, admin shield state, confirmation modals, root render. |
| `src/shared.jsx` | Nav, icons, toasts, shared UI helpers. |
| `src/backend-api.jsx` | Same-origin API helper. |
| `src/clerk-auth.jsx` | Clerk browser bridge for static Babel runtime. |
| `src/lobby.jsx` | Landing page, auth shell, inline admin media editor. |
| `src/belajar.jsx` | Try Out/Matematika/Fisika/Kimia selector and chapter cards. |
| `src/practice.jsx` | Practice source mapping, multiple-choice/canvas modes, result handling. |
| `src/profile.jsx` | Profile stats and recommendations. |
| `src/misi.jsx` | Daily missions. |
| `src/tryout.jsx` | Paket / package page. |
| `src/payment.jsx` | Payment selection and status polling. |
| `src/admin.jsx` | Admin content, landing media, users, import, and tab shell. |
| `src/styles.css` | Design tokens, landing motion, admin styles, confirmation modal support. |
| `MAFIKING.html` | Active HTML shell and script load order. |

## Backend And Data

- Database file: `db/database.sqlite`.
- Schema source: `db/schema.sql`.
- Portable question bank: `db/question-bank.json`.
- Real imported practice bank: Integral only.
- Key newer tables: `tryout_packages`, `user_access_grants`, `ai_token_usage`, `landing_media`.
- Clerk auth adds local user columns: `clerk_id`, `email`, and `auth_provider`. Backend helpers live in `middleware/clerk-auth.js`, `lib/clerk-user-sync.js`, and `routes/webhooks.js`.
- Clerk webhook sync uses `POST /api/webhooks/clerk`; Google onboarding and guest merge use `POST /api/auth/clerk-onboard`.
- Gemini token usage is logged observationally and displayed from local data/limits, not live Google quota.

## Recommendation Data

- Catalog: `data/recommendation-catalog.json`.
- Reference questions: `docs/purcell-inspired-question-bank.md`.
- Engine: `lib/recommendation-engine.js`.
- Optional profile narrative provider: `lib/ai-profile-provider.js`.
- Contract: `/api/correction/profile-summary` preserves deterministic `recommendedItems`, `recommendedQuestions`, and `skillNeedScores`.

## Current Validation

Standard check:

```bash
npm run check
```

Browser smoke priorities:

1. `/` loads landing.
2. `Coba Gratis` opens `Belajar -> Try Out`.
3. Free Try Out multiple choice opens.
4. Protected subject chapters route through login/sign-up when logged out.
5. Admin shield appears only for admin users.
6. Admin Panel opens as a dedicated route.
7. Landing media tab can upload/replace media.
