---
name: project-mafiking
description: "MAFIKING app — what it is, current feature state, all files touched"
metadata: 
  node_type: memory
  type: project
  originSessionId: 565135b7-999d-442b-ab83-beabde9bb03f
---

# MAFIKING — Bimbel TPB ITB

**Purpose:** Study platform for ITB freshman students. Subjects: Matematika, Fisika, Kimia. Features: structured modules, adaptive practice, AI correction (Gemini), gamification (XP, streak, level).

**Working directory:** `/home/abiyulinx/computing/king/new_mafiking`

---

## Current feature state (as of 2026-05-20)

### Pages / routes
| Route | Component | Status |
|---|---|---|
| `lobby` | `Lobby` → `Landing` (guest) / `Dashboard` (registered) | Done |
| `belajar` | `Belajar` | Done + admin mode |
| `misi` | `Misi` | Done |
| `tryout` | `Tryout` | Done |
| `profile` | `Profile` | Done + deterministic catalog recommendations |
| `payment` | `Payment` + `PaymentStatus` | Done |
| `practice` | `Practice` → `ChoiceView` / `CanvasView` | Done + slide admin add flow |

### Admin mode
- Toggled by **shield button** (bottom-right corner, fixed) in `app.jsx`
- State: `isAdmin` in `App` component, default `false`
- When active: button turns yellow
- **Belajar page:** shows `AdminBelajarView` backed by DB admin APIs — chapter list with edit/delete per bab and "+ Tambah Bab Baru" row at bottom
- **Practice page:** shows a slide-based `AdminPracticeBar` below each question. Existing soal are shown as slide cards, the final `+ Tambah Soal` card opens a plug-and-play add editor, and Edit Soal/Edit Langkah/Hapus still call the DB API.
- No login required to enter admin mode (testing convenience)

### Key completed UX improvements (from full plan)
- **ModeSegment** segmented control (Pilgan | Kanvas) replaces old text buttons
- **Submit always visible** in canvas focus mode (disabled until canvas dirty)
- **Lobby split:** `Landing` for guests (`Tamu_XXXX`) vs `Dashboard` for registered users
- **Toast system:** `showToast(msg, type, duration)` global — triggers on XP gain, errors, save events
- **OfflineBanner** in `app.jsx`
- **Skeleton** loading states in practice and profile
- **Payment flow:** `payment.jsx` polls Duitku, shows success/pending/failed states
- **Profile recommendations:** `/api/correction/profile-summary` returns deterministic `recommendedItems` and `skillNeedScores` from the Purcell-aligned catalog; Gemini can write summary text but does not freely select follow-up questions.
- **Design tokens:** `tone-icon-*`, `tag-emerald`, CSS vars for draw colors; Tailwind config extended with `tone.*` colors and `letterSpacing.tight-*`
- **A11y:** `aria-label` on icon buttons, `text-ink/55` contrast fixes, focus rings

### Gamification data
- Auto-guest sessions: server creates `Tamu_XXXX` users automatically
- Admin DB user: username `admin`, password `admin1234`, role `admin` (created 2026-05-15)
- DB file: `db/database.sqlite` (NOT `db/mafiking.db` — that file is empty/wrong)

---

## Frontend files (all in `src/`)

| File | Purpose |
|---|---|
| `admin.jsx` | Admin UI — DB-wired `AdminBelajarView`, compact `Admin Soal` card deck, inline question/choice/step editing, full `AdminPanel`, and AI import tabs |
| `answer-board.jsx` | Canvas drawing board with toolbar |
| `app.jsx` | Router, `isAdmin` toggle state, shield toggle button, passes props down |
| `backend-api.jsx` | `MafikingAPI.get/post`, `parseApiResponse` |
| `belajar.jsx` | Chapter browser — 3 card variants (numbered/soft/magazine), admin branch to `AdminBelajarView` |
| `drawing-canvas.jsx` | Low-level stylus/mouse canvas |
| `lobby.jsx` | `Landing` (marketing) + `Dashboard` (logged-in) |
| `misi.jsx` | Daily mission cards — 4 variants |
| `payment.jsx` | Payment package selection + Duitku redirect + status polling |
| `practice.jsx` | `Practice` → `ChoiceView` + `CanvasView`, `ResultModal`, `ModeSegment`, helpers |
| `profile.jsx` | User stats, streak, level, profile summary, and catalog-backed recommendation cards |
| `shared.jsx` | `Nav`, `Footer`, `Icon`, `Skeleton`, `showToast`, `ToastContainer`, `OfflineBanner` |
| `styles.css` | All CSS — design tokens, component classes, admin styles (appended at end) |
| `toolbar.jsx` | Practice toolbar (submit, focus mode, undo/redo) |
| `tryout.jsx` | Mock exam page |
| `MAFIKING.html` | Entry point — script load order, Tailwind inline config, meta tags |

---

## Chapter data
Static `chapterData` object in `belajar.jsx` is still used as a display fallback/reference for copied UI cards. Admin chapter changes go through DB routes such as `/api/admin/chapters` and persist to `db/database.sqlite`.

## Recommendation data

- Catalog source: `data/recommendation-catalog.json`, version `2026-05-20.purcell-v1`.
- Question source: `docs/purcell-inspired-question-bank.md`, original Mafiking questions aligned to Purcell/Varberg/Rigdon topic coverage.
- Runtime engine: `lib/recommendation-engine.js`.
- Optional profile narrative provider: `lib/ai-profile-provider.js` talks to 9Router when `AI_PROFILE_PROVIDER=9router`; `NINEROUTER_MODELS` round-robins through a smoke-tested allowlist.
- API contract: `POST /api/correction/profile-summary` preserves `recommendedQuestions` and adds `recommendedItems` plus `skillNeedScores`; local recommendations can use up to 200 attempts while Gemini narrative uses 20 newest attempts.
- Test command: `npm run test:recommendations` or full `npm run check`.
