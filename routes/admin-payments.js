const express = require('express');
const rateLimit = require('express-rate-limit');
const { isAuthenticated } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const { markPaymentFailed, markPaymentPaid } = require('../lib/payment-reconciler');

const router = express.Router();

const adminPaymentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Terlalu banyak request admin pembayaran. Coba lagi sebentar.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.use(isAuthenticated, isAdmin, adminPaymentLimiter);

function normalizedLimit(value) {
    const limit = Number.parseInt(String(value || ''), 10);
    return Math.min(Math.max(Number.isInteger(limit) ? limit : 50, 1), 200);
}

function paymentRows(db, { status = '', q = '', pendingOnly = false, limit = 50 }) {
    let sql = `
        SELECT
            p.id,
            p.user_id,
            p.merchant_order_id,
            p.amount,
            p.qris_base_amount,
            p.qris_suffix,
            p.qris_full_amount,
            p.product_details,
            p.email,
            p.reference,
            p.status,
            p.expires_at,
            p.paid_at,
            p.reconciled_via,
            p.created_at,
            p.updated_at,
            u.display_name,
            u.username
        FROM payments p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE 1 = 1
    `;
    const params = [];

    if (pendingOnly) {
        sql += ` AND p.status = 'PENDING' AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP)`;
    } else if (status) {
        sql += ' AND p.status = ?';
        params.push(String(status).trim().toUpperCase());
    }

    const query = String(q || '').trim();
    if (query) {
        sql += ' AND (p.merchant_order_id LIKE ? OR p.email LIKE ? OR p.product_details LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)';
        const like = `%${query}%`;
        params.push(like, like, like, like, like);
    }

    sql += ' ORDER BY p.created_at DESC, p.id DESC LIMIT ?';
    params.push(normalizedLimit(limit));
    return db.prepare(sql).all(...params);
}

router.get('/pending', (req, res) => {
    try {
        res.json(paymentRows(req.app.locals.db, { pendingOnly: true, limit: req.query.limit }));
    } catch (error) {
        console.error('GET /api/admin/payments/pending error:', error);
        res.status(500).json({ error: 'Gagal memuat pembayaran pending.' });
    }
});

router.get('/', (req, res) => {
    try {
        res.json(paymentRows(req.app.locals.db, {
            status: req.query.status,
            q: req.query.q,
            limit: req.query.limit,
        }));
    } catch (error) {
        console.error('GET /api/admin/payments error:', error);
        res.status(500).json({ error: 'Gagal memuat pembayaran.' });
    }
});

router.post('/:merchantOrderId/mark-paid', (req, res) => {
    try {
        const result = markPaymentPaid(req.app.locals.db, {
            merchantOrderId: req.params.merchantOrderId,
            fullAmount: req.body.fullAmount != null && req.body.fullAmount !== '' ? Number(req.body.fullAmount) : null,
            source: 'admin',
            actorId: req.session.userId,
            rawDetails: { note: String(req.body.note || '').slice(0, 500) },
        });
        res.json({ ok: true, ...result });
    } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
    }
});

router.post('/:merchantOrderId/mark-failed', (req, res) => {
    try {
        const result = markPaymentFailed(req.app.locals.db, {
            merchantOrderId: req.params.merchantOrderId,
            source: 'admin',
            actorId: req.session.userId,
            reason: String(req.body.reason || '').slice(0, 500),
        });
        res.json({ ok: true, ...result });
    } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
    }
});

router.get('/:merchantOrderId/audit-log', (req, res) => {
    try {
        const logs = req.app.locals.db.prepare(`
            SELECT id, merchant_order_id, action, actor_id, source, details, created_at
            FROM payment_reconciliation_log
            WHERE merchant_order_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 100
        `).all(String(req.params.merchantOrderId || '').trim());
        res.json(logs);
    } catch (error) {
        console.error('GET /api/admin/payments/audit-log error:', error);
        res.status(500).json({ error: 'Gagal memuat audit log pembayaran.' });
    }
});

module.exports = router;
