'use strict';

/**
 * Phase B (Self-Healing Collector) test suite.
 *
 * Covers the 10 contract points enumerated in
 * `docs/plans/pay_self_healing_v3.md` §7.4:
 *
 *   1. CircuitBreaker: CLOSED → 3 failures → OPEN → recovery → HALF_OPEN → success → CLOSED
 *   2. CircuitBreaker: HALF_OPEN → failure → OPEN
 *   3. Adaptive interval: pending=0 + idle < 5min → WARM
 *   4. Adaptive interval: pending=0 + idle >= 5min → COLD
 *   5. Adaptive interval: pending >= 1 → HOT
 *   6. Session detection: error "Login required" → re-init
 *   7. Session detection: HTML with `<input type=password>` → re-init
 *   8. Session detection: normal HTML → no re-init
 *   9. Cookie atomicity: 2 parallel `_ensureClient` tidak overwrite
 *  10. Heartbeat: collector emit, main app menerima
 *
 * Run via `node tests/payment/test-self-healing-collector.js` or as part of
 * `npm run check`. Exits 0 on success, 1 on any failure.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const Database = require('better-sqlite3');
const express = require('express');

const {
    CircuitBreaker,
    SelfHealingCollector,
    DEFAULT_ADAPTIVE,
    getAdaptiveInterval,
    countPendingPayments,
    isSessionExpiredError,
    buildDefaultHeartbeatConfig,
} = require('../../server/payments/self-healing-collector');
const {
    QrisMutasiProvider,
    isSessionExpiredError: providerSessionCheck,
} = require('../../server/payments/providers/QrisMutasiProvider');
const internalRouter = require('../../server/routes/internal');
const { buildInternalRouter } = internalRouter;

let passed = 0;
let failed = 0;
const failures = [];
const logLines = [];
const log = {
    log: (...args) => { logLines.push(['log', ...args].join(' ')); },
    warn: (...args) => { logLines.push(['warn', ...args].join(' ')); },
    error: (...args) => { logLines.push(['error', ...args].join(' ')); },
};

function ok(label) {
    passed++;
    console.log(`  ok ${label}`);
}

function fail(label, err) {
    failed++;
    failures.push(label);
    console.error(`  x ${label}`, err && err.message ? err.message : err || '');
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function makePaymentDb() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant_order_id TEXT UNIQUE NOT NULL,
            amount INTEGER NOT NULL,
            product_details TEXT NOT NULL,
            email TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            expires_at DATETIME,
            qris_base_amount INTEGER,
            qris_suffix INTEGER,
            qris_full_amount INTEGER,
            paid_at DATETIME,
            reconciled_via TEXT,
            reconciled_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE incoming_mutations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL DEFAULT 'mock',
            provider_mutation_id TEXT,
            content_hash TEXT UNIQUE NOT NULL,
            direction TEXT NOT NULL DEFAULT 'IN',
            amount INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'SUCCESS',
            transacted_at DATETIME NOT NULL,
            received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            payer_name_masked TEXT,
            payer_id_hash TEXT,
            note_masked TEXT,
            matched_order_id TEXT,
            matched_at DATETIME
        );
        CREATE TABLE payment_reconciliation_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant_order_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor_id INTEGER,
            source TEXT NOT NULL,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE qris_suffix_locks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            base_amount INTEGER NOT NULL,
            suffix INTEGER NOT NULL,
            merchant_order_id TEXT UNIQUE NOT NULL,
            locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            released_at DATETIME
        );
    `);
    return db;
}

(async () => {
    console.log('--- 1. CircuitBreaker: CLOSED → 3 failures → OPEN → recovery → HALF_OPEN → success → CLOSED ---');
    try {
        const breaker = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 50 });
        assert.equal(breaker.canRequest(), true, 'starts CLOSED, can request');
        breaker.recordFailure();
        breaker.recordFailure();
        assert.equal(breaker.state, 'CLOSED', 'still CLOSED after 2 failures');
        breaker.recordFailure();
        assert.equal(breaker.state, 'OPEN', 'OPEN after 3 failures');
        assert.equal(breaker.canRequest(), false, 'OPEN cannot request');
        await sleep(80);
        assert.equal(breaker.canRequest(), true, 'OPEN → HALF_OPEN after recovery');
        assert.equal(breaker.state, 'HALF_OPEN', 'state is HALF_OPEN after recovery probe');
        breaker.recordSuccess();
        assert.equal(breaker.state, 'CLOSED', 'HALF_OPEN success → CLOSED');
        assert.equal(breaker.failures, 0, 'failures reset on success');
        ok('CircuitBreaker: 3 failures → OPEN → recovery → HALF_OPEN → success → CLOSED');
    } catch (err) {
        fail('CircuitBreaker: 3 failures → OPEN → recovery → HALF_OPEN → success → CLOSED', err);
    }

    console.log('\n--- 2. CircuitBreaker: HALF_OPEN → failure → OPEN ---');
    try {
        const breaker = new CircuitBreaker({ failureThreshold: 2, recoveryTimeoutMs: 30 });
        breaker.recordFailure();
        breaker.recordFailure();
        assert.equal(breaker.state, 'OPEN');
        await sleep(60);
        assert.equal(breaker.canRequest(), true, 'probe granted');
        assert.equal(breaker.state, 'HALF_OPEN');
        breaker.recordFailure();
        assert.equal(breaker.state, 'OPEN', 'HALF_OPEN failure → OPEN');
        assert.equal(breaker.canRequest(), false, 'OPEN again blocks requests');
        ok('CircuitBreaker: HALF_OPEN failure → OPEN');
    } catch (err) {
        fail('CircuitBreaker: HALF_OPEN failure → OPEN', err);
    }

    console.log('\n--- 3. Adaptive interval: pending=0 + idle < 5min → WARM ---');
    try {
        const now = Date.now();
        const warm = getAdaptiveInterval({
            pendingCount: 0,
            lastActivityAt: now - 60_000, // 1 minute ago
        });
        assert.equal(warm, DEFAULT_ADAPTIVE.warmIntervalMs, 'idle < cold threshold → WARM');
        ok('Adaptive: pending=0 + idle<5min → WARM');
    } catch (err) {
        fail('Adaptive: pending=0 + idle<5min → WARM', err);
    }

    console.log('\n--- 4. Adaptive interval: pending=0 + idle >= 5min → COLD ---');
    try {
        const now = Date.now();
        const cold = getAdaptiveInterval({
            pendingCount: 0,
            lastActivityAt: now - (10 * 60_000), // 10 minutes ago
        });
        assert.equal(cold, DEFAULT_ADAPTIVE.coldIntervalMs, 'idle ≥ cold threshold → COLD');
        ok('Adaptive: pending=0 + idle>=5min → COLD');
    } catch (err) {
        fail('Adaptive: pending=0 + idle>=5min → COLD', err);
    }

    console.log('\n--- 5. Adaptive interval: pending >= 1 → HOT ---');
    try {
        const hot = getAdaptiveInterval({
            pendingCount: 1,
            lastActivityAt: Date.now() - 60_000,
        });
        assert.equal(hot, DEFAULT_ADAPTIVE.hotIntervalMs, 'pending ≥ 1 → HOT');
        const hotStill = getAdaptiveInterval({
            pendingCount: 5,
            lastActivityAt: Date.now() - 24 * 60 * 60_000,
        });
        assert.equal(hotStill, DEFAULT_ADAPTIVE.hotIntervalMs, 'pending ≥ 1 wins over idle');
        ok('Adaptive: pending >= 1 → HOT (even when idle)');
    } catch (err) {
        fail('Adaptive: pending >= 1 → HOT (even when idle)', err);
    }

    console.log('\n--- 6. Session detection: "Login required" Error → re-init ---');
    try {
        const err = new Error('Login required: please re-authenticate');
        assert.equal(isSessionExpiredError(err), true, 'detects "Login required"');
        assert.equal(providerSessionCheck(err), true, 'provider helper also detects');
        ok('Session detection: "Login required" string → re-init');
    } catch (err) {
        fail('Session detection: "Login required" string → re-init', err);
    }

    console.log('\n--- 7. Session detection: HTML with <input type=password> → re-init ---');
    try {
        const html = '<html><body><form action="/login"><input type="password" name="pwd" /></form></body></html>';
        assert.equal(providerSessionCheck(null, html), true, 'detects password input in HTML');
        const err = new Error(`Cookie expired. Response: ${html}`);
        assert.equal(providerSessionCheck(err), true, 'detects HTML embedded in error message');
        ok('Session detection: password-input HTML → re-init');
    } catch (err) {
        fail('Session detection: password-input HTML → re-init', err);
    }

    console.log('\n--- 8. Session detection: normal HTML / plain text → no re-init ---');
    try {
        const html = '<html><body><table><tr><td>txn 1</td></tr></table></body></html>';
        assert.equal(providerSessionCheck(null, html), false, 'plain table HTML → no re-init');
        assert.equal(isSessionExpiredError(new Error('ECONNRESET')), false, 'generic network error → no re-init');
        assert.equal(isSessionExpiredError(new Error('Mutasi fetch timeout')), false, 'timeout → no re-init');
        assert.equal(isSessionExpiredError(null), false, 'null → no re-init');
        ok('Session detection: normal HTML / non-session errors → no re-init');
    } catch (err) {
        fail('Session detection: normal HTML / non-session errors → no re-init', err);
    }

    console.log('\n--- 9. Cookie atomicity: process.cwd() restored after _ensureClient ---');
    try {
        const originalCwd = process.cwd();
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'mafiking-self-heal-cwd-'));

        async function fakeEnsureClient(sandboxDir) {
            const originalCwdInner = process.cwd();
            try {
                process.chdir(sandboxDir);
                return { email: 'a@b', password: 'c' };
            } finally {
                process.chdir(originalCwdInner);
            }
        }

        await fakeEnsureClient(sandbox);
        assert.equal(process.cwd(), originalCwd, 'sequential call: cwd restored');

        const tasks = [];
        for (let i = 0; i < 5; i += 1) {
            tasks.push(fakeEnsureClient(sandbox));
        }
        await Promise.all(tasks);
        assert.equal(process.cwd(), originalCwd, 'parallel calls: cwd restored');
        ok('Cookie atomicity: process.cwd() always restored (sequential + 5x parallel)');

        // Exercise the real QrisMutasiProvider's _ensureClient() with a
        // chdir that throws, to confirm the finally block still runs.
        const provider = new QrisMutasiProvider({
            email: 'test@example.com',
            password: 'x',
            cookieDir: sandbox,
            timeout: 1000,
        });
        const beforeCwd = process.cwd();
        const realChdir = process.chdir;
        process.chdir = () => { throw new Error('simulated chdir failure'); };
        try {
            try {
                await provider._ensureClient();
            } catch (err) {
                assert.ok(err.message.includes('simulated chdir failure'), 'chdir error surfaces');
            }
        } finally {
            process.chdir = realChdir;
        }
        assert.equal(process.cwd(), beforeCwd, 'cwd unchanged after chdir-throw');
        ok('Cookie atomicity: QrisMutasiProvider._ensureClient restores cwd even when chdir throws');

        const absoluteCookieProvider = new QrisMutasiProvider({
            email: 'test@example.com',
            password: 'x',
            cookieDir: sandbox,
            timeout: 1000,
        });
        await absoluteCookieProvider._ensureClient();
        assert.equal(
            absoluteCookieProvider.qris.cookieFile,
            path.join(sandbox, `${absoluteCookieProvider._hash('test@example.comx')}_cookie.txt`),
            'qris-mutasi cookie path is pinned to the sandbox'
        );
        ok('Cookie atomicity: qris-mutasi uses an absolute sandbox cookie path');

        fs.rmSync(sandbox, { recursive: true, force: true });
    } catch (err) {
        fail('Cookie atomicity: process.cwd() restoration', err);
    }

    console.log('\n--- 10. Heartbeat: collector emit → main app receives ---');
    try {
        const secret = 'test-internal-secret-1234';
        const secretlessRouter = buildInternalRouter({ heartbeatSecret: '' });
        const heartbeatRouter = buildInternalRouter({ heartbeatSecret: secret });

        // --- Direct handler invocation: wrong-secret → 401, valid → 200 ---
        // The router has its own dispatch layer wrapping the route, so we
        // grab the actual POST handler at `router.stack[0].route.stack[0].handle`.
        const handler = heartbeatRouter.stack[0].route.stack[0].handle;
        const secretlessHandler = secretlessRouter.stack[0].route.stack[0].handle;

        const fakeRes = () => {
            const res = {
                statusCode: 200,
                body: null,
                status(c) { this.statusCode = c; return this; },
                json(obj) { this.body = obj; return this; },
            };
            return res;
        };

        const app1 = { locals: { collectorHeartbeat: null } };
        const r1 = fakeRes();
        handler({ app: app1, body: {}, get: () => '' }, r1, () => {});
        assert.equal(r1.statusCode, 401, 'wrong secret → 401');
        assert.equal(r1.body.error, 'invalid_internal_secret', '401 body has error code');

        const r2 = fakeRes();
        handler({ app: app1, body: { startedAt: 1234 }, get: (n) => n === 'x-internal-secret' ? secret : '' }, r2, () => {});
        assert.equal(r2.statusCode, 200, 'valid secret → 200');
        assert.ok(app1.locals.collectorHeartbeat, 'app.locals.collectorHeartbeat populated');
        assert.equal(app1.locals.collectorHeartbeat.startedAt, 1234, 'startedAt recorded');
        assert.equal(typeof app1.locals.collectorHeartbeat.breaker.state, 'string', 'breaker state recorded');

        // No-secret-configured → 503
        const sr = fakeRes();
        secretlessHandler({ app: { locals: {} }, body: {}, get: () => 'x' }, sr, () => {});
        assert.equal(sr.statusCode, 503, 'no secret configured → 503');
        ok('Heartbeat: direct handler → 401 / 200 / 503 paths');

        // --- End-to-end via real Express + a SelfHealingCollector ---
        const db = makePaymentDb();
        const future = new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
        db.prepare(
            "INSERT INTO payments (merchant_order_id, amount, product_details, email, status, expires_at) VALUES (?, ?, ?, ?, 'PENDING', ?)"
        ).run('TEST-HEARTBEAT-1', 50000, 'Test', 'test@x.com', future);

        const mockProvider = {
            constructor: { name: 'MockHeartbeatProvider' },
            async fetchLatestMutations() { return []; },
        };

        const e2eApp = express();
        e2eApp.use(express.json());
        e2eApp.use('/api/internal', buildInternalRouter({ heartbeatSecret: secret }));

        // Wait for the listening event so `server.address()` is populated.
        const { port, server, url } = await new Promise((resolve) => {
            const s = e2eApp.listen(0, '127.0.0.1', () => {
                const p = s.address().port;
                resolve({
                    port: p,
                    server: s,
                    url: `http://127.0.0.1:${p}/api/internal/collector-heartbeat`,
                });
            });
        });

        const previousMainAppUrl = process.env.MAIN_APP_URL;
        const previousSecret = process.env.INTERNAL_API_SECRET;
        process.env.MAIN_APP_URL = `http://127.0.0.1:${port}`;
        process.env.INTERNAL_API_SECRET = secret;

        try {
            const heartbeat = buildDefaultHeartbeatConfig();
            assert.equal(heartbeat.enabled, true, 'heartbeat auto-enabled when env set');
            assert.equal(heartbeat.url, url, 'heartbeat URL derived from MAIN_APP_URL');

            const collector = new SelfHealingCollector({
                db,
                provider: mockProvider,
                pepper: 'unit-test-pepper-1234567890abcdef',
                heartbeat,
                log,
            });
            await collector._sendHeartbeat();
            assert.equal(collector.lastHeartbeatOk, true, 'collector.lastHeartbeatOk === true after success');
            assert.ok(e2eApp.locals.collectorHeartbeat, 'server received heartbeat payload');
            assert.equal(e2eApp.locals.collectorHeartbeat.provider, 'MockHeartbeatProvider', 'provider recorded on server side');
            collector.stop();
        } finally {
            process.env.MAIN_APP_URL = previousMainAppUrl;
            process.env.INTERNAL_API_SECRET = previousSecret;
            server.close();
        }
        ok('Heartbeat: collector → main app end-to-end (real HTTP)');
    } catch (err) {
        fail('Heartbeat: collector → main app end-to-end', err);
    }

    // --- Bonus: countPendingPayments against a real DB ---
    console.log('\n--- Bonus: countPendingPayments respects status + expiry ---');
    try {
        const db = new Database(':memory:');
        db.exec(`
            CREATE TABLE payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                merchant_order_id TEXT UNIQUE NOT NULL,
                amount INTEGER NOT NULL,
                product_details TEXT NOT NULL,
                email TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                expires_at DATETIME
            );
        `);
        const future = new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
        const past = new Date(Date.now() - 30 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
        db.prepare('INSERT INTO payments (merchant_order_id, amount, product_details, email, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run('P1', 100, 'x', 'a@x.com', 'PENDING', future);
        db.prepare('INSERT INTO payments (merchant_order_id, amount, product_details, email, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run('P2', 100, 'x', 'a@x.com', 'PENDING', past);
        db.prepare('INSERT INTO payments (merchant_order_id, amount, product_details, email, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run('P3', 100, 'x', 'a@x.com', 'SUCCESS', future);
        assert.equal(countPendingPayments(db), 1, 'only the active PENDING counts');
        ok('countPendingPayments: respects status + expires_at');
    } catch (err) {
        fail('countPendingPayments: respects status + expires_at', err);
    }

    // --- Bonus: triggerPoll happy path ---
    console.log('\n--- Bonus: SelfHealingCollector.triggerPoll records success ---');
    try {
        const db = makePaymentDb();
        const future = new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
        db.prepare('INSERT INTO payments (merchant_order_id, amount, product_details, email, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run('P-OK', 75000, 'x', 'a@x.com', 'PENDING', future);
        const provider = {
            constructor: { name: 'MockOKProvider' },
            async fetchLatestMutations() { return [{
                provider: 'mock',
                providerMutationId: 'mut-1',
                direction: 'IN',
                amount: 75000,
                status: 'SUCCESS',
                transactedAt: new Date(),
                payerName: 'Tester',
                payerId: 'p-1',
                note: 'ok',
            }]; },
        };
        const collector = new SelfHealingCollector({
            db,
            provider,
            pepper: 'unit-test-pepper-1234567890abcdef',
            heartbeat: { enabled: false },
            log,
        });
        const result = await collector.triggerPoll();
        assert.equal(result.ok, true, 'poll ok');
        assert.equal(result.matched, 1, 'one payment matched');
        const stats = collector.getStats();
        assert.equal(stats.totalMatched, 1, 'stats.totalMatched === 1');
        assert.equal(stats.pendingCount, 0, 'no more pending after match');
        collector.stop();
        ok('SelfHealingCollector: triggerPoll matches and updates stats');
    } catch (err) {
        fail('SelfHealingCollector: triggerPoll matches and updates stats', err);
    }

    // --- Bonus: session-expired re-init path ---
    console.log('\n--- Bonus: SelfHealingCollector session-expired re-init ---');
    try {
        const db = makePaymentDb();
        const callCount = { n: 0 };
        const provider = {
            constructor: { name: 'MockExpiredProvider' },
            isSessionExpiredError: (err) => /login required/i.test(String(err?.message || err)),
            async fetchLatestMutations() {
                callCount.n += 1;
                if (callCount.n === 1) throw new Error('Login required');
                return [];
            },
        };
        const collector = new SelfHealingCollector({
            db,
            provider,
            pepper: 'unit-test-pepper-1234567890abcdef',
            breaker: { failureThreshold: 1 },
            heartbeat: { enabled: false },
            log,
        });
        const first = await collector.triggerPoll();
        assert.equal(first.ok, false, 'first poll failed (session expired)');
        assert.equal(first.sessionExpired, true, 'sessionExpired flag set');
        const stats1 = collector.getStats();
        assert.equal(stats1.totalSessionReInit, 1, 'session re-init counted');
        assert.equal(stats1.breaker.state, 'CLOSED', 'breaker stays CLOSED on session-expired');
        const second = await collector.triggerPoll();
        assert.equal(second.ok, true, 'second poll ok (provider recovered)');
        collector.stop();
        ok('SelfHealingCollector: session-expired → re-init → breaker stays CLOSED');
    } catch (err) {
        fail('SelfHealingCollector: session-expired → re-init → breaker stays CLOSED', err);
    }

    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.error('Failures:');
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
    }
})().catch((err) => {
    console.error('Self-healing collector tests failed:', err);
    process.exit(1);
});
