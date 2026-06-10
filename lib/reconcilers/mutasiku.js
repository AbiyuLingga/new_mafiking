const crypto = require('crypto');
const axios = require('axios');
const { markPaymentPaid } = require('../payment-reconciler');

const DEFAULT_BASE_URL = 'https://mutasiku.co.id/api/v1';

function safeCompare(expected, received) {
    const expectedBuffer = Buffer.from(String(expected || ''));
    const receivedBuffer = Buffer.from(String(received || ''));
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function stableJson(value) {
    return JSON.stringify(value == null ? {} : value);
}

function signMutasikuData(secret, data) {
    return crypto
        .createHmac('sha256', String(secret || ''))
        .update(stableJson(data))
        .digest('hex');
}

function verifyMutasikuSignature({ secret, data, signature }) {
    const normalizedSecret = String(secret || '').trim();
    const normalizedSignature = String(signature || '').trim();
    if (!normalizedSecret || !normalizedSignature) return false;
    return safeCompare(signMutasikuData(normalizedSecret, data), normalizedSignature);
}

function normalizeAmount(value) {
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

function mutationEventToCandidate(payload = {}) {
    const type = String(payload.type || '').trim();
    const data = payload.data || payload;

    if (type === 'payment.completed') {
        return {
            amount: normalizeAmount(data.totalAmount || data.amount || data.transaction?.amount),
            merchantOrderId: String(data.orderId || '').trim(),
            sourceId: String(data.id || data.transaction?.id || ''),
            sourceType: type,
            raw: payload,
        };
    }

    if (type && type !== 'mutations.created') return null;
    if (String(data.type || '').toUpperCase() !== 'CREDIT') return null;
    if (String(data.status || 'SUCCESS').toUpperCase() !== 'SUCCESS') return null;

    return {
        amount: normalizeAmount(data.amount),
        merchantOrderId: String(data.payment?.orderId || '').trim(),
        sourceId: String(data.id || data.mutationId || ''),
        sourceType: type || 'mutation',
        raw: payload,
    };
}

function pendingPaymentByOrderId(db, merchantOrderId) {
    if (!merchantOrderId) return null;
    return db.prepare(`
        SELECT *
        FROM payments
        WHERE merchant_order_id = ?
          AND status = 'PENDING'
        LIMIT 1
    `).get(merchantOrderId);
}

function pendingPaymentsByAmount(db, amount, now = new Date()) {
    return db.prepare(`
        SELECT *
        FROM payments
        WHERE status = 'PENDING'
          AND COALESCE(qris_full_amount, amount) = ?
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at ASC, id ASC
        LIMIT 3
    `).all(amount, now.toISOString().slice(0, 19).replace('T', ' '));
}

function logMutasikuDecision(db, { merchantOrderId = '', action, details = {} }) {
    db.prepare(`
        INSERT INTO payment_reconciliation_log (merchant_order_id, action, actor_id, source, details)
        VALUES (?, ?, NULL, 'mutasiku', ?)
    `).run(String(merchantOrderId || ''), String(action || ''), JSON.stringify(details || {}));
}

function reconcileMutasikuCandidate(db, candidate, options = {}) {
    if (!candidate || !candidate.amount) {
        return { ok: false, skipped: true, reason: 'not_credit_success' };
    }

    let payment = pendingPaymentByOrderId(db, candidate.merchantOrderId);
    if (!payment) {
        const matches = pendingPaymentsByAmount(db, candidate.amount, options.now || new Date());
        if (matches.length !== 1) {
            logMutasikuDecision(db, {
                action: matches.length > 1 ? 'mutasiku_ambiguous' : 'mutasiku_unmatched',
                details: {
                    amount: candidate.amount,
                    sourceId: candidate.sourceId,
                    sourceType: candidate.sourceType,
                    matchCount: matches.length,
                    candidateOrderId: candidate.merchantOrderId || '',
                },
            });
            return {
                ok: false,
                skipped: true,
                reason: matches.length > 1 ? 'ambiguous_amount' : 'no_pending_payment',
                amount: candidate.amount,
                matchCount: matches.length,
            };
        }
        payment = matches[0];
    }

    const result = markPaymentPaid(db, {
        merchantOrderId: payment.merchant_order_id,
        fullAmount: candidate.amount,
        source: 'mutasiku',
        rawDetails: {
            sourceId: candidate.sourceId,
            sourceType: candidate.sourceType,
            receivedAt: new Date().toISOString(),
            raw: candidate.raw,
        },
    });
    return { ok: true, merchantOrderId: payment.merchant_order_id, ...result };
}

function handleMutasikuWebhook(db, payload, { signature, secret } = {}) {
    if (!verifyMutasikuSignature({ secret, data: payload && payload.data, signature })) {
        const error = new Error('Signature Mutasiku tidak valid.');
        error.statusCode = 401;
        throw error;
    }
    const candidate = mutationEventToCandidate(payload);
    return reconcileMutasikuCandidate(db, candidate);
}

async function pollMutasiku(db, env = process.env, options = {}) {
    const apiKey = String(env.MUTASIKU_API_KEY || '').trim();
    if (!apiKey) return { skipped: true, reason: 'missing_api_key' };

    const baseUrl = String(env.MUTASIKU_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const accountId = String(env.MUTASIKU_ACCOUNT_ID || '').trim();
    const limit = Math.min(100, Math.max(1, Number(env.MUTASIKU_POLL_LIMIT) || 50));
    const params = {
        type: 'CREDIT',
        page: 1,
        limit,
    };
    if (accountId) params.accountId = accountId;
    if (env.MUTASIKU_ACCOUNT_TYPE) params.accountType = env.MUTASIKU_ACCOUNT_TYPE;

    const today = new Date().toISOString().slice(0, 10);
    params.startDate = String(env.MUTASIKU_POLL_START_DATE || today);
    params.endDate = String(env.MUTASIKU_POLL_END_DATE || today);

    const client = options.client || axios;
    const { data } = await client.get(`${baseUrl}/mutations`, {
        headers: { 'x-api-key': apiKey },
        params,
        timeout: Number(env.MUTASIKU_TIMEOUT_MS) || 12000,
    });

    const rows = Array.isArray(data?.data) ? data.data : [];
    const results = [];
    for (const row of rows) {
        const candidate = mutationEventToCandidate({ type: 'mutations.created', data: row });
        results.push(reconcileMutasikuCandidate(db, candidate));
    }
    return { ok: true, checked: rows.length, results };
}

function startMutasikuPoller(db, env = process.env) {
    const apiKey = String(env.MUTASIKU_API_KEY || '').trim();
    if (!apiKey) return null;

    const intervalMs = Math.max(30000, Number(env.MUTASIKU_POLL_INTERVAL) || 60000);
    const timer = setInterval(() => {
        pollMutasiku(db, env).catch((error) => {
            console.error('[mutasiku] polling failed:', error.response?.data || error.message);
        });
    }, intervalMs);
    timer.unref?.();
    console.log(`[mutasiku] poller started (${intervalMs}ms)`);
    return timer;
}

module.exports = {
    handleMutasikuWebhook,
    mutationEventToCandidate,
    pollMutasiku,
    reconcileMutasikuCandidate,
    signMutasikuData,
    startMutasikuPoller,
    verifyMutasikuSignature,
};
