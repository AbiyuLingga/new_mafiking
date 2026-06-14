// CSRF coverage test: every state-changing route in the API inventory must
// return 403 when called without a valid X-CSRF-Token (unless the path is in
// CSRF_EXEMPT_PATHS, in which case the test is skipped).
//
// Run via `node tests/security/test-csrf-coverage.js` or as part of `npm run check`.

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const {
  createCsrfProtection,
  CSRF_EXEMPT_PATHS,
} = require('../../server/security/csrf-protection');
const { loadCsrfSecret } = require('../../server/security/csrf-secret');

// Source of truth: docs/security/api-inventory.md. Keep this list in sync
// with the inventory. Each entry is the path; the test fires a POST with a
// minimal JSON body and expects 403 (CSRF rejection) or 204 (exempt path).
const STATE_CHANGING_ROUTES = [
  { method: 'POST', path: '/api/auth/login', body: { username: 'x', password: 'x' } },
  { method: 'POST', path: '/api/auth/register', body: { username: 'x', password: 'xxxxxxxx', display_name: 'x' } },
  { method: 'POST', path: '/api/auth/logout', body: {} },
  { method: 'POST', path: '/api/auth/clerk-onboard', body: { display_name: 'x' } },
  { method: 'POST', path: '/api/auth/profile-onboarding', body: { display_name: 'x' } },
  { method: 'POST', path: '/api/auth/profile', body: { display_name: 'x' } },
  { method: 'POST', path: '/api/auth/avatar', body: {} },
  { method: 'POST', path: '/api/auth/phone-number', body: { phone_number: '+62812345678' } },

  { method: 'POST', path: '/api/progress/submit', body: { problemId: 1, correct: true } },
  { method: 'POST', path: '/api/progress/tryout-attempts', body: { tryoutId: 1, answers: {} } },
  { method: 'PUT', path: '/api/tryouts/free-math-tryout-15/session', body: { sessionToken: 'x', answers: {} } },

  { method: 'POST', path: '/api/correction/transcribe', body: { imageBase64: 'x' } },
  { method: 'POST', path: '/api/correction/evaluate', body: { imageBase64: 'x' } },
  { method: 'POST', path: '/api/correction/profile-summary', body: {} },

  { method: 'POST', path: '/api/payment/create', body: { packageId: 'x', email: 'a@b.c', name: 'x' } },

  { method: 'POST', path: '/api/admin/import/draft', body: {} },
  { method: 'POST', path: '/api/admin/import/commit', body: {} },
  { method: 'POST', path: '/api/admin/chapters', body: { name: 'x' } },
  { method: 'PUT', path: '/api/admin/chapters/1', body: { name: 'x' } },
  { method: 'DELETE', path: '/api/admin/chapters/1', body: {} },
  { method: 'POST', path: '/api/admin/subtopics', body: { name: 'x' } },
  { method: 'POST', path: '/api/admin/problems', body: { prompt: 'x' } },
  { method: 'PUT', path: '/api/admin/settings/tryout-packages-access', body: { enabled: true } },
  { method: 'POST', path: '/api/admin/users/2/role', body: { role: 'user' } },
  { method: 'DELETE', path: '/api/admin/users/2', body: {} },
];

function makeApp() {
  const app = express();
  const { csrfProtection, csrfTokenRoute } = createCsrfProtection({
    env: { NODE_ENV: 'test' },
    secret: 'test-csrf-secret-with-at-least-32-chars',
  });

  app.use(express.json({ limit: '100kb' }));
  app.use(session({
    secret: 'test-session-secret-with-at-least-32-chars',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', secure: false },
  }));
  app.use(cookieParser());
  app.get('/api/csrf-token', csrfTokenRoute);
  app.use(csrfProtection);

  // Stub handlers — we only care that the CSRF layer rejects, not the route logic.
  const stub = (_req, res) => res.json({ ok: true });
  for (const r of STATE_CHANGING_ROUTES) {
    app[r.method.toLowerCase()](r.path, stub);
  }

  // Exempt paths — handlers are wired so we can prove they bypass CSRF.
  for (const path of CSRF_EXEMPT_PATHS) {
    if (path === '/api/performance/vitals') {
      app.post(path, (_req, res) => res.status(204).end());
    } else {
      app.post(path, (_req, res) => res.status(204).end());
    }
  }
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function request({ baseUrl, method, path, body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const data = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data ? data.length : 0,
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const { server, baseUrl } = await listen(makeApp());

  let passed = 0;
  const failures = [];

  for (const r of STATE_CHANGING_ROUTES) {
    const res = await request({ baseUrl, method: r.method, path: r.path, body: r.body });
    if (res.status === 403) {
      passed += 1;
    } else {
      failures.push(`${r.method} ${r.path} → expected 403, got ${res.status}: ${res.body.slice(0, 200)}`);
    }
  }

  // Exempt paths must NOT 403 — they should pass through to the stub.
  for (const path of CSRF_EXEMPT_PATHS) {
    const res = await request({ baseUrl, method: 'POST', path, body: {} });
    if (res.status !== 403) {
      passed += 1;
    } else {
      failures.push(`EXEMPT ${path} → expected not-403, got 403: ${res.body.slice(0, 200)}`);
    }
  }

  await new Promise((resolve) => server.close(resolve));

  if (failures.length) {
    console.error('CSRF coverage failures:');
    for (const f of failures) console.error('  -', f);
    process.exit(1);
  }
  console.log(`CSRF coverage: ${passed}/${STATE_CHANGING_ROUTES.length + CSRF_EXEMPT_PATHS.size} routes behave as expected`);
})();
