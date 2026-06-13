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
| Auth | Login works through the existing shell. Email/password sign-up requires an email verification link before login is allowed. Clerk Google auth is available through the auth shell, syncs to local SQLite users, and can prompt first-time Google users for a Mafiking display name. |
| Belajar | Sections are `Try Out`, `Matematika`, `Fisika`, `Kimia`. Copy is split/highlighted as `Selamat datang` plus `pejuang IP 4.0`, and the tabs use a sliding underline with `Try Out` in ink. |
| Free Try Out | `Coba Gratis` routes to `Belajar -> Try Out`; `Mulai` opens a confirmation screen before the free 15-question / 15-minute session. Protected review paths require login/sign-up. |
| Practice | Multiple-choice-first flow with optional canvas mode; OCR/transcription and answer evaluation use Gemini 3.1 Flash Lite. Unsupported chapters show empty state. |
| Admin | Role-gated shield adds an `Admin Panel` page entry. Admin page manages content, landing media, users, AI import, and Try Out packages. |
| Payment | QRIS-first package checkout creates an order in-app and shows a QRIS/manual popup; `/payment?merchantOrderId=...` reopens status without global nav. Duitku remains legacy/fallback provider code. |
| Profile | Deterministic recommendation engine plus Gemma 4 31B narrative text, with local fallback. |

## Routes

| Route | Component | Notes |
| --- | --- | --- |
| `lobby` | `Landing` / auth shell in `src/lobby.jsx` | Public landing and login/sign-up. |
| `belajar` | `Belajar` | Free Try Out plus subject cards. |
| `misi` | `Misi` | Access-gated daily mission screen. |
| `tryout` | `Tryout` | Package / paid tryout screen; nav label is `Paket`. |
| `leaderboard` | `Leaderboard` | Peringkat page; nav label is `Peringkat`. |
| `admin` | `AdminPanel` | Dedicated admin page when admin mode is enabled. |
| `profile` | `Profile` | Stats, attempts, AI/local recommendations. |
| `practice` | `Practice` | Multiple-choice and canvas modes. |
| `payment` | `PaymentCheckoutModal` + QRIS/manual popup | Checkout popup rendered over current page. |
| `invoices` | `Invoices` | Payment history with printable invoice view. |

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

Important caveat: `src/admin-monitoring.jsx` exists and is loaded before `src/admin.jsx` in `MAFIKING.html`. It exports `window.AdminMonitoringPanel` for the monitoring tab.

## Frontend Files

| File | Purpose |
| --- | --- |
| `src/app.jsx` | Route state, admin shield state, confirmation modals, root render. |
| `src/shared.jsx` | Nav, icons, toasts, shared UI helpers, `SlidingSegmented`. |
| `src/backend-api.jsx` | Same-origin API helper, `clerkAuthHeaders()`. |
| `src/clerk-auth.jsx` | Clerk browser bridge for static Babel runtime. |
| `src/math-loader.js` | KaTeX lazy-loading, `useKatexReady()` hook. |
| `src/onboarding.jsx` | Mandatory profile completion modal for non-admin users. |
| `src/route-prefetch.js` | Route prefetching for faster navigation. |
| `src/lobby.jsx` | Landing page, auth shell, inline admin media editor. |
| `src/belajar.jsx` | Try Out/Matematika/Fisika/Kimia selector and chapter cards. |
| `src/practice.jsx` | Practice source mapping, multiple-choice/canvas modes, result handling. |
| `src/profile.jsx` | Profile stats and recommendations. |
| `src/misi.jsx` | Daily missions. |
| `src/tryout.jsx` | Paket / package page. |
| `src/leaderboard.jsx` | Peringkat page with isolated-scroll leaderboard. |
| `src/invoices.jsx` | Payment history page with printable invoice view. |
| `src/payment.jsx` | Payment selection, QRIS/manual popup rendering, and status polling. |
| `src/admin.jsx` | Admin content, landing media, users, import, and tab shell. |
| `src/admin-monitoring.jsx` | Monitoring dashboard loaded before `admin.jsx`. |
| `src/performance-vitals.js` | Core Web Vitals collection and RUM data. |
| `src/main.jsx` | Vite entry — React globals + legacy-global bootstrap. |
| `src/styles.css` | Design tokens, landing motion, admin styles, confirmation modal support. |
| `MAFIKING.html` | Legacy HTML shell and script load order. |
| `index.html` | Vite entry — fonts, `main.jsx` module. |

## Backend And Data

- Database file: `db/database.sqlite`.
- Schema source: `db/schema.sql`.
- Portable question bank: `db/question-bank.json`.
- Real imported practice bank: Integral only.
- Key newer tables: `tryout_packages`, `user_access_grants`, `ai_token_usage`, `landing_media`.
- Clerk auth adds local user columns: `clerk_id`, `email`, and `auth_provider`. Local email/password signup also uses `email_verified_at` and hashed verification-token columns. Backend helpers live in `middleware/clerk-auth.js`, `lib/clerk-user-sync.js`, `lib/email-verification.js`, `lib/mailer.js`, and `routes/webhooks.js`.
- Clerk webhook sync uses `POST /api/webhooks/clerk`; Google onboarding and guest merge use `POST /api/auth/clerk-onboard`.
- Gemini/Gemma token usage is logged observationally and displayed from local data/limits, not live Google quota.

## Recommendation Data

- Catalog: `data/recommendation-catalog.json`.
- Reference questions: `docs/purcell-inspired-question-bank.md`.
- Engine: `lib/recommendation-engine.js`.
- Profile narrative provider: Gemma via `routes/correction.js`.
- Contract: `/api/correction/profile-summary` preserves deterministic `recommendedItems`, `recommendedQuestions`, and `skillNeedScores`.

## Performance (2026-06-12)

- **Bundle:** 24.24 KB initial JS gzip (main + vendor-react) — 86% reduction from 175KB baseline.
- **Route splitting:** Vite dynamic imports for each route chunk via `src/app.jsx`.
- **Image optimization:** AVIF/WebP with responsive variants in `assets/`.
- **Lazy loading:** KaTeX CSS+JS (`src/math-loader.js`), Clerk SDK (`src/clerk-auth.jsx`), mentor/landing images.
- **Core Web Vitals targets:** LCP < 2.5s, INP < 200ms, CLS < 0.1, FCP < 1.8s.
- **Lighthouse mobile:** ≥90 (baseline was 76/77).

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
