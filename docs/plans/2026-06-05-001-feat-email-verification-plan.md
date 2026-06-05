---
title: "feat: Email Verification for Email/Password Signup"
status: implemented
plan_depth: Standard
created: 2026-06-05
origin: User request — confirm new local-auth accounts by sending a verification link to the supplied email before allowing the user to log in.
---

# feat: Email Verification for Email/Password Signup

## Problem Frame

Mafiking's local email/password signup (`POST /api/auth/register`) immediately sets a session for the new user, with no email verification. A user can sign up with someone else's email, log in, and consume that other person's free try-out quota. We need to:

1. Send a verification link to the supplied email before granting session access.
2. **Hard block** login for unverified local users (with a resend-cooldown safety net so users are not locked out if the email is delayed).
3. Bypass the check for users whose email was already verified through another path (Clerk/Google, Clerk-linked, or pre-seeded admin).

### Key Constraints

- **Local auth only.** Email verification is only enforced for `auth_provider = 'local'`. Clerk (`'clerk'`), Clerk-linked (`'linked'`), and pre-seeded admins bypass automatically because Clerk already verified the email at Google OAuth time.
- **Gmail SMTP via App Password.** `nodemailer` is already a declared dependency in `package.json` (line 65) but is currently unused. We will use it to talk to `smtp.gmail.com:465` with an App Password. The sender is `mafikingsolusitpb@gmail.com` with the friendly name `Mafiking`.
- **SPA route for verify-email page.** The verification link `https://mafiking.com/#verify-email?token=...` is rendered as a Lobby auth screen, matching the existing SPA architecture (no separate static HTML file).
- **No breaking changes for Clerk users.** All existing Clerk/Google sign-in paths must continue to work without sending any email.
- **Safety tokens.** The plain token is only ever present in the email body / verification URL. The database stores `sha256(token)` only. A leaked database row cannot be replayed to verify arbitrary emails.
- **No enumeration.** `POST /api/auth/resend-verification` returns a generic success even when the email does not exist, to avoid letting an attacker probe which addresses have accounts.

---

## Scope Boundaries

### In Scope

- Schema additions: 4 new columns on `users` (`email_verified_at`, `email_verification_token_hash`, `email_verification_expires_at`, `email_verification_last_sent_at`).
- Server-side migrations: extend `server.js` migration array to add the columns to existing databases.
- New helpers:
  - `lib/mailer.js` — nodemailer wrapper with Gmail SMTP config, pool, retry, dry-run mode.
  - `lib/email-templates.js` — HTML + plain-text verification email template, Mafiking brand.
  - `lib/email-verification.js` — token generation, hashing, cooldown logic.
- Route changes in `routes/auth.js`:
  - `POST /api/auth/register` — generate token, save hash, send email, **do not** set session. Return `requiresVerification`.
  - `POST /api/auth/login` — after password check, block local unverified users and trigger a resend. Skip block for admin, Clerk, and linked users.
  - `POST /api/auth/resend-verification` (NEW) — generate new token, send email, return cooldown.
  - `GET /api/auth/verify-email?token=...` (NEW) — consume token, set `email_verified_at`, create session.
- Frontend changes:
  - `src/lobby.jsx` — new `AuthScreen` mode `verify-email` with resend button + cooldown countdown + "Buka Gmail" CTA.
  - `src/app.jsx` — extend `parseAppLocation` to handle `#verify-email?token=...` deep links; pass `authMode="verify-email"` to Lobby.
- Auto-verify pre-seeded admin (`123`/`135`) in `server.js`.
- Env var docs in `.env.example`.
- Tests in `scripts/test-email-verification.js` and `scripts/test-mailer.js`.

### Out of Scope

- Change email after signup (a separate `change email` flow can be added later).
- Magic-link login (the link sent in the email is verification-only, not a login token).
- SMS or other channels.
- Refactoring the existing Clerk/Google integration.
- Replacing bcrypt with a different password hash.

---

## Files to Add or Change

| File | Action | Purpose |
|------|--------|---------|
| `db/schema.sql` | Modify | Add 4 `ALTER TABLE users` columns for verification state |
| `server.js` | Modify | Extend migration array; auto-verify pre-seeded admin |
| `lib/mailer.js` | New | Nodemailer wrapper for Gmail SMTP, with dry-run + retry |
| `lib/email-templates.js` | New | HTML + plain-text email template (Mafiking branded) |
| `lib/email-verification.js` | New | Token generation, SHA-256 hashing, cooldown helpers |
| `routes/auth.js` | Modify | Add resend, verify-email endpoints; gate register + login |
| `src/lobby.jsx` | Modify | New `AuthScreen` mode `verify-email` with resend + cooldown UI |
| `src/app.jsx` | Modify | Parse `#verify-email?token=...` from URL hash |
| `.env.example` | Modify | Document `SMTP_*`, `MAIL_FROM_NAME`, `PUBLIC_BASE_URL` |
| `AGENTS.md` | Modify | Add note about email verification policy + Gmail App Password |
| `scripts/test-email-verification.js` | New | Unit tests for token gen, hash, expiry, cooldown, route behaviors |
| `scripts/test-mailer.js` | New | Tests for mailer config, dry-run mode, retry behavior |
| `docs/plans/2026-06-05-001-feat-email-verification-plan.md` | New | This plan file |

---

## Design Decisions

### 1. Hard Block Login (with Resend Cooldown)

When a `local` user logs in but `email_verified_at IS NULL`:

1. The server does **not** create a session.
2. It generates a fresh verification token (re-using the existing one if not expired; resetting cooldown to 60 s in either case) and sends a new email.
3. The response is `{ ok: false, requiresVerification: true, email, displayName, cooldownSeconds }`.
4. The frontend redirects to the `verify-email` screen and shows the resend UI.

Why hard block rather than soft banner: the user's stated goal is to ensure the email is genuinely owned. A banner can be dismissed; a hard block cannot. The 60 s cooldown prevents an attacker from spamming the victim's inbox via the resend endpoint.

### 2. Token: 32 bytes random, SHA-256 stored, 24 h expiry

- Generate: `crypto.randomBytes(32).toString('base64url')` (43 chars).
- Store: `sha256(token).hex`.
- Expire: 24 hours.
- Single-use: the row's `email_verification_token_hash` is cleared on success.

The plain token is the **only** way to verify, and it lives only in the email or the URL the user clicks. A read-only DB leak does not let an attacker verify arbitrary emails.

### 3. Gmail SMTP via App Password

- SMTP config: `smtp.gmail.com:465` SSL, user `mafikingsolusitpb@gmail.com`, App Password from `https://myaccount.google.com/apppasswords`.
- Sender header: `From: Mafiking <mafikingsolusitpb@gmail.com>`. Friendly name reduces "spam-like" appearance.
- Pool + retry: nodemailer's built-in pool. On `ECONNRESET`, retry the same message once after 250 ms.
- Dry-run: when `MAIL_DRY_RUN=true`, do not open an SMTP connection. Instead, log the token to `console.info` so devs can paste the URL directly during testing.
- All sent messages are logged with masked recipient and subject (never the body).

### 4. SPA Deep Link for Verify

The email contains a link of the form:

```
https://mafiking.com/#verify-email?token=<plain token>
```

On open, `MAFIKING.html` loads → `app.jsx` `parseAppLocation` (currently lines 705-723) is extended to detect a `verify-email` hash. The token is extracted, `authMode` is set to `"verify-email-token"`, and the Lobby is told to render the `AuthScreen` in a "verifying" state. The `AuthScreen` fires `GET /api/auth/verify-email?token=...` on mount, then transitions to either:

- **Success** → "Email terverifikasi ✓" + "Lanjut ke Mafiking" button → `navigate("belajar")`.
- **Failure (expired / invalid / already used)** → "Link tidak valid atau kadaluarsa" + "Kirim ulang" + "Kembali ke login".

For first-time signup, the same `verify-email` mode is used, but the screen just waits for the user to open the email. The resend button is always present (subject to cooldown).

### 5. Bypass Rules

Email verification is bypassed for users where any of these is true:

- `role = 'admin'` (pre-seeded admin or future admin accounts).
- `auth_provider IN ('clerk', 'linked')` — Clerk already verified the email at Google OAuth.
- `password_hash = 'none'` (guest users) — they cannot log in by email/password, so this branch is unreachable in practice.

This keeps the new check from interfering with the existing Clerk Google sign-in, which is the primary flow in production.

### 6. Rate Limiting

- `register`: 5 per IP per 10 minutes (in-memory map, mirroring the existing `loginAttempts` pattern at `routes/auth.js` lines 85-94).
- `resend-verification`: 3 per IP per 10 minutes + 60 s cooldown per user.
- `verify-email`: 10 per IP per 10 minutes (a user may click the link several times if the SPA re-mounts).

All counters use the same `Map<key, { count, firstAttempt }>` shape; reset window is rolling.

---

## Detailed Changes

### 1. `db/schema.sql`

Append to the bottom (or, equivalently, modify the `users` table block in place; the live DB is migrated by `server.js`):

```sql
ALTER TABLE users ADD COLUMN email_verified_at DATETIME;
ALTER TABLE users ADD COLUMN email_verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN email_verification_expires_at DATETIME;
ALTER TABLE users ADD COLUMN email_verification_last_sent_at DATETIME;
```

### 2. `server.js`

**Migrations array (around line 74-171):** add four entries, idempotent like the existing ones:

```js
{ name: 'users.email_verified_at', sql: 'ALTER TABLE users ADD COLUMN email_verified_at DATETIME' },
{ name: 'users.email_verification_token_hash', sql: 'ALTER TABLE users ADD COLUMN email_verification_token_hash TEXT' },
{ name: 'users.email_verification_expires_at', sql: 'ALTER TABLE users ADD COLUMN email_verification_expires_at DATETIME' },
{ name: 'users.email_verification_last_sent_at', sql: 'ALTER TABLE users ADD COLUMN email_verification_last_sent_at DATETIME' },
```

**Pre-seeded admin (`ensureFixedAdminUser`, lines 788-801):** after the `INSERT OR IGNORE` for the `123`/`135` admin, run:

```js
db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE username = ? AND role = ?').run('123', 'admin');
```

### 3. `lib/email-verification.js` (NEW)

Exports:

```js
const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;          // 24 hours
const RESEND_COOLDOWN_MS = 60 * 1000;              // 60 seconds

function generateVerificationToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function tokenExpiryDate(now = new Date()) {
  return new Date(now.getTime() + TOKEN_TTL_MS).toISOString();
}

function canResend(lastSentAtIso) {
  if (!lastSentAtIso) return { allowed: true, cooldownMs: 0 };
  const elapsed = Date.now() - new Date(lastSentAtIso).getTime();
  const remaining = RESEND_COOLDOWN_MS - elapsed;
  if (remaining > 0) return { allowed: false, cooldownMs: remaining };
  return { allowed: true, cooldownMs: 0 };
}

function createOrRefreshVerification(db, userId) {
  const token = generateVerificationToken();
  const hash = hashVerificationToken(token);
  db.prepare(`
    UPDATE users SET
      email_verification_token_hash = ?,
      email_verification_expires_at = ?,
      email_verification_last_sent_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hash, tokenExpiryDate(), userId);
  return { token, hash, expiresAt: tokenExpiryDate() };
}

function consumeVerificationToken(db, token) {
  const hash = hashVerificationToken(token);
  const row = db.prepare(`
    SELECT id, email_verified_at, email_verification_expires_at
    FROM users
    WHERE email_verification_token_hash = ?
  `).get(hash);
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.email_verified_at) return { ok: false, reason: 'already_verified' };
  if (!row.email_verification_expires_at || new Date(row.email_verification_expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  db.prepare(`
    UPDATE users SET
      email_verified_at = CURRENT_TIMESTAMP,
      email_verification_token_hash = NULL,
      email_verification_expires_at = NULL
    WHERE id = ?
  `).run(row.id);
  return { ok: true, userId: row.id };
}

module.exports = {
  TOKEN_BYTES, TOKEN_TTL_MS, RESEND_COOLDOWN_MS,
  generateVerificationToken, hashVerificationToken, tokenExpiryDate,
  canResend, createOrRefreshVerification, consumeVerificationToken,
};
```

### 4. `lib/email-templates.js` (NEW)

Exports:

```js
const { textXssSafe } = require('./text-sanitize'); // reuse existing sanitizer

function renderVerifyEmail({ displayName, verifyUrl, appUrl }) {
  const safeName = textXssSafe(displayName || 'Sobat Mafiking');
  const subject = 'Konfirmasi email kamu untuk Mafiking';
  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Konfirmasi email Mafiking</title>
</head>
<body style="margin:0;padding:0;background:#0B1221;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#E2E8F0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1221;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1E293B;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 32px 16px 32px;text-align:center;">
          <div style="font-size:24px;font-weight:800;letter-spacing:.08em;color:#FFF44F;">MAFIKING</div>
        </td></tr>
        <tr><td style="padding:8px 32px 8px 32px;text-align:center;">
          <h1 style="margin:0;font-size:22px;line-height:1.3;color:#FFFFFF;">Konfirmasi email kamu</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 0 32px;text-align:center;color:#94A3B8;font-size:15px;line-height:1.6;">
          Hai <strong style="color:#FFFFFF;">${safeName}</strong>, klik tombol di bawah untuk mengaktifkan akun Mafiking kamu dan mulai akses semua soal try out.
        </td></tr>
        <tr><td align="center" style="padding:24px 32px 8px 32px;">
          <a href="${verifyUrl}" style="display:inline-block;background:#FFF44F;color:#0B1326;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:800;font-size:15px;letter-spacing:.02em;">Konfirmasi Email</a>
        </td></tr>
        <tr><td style="padding:8px 32px 16px 32px;text-align:center;color:#64748B;font-size:12px;line-height:1.6;word-break:break-all;">
          Kalau tombol di atas tidak berfungsi, salin dan buka link ini:<br/>
          <a href="${verifyUrl}" style="color:#7DD3FC;text-decoration:underline;">${verifyUrl}</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #1E293B;text-align:center;color:#475569;font-size:11px;line-height:1.6;">
          Link ini berlaku 24 jam. Kalau kamu tidak merasa membuat akun Mafiking, abaikan email ini.<br/>
          &copy; ${new Date().getFullYear()} Mafiking &middot; ${appUrl}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = `Konfirmasi email Mafiking\n\nHai ${safeName},\n\nKlik link berikut untuk mengaktifkan akun kamu:\n${verifyUrl}\n\nLink ini berlaku 24 jam. Kalau kamu tidak merasa membuat akun Mafiking, abaikan email ini.\n\n(c) ${new Date().getFullYear()} Mafiking - ${appUrl}\n`;
  return { subject, html, text };
}

module.exports = { renderVerifyEmail };
```

### 5. `lib/mailer.js` (NEW)

Exports:

```js
const nodemailer = require('nodemailer');

let cachedTransport = null;
let cachedConfig = null;

function getConfig() {
  return {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'mafikingsolusitpb@gmail.com',
    fromName: process.env.MAIL_FROM_NAME || 'Mafiking',
    dryRun: String(process.env.MAIL_DRY_RUN || 'false').toLowerCase() === 'true',
  };
}

function getTransport() {
  const cfg = getConfig();
  if (cfg.dryRun) return null;
  if (cachedTransport && cachedConfig && cachedConfig.host === cfg.host && cachedConfig.port === cfg.port) {
    return cachedTransport;
  }
  if (!cfg.host || !cfg.auth) {
    throw new Error('SMTP not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS)');
  }
  cachedTransport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    tls: { minVersion: 'TLSv1.2' },
  });
  cachedConfig = cfg;
  return cachedTransport;
}

function maskEmail(addr) {
  const s = String(addr || '');
  const at = s.indexOf('@');
  if (at <= 1) return '***';
  return `${s[0]}***${s.slice(at)}`;
}

async function sendMailOnce({ to, subject, html, text }) {
  const cfg = getConfig();
  const from = cfg.fromName ? `"${cfg.fromName}" <${cfg.from}>` : cfg.from;
  if (cfg.dryRun) {
    console.info(`[mailer:dry-run] to=${maskEmail(to)} subject="${subject}"`);
    return { ok: true, dryRun: true };
  }
  const transport = getTransport();
  const info = await transport.sendMail({ from, to, subject, html, text });
  console.info(`[mailer:sent] to=${maskEmail(to)} messageId=${info.messageId || 'n/a'} subject="${subject}"`);
  return { ok: true, messageId: info.messageId || null };
}

async function sendMail(args) {
  try {
    return await sendMailOnce(args);
  } catch (err) {
    if (err && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
      await new Promise((r) => setTimeout(r, 250));
      return await sendMailOnce(args);
    }
    console.error(`[mailer:error] to=${maskEmail(args.to)} code=${err && err.code} msg=${err && err.message}`);
    throw err;
  }
}

module.exports = { sendMail, maskEmail, getConfig };
```

### 6. `routes/auth.js`

#### 6.1 Imports (top of file)

Add:

```js
const { sendMail } = require('../lib/mailer');
const { renderVerifyEmail } = require('../lib/email-templates');
const {
  generateVerificationToken, hashVerificationToken, canResend,
  createOrRefreshVerification, consumeVerificationToken,
  RESEND_COOLDOWN_MS,
} = require('../lib/email-verification');
```

#### 6.2 Helper: sendVerificationEmail (above route handlers)

```js
function buildVerifyUrl(req, token) {
  const base = process.env.PUBLIC_BASE_URL
    || (process.env.NODE_ENV === 'production' ? 'https://mafiking.com' : `${req.protocol}://${req.get('host')}`);
  return `${base.replace(/\/$/, '')}/#verify-email?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail(req, db, user) {
  const { token } = createOrRefreshVerification(db, user.id);
  const verifyUrl = buildVerifyUrl(req, token);
  const appUrl = process.env.PUBLIC_BASE_URL || 'https://mafiking.com';
  const tpl = renderVerifyEmail({
    displayName: user.display_name,
    verifyUrl,
    appUrl,
  });
  try {
    await sendMail({ to: user.username, subject: tpl.subject, html: tpl.html, text: tpl.text });
    return { ok: true };
  } catch (err) {
    console.error('[auth] verification email failed', { username: user.username, code: err && err.code });
    return { ok: false, error: err && err.message };
  }
}
```

#### 6.3 Modify `POST /api/auth/register` (lines 158-207)

- Accept `email` field as alias for `username`.
- Validate email format (basic regex).
- After insert, **do not** set session.
- Generate verification token + send email.
- Return `{ ok: true, requiresVerification: true, email, displayName }`.

Outline:

```js
router.post('/register', async (req, res) => {
  // ... existing validation (XSS, length caps, bcrypt, etc.) ...
  const email = String(req.body.email || req.body.username || '').trim().toLowerCase();
  // ... bcrypt, uniqueness check, INSERT ...
  // Set email_verified_at = NULL (default; just don't write to it).
  await sendVerificationEmail(req, db, info.lastInsertRowid ? { id: info.lastInsertRowid, username: email, display_name } : null);
  // ... but the existing flow uses lastInsertRowid. Keep that.
  res.json({ ok: true, requiresVerification: true, email, displayName });
});
```

Refactor: insert the user, capture `info.lastInsertRowid`, then send verification with `{ id, username: email, display_name }`.

**Do not** call `req.session.userId = ...`.

#### 6.4 Modify `POST /api/auth/login` (lines 97-155)

After `bcrypt.compare` succeeds and the user lookup is valid, before setting the session:

```js
const mustVerify = user.auth_provider === 'local'
  && user.role !== 'admin'
  && !user.email_verified_at;

if (mustVerify) {
  const userRow = db.prepare('SELECT id, username, display_name, email_verified_at, email_verification_last_sent_at FROM users WHERE id = ?').get(user.id);
  const cooldown = canResend(userRow.email_verification_last_sent_at);
  let cooldownSeconds = 0;
  if (cooldown.allowed) {
    await sendVerificationEmail(req, db, { id: userRow.id, username: userRow.username, display_name: userRow.display_name });
    cooldownSeconds = Math.ceil(RESEND_COOLDOWN_MS / 1000);
  } else {
    cooldownSeconds = Math.ceil(cooldown.cooldownMs / 1000);
  }
  return res.json({
    ok: false,
    requiresVerification: true,
    email: userRow.username,
    displayName: userRow.display_name,
    cooldownSeconds,
  });
}

// existing session set + last_active update + return
```

#### 6.5 New `POST /api/auth/resend-verification`

```js
router.post('/resend-verification', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.json({ ok: true, cooldownSeconds: 60 });
  const user = db.prepare(`
    SELECT id, username, display_name, email_verified_at, auth_provider, role,
           email_verification_last_sent_at
    FROM users WHERE username = ?
  `).get(email);
  if (!user || user.email_verified_at || user.auth_provider !== 'local' || user.role === 'admin') {
    return res.json({ ok: true, cooldownSeconds: 60 });
  }
  const cooldown = canResend(user.email_verification_last_sent_at);
  if (!cooldown.allowed) {
    return res.json({ ok: true, cooldownSeconds: Math.ceil(cooldown.cooldownMs / 1000) });
  }
  await sendVerificationEmail(req, db, user);
  return res.json({ ok: true, cooldownSeconds: Math.ceil(RESEND_COOLDOWN_MS / 1000) });
});
```

Rate limit: 3 per IP per 10 min using the existing in-memory counter pattern.

#### 6.6 New `GET /api/auth/verify-email`

```js
router.get('/verify-email', (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).json({ ok: false, reason: 'missing_token' });
  const result = consumeVerificationToken(db, token);
  if (!result.ok) {
    return res.status(400).json({ ok: false, reason: result.reason });
  }
  req.session.userId = result.userId;
  req.session.role = db.prepare('SELECT role FROM users WHERE id = ?').get(result.userId)?.role || 'user';
  res.json({ ok: true, role: req.session.role, redirect: '/' });
});
```

### 7. `src/lobby.jsx`

#### 7.1 `AuthScreen` new prop/state for `verify-email`

Add new mode `verify-email` that the screen can render. The parent (`Lobby` or `AuthScreen` consumer) passes:

- `email` (string, masked)
- `displayName`
- `lastSentAt`
- `cooldownSeconds` (initial value)

New top-level state in `AuthScreen` (or `Lobby`):

```js
const [verifyState, setVerifyState] = useState({ email, displayName, lastSentAt: new Date().toISOString(), cooldownSeconds: 60 });
```

#### 7.2 Verify-email view

Renders when `mode === 'verify-email'`:

- Icon: envelope SVG (inline, `stroke="currentColor"`).
- Heading: "Cek email kamu".
- Sub: `Kami sudah mengirim link konfirmasi ke {email}. Klik link di email untuk mengaktifkan akun dan masuk ke Mafiking.`
- Two buttons:
  - **Buka Gmail** (primary, `<a href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noreferrer">`)
  - **Kirim Ulang** (ghost, disabled if `cooldown > 0`, shows `{N} detik` countdown)
- Small text: "Tidak dapat email? Cek folder spam, atau klik Kirim Ulang untuk mengirim link baru."
- Link kecil: "Pakai email lain" → returns to signup form (`onSwitchMode('signup')`).

#### 7.3 Cooldown countdown

`useEffect` with `setInterval(1000)` that recomputes `cooldownSeconds` from `Date.now() - lastSentAt`. The interval is cleared when `cooldownSeconds <= 0`.

#### 7.4 Resend click handler

```js
async function resend() {
  setResendLoading(true);
  try {
    const res = await MafikingAPI.post('/api/auth/resend-verification', { email: verifyState.email });
    setVerifyState((s) => ({ ...s, lastSentAt: new Date().toISOString(), cooldownSeconds: res.cooldownSeconds || 60 }));
  } catch (err) {
    setError(err.message);
  } finally {
    setResendLoading(false);
  }
}
```

#### 7.5 When user opens the verification link

- The link points to `https://mafiking.com/#verify-email?token=...`.
- `app.jsx` (next section) parses the hash and navigates to lobby with `authMode='verify-email-token'`.
- The lobby (or auth screen) reads the token from the URL and on mount calls `MafikingAPI.get('/api/auth/verify-email?token=' + token)`.
- On `ok: true`: show a success view with a "Lanjut ke Mafiking" button → `onAuthSuccess(...)` then `navigate('belajar')`.
- On `ok: false`: show failure view with "Kirim Ulang" + "Kembali ke login" buttons.

#### 7.6 `handleSubmit` (existing, signup branch)

Currently at lines 123-147. After a successful register response with `requiresVerification: true`, the existing code calls `onSuccess(user, redirect)`. Replace that with:

```js
if (result.requiresVerification) {
  onSwitchMode && onSwitchMode('verify-email');
  setVerifyState({ email: result.email, displayName: result.displayName, lastSentAt: new Date().toISOString(), cooldownSeconds: 60 });
  return;
}
// existing flow (Clerk etc.) unchanged
```

#### 7.7 `Lobby` passes through the new mode

`Lobby` already destructures `authMode` from props (line 4 area). It passes it to `<AuthScreen authMode={authMode} ...>`. Inside `AuthScreen`, the existing pattern is `const isSignup = mode === 'signup' || authMode === 'signup'`. Add a parallel `const isVerifyEmail = mode === 'verify-email' || authMode === 'verify-email';` and conditionally render the new view (skipping the email + password form entirely when `isVerifyEmail` is true).

### 8. `src/app.jsx`

#### 8.1 `parseAppLocation` (lines 705-723)

Extend to handle `verify-email` hash route with query string:

```js
if (parsed.hash && parsed.hash.startsWith('verify-email')) {
  const queryString = parsed.hash.split('?')[1] || '';
  const params = new URLSearchParams(queryString);
  const token = params.get('token') || '';
  return { route: 'lobby', authMode: 'verify-email-token', authState: { token } };
}
```

(For the URL `https://mafiking.com/#verify-email?token=abc`, the `window.location.hash` is `#/verify-email?token=abc` because the SPA prefixes routes with `#/` — adjust parsing to match the project's existing convention. The current implementation likely uses `#/route` and a query string after `?` within the hash, e.g. `#/verify-email?token=abc`. The exact split must match the current code; if the project uses a different hash format, follow it.)

#### 8.2 `Lobby` rendering

Pass `authState` to `Lobby`. The `AuthScreen` reads it and, when `authMode === 'verify-email-token'`, fires the verify-email call once.

```jsx
<AuthScreen
  authMode={authMode}
  authState={authState}
  onSwitchMode={(mode, state) => navigate({ route: 'lobby', authMode: mode, authState: state })}
  onAuthSuccess={handleAuthSuccess}
  ...
/>
```

#### 8.3 `Lobby`'s `onAuthSuccess` already handles redirect

The existing `handleAuthSuccess` (lines 238-251) reads `authRedirect` and navigates accordingly. For the email-verification success, no `authRedirect` is needed — the default behavior (navigate to `belajar`) is correct.

### 9. `.env.example`

Append:

```
# Email (Gmail SMTP via App Password — set 2FA dulu di akun Google kamu)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mafikingsolusitpb@gmail.com
SMTP_PASS=                  # Gmail App Password (16 char). Set di https://myaccount.google.com/apppasswords
MAIL_FROM_NAME=Mafiking
MAIL_DRY_RUN=false          # true di dev: skip SMTP, log link ke console aja

# Base URL untuk link di email
PUBLIC_BASE_URL=https://mafiking.com
```

### 10. `AGENTS.md`

Append a new section under "Security Notes (Phase 0-4, ASVS L2)" or as a new section:

```markdown
## Email Verification (Phase 5+)

- Local email/password signups (`auth_provider = 'local'`) must verify the supplied email before login is allowed.
- Verification is enforced via `users.email_verified_at`. Bypassed for `role = 'admin'`, `auth_provider IN ('clerk','linked')`, and Clerk auto-seeded users.
- The verification link is single-use, 24h expiry, and only its SHA-256 hash is stored in the database.
- Resend cooldown is 60 s per user; the endpoint returns generic success to avoid user enumeration.
- Outbound email is sent via `lib/mailer.js` (Gmail SMTP) using `mafikingsolusitpb@gmail.com`. Requires a Gmail **App Password** (set 2FA on the Google account first).
- The verification landing page is a SPA route: `https://mafiking.com/#verify-email?token=...`.
```

### 11. Tests

#### `scripts/test-email-verification.js`

Pure unit tests (no HTTP):

- `generateVerificationToken()` returns 43-char base64url.
- `hashVerificationToken(token)` is deterministic, 64 hex chars.
- `tokenExpiryDate()` is 24 h from now (within 1 s).
- `canResend(null)` → `{ allowed: true, cooldownMs: 0 }`.
- `canResend(now)` → `{ allowed: false, cooldownMs ≈ 60000 }`.
- `canResend(60 s ago)` → allowed.
- `createOrRefreshVerification` writes a hash (not the plain token) and a 24 h expiry.
- `consumeVerificationToken` with the correct token: clears the hash, sets `email_verified_at`, returns `{ ok: true, userId }`.
- `consumeVerificationToken` with wrong token: returns `{ ok: false, reason: 'invalid' }`.
- `consumeVerificationToken` with expired token: returns `{ ok: false, reason: 'expired' }`.
- `consumeVerificationToken` with already-used token: returns `{ ok: false, reason: 'already_verified' }`.

Each test inserts a fixture user, runs the assertion, and cleans up.

#### `scripts/test-mailer.js`

- With `MAIL_DRY_RUN=true`, `sendMail` does not open any transport; logs `[mailer:dry-run] ...` to console.
- With `MAIL_DRY_RUN=false` and missing SMTP config, `sendMail` throws with the right error message.
- `maskEmail('alice@example.com')` returns `a***@example.com`.

#### Route smoke

Append to existing test files (or create a small test):

- `POST /api/auth/register` for a fresh email: response has `requiresVerification: true`, no `Set-Cookie` set.
- `POST /api/auth/login` with the same credentials before verifying: response `{ ok: false, requiresVerification: true, cooldownSeconds: 60 }`, no `Set-Cookie`.
- `POST /api/auth/login` after verifying: response `{ ok: true, redirect: '/' }`, `Set-Cookie` present.
- `GET /api/auth/verify-email?token=<stolen-hash>`: 400.
- `GET /api/auth/verify-email?token=<valid>`: 200, session created, `email_verified_at` set.
- `POST /api/auth/resend-verification` for a non-existent email: `{ ok: true, cooldownSeconds: 60 }` (no enumeration).
- `POST /api/auth/resend-verification` twice within 60 s: second response has `cooldownSeconds: <remaining>`.

The test file should be self-contained: it can create a fresh SQLite database in `/tmp` for the duration of the test.

---

## Validation Plan

1. `npm run check` — must pass (no syntax errors in the new files, all existing tests pass).
2. `node scripts/test-email-verification.js` — must print "N assertions passed".
3. `node scripts/test-mailer.js` — must print "ok".
4. Manual smoke:
   1. Start the dev server: `npm start`.
   2. Open `http://localhost:3000` in a private browser.
   3. Click "Daftar", fill the form with a real email you control.
   4. Verify the success screen says "Cek email kamu" with a "Buka Gmail" button.
   5. Wait for the email. Click the link. Verify the SPA shows "Email terverifikasi" then routes to `/belajar`.
   6. Log out. Try to log in **before** clicking the link in a new session: confirm you are bounced back to the verify screen.
   7. Wait 60 s; click "Kirim Ulang". Verify the email arrives again.
   8. Open the second email, click the link. Verify you reach the app.
   9. Log out. Log in again. Verify normal login works.
5. Manual smoke for Clerk/Google sign-in (if Clerk is configured):
   1. Sign in with Google. Verify no verification email is sent and login is immediate.
6. CSP / email-content check:
   1. Inspect a captured email; verify the body is well-formed HTML, the link uses `https://mafiking.com`, and there are no tracking pixels.
7. Anti-enumeration:
   1. `POST /api/auth/resend-verification` for a non-existent email returns `{ ok: true, cooldownSeconds: 60 }`.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Gmail SMTP throttles or blocks the account | Use App Password, keep volume low, and add a `MAIL_DRY_RUN` env for dev. Document fallback: if SMTP fails at deploy, register still succeeds (token saved, send fails silently, user can resend). |
| Token leaks via referer headers | Use `<meta name="referrer" content="no-referrer">` on the email's HTML link, OR accept the risk and rely on 24h expiry. (Tokens are query-string URLs in a hash-based SPA — they don't go in `Referer` since the SPA URL is `https://mafiking.com/#verify-email?token=...` and the hash is not sent to servers.) |
| User loses email | Resend + "Pakai email lain" paths. Email can be re-issued; original link expires. |
| Race: two verifications for the same user | Token is single-use; the second verify on the same token returns `already_verified` (or `invalid` if cleared). Latest token always overwrites. |
| Local development has no SMTP | `MAIL_DRY_RUN=true` prints the link to console; copy-paste to test. |
| Race on the migration: column already exists | All `ALTER TABLE` calls are wrapped in try/catch in `server.js`'s existing migration loop. |
| Email arrives late (queued on server) | 24h expiry + resend. User can request a new token after 60s. |
| User changes email after signup | Out of scope; treat as future work. |
| Pre-seeded admin blocked by verification | `ensureFixedAdminUser` sets `email_verified_at` immediately. |
| Clerk user re-uses email address of a local-unverified user | `lib/clerk-user-sync.js` already promotes the user to `auth_provider = 'clerk'`. We also set `email_verified_at = CURRENT_TIMESTAMP` in that branch (small additional patch in clerk-user-sync.js) so the user can log in. |

---

## Open Items

- **Email change flow.** Out of scope here. Track as a follow-up.
- **Soft-block banner option.** The user explicitly chose hard block. No banner needed.
- **Resend email change confirmation.** Out of scope.
- **Disposable-email domain blocklist.** Useful but not in this scope.
- **Email content review for brand/legal.** The template's wording is proposed; the team should review copy before launch.

---

## Implementation Order

1. `db/schema.sql` + `server.js` migrations + admin auto-verify.
2. `lib/email-verification.js` + unit tests.
3. `lib/email-templates.js`.
4. `lib/mailer.js` + unit tests.
5. `routes/auth.js` — register, login, resend, verify-email.
6. `.env.example`.
7. `src/lobby.jsx` — `AuthScreen` `verify-email` mode + resend UI.
8. `src/app.jsx` — `parseAppLocation` for `#verify-email?token=...`.
9. `AGENTS.md` note.
10. Manual end-to-end smoke test.
11. Update `docs/plans/` index if one exists.

---

## Acceptance Criteria

- [x] New user can register; receives a Mafiking-branded email at the supplied address.
- [x] Clicking the email link lands on `https://mafiking.com/#verify-email?token=...`, verifies, and routes the user to `/belajar`.
- [x] Until verified, `POST /api/auth/login` returns `{ ok: false, requiresVerification: true }` and sets no session.
- [x] Resend button is disabled for 60 s after each send and shows a live countdown.
- [x] An attacker who knows only a victim's email cannot enumerate accounts via resend.
- [x] Clerk/Google sign-in continues to work without any email-verification step.
- [x] Pre-seeded admin user `123` is treated as already verified.
- [x] `npm run check` and the new test scripts pass.
- [x] No plain tokens are stored in the database; only SHA-256 hashes.
- [x] `AGENTS.md` documents the policy.
