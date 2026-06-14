const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { calculateCRC16 } = require('@prasetya/qris');
const { generateDynamicQRIS } = require('../../lib/qris-dynamic');
const { allocateSuffix, releaseExpiredSuffixes } = require('../../lib/qris-suffix-pool');
const { markPaymentPaid, signWebhookPayload, verifyWebhookSignature } = require('../../lib/payment-reconciler');
const { sweepExpiredPayments } = require('../../lib/payment-expiry-sweeper');

function buildStaticFixture() {
    const body = '00020101021126320014ID.CO.QRIS.WWW011012345678905204000053033605802ID5908MAFIKING6007BANDUNG6304';
    return body + calculateCRC16(body);
}

async function main() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'));
    db.prepare("INSERT INTO users (id, username, password_hash, display_name, role) VALUES (1, 'student@example.com', 'hash', 'Student', 'user')").run();

    const first = allocateSuffix({
        db,
        baseAmount: 50000,
        merchantOrderId: 'MFK-1-1',
        ttlSeconds: 1200,
        env: { QRIS_SUFFIX_MIN: '1', QRIS_SUFFIX_MAX: '3' },
        now: new Date('2026-06-07T00:00:00Z'),
    });
    const second = allocateSuffix({
        db,
        baseAmount: 50000,
        merchantOrderId: 'MFK-1-2',
        ttlSeconds: 1200,
        env: { QRIS_SUFFIX_MIN: '1', QRIS_SUFFIX_MAX: '3' },
        now: new Date('2026-06-07T00:00:00Z'),
    });
    assert.equal(first.suffix, 1);
    assert.equal(second.suffix, 2);

    const qr = await generateDynamicQRIS({
        staticString: buildStaticFixture(),
        baseAmount: 50000,
        suffix: first.suffix,
    });
    assert.equal(qr.fullAmount, 50001);

    db.prepare(`
        INSERT INTO payments (
            user_id, merchant_order_id, amount, product_details, email, reference, qr_string, status,
            qris_base_amount, qris_suffix, qris_full_amount, qris_dynamic_string, qris_image_data_url, expires_at
        ) VALUES (1, 'MFK-1-1', 50001, 'Tryout Premium: The Trinity TPB', 'student@example.com', 'QRIS-MFK-1-1', ?, 'PENDING', 50000, 1, 50001, ?, ?, '2026-06-07 00:20:00')
    `).run(qr.dynamicString, qr.dynamicString, qr.qrImageDataUrl);

    const paid = markPaymentPaid(db, {
        merchantOrderId: 'MFK-1-1',
        fullAmount: 50001,
        source: 'test',
    });
    assert.equal(paid.success, true);
    assert.equal(db.prepare("SELECT status FROM payments WHERE merchant_order_id = 'MFK-1-1'").get().status, 'SUCCESS');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_access_grants WHERE user_id = 1').get().count, 1);
    assert.equal(db.prepare("SELECT released_at IS NOT NULL AS released FROM qris_suffix_locks WHERE merchant_order_id = 'MFK-1-1'").get().released, 1);

    const secret = 'test-secret';
    const signed = signWebhookPayload(secret, { merchantOrderId: 'MFK-1-1', fullAmount: 50001, timestamp: Math.floor(Date.now() / 1000) });
    assert.equal(verifyWebhookSignature(secret, {
        merchantOrderId: 'MFK-1-1',
        fullAmount: 50001,
        timestamp: signed.timestamp,
    }, signed.signature), true);
    assert.equal(verifyWebhookSignature(secret, {
        merchantOrderId: 'MFK-1-1',
        fullAmount: 1,
        timestamp: signed.timestamp,
    }, signed.signature), false);

    releaseExpiredSuffixes({ db, now: new Date('2026-06-07T01:00:00Z') });
    db.prepare(`
        INSERT INTO payments (
            user_id, merchant_order_id, amount, product_details, email, status, expires_at
        ) VALUES (1, 'MFK-1-EXPIRE', 50003, 'Tryout Premium: The Trinity TPB', 'student@example.com', 'PENDING', '2026-06-07 00:01:00')
    `).run();
    assert.equal(sweepExpiredPayments(db, new Date('2026-06-07T01:00:00Z')), 1);
    assert.equal(db.prepare("SELECT status FROM payments WHERE merchant_order_id = 'MFK-1-EXPIRE'").get().status, 'EXPIRED');

    console.log('QRIS local flow tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
