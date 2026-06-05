const assert = require('assert');
const crypto = require('crypto');
const paymentRouter = require('../routes/payment');

const {
    buildDuitkuInvoicePayload,
    buildMockPaymentUrl,
    createDuitkuSignature,
    escapeHtml,
    isMockPaymentEnabled,
    paymentGatewayState,
    isRegisteredPaymentUser,
    resolvePaymentItem,
    signMockPayment,
    SUBSCRIPTION_PACKAGES,
    verifyCallbackSignature,
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
assert.match(gatewayState.message, /aktivasi/);

console.log('Payment contract tests passed');
