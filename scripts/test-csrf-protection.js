const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const {
  createCsrfProtection,
  csrfCookieName,
  shouldSkipCsrf,
} = require('../lib/csrf-protection');
const { loadCsrfSecret } = require('../lib/csrf-secret');

function createTestApp() {
  const app = express();
  const { csrfProtection, csrfTokenRoute } = createCsrfProtection({
    env: { NODE_ENV: 'test' },
    secret: 'test-csrf-secret-with-at-least-32-chars',
  });

  app.use(express.json());
  app.use(session({
    secret: 'test-session-secret-with-at-least-32-chars',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
    },
  }));
  app.use(cookieParser());
  app.get('/api/csrf-token', csrfTokenRoute);
  app.use(csrfProtection);
  app.post('/api/state-change', (_req, res) => res.json({ ok: true }));
  app.post('/api/payment/callback', (_req, res) => res.status(204).end());
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function mergeCookies(existing, setCookieHeaders) {
  const jar = new Map();
  for (const cookie of String(existing || '').split(';')) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) jar.set(name, rest.join('='));
  }
  for (const header of setCookieHeaders || []) {
    const [pair] = String(header).split(';');
    const [name, ...rest] = pair.trim().split('=');
    if (name) jar.set(name, rest.join('='));
  }
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

function request({ baseUrl, method = 'GET', path, body, cookie = '', headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const url = new URL(path, baseUrl);
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const json = text ? JSON.parse(text) : {};
        resolve({
          status: res.statusCode,
          body: json,
          setCookie: res.headers['set-cookie'] || [],
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  assert.equal(csrfCookieName({ NODE_ENV: 'production' }), '__Host-mafiking.csrf-token');
  assert.equal(csrfCookieName({ NODE_ENV: 'development' }), 'mafiking.csrf-token');
  assert.equal(shouldSkipCsrf({ path: '/api/payment/callback' }), true);
  assert.equal(shouldSkipCsrf({ path: '/api/state-change' }), false);

  assert.throws(
    () => loadCsrfSecret({ NODE_ENV: 'production' }),
    /CSRF_SECRET atau SESSION_SECRET wajib diset/,
  );
  assert.throws(
    () => loadCsrfSecret({ NODE_ENV: 'production', CSRF_SECRET: 'too-short' }),
    /minimal 32 karakter/,
  );
  assert.throws(
    () => loadCsrfSecret({ NODE_ENV: 'production', SESSION_SECRET: 'too-short' }),
    /SESSION_SECRET harus minimal 32 karakter/,
  );
  assert.equal(
    loadCsrfSecret({ NODE_ENV: 'production', SESSION_SECRET: 'session-secret-with-at-least-32-chars' }).length,
    64,
    'SESSION_SECRET fallback derives a sha256 CSRF secret',
  );

  const { server, baseUrl } = await listen(createTestApp());
  let cookie = '';
  try {
    const rejected = await request({
      baseUrl,
      method: 'POST',
      path: '/api/state-change',
      body: { ok: true },
    });
    assert.equal(rejected.status, 403, 'state-changing request without token is rejected');
    assert.equal(rejected.body.code, 'EBADCSRFTOKEN');

    const tokenResponse = await request({ baseUrl, path: '/api/csrf-token' });
    cookie = mergeCookies(cookie, tokenResponse.setCookie);
    assert.equal(tokenResponse.status, 200, 'csrf token endpoint returns 200');
    assert.ok(tokenResponse.body.csrfToken, 'csrf token returned');
    assert.ok(cookie.includes('connect.sid='), 'session cookie was issued');
    assert.ok(cookie.includes('mafiking.csrf-token='), 'csrf cookie was issued');

    const accepted = await request({
      baseUrl,
      method: 'POST',
      path: '/api/state-change',
      body: { ok: true },
      cookie,
      headers: { 'X-CSRF-Token': tokenResponse.body.csrfToken },
    });
    cookie = mergeCookies(cookie, accepted.setCookie);
    assert.equal(accepted.status, 200, 'valid token is accepted');
    assert.deepEqual(accepted.body, { ok: true });

    const invalid = await request({
      baseUrl,
      method: 'POST',
      path: '/api/state-change',
      body: { ok: true },
      cookie,
      headers: { 'X-CSRF-Token': 'invalid-token' },
    });
    assert.equal(invalid.status, 403, 'invalid token is rejected');
    assert.equal(invalid.body.code, 'EBADCSRFTOKEN');

    const callback = await request({
      baseUrl,
      method: 'POST',
      path: '/api/payment/callback',
      body: { merchantOrderId: 'MFK-test' },
    });
    assert.equal(callback.status, 204, 'payment callback is exempt');

    console.log('CSRF protection tests passed');
  } finally {
    server.close();
  }
})().catch((error) => {
  console.error('CSRF protection tests failed:', error);
  process.exit(1);
});
