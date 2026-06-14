---
title: "Auto-Verification Collector — Phase 3 Security Plan"
status: approved
plan_depth: Deep
created: 2026-06-11
origin: User request — Phase 1+2 (auto-verification-collector-matching-engine.md) shipped 2026-06-10; Phase 3 deepens security coverage before promoting the auto-verify collector from MUTATION_PROVIDER=mock to production qris_merchant traffic.
depends_on:
  - docs/plans/auto-verification-collector-matching-engine.md (Phase 1+2, approved 2026-06-10)
  - docs/security/baseline.md (ASVS L2, Phase 4 applied 2026-06-03)
  - docs/security/threat-model.json (canonical STRIDE DFD)
  - docs/security/audit-2026-06.md (F-1..F-9 register)
  - docs/security/posture.md (monthly snapshot template)
node_version: v22.22.0
library: qris-mutasi v2.0.0 (pinned, exact)
target_posture: OWASP ASVS Level 2
---

# Auto-Verification Collector — Phase 3 Security Plan

## 0. Scope and Assumptions

### 0.1 In-Scope

- `lib/mutation-collector.js` — in-process poller (`setInterval`, default 15s)
- `lib/mutation-ingester.js` — dedupe, masking, HMAC-SHA256 content hashing
- `lib/mutation-matcher.js` — match `incoming_mutations` rows to `payments` PENDING
- `lib/providers/QrisMutasiProvider.js` — unofficial DANA/QRIS merchant-dashboard scraper
- `lib/providers/PaymentMutationProvider.js` — interface typedef + validator
- `lib/providers/MockMutationProvider.js` — test fake
- Tabel `incoming_mutations` + `payment_reconciliation_log`
- Env vars: `MUTATION_COLLECTOR_ENABLED`, `MUTATION_PROVIDER`,
  `MUTATION_POLL_INTERVAL_MS`, `MUTATION_MAX_ERRORS`, `QRIS_MERCHANT_EMAIL`,
  `QRIS_MERCHANT_PASSWORD`, `QRIS_COOKIE_DIR`, `HASH_PEPPER`
- Cookie file at `QRIS_COOKIE_DIR/qris-*.cookie` (session credential at rest)
- Update `docs/security/threat-model.json` with the new node + threats
- Update `docs/security/posture.md` with the new findings (F-16 onwards)

### 0.2 Out-of-Scope

- Webhook signature verification (covered by Phase 1+2, untouched here)
- CSRF / CSP / Helmet baselines (Phase 0–4, untouched)
- ModSecurity CRS rules for the new collector paths (F-13 follow-up)
- B2 rclone config (F-15, separate task)
- Tamper-evident audit log HMAC chain (existing follow-up)

### 0.3 Assumptions to Challenge

Phase 1+2 inherited four assumptions. We challenge them in Phase 3 before
shipping auto-verify to production traffic.

| # | Phase 1+2 Assumption | Phase 3 Verdict | Action |
|---|---|---|---|
| A1 | "`qris-mutasi` v2.0.0 is readable + auditable" | Readable ≠ audited. No SAST/semgrep on the dep yet. Library scrapes HTML with no contract — every dashboard change is a silent attack surface. | 4.1 (pin + audit + SBOM + maintainer signal) |
| A2 | "`merchant.qris.online` is a trusted payment evidence source" | This host is outside Mafiking's trust boundary. If the dashboard is compromised or MITM'd, the evidence is still attacker-controlled. | 4.3 (HTTPS-only, hardcoded URL, error-message sanitization) |
| A3 | "Auto-verify gain = speed, loss = false positive" | **Risk-asymmetric.** One false positive = real money lost. A miss = manual review (acceptable). The collector must prefer miss over false-positive. | 4.4 (ambiguity guard already in place; add future-timestamp guard + SQLITE_BUSY retry) |
| A4 | "1 user = 1 collector process" | Future scale-out is plausible. Concurrent collectors (collector + Mutasiku poller + expiry sweeper) already race on `payments` and `incoming_mutations`. | 4.4 (SQLITE_BUSY retry) + track concurrency for Phase 4 |

### 0.4 Risk Posture

The collector is **fail-closed** (already). The new failure modes Phase 3
adds are:

1. **Silent false-positive** — collector auto-marks a payment PAID for a
   transaction that never occurred at the QRIS network. Failure mode
   requires lib/HTML tampering OR pepper leak OR amount-collision.
2. **PII re-identification** — `payer_name_masked` ("B*** S***") and
   `payer_id_hash` (HMAC-SHA256 of RRN) are stored in plaintext at rest
   in `db/database.sqlite` and in daily backups at
   `/var/backups/mafiking/`. RRN + HMAC is reversible only with the
   pepper. RRN is a semi-sensitive identifier; pepper leak = PII
   disclosure.
3. **Credential persistence** — `QRIS_MERCHANT_PASSWORD` in env,
   cookie file in `/tmp` with mode 0600, but `/tmp` is shared between
   processes on the same VPS.

These three failure modes drive the rest of this plan.

---

## 1. Trust Boundary

### 1.1 New Boundary

```
+--------------------+         +-------------------------+
| merchant.qris.online|<------>| QrisMutasiProvider      |
| (UNTRUSTED - HTML)  |  HTTPS | (lib/providers/...)     |
+--------------------+         +-----------+-------------+
                                            |
                                            | NormalizedMutation[]
                                            v
+--------------------+         +-------------------------+
| Mafiking Server    |-------->| mutation-ingester       |
| (TRUSTED process)  |         | (dedupe + mask + hash)  |
|                    |         +-----------+-------------+
|                    |                     |
|                    |                     v
|                    |         +-------------------------+
|                    |-------->| mutation-matcher        |
|                    |         | (auto-PAID decision)    |
|                    |         +-----------+-------------+
|                    |                     |
|                    |                     v
|                    |         +-------------------------+
|                    |<--------| markPaymentPaid()       |
|                    |         | (idempotent)            |
+--------------------+         +-------------------------+

+--------------------+         +-------------------------+
| /tmp/qris-*.cookie |<------>| QrisMutasiProvider      |
| (SECRET at rest)   |   r/w  | (cookie persistence)    |
+--------------------+         +-------------------------+

+--------------------+
| HASH_PEPPER        |  <--  /etc/mafiking.env (mode 600)
| QRIS_MERCHANT_*    |
+--------------------+
```

### 1.2 Boundary Implications

- **`merchant.qris.online` is untrusted input** (same status as user
  input). Treat as SSRF + injection vector. Hardcode the URL; do not
  accept it from env or query.
- **Cookie file is a session credential at rest**. Equivalent to a
  password. Mode 0600 minimum, owned by the `mafiking` service user.
- **`HASH_PEPPER` is a root key**. If leaked, all historical
  `payer_id_hash` and `content_hash` values become reversible. Treat
  with the same hygiene as `SESSION_SECRET` and `CSRF_SECRET`.

---

## 2. STRIDE Threat Model

Threat IDs AV-1..AV-23 are introduced here. They extend the F-1..F-15
register in `audit-2026-06.md` (continuing the same numbering scheme as
`posture.md` would: F-16 onwards, but kept as AV-* in this plan for
clarity and to map cleanly into the threat-model.json nodes).

### 2.1 Spoofing

| ID | Threat | Pre-Phase 3 | Phase 3 Mitigation | Verification |
|----|--------|-------------|--------------------|--------------|
| AV-1 | Attacker scrapes `merchant.qris.online` from outside and replays a legit transaction to Mafiking | content_hash dedupe, provider_mutation_id | Keep dedupe; add `transacted_at` floor to prevent future-dated replays | T-AVS-2 |
| AV-2 | Attacker forges `payment_reconcile` webhook to existing payment endpoint | HMAC + timestamp verified (Phase 1+2) | n/a — collector path is distinct from webhook path | code review |
| AV-3 | Admin / dev sets `MUTATION_PROVIDER=qris_merchant` with stolen merchant credentials; server compromise gives attacker access | credentials in env | Audit-log `collector_start` with provider + interval; secret-leak test in `npm run check` | T-AVS-6, T-AVS-12 |
| AV-4 | Attacker with read access to VPS reads cookie file at `/tmp/qris-*.cookie` | file mode 0600 | Verify post-write mode 0600 (don't trust umask); restrict `/tmp` to `mafiking` user (best-effort) | T-AVS-4 |

### 2.2 Tampering

| ID | Threat | Pre-Phase 3 | Phase 3 Mitigation | Verification |
|----|--------|-------------|--------------------|--------------|
| AV-5 | Attacker injects mutation via tampered `merchant.qris.online` HTML | `validateNormalizedMutation` filter (number, direction, status) | Add control-char strip in `validateNormalizedMutation`; cap `payerName` length | T-AVS-10 |
| AV-6 | MITM between collector and `merchant.qris.online` | HTTPS default in `qris-mutasi` | Reject any redirect to HTTP; explicit `rejectUnauthorized: true` (Node default but assert it) | T-AVS-1 |
| AV-7 | Race condition: two mutation rows match the same payment (concurrent fetch) | `INSERT OR IGNORE` on content_hash; `markPaymentPaid` idempotent | Add `try/catch SQLITE_BUSY` retry 3× with jitter around `matchMutation` | T-AVS-3 |
| AV-8 | Mutation `transacted_at` in the future (server clock skew, or attacker-crafted dashboard) | `created_at <= transacted_at <= expires_at` | Add `transacted_at <= datetime('now', '+60 seconds')` to matcher SQL | T-AVS-2 |

### 2.3 Repudiation

| ID | Threat | Pre-Phase 3 | Phase 3 Mitigation | Verification |
|----|--------|-------------|--------------------|--------------|
| AV-9 | Admin claims "I never enabled auto-verify" | collector start/stop logged to stdout | Emit `lib/audit-log.js` events for `mutation_collector_start`, `mutation_collector_stop`, `mutation_collector_disabled_no_pepper` | T-AVS-12 |
| AV-10 | User complains "payment auto-claimed by someone else" | `payment_reconciliation_log` JSON | Include `content_hash` and `provider_mutation_id` in the audit detail so the row can be re-derived | T-AVS-8 |
| AV-11 | False-positive match is invisible to admin | unmatched mutations in DB | Add `GET /api/admin/auto-verify/stats` + `GET /api/admin/auto-verify/unmatched?limit=50` (admin-only) | T-AVS-15 |

### 2.4 Information Disclosure

| ID | Threat | Pre-Phase 3 | Phase 3 Mitigation | Verification |
|----|--------|-------------|--------------------|--------------|
| AV-12 | `payer_name_masked` and `payer_id_hash` leak via backup or snapshot | data in SQLite | Wait for F-15 (rclone crypt B2); in the meantime, ensure `mafiking` user owns `/var/backups/mafiking/` and mode 0700 on the dir | posture.md entry |
| AV-13 | `HASH_PEPPER` leaks via error message or log | only used internally | Grep test: `scripts/test-secret-leak.js` runs after full test suite and fails on any pepper/password hit in `logs/*.log` | T-AVS-6 |
| AV-14 | `qris-mutasi` library throws error that includes URL or partial response body | `console.error('[QrisMutasiProvider] fetch error:', error.message)` | Sanitize `error.message` before logging: strip URL, strip HTML, cap to 200 chars | T-AVS-12 |
| AV-15 | Cookie file at `/tmp/qris-*.cookie` is in the daily backup at `/var/backups/mafiking/` | `/tmp` not in backup path (per Phase 4 ops) | Verify with `tar -tzf` on the latest backup archive that no `qris-*.cookie` file is included; document exclusion in `b2-backup-setup.md` | ops check |

### 2.5 Denial of Service

| ID | Threat | Pre-Phase 3 | Phase 3 Mitigation | Verification |
|----|--------|-------------|--------------------|--------------|
| AV-16 | Attacker creates many small transactions to flood `incoming_mutations` | no rate limit on collector path | Daily retention cron: `DELETE FROM incoming_mutations WHERE received_at < datetime('now', '-90 days')` | T-AVS-3 (concurrency) |
| AV-17 | `qris-mutasi` hangs and chews RAM (cheerio on large HTML) | 15s timeout | AbortController wrapper to enforce timeout independent of library; cap response body size at 1 MB before cheerio parse | T-AVS-11 |
| AV-18 | Backoff cap of 5 min still spams network during 1 h outage | exponential backoff max 300s | Acceptable — 12 attempts/h × 15s timeout = 60s network time. Document the cap. | T-AVS-11 |
| AV-19 | Concurrent SQLite write lock collision (collector + expiry sweeper + Mutasiku poller) | `db.transaction()` in ingester | `try/catch SQLITE_BUSY` retry 3× with 50–150 ms jitter in matcher; same in ingester | T-AVS-3 |

### 2.6 Elevation of Privilege

| ID | Threat | Pre-Phase 3 | Phase 3 Mitigation | Verification |
|----|--------|-------------|--------------------|--------------|
| AV-20 | Attacker submits a mutation with amount equal to a premium package price → premium access | amount must match a PENDING payment; payment creation requires auth | Existing controls sufficient; document the chain in this plan | code review |
| AV-21 | Library `qris-mutasi` updated maliciously via supply chain | `package-lock.json` + `npm ci` | Pin exact version in `package.json`; add `qris-mutasi` to `npm audit` job; verify typosquat signal in `npm view` | T-AVS-7, T-AVS-1 |
| AV-22 | Attacker with env-write access sets `MUTATION_PROVIDER=qris_merchant` to leak merchant password via error path | env var admin-only | Document env-write attack surface; restrict env-file ownership to `mafiking` user with mode 0600 | posture.md entry |
| AV-23 | `INTERNAL_ERROR` in matcher leaks raw SQL or PII to client response | no public endpoint for the matcher | Audit all error paths; ensure matcher errors never reach HTTP response | T-AVS-15 |

---

## 3. Data Classification

### 3.1 Field-Level Classification

| Field | Category | Storage | Retention | Encryption at Rest | Notes |
|-------|----------|---------|-----------|--------------------|----|
| `incoming_mutations.amount` | Financial | plaintext INTEGER | 90 days | TBD (F-15) | Used for matching; not reversible |
| `incoming_mutations.payer_name_masked` | PII (low) | plaintext (e.g. "B*** S***") | 90 days | TBD (F-15) | Already masked at ingest |
| `incoming_mutations.payer_id_hash` | PII (identifier) | HMAC-SHA256(pepper, rrn) | 90 days | pepper-protected | Reversible only with pepper |
| `incoming_mutations.note_masked` | Metadata | plaintext (e.g. "D***") | 90 days | TBD (F-15) | Already masked at ingest |
| `incoming_mutations.provider_mutation_id` | Reference (semi-sensitive) | plaintext (RRN) | 90 days | TBD (F-15) | Used for dedupe |
| `incoming_mutations.content_hash` | Integrity | HMAC-SHA256(pepper, fields) | 90 days | pepper-protected | Used for `INSERT OR IGNORE` |
| `incoming_mutations.transacted_at` | Timestamp | ISO datetime | 90 days | n/a | Used for matching window |
| `payments.raw_details` (auto-verify) | PII (low) + reference | JSON in `payments` row | forever (existing) | TBD | Includes `payerNameMasked`, `provider`, `providerMutationId` |
| `HASH_PEPPER` | Root key | env var only | never logged | OS env, mode 0600 | Rotate = invalidate all hashes |
| `QRIS_MERCHANT_PASSWORD` | Credential | env var only | never logged | OS env, mode 0600 | Rotate = re-login to merchant.qris.online |
| Cookie file `/tmp/qris-*.cookie` | Session credential | file, mode 0600 | until logout / process exit | disk | Equivalent to password while live |

### 3.2 Retention Policy

- Daily `cron.d/mafiking-mutation-retention`: `DELETE FROM
  incoming_mutations WHERE received_at < datetime('now', '-90 days')`
  AND `matched_order_id IS NOT NULL` (only purge matched rows;
  unmatched are kept until manual review or manual delete)
- Logrotate already configured (Phase 4) for 6 months app logs
- Backups: 30-day rolling local + B2 (after F-15)

### 3.3 Encryption-at-Rest Roadmap

| Item | Status | Plan |
|------|--------|------|
| Local backup encryption (B2 rclone crypt) | Open (F-15) | External — block Phase C until resolved |
| SQLite at-rest encryption (sqlcipher) | Out of scope | Trade-off: loses better-sqlite3 perf, complicates backups |
| `payer_id_hash` rotation on pepper change | Not supported | Would require re-hashing all rows; document as known gap |

---

## 4. Hardening Areas (8 areas)

### 4.1 Dependency and Supply Chain

| Step | Action | File |
|------|--------|------|
| 4.1.1 | Pin `qris-mutasi` to exact version `"2.0.0"` in `package.json` (no `^` or `~`) | `package.json` |
| 4.1.2 | Add `qris-mutasi` to `npm audit` job allowlist (currently audited via global `npm audit --audit-level=high`) | `.github/workflows/security.yml` |
| 4.1.3 | Run `node scripts/security/scan-npm-typosquats.js` to confirm `qris-mutasi` is not a typosquat of `qr-mutasi`, `qris-mutation`, etc. | local check |
| 4.1.4 | CycloneDX SBOM job (already in `security.yml`) automatically includes the new dep | n/a |
| 4.1.5 | Run `npm view qris-mutasi time maintainers repository.url` and capture in `docs/security/llm-inventory.md` (new entry: 3rd-party payment evidence source) | `docs/security/llm-inventory.md` |
| 4.1.6 | Add `qris-mutasi` to the DAST allowlist reasoning in `.zap/rules.tsv` if it shows up in scan | `.zap/rules.tsv` |

### 4.2 Credential and Secret Handling

| Step | Action | File |
|------|--------|------|
| 4.2.1 | Audit `server.js` startup logger: confirm `QRIS_MERCHANT_PASSWORD` and `HASH_PEPPER` are never logged, even at debug level. Add a grep-based test. | new `scripts/test-secret-leak.js` |
| 4.2.2 | Emit `lib/audit-log.js` event in `startMutationCollector()`: `action='mutation_collector_start', details={ provider, intervalMs, pepperLength }` (length only, not value) | `lib/mutation-collector.js` |
| 4.2.3 | Document `HASH_PEPPER` rotation cost in `.env.example`: "Rotating this key invalidates all `payer_id_hash` and `content_hash` values; collector will re-ingest from scratch on next poll" | `.env.example` |
| 4.2.4 | After `qris-mutasi` writes the cookie file, explicitly `chmod 0600` (don't rely on umask) | `lib/providers/QrisMutasiProvider.js` |
| 4.2.5 | Restrict `QRIS_COOKIE_DIR` default to `/opt/mafiking/tmp/` (not `/tmp` which is world-readable on shared hosts); update `.env.example` and `QrisMutasiProvider.js` default | `.env.example`, `lib/providers/QrisMutasiProvider.js` |
| 4.2.6 | Verify `env` and `.env.local` are in `.gitignore` (already documented in AGENTS.md) | n/a |

### 4.3 Provider Hardening

| Step | Action | File |
|------|--------|------|
| 4.3.1 | Verify `merchant.qris.online` URL is hardcoded as a module constant, NOT read from env. Add a test that fails if the URL is found in `process.env.*` | `lib/providers/QrisMutasiProvider.js`, new test |
| 4.3.2 | Add `rejectUnauthorized: true` explicitly in the `httpsAgent` or equivalent (assert Node default) | `lib/providers/QrisMutasiProvider.js` |
| 4.3.3 | Sanitize `error.message` before logging: strip URLs (`/https?:\/\/[^\s]+/g`), strip HTML tags (`/<[^>]+>/g`), cap to 200 chars. Log only `[QrisMutasiProvider] fetch error: <sanitized>`. | `lib/providers/QrisMutasiProvider.js:342` |
| 4.3.4 | Wrap `provider.qris.mutasi()` in `AbortController` with 15s timeout, independent of library timeout | `lib/providers/QrisMutasiProvider.js` |
| 4.3.5 | Cap response body size at 1 MB before cheerio parse (cheerio can OOM on very large HTML) | `lib/providers/QrisMutasiProvider.js` |
| 4.3.6 | Strengthen `validateNormalizedMutation` (`lib/providers/PaymentMutationProvider.js`): reject `payerName` containing control chars (`/[\x00-\x1f\x7f]/`), cap `payerName` length to 100 chars, cap `note` length to 50 chars | `lib/providers/PaymentMutationProvider.js` |
| 4.3.7 | Add `parsePositiveInt()` helper for `nominal`: reject `NaN`, reject non-safe-integer, reject values > Rp 100.000.000 (sanity cap) | `lib/providers/QrisMutasiProvider.js` |

### 4.4 Matcher Integrity

| Step | Action | File |
|------|--------|------|
| 4.4.1 | Add `transacted_at <= datetime('now', '+60 seconds')` to the candidates query in `matchMutation` | `lib/mutation-matcher.js:537` |
| 4.4.2 | Wrap `matchMutation` body in `try/catch SQLITE_BUSY` with 3× retry and 50–150 ms jitter | `lib/mutation-matcher.js` |
| 4.4.3 | Same retry logic in `ingestBatch` (already wrapped in `db.transaction()`; verify it surfaces BUSY cleanly) | `lib/mutation-ingester.js` |
| 4.4.4 | Verify `markPaymentPaid` records `actor='auto_verify'` and `mutationId` in the reconciliation log | `lib/payment-reconciler.js` (verify) |
| 4.4.5 | Add `matchMutation` summary log: `{ mutationId, candidateCount, action: 'matched'\|'unmatched'\|'ambiguous' }` | `lib/mutation-matcher.js` |
| 4.4.6 | When `markPaymentPaid` is called from the matcher, also write a one-liner to `lib/audit-log.js` so it shows up in the per-day analyzer rollup | `lib/mutation-matcher.js` |

### 4.5 Audit and Detection

| Step | Action | File |
|------|--------|------|
| 4.5.1 | New event types in `lib/audit-log.js` whitelist: `mutation_collector_start`, `mutation_collector_stop`, `mutation_collector_disabled_no_pepper`, `auto_verify_matched`, `auto_verify_ambiguous`, `auto_verify_unmatched` | `lib/audit-log.js` |
| 4.5.2 | New admin endpoint `GET /api/admin/auto-verify/stats` returning `{ enabled, provider, lastPollAt, consecutiveErrors, totalChecked, totalMatched, backoffMs }` — guarded by `isAdmin` | `routes/admin.js` |
| 4.5.3 | New admin endpoint `GET /api/admin/auto-verify/unmatched?limit=50` returning the most recent unmatched `incoming_mutations` rows — guarded by `isAdmin` | `routes/admin.js` |
| 4.5.4 | Extend `GET /api/health` to include `autoVerify: { enabled, provider, lastPollAt, consecutiveErrors }` (no PII) | `server.js` |
| 4.5.5 | Wire the new events into `scripts/security/analyze-audit-log.js` so the daily summary rollup includes auto-verify counts | `scripts/security/analyze-audit-log.js` |

### 4.6 Detection Engineering (DE-AV-1..6)

The following rules are added to the daily `analyze-audit-log.js`
rollup and to the live tail-monitor at `ops/monitoring/`. Each rule has
a `ruleId`, severity, trigger condition, and a recommended response.

| Rule ID | Trigger | Severity | Response |
|---------|---------|----------|----------|
| DE-AV-1 | `consecutiveErrors >= 5` in 5 minutes (from `mutation_collector_*` events or `getStats()`) | High | Page on-call; verify `merchant.qris.online` reachability; check VPS network |
| DE-AV-2 | `auto_verify_matched` count > 20 in 1 hour | High | Investigate fraud wave; check if matched amounts cluster on round numbers |
| DE-AV-3 | `auto_verify_ambiguous` > 10 in 1 hour with same `amount` | Medium | Investigate amount-collision attack; consider widening suffix range |
| DE-AV-4 | `mutation_collector_disabled_no_pepper` event | Critical | Collector refuse-to-start is already enforced; this rule confirms no misconfig was ever shipped |
| DE-AV-5 | `auto_verify_matched` with round-number amount (Rp 10.000, 50.000, 100.000) > 5 in 1 hour | Medium | Investigate: possible amount-collision or scanner abuse |
| DE-AV-6 | `lastPollAt` not updated for `3 × intervalMs` (from `/api/health`) | High | Collector stalled; check for `setInterval` drift or process hang |

### 4.7 Testing

New file: `scripts/test-auto-verification-security.js`. 15 test cases.

| Test | Description | Maps to threat |
|------|-------------|----------------|
| T-AVS-1 | Provider URL is hardcoded (test fails if URL found in `process.env.*`) | AV-21 |
| T-AVS-2 | Mutation with future `transacted_at` is NOT matched | AV-1, AV-8 |
| T-AVS-3 | Concurrent `matchMutation` calls do not double-pay (race-condition test with 10 concurrent) | AV-7, AV-19 |
| T-AVS-4 | Cookie file created by QrisMutasiProvider has mode 0600 | AV-4 |
| T-AVS-5 | `HASH_PEPPER=''` causes `startMutationCollector` to return `null` and emit `mutation_collector_disabled_no_pepper` audit event | AV-13 |
| T-AVS-6 | `QRIS_MERCHANT_PASSWORD` and `HASH_PEPPER` never appear in `logs/audit.log` or `logs/console.log` after a full collector run | AV-13 |
| T-AVS-7 | `package.json` pins `qris-mutasi` exact version (no `^` or `~`) | AV-21 |
| T-AVS-8 | `contentHash` is deterministic for identical input | AV-10 |
| T-AVS-9 | `contentHash` differs when any one of the 8 input fields differs | AV-10 |
| T-AVS-10 | `maskName` strips control characters and caps at 100 chars | AV-5 |
| T-AVS-11 | Backoff is exponential: 5s → 10s → 20s → 40s → 80s → 160s → 300s cap, with reset on success | AV-18 |
| T-AVS-12 | Provider error → collector logs sanitized error, no crash, audit event emitted | AV-3, AV-9, AV-14 |
| T-AVS-13 | Provider returns non-array → collector skips, audit event emitted | AV-23 |
| T-AVS-14 | `merchant_order_id` UNIQUE constraint violation in `markPaymentPaid` is caught and logged (not crashed) | AV-7 |
| T-AVS-15 | Admin endpoint `GET /api/admin/auto-verify/stats` returns 403 without admin session and 200 with admin session; `GET /api/admin/auto-verify/unmatched` similarly | AV-11, AV-23 |

Also:

- All 20 existing test cases from `auto-verification-collector-matching-engine.md` Step 10 must still pass (regression).
- The 12 contract tests in `npm run check` must still pass.

### 4.8 Production Rollout Gates

The collector has a feature flag (`MUTATION_COLLECTOR_ENABLED`) and a
provider choice (`MUTATION_PROVIDER`). Rollout is gated on three
milestones.

#### Gate 1 — Staging soak (1 week, mock provider)

1. `MUTATION_PROVIDER=mock` (no real network)
2. `MUTATION_COLLECTOR_ENABLED=true`
3. Run full test suite (`npm run check`) — all 35 tests pass
4. Manual soak: leave collector running 24h, verify no `consecutiveErrors`
5. Verify audit log: `mutation_collector_start` and `mutation_collector_stop` events present
6. Verify no secret leak in any log file (`scripts/test-secret-leak.js`)

#### Gate 2 — Staging with real provider (1 week, qris_merchant)

1. Set `QRIS_MERCHANT_EMAIL`, `QRIS_MERCHANT_PASSWORD`, `HASH_PEPPER` in env
2. `MUTATION_PROVIDER=qris_merchant`
3. Create test payments of various amounts (Rp 1.000, 5.137, 50.137, 100.137)
4. Pay from DANA/OVO/GoPay; verify auto-PAID within 15–30s
5. Verify `payment_reconciliation_log` row with `source='auto_verify'`
6. Verify `access_grant` created (if applicable)
7. Test edge cases: duplicate scan, expired payment, wrong amount, payment from non-DANA source
8. Run DE-AV-1 through DE-AV-6 against the live log

#### Gate 3 — Production canary (3 days, 5% traffic)

1. Deploy with `MUTATION_COLLECTOR_ENABLED=false` (default off)
2. Verify no regression in existing payment flow (admin manual + Mutasiku + webhook)
3. Enable for 5% of new PENDING payments via a new flag
   `MUTATION_COLLECTOR_CANARY_PCT=5`
4. Compare matched / unmatched / ambiguous distribution against the staging week
5. Daily review of `payment_reconciliation_log` rows with `source='auto_verify'`
6. If false-positive rate is non-zero, abort and roll back (see below)

#### Gate 4 — Full production

1. Set `MUTATION_COLLECTOR_ENABLED=true` and `MUTATION_COLLECTOR_CANARY_PCT=100`
2. Monitor DE-AV rules for 7 days
3. Weekly review unmatched mutations (manual match from unmatched)
4. B2 rclone config (F-15) must be resolved before this gate

#### Rollback

- Set `MUTATION_COLLECTOR_ENABLED=false` in env; restart node
- No code rollback required
- Existing payment flow (admin manual + Mutasiku + webhook) continues unaffected
- Pre-existing PENDING payments are not retroactively matched; only new mutations after re-enable are processed

---

## 5. OWASP ASVS L2 Mapping

| ASVS Requirement | Control | Phase 1+2 | Phase 3 |
|------------------|---------|----------|---------|
| V1.4.1 — Access control | Collector is not user-facing | n/a | n/a |
| V2.5.1 — Session management | Cookie file at OS level (not user session) | partial — docs only | 4.2.4 + 4.2.5 (mode 0600 + dir ownership) |
| V3.5.1 — Input validation | `validateNormalizedMutation` | done | 4.3.6 (control chars, length cap) |
| V4.3.1 — Cryptographic storage | HMAC-SHA256 + pepper | done | 4.2.3 (rotation cost documented) |
| V5.5.1 — Output encoding | masked data | done | 4.3.6 (validate at boundary) |
| V6.5.1 — Logging | `payment_reconciliation_log` | done | 4.5.1 + 4.5.5 (lib/audit-log.js + analyze-audit-log.js) |
| V7.5.1 — Error handling | fail-closed | done | 4.3.3 (sanitize error messages) |
| V8.5.1 — Data protection | PII masking | done | 4.2.5 (cookie dir) + wait for F-15 |
| V9.5.1 — Communications | HTTPS to merchant.qris.online | done | 4.3.1 (hardcoded URL) + 4.3.2 (rejectUnauthorized explicit) |
| V10.5.1 — Malicious code | supply chain | partial | 4.1.1–4.1.6 (pin, audit, SBOM, maintainer signal) |
| V11.5.1 — Business logic | ambiguity guard | done | 4.4.1 (future-timestamp guard) |
| V12.5.1 — Files integrity | cookie file 0600 | done | 4.2.4 (explicit chmod, not umask) |
| V13.5.1 — API security | no new public endpoint | n/a | 4.5.2 + 4.5.3 (admin-only endpoints) |
| V14.5.1 — Configuration | feature-flagged default OFF | done | documented in 4.8 |

Net new ASVS work in Phase 3: V2, V3, V4, V6, V7, V9, V10, V11, V12, V13.

---

## 6. Open Items (AV-OPEN-1..8)

| ID | Item | Severity | Tracking | Phase 3 action |
|----|------|----------|----------|----------------|
| AV-OPEN-1 | F-11 EXIF strip — not applicable to collector (no image handling) | n/a | closed | n/a |
| AV-OPEN-2 | F-12 per-user adaptive throttle — not applicable (collector not user-facing) | n/a | closed | n/a |
| AV-OPEN-3 | F-13 ModSecurity v3 — add CRS rules for `/api/payment/*` to detect collector polling abuse | Medium | new (F-13) | track in `posture.md` |
| AV-OPEN-4 | F-15 B2 rclone config — **blocker for Gate 4 production** | High | escalate | document blocker in `posture.md` |
| AV-OPEN-5 | Tamper-evident audit log (HMAC chain) — apply to `payment_reconciliation_log` too | Medium | new (F-16) | add to posture.md |
| AV-OPEN-6 | Daily retention cron for `incoming_mutations` > 90 days | Medium | new (F-17) | implement in 4.5 |
| AV-OPEN-7 | Manual match from unmatched UI | Low | Future Enhancement #7 | track in posture.md |
| AV-OPEN-8 | Third-party PenTest review of `qris-mutasi` library | Medium | new (F-18) | document in posture.md; do not block rollout |

---

## 7. Threat-Model.json Changes (canonical artifact)

File: `docs/security/threat-model.json` (Threat Dragon 2.0 DFD).

### 7.1 New Node

```json
{
  "id": "mutation_collector",
  "name": "Mutation collector (in-process poller)",
  "type": "Process",
  "description": "Express in-process setInterval worker. Polls merchant.qris.online every 15s via QrisMutasiProvider, dedupes by content_hash, masks PII, matches against PENDING payments. Default OFF (MUTATION_COLLECTOR_ENABLED). Listens only on localhost (no public port).",
  "outOfScope": false,
  "trustLevel": 90,
  "hasOpenThreats": true,
  "isTrustBoundary": true
}
```

### 7.2 New Data Flows

| ID | Source | Destination | Description |
|----|--------|-------------|-------------|
| flow-collect-1 | `merchant_qris_dashboard` (new node, similar to existing third-party nodes) | `mutation_collector` | HTTPS GET of dashboard HTML, POST login + history fetch |
| flow-collect-2 | `mutation_collector` | `vps_sqlite` | INSERT into `incoming_mutations`, UPDATE `matched_order_id` |
| flow-collect-3 | `mutation_collector` | `vps_sqlite` | UPDATE `payments.status='SUCCESS'` via `markPaymentPaid` |
| flow-collect-4 | `qris_cookie_file` (new Datastore node) | `mutation_collector` | Read/write cookie file at `QRIS_COOKIE_DIR` |
| flow-collect-5 | `mutation_collector` | `vps_node` | In-process call; no network hop |

### 7.3 New STRIDE Threat Entries

Append the 23 threats (AV-1..AV-23 from Section 2) to the existing
`detail.diagram.threats` array. Each entry has the Threat Dragon shape:

```json
{
  "id": "AV-1",
  "title": "Attacker replays a legit QRIS transaction to Mafiking",
  "status": "Mitigated",
  "severity": "Medium",
  "type": "Spoofing",
  "description": "An attacker who has captured a legitimate QRIS transaction (RRN, amount, timestamp) attempts to inject it as a Mutation via tampering with merchant.qris.online or by replaying the network traffic.",
  "mitigations": "Content hash dedupe via INSERT OR IGNORE; provider_mutation_id uniqueness; future-timestamp guard (AV-8).",
  "owner": "Mafiking engineering",
  "strideCategory": "S"
}
```

Repeat for AV-2..AV-23.

### 7.4 Updated Threat #2 (Payment callback spoofing)

Existing threat #2 in `threat-model.json` covers webhook spoofing. Add
a sub-flow description: "Auto-verify path is distinct from webhook path
and uses content_hash dedupe + pepper-protected HMAC; see AV-1..AV-23
for the new attack surface."

### 7.5 Validation

After the JSON is updated, validate with:

```bash
node -e "JSON.parse(require('fs').readFileSync('docs/security/threat-model.json'))"
```

Then open in Threat Dragon to confirm the diagram renders. A PR gate
will add a `node -e` check to `npm run check`.

---

## 8. Implementation Order

Total estimated: **~5 hours** of focused work. Two-day calendar with
review.

| # | File(s) | Depends on | Est. |
|---|---------|-----------|------|
| 1 | `package.json` (pin `qris-mutasi` exact version) | — | 5 min |
| 2 | `lib/providers/QrisMutasiProvider.js` (chmod 0600, AbortController, body cap, sanitized error) | 1 | 30 min |
| 3 | `lib/providers/PaymentMutationProvider.js` (length cap, control-char strip) | — | 15 min |
| 4 | `lib/providers/QrisMutasiProvider.js` (hardcoded URL constant + rejectUnauthorized explicit) | 2 | 15 min |
| 5 | `lib/mutation-matcher.js` (future-timestamp guard, SQLITE_BUSY retry, summary log) | — | 30 min |
| 6 | `lib/mutation-collector.js` (audit-log emit on start/stop/disabled) | 5 | 20 min |
| 7 | `lib/audit-log.js` (new event types) | — | 15 min |
| 8 | `routes/admin.js` (`/auto-verify/stats`, `/auto-verify/unmatched`) | 7 | 30 min |
| 9 | `server.js` (`/api/health` extension) | — | 10 min |
| 10 | `scripts/security/analyze-audit-log.js` (DE-AV-1..6 rules) | 7 | 30 min |
| 11 | `scripts/test-auto-verification-security.js` (15 test cases) | 2, 3, 4, 5, 6, 7, 8 | 90 min |
| 12 | `scripts/test-secret-leak.js` (greps log files for password/pepper) | — | 15 min |
| 13 | `package.json` (add `test:auto-verify-security` and `test:secret-leak` scripts) | 11, 12 | 5 min |
| 14 | `.env.example` (document `QRIS_COOKIE_DIR` default + `HASH_PEPPER` rotation cost) | — | 10 min |
| 15 | `docs/security/threat-model.json` (add node + flows + 23 threats) | 7 | 60 min |
| 16 | `docs/security/llm-inventory.md` (add `qris-mutasi` 3rd-party entry) | 1 | 15 min |
| 17 | `docs/security/posture.md` (add F-16..F-19 to register) | 15, 16 | 15 min |
| 18 | `npm run check` green | 1–14 | 15 min |
| 19 | Manual Gate 1 (staging mock) | 18 | 1 day wall-clock |
| 20 | Manual Gate 2 (staging qris_merchant) | 19 | 1 week wall-clock |
| 21 | Manual Gate 3 (canary 5%) | 20 | 3 days wall-clock |
| 22 | Manual Gate 4 (production 100%) | 21 + F-15 closed | 1 day cutover |

**Critical path:** 1 → 2 → 11 → 15 → 18 → 19 → 20 → 21 → 22

---

## 9. Verification Plan (Definition of Done)

Before claiming Phase 3 complete, all of the following must be true.

### 9.1 Automated

- [ ] `npm run check` is green (existing 22 contract tests + 8 scanners + new `test:auto-verify-security` 15 tests + new `test:secret-leak` = 38+ green)
- [ ] `npm audit --audit-level=high` shows 0 high/critical
- [ ] `node -e "JSON.parse(require('fs').readFileSync('docs/security/threat-model.json'))"` exits 0
- [ ] `scripts/security/scan-xss-patterns.js` still 0 new (regression guard)
- [ ] `scripts/security/scan-npm-typosquats.js` still 0 hits
- [ ] `tests/security/test-csrf-coverage.js` still 25/25

### 9.2 Manual

- [ ] `MUTATION_PROVIDER=mock` end-to-end test: 20 original tests + 15 security tests pass
- [ ] `HASH_PEPPER=""` → `startMutationCollector` returns null, audit event emitted, exit non-zero in startup
- [ ] `MUTATION_COLLECTOR_ENABLED=false` → no auto-verify, existing payment flow unchanged
- [ ] Secret-leak test: after 1000 successful polls, `grep -i 'QRIS_MERCHANT_PASSWORD\|HASH_PEPPER' logs/*.log` returns 0 matches
- [ ] `/api/admin/auto-verify/stats` returns 200 with admin session, 403 without
- [ ] `/api/admin/auto-verify/unmatched` returns 200 with admin session, 403 without
- [ ] `/api/health` includes `autoVerify` field
- [ ] `scripts/security/analyze-audit-log.js` produces DE-AV-1..6 entries when fed a synthetic log fixture

### 9.3 Documentation

- [ ] `docs/security/threat-model.json` opens cleanly in Threat Dragon and shows the new node + 23 threats
- [ ] `docs/security/posture.md` updated with F-16..F-19
- [ ] `docs/security/llm-inventory.md` updated with `qris-mutasi` entry
- [ ] `.env.example` documents `QRIS_COOKIE_DIR` and `HASH_PEPPER` rotation cost
- [ ] `README.md` and `ARCHITECTURE.md` get a one-paragraph section on auto-verify security

### 9.4 Operational

- [ ] `cron.d/mafiking-mutation-retention` installed (retention > 90 days)
- [ ] `/opt/mafiking/tmp/` exists with mode 0700 owned by `mafiking` user
- [ ] `/tmp/qris-*.cookie` does not appear in the latest `/var/backups/mafiking/latest.tar.zst` (verify with `tar -tzf`)

---

## 10. Rollout Strategy (post-implementation)

1. **Branch:** `security/auto-verify-hardening`
2. **CI:** `npm run check` + `npm audit` must be green on every commit
3. **Code review:** invoke `code-review-and-quality` skill before merge
4. **Merge to `main`** after Gate 1 (staging mock) passes
5. **Deploy to staging VPS** with `MUTATION_PROVIDER=mock` for 1 week
6. **Switch staging to `qris_merchant`**, monitor DE-AV rules for 1 week
7. **Cut over to canary 5%** (Gate 3) — 3 days
8. **Block Gate 4** until F-15 (B2 rclone) is closed
9. **Cut over to 100%** with `MUTATION_COLLECTOR_ENABLED=true` and `MUTATION_COLLECTOR_CANARY_PCT=100`
10. **Update `posture.md` snapshot** to reflect Phase 3 status
11. **Close-out review** with the same code-review skill

### 10.1 Rollback

- Set `MUTATION_COLLECTOR_ENABLED=false` in `/opt/mafiking/.env`
- `systemctl restart mafiking` (or `pm2 restart mafiking` per current ops)
- No code rollback needed
- Existing PENDING payments are not retroactively matched; manual review continues
- Verify in admin panel that no `auto_verify_matched` events appear post-rollback

### 10.2 Post-Rollout Monitoring

- Daily `analyze-audit-log.js` rollup (already cron'd)
- Weekly review of unmatched mutations for manual matching
- Monthly posture snapshot includes new metrics:
  - DE-AV-1 trigger count (target: 0)
  - DE-AV-2 trigger count (target: 0)
  - `auto_verify_matched` / total PENDING ratio (baseline first month)

---

## 11. References

- `docs/plans/auto-verification-collector-matching-engine.md` — Phase 1+2 plan (approved 2026-06-10)
- `docs/security/baseline.md` — ASVS L2 baseline (Phase 4 applied 2026-06-03)
- `docs/security/threat-model.json` — canonical STRIDE DFD (Threat Dragon 2.0)
- `docs/security/threat-model.md` — narrative companion
- `docs/security/audit-2026-06.md` — Phase 1 audit (F-1..F-9)
- `docs/security/posture.md` — monthly snapshot template
- `docs/security/llm-inventory.md` — third-party AI inventory (extend with `qris-mutasi`)
- `docs/security/llm.md` — AI security runbook
- `docs/security/secrets.md` — secret rotation runbook
- `docs/security/incident-response.md` — IR procedures (relevant for DE-AV-1, DE-AV-6)
- `ops/apply-all.sh` — Phase 4 VPS apply script
- `ops/modsecurity/STATUS.md` — ModSecurity v3 status (F-13)
- `package.json` — dependency manifest
- `.env.example` — environment variable documentation
- `lib/mutation-collector.js`, `lib/mutation-ingester.js`,
  `lib/mutation-matcher.js`, `lib/providers/QrisMutasiProvider.js`,
  `lib/providers/PaymentMutationProvider.js`,
  `lib/providers/MockMutationProvider.js` — Phase 1+2 implementation
- `lib/payment-reconciler.js` — `markPaymentPaid` (called by matcher)
- `lib/audit-log.js` — NDJSON audit writer
- `routes/admin.js` — admin endpoints (extend with `/auto-verify/*`)
- `scripts/security/analyze-audit-log.js` — daily analyzer (extend with DE-AV rules)
- `scripts/test-*.js` — existing test suite
