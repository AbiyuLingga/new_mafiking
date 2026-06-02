const assert = require('assert');
const paymentRouter = require('../routes/payment');

const {
    buildMockPaymentUrl,
    escapeHtml,
    isMockPaymentEnabled,
    isRegisteredPaymentUser,
    resolvePaymentItem,
    signMockPayment,
    SUBSCRIPTION_PACKAGES,
    verifyMockPaymentToken,
} = paymentRouter.__test || {};

assert.strictEqual(typeof resolvePaymentItem, 'function', 'resolvePaymentItem must be exported for contract tests');
assert.strictEqual(typeof isRegisteredPaymentUser, 'function', 'isRegisteredPaymentUser must be exported for contract tests');
assert.strictEqual(typeof isMockPaymentEnabled, 'function', 'isMockPaymentEnabled must be exported for contract tests');
assert.strictEqual(typeof verifyMockPaymentToken, 'function', 'verifyMockPaymentToken must be exported for contract tests');

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

console.log('Payment contract tests passed');
