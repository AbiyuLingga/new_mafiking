const { releaseExpiredSuffixes, toSqlDateTime } = require('./qris-suffix-pool');
const { logReconciliation } = require('./payment-reconciler');

function sweepExpiredPayments(db, now = new Date()) {
    const nowSql = toSqlDateTime(now);
    return db.transaction(() => {
        const rows = db.prepare(`
            SELECT merchant_order_id
            FROM payments
            WHERE status = 'PENDING'
              AND expires_at IS NOT NULL
              AND expires_at <= ?
        `).all(nowSql);
        if (rows.length === 0) {
            releaseExpiredSuffixes({ db, now });
            return 0;
        }

        db.prepare(`
            UPDATE payments
            SET status = 'EXPIRED',
                reconciled_via = COALESCE(reconciled_via, 'sweeper'),
                updated_at = CURRENT_TIMESTAMP
            WHERE status = 'PENDING'
              AND expires_at IS NOT NULL
              AND expires_at <= ?
        `).run(nowSql);

        releaseExpiredSuffixes({ db, now });
        for (const row of rows) {
            logReconciliation(db, {
                merchantOrderId: row.merchant_order_id,
                action: 'auto_expire',
                source: 'sweeper',
                details: { expiredAt: nowSql },
            });
        }
        return rows.length;
    })();
}

function expirePaymentIfNeeded(db, merchantOrderId, now = new Date()) {
    const row = db.prepare(`
        SELECT merchant_order_id, status, expires_at
        FROM payments
        WHERE merchant_order_id = ?
    `).get(String(merchantOrderId || '').trim());
    if (!row || row.status !== 'PENDING' || !row.expires_at) return row ? row.status : null;
    if (String(row.expires_at) > toSqlDateTime(now)) return row.status;
    sweepExpiredPayments(db, now);
    return 'EXPIRED';
}

function startExpirySweeper(db, intervalMs = 60000) {
    const normalizedInterval = Math.max(5000, Number(intervalMs) || 60000);
    const timer = setInterval(() => {
        try {
            const expired = sweepExpiredPayments(db);
            if (expired > 0) console.log(`[payment-expiry] expired ${expired} payment(s)`);
        } catch (error) {
            console.error('[payment-expiry] sweep failed:', error);
        }
    }, normalizedInterval);
    timer.unref?.();
    console.log(`[payment-expiry] sweeper started (${normalizedInterval}ms)`);
    return timer;
}

module.exports = {
    expirePaymentIfNeeded,
    startExpirySweeper,
    sweepExpiredPayments,
};
