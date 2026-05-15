---
name: architecture-mafiking
description: "MAFIKING technical architecture — runtime, load order, global scope, key constraints"
metadata: 
  node_type: memory
  type: project
  originSessionId: 565135b7-999d-442b-ab83-beabde9bb03f
---

# MAFIKING Technical Architecture

## Runtime
- **Backend:** Express 5 + `better-sqlite3`, port 3000
- **Frontend:** React 18 UMD + Babel standalone 7.29.0 (CDN) — **NOT a Vite/webpack SPA**
- Entry point served by Express: `MAFIKING.html` (not `index.html`)
- JSX files are `<script type="text/babel" data-presets="react">` — Babel compiles in browser at runtime
- `npm run dev` = `node --watch server.js`
- `npm run check` = Vite build (syntax check only) + `node --check` on server files

## Script load order in MAFIKING.html
```
tweaks-panel.jsx
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
src/admin.jsx       ← added in this session
src/app.jsx
```
Order matters — later files can use globals from earlier files.

## Global scope pattern
- Babel standalone evaluates each script in the browser's global scope
- `const Foo = () => <div/>` at top level of a script IS accessible globally by later scripts
- **Do NOT use IIFE** `(function(){...})()` — variables inside are scoped and not global
- Aliased hooks in admin.jsx to avoid conflicts: `useAdminState`, `useAdminEffect`, `useAdminCallback`
- Components that need explicit export: `window.Belajar = Belajar` etc. (pattern used in older files; newer files rely on implicit global scope)

## Key globals
| Name | Defined in | Purpose |
|---|---|---|
| `MafikingAPI` | `backend-api.jsx` | `.get(path)`, `.post(path, body)` — credentials same-origin |
| `showToast` | `shared.jsx` | `showToast(msg, type, duration)` — global toast trigger |
| `ToastContainer` | `shared.jsx` | Mounted in `app.jsx` |
| `OfflineBanner` | `shared.jsx` | Mounted in `app.jsx` |
| `Skeleton` | `shared.jsx` | Loading shimmer component |
| `Icon` | `shared.jsx` | SVG icon object (Arrow, ChevL, ChevD, Check, Clock, Bulb, Sparkles, Target, CheckCircle) |
| `chapterData` | `belajar.jsx` | Static chapter data by mapel; also set as `window.chapterData` |
| `AdminBelajarView` | `admin.jsx` | Inline admin chapter editor (local-only) |
| `AdminPracticeBar` | `admin.jsx` | Slide-based per-question admin controls in practice |
| `AdminPlugProblemModal` | `admin.jsx` | Plug-and-play add-soal modal opened from the final `+ Tambah Soal` slide |

## Database
- File: `db/database.sqlite` (NOT `db/mafiking.db`)
- Tables: `users`, `chapters`, `subtopics`, `problems`, `problem_steps`, `payments`, `user_progress`, `correction_attempts`
- `users.role`: `'user'` (default) or `'admin'`
- Auto-guest: server creates `Tamu_XXXX` users without login

## Auth
- Session-based (express-session)
- `GET /api/auth/me` — always returns data (auto-creates guest session)
- Guest detection in frontend: `display_name.startsWith('Tamu_')`
- Admin detection: `currentUser?.role === 'admin'` OR `isAdmin` toggle state in `App`

## Admin routes (all protected by isAuthenticated + isAdmin middleware)
```
GET/POST        /api/admin/chapters
PUT/DELETE      /api/admin/chapters/:id
GET/POST        /api/admin/subtopics
PUT/DELETE      /api/admin/subtopics/:id
GET             /api/admin/problems?subtopic_id=X
POST            /api/admin/problems
PUT/DELETE      /api/admin/problems/:id
GET             /api/admin/problems/:id/steps
POST            /api/admin/problems/:id/steps
PUT/DELETE      /api/admin/steps/:id
GET             /api/admin/users
PUT             /api/admin/users/:id/password
```

## CSP (helmet)
`scriptSrc`: `'self'`, `'unsafe-inline'`, `'unsafe-eval'`, jsdelivr, tailwind CDN, unpkg

## Tailwind config (inline in MAFIKING.html + tailwind.config.js)
Custom tokens added:
- `colors.tone.{amber,blue,emerald}.{bg,fg}`
- `letterSpacing.{tight-1,tight-2,tight-3}`

## Admin mode toggle (app.jsx)
```jsx
const [isAdmin, setIsAdmin] = React.useState(false);
// Shield button bottom-right, turns yellow when active
// passes isAdmin to <Belajar> and <Practice>
```
