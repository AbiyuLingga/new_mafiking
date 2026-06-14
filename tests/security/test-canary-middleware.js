// Canary middleware contract test.
//
// Run via `node tests/security/test-canary-middleware.js` or as part of
// `npm run check`.

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createCanaryMiddleware } = require('../../server/security/canary');

function makeApp(paths) {
  const app = express();
  app.use(express.json());
  app.use(createCanaryMiddleware({ env: { CANARY_PATHS: paths } }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/admin/dump-db', (_req, res) => res.json({ real: true }));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function request({ baseUrl, method, path, headers = {} }) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const req = http.request({
      method, hostname: url.hostname, port: url.port, path: url.pathname, headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const { server, baseUrl } = await listen(makeApp('/api/admin/dump-db,/api/admin/shell'));

  // Real route is not flagged.
  const real = await request({ baseUrl, method: 'GET', path: '/api/health' });
  assert.equal(real.status, 200, 'real route should pass through');

  // Canary path returns 404.
  const canary = await request({ baseUrl, method: 'GET', path: '/api/admin/dump-db' });
  assert.equal(canary.status, 404, 'canary path should return 404');
  assert.match(canary.body, /Not found/);

  // Second canary path.
  const canary2 = await request({ baseUrl, method: 'GET', path: '/api/admin/shell' });
  assert.equal(canary2.status, 404, 'second canary path should return 404');

  // Non-canary admin-shaped path passes through (no real route = 404 by Express).
  const miss = await request({ baseUrl, method: 'GET', path: '/api/admin/users' });
  assert.equal(miss.status, 404, 'non-canary admin path should not be flagged (returns 404 by default Express)');

  await new Promise((resolve) => server.close(resolve));
  console.log('Canary middleware: 4 assertions passed.');
})();
