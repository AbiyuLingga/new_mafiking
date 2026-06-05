const assert = require('assert');
const Database = require('better-sqlite3');
const {
  TOKEN_TTL_MS,
  RESEND_COOLDOWN_MS,
  generateVerificationToken,
  hashVerificationToken,
  tokenExpiryDate,
  canResend,
  createOrRefreshVerification,
  consumeVerificationToken,
} = require('../lib/email-verification');

let assertions = 0;
function ok(value, message) {
  assert.ok(value, message);
  assertions += 1;
}
function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      email_verified_at DATETIME,
      email_verification_token_hash TEXT,
      email_verification_expires_at DATETIME,
      email_verification_last_sent_at DATETIME
    )
  `);
  return db;
}

const token = generateVerificationToken();
equal(token.length, 43, 'token is 43 chars');
ok(/^[A-Za-z0-9_-]+$/.test(token), 'token is base64url');
const hash = hashVerificationToken(token);
equal(hash.length, 64, 'hash is 64 chars');
equal(hashVerificationToken(token), hash, 'hash is deterministic');
ok(/^[a-f0-9]{64}$/.test(hash), 'hash is lowercase hex');

const now = new Date('2026-06-05T00:00:00.000Z');
equal(new Date(tokenExpiryDate(now)).getTime() - now.getTime(), TOKEN_TTL_MS, 'expiry is 24h');
equal(canResend(null, now).allowed, true, 'missing last sent can resend');
equal(canResend(now.toISOString(), now).allowed, false, 'fresh last sent cannot resend');
ok(canResend(now.toISOString(), now).cooldownMs <= RESEND_COOLDOWN_MS, 'fresh cooldown present');
equal(canResend(new Date(now.getTime() - RESEND_COOLDOWN_MS - 1).toISOString(), now).allowed, true, 'old last sent can resend');

{
  const db = createDb();
  const info = db.prepare("INSERT INTO users (username, password_hash, display_name) VALUES ('a@example.com', 'hash', 'A')").run();
  const result = createOrRefreshVerification(db, Number(info.lastInsertRowid), now);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  ok(row.email_verification_token_hash, 'verification hash saved');
  ok(row.email_verification_token_hash !== result.token, 'plain token not stored');
  equal(row.email_verification_token_hash, hashVerificationToken(result.token), 'stored hash matches token');
  equal(row.email_verification_expires_at, tokenExpiryDate(now), 'expiry saved');
  const consumed = consumeVerificationToken(db, result.token, now);
  equal(consumed.ok, true, 'valid token consumed');
  equal(consumed.userId, Number(info.lastInsertRowid), 'consume returns user id');
  const verified = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  ok(verified.email_verified_at, 'verified timestamp set');
  equal(verified.email_verification_token_hash, null, 'hash cleared');
  equal(consumeVerificationToken(db, 'wrong-token', now).reason, 'invalid', 'wrong token invalid');
}

{
  const db = createDb();
  const info = db.prepare("INSERT INTO users (username, password_hash, display_name) VALUES ('b@example.com', 'hash', 'B')").run();
  const result = createOrRefreshVerification(db, Number(info.lastInsertRowid), now);
  const expired = consumeVerificationToken(db, result.token, new Date(now.getTime() + TOKEN_TTL_MS + 1));
  equal(expired.ok, false, 'expired token rejected');
  equal(expired.reason, 'expired', 'expired reason returned');
}

{
  const db = createDb();
  const token = generateVerificationToken();
  db.prepare(`
    INSERT INTO users (username, password_hash, display_name, email_verified_at, email_verification_token_hash, email_verification_expires_at)
    VALUES ('c@example.com', 'hash', 'C', CURRENT_TIMESTAMP, ?, ?)
  `).run(hashVerificationToken(token), tokenExpiryDate(now));
  const consumed = consumeVerificationToken(db, token, now);
  equal(consumed.ok, false, 'already verified token rejected');
  equal(consumed.reason, 'already_verified', 'already verified reason returned');
}

console.log(`${assertions} assertions passed`);
