#!/usr/bin/env node
// Test PaymentBroadcaster + SSE endpoint + email hook
// Run from project root: node scripts/test-payment-broadcaster.js

const assert = require('assert');
const http = require('http');
const broadcaster = require('../lib/payment-broadcaster');

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
        .catch((err) => fail(name, err.message));
}

// 1. publish ke subscriber match merchantOrderId
asyncTest('publish delivers to matching subscriber', () => {
    const orderId = 'MFK-test-1';
    const received = [];
    const unsub = broadcaster.subscribe(orderId, (payload) => received.push(payload));
    broadcaster.publish(orderId, { status: 'SUCCESS', amount: 50000 });
    assert.deepStrictEqual(received, [{ status: 'SUCCESS', amount: 50000 }]);
    unsub();
});

// 2. Subscriber lain tidak terima event
asyncTest('other subscribers do not receive', () => {
    broadcaster.publish('MFK-test-2', { status: 'SUCCESS' });
    const received = [];
    const unsub = broadcaster.subscribe('MFK-test-3', (payload) => received.push(payload));
    broadcaster.publish('MFK-test-2', { status: 'SUCCESS' });
    assert.strictEqual(received.length, 0);
    unsub();
});

// 3. Multiple subscriber untuk 1 order, semua dapat
asyncTest('multiple subscribers all receive', () => {
    const orderId = 'MFK-test-multi';
    const a = [];
    const b = [];
    const c = [];
    const ua = broadcaster.subscribe(orderId, (p) => a.push(p));
    const ub = broadcaster.subscribe(orderId, (p) => b.push(p));
    const uc = broadcaster.subscribe(orderId, (p) => c.push(p));
    broadcaster.publish(orderId, { status: 'SUCCESS' });
    assert.strictEqual(a.length, 1);
    assert.strictEqual(b.length, 1);
    assert.strictEqual(c.length, 1);
    ua(); ub(); uc();
});

// 4. paid:any listener dapat SEMUA event
asyncTest('paid:any receives all events', () => {
    const all = [];
    const unsub = broadcaster.subscribeAll(({ merchantOrderId, payload }) => {
        all.push({ merchantOrderId, status: payload.status });
    });
    broadcaster.publish('MFK-any-1', { status: 'SUCCESS' });
    broadcaster.publish('MFK-any-2', { status: 'SUCCESS' });
    broadcaster.publish('MFK-any-3', { status: 'SUCCESS' });
    assert.strictEqual(all.length, 3);
    assert.strictEqual(all[0].merchantOrderId, 'MFK-any-1');
    assert.strictEqual(all[2].merchantOrderId, 'MFK-any-3');
    unsub();
});

// 5. Subscribe returns unsubscribe function
asyncTest('subscribe returns working unsubscribe', () => {
    const orderId = 'MFK-test-unsub';
    const received = [];
    const unsub = broadcaster.subscribe(orderId, (p) => received.push(p));
    broadcaster.publish(orderId, { status: 'SUCCESS' });
    assert.strictEqual(received.length, 1);
    unsub();
    broadcaster.publish(orderId, { status: 'SUCCESS' });
    assert.strictEqual(received.length, 1, 'should not receive after unsubscribe');
});

// 6. getStats reports
asyncTest('getStats returns diagnostics', () => {
    const stats = broadcaster.getStats();
    assert.strictEqual(typeof stats.totalListeners, 'number');
    assert.strictEqual(typeof stats.trackedOrders, 'number');
});

// 7. Email template renders without throwing
asyncTest('renderPaymentSuccess returns valid template', () => {
    const { renderPaymentSuccess } = require('../lib/email-templates');
    const result = renderPaymentSuccess({
        user: { display_name: 'Test User', email: 'test@example.com' },
        payment: {
            merchant_order_id: 'MFK-1-123',
            amount: 50000,
            product_details: 'Trial 7 Hari',
        },
    });
    assert.ok(result.subject.includes('Berhasil'), 'subject must mention success');
    assert.ok(result.html.includes('Test User'), 'html must include display name');
    assert.ok(result.html.includes('50000') || result.html.includes('50.000'), 'html must include formatted amount');
    assert.ok(result.text.length > 0, 'text must be non-empty');
});

// 8. SSE endpoint integration test (light): start a minimal HTTP server with the broadcaster
asyncTest('SSE-style streaming delivers events to client', () => {
    return new Promise((resolve, reject) => {
        const orderId = 'MFK-sse-1';
        const server = http.createServer((req, res) => {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
            });
            res.write(`event: status\ndata: ${JSON.stringify({ status: 'PENDING' })}\n\n`);
            const unsub = broadcaster.subscribe(orderId, (payload) => {
                res.write(`event: paid\ndata: ${JSON.stringify(payload)}\n\n`);
            });
            req.on('close', () => unsub());
        });
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            const events = [];
            const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
                res.on('data', (chunk) => {
                    const text = chunk.toString();
                    if (text.startsWith('event: status')) {
                        events.push({ type: 'status', data: text.match(/data: (.+)/)?.[1] });
                    } else if (text.startsWith('event: paid')) {
                        events.push({ type: 'paid', data: text.match(/data: (.+)/)?.[1] });
                        if (events.filter((e) => e.type === 'paid').length >= 1) {
                            req.destroy();
                        }
                    }
                });
                setTimeout(() => {
                    broadcaster.publish(orderId, { status: 'SUCCESS', amount: 50000 });
                }, 100);
            });
            req.on('close', () => {
                server.close(() => {
                    try {
                        const statusEvent = events.find((e) => e.type === 'status');
                        const paidEvent = events.find((e) => e.type === 'paid');
                        assert.ok(statusEvent, 'must receive initial status event');
                        assert.ok(paidEvent, 'must receive paid event');
                        const paidData = JSON.parse(paidEvent.data);
                        assert.strictEqual(paidData.status, 'SUCCESS');
                        assert.strictEqual(paidData.amount, 50000);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });
            });
            req.on('error', (err) => {
                server.close();
                reject(err);
            });
        });
    });
});

// Summary
setTimeout(() => {
    console.log('');
    console.log(`Result: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}, 500);
