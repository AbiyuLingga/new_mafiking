const crypto = require('crypto');
const { releaseSuffix, toSqlDateTime } = require('./qris-suffix-pool');
const {
    alertAmountMismatch,
    alertExpiredResurrection,
} = require('./payment-alerts');

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'EXPIRED']);
const VALID_PROVIDER_STATUSES = new Set(['SUCCESS', 'FAILED', 'PENDING']);

function canonicalAmount(value) {
    if (value == null) return null;
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n <= 0) return null;
    return Math.round(n);
}

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
    if (!payment || !payment.user_id) return null;
    if (payment.status === 'SUCCESS') {
        const existing = db.prepare(`
            SELECT id FROM user_access_grants
            WHERE user_id = ? AND payment_merchant_order_id = ?
            LIMIT 1
        `).get(payment.user_id, payment.merchant_order_id);
        if (existing) return existing.id;
    }

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
        WHERE user_id = ? AND access_type = ? AND access_value = ? AND payment_merchant_order_id = ?
    `).get(payment.user_id, accessType, accessValue, payment.merchant_order_id);
    if (existing) return existing.id;

    const info = db.prepare(`
        INSERT INTO user_access_grants (user_id, access_type, access_value, payment_merchant_order_id)
        VALUES (?, ?, ?, ?)
    `).run(payment.user_id, accessType, accessValue, payment.merchant_order_id);
    return info.lastInsertRowid;
}

function readPayment(db, merchantOrderId) {
    return db.prepare('SELECT * FROM payments WHERE merchant_order_id = ?')
        .get(String(merchantOrderId || '').trim());
}

function checkAndRecordWebhookEvent(db, { provider, eventId, eventHash, merchantOrderId }) {
    const record = db.prepare(`
        SELECT id, processed_status FROM payment_webhook_events WHERE event_hash = ?
    `).get(eventHash);
    if (record) {
        return { alreadyProcessed: true, record };
    }

    db.prepare(`
        INSERT INTO payment_webhook_events (provider, event_id, event_hash, merchant_order_id)
        VALUES (?, ?, ?, ?)
    `).run(provider, eventId || null, eventHash, merchantOrderId || null);

    return { alreadyProcessed: false };
}

function resolveIdempotencyKey(db, keyHash, expiresAt) {
    const existing = db.prepare(`
        SELECT merchant_order_id FROM payment_idempotency_keys
        WHERE key_hash = ? AND expires_at > ?
    `).get(keyHash, toSqlDateTime(new Date()));

    if (existing) return existing;

    db.prepare(`
        DELETE FROM payment_idempotency_keys WHERE expires_at < ?
    `).run(toSqlDateTime(new Date()));

    return null;
}

function storeIdempotencyKey(db, keyHash, merchantOrderId, expiresAt) {
    db.prepare(`
        INSERT OR IGNORE INTO payment_idempotency_keys (key_hash, merchant_order_id, expires_at)
        VALUES (?, ?, ?)
    `).run(keyHash, merchantOrderId, toSqlDateTime(new Date(expiresAt)));
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
            logReconciliation(db, {
                merchantOrderId,
                action: 'rejected_expired_resurrection',
                actorId,
                source,
                details: { ...rawDetails, providedAmount: fullAmount },
            });
            alertExpiredResurrection(merchantOrderId, source);
            const error = new Error('Pembayaran sudah kedaluwarsa. Buat pesanan baru atau beri akses manual jika dana benar-benar masuk.');
            error.statusCode = 409;
            throw error;
        }
        if (payment.status === 'FAILED') {
            logReconciliation(db, {
                merchantOrderId,
                action: 'rejected_failed_resurrection',
                actorId,
                source,
                details: { ...rawDetails, providedAmount: fullAmount },
            });
            const error = new Error('Pembayaran sudah berstatus gagal.');
            error.statusCode = 409;
            throw error;
        }

        const validatedAmount = canonicalAmount(fullAmount);
        const expectedAmount = canonicalAmount(payment.qris_full_amount || payment.amount);
        if (validatedAmount != null && expectedAmount != null && validatedAmount !== expectedAmount) {
            logReconciliation(db, {
                merchantOrderId,
                action: 'rejected_amount_mismatch',
                actorId,
                source,
                details: { ...rawDetails, expected: expectedAmount, provided: validatedAmount },
            });
            alertAmountMismatch(merchantOrderId, expectedAmount, validatedAmount, source);
            const error = new Error(`Nominal tidak cocok: expected ${expectedAmount}, got ${validatedAmount}`);
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
            details: { ...rawDetails, grantId, expectedAmount, validatedAmount },
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

function computeWebhookEventHash({ provider, eventId, timestamp, merchantOrderId, amount }) {
    return crypto
        .createHash('sha256')
        .update(`${provider}:${eventId || ''}:${timestamp || ''}:${merchantOrderId || ''}:${amount || ''}`)
        .digest('hex');
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

function validateProviderStatus(status, provider) {
    if (!status || !VALID_PROVIDER_STATUSES.has(String(status).toUpperCase())) {
        return { valid: false, normalized: null, reason: `Unknown/empty status from ${provider}: "${status}"` };
    }
    return { valid: true, normalized: String(status).toUpperCase() };
}

module.exports = {
    canonicalAmount,
    checkAndRecordWebhookEvent,
    computeWebhookEventHash,
    ensureAccessGrant,
    logReconciliation,
    markPaymentFailed,
    markPaymentPaid,
    readPayment,
    resolveIdempotencyKey,
    signWebhookPayload,
    storeIdempotencyKey,
    validateProviderStatus,
    verifyWebhookSignature,
    VALID_PROVIDER_STATUSES,
};
