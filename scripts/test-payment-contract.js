const assert = require('assert');
const crypto = require('crypto');
const paymentRouter = require('../routes/payment');

const {
    buildDuitkuInvoicePayload,
    buildMockPaymentUrl,
    createDuitkuSignature,
    escapeHtml,
    isMockPaymentEnabled,
    normalizePaymentProvider,
    paymentGatewayState,
    isRegisteredPaymentUser,
    qrisConfig,
    qrisReadiness,
    resolvePaymentItem,
    signWebhookPayload,
    signMockPayment,
    SUBSCRIPTION_PACKAGES,
    verifyCallbackSignature,
    verifyWebhookSignature,
    verifyMockPaymentToken,
} = paymentRouter.__test || {};

assert.strictEqual(typeof resolvePaymentItem, 'function', 'resolvePaymentItem must be exported for contract tests');
assert.strictEqual(typeof isRegisteredPaymentUser, 'function', 'isRegisteredPaymentUser must be exported for contract tests');
assert.strictEqual(typeof isMockPaymentEnabled, 'function', 'isMockPaymentEnabled must be exported for contract tests');
assert.strictEqual(typeof verifyMockPaymentToken, 'function', 'verifyMockPaymentToken must be exported for contract tests');
assert.strictEqual(typeof paymentGatewayState, 'function', 'paymentGatewayState must be exported for contract tests');
assert.strictEqual(typeof createDuitkuSignature, 'function', 'createDuitkuSignature must be exported for contract tests');
assert.strictEqual(typeof verifyCallbackSignature, 'function', 'verifyCallbackSignature must be exported for contract tests');
assert.strictEqual(typeof buildDuitkuInvoicePayload, 'function', 'buildDuitkuInvoicePayload must be exported for contract tests');
assert.strictEqual(typeof normalizePaymentProvider, 'function', 'normalizePaymentProvider must be exported for contract tests');
assert.strictEqual(typeof qrisConfig, 'function', 'qrisConfig must be exported for contract tests');
assert.strictEqual(typeof qrisReadiness, 'function', 'qrisReadiness must be exported for contract tests');
assert.strictEqual(typeof verifyWebhookSignature, 'function', 'verifyWebhookSignature must be exported for contract tests');

const userDb = {
    prepare(sql) {
        assert.match(sql, /FROM users/);
        return {
            get(id) {
                if (id === 1) return { password_hash: 'none' };
                if (id === 2) return { password_hash: '$2b$10$realHash' };
                return null;
            },
        };
    },
};

assert.strictEqual(isRegisteredPaymentUser({ db: userDb, userId: 1 }), false);
assert.strictEqual(isRegisteredPaymentUser({ db: userDb, userId: 2 }), true);
assert.strictEqual(isRegisteredPaymentUser({ db: userDb, userId: 3 }), false);

const subscription = resolvePaymentItem({
    body: {
        packageId: 'bulanan',
        amount: 1,
        productDetails: 'Tampered Client Price',
    },
});

assert.deepStrictEqual(subscription, {
    type: 'subscription',
    itemId: 'bulanan',
    amount: SUBSCRIPTION_PACKAGES.bulanan.price,
    productDetails: SUBSCRIPTION_PACKAGES.bulanan.label,
});

assert.throws(
    () => resolvePaymentItem({ body: { packageId: 'unknown' } }),
    /Paket langganan tidak valid/
);

const tryoutDb = {
    prepare(sql) {
        assert.match(sql, /FROM tryout_packages/);
        return {
            get(id) {
                assert.strictEqual(id, 7);
                return {
                    id: 7,
                    title: 'Tryout UAS Fisika',
                    price: 'Rp 49.000',
                };
            },
        };
    },
};

assert.deepStrictEqual(
    resolvePaymentItem({
        body: {
            purchaseType: 'tryout',
            tryoutPackageId: 7,
            amount: 1,
            productDetails: 'Tampered Tryout',
        },
        db: tryoutDb,
    }),
    {
        type: 'tryout',
        itemId: 7,
        amount: 49000,
        productDetails: 'Tryout UAS Fisika',
    }
);

const lockedTryoutDb = {
    prepare(sql) {
        if (/FROM app_settings/.test(sql)) {
            return { get: () => ({ value: '0' }) };
        }
        if (/FROM tryout_packages/.test(sql)) {
            return {
                get() {
                    throw new Error('locked package purchase should stop before reading package data');
                },
            };
        }
        throw new Error('Unexpected SQL: ' + sql);
    },
};

assert.throws(
    () => resolvePaymentItem({
        body: { purchaseType: 'tryout', tryoutPackageId: 7 },
        db: lockedTryoutDb,
        enforceTryoutPackagesEnabled: true,
    }),
    /Paket Try Out sedang dikunci admin/
);

assert.throws(
    () => resolvePaymentItem({ body: { purchaseType: 'tryout', tryoutPackageId: 8 }, db: { prepare: () => ({ get: () => null }) } }),
    /Paket tryout tidak ditemukan/
);

assert.throws(
    () => resolvePaymentItem({ body: { purchaseType: 'tryout', tryoutPackageId: 9 }, db: { prepare: () => ({ get: () => ({ id: 9, title: 'Gratis', price: 'Gratis' }) }) } }),
    /Paket gratis tidak perlu pembayaran/
);

const duitkuSecret = 'sandbox-api-key';
const createStringToSign = 'DXXXX1773728479616';
const expectedCreateSignature = crypto.createHmac('sha256', duitkuSecret).update(createStringToSign).digest('hex');
assert.strictEqual(createDuitkuSignature(createStringToSign, duitkuSecret), expectedCreateSignature);

const callbackStringToSign = 'DXXXX150000abcde12345';
const callbackSignature = crypto.createHmac('sha256', duitkuSecret).update(callbackStringToSign).digest('hex');
assert.strictEqual(verifyCallbackSignature('DXXXX', '150000', 'abcde12345', duitkuSecret, callbackSignature), true);
assert.strictEqual(verifyCallbackSignature('DXXXX', '150001', 'abcde12345', duitkuSecret, callbackSignature), false);

assert.deepStrictEqual(
    buildDuitkuInvoicePayload({
        merchantCode: 'DXXXX',
        item: {
            type: 'tryout',
            amount: 49000,
            productDetails: 'Tryout UAS Fisika',
        },
        merchantOrderId: 'MFK-2-123',
        buyerEmail: 'student@example.com',
        buyerName: 'Student ITB',
        userId: 2,
        paymentMethod: '',
        callbackUrl: 'https://mafiking.com/api/payment/callback',
        returnUrl: 'https://mafiking.com/payment.html',
        expiryPeriod: 60,
    }),
    {
        merchantCode: 'DXXXX',
        paymentAmount: 49000,
        paymentMethod: '',
        merchantOrderId: 'MFK-2-123',
        productDetails: 'Tryout UAS Fisika',
        additionalParam: 'tryout',
        merchantUserInfo: 'student@example.com',
        email: 'student@example.com',
        customerVaName: 'Student ITB',
        itemDetails: [
            {
                name: 'Tryout UAS Fisika',
                price: 49000,
                quantity: 1,
            },
        ],
        customerDetail: {
            firstName: 'Student ITB',
            lastName: '',
            email: 'student@example.com',
            merchantCustomerId: '2',
        },
        callbackUrl: 'https://mafiking.com/api/payment/callback',
        returnUrl: 'https://mafiking.com/payment.html',
        expiryPeriod: 60,
    }
);

assert.strictEqual(isMockPaymentEnabled({ NODE_ENV: 'production' }), false);
assert.strictEqual(isMockPaymentEnabled({ NODE_ENV: 'production', PAYMENT_MOCK_MODE: 'true' }), false);
assert.strictEqual(isMockPaymentEnabled({ NODE_ENV: 'production', PAYMENT_MOCK_MODE: 'true', PAYMENT_ALLOW_MOCK_IN_PRODUCTION: 'true' }), true);
assert.strictEqual(isMockPaymentEnabled({ NODE_ENV: 'development', PAYMENT_MOCK_MODE: 'false' }), false);
assert.strictEqual(isMockPaymentEnabled({ NODE_ENV: 'development', PAYMENT_PROVIDER: 'qris' }), false);
assert.strictEqual(isMockPaymentEnabled({ NODE_ENV: 'development', PAYMENT_PROVIDER: 'duitku' }), true);
assert.strictEqual(normalizePaymentProvider({ PAYMENT_PROVIDER: 'duitku' }), 'duitku');
assert.strictEqual(normalizePaymentProvider({ PAYMENT_PROVIDER: 'bad-value' }), 'qris');

const mockOrder = { merchantOrderId: 'MFK-2-123456', amount: 99000 };
const token = signMockPayment(mockOrder);
assert.strictEqual(verifyMockPaymentToken({ ...mockOrder, token }), true);
assert.strictEqual(verifyMockPaymentToken({ ...mockOrder, amount: 1, token }), false);
assert.match(buildMockPaymentUrl(mockOrder), /^\/api\/payment\/mock-gateway\?merchantOrderId=MFK-2-123456&token=[a-f0-9]{64}$/);
assert.strictEqual(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');

const gatewayState = paymentGatewayState({ NODE_ENV: 'production', PAYMENT_MOCK_MODE: 'false' });
assert.strictEqual(gatewayState.active, false);
assert.strictEqual(gatewayState.mockMode, false);
assert.strictEqual(gatewayState.providerReady, false);
assert.strictEqual(gatewayState.provider, 'qris');
assert.match(gatewayState.message, /QRIS_STATIC_STRING/);

const duitkuGatewayState = paymentGatewayState({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'duitku', PAYMENT_MOCK_MODE: 'false' });
assert.strictEqual(duitkuGatewayState.active, false);
assert.strictEqual(duitkuGatewayState.provider, 'duitku');
assert.match(duitkuGatewayState.message, /aktivasi/);

const webhookSecret = 'payment-webhook-secret';
const signedWebhook = signWebhookPayload(webhookSecret, {
    merchantOrderId: 'MFK-2-123456',
    fullAmount: 99012,
    timestamp: Math.floor(Date.now() / 1000),
});
assert.strictEqual(verifyWebhookSignature(webhookSecret, {
    merchantOrderId: 'MFK-2-123456',
    fullAmount: 99012,
    timestamp: signedWebhook.timestamp,
}, signedWebhook.signature), true);
assert.strictEqual(verifyWebhookSignature(webhookSecret, {
    merchantOrderId: 'MFK-2-123456',
    fullAmount: 1,
    timestamp: signedWebhook.timestamp,
}, signedWebhook.signature), false);

console.log('Payment contract tests passed');
