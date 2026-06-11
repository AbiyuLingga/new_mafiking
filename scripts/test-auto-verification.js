const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const startedAt = new Date().toISOString();
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
    if (!condition) {
        const error = new Error(`FAIL: ${label}`);
        failures.push(label);
        failed++;
        console.error(`  x ${label}`);
        throw error;
    }
    passed++;
    console.log(`  ok ${label}`);
}

function assertThrows(fn, label) {
    try {
        fn();
        console.error(`  x ${label} (did not throw)`);
        failures.push(label);
        failed++;
    } catch (_) {
        passed++;
        console.log(`  ok ${label}`);
    }
}

async function runAll() {
    console.log('=== Auto-Verification Test Suite ===');
    console.log(`Started: ${startedAt}\n`);

    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');

    // --- Setup schema ---
    console.log('--- Setting up schema ---');

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            display_name TEXT,
            email TEXT,
            role TEXT DEFAULT 'user',
            email_verified_at DATETIME
        );
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            merchant_order_id TEXT UNIQUE NOT NULL,
            amount INTEGER NOT NULL,
            product_details TEXT NOT NULL,
            email TEXT NOT NULL,
            reference TEXT DEFAULT '',
            payment_url TEXT DEFAULT '',
            qr_string TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS user_access_grants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            access_type TEXT NOT NULL,
            access_value TEXT NOT NULL,
            granted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '002_qris_local.sql'), 'utf8'));
    db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '003_incoming_mutations.sql'), 'utf8'));

    db.exec(`INSERT INTO users (id, username, display_name, email, role) VALUES (1, 'test', 'Test User', 'test@mafiking.com', 'user')`);

    const TEST_PEPPER = 'test-pepper-32-bytes-minimum-xxx';

    // --- Test maskName ---
    console.log('\n--- maskName ---');
    const { maskName } = require('../lib/mutation-ingester');
    assert(maskName('Budi Santoso') === 'B*** S***', 'full name masked');
    assert(maskName('Budi') === 'B***', 'single name masked');
    assert(maskName('') === null, 'empty returns null');
    assert(maskName('  ') === null, 'whitespace returns null');
    assert(maskName(null) === null, 'null returns null');

    // --- Test hashPayerId ---
    console.log('\n--- hashPayerId ---');
    const { hashPayerId } = require('../lib/mutation-ingester');
    assert(hashPayerId('ABC123', TEST_PEPPER) !== null, 'hash returns value');
    assert(hashPayerId('ABC123', TEST_PEPPER) === hashPayerId('ABC123', TEST_PEPPER), 'deterministic with same input');
    assert(hashPayerId('ABC123', TEST_PEPPER) !== hashPayerId('XYZ789', TEST_PEPPER), 'different for different input');
    assert(hashPayerId('', TEST_PEPPER) === null, 'empty returns null');
    assert(hashPayerId(null, TEST_PEPPER) === null, 'null returns null');

    // --- Test computeContentHash ---
    console.log('\n--- computeContentHash ---');
    const { computeContentHash } = require('../lib/mutation-ingester');
    const mutation1 = {
        provider: 'qris_merchant',
        providerMutationId: 'RRN123',
        direction: 'IN',
        amount: 50137,
        status: 'SUCCESS',
        transactedAt: new Date('2026-06-10T14:00:00Z'),
        payerId: 'RRN123',
        payerName: 'Budi Santoso',
    };
    const mutation2 = { ...mutation1 };
    const mutation3 = { ...mutation1, amount: 99999 };

    const hash1 = computeContentHash(mutation1, TEST_PEPPER);
    const hash2 = computeContentHash(mutation2, TEST_PEPPER);
    const hash3 = computeContentHash(mutation3, TEST_PEPPER);

    assert(hash1 === hash2, 'deterministic for same input');
    assert(hash1 !== hash3, 'different for different amount');

    // --- Test ingestMutation ---
    console.log('\n--- ingestMutation ---');
    const { ingestMutation, ingestBatch } = require('../lib/mutation-ingester');

    const result1 = ingestMutation(db, mutation1, TEST_PEPPER);
    assert(result1.inserted === true, 'first ingest inserts');
    assert(result1.mutationId > 0, 'returns positive mutationId');
    assert(typeof result1.contentHash === 'string', 'returns contentHash');

    const result2 = ingestMutation(db, mutation1, TEST_PEPPER);
    assert(result2.inserted === false, 'duplicate ingest does not insert');
    assert(result2.mutationId > 0, 'duplicate still returns mutationId');

    // --- Test ingestBatch ---
    console.log('\n--- ingestBatch ---');
    const batch1 = [
        {
            provider: 'qris_merchant',
            providerMutationId: 'BATCH1',
            direction: 'IN',
            amount: 29000,
            status: 'SUCCESS',
            transactedAt: new Date('2026-06-10T14:01:00Z'),
            payerName: 'Test A',
        },
        {
            provider: 'qris_merchant',
            providerMutationId: 'BATCH2',
            direction: 'IN',
            amount: 99000,
            status: 'SUCCESS',
            transactedAt: new Date('2026-06-10T14:02:00Z'),
            payerName: 'Test B',
        },
    ];
    const batchResults = ingestBatch(db, batch1, TEST_PEPPER);
    assert(batchResults.filter(r => r.inserted).length === 2, 'batch inserts 2 new');
    assert(batchResults.every(r => r.mutationId > 0), 'all have mutationId');

    // Duplicate batch
    const batchResults2 = ingestBatch(db, batch1, TEST_PEPPER);
    assert(batchResults2.filter(r => r.inserted).length === 0, 'batch duplicates not inserted');
    assert(batchResults2.every(r => !r.inserted), 'all batch results are duplicates');

    // --- Test matchMutation ---
    console.log('\n--- matchMutation ---');

    // Create a pending payment
    const merchantOrderId = 'MFK-TEST-1700000001';
    const baseAmount = 50000;
    const suffix = 137;
    const fullAmount = baseAmount + suffix;

    db.prepare(`INSERT INTO qris_suffix_locks (base_amount, suffix, merchant_order_id, expires_at)
        VALUES (?, ?, ?, datetime('now', '+20 minutes'))`).run(baseAmount, suffix, merchantOrderId);

    db.prepare(`
        INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, status,
            qris_base_amount, qris_suffix, qris_full_amount, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, datetime('now', '+20 minutes', 'localtime'), ?)
    `).run(1, merchantOrderId, fullAmount, 'Trial 7 Hari', 'test@mafiking.com',
        baseAmount, suffix, fullAmount, '2026-06-10 14:00:00');

    // Create matching mutation
    const matchMutation1 = {
        provider: 'qris_merchant',
        providerMutationId: 'MATCH-RRN-001',
        direction: 'IN',
        amount: fullAmount,
        status: 'SUCCESS',
        transactedAt: new Date('2026-06-10T14:05:00Z'),
        payerName: 'Budi Santoso',
        payerId: 'RRN001',
    };
    const ingResult = ingestMutation(db, matchMutation1, TEST_PEPPER);
    assert(ingResult.inserted === true, 'match mutation ingested');

    const { matchMutation } = require('../lib/mutation-matcher');
    const matchResult = matchMutation(db, ingResult.mutationId);
    assert(matchResult !== null, 'matchMutation returns result');
    assert(matchResult.ok === true, 'matchMutation ok');
    assert(matchResult.merchantOrderId === merchantOrderId, 'correct merchantOrderId');

    // Verify payment is now SUCCESS
    const payment = db.prepare('SELECT status, reconciled_via, paid_at FROM payments WHERE merchant_order_id = ?').get(merchantOrderId);
    assert(payment.status === 'SUCCESS', 'payment marked SUCCESS');
    assert(payment.reconciled_via === 'auto_verify', 'reconciled_via is auto_verify');
    assert(payment.paid_at !== null, 'paid_at is set');

    // Verify access grant
    const grant = db.prepare('SELECT * FROM user_access_grants WHERE user_id = 1').get();
    assert(grant !== undefined && grant.access_value === 'Trial 7 Hari', 'access grant created');

    // Verify suffix released
    const lock = db.prepare('SELECT released_at FROM qris_suffix_locks WHERE merchant_order_id = ?').get(merchantOrderId);
    assert(lock.released_at !== null, 'suffix released');

    // Verify audit log
    const logs = db.prepare(
        "SELECT action, source FROM payment_reconciliation_log WHERE merchant_order_id = ? AND source = 'auto_verify'"
    ).all(merchantOrderId);
    assert(logs.some(l => l.action === 'auto_verify_matched'), 'match audit log recorded');

    // Verify mutation matched
    const mut = db.prepare('SELECT matched_order_id, matched_at FROM incoming_mutations WHERE id = ?').get(ingResult.mutationId);
    assert(mut.matched_order_id === merchantOrderId, 'mutation linked to order');
    assert(mut.matched_at !== null, 'matched_at set');

    // --- Test duplicate match ---
    console.log('\n--- duplicate match prevention ---');
    const dupResult = matchMutation(db, ingResult.mutationId);
    assert(dupResult === null, 'already matched mutation returns null');

    // --- Test amount mismatch ---
    console.log('\n--- amount mismatch ---');
    // Create another pending payment with different amount
    const orderId2 = 'MFK-TEST-1700000002';
    db.prepare(`INSERT INTO qris_suffix_locks (base_amount, suffix, merchant_order_id, expires_at)
        VALUES (?, ?, ?, datetime('now', '+20 minutes'))`).run(99000, 12, orderId2);
    db.prepare(`
        INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, status,
            qris_base_amount, qris_suffix, qris_full_amount, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, datetime('now', '+20 minutes', 'localtime'), ?)
    `).run(1, orderId2, 99012, 'Bulanan', 'test@mafiking.com',
        99000, 12, 99012, '2026-06-10 14:00:00');

    const wrongMutation = {
        provider: 'qris_merchant',
        providerMutationId: 'WRONG-RRN',
        direction: 'IN',
        amount: 12345,
        status: 'SUCCESS',
        transactedAt: new Date('2026-06-10T14:05:00Z'),
    };
    const wrongIngResult = ingestMutation(db, wrongMutation, TEST_PEPPER);
    const wrongMatchResult = matchMutation(db, wrongIngResult.mutationId);
    assert(wrongMatchResult === null, 'wrong amount returns null');

    // Verify unmatched log
    const unmatchedLog = db.prepare(
        "SELECT * FROM payment_reconciliation_log WHERE action = 'auto_verify_unmatched'"
    ).all();
    assert(unmatchedLog.length > 0, 'unmatched audit log recorded');

    // --- Test OUT mutation ---
    console.log('\n--- OUT mutation ---');
    const outMutation = {
        provider: 'qris_merchant',
        providerMutationId: 'OUT-RRN',
        direction: 'OUT',
        amount: 50137,
        status: 'SUCCESS',
        transactedAt: new Date('2026-06-10T14:05:00Z'),
    };
    const outIngResult = ingestMutation(db, outMutation, TEST_PEPPER);
    assert(outIngResult.inserted === true, 'OUT mutation ingested');
    const outMatchResult = matchMutation(db, outIngResult.mutationId);
    assert(outMatchResult === null, 'OUT mutation not matched');

    // --- Test FAILED mutation ---
    console.log('\n--- FAILED mutation ---');
    const failedMutation = {
        provider: 'qris_merchant',
        providerMutationId: 'FAILED-RRN',
        direction: 'IN',
        amount: 29000,
        status: 'FAILED',
        transactedAt: new Date('2026-06-10T14:05:00Z'),
    };
    const failIngResult = ingestMutation(db, failedMutation, TEST_PEPPER);
    assert(failIngResult.inserted === true, 'FAILED mutation ingested');
    const failMatchResult = matchMutation(db, failIngResult.mutationId);
    assert(failMatchResult === null, 'FAILED mutation not matched');

    // --- Test ambiguous ---
    console.log('\n--- ambiguous match ---');
    const ambigAmount = 77777;
    const orderA = 'MFK-AMBIG-A';
    const orderB = 'MFK-AMBIG-B';
    db.prepare(`INSERT INTO qris_suffix_locks (base_amount, suffix, merchant_order_id, expires_at)
        VALUES (77700, 77, ?, datetime('now', '+20 minutes'))`).run(orderA);
    db.prepare(`INSERT INTO qris_suffix_locks (base_amount, suffix, merchant_order_id, expires_at)
        VALUES (77777, 0, ?, datetime('now', '+20 minutes'))`).run(orderB);
    db.prepare(`
        INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, status,
            qris_full_amount, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, datetime('now', '+20 minutes', 'localtime'), ?)
    `).run(1, orderA, ambigAmount, 'Test A', 'a@test.com', ambigAmount, '2026-06-10 14:00:00');
    db.prepare(`
        INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, status,
            qris_full_amount, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, datetime('now', '+20 minutes', 'localtime'), ?)
    `).run(1, orderB, ambigAmount, 'Test B', 'b@test.com', ambigAmount, '2026-06-10 14:00:00');

    const ambigMutation = {
        provider: 'qris_merchant',
        providerMutationId: 'AMBIG-RRN',
        direction: 'IN',
        amount: ambigAmount,
        status: 'SUCCESS',
        transactedAt: new Date('2026-06-10T14:05:00Z'),
    };
    const ambigIngResult = ingestMutation(db, ambigMutation, TEST_PEPPER);
    const ambigMatchResult = matchMutation(db, ambigIngResult.mutationId);
    assert(ambigMatchResult === null, 'ambiguous returns null (no auto-match)');

    // Verify ambiguous log
    const ambigLog = db.prepare(
        "SELECT * FROM payment_reconciliation_log WHERE action = 'auto_verify_ambiguous'"
    ).all();
    assert(ambigLog.length > 0, 'ambiguous audit log recorded');

    // Verify neither order was changed
    const orderACheck = db.prepare('SELECT status FROM payments WHERE merchant_order_id = ?').get(orderA);
    const orderBCheck = db.prepare('SELECT status FROM payments WHERE merchant_order_id = ?').get(orderB);
    assert(orderACheck.status === 'PENDING', 'order A still pending');
    assert(orderBCheck.status === 'PENDING', 'order B still pending');

    // --- Test expired payment ---
    console.log('\n--- expired payment ---');
    const expiredOrderId = 'MFK-EXPIRED-001';
    db.prepare(`INSERT INTO qris_suffix_locks (base_amount, suffix, merchant_order_id, expires_at)
        VALUES (50100, 37, ?, '2026-06-10 13:50:00')`).run(expiredOrderId);
    db.prepare(`
        INSERT INTO payments (user_id, merchant_order_id, amount, product_details, email, status,
            qris_full_amount, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
    `).run(1, expiredOrderId, 50137, 'Expired Test', 'exp@test.com', 50137,
        '2026-06-10 13:55:00', '2026-06-10 13:50:00');

    const expiredMutation = {
        provider: 'qris_merchant',
        providerMutationId: 'EXPIRED-RRN',
        direction: 'IN',
        amount: 50137,
        status: 'SUCCESS',
        transactedAt: new Date('2026-06-10T14:05:00Z'),
    };
    const expIngResult = ingestMutation(db, expiredMutation, TEST_PEPPER);
    const expMatchResult = matchMutation(db, expIngResult.mutationId);
    assert(expMatchResult === null, 'expired payment not matched');

    // --- Test matchPendingMutations ---
    console.log('\n--- matchPendingMutations ---');
    const { matchPendingMutations } = require('../lib/mutation-matcher');
    // Force-clear the expired check - it's a pending mutation that should be re-checked
    const unmatchedBefore = db.prepare(
        'SELECT COUNT(*) as cnt FROM incoming_mutations WHERE matched_order_id IS NULL AND direction = ? AND status = ?'
    ).get('IN', 'SUCCESS');
    assert(unmatchedBefore.cnt > 0, 'unmatched mutations exist');
    const pendingResult = matchPendingMutations(db);
    assert(pendingResult.checked > 0, 'matchPendingMutations checked records');

    // --- Test processNewMutations ---
    console.log('\n--- processNewMutations ---');
    const { processNewMutations } = require('../lib/mutation-matcher');
    const newMuts = [{
        provider: 'qris_merchant',
        providerMutationId: 'PROCESS-RRN',
        direction: 'IN',
        amount: 29000,
        status: 'SUCCESS',
        transactedAt: new Date('2026-06-10T14:10:00Z'),
    }];
    const processResult = processNewMutations(db, newMuts, TEST_PEPPER);
    assert(processResult.ingested >= 1, 'processNewMutations ingested');
    assert(typeof processResult.matched === 'number', 'processNewMutations returns matched count');
    assert(typeof processResult.duplicates === 'number', 'processNewMutations returns duplicates count');

    // --- Test MockMutationProvider ---
    console.log('\n--- MockMutationProvider ---');
    const { MockMutationProvider } = require('../lib/providers/MockMutationProvider');
    const mockProvider = new MockMutationProvider();
    mockProvider.addMutation({
        provider: 'mock',
        direction: 'IN',
        amount: 50000,
        status: 'SUCCESS',
        transactedAt: new Date(),
    });
    const mockResults = await mockProvider.fetchLatestMutations();
    assert(mockResults.length === 1, 'mock returns 1 mutation');
    assert(mockResults[0].amount === 50000, 'mock amount is correct');
    const mockResults2 = await mockProvider.fetchLatestMutations();
    assert(mockResults2.length === 0, 'mock consumed mutations');

    // --- Test validateNormalizedMutation ---
    console.log('\n--- validateNormalizedMutation ---');
    const { validateNormalizedMutation } = require('../lib/providers/PaymentMutationProvider');
    assert(validateNormalizedMutation({
        provider: 'mock', direction: 'IN', amount: 1000,
        status: 'SUCCESS', transactedAt: new Date(),
    }) === true, 'valid mutation passes');
    assert(validateNormalizedMutation({}) === false, 'empty object fails');
    assert(validateNormalizedMutation(null) === false, 'null fails');
    assert(validateNormalizedMutation({
        provider: 'mock', direction: 'IN', amount: 0,
        status: 'SUCCESS', transactedAt: new Date(),
    }) === false, 'zero amount fails');
    assert(validateNormalizedMutation({
        provider: 'mock', direction: 'XXX', amount: 1000,
        status: 'SUCCESS', transactedAt: new Date(),
    }) === false, 'invalid direction fails');

    // --- Test QrisMutasiProvider normalization ---
    console.log('\n--- QrisMutasiProvider normalization ---');
    const {
        normalizeQrisRow,
        normalizeStatus,
        parseAmount,
        parseMutationDate,
    } = require('../lib/providers/QrisMutasiProvider');
    assert(parseAmount('Rp 1.002') === 1002, 'parses rupiah formatted amount');
    assert(parseAmount('1.002') === 1002, 'parses Indonesian thousands separator');
    assert(normalizeStatus('BERHASIL') === 'SUCCESS', 'BERHASIL maps to SUCCESS');
    assert(normalizeStatus('paid') === 'SUCCESS', 'paid maps to SUCCESS');
    assert(normalizeStatus('Success Paid') === 'SUCCESS', 'Success Paid maps to SUCCESS');
    assert(normalizeStatus('') === 'SUCCESS', 'empty QRIS dashboard status defaults to SUCCESS for inbound rows');
    assert(parseMutationDate({ timestamp: 1781175068 }).getTime() === 1781175068000, 'second timestamp parsed');
    assert(parseMutationDate({ timestamp: 1781175068000 }).getTime() === 1781175068000, 'millisecond timestamp parsed');
    const qrisRow = normalizeQrisRow({
        id: 123,
        timestamp: 1781175068,
        tanggal: '2026-06-11 17:51:08',
        nominal: '501',
        status: 'BERHASIL',
        asal_transaksi: 'QRIS',
        nama_costumer: 'ABCD',
        rrn: 'RRN123',
    });
    assert(qrisRow.amount === 501, 'qris row amount normalized');
    assert(qrisRow.status === 'SUCCESS', 'qris row status normalized');
    assert(qrisRow.providerMutationId === 'RRN123', 'qris row provider id normalized');
    assert(validateNormalizedMutation(qrisRow) === true, 'normalized qris row validates');
    assert(normalizeQrisRow({ nominal: 0 }) === null, 'zero nominal qris row rejected');

    // --- Summary ---
    console.log(`\n=== Results ===`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    if (failures.length > 0) {
        console.log(`\nFailures:`);
        failures.forEach(f => console.log(`  - ${f}`));
    }
    console.log(`\nFinished at: ${new Date().toISOString()}`);

    db.close();

    if (failed > 0) {
        process.exit(1);
    }
}

// Need to use async for MockMutationProvider test
(async () => {
    try {
        await runAll();
    } catch (err) {
        console.error('\nFATAL TEST ERROR:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
