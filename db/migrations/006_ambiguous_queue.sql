-- Migration 006: payment_ambiguous_queue for confidence-based matching
-- v3 plan: store ambiguous mutations that don't auto-match so admin can resolve

CREATE TABLE IF NOT EXISTS payment_ambiguous_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mutation_id INTEGER NOT NULL,
    merchant_order_id TEXT NOT NULL,
    confidence_score INTEGER NOT NULL,
    transacted_at DATETIME NOT NULL,
    amount INTEGER NOT NULL,
    payer_name_masked TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolved_by TEXT,
    resolution TEXT,  -- 'matched' | 'expired' | 'manual_skip'
    resolution_details TEXT,
    FOREIGN KEY (mutation_id) REFERENCES incoming_mutations(id)
);

CREATE INDEX IF NOT EXISTS idx_ambiguous_unresolved
    ON payment_ambiguous_queue(created_at)
    WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ambiguous_mutation
    ON payment_ambiguous_queue(mutation_id);
