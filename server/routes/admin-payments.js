const express = require('express');
const rateLimit = require('express-rate-limit');
const { isAuthenticated } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const { adminIpAllowlist } = require('../security/ip-allowlist');
const { markPaymentFailed, markPaymentPaid } = require('../payments/payment-reconciler');
const { isEnabled: isFeatureEnabled } = require('../config/feature-flags');
const paymentBroadcaster = require('../payments/payment-broadcaster');

const router = express.Router();

const BULK_ADMIN_ENABLED = isFeatureEnabled('BULK_ADMIN');

const adminPaymentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Terlalu banyak request admin pembayaran. Coba lagi sebentar.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const adminMarkPaidLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    message: { error: 'Terlalu banyak aksi mark-paid dalam 5 menit. Tunggu sebentar.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `admin:mark:${req.userId || req.session?.userId || 'unknown'}`,
});

const adminBulkMarkPaidLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    message: { error: 'Terlalu banyak aksi bulk mark-paid dalam 5 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `admin:bulk:${req.userId || req.session?.userId || 'unknown'}`,
    skip: () => !BULK_ADMIN_ENABLED,
});

router.use(isAuthenticated, isAdmin, adminIpAllowlist, adminPaymentLimiter);

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

router.post('/:merchantOrderId/mark-paid', adminMarkPaidLimiter, (req, res) => {
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

router.get('/dashboard', (req, res) => {
    const db = req.app.locals.db;
    try {
        const counts = db.prepare(`
            SELECT status, COUNT(*) as count
            FROM payments
            WHERE 1=1
            GROUP BY status
        `).all();

        const countsByStatus = {
            PENDING: 0, SUCCESS: 0, FAILED: 0, EXPIRED: 0,
        };
        for (const row of counts) {
            countsByStatus[row.status] = row.count;
        }

        const ambiguousCount = db.prepare(`
            SELECT COUNT(*) as count FROM payment_reconciliation_log
            WHERE action = 'auto_verify_ambiguous'
              AND created_at > datetime('now', '-24 hours')
        `).get()?.count || 0;

        const invalidWebhookCount = db.prepare(`
            SELECT COUNT(*) as count FROM payment_reconciliation_log
            WHERE action = 'rejected_amount_mismatch'
              AND created_at > datetime('now', '-24 hours')
        `).get()?.count || 0;

        const recentErrors = db.prepare(`
            SELECT id, merchant_order_id, action, source, details, created_at
            FROM payment_reconciliation_log
            WHERE action IN (
                'rejected_expired_resurrection',
                'rejected_failed_resurrection',
                'rejected_amount_mismatch',
                'auto_verify_ambiguous',
                'auto_verify_invalid_status'
            )
            ORDER BY created_at DESC, id DESC
            LIMIT 20
        `).all();

        const lastIngest = db.prepare(`
            SELECT received_at, provider FROM payment_webhook_events
            ORDER BY received_at DESC LIMIT 1
        `).get() || null;

        const collectorStats = req.app.locals.mutationCollector?.getStats?.() || null;

        res.json({
            counts: countsByStatus,
            last24h: {
                ambiguousMatches: ambiguousCount,
                invalidWebhooks: invalidWebhookCount,
            },
            recentErrors: recentErrors.map((row) => ({
                ...row,
                details: row.details ? safeJsonParse(row.details) : null,
            })),
            lastWebhookIngest: lastIngest,
            collector: collectorStats,
        });
    } catch (error) {
        console.error('GET /api/admin/payments/dashboard error:', error);
        res.status(500).json({ error: 'Gagal memuat dashboard pembayaran.' });
    }
});

function safeJsonParse(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
}

// GET /api/admin/payments/ambiguous — list unresolved ambiguous mutations
router.get('/ambiguous', (req, res) => {
    if (!BULK_ADMIN_ENABLED) {
        return res.status(503).json({ error: 'Bulk admin feature belum aktif.' });
    }
    try {
        const rows = req.app.locals.db.prepare(`
            SELECT id, mutation_id, merchant_order_id, confidence_score,
                   transacted_at, amount, payer_name_masked, created_at
            FROM payment_ambiguous_queue
            WHERE resolved_at IS NULL
            ORDER BY created_at DESC, id DESC
            LIMIT 100
        `).all();
        res.json(rows);
    } catch (error) {
        if (String(error.message || '').includes('no such table')) {
            return res.json([]);
        }
        console.error('GET /api/admin/payments/ambiguous error:', error);
        res.status(500).json({ error: 'Gagal memuat antrian ambigu.' });
    }
});

// POST /api/admin/payments/ambiguous/:mutationId/resolve — force-resolve ke order tertentu
router.post('/ambiguous/:mutationId/resolve', (req, res) => {
    if (!BULK_ADMIN_ENABLED) {
        return res.status(503).json({ error: 'Bulk admin feature belum aktif.' });
    }
    const { merchantOrderId, force = false } = req.body || {};
    const mutationId = Number(req.params.mutationId);
    if (!Number.isInteger(mutationId) || mutationId <= 0 || !merchantOrderId) {
        return res.status(400).json({ error: 'mutationId dan merchantOrderId wajib diisi' });
    }
    const db = req.app.locals.db;
    try {
        const result = markPaymentPaid(db, {
            merchantOrderId: String(merchantOrderId),
            fullAmount: req.body.fullAmount != null && req.body.fullAmount !== '' ? Number(req.body.fullAmount) : null,
            source: 'admin_force',
            actorId: req.session.userId,
            rawDetails: {
                resolvedFromAmbiguousMutationId: mutationId,
                force: Boolean(force),
                note: String(req.body.note || '').slice(0, 500),
            },
        });
        try {
            db.prepare(`
                UPDATE payment_ambiguous_queue
                SET resolved_at = CURRENT_TIMESTAMP, resolved_by = ?, resolution = 'matched',
                    resolution_details = ?
                WHERE id = ?
            `).run(String(req.session.userId || 'admin'), JSON.stringify({ merchantOrderId }), mutationId);
        } catch (_) {
            // table may not exist; ignore
        }
        res.json({ ok: true, ...result });
    } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
    }
});

// POST /api/admin/payments/bulk-mark-paid — up to 50 items per call
router.post('/bulk-mark-paid', adminBulkMarkPaidLimiter, (req, res) => {
    if (!BULK_ADMIN_ENABLED) {
        return res.status(503).json({ error: 'Bulk admin feature belum aktif.' });
    }
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0 || items.length > 50) {
        return res.status(400).json({ error: 'items array 1-50 wajib diisi' });
    }
    const db = req.app.locals.db;
    const results = [];
    const errors = [];
    for (const item of items) {
        const orderId = String(item.merchantOrderId || '').trim();
        if (!orderId) {
            errors.push({ merchantOrderId: orderId, error: 'merchantOrderId kosong' });
            continue;
        }
        try {
            const result = markPaymentPaid(db, {
                merchantOrderId: orderId,
                fullAmount: item.fullAmount != null && item.fullAmount !== '' ? Number(item.fullAmount) : null,
                source: 'admin_bulk',
                actorId: req.session.userId,
                rawDetails: { note: String(item.note || 'bulk action').slice(0, 500) },
            });
            results.push({ merchantOrderId: orderId, ok: true, ...result });
        } catch (err) {
            errors.push({ merchantOrderId: orderId, error: err.message });
        }
    }
    res.json({
        ok: errors.length === 0,
        results,
        errors,
        summary: { total: items.length, success: results.length, failed: errors.length },
    });
});

// POST /api/admin/payments/:merchantOrderId/resend-email — kirim ulang email sukses
router.post('/:merchantOrderId/resend-email', async (req, res) => {
    const db = req.app.locals.db;
    const orderId = String(req.params.merchantOrderId || '').trim();
    const payment = db.prepare('SELECT * FROM payments WHERE merchant_order_id = ?').get(orderId);
    if (!payment) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
    if (payment.status !== 'SUCCESS') {
        return res.status(409).json({ error: 'Hanya pembayaran SUCCESS yang bisa di-resend email' });
    }
    const user = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(payment.user_id);
    if (!user || !user.email) return res.status(400).json({ error: 'User tidak punya email' });
    try {
        const mailer = require('../notifications/mailer');
        const emailTpl = require('../notifications/email-templates');
        const rendered = emailTpl.renderPaymentSuccess({ user, payment });
        const send = mailer.sendMail || mailer.send;
        if (typeof send !== 'function') {
            return res.status(503).json({ error: 'Mailer belum dikonfigurasi.' });
        }
        await send({
            to: user.email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
        });
        db.prepare(`
            INSERT INTO payment_reconciliation_log (merchant_order_id, action, actor_id, source, details)
            VALUES (?, 'email_resent', ?, 'admin', ?)
        `).run(orderId, req.session.userId || null, JSON.stringify({ to: user.email }));
        res.json({ ok: true, sentTo: user.email });
    } catch (err) {
        console.error('[admin] resend-email failed:', err.message);
        res.status(500).json({ error: 'Gagal kirim email: ' + err.message });
    }
});

// GET /api/admin/payments/metrics — last 24h counts & collector health
router.get('/metrics', (req, res) => {
    const db = req.app.locals.db;
    try {
        const last24h = "datetime('now', '-24 hours')";
        const count = (sql) => {
            try {
                return db.prepare(sql).get()?.count || 0;
            } catch (_) {
                return 0;
            }
        };
        const counts = {
            auto_paid: count(`SELECT COUNT(*) count FROM payment_reconciliation_log WHERE action='mark_paid' AND source='auto_verify' AND created_at > ${last24h}`),
            manual_paid: count(`SELECT COUNT(*) count FROM payment_reconciliation_log WHERE action='mark_paid' AND source='admin' AND created_at > ${last24h}`),
            bulk_paid: count(`SELECT COUNT(*) count FROM payment_reconciliation_log WHERE action='mark_paid' AND source='admin_bulk' AND created_at > ${last24h}`),
            force_paid: count(`SELECT COUNT(*) count FROM payment_reconciliation_log WHERE action='mark_paid' AND source='admin_force' AND created_at > ${last24h}`),
            webhook_paid: count(`SELECT COUNT(*) count FROM payment_reconciliation_log WHERE action='mark_paid' AND source='duitku' AND created_at > ${last24h}`),
            ambiguous_resolved: count(`SELECT COUNT(*) count FROM payment_ambiguous_queue WHERE resolved_at > ${last24h}`),
            ambiguous_open: count(`SELECT COUNT(*) count FROM payment_ambiguous_queue WHERE resolved_at IS NULL`),
            emails_sent: count(`SELECT COUNT(*) count FROM payment_reconciliation_log WHERE action='email_sent' AND created_at > ${last24h}`),
            emails_resent: count(`SELECT COUNT(*) count FROM payment_reconciliation_log WHERE action='email_resent' AND created_at > ${last24h}`),
        };
        const heartbeat = req.app.locals.collectorHeartbeat || null;
        const broadcasterStats = paymentBroadcaster.getStats();
        res.json({ last24h: counts, collector: heartbeat, broadcaster: broadcasterStats });
    } catch (error) {
        console.error('GET /api/admin/payments/metrics error:', error);
        res.status(500).json({ error: 'Gagal memuat metrics.' });
    }
});

module.exports = router;
