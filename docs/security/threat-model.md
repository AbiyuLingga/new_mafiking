# Mafiking threat model

> **The canonical artifact is `docs/security/threat-model.json`** — an
> OWASP Threat Dragon 2.0 DFD with 13 trust-boundary nodes, 12 data flows,
> and 20 STRIDE threats. It supersedes the planning stub below.
> Open the JSON in
> [Threat Dragon](https://owasp.org/www-project-threat-dragon/) to view
> the diagram, or read the JSON directly to enumerate the threats.
>
> This document now only serves as a narrative companion: it lists
> actors, trust boundaries, and the top STRIDE threats in priority order.
> Status, mitigation, and verification details for each threat are
> tracked inside `threat-model.json`.

## Actors and trust boundaries

## Actors and trust boundaries

| Actor | Trust | Notes |
|---|---|---|
| Public visitor (logged out) | Untrusted | Browses lobby, may start free tryout, sees marketing pages. Auto-guest session created on first `/api/*` hit. |
| Registered Mafiking user | Semi-trusted | Owns a local SQLite row synced from Clerk (`lib/clerk-user-sync.js`). Must complete onboarding (`src/onboarding.jsx`) before protected features. |
| Local admin | Trusted | Local-only fallback for dev (`isLocalAdminMode`). Production admins are Clerk users with `role = 'admin'` in the `users` table. |
| Clerk (third party) | Trusted infra | Identity provider. Webhooks are svix-signed. Bearer tokens are verified by `@clerk/express`. |
| QRIS/local payment rails | Trusted payment evidence source | Mafiking generates QRIS/manual orders locally, reconciles by webhook/admin/mutation evidence, and tracks status by `merchantOrderId`. No card data touches Mafiking servers. |
| Duitku (third party) | Trusted infra for legacy/fallback payment redirects | MD5-signs callbacks. Mafiking can redirect users out and back in legacy/fallback mode. No card data ever touches Mafiking servers. |
| Gemini / Gemma (Google AI) | Trusted infra for prompts | Image OCR, canvas evaluation, profile summary prose. Inputs may be untrusted (see threats below). |
| DeepSeek (third party) | Trusted infra for question import | Admin-only tool (`routes/admin-import.js`). Not in the user request path. |
| Local SQLite (`db/database.sqlite`) | Trusted storage | Single process, WAL mode. Not exposed to the network. |

Trust boundaries: **browser → app**, **app → DB**, **app → Clerk**, **app →
QRIS reconciliation/webhooks**, **app → Duitku fallback**, **app → Gemini / DeepSeek**. Every cross-boundary hop is a
candidate threat source.

## Top STRIDE threats (initial, ordered by risk)

1. **Spoofing — session theft via stored XSS** *(Mitigated)*
   The static-Babel architecture keeps `'unsafe-inline'` in the CSP, which
   means a reflected or stored XSS would let an attacker read
   `__Host-mafiking.sid` and impersonate the user.
   *Control:* tightened CSP allowlist (no broad `https:`), report-only mode,
   audit log on auth events, XSS-pattern scanner wired into `npm run check`.
   *Verification:* `scripts/scan-xss-patterns.js` (0 new). F-1, F-2 fixed in
   commit `1092c92`. *Follow-up:* nonce migration tracked in `posture.md`.

2. **Tampering — payment callback spoofing** *(Mitigated)*
   An attacker could try to forge a QRIS reconciliation event or Duitku callback to grant paid access
   without paying.
   *Control:* QRIS reconciliation webhooks use HMAC/timestamp checks where configured; Duitku callback is MD5-signed against `merchantCode + amount + merchantOrderId + API_KEY`; status updates are idempotent and keyed by `merchantOrderId`. CSRF exempt only for server-to-server endpoints. *Verification:* `routes/payment.js` and payment contract/reconciler tests.

3. **Repudiation — admin actions without an audit trail** *(Partial)*
   Admin resets, role changes, and content edits need a tamper-evident log
   to be useful in an investigation.
   *Control:* NDJSON audit log to `logs/audit.log`, daily cron analyzer.
   *Known gap:* the log is not yet HMAC-chained. *Follow-up:* tracked in
   `posture.md` as a post-L2 hardening item.

4. **Information disclosure — Gemini API keys leaking to the client bundle** *(Mitigated)*
   A misconfiguration in `routes/correction.js` or Vite could ship
   `GEMINI_KEY_*` to the browser.
   *Control:* env hygiene, no `process.env` interpolation in `src/*.jsx`,
   Vite only exposes `VITE_*` prefixed variables, TruffleHog job in CI.
   *Verification:* Phase 1.5 sensitive-data scan.

5. **Denial of service — expensive Gemini calls on the correction path** *(Mitigated, partial)*
   `POST /api/correction/evaluate` triggers OCR and LLM calls per request.
   An attacker could amplify this into a cost attack.
   *Control:* `express-rate-limit` (`correctionLimiter` 12/60s, nginx
   `mafiking_correction` 20r/m), CSP report endpoint throttling, payment
   limiter 8/60s. *Follow-up:* per-user adaptive throttle (F-12).

6. **Elevation of privilege — BOLA on user-owned resources** *(Mitigated)*
   Routes that take `:id` (e.g. `/api/progress/:id`, `/api/correction/:id`)
   could read or mutate another user's data if ownership is not checked.
   *Control:* `req.session.userId` ownership check is consistent across
   user-scoped routes; admin routes gated by `isAdmin`.
   *Verification:* Phase 1.4 BOLA scan — no findings (see
   `audit-2026-06.md`).

7. **Tampering (AI) — prompt injection via canvas image or OCR text** *(Mitigated)*
   The Gemini / Gemma calls in `routes/correction.js` accept
   user-supplied content (canvas drawings, image uploads). A crafted image could carry instructions that
   the model follows, leaking the system prompt or producing unsafe output.
   *Control:* `lib/text-sanitize.js` (4000-char cap, control-char strip,
   LaTeX-preserving) applied at `routes/correction.js:920` and `:954`;
   strict system prompt; per-route LLM rate limits. *Verification:* Phase 2
   LLM inventory (`docs/security/llm.md`); F-10, F-11, F-12 tracked.

8. **Spoofing — webhook replay** *(Mitigated)*
   An attacker who captures a valid Clerk, QRIS reconciliation, or Duitku webhook could replay it.
   *Control:* svix timestamp window for Clerk; QRIS reconciliation signatures/timestamps where configured; `merchantOrderId` uniqueness on the Mafiking side for payment updates. *Verification:* Phase 1.7 SSRF / replay review plus payment contract/reconciler tests.

9. **Edge DoS / brute force on the Nevacloud VPS** *(Mitigated)*
   Nevacloud does not provide managed DDoS; the only edge is nginx +
   fail2ban + ufw.
   *Control:* UFW default-deny in; ports 22/80/443 open; fail2ban 4 jails
   (`sshd`, `nginx-botsearch`, `nginx-http-flood`, `mafiking-auth`);
   per-route nginx rate-limit zones. *Follow-up:* ModSecurity v3 (Path A
   source build or Path B Cloudflare-fronted) and HSTS preload submission
   to hstspreload.org.

10. **Host compromise via SSH key sprawl** *(Partial)*
    Nevacloud VPS exposes SSH to the public internet; only root key
    access is currently in use.
    *Control:* sshd drop-in installed (PermitRootLogin no, PasswordAuth
    no, modern Kex/Ciphers/MACs, AllowGroups ssh-users) but NOT reloaded.
    *Follow-up:* `ops/provision-deploy-user.sh` to create `mafiking-deploy`
    with a real pubkey, then `systemctl reload ssh`.

## Mitigations NOT in scope (out-of-band risks)

- DDoS at the network edge (Nevacloud does not provide managed DDoS).
  Documented in `posture.md` (Phase 4) as a Cloudflare-fronted option.
- Compromise of Clerk, Duitku, or Google AI: outside Mafiking's control.
- Insider threat: requires a separate HR / access-control layer, not in
  this scope.

## What this document is for

- Triage findings against the top STRIDE threats.
- Pre-validate the controls listed in `baseline.md`.
- Point to the canonical `threat-model.json` for status, mitigation, and
  verification detail per threat.
- Track the three open gaps (HMAC audit chain, per-user adaptive
  throttle, ModSecurity v3 connector) into follow-up work.
