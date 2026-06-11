-- Migration 004: Payment Security Hardening
-- Phase 1 ledger invariants: dedup tables, unique constraints, idempotency

-- 1. Webhook/mutation event dedup table (replay prevention)
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    event_id TEXT,
    event_hash TEXT UNIQUE NOT NULL,
    merchant_order_id TEXT,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_status TEXT NOT NULL DEFAULT 'PROCESSED'
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_merchant_order
    ON payment_webhook_events(merchant_order_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup
    ON payment_webhook_events(provider, event_id);

-- 2. Payment idempotency keys (prevents duplicate orders)
CREATE TABLE IF NOT EXISTS payment_idempotency_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT UNIQUE NOT NULL,
    merchant_order_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires
    ON payment_idempotency_keys(expires_at);

-- 3. Unique index on incoming_mutations(provider, provider_mutation_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mutations_provider_id_unique
    ON incoming_mutations(provider, provider_mutation_id)
    WHERE provider_mutation_id IS NOT NULL AND provider_mutation_id != '';

-- 4. Add payment_merchant_order_id to user_access_grants for dedup
ALTER TABLE user_access_grants ADD COLUMN payment_merchant_order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_access_grants_payment_unique
    ON user_access_grants(user_id, access_type, access_value, payment_merchant_order_id)
    WHERE payment_merchant_order_id IS NOT NULL;

-- 5. Add revoked column to user_access_grants (needed for unique index semantics)
ALTER TABLE user_access_grants ADD COLUMN revoked INTEGER DEFAULT NULL;
