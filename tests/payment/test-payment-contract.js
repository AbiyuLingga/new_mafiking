const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const paymentRouter = require('../../server/routes/payment');
const {
    normalizePackageAccessFeatures,
    packageAccessGrantSpecs,
} = require('../../server/learning/package-entitlements');

const {
    buildMockPaymentUrl,
    canCreatePayment,
    ensurePhoneForPayment,
    escapeHtml,
    findReusablePendingPayment,
    MANUAL_SUFFIX_MAX,
    MANUAL_SUFFIX_MIN,
    isMockPaymentEnabled,
    isLocalGuestCheckoutEnabled,
    normalizePaymentProvider,
    paymentGatewayState,
    isRegisteredPaymentUser,
    qrisConfig,
    qrisReadiness,
    resolvePaymentItem,
    signWebhookPayload,
    signMockPayment,
    SUBSCRIPTION_PACKAGES,
    verifyWebhookSignature,
    verifyMockPaymentToken,
} = paymentRouter.__test || {};

assert.strictEqual(MANUAL_SUFFIX_MIN, 1, 'manual payment unique code must start at 1');
assert.strictEqual(MANUAL_SUFFIX_MAX, 399, 'manual payment unique code must stop at 399');
assert.strictEqual(typeof resolvePaymentItem, 'function', 'resolvePaymentItem must be exported for contract tests');
assert.strictEqual(typeof isRegisteredPaymentUser, 'function', 'isRegisteredPaymentUser must be exported for contract tests');
assert.strictEqual(typeof canCreatePayment, 'function', 'canCreatePayment must be exported for contract tests');
assert.strictEqual(typeof ensurePhoneForPayment, 'function', 'ensurePhoneForPayment must be exported for contract tests');
assert.strictEqual(typeof findReusablePendingPayment, 'function', 'findReusablePendingPayment must be exported for contract tests');
assert.strictEqual(typeof isLocalGuestCheckoutEnabled, 'function', 'isLocalGuestCheckoutEnabled must be exported for contract tests');
assert.strictEqual(typeof isMockPaymentEnabled, 'function', 'isMockPaymentEnabled must be exported for contract tests');
assert.strictEqual(typeof verifyMockPaymentToken, 'function', 'verifyMockPaymentToken must be exported for contract tests');
assert.strictEqual(typeof paymentGatewayState, 'function', 'paymentGatewayState must be exported for contract tests');
assert.strictEqual(typeof normalizePaymentProvider, 'function', 'normalizePaymentProvider must be exported for contract tests');
assert.strictEqual(typeof qrisConfig, 'function', 'qrisConfig must be exported for contract tests');
assert.strictEqual(typeof qrisReadiness, 'function', 'qrisReadiness must be exported for contract tests');
assert.strictEqual(typeof verifyWebhookSignature, 'function', 'verifyWebhookSignature must be exported for contract tests');

assert.deepStrictEqual(
    normalizePackageAccessFeatures(''),
    ['tryout-access', 'daily-missions', 'special-practice'],
    'missing package entitlement config should preserve legacy full access'
);
assert.deepStrictEqual(
    normalizePackageAccessFeatures('[]'),
    [],
    'explicit empty package entitlement config should stay empty'
);
assert.deepStrictEqual(
    packageAccessGrantSpecs({
        title: 'Paket A',
        tryout_id: 'tryout-a',
        access_features: '["tryout-access","daily-missions","special-practice"]',
    }),
    [
        { featureId: 'tryout-access', accessType: 'tryout', accessValue: 'tryout-a' },
        { featureId: 'daily-missions', accessType: 'mission', accessValue: 'daily-missions' },
        { featureId: 'special-practice', accessType: 'practice', accessValue: 'special-practice' },
    ],
    'package entitlements must map to durable access grants'
);
assert.deepStrictEqual(
    packageAccessGrantSpecs({
        title: 'Paket Bimbel',
        tryout_id: 'paket-bimbel',
        access_features: '["tryout-access","bimbel"]',
    }),
    [
        { featureId: 'tryout-access', accessType: 'tryout', accessValue: 'paket-bimbel' },
        { featureId: 'bimbel', accessType: 'service', accessValue: 'bimbel' },
    ],
    'bimbel package entitlement must be selectable without becoming a legacy default'
);

const userDb = {
    prepare(sql) {
        assert.match(sql, /FROM users/);
        return {
            get(id) {
                if (id === 1) return { password_hash: 'none', clerk_id: null, auth_provider: 'local' };
                if (id === 2) return { password_hash: '$2b$10$realHash', clerk_id: null, auth_provider: 'local' };
                if (id === 4) return { password_hash: 'clerk', clerk_id: 'user_clerk_123', auth_provider: 'clerk' };
                return null;
            },
        };
    },
};

assert.strictEqual(isRegisteredPaymentUser({ db: userDb, userId: 1 }), false);
assert.strictEqual(isRegisteredPaymentUser({ db: userDb, userId: 2 }), true);
assert.strictEqual(isRegisteredPaymentUser({ db: userDb, userId: 3 }), false);
assert.strictEqual(isRegisteredPaymentUser({ db: userDb, userId: 4 }), true);
assert.strictEqual(isLocalGuestCheckoutEnabled({ NODE_ENV: 'development', PAYMENT_PROVIDER: 'qris' }), false);
assert.strictEqual(isLocalGuestCheckoutEnabled({ NODE_ENV: 'development', PAYMENT_PROVIDER: 'qris', PAYMENT_LOCAL_GUEST_CHECKOUT: 'true' }), true);
assert.strictEqual(isLocalGuestCheckoutEnabled({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'qris' }), false);
assert.strictEqual(isLocalGuestCheckoutEnabled({ NODE_ENV: 'development', PAYMENT_PROVIDER: 'qris', PAYMENT_LOCAL_GUEST_CHECKOUT: 'false' }), false);
assert.strictEqual(canCreatePayment({ db: userDb, userId: 1, env: { NODE_ENV: 'development', PAYMENT_PROVIDER: 'qris' } }), false);
assert.strictEqual(canCreatePayment({ db: userDb, userId: 1, env: { NODE_ENV: 'development', PAYMENT_PROVIDER: 'qris', PAYMENT_LOCAL_GUEST_CHECKOUT: 'true' } }), true);
assert.strictEqual(canCreatePayment({ db: userDb, userId: 1, env: { NODE_ENV: 'production', PAYMENT_PROVIDER: 'qris' } }), false);
assert.strictEqual(canCreatePayment({ db: userDb, userId: 2, env: { NODE_ENV: 'production', PAYMENT_PROVIDER: 'qris' } }), true);
assert.strictEqual(canCreatePayment({ db: userDb, userId: 4, env: { NODE_ENV: 'production', PAYMENT_PROVIDER: 'qris' } }), true);
assert.strictEqual(canCreatePayment({ db: userDb, userId: 0, env: { NODE_ENV: 'development', PAYMENT_PROVIDER: 'qris' } }), false);

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
    accessFeatures: [],
    requiresPhone: false,
});

const testSubscription = resolvePaymentItem({
    body: {
        packageId: 'cek-payment',
        amount: 999999,
        productDetails: 'Tampered Test Price',
    },
});

assert.deepStrictEqual(testSubscription, {
    type: 'subscription',
    itemId: 'cek-payment',
    amount: 500,
    productDetails: 'Cek Payment',
    accessFeatures: [],
    requiresPhone: false,
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
                    access_features: '["tryout-access"]',
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
        accessFeatures: ['tryout-access'],
        requiresPhone: false,
    }
);

assert.deepStrictEqual(
    resolvePaymentItem({
        body: {
            purchaseType: 'tryout',
            tryoutPackageId: 7,
        },
        db: {
            prepare(sql) {
                assert.match(sql, /FROM tryout_packages/);
                return {
                    get() {
                        return {
                            id: 7,
                            title: 'Paket QRIS Lokal Murah',
                            price: 'Rp 501',
                            access_features: '["tryout-access","bimbel"]',
                        };
                    },
                };
            },
        },
    }),
    {
        type: 'tryout',
        itemId: 7,
        amount: 501,
        productDetails: 'Paket QRIS Lokal Murah',
        accessFeatures: ['tryout-access', 'bimbel'],
        requiresPhone: true,
    }
);

let savedPhone = null;
const phoneDb = {
    prepare(sql) {
        if (/SELECT phone_number FROM users/.test(sql)) {
            return { get: () => ({ phone_number: '' }) };
        }
        if (/UPDATE users SET phone_number/.test(sql)) {
            return { run: (phone, userId) => { savedPhone = { phone, userId }; } };
        }
        throw new Error('Unexpected phone SQL: ' + sql);
    },
};
assert.throws(
    () => ensurePhoneForPayment({
        db: phoneDb,
        userId: 2,
        item: { requiresPhone: true },
        body: {},
    }),
    /No\. WhatsApp wajib diisi/
);
ensurePhoneForPayment({
    db: phoneDb,
    userId: 2,
    item: { requiresPhone: true },
    body: { phone_number: '0812 3456 7890' },
});
assert.deepStrictEqual(savedPhone, { phone: '0812 3456 7890', userId: 2 });

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

let pendingLookupArgs = null;
const reusablePayment = {
    id: 12,
    user_id: 2,
    merchant_order_id: 'MFK-2-123456789',
    amount: 501,
    product_details: 'Paket QRIS Lokal Murah',
    email: 'student@example.com',
    reference: 'QRIS-MFK-2-123456789',
    payment_url: '',
    qr_string: 'QRIS-DYNAMIC',
    status: 'PENDING',
    qris_base_amount: 500,
    qris_suffix: 1,
    qris_full_amount: 501,
    qris_dynamic_string: 'QRIS-DYNAMIC',
    qris_image_data_url: 'data:image/png;base64,abc',
    expires_at: '2099-01-01 00:00:00',
};
const pendingDb = {
    prepare(sql) {
        assert.match(sql, /FROM payments/);
        assert.match(sql, /status = 'PENDING'/);
        assert.match(sql, /product_details = \?/);
        return {
            get(...args) {
                pendingLookupArgs = args;
                return reusablePayment;
            },
        };
    },
};
assert.strictEqual(
    findReusablePendingPayment({
        db: pendingDb,
        userId: 2,
        item: { productDetails: 'Paket QRIS Lokal Murah' },
        now: new Date('2026-06-11T00:00:00Z'),
    }),
    reusablePayment
);
assert.deepStrictEqual(pendingLookupArgs.slice(0, 2), [2, 'Paket QRIS Lokal Murah']);


const mockOrder = { merchantOrderId: 'MFK-2-123456', amount: 99000 };
const token = signMockPayment(mockOrder);
assert.strictEqual(verifyMockPaymentToken({ ...mockOrder, token }), true);
assert.strictEqual(verifyMockPaymentToken({ ...mockOrder, amount: 1, token }), false);
assert.match(buildMockPaymentUrl(mockOrder), /^\/api\/payment\/mock-gateway\?merchantOrderId=MFK-2-123456&token=[a-f0-9]{64}$/);
assert.strictEqual(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');

const serverSource = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
const ensurePaymentPackageSource = serverSource.match(
    /function ensurePaymentTestTryoutPackage\(database\) \{[\s\S]*?\n\}/
)?.[0] || '';
const existingPaymentPackageBranch = ensurePaymentPackageSource.match(
    /if \(existing\) \{[\s\S]*?return;\s*\}/
)?.[0] || '';
assert.ok(existingPaymentPackageBranch, 'Cek Payment startup existing-package branch must exist');
assert.doesNotMatch(
    existingPaymentPackageBranch,
    /\bprice\s*=/,
    'server startup must preserve admin-edited Cek Payment price'
);
const publicTryoutPackagesRouteSource = serverSource.match(
    /app\.get\('\/api\/tryout-packages'[\s\S]*?\n\}\);/
)?.[0] || '';
assert.ok(publicTryoutPackagesRouteSource, 'public tryout packages route must exist');
assert.match(
    publicTryoutPackagesRouteSource,
    /rows\.filter\(\(p\) => !p\.is_hidden\)/,
    'public tryout packages must hide only explicitly hidden packages'
);
assert.doesNotMatch(
    publicTryoutPackagesRouteSource,
    /question_count[\s\S]*return/,
    'public tryout packages must not disappear just because no tryout questions exist yet'
);
const tryoutPageSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', 'tryout.jsx'), 'utf8');
assert.match(
    tryoutPageSource,
    /if \(hasKnownEmptyTryout && hasAccess\)/,
    'empty tryout packages may block starting owned packages but must not block buying them'
);
assert.doesNotMatch(
    tryoutPageSource,
    /if \(hasKnownEmptyTryout\) \{\s*showToast/,
    'empty tryout package guard must not run before the purchase branch'
);

const gatewayState = paymentGatewayState({ NODE_ENV: 'production', PAYMENT_MOCK_MODE: 'false' });
assert.strictEqual(gatewayState.active, false);
assert.strictEqual(gatewayState.mockMode, false);
assert.strictEqual(gatewayState.providerReady, false);
assert.strictEqual(gatewayState.provider, 'qris');
assert.match(gatewayState.message, /QRIS/);

const manualGatewayState = paymentGatewayState({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'manual', PAYMENT_MOCK_MODE: 'false' });
assert.strictEqual(manualGatewayState.active, true);
assert.strictEqual(manualGatewayState.mockMode, false);
assert.strictEqual(manualGatewayState.providerReady, true);
assert.strictEqual(manualGatewayState.provider, 'manual');
assert.match(manualGatewayState.message, /manual aktif/);

const qrisGatewayState = paymentGatewayState({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'qris', PAYMENT_MOCK_MODE: 'false' });
assert.strictEqual(qrisGatewayState.active, false);
assert.strictEqual(qrisGatewayState.mockMode, false);
assert.strictEqual(qrisGatewayState.providerReady, false);
assert.strictEqual(qrisGatewayState.provider, 'qris');
assert.match(qrisGatewayState.message, /QRIS_STATIC_STRING/);

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
