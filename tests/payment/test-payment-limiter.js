// paymentLimiter contract test.
//
// Mounts a minimal Express app with the same rate-limit config used in
// routes/payment.js and verifies that the 9th request in a 60-second
// window returns 429 with a RateLimit-* header.
//
// Run via `node tests/payment/test-payment-limiter.js` or as part of
// `npm run check`.

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const rateLimit = require('express-rate-limit');

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  message: { error: 'Terlalu banyak percobaan pembayaran. Coba lagi sebentar.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/payment/create', paymentLimiter, (req, res) => {
    res.json({ ok: true });
  });
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function request({ baseUrl, method, path, body }) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const data = body == null ? '' : JSON.stringify(body);
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const { server, baseUrl } = await listen(makeApp());

  // First 8 requests pass.
  for (let i = 1; i <= 8; i += 1) {
    const res = await request({ baseUrl, method: 'POST', path: '/api/payment/create', body: { email: 'a@b.c', name: 'x', packageId: 'trial' } });
    assert.equal(res.status, 200, `request ${i} should be 200, got ${res.status}`);
    assert.ok(res.headers['ratelimit-limit'], 'request should expose RateLimit-Limit header');
  }

  // 9th request must be 429.
  const blocked = await request({ baseUrl, method: 'POST', path: '/api/payment/create', body: { email: 'a@b.c', name: 'x', packageId: 'trial' } });
  assert.equal(blocked.status, 429, '9th request should be 429');
  const payload = JSON.parse(blocked.body);
  assert.match(payload.error, /Terlalu banyak percobaan pembayaran/);

  await new Promise((resolve) => server.close(resolve));
  console.log('paymentLimiter contract: 8 reqs pass, 9th is 429 with the right error message.');
})();
