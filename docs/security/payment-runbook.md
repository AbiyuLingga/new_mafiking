# Payment Security Runbook

This runbook covers incident response procedures for the new_mafiking payment
system after the Phase 0–7 hardening rollout.

## On-call Quick Reference

| Symptom | First action | Reference |
|---|---|---|
| `[ALERT] Invalid webhook signature spike` | Check `PAYMENT_WEBHOOK_SECRET` rotation; verify HASH_PEPPER | "Webhook compromise" below |
| `[ALERT] Ambiguous payment amount burst` | Inspect `payment_reconciliation_log` for `auto_verify_ambiguous` | "Ambiguous matches" below |
| `[ALERT] Collector reached max consecutive errors` | Disable collector, check merchant dashboard | "Collector failure" below |
| `[ALERT] Attempted resurrection of EXPIRED payment` | Check who triggered (admin mark-paid or webhook) | "Resurrection attempt" below |
| `[ALERT] Payment amount mismatch` | Compare dashboard merchant log with `payments` table | "Amount mismatch" below |
| `[ALERT] Sudden payment success burst` | Check for replay or shared secret compromise | "Success burst" below |
| `[ALERT] Admin manual mark-paid` | Expected for normal operations; verify the actor | (info-level) |

## Incident Playbooks

### Webhook compromise

1. Disable the affected webhook endpoint by rotating the secret:
   ```bash
   npm run rotate:secrets -- PAYMENT_WEBHOOK_SECRET
   ```
2. Update `.env` with the new secret, restart the server.
3. Replay the last 1 hour of valid events from the source system. Events
   already in `payment_webhook_events` are idempotent and will be skipped
   by the dedup table.
4. Run `npm run audit:supply-chain -- --npm-audit` to confirm no
   upstream package compromise.
5. Document the incident in `docs/security/incidents/YYYY-MM-DD-<slug>.md`.

### Ambiguous matches

1. Open the admin payment dashboard: `GET /api/admin/payments/dashboard`
2. Find `last24h.ambiguousMatches` and `recentErrors` rows.
3. Each ambiguous row shows the candidate order IDs and amount.
4. Resolve by:
   - Asking the buyer for the merchant order ID in the transfer note
   - If two pending orders share the same unique suffix, expire the
     incorrect one via `POST /api/admin/payments/<id>/mark-failed`
   - Manually matching via `POST /api/admin/payments/<id>/mark-paid`
5. Document the decision and rationale in the audit log.

### Collector failure

1. Confirm scope: `curl -s http://127.0.0.1:3000/api/health`
2. Inspect the running isolated collector process (`scripts/collector.js`)
   via the process supervisor (systemd / pm2 / docker logs).
3. If merchant dashboard is reachable but the collector keeps failing:
   - The cookie file may be locked, expired, or corrupted.
   - Stop the collector: `pkill -f "node scripts/collector.js"`.
   - Delete the cookie file in `QRIS_COOKIE_DIR`.
   - Restart the collector; the library will re-login.
4. If `MUTATION_COLLECTOR_ENABLED=false` is required, set it in `.env` and
   restart. The app will continue to serve QRIS, but admin mark-paid is
   the only payment reconciliation path.

### Resurrection attempt

1. The audit log will show `rejected_expired_resurrection` or
   `rejected_failed_resurrection` with the source.
2. If the source is `admin` and the user claims the funds were sent,
   check the merchant dashboard transaction log to confirm.
3. If the funds are confirmed:
   - Issue a new order to the buyer (do not resurrect the old one).
   - Mark the new order as paid via admin mark-paid.
4. Never modify the EXPIRED/FAILED payment row directly — the audit log
   triggers forbid it, and the request is recorded as a suspicious event.

### Amount mismatch

1. Identify the source: webhook, auto-verify, or admin.
2. Cross-reference with the merchant dashboard:
   - Actual nominal received
   - Unique suffix used
3. If the buyer transferred correctly with unique suffix, the
   `qris_full_amount` should match. Confirm the QR was generated with
   the right `qris_suffix`.
4. If mismatch is recurring for the same `qris_base_amount`, the suffix
   pool may be in an inconsistent state; restart the app and re-run
   `allocateSuffix` for a fresh slot.

### Success burst

1. Inspect `payments` table for `paid_at` clustering in a narrow window.
2. Cross-reference the webhook events table for duplicate event hashes.
3. If a single merchant order ID appears multiple times in the success
   log, the `payment_idempotency_keys` table may have leaked — purge
   expired keys via the periodic cleanup in `resolveIdempotencyKey()`.
4. If multiple unrelated orders succeed in seconds, treat as compromise
   and rotate the webhook secret.

## Forensic Procedure

When investigating any incident:

1. Pull the dashboard: `GET /api/admin/payments/dashboard`
2. Get the audit log for the affected order:
   ```
   GET /api/admin/payments/<merchantOrderId>/audit-log
   ```
3. Check the webhook dedup table:
   ```
   SELECT * FROM payment_webhook_events WHERE merchant_order_id = '<id>';
   ```
4. Compare against the merchant dashboard transaction log.
5. If the audit log shows tampering attempts (UPDATE/DELETE failures),
   the immutability triggers are working as intended — escalate as a
   defense-in-depth event.

## Disabling the Collector

If the merchant dashboard is unreachable or compromised:

```bash
# In .env, set:
MUTATION_COLLECTOR_ENABLED=false

# Restart the server:
npm start
```

Orders remain pending until admin mark-paid or the collector is restored.

## Backup Verification

Before any payment-incident drill:

```bash
sqlite3 db/database.sqlite ".backup db/database.sqlite.bak"
```

Restoration:

```bash
sqlite3 db/database.sqlite ".restore db/database.sqlite.bak"
```

(Production should use the encrypted B2/rclone pipeline from
`docs/security/secret-rotation.md` instead.)

## Escalation

For issues not covered here, escalate via the MAFIKING security channel
(see `docs/security/posture.md` for contacts).
