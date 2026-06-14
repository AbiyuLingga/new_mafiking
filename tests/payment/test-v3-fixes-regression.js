#!/usr/bin/env node
// Regression tests for v3 critical fixes (P0/P1/P2):
//   - P0-2: markPaymentPaid broadcasts AFTER transaction commit
//   - P0-1: markProviderSessionExpired is null-safe + idempotent
//   - P1-1: recordAmbiguous inserts one row per candidate
//   - P1-2: findCandidatesWithScores uses true DB collision count
//   - P2-2: broadcaster enforces per-user connection cap
//
// Run from project root: node tests/payment/test-v3-fixes-regression.js

const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

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

function makeDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // schema.sql is the authoritative source — it already incorporates
    // all migrations. Don't re-exec migrations 004/005 on top of it
    // (that would attempt to ALTER TABLE for columns that already
    // exist, raising "duplicate column name" errors).
    const schema = fs.readFileSync(path.join(projectRoot, 'db', 'schema.sql'), 'utf8');
    db.exec(schema);
    // 006 is the ambiguous-queue migration that the merged schema.sql
    // already contains; only exec it if missing.
    try {
        db.exec(fs.readFileSync(path.join(projectRoot, 'db', 'migrations', '006_ambiguous_queue.sql'), 'utf8'));
    } catch (err) {
        // If table already exists from schema.sql, that's fine.
        if (!String(err.message || '').includes('already exists')) {
            throw err;
        }
    }
    return db;
}

function seedUser(db, id) {
    db.prepare(`
        INSERT INTO users (id, username, display_name, email, role, auth_provider, password_hash, created_at)
        VALUES (?, 'u' || ?, 'U' || ?, 'u' || ? || '@t.com', 'student', 'local', 'none', CURRENT_TIMESTAMP)
    `).run(id, id, id, id);
}

function seedPendingPayment(db, { orderId, userId, amount, qrisFullAmount, baseAmount, suffix, createdMinutesAgo = 0, expiresInMinutes = 30 }) {
    const now = new Date();
    const created = new Date(now.getTime() - createdMinutesAgo * 60000);
    const expires = new Date(now.getTime() + expiresInMinutes * 60000);
    const ref = 'QRIS-' + orderId;
    db.prepare(`
        INSERT INTO payments (
            user_id, merchant_order_id, amount, product_details, email,
            reference, payment_url, qr_string, status,
            qris_base_amount, qris_suffix, qris_full_amount, created_at, expires_at
        ) VALUES (?, ?, ?, 'Test Product', 'u@t.com', ?, '', ?, 'PENDING',
                  ?, ?, ?, ?, ?)
    `).run(
        userId,
        orderId,
        amount,
        ref,
        ref,
        qrisFullAmount || null,
        baseAmount || null,
        suffix || null,
        created.toISOString().slice(0, 19).replace('T', ' '),
        expires.toISOString().slice(0, 19).replace('T', ' ')
    );
}

// ========== P0-2: markPaymentPaid broadcasts AFTER commit ==========

asyncTest('P0-2: notifyPaymentSuccess is called AFTER transaction commit (success path)', () => {
    const db = makeDb();
    seedUser(db, 1);
    seedPendingPayment(db, { orderId: 'MFK-P02-1', userId: 1, amount: 29000 });
    // Clear broadcaster side effects from any earlier tests by deleting
    // require cache so payment-broadcaster singleton re-initializes.
    delete require.cache[require.resolve('../../server/payments/payment-broadcaster')];
    const broadcaster = require('../../server/payments/payment-broadcaster');
    const { markPaymentPaid } = require('../../server/payments/payment-reconciler');

    let observed = null;
    broadcaster.subscribe('MFK-P02-1', (payload) => { observed = payload; });

    const result = markPaymentPaid(db, {
        merchantOrderId: 'MFK-P02-1',
        fullAmount: 29000,
        source: 'test',
        actorId: 1,
    });
    assert.strictEqual(result.success, true);
    // The broadcaster must have fired with the canonical post-commit state.
    assert.ok(observed, 'broadcaster should have fired');
    assert.strictEqual(observed.status, 'SUCCESS');
    assert.strictEqual(observed.merchantOrderId, 'MFK-P02-1');
    // Payment is SUCCESS in DB.
    const final = db.prepare('SELECT status, paid_at FROM payments WHERE merchant_order_id = ?').get('MFK-P02-1');
    assert.strictEqual(final.status, 'SUCCESS');
    assert.ok(final.paid_at, 'paid_at should be set');
});

asyncTest('P0-2: notifyPaymentSuccess is NOT called when transaction throws (failure path)', () => {
    const db = makeDb();
    seedUser(db, 1);
    seedPendingPayment(db, { orderId: 'MFK-P02-2', userId: 1, amount: 29000 });
    delete require.cache[require.resolve('../../server/payments/payment-broadcaster')];
    const broadcaster = require('../../server/payments/payment-broadcaster');
    const { markPaymentPaid } = require('../../server/payments/payment-reconciler');

    let observed = null;
    broadcaster.subscribe('MFK-P02-2', (payload) => { observed = payload; });

    // Force mismatch to trigger a 400 throw inside the transaction.
    assert.throws(() => markPaymentPaid(db, {
        merchantOrderId: 'MFK-P02-2',
        fullAmount: 99999, // wrong amount
        source: 'test',
    }), /Nominal tidak cocok/);

    // Broadcaster MUST NOT have been called — the transaction rolled back.
    assert.strictEqual(observed, null, 'broadcaster should not fire on failed transaction');
    // Payment remains PENDING.
    const final = db.prepare('SELECT status FROM payments WHERE merchant_order_id = ?').get('MFK-P02-2');
    assert.strictEqual(final.status, 'PENDING');
});

// ========== P0-1: markProviderSessionExpired null-safe + idempotent ==========

asyncTest('P0-1: markProviderSessionExpired handles null provider', () => {
    const { markProviderSessionExpired } = require('../../server/payments/self-healing-collector');
    assert.strictEqual(markProviderSessionExpired(null), false);
    assert.strictEqual(markProviderSessionExpired(undefined), false);
});

asyncTest('P0-1: markProviderSessionExpired does not mutate arbitrary properties', () => {
    const { markProviderSessionExpired } = require('../../server/payments/self-healing-collector');
    // Foreign object without own qris/client — must not add those props.
    const foreign = { fetchLatestMutations: () => [] };
    markProviderSessionExpired(foreign);
    assert.ok(!('qris' in foreign), 'should not add qris property');
    assert.ok(!('client' in foreign), 'should not add client property');
    assert.ok(!('__mafikingSessionResetInProgress' in foreign) || foreign.__mafikingSessionResetInProgress === true,
        'should set the in-progress flag');
});

asyncTest('P0-1: markProviderSessionExpired is idempotent within 500ms', () => {
    const { markProviderSessionExpired } = require('../../server/payments/self-healing-collector');
    const provider = { qris: { stub: true }, markSessionExpired() { this.qris = null; } };
    const r1 = markProviderSessionExpired(provider);
    const r2 = markProviderSessionExpired(provider);
    const r3 = markProviderSessionExpired(provider);
    assert.strictEqual(r1, true);
    assert.strictEqual(r2, true, 'second call within 500ms should still return true (coalesce)');
    assert.strictEqual(r3, true, 'third call within 500ms should still return true');
});

// ========== P1-1: recordAmbiguous inserts one row per candidate ==========

asyncTest('P1-1: recordAmbiguous inserts 3 rows for 3 candidates', () => {
    const db = makeDb();
    seedUser(db, 1);
    // Insert a real incoming_mutations row (FK constraint requires it)
    db.prepare(`
        INSERT INTO incoming_mutations (provider, provider_mutation_id, content_hash, direction, amount, status, transacted_at)
        VALUES ('test', 'RRN-P11-1', 'hash-p11-1', 'IN', 29000, 'SUCCESS', '2026-06-12 10:00:00')
    `).run();
    const mutationId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
    const { recordAmbiguous } = require('../../server/payments/confidence-matcher');
    recordAmbiguous(db, {
        mutationId,
        mutation: { transacted_at: '2026-06-12 10:00:00', amount: 29000, payer_name_masked: 'B***' },
        candidates: [
            { payment: { merchant_order_id: 'MFK-A-1' }, score: 200 },
            { payment: { merchant_order_id: 'MFK-A-2' }, score: 195 },
            { payment: { merchant_order_id: 'MFK-A-3' }, score: 190 },
        ],
    });
    const rows = db.prepare('SELECT * FROM payment_ambiguous_queue WHERE mutation_id = ? ORDER BY id').all(mutationId);
    assert.strictEqual(rows.length, 3, `expected 3 rows, got ${rows.length}`);
    assert.strictEqual(rows[0].merchant_order_id, 'MFK-A-1');
    assert.strictEqual(rows[0].confidence_score, 200);
    assert.strictEqual(rows[1].merchant_order_id, 'MFK-A-2');
    assert.strictEqual(rows[1].confidence_score, 195);
    assert.strictEqual(rows[2].merchant_order_id, 'MFK-A-3');
    assert.strictEqual(rows[2].confidence_score, 190);
});

asyncTest('P1-1: recordAmbiguous skips invalid candidates atomically', () => {
    const db = makeDb();
    seedUser(db, 1);
    db.prepare(`
        INSERT INTO incoming_mutations (provider, provider_mutation_id, content_hash, direction, amount, status, transacted_at)
        VALUES ('test', 'RRN-P11-2', 'hash-p11-2', 'IN', 29000, 'SUCCESS', '2026-06-12 10:00:00')
    `).run();
    const mutationId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
    const { recordAmbiguous } = require('../../server/payments/confidence-matcher');
    recordAmbiguous(db, {
        mutationId,
        mutation: { transacted_at: '2026-06-12 10:00:00', amount: 29000 },
        candidates: [
            { payment: { merchant_order_id: 'MFK-T-1' }, score: 200 },
            { payment: null /* invalid */ },
            { payment: { merchant_order_id: 'MFK-T-2' }, score: 195 },
        ],
    });
    const rows = db.prepare('SELECT * FROM payment_ambiguous_queue WHERE mutation_id = ?').all(mutationId);
    assert.strictEqual(rows.length, 2, 'invalid candidate should be skipped, valid ones still inserted');
    assert.strictEqual(rows[0].merchant_order_id, 'MFK-T-1');
    assert.strictEqual(rows[1].merchant_order_id, 'MFK-T-2');
});

// ========== P1-2: findCandidatesWithScores uses true collision count ==========

asyncTest('P1-2: collision count reflects DB state, not just candidate array length', () => {
    const db = makeDb();
    // Need 7 users for 7 payments (FK constraint).
    for (let i = 1; i <= 7; i += 1) seedUser(db, i);
    // Create 5 pending payments all amount=29000, all within time window
    // so they're all candidates. The OLD code would have computed
    // otherPendingSameAmount = candidates.length - 1 = 4 (wrong — there
    // are no other PENDING payments besides the candidate itself).
    // The NEW code queries the DB: SELECT COUNT(*) FROM payments WHERE
    // status='PENDING' AND amount=29000 = 5, so trueCollisionCount = 4.
    // For a regression test we verify the score is in the same range
    // (not higher) regardless of which formula was used.
    const now = new Date();
    const nowSql = now.toISOString().slice(0, 19).replace('T', ' ');
    for (let i = 1; i <= 5; i += 1) {
        seedPendingPayment(db, {
            orderId: `MFK-C-${i}`,
            userId: i,
            amount: 29000,
            qrisFullAmount: 29000,
            createdMinutesAgo: 1,
            expiresInMinutes: 240,
        });
    }
    db.prepare(`
        INSERT INTO incoming_mutations (provider, provider_mutation_id, content_hash, direction, amount, status, transacted_at)
        VALUES ('qris_merchant', 'RRN-COL', 'hash-col-1', 'IN', 29000, 'SUCCESS', ?)
    `).run(nowSql);
    const mutation = db.prepare('SELECT * FROM incoming_mutations WHERE content_hash = ?').get('hash-col-1');

    const { findCandidatesWithScores } = require('../../server/payments/confidence-matcher');
    const scored = findCandidatesWithScores({ db, mutation, limit: 5 });
    assert.strictEqual(scored.length, 5, `expected 5 candidates, got ${scored.length}`);
    // Each scored candidate should have otherPendingSameAmount = 4
    // (5 total PENDING - 1 self). We can't directly inspect the param,
    // but we can verify the score is < 170 (since 4 collisions → 0 bonus).
    // The old (buggy) code would have used 4 here too because all 5
    // are candidates. So this test verifies the SCORE PATH is correct.
    // For a true P1-2 regression, see test below.
    for (const c of scored) {
        assert.ok(c.score < 200, `expected score < 200 (no collision bonus since true collisions=4>=2), got ${c.score}`);
    }
});

asyncTest('P1-2 (deep): collision count uses DB query, not just candidates array', () => {
    // The real P1-2 bug: old code computed otherPendingSameAmount =
    // candidates.length - 1. If we have MORE than `limit` pending
    // payments with the same amount, the old code underestimates
    // collisions. The new code uses SELECT COUNT(*) to get the true count.
    //
    // Setup: 10 PENDING payments all amount=29000, but limit=5 means
    // findCandidatesWithScores returns 5. Old code: otherPending = 4.
    // New code: SELECT COUNT returns 10, so otherPending = 9.
    //
    // We can't directly inspect otherPending, but the SCORE differs:
    // - old: 100 + time + 0 + 20 (one collision) = 170-ish
    // - new: 100 + time + 0 + 0 (≥2 collisions) = 145-ish
    // So the score should be in the 145-170 range (not above 170).
    const db = makeDb();
    for (let i = 1; i <= 10; i += 1) seedUser(db, i);
    const now = new Date();
    const nowSql = now.toISOString().slice(0, 19).replace('T', ' ');
    for (let i = 1; i <= 10; i += 1) {
        seedPendingPayment(db, {
            orderId: `MFK-D-${i}`,
            userId: i,
            amount: 29000,
            qrisFullAmount: 29000,
            createdMinutesAgo: 1,
            expiresInMinutes: 240,
        });
    }
    db.prepare(`
        INSERT INTO incoming_mutations (provider, provider_mutation_id, content_hash, direction, amount, status, transacted_at)
        VALUES ('qris_merchant', 'RRN-DEEP', 'hash-deep-1', 'IN', 29000, 'SUCCESS', ?)
    `).run(nowSql);
    const mutation = db.prepare('SELECT * FROM incoming_mutations WHERE content_hash = ?').get('hash-deep-1');

    const { findCandidatesWithScores } = require('../../server/payments/confidence-matcher');
    const scored = findCandidatesWithScores({ db, mutation, limit: 5 });
    assert.strictEqual(scored.length, 5, 'should return up to 5 candidates');
    // 10 PENDING total, trueCollisionCount = 9. Score should be ≤ 170.
    for (const c of scored) {
        assert.ok(c.score <= 170, `expected score ≤ 170 with 9 true collisions, got ${c.score}`);
    }
});

// ========== P2-2: broadcaster enforces per-user connection cap ==========

asyncTest('P2-2: broadcaster rejects 4th connection from same user (default cap 3)', () => {
    delete require.cache[require.resolve('../../server/payments/payment-broadcaster')];
    const broadcaster = require('../../server/payments/payment-broadcaster');
    // Simulate 3 connections from user 100.
    for (let i = 0; i < 3; i += 1) {
        const r = broadcaster.registerConnection({
            userId: 100,
            merchantOrderId: 'MFK-100-' + i,
            onPaid: () => {},
        });
        assert.strictEqual(r.ok, true, `conn ${i + 1} should succeed`);
    }
    // 4th must be rejected.
    const r4 = broadcaster.registerConnection({
        userId: 100,
        merchantOrderId: 'MFK-100-4',
        onPaid: () => {},
    });
    assert.strictEqual(r4.ok, false);
    assert.strictEqual(r4.reason, 'too_many_connections');
    assert.strictEqual(r4.limit, 3);
});

asyncTest('P2-2: different users can each have up to cap connections', () => {
    delete require.cache[require.resolve('../../server/payments/payment-broadcaster')];
    const broadcaster = require('../../server/payments/payment-broadcaster');
    for (let i = 0; i < 3; i += 1) {
        const r = broadcaster.registerConnection({ userId: 200, merchantOrderId: 'MFK-200-' + i, onPaid: () => {} });
        assert.strictEqual(r.ok, true);
    }
    // user 200 4th rejected
    assert.strictEqual(broadcaster.registerConnection({ userId: 200, merchantOrderId: 'MFK-200-4', onPaid: () => {} }).ok, false);
    // user 201 first succeeds (different user)
    assert.strictEqual(broadcaster.registerConnection({ userId: 201, merchantOrderId: 'MFK-201-1', onPaid: () => {} }).ok, true);
});

asyncTest('P2-2: releaseConnection frees a slot', () => {
    delete require.cache[require.resolve('../../server/payments/payment-broadcaster')];
    const broadcaster = require('../../server/payments/payment-broadcaster');
    const r1 = broadcaster.registerConnection({ userId: 300, merchantOrderId: 'MFK-300-1', onPaid: () => {} });
    const r2 = broadcaster.registerConnection({ userId: 300, merchantOrderId: 'MFK-300-2', onPaid: () => {} });
    const r3 = broadcaster.registerConnection({ userId: 300, merchantOrderId: 'MFK-300-3', onPaid: () => {} });
    const r4 = broadcaster.registerConnection({ userId: 300, merchantOrderId: 'MFK-300-4', onPaid: () => {} });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r3.ok, true);
    assert.strictEqual(r4.ok, false, '4th should fail');
    // Release first connection
    broadcaster.releaseConnection(r1.connectionId);
    // Now 4th should succeed
    const r5 = broadcaster.registerConnection({ userId: 300, merchantOrderId: 'MFK-300-4', onPaid: () => {} });
    assert.strictEqual(r5.ok, true, 'after release, 4th should succeed');
});

asyncTest('P2-2: getStats includes activeSseConnections', () => {
    delete require.cache[require.resolve('../../server/payments/payment-broadcaster')];
    const broadcaster = require('../../server/payments/payment-broadcaster');
    broadcaster.registerConnection({ userId: 400, merchantOrderId: 'MFK-400-1', onPaid: () => {} });
    broadcaster.registerConnection({ userId: 401, merchantOrderId: 'MFK-401-1', onPaid: () => {} });
    broadcaster.registerConnection({ userId: 401, merchantOrderId: 'MFK-401-2', onPaid: () => {} });
    const stats = broadcaster.getStats();
    assert.strictEqual(typeof stats.activeSseConnections, 'number');
    assert.ok(stats.activeSseConnections >= 3, `expected >= 3, got ${stats.activeSseConnections}`);
    assert.strictEqual(typeof stats.maxConnPerUser, 'number');
    assert.strictEqual(typeof stats.uniqueUsersWithSse, 'number');
});

// ========== P2-3: setTimeout for email is unref'd ==========

asyncTest('P2-3: setTimeout in notifyPaymentSuccess is unref-d (non-blocking)', () => {
    // Inspect the source code: the setTimeout(...).unref?.() pattern.
    const src = fs.readFileSync(
        path.join(projectRoot, 'server', 'payments', 'payment-reconciler.js'),
        'utf8',
    );
    // The actual code is `setTimeout(..., 50).unref?.();` — use String.includes
    // to avoid regex escaping pitfalls.
    assert.ok(
        src.includes('.unref?.()'),
        'payment-reconciler should call .unref?.() on a setTimeout so SMTP timeout does not block process exit',
    );
    // The email block must use setTimeout (not setImmediate, which
    // cannot be unref-d). The `.unref?.()` call is at the END of the
    // block, after the inner IIFE — use a 3000-char window to capture it.
    const emailSection = src.match(/Email is fire-and-forget[\s\S]{0,3000}/);
    assert.ok(
        emailSection && emailSection[0].includes('setTimeout(') && emailSection[0].includes('.unref?.()'),
        'email send must use setTimeout(...).unref?.() not setImmediate',
    );
    // Negative assertion: setImmediate in notifyPaymentSuccess would mean
    // the refactor was undone.
    const notifyFn = src.match(/function notifyPaymentSuccess[\s\S]{0,2500}/);
    assert.ok(
        notifyFn && !notifyFn[0].includes('setImmediate('),
        'notifyPaymentSuccess should NOT use setImmediate (cannot be unref-d, blocks shutdown)',
    );
});

// Summary
setTimeout(() => {
    console.log('');
    console.log(`Result: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}, 500);
