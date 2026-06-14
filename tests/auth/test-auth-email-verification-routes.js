const assert = require('assert');
const http = require('http');
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');

process.env.MAIL_DRY_RUN = 'true';
process.env.PUBLIC_BASE_URL = 'http://127.0.0.1';

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      fakultas TEXT DEFAULT '',
      phone_number TEXT DEFAULT '',
      semester INTEGER,
      jurusan TEXT DEFAULT '',
      mapel_prioritas TEXT NOT NULL DEFAULT '[]',
      referral_source TEXT DEFAULT '',
      onboarding_completed_at DATETIME,
      clerk_id TEXT,
      auth_provider TEXT NOT NULL DEFAULT 'local',
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      badge_tier INTEGER DEFAULT 0,
      streak_days INTEGER DEFAULT 0,
      highest_streak INTEGER DEFAULT 0,
      last_active DATE,
      email_verified_at DATETIME,
      email_verification_token_hash TEXT,
      email_verification_expires_at DATETIME,
      email_verification_last_sent_at DATETIME
    )
  `);
  return db;
}

function request({ baseUrl, method = 'GET', path, body, cookie }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: raw ? JSON.parse(raw) : {},
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const db = createDb();
  const app = express();
  app.locals.db = db;
  app.use(express.json());
  app.use(session({
    secret: 'test-secret-32-characters-long',
    resave: false,
    saveUninitialized: false,
  }));
  app.use('/api/auth', require('../../routes/auth'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const originalInfo = console.info;
  let verifyUrl = '';
  console.info = (message) => {
    const text = String(message || '');
    if (text.includes('[auth:verify-email:dry-run]')) {
      verifyUrl = text.replace(/^.*\[auth:verify-email:dry-run\]\s*/, '').trim();
    }
  };

  try {
    const email = `verify-${Date.now()}@example.com`;
    const password = 'password123';
    const register = await request({
      baseUrl,
      method: 'POST',
      path: '/api/auth/register',
      body: { email, password },
    });
    assert.equal(register.status, 200);
    assert.equal(register.body.requiresVerification, true);
    assert.equal(register.headers['set-cookie'], undefined, 'register must not set a session cookie');
    assert.ok(verifyUrl.includes('/verify-email?token='));

    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(email);
    assert.ok(row.email_verification_token_hash, 'hash saved');
    assert.ok(!verifyUrl.includes(row.email_verification_token_hash), 'plain URL does not contain stored hash');

    const registerAgain = await request({
      baseUrl,
      method: 'POST',
      path: '/api/auth/register',
      body: { email, password },
    });
    assert.equal(registerAgain.status, 200);
    assert.equal(registerAgain.body.requiresVerification, true, 'pending unverified register returns verification flow');

    const unknownLogin = await request({
      baseUrl,
      method: 'POST',
      path: '/api/auth/login',
      body: { username: `missing-${Date.now()}@example.com`, password },
    });
    assert.equal(unknownLogin.status, 401);
    assert.equal(unknownLogin.body.error, 'Email belum terdaftar');

    const loginBlocked = await request({
      baseUrl,
      method: 'POST',
      path: '/api/auth/login',
      body: { username: email, password },
    });
    assert.equal(loginBlocked.status, 200);
    assert.equal(loginBlocked.body.requiresVerification, true);
    assert.equal(loginBlocked.headers['set-cookie'], undefined, 'blocked login must not set a session cookie');

    const token = new URL(verifyUrl).searchParams.get('token');
    const passiveGet = await request({ baseUrl, path: `/api/auth/verify-email?token=${encodeURIComponent(token)}` });
    assert.equal(passiveGet.status, 405, 'passive GET must not verify');
    assert.equal(db.prepare('SELECT email_verified_at FROM users WHERE username = ?').get(email).email_verified_at, null);
    const stolenHash = await request({
      baseUrl,
      method: 'POST',
      path: '/api/auth/verify-email',
      body: { token: row.email_verification_token_hash },
    });
    assert.equal(stolenHash.status, 400, 'hash must not verify');
    const verified = await request({
      baseUrl,
      method: 'POST',
      path: '/api/auth/verify-email',
      body: { token },
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.ok, true);
    assert.equal(verified.body.email, email);
    assert.ok(verified.headers['set-cookie'], 'verified request sets session cookie');
    assert.ok(db.prepare('SELECT email_verified_at FROM users WHERE username = ?').get(email).email_verified_at);

    const loginOk = await request({
      baseUrl,
      method: 'POST',
      path: '/api/auth/login',
      body: { username: email, password },
    });
    assert.equal(loginOk.status, 200);
    assert.equal(loginOk.body.ok, true);

    const wrongPassword = await request({
      baseUrl,
      method: 'POST',
      path: '/api/auth/login',
      body: { username: email, password: 'wrong-password' },
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.error, 'Email atau password salah');

    const resendUnknown = await request({
      baseUrl,
      method: 'POST',
      path: '/api/auth/resend-verification',
      body: { email: 'unknown@example.com' },
    });
    assert.equal(resendUnknown.status, 200);
    assert.equal(resendUnknown.body.ok, true);
    console.log('ok');
  } finally {
    console.info = originalInfo;
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
