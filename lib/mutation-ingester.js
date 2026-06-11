const crypto = require('crypto');

function maskName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    return trimmed
        .split(/\s+/)
        .map(part => part[0] + '***')
        .join(' ');
}

function hashPayerId(payerId, pepper) {
    if (!payerId) return null;
    return crypto
        .createHmac('sha256', String(pepper || ''))
        .update(String(payerId))
        .digest('hex');
}

function computeContentHash(mutation, pepper) {
    const parts = [
        String(mutation.provider || ''),
        String(mutation.providerMutationId || ''),
        String(mutation.direction || ''),
        String(mutation.amount || 0),
        String(mutation.status || ''),
        String(Math.floor((mutation.transactedAt || new Date()).getTime() / 1000)),
        hashPayerId(mutation.payerId, pepper) || '',
        String(mutation.payerName || '').toLowerCase().trim(),
    ];
    return crypto
        .createHmac('sha256', String(pepper || 'default-pepper'))
        .update(parts.join('|'))
        .digest('hex');
}

function ingestMutation(db, mutation, pepper) {
    const contentHash = computeContentHash(mutation, pepper);

    const stmt = db.prepare(`
        INSERT OR IGNORE INTO incoming_mutations (
            provider, provider_mutation_id, content_hash,
            direction, amount, status, transacted_at,
            payer_name_masked, payer_id_hash, note_masked
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        String(mutation.provider || 'unknown'),
        String(mutation.providerMutationId || '') || null,
        contentHash,
        String(mutation.direction || 'IN'),
        Number(mutation.amount) || 0,
        String(mutation.status || 'UNKNOWN'),
        mutation.transactedAt.toISOString().slice(0, 19).replace('T', ' '),
        maskName(mutation.payerName),
        hashPayerId(mutation.payerId, pepper),
        maskName(mutation.note)
    );

    const inserted = result.changes > 0;

    if (inserted) {
        db.prepare(`
            INSERT INTO payment_reconciliation_log
                (merchant_order_id, action, actor_id, source, details)
            VALUES ('', 'mutation_ingested', NULL, ?, ?)
        `).run(
            String(mutation.provider || 'unknown'),
            JSON.stringify({
                contentHash,
                amount: mutation.amount,
                providerMutationId: mutation.providerMutationId || '',
                transactedAt: mutation.transactedAt.toISOString(),
            })
        );
    }

    const row = db.prepare(
        'SELECT id FROM incoming_mutations WHERE content_hash = ?'
    ).get(contentHash);

    return {
        inserted,
        mutationId: row ? row.id : null,
        contentHash,
    };
}

function ingestBatch(db, mutations, pepper) {
    const ingest = db.transaction(() => {
        const results = [];
        for (const mutation of mutations) {
            results.push(ingestMutation(db, mutation, pepper));
        }
        return results;
    });
    return ingest();
}

module.exports = {
    computeContentHash,
    hashPayerId,
    ingestBatch,
    ingestMutation,
    maskName,
};
