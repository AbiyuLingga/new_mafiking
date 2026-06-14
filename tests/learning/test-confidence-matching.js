#!/usr/bin/env node
// Test confidence-based matching algorithm
// Run from project root: node tests/learning/test-confidence-matching.js

const assert = require('assert');
const {
    scoreCandidate,
    findCandidatesWithScores,
    shouldAutoMatch,
    THRESHOLDS,
} = require('../../server/payments/confidence-matcher');

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

function test(name, fn) {
    try {
        fn();
        ok(name);
    } catch (err) {
        fail(name, err.message);
    }
}

// 1. AMOUNT mismatch → 0
test('amount mismatch returns 0', () => {
    const score = scoreCandidate({
        payment: { amount: 29000, qris_full_amount: 29000, created_at: '2026-06-12 10:00:00' },
        mutation: { amount: 29100, transacted_at: '2026-06-12 10:05:00' },
        transactedAtMs: Date.parse('2026-06-12T10:05:00Z'),
        otherPendingSameAmount: 0,
    });
    assert.strictEqual(score, 0);
});

// 2. Perfect match (recent, no collision, no user activity) → 200
test('perfect match scores 200', () => {
    const score = scoreCandidate({
        payment: { amount: 29000, qris_full_amount: 29000, created_at: '2026-06-12 10:00:00' },
        mutation: { amount: 29000, transacted_at: '2026-06-12 10:05:00' },
        transactedAtMs: Date.parse('2026-06-12T10:05:00Z'),
        otherPendingSameAmount: 0,
    });
    assert.strictEqual(score, 100 + 45 + 0 + 50);
});

// 3. With user activity 1 minute ago → 100+45+29+50 = 224 (active user bonus reduces by 1 min)
test('match with active user scores 224', () => {
    const score = scoreCandidate({
        payment: { amount: 29000, qris_full_amount: 29000, created_at: '2026-06-12 10:00:00' },
        mutation: { amount: 29000, transacted_at: '2026-06-12 10:05:00' },
        transactedAtMs: Date.parse('2026-06-12T10:05:00Z'),
        userActivity: { lastActiveAt: '2026-06-12 10:04:00' },
        otherPendingSameAmount: 0,
    });
    assert.strictEqual(score, 100 + 45 + 29 + 50);
});

// 4. Mutation time before payment created (clock skew) → 100+30+50 = 180
test('mutation before payment (clock skew) scores 180', () => {
    const score = scoreCandidate({
        payment: { amount: 29000, qris_full_amount: 29000, created_at: '2026-06-12 10:05:00' },
        mutation: { amount: 29000, transacted_at: '2026-06-12 10:00:00' },
        transactedAtMs: Date.parse('2026-06-12T10:00:00Z'),
        otherPendingSameAmount: 0,
    });
    assert.strictEqual(score, 100 + 30 + 0 + 50);
});

// 5. Mutation time >30 min after payment → time window = 0
test('mutation 30+ min after payment scores lower', () => {
    const score = scoreCandidate({
        payment: { amount: 29000, qris_full_amount: 29000, created_at: '2026-06-12 10:00:00' },
        mutation: { amount: 29000, transacted_at: '2026-06-12 10:45:00' },
        transactedAtMs: Date.parse('2026-06-12T10:45:00Z'),
        otherPendingSameAmount: 0,
    });
    // amount(100) + 0 + 0 + 50 = 150
    assert.strictEqual(score, 150);
});

// 6. One other pending same amount → 20 instead of 50
test('one other pending same amount reduces score', () => {
    const score = scoreCandidate({
        payment: { amount: 29000, qris_full_amount: 29000, created_at: '2026-06-12 10:00:00' },
        mutation: { amount: 29000, transacted_at: '2026-06-12 10:05:00' },
        transactedAtMs: Date.parse('2026-06-12T10:05:00Z'),
        otherPendingSameAmount: 1,
    });
    assert.strictEqual(score, 100 + 45 + 0 + 20);
});

// 7. Two+ other pending same amount → 0 collision bonus
test('two+ other pending same amount scores 0 collision bonus', () => {
    const score = scoreCandidate({
        payment: { amount: 29000, qris_full_amount: 29000, created_at: '2026-06-12 10:00:00' },
        mutation: { amount: 29000, transacted_at: '2026-06-12 10:05:00' },
        transactedAtMs: Date.parse('2026-06-12T10:05:00Z'),
        otherPendingSameAmount: 2,
    });
    assert.strictEqual(score, 100 + 45 + 0 + 0);
});

// 8. shouldAutoMatch: single high-score → winner
test('shouldAutoMatch: single high-score returns winner', () => {
    const scored = [
        { payment: { merchant_order_id: 'MFK-1' }, score: 230 },
    ];
    const winner = shouldAutoMatch(scored);
    assert.ok(winner);
    assert.strictEqual(winner.payment.merchant_order_id, 'MFK-1');
});

// 9. shouldAutoMatch: multiple high-scores → ambiguous (no winner)
test('shouldAutoMatch: multiple high-scores returns null', () => {
    const scored = [
        { payment: { merchant_order_id: 'MFK-1' }, score: 200 },
        { payment: { merchant_order_id: 'MFK-2' }, score: 200 },
    ];
    assert.strictEqual(shouldAutoMatch(scored), null);
});

// 10. shouldAutoMatch: low score → null
test('shouldAutoMatch: low score returns null', () => {
    const scored = [
        { payment: { merchant_order_id: 'MFK-1' }, score: 100 },
    ];
    assert.strictEqual(shouldAutoMatch(scored), null);
});

// 11. shouldAutoMatch: empty → null
test('shouldAutoMatch: empty returns null', () => {
    assert.strictEqual(shouldAutoMatch([]), null);
});

// 12. THRESHOLDS exposed
test('THRESHOLDS exposes AUTO_MATCH_MIN = 180', () => {
    assert.strictEqual(THRESHOLDS.AUTO_MATCH_MIN, 180);
    assert.strictEqual(THRESHOLDS.AMOUNT_MATCH, 100);
});

// 13. User activity 1 hour ago → 0 user bonus
test('user activity 1 hour ago scores 0 user bonus', () => {
    const score = scoreCandidate({
        payment: { amount: 29000, qris_full_amount: 29000, created_at: '2026-06-12 10:00:00' },
        mutation: { amount: 29000, transacted_at: '2026-06-12 10:05:00' },
        transactedAtMs: Date.parse('2026-06-12T10:05:00Z'),
        userActivity: { lastActiveAt: '2026-06-12 09:05:00' }, // 60 min ago
        otherPendingSameAmount: 0,
    });
    assert.strictEqual(score, 100 + 45 + 0 + 50);
});

// 14. findCandidatesWithScores returns scored array (with in-memory DB)
test('findCandidatesWithScores with 2 candidates scores both', () => {
    const Database = require('better-sqlite3');
    const path = require('path');
    const fs = require('fs');
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
    db.exec(schema);
    // Seed: 2 pending payments with same amount
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.prepare(`INSERT INTO users (id, username, display_name, email, role, auth_provider, password_hash, created_at) VALUES (1, 'u', 'U', 'u@t.com', 'student', 'local', 'none', ?)`).run(now);
    db.prepare(`INSERT INTO users (id, username, display_name, email, role, auth_provider, password_hash, created_at) VALUES (2, 'u2', 'U2', 'u2@t.com', 'student', 'local', 'none', ?)`).run(now);
    db.prepare(`INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, reference, status, created_at, expires_at)
                VALUES (1, 'MFK-1', 29000, 'Test', 'u@t.com', 'Q', 'PENDING', ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, reference, status, created_at, expires_at)
                VALUES (2, 'MFK-2', 29000, 'Test', 'u2@t.com', 'Q', 'PENDING', ?, ?)`).run(now, now);
    const mutation = {
        amount: 29000,
        transacted_at: now,
    };
    const scored = findCandidatesWithScores({ db, mutation, limit: 5 });
    assert.strictEqual(scored.length, 2);
    // Both should have same amount match (100) but different other-pending counts:
    // 1st: other=1, score 100+time+0+20; 2nd: other=1, same.
    assert.ok(scored[0].score >= 100);
    assert.ok(scored[1].score >= 100);
    // shouldAutoMatch: 2 candidates, both high score → null (ambiguous)
    assert.strictEqual(shouldAutoMatch(scored), null);
});

// 15. findCandidatesWithScores with 0 candidates returns empty
test('findCandidatesWithScores with 0 candidates returns empty', () => {
    const Database = require('better-sqlite3');
    const path = require('path');
    const fs = require('fs');
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
    db.exec(schema);
    const mutation = { amount: 99999, transacted_at: new Date().toISOString().slice(0, 19).replace('T', ' ') };
    const scored = findCandidatesWithScores({ db, mutation, limit: 5 });
    assert.deepStrictEqual(scored, []);
});

// Summary
console.log('');
console.log(`Result: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
