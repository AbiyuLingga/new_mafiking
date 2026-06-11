const { markPaymentPaid } = require('./payment-reconciler');

function logMatchDecision(db, { mutationId = null, merchantOrderId = '', action, details = {} }) {
    db.prepare(`
        INSERT INTO payment_reconciliation_log
            (merchant_order_id, action, actor_id, source, details)
        VALUES (?, ?, NULL, 'auto_verify', ?)
    `).run(
        String(merchantOrderId || ''),
        String(action || ''),
        JSON.stringify({ ...details, mutationId })
    );
}

function matchMutation(db, mutationId) {
    const mutation = db.prepare(
        'SELECT * FROM incoming_mutations WHERE id = ?'
    ).get(mutationId);

    if (!mutation) return null;
    if (mutation.direction !== 'IN') return null;
    if (mutation.status !== 'SUCCESS') return null;
    if (mutation.matched_order_id) return null;

    const candidates = db.prepare(`
        SELECT *
        FROM payments
        WHERE status = 'PENDING'
          AND COALESCE(qris_full_amount, amount) = ?
          AND created_at <= ?
          AND (expires_at IS NULL OR expires_at >= ?)
        ORDER BY created_at ASC
        LIMIT 5
    `).all(
        mutation.amount,
        mutation.transacted_at,
        mutation.transacted_at
    );

    if (candidates.length === 0) {
        logMatchDecision(db, {
            mutationId: mutation.id,
            action: 'auto_verify_unmatched',
            details: {
                amount: mutation.amount,
                transactedAt: mutation.transacted_at,
                reason: 'no_pending_payment',
            },
        });
        return null;
    }

    if (candidates.length > 1) {
        logMatchDecision(db, {
            mutationId: mutation.id,
            action: 'auto_verify_ambiguous',
            details: {
                amount: mutation.amount,
                candidateCount: candidates.length,
                candidateOrderIds: candidates.map(c => c.merchant_order_id),
                reason: 'multiple_pending_payments_same_amount',
            },
        });
        return null;
    }

    const payment = candidates[0];

    const result = markPaymentPaid(db, {
        merchantOrderId: payment.merchant_order_id,
        fullAmount: mutation.amount,
        source: 'auto_verify',
        rawDetails: {
            mutationId: mutation.id,
            provider: mutation.provider,
            providerMutationId: mutation.provider_mutation_id || '',
            transactedAt: mutation.transacted_at,
            payerNameMasked: mutation.payer_name_masked || '',
        },
    });

    db.prepare(`
        UPDATE incoming_mutations
        SET matched_order_id = ?, matched_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(payment.merchant_order_id, mutation.id);

    logMatchDecision(db, {
        mutationId: mutation.id,
        merchantOrderId: payment.merchant_order_id,
        action: 'auto_verify_matched',
        details: {
            amount: mutation.amount,
            provider: mutation.provider,
            providerMutationId: mutation.provider_mutation_id || '',
        },
    });

    return { ok: true, merchantOrderId: payment.merchant_order_id, ...result };
}

function matchPendingMutations(db) {
    const unmatched = db.prepare(`
        SELECT id
        FROM incoming_mutations
        WHERE matched_order_id IS NULL
          AND direction = 'IN'
          AND status = 'SUCCESS'
        ORDER BY transacted_at ASC
        LIMIT 50
    `).all();

    let matched = 0;
    let unmatchedCount = 0;

    for (const row of unmatched) {
        const result = matchMutation(db, row.id);
        if (result && result.ok) matched++;
        else {
            const mutation = db.prepare(
                'SELECT * FROM incoming_mutations WHERE id = ?'
            ).get(row.id);
            if (mutation && !mutation.matched_order_id) unmatchedCount++;
        }
    }

    return { matched, unmatched: unmatchedCount, checked: unmatched.length };
}

function processNewMutations(db, mutations, pepper) {
    const { ingestBatch } = require('./mutation-ingester');

    const ingestResults = ingestBatch(db, mutations, pepper);

    let matched = 0;
    let errors = 0;

    for (const result of ingestResults) {
        if (!result.inserted || !result.mutationId) continue;
        try {
            const matchResult = matchMutation(db, result.mutationId);
            if (matchResult && matchResult.ok) matched++;
        } catch (error) {
            errors++;
            console.error('[matcher] error matching mutation', result.mutationId, ':', error.message);
        }
    }

    return {
        ingested: ingestResults.filter(r => r.inserted).length,
        duplicates: ingestResults.filter(r => !r.inserted).length,
        matched,
        errors,
    };
}

module.exports = {
    matchMutation,
    matchPendingMutations,
    processNewMutations,
};
