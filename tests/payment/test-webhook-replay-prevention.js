// Webhook Replay Prevention & Idempotency Test
// Phase 2 hardening: validates event dedup table and idempotency key behaviors.

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ok  ${name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL ${name}: ${err.message}`);
    }
}
async function testAsync(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ok  ${name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL ${name}: ${err.message}`);
    }
}

const tmpDir = path.join('/tmp', 'mafiking-webhook-test-' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, 'test.db');

const Database = require('better-sqlite3');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf-8');
db.exec(schema);

const {
    checkAndRecordWebhookEvent,
    computeWebhookEventHash,
    resolveIdempotencyKey,
    storeIdempotencyKey,
} = require('../../lib/payment-reconciler');

console.log('Webhook replay prevention tests:');

test('computeWebhookEventHash: produces deterministic SHA-256 hex', () => {
    const h1 = computeWebhookEventHash({ provider: 'qris-webhook', eventId: 'evt-1', timestamp: 1234, merchantOrderId: 'M1', amount: 100 });
    const h2 = computeWebhookEventHash({ provider: 'qris-webhook', eventId: 'evt-1', timestamp: 1234, merchantOrderId: 'M1', amount: 100 });
    assert.strictEqual(h1, h2);
    assert.strictEqual(h1.length, 64);
});

test('computeWebhookEventHash: different inputs produce different hashes', () => {
    const h1 = computeWebhookEventHash({ provider: 'qris-webhook', eventId: 'evt-1', timestamp: 1234, merchantOrderId: 'M1', amount: 100 });
    const h2 = computeWebhookEventHash({ provider: 'qris-webhook', eventId: 'evt-2', timestamp: 1234, merchantOrderId: 'M1', amount: 100 });
    assert.notStrictEqual(h1, h2);
});

test('checkAndRecordWebhookEvent: first call returns alreadyProcessed=false', () => {
    const eventHash = computeWebhookEventHash({ provider: 'qris-webhook', eventId: 'evt-new-1', timestamp: 1234, merchantOrderId: 'M1', amount: 100 });
    const result = checkAndRecordWebhookEvent(db, { provider: 'qris-webhook', eventId: 'evt-new-1', eventHash, merchantOrderId: 'M1' });
    assert.strictEqual(result.alreadyProcessed, false);
});

test('checkAndRecordWebhookEvent: second call with same hash returns alreadyProcessed=true', () => {
    const eventHash = computeWebhookEventHash({ provider: 'qris-webhook', eventId: 'evt-dup-1', timestamp: 1234, merchantOrderId: 'M2', amount: 200 });
    const r1 = checkAndRecordWebhookEvent(db, { provider: 'qris-webhook', eventId: 'evt-dup-1', eventHash, merchantOrderId: 'M2' });
    const r2 = checkAndRecordWebhookEvent(db, { provider: 'qris-webhook', eventId: 'evt-dup-1', eventHash, merchantOrderId: 'M2' });
    assert.strictEqual(r1.alreadyProcessed, false);
    assert.strictEqual(r2.alreadyProcessed, true);
    assert.ok(r2.record);
});

test('checkAndRecordWebhookEvent: stores merchantOrderId for audit', () => {
    const eventHash = computeWebhookEventHash({ provider: 'mutasiku-webhook', eventId: 'evt-audit', timestamp: 9999, merchantOrderId: 'MFK-X', amount: 500 });
    checkAndRecordWebhookEvent(db, { provider: 'mutasiku-webhook', eventId: 'evt-audit', eventHash, merchantOrderId: 'MFK-X' });
    const row = db.prepare('SELECT * FROM payment_webhook_events WHERE event_hash = ?').get(eventHash);
    assert.ok(row);
    assert.strictEqual(row.merchant_order_id, 'MFK-X');
    assert.strictEqual(row.provider, 'mutasiku-webhook');
});

test('storeIdempotencyKey: stores key and merchant order', () => {
    const keyHash = 'hash-key-1';
    const expiresAt = Date.now() + 60_000;
    storeIdempotencyKey(db, keyHash, 'MFK-IDEM-1', expiresAt);
    const row = db.prepare('SELECT * FROM payment_idempotency_keys WHERE key_hash = ?').get(keyHash);
    assert.ok(row);
    assert.strictEqual(row.merchant_order_id, 'MFK-IDEM-1');
});

test('resolveIdempotencyKey: returns null for unknown key', () => {
    const result = resolveIdempotencyKey(db, 'nonexistent-hash');
    assert.strictEqual(result, null);
});

test('resolveIdempotencyKey: returns existing order for stored key', () => {
    const keyHash = 'hash-key-exists';
    const expiresAt = Date.now() + 60_000;
    storeIdempotencyKey(db, keyHash, 'MFK-IDEM-2', expiresAt);
    const result = resolveIdempotencyKey(db, keyHash);
    assert.ok(result);
    assert.strictEqual(result.merchant_order_id, 'MFK-IDEM-2');
});

test('resolveIdempotencyKey: returns null for expired key', () => {
    const keyHash = 'hash-key-expired';
    const past = Date.now() - 60_000;
    db.prepare(`INSERT INTO payment_idempotency_keys (key_hash, merchant_order_id, expires_at) VALUES (?, ?, ?)`).run(
        keyHash, 'MFK-IDEM-OLD', new Date(past).toISOString().slice(0, 19).replace('T', ' ')
    );
    const result = resolveIdempotencyKey(db, keyHash);
    assert.strictEqual(result, null);
});

test('resolveIdempotencyKey: cleanup removes expired keys', () => {
    const keyHash = 'hash-key-cleanup';
    const past = Date.now() - 60_000;
    db.prepare(`INSERT INTO payment_idempotency_keys (key_hash, merchant_order_id, expires_at) VALUES (?, ?, ?)`).run(
        keyHash, 'MFK-IDEM-CLEANUP', new Date(past).toISOString().slice(0, 19).replace('T', ' ')
    );
    resolveIdempotencyKey(db, 'some-other-key');
    const stillThere = db.prepare('SELECT id FROM payment_idempotency_keys WHERE key_hash = ?').get(keyHash);
    assert.strictEqual(stillThere, undefined, 'Expired key should be cleaned up');
});

test('storeIdempotencyKey: INSERT OR IGNORE on duplicate key_hash', () => {
    const keyHash = 'hash-key-uniq';
    storeIdempotencyKey(db, keyHash, 'MFK-FIRST', Date.now() + 60_000);
    storeIdempotencyKey(db, keyHash, 'MFK-SECOND', Date.now() + 60_000);
    const rows = db.prepare('SELECT * FROM payment_idempotency_keys WHERE key_hash = ?').all(keyHash);
    assert.strictEqual(rows.length, 1, 'Should have only one row due to INSERT OR IGNORE');
    assert.strictEqual(rows[0].merchant_order_id, 'MFK-FIRST');
});

db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
