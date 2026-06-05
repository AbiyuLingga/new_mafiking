const crypto = require('crypto');

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function generateVerificationToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function tokenExpiryDate(now = new Date()) {
  return new Date(now.getTime() + TOKEN_TTL_MS).toISOString();
}

function canResend(lastSentAtIso, now = new Date()) {
  if (!lastSentAtIso) return { allowed: true, cooldownMs: 0 };
  const sentAt = new Date(lastSentAtIso).getTime();
  if (!Number.isFinite(sentAt)) return { allowed: true, cooldownMs: 0 };
  const elapsed = now.getTime() - sentAt;
  const remaining = RESEND_COOLDOWN_MS - elapsed;
  if (remaining > 0) return { allowed: false, cooldownMs: remaining };
  return { allowed: true, cooldownMs: 0 };
}

function createOrRefreshVerification(db, userId, now = new Date()) {
  const token = generateVerificationToken();
  const hash = hashVerificationToken(token);
  const expiresAt = tokenExpiryDate(now);
  db.prepare(`
    UPDATE users
    SET email_verification_token_hash = ?,
        email_verification_expires_at = ?,
        email_verification_last_sent_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hash, expiresAt, userId);
  return { token, hash, expiresAt };
}

function consumeVerificationToken(db, token, now = new Date()) {
  const hash = hashVerificationToken(token);
  const row = db.prepare(`
    SELECT id, role, email_verified_at, email_verification_expires_at
    FROM users
    WHERE email_verification_token_hash = ?
  `).get(hash);
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.email_verified_at) return { ok: false, reason: 'already_verified' };
  if (!row.email_verification_expires_at || new Date(row.email_verification_expires_at).getTime() < now.getTime()) {
    return { ok: false, reason: 'expired', userId: row.id };
  }
  db.prepare(`
    UPDATE users
    SET email_verified_at = CURRENT_TIMESTAMP,
        email_verification_token_hash = NULL,
        email_verification_expires_at = NULL
    WHERE id = ?
  `).run(row.id);
  return { ok: true, userId: row.id, role: row.role || 'user' };
}

module.exports = {
  TOKEN_BYTES,
  TOKEN_TTL_MS,
  RESEND_COOLDOWN_MS,
  generateVerificationToken,
  hashVerificationToken,
  tokenExpiryDate,
  canResend,
  createOrRefreshVerification,
  consumeVerificationToken,
};
