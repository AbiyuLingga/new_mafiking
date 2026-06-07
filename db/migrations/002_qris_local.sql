ALTER TABLE payments ADD COLUMN qris_base_amount INTEGER;
ALTER TABLE payments ADD COLUMN qris_suffix INTEGER;
ALTER TABLE payments ADD COLUMN qris_full_amount INTEGER;
ALTER TABLE payments ADD COLUMN qris_dynamic_string TEXT;
ALTER TABLE payments ADD COLUMN qris_image_data_url TEXT;
ALTER TABLE payments ADD COLUMN expires_at DATETIME;
ALTER TABLE payments ADD COLUMN paid_at DATETIME;
ALTER TABLE payments ADD COLUMN reconciled_via TEXT;
ALTER TABLE payments ADD COLUMN reconciled_by INTEGER REFERENCES users(id);
ALTER TABLE payments ADD COLUMN webhook_secret_hash TEXT;

CREATE TABLE IF NOT EXISTS qris_suffix_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_amount INTEGER NOT NULL,
    suffix INTEGER NOT NULL,
    merchant_order_id TEXT UNIQUE NOT NULL,
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    released_at DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qris_suffix_locks_active_unique
    ON qris_suffix_locks(base_amount, suffix)
    WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qris_suffix_locks_order
    ON qris_suffix_locks(merchant_order_id);

CREATE TABLE IF NOT EXISTS payment_reconciliation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_order_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id INTEGER REFERENCES users(id),
    source TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_order
    ON payment_reconciliation_log(merchant_order_id, created_at DESC);
