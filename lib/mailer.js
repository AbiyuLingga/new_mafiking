const nodemailer = require('nodemailer');

let cachedTransport = null;
let cachedKey = '';

function getConfig() {
  const dryRun = String(process.env.MAIL_DRY_RUN || 'false').toLowerCase() === 'true';
  const smtpPass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
  return {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false',
    auth: process.env.SMTP_USER && smtpPass
      ? { user: process.env.SMTP_USER, pass: smtpPass }
      : undefined,
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'mafikingsolusitpb@gmail.com',
    fromName: process.env.MAIL_FROM_NAME || 'Mafiking',
    dryRun,
  };
}

function transportKey(cfg) {
  return [cfg.host, cfg.port, cfg.secure, cfg.auth && cfg.auth.user].join('|');
}

function getTransport() {
  const cfg = getConfig();
  if (cfg.dryRun) return null;
  if (!cfg.host || !cfg.auth) {
    throw new Error('SMTP not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS)');
  }
  const key = transportKey(cfg);
  if (cachedTransport && cachedKey === key) return cachedTransport;
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
  cachedKey = key;
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
      await new Promise((resolve) => setTimeout(resolve, 250));
      return await sendMailOnce(args);
    }
    console.error(`[mailer:error] to=${maskEmail(args && args.to)} code=${err && err.code} msg=${err && err.message}`);
    throw err;
  }
}

module.exports = { sendMail, maskEmail, getConfig, getTransport };
