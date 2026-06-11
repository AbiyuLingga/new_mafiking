-- Migration 005: Audit log immutability
-- Phase 6: prevent UPDATE/DELETE on payment_reconciliation_log and payment_webhook_events

CREATE TRIGGER IF NOT EXISTS trg_payment_reconciliation_log_no_update
BEFORE UPDATE ON payment_reconciliation_log
FOR EACH ROW
WHEN OLD.action IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'payment_reconciliation_log is append-only; UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_reconciliation_log_no_delete
BEFORE DELETE ON payment_reconciliation_log
FOR EACH ROW
WHEN OLD.action IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'payment_reconciliation_log is append-only; DELETE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_webhook_events_no_update
BEFORE UPDATE ON payment_webhook_events
FOR EACH ROW
WHEN OLD.event_hash IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'payment_webhook_events is append-only; UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_webhook_events_no_delete
BEFORE DELETE ON payment_webhook_events
FOR EACH ROW
WHEN OLD.event_hash IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'payment_webhook_events is append-only; DELETE is forbidden');
END;
