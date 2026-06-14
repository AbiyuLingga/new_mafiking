# Project Layout

This document is the placement guide for new files in `new_mafiking`.
Run `npm run check:layout` after moving or adding files.

## Root

Keep only entrypoints and tooling files that are discovered from the project
root:

- `server.js`, `index.html`, and `MAFIKING.html`
- package manifests and build configuration
- deploy scripts
- `README.md`, `ARCHITECTURE.md`, and `AGENTS.md`

Do not place feature code, tests, plans, runtime logs, cookies, or database
backups in the root.

## Backend

`server.js` remains the Express entrypoint. Put backend modules under
`server/`:

| Directory | Responsibility |
| --- | --- |
| `server/routes/` | Express routers and public API contracts |
| `server/middleware/` | Request authentication and authorization |
| `server/ai/` | AI clients, provider pool, schemas, token logging, prompts |
| `server/auth/` | User linking and email verification |
| `server/config/` | Runtime feature flags and app settings |
| `server/learning/` | Recommendation, ranking, and learning-session logic |
| `server/notifications/` | Email templates and delivery |
| `server/observability/` | Performance metrics and latency tracking |
| `server/payments/` | QRIS, mutations, reconciliation, payment providers |
| `server/security/` | CSP, CSRF, guards, audit logging, sanitization |
| `server/storage/` | SQLite sessions, backups, profile media |
| `server/workers/` | Standalone background processes |

Use `server/project-paths.js` for root-level filesystem locations. Runtime data
must remain at `db/database.sqlite`, `db/backups/`, `logs/`, and
`profile-media/`.

QRIS provider cookies must use the directory configured by `QRIS_COOKIE_DIR`
(the default app fallback is `/tmp`) and must never be written to the project
root.

## Frontend

Keep only `main.jsx`, `main.css`, and `styles.css` directly under `src/`.

| Directory | Responsibility |
| --- | --- |
| `src/core/` | App shell, global helpers, auth bridge, API helper, prefetch |
| `src/pages/` | Route-level pages |
| `src/features/admin/` | Admin-specific UI |
| `src/features/practice/` | Practice, Canvas, drawing, and toolbar UI |
| `src/generated/` | Ignored output from `scripts/build/build-legacy-entry.js` |

Frontend files used by the legacy fallback must continue exporting required
symbols through `window.*`. Update all of these together when moving or adding
a route:

1. `src/core/route-prefetch.js`
2. `src/core/app.jsx`
3. `scripts/build/build-legacy-entry.js`
4. `MAFIKING.html`
5. `vite.config.js`

## Tooling And Tests

- Put executable tooling in the matching `scripts/` category.
- Put tests in `tests/<domain>/`; never add `scripts/test-*.js`.
- Put portable database content in `db/seeds/`.
- Put schema changes in `db/migrations/`.

## Documentation

- Active operational docs belong in `docs/guides/`, `docs/product/`,
  `docs/sop/`, `docs/performance/`, or `docs/security/`.
- New implementation plans belong in `docs/plans/`.
- Historical plans and agent memory belong in `docs/archive/`.
- Public legal pages belong in `public/legal/`.

Path audits must cover active code and operational documentation. Archived
material may retain old paths when they are part of the historical record.

## Stable Contracts

Physical file moves must not change:

- public API endpoints and payloads
- page routes
- `/assets/*`, `/profile-media/*`, `/tweaks-panel.jsx`, or legal-page URLs
- npm script names
- runtime database, log, backup, and profile-media locations

After structural changes, run:

```bash
npm run check:layout
npm run check
npm run build
git diff --check
```
