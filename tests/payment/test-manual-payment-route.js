const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const { markPaymentPaid } = require('../../server/payments/payment-reconciler');

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
    process.env.PAYMENT_PROVIDER = 'manual';
    process.env.PAYMENT_MOCK_MODE = 'false';
    process.env.QRIS_ADMIN_WHATSAPP = '6281234567890';
    process.env.QRIS_EXPIRY_MINUTES = '20';

    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'));
    db.prepare("INSERT INTO users (id, username, password_hash, display_name, role) VALUES (1, 'guest-test', 'none', 'Tamu_Test', 'guest')").run();
    db.prepare("INSERT INTO users (id, username, password_hash, display_name, role) VALUES (2, 'student@example.com', '$2b$10$realHash', 'Student', 'user')").run();
    db.prepare("INSERT INTO users (id, username, password_hash, display_name, role) VALUES (3, 'other@example.com', '$2b$10$realHash', 'Other Student', 'user')").run();
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('tryout_packages_enabled', '1')").run();
    db.prepare(`
        INSERT INTO tryout_packages (id, tryout_id, title, description, price, duration, questions, features, sort_order)
        VALUES (7, 'tryout-manual-test', 'Tryout Manual Test', 'Manual route test', 'Rp 50.000', '90 mnt', 30, '[]', 1)
    `).run();

    const paymentRouter = require('../../server/routes/payment');
    const app = express();
    app.locals.db = db;
    let sessionUserId = 2;
    app.use(express.json({ limit: '2mb' }));
    app.use((req, _res, next) => {
        req.session = { userId: sessionUserId, role: 'user' };
        next();
    });
    app.use('/api/payment', paymentRouter);

    const { server, baseUrl } = await listen(app);
    try {
        const body = {
            purchaseType: 'tryout',
            tryoutPackageId: 7,
            email: 'student@example.com',
            name: 'Student',
        };
        const first = await request({ baseUrl, method: 'POST', path: '/api/payment/create', body });
        assert.equal(first.status, 200, first.raw);
        assert.equal(first.data.provider, 'manual');
        assert.equal(first.data.baseAmount, 50000);
        assert.equal(first.data.suffix, 1);
        assert.equal(first.data.fullAmount, 50001);
        assert.equal(first.data.adminWhatsapp, '6281234567890');
        db.prepare(`
            UPDATE qris_suffix_locks
            SET released_at = CURRENT_TIMESTAMP
            WHERE merchant_order_id = ?
        `).run(first.data.merchantOrderId);

        const second = await request({ baseUrl, method: 'POST', path: '/api/payment/create', body });
        assert.equal(second.status, 200, second.raw);
        assert.equal(second.data.provider, 'manual');
        assert.equal(second.data.baseAmount, 50000);
        assert.equal(second.data.suffix, 2);
        assert.equal(second.data.fullAmount, 50002);
        db.prepare(`
            INSERT INTO qris_suffix_locks (base_amount, suffix, merchant_order_id, expires_at, released_at)
            VALUES (50000, 399, 'MFK-HISTORICAL-399', '2099-01-01 00:00:00', CURRENT_TIMESTAMP)
        `).run();

        const wrapped = await request({ baseUrl, method: 'POST', path: '/api/payment/create', body });
        assert.equal(wrapped.status, 200, wrapped.raw);
        assert.equal(wrapped.data.provider, 'manual');
        assert.equal(wrapped.data.suffix, 1);
        assert.equal(wrapped.data.fullAmount, 50001);
        db.prepare(`
            UPDATE qris_suffix_locks
            SET released_at = CURRENT_TIMESTAMP
            WHERE merchant_order_id = ?
        `).run(wrapped.data.merchantOrderId);

        const pending = await request({
            baseUrl,
            path: '/api/payment/status/' + encodeURIComponent(first.data.merchantOrderId),
        });
        assert.equal(pending.status, 200, pending.raw);
        assert.equal(pending.data.provider, 'manual');
        assert.equal(pending.data.status, 'PENDING');
        assert.equal(pending.data.fullAmount, 50001);
        assert.match(pending.data.statusMessage, /konfirmasi manual admin/);

        const paid = markPaymentPaid(db, {
            merchantOrderId: first.data.merchantOrderId,
            fullAmount: first.data.fullAmount,
            source: 'admin-test',
            actorId: 2,
            rawDetails: { note: 'manual route smoke' },
        });
        assert.equal(paid.success, true);

        const active = await request({ baseUrl, path: '/api/payment/active-packages' });
        assert.equal(active.status, 200, active.raw);
        assert.deepStrictEqual(active.data, ['Tryout Manual Test', 'tryout-manual-test']);

        const invoices = await request({ baseUrl, path: '/api/payment/invoices' });
        assert.equal(invoices.status, 200, invoices.raw);
        assert.equal(invoices.data.length, 3);
        assert.equal(invoices.data[0].merchantOrderId, wrapped.data.merchantOrderId);
        assert.equal(invoices.data.some((invoice) => invoice.merchantOrderId === first.data.merchantOrderId), true);
        assert.equal(Object.hasOwn(invoices.data[0], 'qrImageDataUrl'), false);
        assert.equal(Object.hasOwn(invoices.data[0], 'email'), false);

        sessionUserId = 3;
        const otherUserInvoices = await request({ baseUrl, path: '/api/payment/invoices' });
        assert.equal(otherUserInvoices.status, 200, otherUserInvoices.raw);
        assert.deepStrictEqual(otherUserInvoices.data, []);

        sessionUserId = 1;
        const guestInvoices = await request({ baseUrl, path: '/api/payment/invoices' });
        assert.equal(guestInvoices.status, 401, guestInvoices.raw);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        db.close();
    }

    console.log('Manual payment route smoke passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
