const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const { calculateCRC16 } = require('@prasetya/qris');

function buildStaticFixture() {
    const body = '00020101021126320014ID.CO.QRIS.WWW011012345678905204000053033605802ID5908MAFIKING6007BANDUNG6304';
    return body + calculateCRC16(body);
}

function request({ baseUrl, method = 'GET', path: requestPath, body, headers = {} }) {
    const url = new URL(requestPath, baseUrl);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    return new Promise((resolve, reject) => {
        const req = http.request({
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
                ...headers,
            },
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let data = null;
                try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = raw; }
                resolve({ status: res.statusCode, data, raw });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function listen(app) {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function main() {
    process.env.NODE_ENV = 'test';
    process.env.PAYMENT_PROVIDER = 'qris';
    process.env.PAYMENT_MOCK_MODE = 'false';
    process.env.QRIS_STATIC_STRING = buildStaticFixture();
    process.env.QRIS_EXPIRY_MINUTES = '20';
    process.env.PAYMENT_WEBHOOK_SECRET = 'route-test-secret';

    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
    db.prepare("INSERT INTO users (id, username, password_hash, display_name, role) VALUES (1, 'Tamu_route_test', 'none', 'Tamu_route_test', 'user')").run();
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('tryout_packages_enabled', '1')").run();
    db.prepare(`
        INSERT INTO tryout_packages (id, tryout_id, title, description, price, duration, questions, features, sort_order)
        VALUES (7, 'tryout-route-test', 'Tryout Route Test', 'Route test', 'Rp 50.000', '90 mnt', 30, '[]', 1)
    `).run();

    const paymentRouter = require('../routes/payment');
    const { signWebhookPayload } = paymentRouter.__test;
    const app = express();
    app.locals.db = db;
    app.use(express.json({ limit: '2mb' }));
    app.use((req, _res, next) => {
        req.session = { userId: 1, role: 'user' };
        next();
    });
    app.use('/api/payment', paymentRouter);

    const { server, baseUrl } = await listen(app);
    try {
        const created = await request({
            baseUrl,
            method: 'POST',
            path: '/api/payment/create',
            body: {
                purchaseType: 'tryout',
                tryoutPackageId: 7,
                email: 'student@example.com',
                name: 'Student',
            },
        });
        assert.equal(created.status, 200, created.raw);
        assert.equal(created.data.provider, 'qris');
        assert.equal(created.data.baseAmount, 50000);
        assert.equal(created.data.suffix, 1);
        assert.equal(created.data.fullAmount, 50001);
        assert.ok(created.data.qrImageDataUrl.startsWith('data:image/png;base64,'));

        const pending = await request({
            baseUrl,
            path: '/api/payment/status/' + encodeURIComponent(created.data.merchantOrderId),
        });
        assert.equal(pending.status, 200, pending.raw);
        assert.equal(pending.data.status, 'PENDING');
        assert.equal(pending.data.fullAmount, 50001);
        assert.ok(pending.data.qrImageDataUrl.startsWith('data:image/png;base64,'));

        const signed = signWebhookPayload(process.env.PAYMENT_WEBHOOK_SECRET, {
            merchantOrderId: created.data.merchantOrderId,
            fullAmount: created.data.fullAmount,
        });
        const webhook = await request({
            baseUrl,
            method: 'POST',
            path: '/api/payment/reconcile/webhook',
            body: {
                merchantOrderId: created.data.merchantOrderId,
                fullAmount: created.data.fullAmount,
                timestamp: signed.timestamp,
                signature: signed.signature,
                source: 'route-test',
            },
        });
        assert.equal(webhook.status, 200, webhook.raw);
        assert.equal(webhook.data.ok, true);

        const success = await request({
            baseUrl,
            path: '/api/payment/status/' + encodeURIComponent(created.data.merchantOrderId),
        });
        assert.equal(success.status, 200, success.raw);
        assert.equal(success.data.status, 'SUCCESS');

        const active = await request({ baseUrl, path: '/api/payment/active-packages' });
        assert.equal(active.status, 200, active.raw);
        assert.deepStrictEqual(active.data, ['Tryout Route Test', 'tryout-route-test']);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        db.close();
    }

    console.log('QRIS payment route smoke passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
