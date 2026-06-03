# Mafiking secrets rotation runbook

Phase 3 deliverable. The procedural how-to for rotating every secret
that Mafiking uses, in the right order, with no user-visible downtime.

## Inventory

| Secret | Where it lives | Rotation cadence | Blaster radius |
|---|---|---|---|
| `SESSION_SECRET` | `.env` (production), `CSRF_SECRET` falls back to it (hashed) | 90 days | All sessions invalidate. Users must re-login. CSRF tokens also invalidate. |
| `CSRF_SECRET` | `.env` | 90 days | All CSRF tokens invalidate. Users are silently re-issued tokens on next page load. |
| `CLERK_SECRET_KEY` | `.env` | 90 days, or on any Clerk Dashboard compromise notification | Backend cannot verify Clerk Bearer tokens. Auth breaks until the new key is set. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Clerk Dashboard | 90 days | New webhooks rejected. Re-issuing requires re-deploying with the new secret. |
| `GEMINI_KEY_1`...`GEMINI_KEY_20` | `.env` | When a key is flagged by Google's quota or abuse alerts | One key at a time. The pool is round-robin. |
| `GEMMA_PROFILE_MODEL` | `.env` (optional override) | n/a — model name string | n/a |
| `DEEPSEEK_API_KEY` | `.env` | 90 days | Admin import (draft) breaks. |
| `DUITKU_MERCHANT_CODE`, `DUITKU_API_KEY` | `.env` | 90 days | All real Duitku payments break. Mock mode still works. |
| `BETA_USERNAME` | `.env` | On personnel change | Login lockout. |

## Rotation procedure (per secret)

### 1. `SESSION_SECRET` and `CSRF_SECRET`
1. Generate a new value: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
2. Put the new value in `.env` on a **staging** deploy first. Verify
   that no `SESSION_SECRET wajib diset` error is thrown at boot.
3. Staging smoke test:
   - Log in → session cookie set.
   - Call `/api/csrf-token` → token returned.
   - Call a state-changing endpoint with the token → 200.
4. Promote to production. Restart the app.
5. All existing sessions and CSRF tokens are invalidated. Users
   see a normal "session expired, please log in" UX.

### 2. `CLERK_SECRET_KEY`
1. In the Clerk Dashboard, create a new secret key.
2. Add the new key to `.env` on staging. Old key is still set as a
   secondary.
3. Run staging smoke: log in via Google → Clerk Bearer token is
   accepted by `@clerk/express`.
4. Remove the old key from the Clerk Dashboard. Remove from `.env`
   once the app is fully on the new key.
5. The key change is non-disruptive because Clerk supports multiple
   active keys.

### 3. `CLERK_WEBHOOK_SIGNING_SECRET`
1. In Clerk Dashboard, create a new webhook endpoint (or rotate the
   signing secret on the existing one).
2. Update `.env` on staging. Trigger a `user.created` event from the
   Clerk Dashboard test panel.
3. Verify the log: `[clerk-webhook] user upserted for clerk id <id>`.
4. Promote to production.

### 4. `GEMINI_KEY_*`
1. In Google AI Studio, create a new API key.
2. Add to `.env` as the next slot (`GEMINI_KEY_21`, for example).
3. The pool is round-robin; the new key will be picked up immediately.
4. Optionally remove the oldest key (`GEMINI_KEY_1`) after 24 hours
   to give any in-flight requests time to drain.
5. If a key is **compromised** (e.g. accidentally committed), remove
   it from `.env` immediately and rotate.

### 5. `DEEPSEEK_API_KEY`
1. In DeepSeek dashboard, create a new key.
2. Update `.env`. Restart the app.
3. Run a test import as admin: `POST /api/admin/import/draft`.

### 6. `DUITKU_API_KEY` and `MERCHANT_CODE`
1. In Duitku dashboard, request key rotation.
2. Once the new key is issued, update `.env`. Restart the app.
3. **Important:** if the merchant code changes, the callback URL
   in the Duitku dashboard must be updated to the new merchant.
4. Verify with a sandbox transaction: `POST /api/payment/create`
   with `packageId: 'trial'`.

### 7. `BETA_USERNAME`
1. Update `.env` to the new value. Restart.
2. The old username can no longer log in (returns 401 "Username atau
   password salah" — same as a wrong password; no information leak).

## What to do if a secret leaks publicly

1. **Triage within 1 hour.** Identify the secret, the leak vector
   (GitHub commit, npm bundle, log file, etc.), and the blast radius
   (see table above).
2. **Rotate immediately.** Follow the per-secret procedure above.
   Do not wait for the next change window.
3. **Audit the log.** Look for unexpected use of the secret between
   the leak time and the rotation time:
   - `npm audit`-style: search `logs/audit.log` for the time window.
   - For Clerk / Duitku: their dashboards show last-used time.
4. **Post-mortem.** Write a 1-page doc to `docs/security/posture.md`
   with the timeline, root cause, and remediation. The next posture
   review (monthly) revisits it.

## Storage rules

- `.env` and `.env.local` are git-ignored (per AGENTS.md).
- `CSRF_SECRET`, `SESSION_SECRET`, `GEMINI_KEY_*`, `DEEPSEEK_API_KEY`,
  `CLERK_*`, `DUITKU_*` are **never** committed, never logged in
  `console.info`/`console.error`, and never serialized to the client
  bundle.
- A TruffleHog pre-commit / pre-push hook (Phase 3.2) prevents
  accidental commits.
- The `audit-log.js` writer sanitizes any string > 16 KB but does
  not specifically redact secrets. Operators should be careful when
  sharing audit-log snippets.
