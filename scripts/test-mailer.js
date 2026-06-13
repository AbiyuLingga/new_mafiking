const assert = require('assert');

const originalEnv = { ...process.env };

function resetMailer() {
  delete require.cache[require.resolve('../lib/mailer')];
  return require('../lib/mailer');
}

(async () => {
  process.env = { ...originalEnv, MAIL_DRY_RUN: 'true', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' };
  let logged = '';
  const originalInfo = console.info;
  console.info = (message) => { logged += String(message); };
  try {
    const { sendMail, maskEmail } = resetMailer();
    assert.equal(maskEmail('alice@example.com'), 'a***@example.com');
    const result = await sendMail({
      to: 'alice@example.com',
      subject: 'Test',
      html: '<p>ok</p>',
      text: 'ok',
    });
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.ok(logged.includes('[mailer:dry-run]'));
  } finally {
    console.info = originalInfo;
  }

  process.env = {
    ...originalEnv,
    MAIL_DRY_RUN: 'false',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_USER: 'mafikingsolusitpb@gmail.com',
    SMTP_PASS: 'app-password',
    MAIL_FROM: 'no-reply@mafiking.com',
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const { getConfig } = resetMailer();
    const cfg = getConfig();
    assert.equal(cfg.from, 'mafikingsolusitpb@gmail.com');
    assert.equal(cfg.auth.user, 'mafikingsolusitpb@gmail.com');
  } finally {
    console.warn = originalWarn;
  }

  process.env = {
    ...originalEnv,
    MAIL_DRY_RUN: 'false',
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'mailer@example.com',
    SMTP_PASS: 'secret',
    MAIL_FROM: 'no-reply@example.com',
  };
  {
    const { getConfig } = resetMailer();
    const cfg = getConfig();
    assert.equal(cfg.from, 'no-reply@example.com');
  }

  process.env = { ...originalEnv, MAIL_DRY_RUN: 'false', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' };
  const { sendMail } = resetMailer();
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      () => sendMail({ to: 'alice@example.com', subject: 'Test', html: '<p>ok</p>', text: 'ok' }),
      /SMTP not configured/
    );
  } finally {
    console.error = originalError;
  }

  process.env = originalEnv;
  console.log('ok');
})().catch((error) => {
  process.env = originalEnv;
  console.error(error);
  process.exit(1);
});
