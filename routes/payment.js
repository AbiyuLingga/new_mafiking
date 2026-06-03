const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { isRegisteredUser } = require('../middleware/auth');
const { setPublicApiCache } = require('../lib/performance');
const router = express.Router();

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  message: { error: 'Terlalu banyak percobaan pembayaran. Coba lagi sebentar.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const DUITKU_BASE_URL = 'https://api-sandbox.duitku.com/api'; // ganti ke https://api-prod.duitku.com/api saat production
const MERCHANT_CODE = process.env.DUITKU_MERCHANT_CODE;
const API_KEY = process.env.DUITKU_API_KEY;
const CALLBACK_URL = process.env.DUITKU_CALLBACK_URL || 'https://mafiking.com/api/payment/callback';
const RETURN_URL = process.env.DUITKU_RETURN_URL || 'https://mafiking.com/payment.html';

const SUBSCRIPTION_PACKAGES = {
    trial: { label: 'Trial 7 Hari', price: 29000 },
    bulanan: { label: 'Bulanan', price: 99000 },
    semester: { label: 'Semester', price: 249000 },
};

function makePOPHeaders() {
    const timestamp = Date.now().toString();
    const signature = crypto.createHash('sha256').update(MERCHANT_CODE + timestamp + API_KEY).digest('hex');
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-duitku-signature': signature,
        'x-duitku-timestamp': timestamp,
        'x-duitku-merchantcode': MERCHANT_CODE,
    };
}

// Signature untuk callback verification (MD5)
function verifyCallbackSignature(merchantCode, amount, merchantOrderId, apiKey, received) {
    const expected = crypto.createHash('md5').update(merchantCode + amount + merchantOrderId + apiKey).digest('hex');
    return expected === received;
}

function hasDuitkuCredentials(env = process.env) {
    const merchantCode = env.DUITKU_MERCHANT_CODE;
    const apiKey = env.DUITKU_API_KEY;
    return Boolean(
        merchantCode &&
        apiKey &&
        merchantCode !== 'mock' &&
        merchantCode !== 'YOUR_DUITKU_MERCHANT_CODE'
    );
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
    return env.NODE_ENV !== 'production' && !hasDuitkuCredentials(env);
}

function mockTokenSecret() {
    return process.env.PAYMENT_MOCK_SECRET || process.env.SESSION_SECRET || API_KEY || 'new-mafiking-local-payment-mock';
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

function resolvePaymentItem({ body, db }) {
    const purchaseType = body.purchaseType || (body.tryoutPackageId ? 'tryout' : 'subscription');

    if (purchaseType === 'tryout') {
        const tryoutPackageId = Number(body.tryoutPackageId);
        if (!Number.isInteger(tryoutPackageId) || tryoutPackageId <= 0) {
            throw paymentError('Paket tryout tidak valid');
        }

        if (!db) throw paymentError('Database tidak tersedia', 500);
        const pkg = db.prepare('SELECT id, title, price FROM tryout_packages WHERE id = ?').get(tryoutPackageId);
        if (!pkg) throw paymentError('Paket tryout tidak ditemukan', 404);

        const amount = parsePrice(pkg.price);
        if (amount < 1000) throw paymentError('Paket gratis tidak perlu pembayaran');

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

function paymentStatusPayload(payment, status) {
    return {
        status,
        merchantOrderId: payment.merchant_order_id,
        amount: payment.amount,
        productDetails: payment.product_details,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
    };
}

function paymentGatewayState(env = process.env) {
    const mockMode = isMockPaymentEnabled(env);
    const providerReady = hasDuitkuCredentials(env);
    const active = providerReady || mockMode;
    return {
        active,
        mockMode,
        provider: 'duitku',
        providerReady,
        message: active
            ? 'Payment gateway siap digunakan.'
            : 'Payment gateway sedang dalam proses aktivasi. Pembelian akan dibuka setelah akses payment provider aktif.',
    };
}

// GET /api/payment/config
router.get('/config', (_req, res) => {
    setPublicApiCache(res, 30, 120);
    res.json(paymentGatewayState());
});

// POST /api/payment/create
router.post('/create', paymentLimiter, async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    if (!isRegisteredPaymentUser({ db, userId })) {
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
        item = resolvePaymentItem({ body: req.body, db });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ error: err.message });
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

        return res.json({
            merchantOrderId,
            reference: 'MOCK-REF-' + merchantOrderId,
            paymentUrl: mockPaymentUrl,
            qrString: 'MOCK-QR-' + merchantOrderId,
            amount: intAmount,
            productDetails,
        });
    }

    if (!hasDuitkuCredentials()) {
        return res.status(503).json({
            error: 'Payment gateway sedang dalam proses aktivasi. Pembelian akan dibuka setelah akses Midtrans/payment provider aktif.',
        });
    }

    const payload = {
        merchantCode: MERCHANT_CODE,
        paymentAmount: intAmount,
        paymentMethod: 'QRIS',
        merchantOrderId,
        productDetails,
        email: buyerEmail,
        customerVaName: buyerName,
        callbackUrl: CALLBACK_URL,
        returnUrl: RETURN_URL,
        expiryPeriod: 60,
    };

    try {
        const { data } = await axios.post(`${DUITKU_BASE_URL}/merchant/createInvoice`, payload, {
            headers: makePOPHeaders(),
            timeout: 15000,
        });

        if (data.statusCode !== '00') {
            console.error('Duitku create error:', data);
            return res.status(502).json({ error: data.statusMessage || 'Gagal membuat pembayaran' });
        }

        db.prepare(`
            INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, reference, payment_url, qr_string, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `).run(userId, merchantOrderId, intAmount, productDetails, buyerEmail, data.reference, data.paymentUrl, data.qrString || '');

        res.json({
            merchantOrderId,
            reference: data.reference,
            paymentUrl: data.paymentUrl,
            qrString: data.qrString || '',
            amount: intAmount,
            productDetails,
        });
    } catch (err) {
        console.error('Duitku request error:', err.response?.data || err.message);
        res.status(502).json({ error: 'Gagal menghubungi payment gateway' });
    }
});

// GET /api/payment/status/:merchantOrderId
router.get('/status/:merchantOrderId', async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Belum login' });

    const { merchantOrderId } = req.params;

    const payment = db.prepare('SELECT * FROM payments WHERE merchant_order_id = ? AND user_id = ?').get(merchantOrderId, userId);
    if (!payment) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });

    if (payment.status === 'SUCCESS' || payment.status === 'FAILED') {
        return res.json(paymentStatusPayload(payment, payment.status));
    }

    if (isMockPaymentEnabled()) {
        return res.json({ ...paymentStatusPayload(payment, payment.status), statusMessage: 'Mock status checked' });
    }

    if (!hasDuitkuCredentials()) {
        return res.status(503).json({
            error: 'Payment gateway sedang dalam proses aktivasi. Status pembayaran belum dapat disinkronkan.',
        });
    }

    const timestamp = Date.now().toString();
    const signature = crypto.createHash('sha256').update(MERCHANT_CODE + timestamp + API_KEY).digest('hex');

    try {
        const { data } = await axios.post(`${DUITKU_BASE_URL}/merchant/transactionStatus`, {
            merchantCode: MERCHANT_CODE,
            merchantOrderId,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'x-duitku-signature': signature,
                'x-duitku-timestamp': timestamp,
                'x-duitku-merchantcode': MERCHANT_CODE,
            },
            timeout: 10000,
        });

        let status = 'PENDING';
        if (data.statusCode === '00') status = 'SUCCESS';
        else if (data.statusCode === '02') status = 'FAILED';

        if (status !== 'PENDING') {
            db.prepare('UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_order_id = ?')
                .run(status, merchantOrderId);
        }

        res.json({ ...paymentStatusPayload(payment, status), statusMessage: data.statusMessage });
    } catch (err) {
        console.error('Duitku status error:', err.response?.data || err.message);
        res.status(502).json({ error: 'Gagal cek status pembayaran' });
    }
});

// GET /api/payment/active-packages
router.get('/active-packages', async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    if (!userId) return res.json([]);

    try {
        const payments = db.prepare(`
            SELECT product_details FROM payments
            WHERE user_id = ? AND status = 'SUCCESS'
        `).all(userId);

        const grants = db.prepare(`
            SELECT access_type, access_value
            FROM user_access_grants
            WHERE user_id = ?
        `).all(userId);

        const activeProducts = payments.map(p => p.product_details);
        for (const grant of grants) {
            const value = String(grant.access_value || '').trim();
            if (value) activeProducts.push(value);
        }
        res.json(activeProducts);
    } catch (err) {
        console.error('Failed to get active packages:', err);
        res.status(500).json({ error: 'Gagal mengambil data paket aktif' });
    }
});

// POST /api/payment/callback — dipanggil Duitku server-to-server
router.post('/callback', express.urlencoded({ extended: false }), (req, res) => {
    const db = req.app.locals.db;
    const {
        merchantCode,
        amount,
        merchantOrderId,
        resultCode,
        reference,
        signature: receivedSig,
    } = req.body;

    if (!hasDuitkuCredentials() || !verifyCallbackSignature(merchantCode, amount, merchantOrderId, API_KEY, receivedSig)) {
        console.warn('Callback signature mismatch:', { merchantOrderId });
        return res.status(400).send('Invalid signature');
    }

    let status = 'PENDING';
    if (resultCode === '00') status = 'SUCCESS';
    else if (resultCode === '02') status = 'FAILED';

    db.prepare('UPDATE payments SET status = ?, reference = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_order_id = ?')
        .run(status, reference || '', merchantOrderId);

    console.log(`[Payment Callback] ${merchantOrderId} → ${status}`);
    res.send('OK');
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
              Halaman ini adalah simulator pembayaran sandbox lokal. Klik salah satu tombol di atas untuk mensimulasikan respon dari Duitku Gateway.
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

    db.prepare('UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_order_id = ?')
        .run(dbStatus, merchantOrderId);

    console.log(`[Mock Payment Simulator] ${merchantOrderId} updated to ${dbStatus}`);

    res.redirect(`/?merchantOrderId=${encodeQuery(merchantOrderId)}`);
});

router.__test = {
    SUBSCRIPTION_PACKAGES,
    buildMockPaymentUrl,
    escapeHtml,
    hasDuitkuCredentials,
    isRegisteredPaymentUser,
    isMockPaymentEnabled,
    parsePrice,
    resolvePaymentItem,
    signMockPayment,
    verifyMockPaymentToken,
    paymentGatewayState,
};

module.exports = router;
