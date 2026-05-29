const express = require('express');
const { Webhook } = require('svix');
const { upsertClerkUser } = require('../lib/clerk-user-sync');

const router = express.Router();

function firstEmail(data) {
  const primaryId = data && data.primary_email_address_id;
  const emails = Array.isArray(data && data.email_addresses) ? data.email_addresses : [];
  const primary = emails.find((entry) => entry.id === primaryId) || emails[0];
  return String((primary && primary.email_address) || '').trim().toLowerCase();
}

function displayName(data, email) {
  const fullName = [data && data.first_name, data && data.last_name].filter(Boolean).join(' ').trim();
  return String((data && (data.full_name || fullName || data.username)) || email || 'Pengguna Google').trim();
}

function handleClerkWebhook(req, res) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) return res.status(400).json({ error: 'CLERK_WEBHOOK_SIGNING_SECRET belum diset.' });

  const headers = {
    'svix-id': req.headers['svix-id'],
    'svix-timestamp': req.headers['svix-timestamp'],
    'svix-signature': req.headers['svix-signature'],
  };

  let event;
  try {
    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    event = new Webhook(secret).verify(payload, headers);
  } catch (error) {
    return res.status(400).json({ error: 'Signature webhook Clerk tidak valid.' });
  }

  try {
    if (event.type === 'user.created') {
      const data = event.data || {};
      const clerkId = data.id;
      if (!clerkId) return res.status(400).json({ error: 'Webhook Clerk tidak punya user id.' });
      upsertClerkUser(req.app.locals.db, {
        clerkId,
        email: firstEmail(data),
        displayName: displayName(data, firstEmail(data)),
      });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[clerk-webhook] error:', error);
    res.status(500).json({ error: 'Gagal memproses webhook Clerk.' });
  }
}

router.post('/', handleClerkWebhook);
router.post('/clerk', handleClerkWebhook);

module.exports = router;
module.exports.handleClerkWebhook = handleClerkWebhook;
