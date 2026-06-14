# Secret Rotation Procedure

This document describes how to rotate the cryptographic secrets used by
the new_mafiking payment system, post Phase 6 hardening.

## Secrets Inventory

| Env var | Used by | Rotated by | Notes |
|---|---|---|---|
| `SESSION_SECRET` | express-session | `npm run rotate:secrets` | On user-facing session change |
| `CSRF_SECRET` | csrf-csrf | `npm run rotate:secrets` | Re-issues tokens; users may need to re-login |
| `HASH_PEPPER` | mutation-ingester | `npm run rotate:secrets` | Payer-id HMAC; rotating changes the hash of all stored payer IDs |
| `PAYMENT_WEBHOOK_SECRET` | QRIS webhook | `npm run rotate:secrets` | Coordinate with sender to update HMAC key |
| `MUTASIKU_WEBHOOK_SECRET` | Mutasiku webhook | `npm run rotate:secrets` | Coordinate with Mutasiku to update key |
| `COLLECTOR_HMAC_SECRET` | Internal collector | `npm run rotate:secrets` | Update both sender (collector.js) and receiver (main app) atomically |
| `COLLECTOR_KEY_ID` | Internal collector | `npm run rotate:secrets` | New identifier for the rotated key |
| `QRIS_STATIC_STRING` | QRIS dynamic gen | Manual (merchant dashboard) | DO NOT rotate unless compromised — will break all active QR codes |
| `DUITKU_API_KEY` | Duitku API | Manual (Duitku dashboard) | Use Duitku's API key rotation |
| `SMTP_PASS` | Gmail SMTP | Manual (Gmail app password) | Use Gmail account security |
| `CLERK_SECRET_KEY` | Clerk | Manual (Clerk dashboard) | Use Clerk's API key rotation |

## Auto-rotation

The `scripts/security/rotate-secrets.js` script generates cryptographically strong
random secrets for the keys it can manage. It does NOT auto-modify
`.env` — the operator must paste the output manually.

```bash
# Generate one or more secrets:
npm run rotate:secrets -- SESSION_SECRET HASH_PEPPER
```

Output format is `.env`-compatible:

```
SESSION_SECRET=IId5XI7z2idQhr3FCJ608a2zY/bap/UJnHM7Nzy/S4VZWssU60C+0eIsiQEWQIj7o0Gi2obs4CyFNE7W1RM7wg==
HASH_PEPPER=yMM800EzR84txeT0ZZgmuqY28GLqfX43LGRchLA+z/w=
```

## Manual Rotation Procedure

1. Generate new secret(s) using the script (above).
2. Update `.env` with the new values.
3. Restart the server: `npm start`.
4. Verify health: `curl -s http://127.0.0.1:3000/api/health`.
5. Coordinate with the sender of any HMAC-signed messages (Duitku,
   Mutasiku, internal collector) to update their secret.
6. Document the rotation in this file or in an incident log.

## Rotation Schedule

| Secret | Recommended frequency | After-incident trigger |
|---|---|---|
| `SESSION_SECRET` | 90 days | Yes |
| `CSRF_SECRET` | 180 days | Yes |
| `HASH_PEPPER` | 180 days | Yes |
| `PAYMENT_WEBHOOK_SECRET` | 90 days | Yes |
| `MUTASIKU_WEBHOOK_SECRET` | 90 days | Yes |
| `COLLECTOR_HMAC_SECRET` | 90 days | Yes |
| `COLLECTOR_KEY_ID` | 90 days | Yes |
| `QRIS_STATIC_STRING` | Only if compromised | Yes |
| `DUITKU_API_KEY` | Per Duitku policy | Yes |
| `SMTP_PASS` | Per Gmail policy | Yes |
| `CLERK_SECRET_KEY` | Per Clerk policy | Yes |

## Backups

Before rotating, snapshot the database so audit-log correlation remains
intact:

```bash
sqlite3 db/database.sqlite ".backup db/database.sqlite.rot-$(date +%Y%m%d).bak"
```

(Production should use the encrypted B2 pipeline described in the
Phase 6 plan: `docs/plans/plan_security_payment.md`.)

## Compromised Secret Procedure

If a secret is suspected of being compromised:

1. Treat as a security incident; follow `docs/security/payment-runbook.md`.
2. Rotate the secret AND all derived tokens.
3. Force re-login for any session that used the old secret.
4. Review the audit log for actions taken with the compromised secret.
5. If the secret protects payment access, immediately set
   `MUTATION_COLLECTOR_ENABLED=false` until new keys propagate.
6. Document the incident in `docs/security/incidents/`.
