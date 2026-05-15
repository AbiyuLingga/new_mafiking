const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();

const DUITKU_BASE_URL = 'https://api-sandbox.duitku.com/api'; // ganti ke https://api-prod.duitku.com/api saat production
const MERCHANT_CODE = process.env.DUITKU_MERCHANT_CODE;
const API_KEY = process.env.DUITKU_API_KEY;
const CALLBACK_URL = process.env.DUITKU_CALLBACK_URL || 'https://mafiking.com/api/payment/callback';
const RETURN_URL = process.env.DUITKU_RETURN_URL || 'https://mafiking.com/payment.html';

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

// POST /api/payment/create
router.post('/create', async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Belum login' });

    const { amount, productDetails, email, name } = req.body;

    if (!amount || isNaN(amount) || Number(amount) < 1000) {
        return res.status(400).json({ error: 'Jumlah pembayaran minimal Rp 1.000' });
    }
    if (!productDetails || !email || !name) {
        return res.status(400).json({ error: 'productDetails, email, dan name diperlukan' });
    }

    const merchantOrderId = `MFK-${userId}-${Date.now()}`;
    const intAmount = Math.round(Number(amount));

    const payload = {
        merchantCode: MERCHANT_CODE,
        paymentAmount: intAmount,
        paymentMethod: 'QRIS',
        merchantOrderId,
        productDetails: String(productDetails).substring(0, 255),
        email,
        customerVaName: String(name).substring(0, 50),
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
        `).run(userId, merchantOrderId, intAmount, productDetails, email, data.reference, data.paymentUrl, data.qrString || '');

        res.json({
            merchantOrderId,
            reference: data.reference,
            paymentUrl: data.paymentUrl,
            qrString: data.qrString || '',
            amount: intAmount,
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
        return res.json({ status: payment.status, merchantOrderId });
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

        res.json({ status, merchantOrderId, statusMessage: data.statusMessage });
    } catch (err) {
        console.error('Duitku status error:', err.response?.data || err.message);
        res.status(502).json({ error: 'Gagal cek status pembayaran' });
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

    if (!verifyCallbackSignature(merchantCode, amount, merchantOrderId, API_KEY, receivedSig)) {
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

module.exports = router;
