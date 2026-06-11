const crypto = require('crypto');
const { releaseSuffix, toSqlDateTime } = require('./qris-suffix-pool');

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'EXPIRED']);

function logReconciliation(db, { merchantOrderId, action, actorId = null, source, details = {} }) {
    db.prepare(`
        INSERT INTO payment_reconciliation_log (merchant_order_id, action, actor_id, source, details)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        String(merchantOrderId || ''),
        String(action || ''),
        actorId || null,
        String(source || 'unknown'),
        JSON.stringify(details || {})
    );
}

function ensureAccessGrant(db, payment) {
    if (!payment || !payment.user_id || payment.status === 'SUCCESS') return null;
    const value = String(payment.product_details || '').trim();
    if (!value) return null;

    const isSubscription = ['Trial 7 Hari', 'Bulanan', 'Semester'].includes(value);
    const tryoutPackage = isSubscription ? null : db.prepare(`
        SELECT tryout_id
        FROM tryout_packages
        WHERE title = ?
        LIMIT 1
    `).get(value);
    const accessType = isSubscription ? 'subscription' : 'tryout';
    const accessValue = accessType === 'tryout'
        ? (String(tryoutPackage?.tryout_id || '').trim() || value)
        : value;
    const existing = db.prepare(`
        SELECT id
        FROM user_access_grants
        WHERE user_id = ? AND access_type = ? AND access_value = ?
    `).get(payment.user_id, accessType, accessValue);
    if (existing) return existing.id;

    const info = db.prepare(`
        INSERT INTO user_access_grants (user_id, access_type, access_value)
        VALUES (?, ?, ?)
    `).run(payment.user_id, accessType, accessValue);
    return info.lastInsertRowid;
}

function readPayment(db, merchantOrderId) {
    return db.prepare('SELECT * FROM payments WHERE merchant_order_id = ?')
        .get(String(merchantOrderId || '').trim());
}

function markPaymentPaid(db, {
    merchantOrderId,
    fullAmount = null,
    source = 'unknown',
    actorId = null,
    rawDetails = {},
}) {
    return db.transaction(() => {
        const payment = readPayment(db, merchantOrderId);
        if (!payment) {
            const error = new Error('Pembayaran tidak ditemukan');
            error.statusCode = 404;
            throw error;
        }
        if (payment.status === 'SUCCESS') return { alreadyPaid: true, payment };
        if (payment.status === 'EXPIRED') {
            const error = new Error('Pembayaran sudah kedaluwarsa. Buat pesanan baru atau beri akses manual jika dana benar-benar masuk.');
            error.statusCode = 409;
            throw error;
        }
        if (payment.status === 'FAILED') {
            const error = new Error('Pembayaran sudah berstatus gagal.');
            error.statusCode = 409;
            throw error;
        }

        const expectedAmount = payment.qris_full_amount || payment.amount;
        if (fullAmount != null && expectedAmount && Number(fullAmount) !== Number(expectedAmount)) {
            const error = new Error(`Nominal tidak cocok: expected ${expectedAmount}, got ${fullAmount}`);
            error.statusCode = 400;
            throw error;
        }

        const now = toSqlDateTime(new Date());
        const grantId = ensureAccessGrant(db, payment);
        db.prepare(`
            UPDATE payments
            SET status = 'SUCCESS',
                paid_at = ?,
                reconciled_via = ?,
                reconciled_by = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(now, String(source || 'unknown'), actorId || null, payment.id);
        releaseSuffix({ db, merchantOrderId: payment.merchant_order_id });

        logReconciliation(db, {
            merchantOrderId: payment.merchant_order_id,
            action: 'mark_paid',
            actorId,
            source,
            details: { ...rawDetails, grantId, expectedAmount },
        });

        return { success: true, payment: { ...payment, status: 'SUCCESS' }, grantId };
    })();
}

function markPaymentFailed(db, {
    merchantOrderId,
    source = 'unknown',
    actorId = null,
    reason = '',
}) {
    return db.transaction(() => {
        const payment = readPayment(db, merchantOrderId);
        if (!payment) {
            const error = new Error('Pembayaran tidak ditemukan');
            error.statusCode = 404;
            throw error;
        }
        if (TERMINAL_STATUSES.has(payment.status)) {
            return { alreadyTerminal: true, payment };
        }

        db.prepare(`
            UPDATE payments
            SET status = 'FAILED',
                reconciled_via = ?,
                reconciled_by = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(String(source || 'unknown'), actorId || null, payment.id);
        releaseSuffix({ db, merchantOrderId: payment.merchant_order_id });
        logReconciliation(db, {
            merchantOrderId: payment.merchant_order_id,
            action: 'mark_failed',
            actorId,
            source,
            details: { reason },
        });
        return { success: true, payment: { ...payment, status: 'FAILED' } };
    })();
}

function verifyWebhookSignature(secret, body, signature, timestampToleranceSec = 300) {
    const normalizedSecret = String(secret || '').trim();
    const normalizedSignature = String(signature || '').trim();
    if (!normalizedSecret || !normalizedSignature || !body || !body.timestamp) return false;

    const timestamp = Number(body.timestamp);
    if (!Number.isFinite(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - timestamp) > timestampToleranceSec) return false;

    const merchantOrderId = String(body.merchantOrderId || '').trim();
    const fullAmount = Number(body.fullAmount);
    if (!merchantOrderId || !Number.isFinite(fullAmount)) return false;

    const expected = crypto
        .createHmac('sha256', normalizedSecret)
        .update(`${merchantOrderId}:${Math.round(fullAmount)}:${timestamp}`)
        .digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(normalizedSignature);
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function signWebhookPayload(secret, { merchantOrderId, fullAmount, timestamp = Math.floor(Date.now() / 1000) }) {
    const signature = crypto
        .createHmac('sha256', String(secret || ''))
        .update(`${String(merchantOrderId || '').trim()}:${Number(fullAmount)}:${timestamp}`)
        .digest('hex');
    return { signature, timestamp };
}

module.exports = {
    ensureAccessGrant,
    logReconciliation,
    markPaymentFailed,
    markPaymentPaid,
    readPayment,
    signWebhookPayload,
    verifyWebhookSignature,
};
