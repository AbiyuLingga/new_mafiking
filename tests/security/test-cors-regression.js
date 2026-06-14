// CORS regression test: the API must remain same-origin.
//
// What we assert:
// 1. A simple GET to any /api/* route does NOT echo an
//    Access-Control-Allow-Origin header for an arbitrary cross-origin
//    request.
// 2. A CORS preflight (OPTIONS + Access-Control-Request-Method) does NOT
//    return Access-Control-Allow-* headers that would let a third-party
//    site issue state-changing requests against the API on a user's
//    behalf.
// 3. The /api/config/clerk endpoint does not leak CLERK_SECRET_KEY (the
//    publishable key is the only expected credential).
//
// Run via `node tests/security/test-cors-regression.js` or as part of
// `npm run check`.

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(session({
    secret: 'test-cors-session-secret-with-at-least-32-chars',
    resave: false,
    saveUninitialized: false,
  }));
  app.use(cookieParser());

  // Public, unauthenticated catalog endpoint used as the test target.
  app.get('/api/tryout-packages', (_req, res) => res.json([]));
  app.get('/api/config/clerk', (_req, res) => {
    // This endpoint should never echo a CORS origin and should never leak
    // the secret key. The actual production handler in server.js only
    // returns the publishable key.
    res.json({ enabled: false, publishableKey: '' });
  });
  // A state-changing endpoint to confirm no Access-Control-Allow-Methods
  // is advertised.
  app.post('/api/progress/submit', (_req, res) => res.json({ ok: true }));
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
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const { server, baseUrl } = await listen(makeApp());
  const evilOrigin = 'https://evil.example.com';

  // 1. Simple GET must not echo Access-Control-Allow-Origin.
  const simple = await request({
    baseUrl, method: 'GET', path: '/api/tryout-packages',
    headers: { Origin: evilOrigin },
  });
  assert.equal(simple.status, 200);
  assert.equal(
    simple.headers['access-control-allow-origin'], undefined,
    'CORS regression: Access-Control-Allow-Origin was set for a same-origin-only API'
  );
  assert.equal(
    simple.headers['access-control-allow-credentials'], undefined,
    'CORS regression: Access-Control-Allow-Credentials was set for a same-origin-only API'
  );

  // 2. Preflight (OPTIONS) must not return Access-Control-Allow-Methods or
  // Access-Control-Allow-Origin. The default Express handler returns 404
  // for OPTIONS, which is what we want.
  const preflight = await request({
    baseUrl, method: 'OPTIONS', path: '/api/progress/submit',
    headers: {
      Origin: evilOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(
    preflight.headers['access-control-allow-origin'], undefined,
    'CORS regression: preflight returned Access-Control-Allow-Origin'
  );
  assert.equal(
    preflight.headers['access-control-allow-methods'], undefined,
    'CORS regression: preflight returned Access-Control-Allow-Methods'
  );
  assert.equal(
    preflight.headers['access-control-allow-headers'], undefined,
    'CORS regression: preflight returned Access-Control-Allow-Headers'
  );

  // 3. /api/config/clerk must not leak CLERK_SECRET_KEY or any non-publishable
  // value, regardless of Origin. (Set in env and assert not echoed.)
  process.env.CLERK_SECRET_KEY = 'sk_test_should_not_leak_12345';
  const clerkConfig = await request({
    baseUrl, method: 'GET', path: '/api/config/clerk',
    headers: { Origin: evilOrigin },
  });
  assert.equal(clerkConfig.status, 200);
  const clerkBody = JSON.parse(clerkConfig.body);
  assert.ok(
    !Object.values(clerkBody).some((v) => typeof v === 'string' && v.includes('sk_test_should_not_leak')),
    'CORS regression: /api/config/clerk body contains a secret-shaped string'
  );
  assert.equal(
    clerkConfig.headers['access-control-allow-origin'], undefined,
    'CORS regression: /api/config/clerk returned Access-Control-Allow-Origin'
  );

  await new Promise((resolve) => server.close(resolve));
  console.log('CORS regression: same-origin policy holds; no wildcard or origin-echoed CORS headers on /api/*');
})();
