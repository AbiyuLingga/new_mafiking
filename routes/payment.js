const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { isRegisteredUser } = require('../middleware/auth');
const { areTryoutPackagesEnabled } = require('../lib/app-settings');
const { setPublicApiCache } = require('../lib/performance');
const { generateDynamicQRIS, assertValidStaticQris } = require('../lib/qris-dynamic');
const { allocateRotatingSuffix, allocateSuffix, releaseSuffix, SuffixPoolExhaustedError } = require('../lib/qris-suffix-pool');
const { expirePaymentIfNeeded } = require('../lib/payment-expiry-sweeper');
const { paymentRateLimiter: dbRateLimiter } = require('../lib/payment-rate-limiter');
const {
    canonicalAmount,
    checkAndRecordWebhookEvent,
    computeWebhookEventHash,
    markPaymentFailed,
    markPaymentPaid,
    resolveIdempotencyKey,
    signWebhookPayload,
    storeIdempotencyKey,
    validateProviderStatus,
    verifyWebhookSignature,
} = require('../lib/payment-reconciler');
const { collectorIpAllowlist } = require('../lib/ip-allowlist');
const paymentBroadcaster = require('../lib/payment-broadcaster');
const { isEnabled: isFeatureEnabled } = require('../lib/feature-flags');
const router = express.Router();

const SSE_PAYMENT_PUSH_ENABLED = isFeatureEnabled('SSE_PAYMENT_PUSH');

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  message: { error: 'Terlalu banyak percobaan pembayaran. Coba lagi sebentar.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const QRIS_DEFAULT_EXPIRY_MINUTES = 20;
const MANUAL_SUFFIX_MIN = 1;
const MANUAL_SUFFIX_MAX = 399;

const SUBSCRIPTION_PACKAGES = {
    'cek-payment': { label: 'Cek Payment', price: 500 },
    trial: { label: 'Trial 7 Hari', price: 29000 },
    bulanan: { label: 'Bulanan', price: 99000 },
    semester: { label: 'Semester', price: 249000 },
};

function safeSignatureCompare(expected, received) {
    const expectedBuffer = Buffer.from(String(expected || ''));
    const receivedBuffer = Buffer.from(String(received || ''));
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function normalizePaymentProvider(env = process.env) {
    const provider = String(env.PAYMENT_PROVIDER || 'qris').trim().toLowerCase();
    return ['manual', 'qris'].includes(provider) ? provider : 'qris';
}

function qrisConfig(env = process.env) {
    const expiryMinutes = Number.parseInt(String(env.QRIS_EXPIRY_MINUTES || ''), 10);
    return {
        staticString: String(env.QRIS_STATIC_STRING || '').trim(),
        merchantName: String(env.QRIS_MERCHANT_NAME || 'MAFIKING').trim(),
        expiryMinutes: Number.isInteger(expiryMinutes) && expiryMinutes > 0 ? expiryMinutes : QRIS_DEFAULT_EXPIRY_MINUTES,
        adminWhatsapp: String(env.QRIS_ADMIN_WHATSAPP || '').replace(/[^0-9]/g, ''),
        webhookEnabled: Boolean(String(env.PAYMENT_WEBHOOK_SECRET || '').trim()),
    };
}

function qrisReadiness(env = process.env) {
    const config = qrisConfig(env);
    if (!config.staticString) {
        return { ready: false, config, error: 'QRIS_STATIC_STRING belum diisi.' };
    }
    try {
        const parsed = assertValidStaticQris(config.staticString);
        return { ready: true, config, merchantName: parsed.merchantName || config.merchantName };
    } catch (error) {
        return { ready: false, config, error: error.message };
    }
}

function isTruthyEnv(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isFalseyEnv(value) {
    return ['0', 'false', 'no', 'off'].includes(String(value || '').trim().toLowerCase());
}

function isMockPaymentEnabled(env = process.env) {
    if (env.NODE_ENV === 'production' && !isTruthyEnv(env.PAYMENT_ALLOW_MOCK_IN_PRODUCTION)) return false;
    if (isTruthyEnv(env.PAYMENT_MOCK_MODE)) return true;
    if (isFalseyEnv(env.PAYMENT_MOCK_MODE)) return false;
    if (normalizePaymentProvider(env) === 'qris') return false;
    return env.NODE_ENV !== 'production';
}

function isLocalGuestCheckoutEnabled(env = process.env) {
    if (env.NODE_ENV === 'production') return false;
    if (isFalseyEnv(env.PAYMENT_LOCAL_GUEST_CHECKOUT)) return false;
    if (isTruthyEnv(env.PAYMENT_LOCAL_GUEST_CHECKOUT)) return true;
    return ['manual', 'qris'].includes(normalizePaymentProvider(env)) || isMockPaymentEnabled(env);
}

function mockTokenSecret() {
    return process.env.PAYMENT_MOCK_SECRET || process.env.SESSION_SECRET || 'new-mafiking-local-payment-mock';
}

function signMockPayment({ merchantOrderId, amount }) {
    return crypto
        .createHmac('sha256', mockTokenSecret())
        .update(`${merchantOrderId}:${Number(amount) || 0}`)
        .digest('hex');
}

function verifyMockPaymentToken({ merchantOrderId, amount, token }) {
    if (!merchantOrderId || !token) return false;
    const expected = signMockPayment({ merchantOrderId, amount });
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(String(token));
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function encodeQuery(value) {
    return encodeURIComponent(String(value || ''));
}

function buildMockPaymentUrl({ merchantOrderId, amount }) {
    const token = signMockPayment({ merchantOrderId, amount });
    return `/api/payment/mock-gateway?merchantOrderId=${encodeQuery(merchantOrderId)}&token=${encodeQuery(token)}`;
}

function paymentError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parsePrice(price) {
    if (typeof price === 'number') return Math.round(price);
    if (!price || price === 'Gratis') return 0;
    const cleaned = String(price).replace(/[^0-9]/g, '');
    return Number.parseInt(cleaned, 10) || 0;
}

function resolvePaymentItem({ body, db, enforceTryoutPackagesEnabled = false }) {
    const purchaseType = body.purchaseType || (body.tryoutPackageId ? 'tryout' : 'subscription');

    if (purchaseType === 'tryout') {
        if (enforceTryoutPackagesEnabled && !areTryoutPackagesEnabled(db)) {
            throw paymentError('Paket Try Out sedang dikunci admin.', 403);
        }

        const tryoutPackageId = Number(body.tryoutPackageId);
        if (!Number.isInteger(tryoutPackageId) || tryoutPackageId <= 0) {
            throw paymentError('Paket tryout tidak valid');
        }

        if (!db) throw paymentError('Database tidak tersedia', 500);
        const pkg = db.prepare('SELECT id, title, price FROM tryout_packages WHERE id = ?').get(tryoutPackageId);
        if (!pkg) throw paymentError('Paket tryout tidak ditemukan', 404);

        const amount = parsePrice(pkg.price);
        if (amount <= 0) throw paymentError('Paket gratis tidak perlu pembayaran');

        return {
            type: 'tryout',
            itemId: pkg.id,
            amount,
            productDetails: String(pkg.title).substring(0, 255),
        };
    }

    if (purchaseType !== 'subscription') {
        throw paymentError('Jenis pembelian tidak valid');
    }

    const packageId = String(body.packageId || '');
    const pkg = SUBSCRIPTION_PACKAGES[packageId];
    if (!pkg) throw paymentError('Paket langganan tidak valid');

    return {
        type: 'subscription',
        itemId: packageId,
        amount: pkg.price,
        productDetails: pkg.label,
    };
}

function isRegisteredPaymentUser({ db, userId }) {
    return isRegisteredUser(db, userId);
}

function canCreatePayment({ db, userId, env = process.env }) {
    return isRegisteredPaymentUser({ db, userId }) || Boolean(userId && isLocalGuestCheckoutEnabled(env));
}

function paymentStatusPayload(payment, status) {
    const provider = payment.reference && String(payment.reference).startsWith('MANUAL-')
        ? 'manual'
        : 'qris';
    return {
        status,
        merchantOrderId: payment.merchant_order_id,
        amount: payment.amount,
        baseAmount: payment.qris_base_amount,
        suffix: payment.qris_suffix,
        fullAmount: payment.qris_full_amount || payment.amount,
        productDetails: payment.product_details,
        email: payment.email,
        provider,
        qrImageDataUrl: payment.qris_image_data_url || '',
        qrString: payment.qris_dynamic_string || payment.qr_string || '',
        expiresAt: payment.expires_at || null,
        paidAt: payment.paid_at || null,
        reconciledVia: payment.reconciled_via || null,
        adminWhatsapp: ['manual', 'qris'].includes(provider) ? qrisConfig().adminWhatsapp : '',
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
    };
}

function invoiceListPayload(payment) {
    const payload = paymentStatusPayload(payment, payment.status);
    return {
        merchantOrderId: payload.merchantOrderId,
        status: payload.status,
        amount: payload.amount,
        baseAmount: payload.baseAmount,
        suffix: payload.suffix,
        fullAmount: payload.fullAmount,
        productDetails: payload.productDetails,
        provider: payload.provider,
        expiresAt: payload.expiresAt,
        paidAt: payload.paidAt,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt,
    };
}

function findReusablePendingPayment({ db, userId, item, now = new Date() }) {
    if (!db || !userId || !item) return null;
    const nowSql = now.toISOString().slice(0, 19).replace('T', ' ');
    const payment = db.prepare(`
        SELECT *
        FROM payments
        WHERE user_id = ?
          AND product_details = ?
          AND status = 'PENDING'
          AND (expires_at IS NULL OR expires_at > ?)
          AND (
              COALESCE(qris_image_data_url, '') != ''
              OR COALESCE(qris_dynamic_string, '') != ''
              OR reference LIKE 'MANUAL-%'
          )
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `).get(userId, item.productDetails, nowSql);
    return payment || null;
}

function paymentGatewayState(env = process.env) {
    const provider = normalizePaymentProvider(env);
    const mockMode = isMockPaymentEnabled(env);
    const qris = qrisReadiness(env);
    const manualSelected = provider === 'manual';
    const qrisSelected = provider === 'qris';
    const providerReady = manualSelected || (qrisSelected && qris.ready);
    const active = providerReady || mockMode;
    const message = active
        ? (manualSelected
            ? 'Pembayaran manual aktif. User wajib chat admin untuk konfirmasi.'
            : qrisSelected && qris.ready
            ? 'QRIS lokal siap digunakan.'
            : 'Payment gateway siap digunakan.')
        : (qrisSelected
            ? `QRIS lokal belum aktif. ${qris.error || 'Lengkapi konfigurasi QRIS.'}`
            : 'Payment gateway sedang dalam proses aktivasi. Pembelian akan dibuka setelah akses payment provider aktif.');

    return {
        active,
        mockMode,
        provider,
        providerReady,
        qrisReady: qris.ready,
        qrisMerchantName: qris.merchantName || qris.config.merchantName,
        qrisExpiryMinutes: qris.config.expiryMinutes,
        qrisAdminWhatsapp: qris.config.adminWhatsapp,
        manualAdminWhatsapp: qris.config.adminWhatsapp,
        qrisWebhookEnabled: qris.config.webhookEnabled,
         guestCheckoutEnabled: isLocalGuestCheckoutEnabled(env),
        autoVerifyEnabled: ['1', 'true', 'yes', 'on'].includes(
            String(env.MUTATION_COLLECTOR_ENABLED || '').toLowerCase()
        ),
        message,
    };
}

async function handleQrisCreate({ req, res, item, merchantOrderId, buyerEmail, buyerName, idempotencyKey = null }) {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    const readiness = qrisReadiness();
    if (!readiness.ready) {
        return res.status(503).json({
            error: readiness.error || 'QRIS lokal belum dikonfigurasi.',
        });
    }

    let lock = null;
    try {
        lock = allocateSuffix({
            db,
            baseAmount: item.amount,
            merchantOrderId,
            ttlSeconds: readiness.config.expiryMinutes * 60,
        });
    } catch (error) {
        if (error instanceof SuffixPoolExhaustedError || error.code === 'SUFFIX_POOL_EXHAUSTED') {
            return res.status(503).json({
                error: 'Slot pembayaran sementara penuh. Coba lagi dalam beberapa menit.',
            });
        }
        console.error('[payment:qris] suffix allocation failed:', error);
        return res.status(500).json({ error: 'Gagal menyiapkan pembayaran QRIS.' });
    }

    let qrResult = null;
    try {
        qrResult = await generateDynamicQRIS({
            staticString: readiness.config.staticString,
            baseAmount: item.amount,
            suffix: lock.suffix,
        });

        db.prepare(`
            INSERT INTO payments (
                user_id, merchant_order_id, amount, product_details, email,
                reference, payment_url, qr_string, status,
                qris_base_amount, qris_suffix, qris_full_amount,
                qris_dynamic_string, qris_image_data_url, expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, '', ?, 'PENDING', ?, ?, ?, ?, ?, ?)
        `).run(
            userId,
            merchantOrderId,
            qrResult.fullAmount,
            item.productDetails,
            buyerEmail,
            'QRIS-' + merchantOrderId,
            qrResult.dynamicString,
            qrResult.baseAmount,
            qrResult.suffix,
            qrResult.fullAmount,
            qrResult.dynamicString,
            qrResult.qrImageDataUrl,
            lock.expiresAt.toISOString().slice(0, 19).replace('T', ' ')
        );
    } catch (error) {
        try {
            releaseSuffix({ db, merchantOrderId });
        } catch (_) {}
        console.error('[payment:qris] create failed:', error);
        return res.status(500).json({ error: 'Gagal membuat QRIS dinamis. Hubungi admin.' });
    }

    if (idempotencyKey) {
        const keyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
        storeIdempotencyKey(db, keyHash, merchantOrderId, Date.now() + 5 * 60 * 1000);
    }

    return res.json({
        merchantOrderId,
        provider: 'qris',
        reference: 'QRIS-' + merchantOrderId,
        amount: qrResult.fullAmount,
        baseAmount: qrResult.baseAmount,
        suffix: qrResult.suffix,
        fullAmount: qrResult.fullAmount,
        productDetails: item.productDetails,
        qrImageDataUrl: qrResult.qrImageDataUrl,
        qrString: qrResult.dynamicString,
        expiresAt: lock.expiresAt.toISOString(),
        adminWhatsapp: readiness.config.adminWhatsapp,
        merchantName: qrResult.merchantName || readiness.config.merchantName,
    });
}

function handleManualCreate({ req, res, item, merchantOrderId, buyerEmail, idempotencyKey = null }) {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    const config = qrisConfig();
    const ttlSeconds = config.expiryMinutes * 60;
    let lock = null;

    try {
        lock = allocateRotatingSuffix({
            db,
            baseAmount: item.amount,
            merchantOrderId,
            ttlSeconds,
            env: { QRIS_SUFFIX_MIN: String(MANUAL_SUFFIX_MIN), QRIS_SUFFIX_MAX: String(MANUAL_SUFFIX_MAX) },
        });
    } catch (error) {
        if (error instanceof SuffixPoolExhaustedError || error.code === 'SUFFIX_POOL_EXHAUSTED') {
            return res.status(503).json({
                error: 'Kode unik pembayaran sedang penuh untuk nominal ini. Coba lagi beberapa menit.',
            });
        }
        console.error('[payment:manual] suffix allocation failed:', error);
        return res.status(500).json({ error: 'Gagal menyiapkan kode unik pembayaran.' });
    }

    const fullAmount = item.amount + lock.suffix;
    try {
        db.prepare(`
            INSERT INTO payments (
                user_id, merchant_order_id, amount, product_details, email,
                reference, payment_url, qr_string, status,
                qris_base_amount, qris_suffix, qris_full_amount, expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, '', '', 'PENDING', ?, ?, ?, ?)
        `).run(
            userId,
            merchantOrderId,
            fullAmount,
            item.productDetails,
            buyerEmail,
            'MANUAL-' + merchantOrderId,
            item.amount,
            lock.suffix,
            fullAmount,
            lock.expiresAt.toISOString().slice(0, 19).replace('T', ' ')
        );
    } catch (error) {
        try {
            releaseSuffix({ db, merchantOrderId });
        } catch (_) {}
        console.error('[payment:manual] create failed:', error);
        return res.status(500).json({ error: 'Gagal membuat order pembayaran manual.' });
    }

    if (idempotencyKey) {
        const keyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
        storeIdempotencyKey(db, keyHash, merchantOrderId, Date.now() + 5 * 60 * 1000);
    }

    return res.json({
        merchantOrderId,
        provider: 'manual',
        reference: 'MANUAL-' + merchantOrderId,
        amount: fullAmount,
        baseAmount: item.amount,
        suffix: lock.suffix,
        fullAmount,
        productDetails: item.productDetails,
        email: buyerEmail,
        expiresAt: lock.expiresAt.toISOString(),
        adminWhatsapp: config.adminWhatsapp,
        instructions: 'Transfer sesuai nominal unik, lalu chat admin untuk konfirmasi dan aktivasi paket.',
    });
}

// GET /api/payment/config
router.get('/config', (_req, res) => {
    setPublicApiCache(res, 30, 120);
    res.json(paymentGatewayState());
});

// POST /api/payment/pending
router.post('/pending', async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    if (!canCreatePayment({ db, userId })) {
        return res.status(401).json({ error: 'Login diperlukan sebelum membeli paket' });
    }

    let item;
    try {
        item = resolvePaymentItem({ body: req.body, db, enforceTryoutPackagesEnabled: true });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ error: err.message });
    }

    try {
        const payment = findReusablePendingPayment({ db, userId, item });
        if (!payment) return res.json({ payment: null });
        expirePaymentIfNeeded(db, payment.merchant_order_id);
        const freshPayment = db.prepare('SELECT * FROM payments WHERE merchant_order_id = ? AND user_id = ?')
            .get(payment.merchant_order_id, userId);
        if (!freshPayment || freshPayment.status !== 'PENDING') return res.json({ payment: null });
        return res.json({ payment: paymentStatusPayload(freshPayment, freshPayment.status) });
    } catch (err) {
        console.error('Failed to find pending payment:', err);
        return res.status(500).json({ error: 'Gagal mengecek pembayaran pending.' });
    }
});

// POST /api/payment/create
router.post('/create', paymentLimiter, dbRateLimiter({ windowMs: 60 * 1000, maxRequests: 5, minIntervalMs: 3000 }), async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    if (!canCreatePayment({ db, userId })) {
        return res.status(401).json({ error: 'Login diperlukan sebelum membeli paket' });
    }

    const { email, name } = req.body;

    if (!email || !name) {
        return res.status(400).json({ error: 'email dan name diperlukan' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
        return res.status(400).json({ error: 'Email pembelian tidak valid' });
    }

    let item;
    try {
        item = resolvePaymentItem({ body: req.body, db, enforceTryoutPackagesEnabled: true });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ error: err.message });
    }

    const idempotencyKey = String(req.body.idempotencyKey || '').trim();
    if (idempotencyKey) {
        const keyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
        const existing = resolveIdempotencyKey(db, keyHash);
        if (existing) {
            return res.json({ idempotent: true, merchantOrderId: existing.merchant_order_id });
        }
    }

    const merchantOrderId = `MFK-${userId}-${Date.now()}`;
    const intAmount = item.amount;
    const productDetails = item.productDetails;
    const buyerEmail = String(email).trim().substring(0, 255);
    const buyerName = String(name).trim().substring(0, 50);

    if (isMockPaymentEnabled()) {
        const mockPaymentUrl = buildMockPaymentUrl({ merchantOrderId, amount: intAmount });

        db.prepare(`
            INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, reference, payment_url, qr_string, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `).run(userId, merchantOrderId, intAmount, productDetails, buyerEmail, 'MOCK-REF-' + merchantOrderId, mockPaymentUrl, 'MOCK-QR-' + merchantOrderId);

        if (idempotencyKey) {
            const keyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
            storeIdempotencyKey(db, keyHash, merchantOrderId, Date.now() + 5 * 60 * 1000);
        }

        return res.json({
            merchantOrderId,
            reference: 'MOCK-REF-' + merchantOrderId,
            paymentUrl: mockPaymentUrl,
            qrString: 'MOCK-QR-' + merchantOrderId,
            amount: intAmount,
            productDetails,
        });
    }

    const provider = normalizePaymentProvider();
    if (provider === 'manual') {
        return handleManualCreate({ req, res, item, merchantOrderId, buyerEmail, idempotencyKey });
    }

    if (provider === 'qris') {
        return handleQrisCreate({ req, res, item, merchantOrderId, buyerEmail, buyerName, idempotencyKey });
    }

    return res.status(503).json({
        error: 'Payment provider tidak dikenali. Hubungi admin.',
    });
});

// GET /api/payment/invoices — authenticated user's own payment history.
router.get('/invoices', (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    if (!isRegisteredPaymentUser({ db, userId })) {
        return res.status(401).json({ error: 'Login diperlukan untuk melihat invoice.' });
    }

    try {
        const pendingRows = db.prepare(`
            SELECT merchant_order_id
            FROM payments
            WHERE user_id = ? AND status = 'PENDING'
            ORDER BY created_at DESC, id DESC
            LIMIT 100
        `).all(userId);
        pendingRows.forEach((payment) => expirePaymentIfNeeded(db, payment.merchant_order_id));

        const invoices = db.prepare(`
            SELECT *
            FROM payments
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 100
        `).all(userId);

        res.setHeader('Cache-Control', 'private, no-store');
        return res.json(invoices.map(invoiceListPayload));
    } catch (err) {
        console.error('Failed to list invoices:', err);
        return res.status(500).json({ error: 'Gagal mengambil riwayat pembelian.' });
    }
});

// GET /api/payment/status/:merchantOrderId
router.get('/status/:merchantOrderId', async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Belum login' });

    const { merchantOrderId } = req.params;

    expirePaymentIfNeeded(db, merchantOrderId);
    const payment = db.prepare('SELECT * FROM payments WHERE merchant_order_id = ? AND user_id = ?').get(merchantOrderId, userId);
    if (!payment) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });

    if (payment.status === 'SUCCESS' || payment.status === 'FAILED' || payment.status === 'EXPIRED') {
        return res.json(paymentStatusPayload(payment, payment.status));
    }

    if (payment.reference && String(payment.reference).startsWith('MANUAL-')) {
        return res.json({
            ...paymentStatusPayload(payment, payment.status),
            statusMessage: 'Menunggu konfirmasi manual admin.',
        });
    }

    if (payment.qris_full_amount) {
        return res.json({
            ...paymentStatusPayload(payment, payment.status),
            statusMessage: 'Menunggu rekonsiliasi QRIS.',
        });
    }

    if (isMockPaymentEnabled()) {
        return res.json({ ...paymentStatusPayload(payment, payment.status), statusMessage: 'Mock status checked' });
    }

    return res.json(paymentStatusPayload(payment, payment.status));
});

// GET /api/payment/stream/:merchantOrderId — Server-Sent Events for real-time payment status push.
router.get('/stream/:merchantOrderId', (req, res) => {
    if (!SSE_PAYMENT_PUSH_ENABLED) {
        return res.status(503).json({ error: 'SSE payment push belum aktif.' });
    }

    const userId = req.session.userId;
    if (!userId) return res.status(401).end();

    const { merchantOrderId } = req.params;
    const db = req.app.locals.db;

    const payment = db.prepare(
        'SELECT user_id, status FROM payments WHERE merchant_order_id = ?'
    ).get(merchantOrderId);
    if (!payment || payment.user_id !== userId) {
        return res.status(403).end();
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`event: status\ndata: ${JSON.stringify({ status: payment.status })}\n\n`);

    const unsubscribe = paymentBroadcaster.subscribe(merchantOrderId, (payload) => {
        res.write(`event: paid\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
    }, 15000);

    req.on('close', () => {
        unsubscribe();
        clearInterval(heartbeat);
    });
});

// GET /api/payment/active-packages
router.get('/active-packages', async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    if (!userId) return res.json([]);

    try {
        const payments = db.prepare(`
            SELECT
                p.product_details,
                tp.tryout_id
            FROM payments p
            LEFT JOIN tryout_packages tp ON tp.title = p.product_details
            WHERE p.user_id = ? AND p.status = 'SUCCESS'
        `).all(userId);

        const grants = db.prepare(`
            SELECT access_type, access_value
            FROM user_access_grants
            WHERE user_id = ?
        `).all(userId);

        const activeProducts = [];
        const activeSet = new Set();
        function addActiveProduct(value) {
            const normalized = String(value || '').trim();
            if (!normalized || activeSet.has(normalized)) return;
            activeSet.add(normalized);
            activeProducts.push(normalized);
        }
        const revoked = new Set();
        const nonRevokedGrants = [];
        for (const grant of grants) {
            if (grant.access_type === 'revoked') {
                revoked.add(grant.access_value);
                const pkg = db.prepare('SELECT title FROM tryout_packages WHERE tryout_id = ?').get(grant.access_value);
                if (pkg) revoked.add(pkg.title);
            } else {
                nonRevokedGrants.push(grant);
            }
        }
        payments.forEach((payment) => {
            if (!revoked.has(payment.product_details) && !revoked.has(payment.tryout_id)) {
                addActiveProduct(payment.product_details);
                if (payment.tryout_id && !revoked.has(payment.tryout_id)) {
                    addActiveProduct(payment.tryout_id);
                }
            }
        });
        for (const grant of nonRevokedGrants) {
            if (!revoked.has(grant.access_value)) {
                addActiveProduct(grant.access_value);
            }
        }
        res.json(activeProducts);
    } catch (err) {
        console.error('Failed to get active packages:', err);
        res.status(500).json({ error: 'Gagal mengambil data paket aktif' });
    }
});

// POST /api/payment/reconcile/webhook — HMAC-signed QRIS reconciliation.
router.post('/reconcile/webhook', (req, res) => {
    const secret = String(process.env.PAYMENT_WEBHOOK_SECRET || '').trim();
    if (!secret) return res.status(503).json({ error: 'Webhook rekonsiliasi belum aktif.' });

    const signature = req.get('x-payment-signature') || req.body.signature;
    const timestamp = req.get('x-payment-timestamp') || req.body.timestamp;
    const body = {
        merchantOrderId: req.body.merchantOrderId,
        fullAmount: req.body.fullAmount,
        timestamp,
    };
    if (!verifyWebhookSignature(secret, body, signature)) {
        return res.status(401).json({ error: 'Signature webhook tidak valid.' });
    }

    const db = req.app.locals.db;
    const merchantOrderId = String(req.body.merchantOrderId || '').trim();
    const fullAmount = Number(req.body.fullAmount);
    const eventId = req.get('x-payment-event-id') || req.body.eventId || '';
    const eventHash = computeWebhookEventHash({
        provider: 'qris-webhook',
        eventId,
        timestamp,
        merchantOrderId,
        amount: fullAmount,
    });

    const dedup = checkAndRecordWebhookEvent(db, {
        provider: 'qris-webhook',
        eventId,
        eventHash,
        merchantOrderId,
    });
    if (dedup.alreadyProcessed) {
        return res.json({ ok: true, alreadyProcessed: true, idempotent: true });
    }

    try {
        const result = markPaymentPaid(db, {
            merchantOrderId,
            fullAmount,
            source: String(req.body.source || 'webhook').slice(0, 40),
            rawDetails: {
                ip: req.ip,
                userAgent: req.get('user-agent') || '',
                receivedAt: new Date().toISOString(),
            },
        });
        res.json({ ok: true, ...result });
    } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
    }
});

// GET /api/payment/mock-gateway — Simulator Pembayaran Sandbox Lokal
router.get('/mock-gateway', (req, res) => {
    if (!isMockPaymentEnabled()) {
        return res.status(404).send('Mock payment tidak aktif');
    }

    const db = req.app.locals.db;
    const merchantOrderId = String(req.query.merchantOrderId || '').trim();
    const token = String(req.query.token || '').trim();
    const payment = db.prepare('SELECT merchant_order_id, amount, product_details FROM payments WHERE merchant_order_id = ?').get(merchantOrderId);

    if (!payment) {
        return res.status(404).send('Pembayaran tidak ditemukan');
    }
    if (!verifyMockPaymentToken({ merchantOrderId: payment.merchant_order_id, amount: payment.amount, token })) {
        return res.status(403).send('Token simulator tidak valid');
    }

    const safeOrderId = escapeHtml(payment.merchant_order_id);
    const safeProduct = escapeHtml(payment.product_details);
    const safeAmount = Number(payment.amount || 0).toLocaleString('id-ID');
    const successUrl = `/api/payment/mock-complete?merchantOrderId=${encodeQuery(payment.merchant_order_id)}&status=success&token=${encodeQuery(token)}`;
    const failedUrl = `/api/payment/mock-complete?merchantOrderId=${encodeQuery(payment.merchant_order_id)}&status=failed&token=${encodeQuery(token)}`;
    const pendingUrl = `/api/payment/mock-complete?merchantOrderId=${encodeQuery(payment.merchant_order_id)}&status=pending&token=${encodeQuery(token)}`;

    res.send(`
        <!doctype html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>MAFIKING Sandbox Payment Gateway</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    ink: '#0b1326',
                    paper: '#FBF8F1',
                    yel: '#FFF44F',
                  },
                  fontFamily: {
                    sans: ['Manrope', 'sans-serif'],
                    display: ['Space Grotesk', 'sans-serif'],
                  }
                }
              }
            };
          </script>
          <style>
            body { background-color: #FBF8F1; color: #0b1326; font-family: 'Manrope', sans-serif; }
            .premium-card {
              background: white;
              border: 1px solid rgba(11, 19, 38, 0.1);
              border-radius: 24px;
              box-shadow: 0 10px 30px -10px rgba(11,19,38,0.05);
            }
          </style>
        </head>
        <body class="min-h-screen flex items-center justify-center p-6">
          <div class="max-w-md w-full premium-card p-8">
            <div class="text-center mb-6">
              <span class="inline-block px-3 py-1 bg-yel/30 border border-yel/60 rounded-full text-xs font-bold tracking-wider uppercase text-ink/80 mb-2">
                Sandbox Simulator
              </span>
              <h1 class="font-display font-bold text-2xl tracking-tight text-ink">MAFIKING Pay</h1>
              <p class="text-xs text-ink/40 mt-1">Order ID: ${safeOrderId}</p>
            </div>

            <div class="border-t border-b border-ink/10 py-4 my-6">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm text-ink/50 font-semibold">Produk</span>
                <span class="text-sm font-bold text-ink max-w-[200px] truncate text-right" title="${safeProduct}">${safeProduct}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-ink/50 font-semibold">Total Tagihan</span>
                <span class="font-display font-bold text-xl text-ink">Rp ${safeAmount}</span>
              </div>
            </div>

            <div class="space-y-3">
              <a href="${successUrl}"
                 class="w-full py-3 bg-ink hover:bg-ink/90 text-white rounded-xl font-bold text-sm transition-all shadow-md block text-center">
                Simulasi Bayar Sukses (QRIS/Transfer)
              </a>

              <a href="${failedUrl}"
                 class="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold text-sm transition-all block text-center border border-red-200">
                Simulasi Pembayaran Gagal
              </a>

              <a href="${pendingUrl}"
                 class="w-full py-3 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-xl font-bold text-sm transition-all block text-center border border-yellow-200">
                Kembali ke Aplikasi (Biarkan Pending)
              </a>
            </div>

            <p class="text-center text-[10px] text-ink/40 mt-6 leading-relaxed">
              Halaman ini adalah simulator pembayaran sandbox lokal. Klik salah satu tombol di atas untuk mensimulasikan respon dari payment gateway.
            </p>
          </div>
        </body>
        </html>
    `);
});

// GET /api/payment/mock-complete — Update status pembayaran & kembali
router.get('/mock-complete', (req, res) => {
    if (!isMockPaymentEnabled()) {
        return res.status(404).send('Mock payment tidak aktif');
    }

    const db = req.app.locals.db;
    const merchantOrderId = String(req.query.merchantOrderId || '').trim();
    const status = String(req.query.status || '').trim();
    const token = String(req.query.token || '').trim();
    const payment = db.prepare('SELECT merchant_order_id, amount FROM payments WHERE merchant_order_id = ?').get(merchantOrderId);

    if (!payment) {
        return res.status(404).send('Pembayaran tidak ditemukan');
    }
    if (!verifyMockPaymentToken({ merchantOrderId: payment.merchant_order_id, amount: payment.amount, token })) {
        return res.status(403).send('Token simulator tidak valid');
    }

    let dbStatus = 'PENDING';
    if (status === 'success') dbStatus = 'SUCCESS';
    else if (status === 'failed') dbStatus = 'FAILED';

    try {
        if (dbStatus === 'SUCCESS') {
            markPaymentPaid(db, {
                merchantOrderId,
                fullAmount: payment.amount,
                source: 'mock',
                rawDetails: { status },
            });
        } else if (dbStatus === 'FAILED') {
            markPaymentFailed(db, {
                merchantOrderId,
                source: 'mock',
                reason: status,
            });
        }
    } catch (error) {
        console.error('[Mock Payment Simulator] reconcile failed:', error);
        return res.status(error.statusCode || 400).send(error.message);
    }

    console.log(`[Mock Payment Simulator] ${merchantOrderId} updated to ${dbStatus}`);

    res.redirect(`/?merchantOrderId=${encodeQuery(merchantOrderId)}`);
});

// POST /api/payment/toggle-package-access — toggle grant/revoke user access grant (dev utility)
router.post('/toggle-package-access', (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Belum login' });

    const { tryout_id } = req.body;
    if (!tryout_id) return res.status(400).json({ error: 'tryout_id required' });

    try {
        const existingGrant = db.prepare(
            "SELECT id FROM user_access_grants WHERE user_id = ? AND access_value = ? AND access_type != 'revoked'"
        ).get(userId, String(tryout_id));

        const existingRevoked = db.prepare(
            "SELECT id FROM user_access_grants WHERE user_id = ? AND access_value = ? AND access_type = 'revoked'"
        ).get(userId, String(tryout_id));

        const hasPayment = !!db.prepare(
            "SELECT id FROM payments WHERE user_id = ? AND status = 'SUCCESS' AND product_details = (SELECT title FROM tryout_packages WHERE tryout_id = ?)"
        ).get(userId, String(tryout_id));

        if (existingGrant) {
            db.prepare("DELETE FROM user_access_grants WHERE id = ?").run(existingGrant.id);
        }

        if (existingRevoked) {
            db.prepare("DELETE FROM user_access_grants WHERE id = ?").run(existingRevoked.id);
            if (!hasPayment) {
                db.prepare(
                    "INSERT INTO user_access_grants (user_id, access_type, access_value) VALUES (?, 'tryout', ?)"
                ).run(userId, String(tryout_id));
            }
            return res.json({ granted: true });
        }

        if (existingGrant || hasPayment) {
            if (hasPayment) {
                db.prepare(
                    "INSERT INTO user_access_grants (user_id, access_type, access_value) VALUES (?, 'revoked', ?)"
                ).run(userId, String(tryout_id));
            }
            return res.json({ granted: false });
        }

        db.prepare(
            "INSERT INTO user_access_grants (user_id, access_type, access_value) VALUES (?, 'tryout', ?)"
        ).run(userId, String(tryout_id));

        res.json({ granted: true });
    } catch (err) {
        console.error('Failed to toggle package access:', err);
        res.status(500).json({ error: 'Gagal mengubah akses' });
    }
});

router.__test = {
    MANUAL_SUFFIX_MAX,
    MANUAL_SUFFIX_MIN,
    SUBSCRIPTION_PACKAGES,
    buildMockPaymentUrl,
    escapeHtml,
    canCreatePayment,
    isLocalGuestCheckoutEnabled,
    isRegisteredPaymentUser,
    isMockPaymentEnabled,
    findReusablePendingPayment,
    normalizePaymentProvider,
    parsePrice,
    qrisConfig,
    qrisReadiness,
    resolvePaymentItem,
    signWebhookPayload,
    signMockPayment,
    verifyWebhookSignature,
    verifyMockPaymentToken,
    paymentGatewayState,
};

// POST /api/payment/reconcile/mutation-batch — Internal collector signed ingestion.
router.post('/reconcile/mutation-batch', collectorIpAllowlist, (req, res) => {
    const collectorSecret = String(process.env.COLLECTOR_HMAC_SECRET || '').trim();
    if (!collectorSecret) {
        return res.status(503).json({ error: 'Collector ingestion endpoint belum aktif.' });
    }

    const signature = req.get('x-collector-signature') || '';
    const timestamp = req.get('x-collector-timestamp') || '';
    const keyId = req.get('x-collector-key-id') || '';
    const nonce = req.get('x-collector-nonce') || '';

    if (!signature || !timestamp || !nonce) {
        return res.status(401).json({ error: 'Missing collector headers' });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const skew = Number(process.env.COLLECTOR_ALLOWED_CLOCK_SKEW_SEC || 300);
    if (Math.abs(nowSeconds - Number(timestamp)) > skew) {
        return res.status(401).json({ error: 'Timestamp out of range' });
    }

    const rawBody = JSON.stringify(req.body);
    const expected = crypto
        .createHmac('sha256', collectorSecret)
        .update(`${keyId}:${nonce}:${timestamp}:${rawBody}`)
        .digest('hex');
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signature);
    if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
        return res.status(401).json({ error: 'Signature tidak valid' });
    }

    const nonceHash = computeWebhookEventHash({
        provider: 'collector-batch',
        eventId: nonce,
        timestamp,
        merchantOrderId: '',
        amount: '',
    });
    const dedup = checkAndRecordWebhookEvent(req.app.locals.db, {
        provider: 'collector-batch',
        eventId: nonce,
        eventHash: nonceHash,
        merchantOrderId: '',
    });
    if (dedup.alreadyProcessed) {
        return res.json({ ok: true, alreadyProcessed: true, idempotent: true });
    }

    const mutations = req.body.mutations || [];
    if (!Array.isArray(mutations) || mutations.length === 0) {
        return res.status(400).json({ error: 'mutations array diperlukan' });
    }

    const { ingestBatch } = require('../lib/mutation-ingester');
    const pepper = String(process.env.HASH_PEPPER || '');
    const results = ingestBatch(req.app.locals.db, mutations, pepper);

    const { processNewMutations } = require('../lib/mutation-matcher');
    const matchResult = processNewMutations(req.app.locals.db, mutations, pepper);

    res.json({
        ok: true,
        ingested: results.filter(r => r.inserted).length,
        duplicates: results.filter(r => !r.inserted).length,
        matched: matchResult.matched,
        errors: matchResult.errors,
    });
});

module.exports = router;
