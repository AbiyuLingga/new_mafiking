CREATE TABLE IF NOT EXISTS incoming_mutations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'qris_merchant',
    provider_mutation_id TEXT,
    content_hash TEXT UNIQUE NOT NULL,

    direction TEXT NOT NULL DEFAULT 'IN',
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    transacted_at DATETIME NOT NULL,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    payer_name_masked TEXT,
    payer_id_hash TEXT,
    note_masked TEXT,

    matched_order_id TEXT,
    matched_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_mutations_unmatched
    ON incoming_mutations(amount, status, transacted_at)
    WHERE matched_order_id IS NULL AND direction = 'IN' AND status = 'SUCCESS';

CREATE INDEX IF NOT EXISTS idx_mutations_provider_id
    ON incoming_mutations(provider_mutation_id)
    WHERE provider_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mutations_matched
    ON incoming_mutations(matched_order_id)
    WHERE matched_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mutations_received
    ON incoming_mutations(received_at);
