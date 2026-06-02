// CSRF secret validation. Throws on production boot if the secret is missing
// or too weak. In dev, generates an ephemeral secret with a loud warning.

const MIN_SECRET_LENGTH = 32;

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function loadCsrfSecret(env = process.env) {
  const explicit = String(env.CSRF_SECRET || '').trim();
  if (explicit) {
    if (explicit.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `CSRF_SECRET harus minimal ${MIN_SECRET_LENGTH} karakter.`
      );
    }
    return explicit;
  }

  const sessionSecret = String(env.SESSION_SECRET || '').trim();
  if (sessionSecret) {
    if (sessionSecret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `SESSION_SECRET harus minimal ${MIN_SECRET_LENGTH} karakter untuk fallback CSRF_SECRET.`
      );
    }
    return require('node:crypto')
      .createHash('sha256')
      .update(`mafiking-csrf:${sessionSecret}`)
      .digest('hex');
  }

  if (env.NODE_ENV === 'production' && !isTruthyEnv(env.CSRF_ALLOW_DEV_FALLBACK)) {
    throw new Error(
      'CSRF_SECRET atau SESSION_SECRET wajib diset di .env untuk production. Generate dengan: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
  // Dev fallback: a per-process random secret. This means session-bound CSRF
  // tokens become invalid across restarts, which is acceptable for local dev.
  const devSecret = require('node:crypto').randomBytes(48).toString('hex');
  console.warn(
    '[csrf] CSRF_SECRET not set — using ephemeral dev secret. Sessions will invalidate on restart.'
  );
  return devSecret;
}

module.exports = {
  loadCsrfSecret,
  MIN_SECRET_LENGTH,
};
