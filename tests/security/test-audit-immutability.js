// Audit Log Immutability Test
// Phase 6 hardening: validates that audit tables reject UPDATE/DELETE.

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

const tmpDir = path.join('/tmp', 'mafiking-audit-test-' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, 'test.db');

const Database = require('better-sqlite3');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf-8');
db.exec(schema);

const auditMigration = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'migrations', '005_audit_immutability.sql'), 'utf-8');
db.exec(auditMigration);

const { logReconciliation, checkAndRecordWebhookEvent, computeWebhookEventHash } = require('../../lib/payment-reconciler');

console.log('Audit log immutability tests:');

logReconciliation(db, {
    merchantOrderId: 'MFK-IMMUT-1',
    action: 'mark_paid',
    actorId: null,
    source: 'admin',
    details: { amount: 1000 },
});

const eventHash = computeWebhookEventHash({
    provider: 'qris-webhook',
    eventId: 'evt-immut-1',
    timestamp: 12345,
    merchantOrderId: 'MFK-IMMUT-1',
    amount: 1000,
});
checkAndRecordWebhookEvent(db, {
    provider: 'qris-webhook',
    eventId: 'evt-immut-1',
    eventHash,
    merchantOrderId: 'MFK-IMMUT-1',
});

test('payment_reconciliation_log: INSERT works', () => {
    const row = db.prepare('SELECT * FROM payment_reconciliation_log WHERE merchant_order_id = ?').get('MFK-IMMUT-1');
    assert.ok(row, 'row exists');
    assert.strictEqual(row.action, 'mark_paid');
});

test('payment_reconciliation_log: UPDATE is rejected', () => {
    assert.throws(
        () => db.prepare('UPDATE payment_reconciliation_log SET action = ? WHERE merchant_order_id = ?').run('tampered', 'MFK-IMMUT-1'),
        /append-only|forbidden/i
    );
});

test('payment_reconciliation_log: DELETE is rejected', () => {
    assert.throws(
        () => db.prepare('DELETE FROM payment_reconciliation_log WHERE merchant_order_id = ?').run('MFK-IMMUT-1'),
        /append-only|forbidden/i
    );
});

test('payment_webhook_events: INSERT works', () => {
    const row = db.prepare('SELECT * FROM payment_webhook_events WHERE merchant_order_id = ?').get('MFK-IMMUT-1');
    assert.ok(row, 'row exists');
});

test('payment_webhook_events: UPDATE is rejected', () => {
    assert.throws(
        () => db.prepare('UPDATE payment_webhook_events SET event_id = ? WHERE merchant_order_id = ?').run('tampered', 'MFK-IMMUT-1'),
        /append-only|forbidden/i
    );
});

test('payment_webhook_events: DELETE is rejected', () => {
    assert.throws(
        () => db.prepare('DELETE FROM payment_webhook_events WHERE merchant_order_id = ?').run('MFK-IMMUT-1'),
        /append-only|forbidden/i
    );
});

test('audit log integrity: original row still intact after attempts', () => {
    const row = db.prepare('SELECT * FROM payment_reconciliation_log WHERE merchant_order_id = ?').get('MFK-IMMUT-1');
    assert.strictEqual(row.action, 'mark_paid', 'row should be unchanged');
});

db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
