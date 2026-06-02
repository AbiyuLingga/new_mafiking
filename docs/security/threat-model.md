# Mafiking threat model (stub)

Initial STRIDE sketch to anchor the hardening roadmap. A full OWASP Threat
Dragon DFD is produced in Phase 4 (`threat-model.json` + `threat-model.png`).
This stub is the planning tool we use to triage findings during Phase 1 and
to spot gaps in the controls listed in `baseline.md`.

## Actors and trust boundaries

| Actor | Trust | Notes |
|---|---|---|
| Public visitor (logged out) | Untrusted | Browses lobby, may start free tryout, sees marketing pages. Auto-guest session created on first `/api/*` hit. |
| Registered Mafiking user | Semi-trusted | Owns a local SQLite row synced from Clerk (`lib/clerk-user-sync.js`). Must complete onboarding (`src/onboarding.jsx`) before protected features. |
| Local admin | Trusted | Local-only fallback for dev (`isLocalAdminMode`). Production admins are Clerk users with `role = 'admin'` in the `users` table. |
| Clerk (third party) | Trusted infra | Identity provider. Webhooks are svix-signed. Bearer tokens are verified by `@clerk/express`. |
| Duitku (third party) | Trusted infra for payment redirects | MD5-signs callbacks. Mafiking redirects users out and back. No card data ever touches Mafiking servers. |
| Gemini / Gemma (Google AI) | Trusted infra for prompts | Image OCR, canvas evaluation, profile summary prose. Inputs may be untrusted (see threats below). |
| DeepSeek (third party) | Trusted infra for question import | Admin-only tool (`routes/admin-import.js`). Not in the user request path. |
| Local SQLite (`db/database.sqlite`) | Trusted storage | Single process, WAL mode. Not exposed to the network. |

Trust boundaries: **browser → app**, **app → DB**, **app → Clerk**, **app →
Duitku**, **app → Gemini / DeepSeek**. Every cross-boundary hop is a
candidate threat source.

## Top STRIDE threats (initial, ordered by risk)

1. **Spoofing — session theft via stored XSS**
   The static-Babel architecture keeps `'unsafe-inline'` in the CSP, which
   means a reflected or stored XSS would let an attacker read
   `__Host-mafiking.sid` and impersonate the user.
   *Control:* tightened CSP allowlist (no broad `https:`), report-only mode,
   audit log on auth events. *Follow-up:* nonce migration in a separate plan;
   Phase 1 XSS scan.

2. **Tampering — payment callback spoofing**
   An attacker could try to forge a Duitku callback to grant paid access
   without paying.
   *Control:* Duitku callback is MD5-signed against `merchantCode + amount +
   merchantOrderId + API_KEY`; the handler returns 401 on signature mismatch.
   CSRF exempt. *Verification:* Phase 1 contract test.

3. **Repudiation — admin actions without an audit trail**
   Admin resets, role changes, and content edits need a tamper-evident log
   to be useful in an investigation.
   *Control:* NDJSON audit log to `logs/audit.log`. *Known gap:* the log is
   not yet HMAC-chained. *Follow-up:* Phase 4 posture doc.

4. **Information disclosure — Gemini API keys leaking to the client bundle**
   A misconfiguration in `routes/correction.js` or Vite could ship
   `GEMINI_KEY_*` to the browser.
   *Control:* env hygiene, no `process.env` interpolation in `src/*.jsx`,
   Vite only exposes `VITE_*` prefixed variables. *Verification:* Phase 1.5
   sensitive-data scan.

5. **Denial of service — expensive Gemini calls on the correction path**
   `POST /api/correction/evaluate` triggers OCR and LLM calls per request.
   An attacker could amplify this into a cost attack.
   *Control:* `express-rate-limit` on the route, per-user token bucket
   (Phase 1.6 hardening), CSP report endpoint throttling. *Follow-up:* per-user
   adaptive throttle.

6. **Elevation of privilege — BOLA on user-owned resources**
   Routes that take `:id` (e.g. `/api/progress/:id`, `/api/correction/:id`)
   could read or mutate another user's data if ownership is not checked.
   *Control:* `req.session.userId` ownership check is intended everywhere
   but not yet audited. *Verification:* Phase 1.4 BOLA scan — this is the
   highest-priority follow-up.

7. **Tampering (AI) — prompt injection via canvas image or OCR text**
   The Gemini / Gemma calls in `routes/correction.js` and
   `lib/ai-profile-provider.js` accept user-supplied content (canvas
   drawings, image uploads). A crafted image could carry instructions that
   the model follows, leaking the system prompt or producing unsafe output.
   *Control:* server-side input sanitization (length cap, control-char
   strip), strict system prompt. *Verification:* Phase 2 LLM inventory.

8. **Spoofing — webhook replay**
   An attacker who captures a valid Clerk or Duitku webhook could replay it.
   *Control:* svix timestamp window for Clerk; Duitku's `merchantOrderId`
   uniqueness on the Mafiking side. *Verification:* Phase 1.7 SSRF / replay
   review.

## Mitigations NOT in scope (out-of-band risks)

- DDoS at the network edge (Nevacloud does not provide managed DDoS).
  Documented in `posture.md` (Phase 4) as a Cloudflare-fronted option.
- Compromise of Clerk, Duitku, or Google AI: outside Mafiking's control.
- Insider threat: requires a separate HR / access-control layer, not in
  this scope.

## What this stub is for

- Triage Phase 1 findings against the top 8 threats.
- Pre-validate the controls listed in `baseline.md`.
- Track the three open gaps (HMAC audit chain, BOLA audit, LLM input
  sanitization) into Phase 1, 2, and 4 work.
- Be replaced by the full Threat Dragon DFD in Phase 4.
