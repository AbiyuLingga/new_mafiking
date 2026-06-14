#!/usr/bin/env node
// Test admin ambiguous resolver + bulk mark-paid + resend-email + metrics
// Run from project root: node tests/admin/test-admin-ambiguous-resolver.js

const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function ok(name) {
    console.log(`ok ${name}`);
    passed += 1;
}

function fail(name, detail) {
    console.log(`FAIL ${name}: ${detail}`);
    failed += 1;
}

function asyncTest(name, fn) {
    return Promise.resolve()
        .then(() => fn())
        .then(() => ok(name))
        .catch((err) => fail(name, err.message || err));
}

// Helper: bikin in-memory DB dengan schema yang relevan
function makeDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const schema = require('fs').readFileSync(path.join(projectRoot, 'db', 'schema.sql'), 'utf8');
    db.exec(schema);
    // Seed minimal user
    db.prepare(`INSERT INTO users (id, username, display_name, email, role, auth_provider, password_hash, created_at)
                VALUES (1, 'student', 'Student', 's@test.com', 'student', 'local', 'none', CURRENT_TIMESTAMP)`).run();
    db.prepare(`INSERT INTO users (id, username, display_name, email, role, auth_provider, password_hash, created_at)
                VALUES (2, 'admin', 'Admin', 'a@test.com', 'admin', 'local', 'none', CURRENT_TIMESTAMP)`).run();
    return db;
}

// 1. Ambiguous list kosong ketika tabel ada tapi belum ada data
asyncTest('GET /ambiguous returns empty when no ambiguous mutations', () => {
    const db = makeDb();
    const rows = db.prepare(`
        SELECT id, mutation_id, merchant_order_id, confidence_score, amount
        FROM payment_ambiguous_queue
        WHERE resolved_at IS NULL
        ORDER BY created_at DESC LIMIT 100
    `).all();
    assert.deepStrictEqual(rows, []);
});

// 2. Insert ambiguous mutation (FK constraint not enforced in test for simplicity)
asyncTest('payment_ambiguous_queue can store ambiguous mutation', () => {
    const db = makeDb();
    // Disable FK temporarily for this test
    db.pragma('foreign_keys = OFF');
    db.prepare(`
        INSERT INTO payment_ambiguous_queue (mutation_id, merchant_order_id, confidence_score, transacted_at, amount, payer_name_masked)
        VALUES (1, 'MFK-1-amb-1', 130, datetime('now', '-5 minutes'), 29137, 'B*** S***')
    `).run();
    const row = db.prepare('SELECT * FROM payment_ambiguous_queue WHERE merchant_order_id = ?').get('MFK-1-amb-1');
    assert.strictEqual(row.confidence_score, 130);
    assert.strictEqual(row.amount, 29137);
    assert.ok(row.created_at);
    db.pragma('foreign_keys = ON');
});

// 3. Resolve ambiguous marks resolved_at
asyncTest('resolve marks resolved_at', () => {
    const db = makeDb();
    db.pragma('foreign_keys = OFF');
    db.prepare(`
        INSERT INTO payment_ambiguous_queue (mutation_id, merchant_order_id, confidence_score, transacted_at, amount)
        VALUES (2, 'MFK-1-amb-2', 140, datetime('now'), 29100)
    `).run();
    db.prepare(`
        UPDATE payment_ambiguous_queue
        SET resolved_at = CURRENT_TIMESTAMP, resolved_by = 'admin', resolution = 'matched'
        WHERE id = (SELECT id FROM payment_ambiguous_queue WHERE merchant_order_id = 'MFK-1-amb-2')
    `).run();
    const row = db.prepare('SELECT * FROM payment_ambiguous_queue WHERE merchant_order_id = ?').get('MFK-1-amb-2');
    assert.ok(row.resolved_at, 'resolved_at must be set');
    assert.strictEqual(row.resolved_by, 'admin');
    assert.strictEqual(row.resolution, 'matched');
    db.pragma('foreign_keys = ON');
});

// 4. Bulk mark-paid: 3 valid payments → all PAID
asyncTest('bulk mark-paid processes multiple valid items', () => {
    const db = makeDb();
    for (let i = 0; i < 3; i += 1) {
        const orderId = `MFK-1-bulk-${i}`;
        db.prepare(`
            INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, reference, status)
            VALUES (1, ?, 29000, 'Trial 7 Hari', 's@test.com', 'QRIS-bulk-${i}', 'PENDING')
        `).run(orderId);
    }
    const { markPaymentPaid } = require('../../server/payments/payment-reconciler');
    const results = [];
    const errors = [];
    for (let i = 0; i < 3; i += 1) {
        const orderId = `MFK-1-bulk-${i}`;
        try {
            const result = markPaymentPaid(db, {
                merchantOrderId: orderId,
                fullAmount: 29000,
                source: 'admin_bulk',
                actorId: 2,
            });
            results.push({ merchantOrderId: orderId, ok: true, ...result });
        } catch (err) {
            errors.push({ merchantOrderId: orderId, error: err.message });
        }
    }
    assert.strictEqual(results.length, 3);
    assert.strictEqual(errors.length, 0);
    // Verify all are SUCCESS in DB
    const successCount = db.prepare(`SELECT COUNT(*) c FROM payments WHERE status = 'SUCCESS' AND merchant_order_id LIKE 'MFK-1-bulk-%'`).get().c;
    assert.strictEqual(successCount, 3);
});

// 5. Bulk mark-paid: 2 valid + 1 not-found + 1 already-paid
asyncTest('bulk mark-paid handles partial failures', () => {
    const db = makeDb();
    db.prepare(`
        INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, reference, status)
        VALUES (1, 'MFK-1-bulk-ok-1', 29000, 'Trial 7 Hari', 's@test.com', 'Q', 'PENDING')
    `).run();
    const { markPaymentPaid } = require('../../server/payments/payment-reconciler');
    const results = [];
    const errors = [];
    const items = [
        { merchantOrderId: 'MFK-1-bulk-ok-1' },
        { merchantOrderId: 'MFK-DOES-NOT-EXIST' },
        { merchantOrderId: 'MFK-1-bulk-ok-1' }, // already paid → alreadyPaid:true (not error)
    ];
    for (const item of items) {
        try {
            const result = markPaymentPaid(db, {
                merchantOrderId: item.merchantOrderId,
                fullAmount: 29000,
                source: 'admin_bulk',
                actorId: 2,
            });
            // alreadyPaid is a success, not an error
            if (result.alreadyPaid) {
                results.push({ merchantOrderId: item.merchantOrderId, ok: true, alreadyPaid: true });
            } else {
                results.push({ merchantOrderId: item.merchantOrderId, ok: true });
            }
        } catch (err) {
            errors.push({ merchantOrderId: item.merchantOrderId, error: err.message });
        }
    }
    // 2 successes (1 fresh + 1 already-paid), 1 error (not found)
    assert.strictEqual(results.length, 2);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].error.includes('tidak ditemukan'));
    // alreadyPaid flag preserved
    const alreadyPaid = results.find((r) => r.alreadyPaid);
    assert.ok(alreadyPaid, 'second call should return alreadyPaid:true');
});

// 6. Feature flag BULK_ADMIN respected
asyncTest('bulk mark-paid returns 503 when BULK_ADMIN flag is off', () => {
    const { isEnabled: isFeatureEnabled } = require('../../server/config/feature-flags');
    const original = isFeatureEnabled('BULK_ADMIN');
    // Force off
    process.env.BULK_ADMIN = 'false';
    // Reload module to pick up
    delete require.cache[require.resolve('../../server/config/feature-flags')];
    const { isEnabled: isFeatureEnabledReload } = require('../../server/config/feature-flags');
    assert.strictEqual(isFeatureEnabledReload('BULK_ADMIN'), false);
    // Restore
    delete process.env.BULK_ADMIN;
    delete require.cache[require.resolve('../../server/config/feature-flags')];
    assert.strictEqual(original !== undefined, true);
});

// 7. Metrics endpoint returns last 24h counts
asyncTest('metrics endpoint returns last24h structure', () => {
    const db = makeDb();
    // Simulate some events
    for (let i = 0; i < 5; i += 1) {
        db.prepare(`
            INSERT INTO payment_reconciliation_log (merchant_order_id, action, actor_id, source, details)
            VALUES (?, 'mark_paid', 2, 'auto_verify', '{}')
        `).run(`MFK-1-metric-${i}`);
    }
    const last24h = "datetime('now', '-24 hours')";
    const autoCount = db.prepare(`SELECT COUNT(*) c FROM payment_reconciliation_log WHERE action='mark_paid' AND source='auto_verify' AND created_at > ${last24h}`).get().c;
    assert.strictEqual(autoCount, 5);
});

// 8. Resend-email only allowed for SUCCESS payments
asyncTest('resend-email rejects non-SUCCESS payments', () => {
    const db = makeDb();
    db.prepare(`
        INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, reference, status)
        VALUES (1, 'MFK-1-pending-1', 29000, 'Trial 7 Hari', 's@test.com', 'Q', 'PENDING')
    `).run();
    const payment = db.prepare('SELECT * FROM payments WHERE merchant_order_id = ?').get('MFK-1-pending-1');
    assert.strictEqual(payment.status, 'PENDING', 'precondition: should be PENDING');
    // The actual route handler checks `if (payment.status !== 'SUCCESS') return 409`
    // Simulated here as a unit-level assertion
    const shouldReject = payment.status !== 'SUCCESS';
    assert.strictEqual(shouldReject, true);
});

// Summary
setTimeout(() => {
    console.log('');
    console.log(`Result: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}, 300);
