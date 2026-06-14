#!/usr/bin/env node
// Secret Rotation Helper
// Phase 6: generate fresh secrets and document the rotation procedure.
//
// This script:
// 1. Generates cryptographically strong random secrets for various keys
// 2. Outputs them in a format ready to add to .env
// 3. Does NOT modify .env automatically (operator must paste manually)
//
// Usage:
//   node scripts/security/rotate-secrets.js [key1 key2 ...]
//
// Available keys:
//   SESSION_SECRET      - express-session secret
//   CSRF_SECRET        - CSRF double-submit cookie secret
//   HASH_PEPPER         - payer-id hash pepper
//   PAYMENT_WEBHOOK_SECRET - QRIS webhook HMAC secret
//   MUTASIKU_WEBHOOK_SECRET - Mutasiku webhook HMAC secret
//   COLLECTOR_HMAC_SECRET  - Internal collector HMAC secret
//   COLLECTOR_KEY_ID       - Collector key identifier
//   DUITKU_API_KEY         - (operator must rotate via Duitku dashboard)
//   SMTP_PASS              - (operator must rotate via Gmail app password)
//   CLERK_SECRET_KEY       - (operator must rotate via Clerk dashboard)

const crypto = require('crypto');

const REGISTRY = {
    SESSION_SECRET: { bytes: 64, hint: 'express-session sign/verify' },
    CSRF_SECRET: { bytes: 32, hint: 'CSRF double-submit cookie HMAC' },
    HASH_PEPPER: { bytes: 32, hint: 'payer-id HMAC-SHA256 pepper' },
    PAYMENT_WEBHOOK_SECRET: { bytes: 32, hint: 'QRIS webhook signature key' },
    MUTASIKU_WEBHOOK_SECRET: { bytes: 32, hint: 'Mutasiku webhook signature key' },
    COLLECTOR_HMAC_SECRET: { bytes: 32, hint: 'Internal collector ingestion HMAC' },
    COLLECTOR_KEY_ID: { bytes: 12, hint: 'Collector key identifier', encoding: 'hex' },
    QRIS_STATIC_STRING: { bytes: 0, hint: 'Source: merchant dashboard QRIS image; do not rotate unless compromised' },
    QRIS_ADMIN_WHATSAPP: { bytes: 0, hint: 'Operator phone number; do not auto-rotate' },
};

function generateSecret(bytes, encoding = 'base64') {
    if (bytes === 0) return null;
    return crypto.randomBytes(bytes).toString(encoding);
}

const requestedKeys = process.argv.slice(2);
const keysToPrint = requestedKeys.length > 0 ? requestedKeys : Object.keys(REGISTRY);

console.log('# Secret rotation output');
console.log('# Generated:', new Date().toISOString());
console.log('#');
console.log('# WARNING: keep these values out of version control.');
console.log('# Paste into .env manually, restart the server, then rotate dependents.');
console.log();

for (const key of keysToPrint) {
    const meta = REGISTRY[key];
    if (!meta) {
        console.warn(`  ! Unknown key: ${key}; skipping. Known keys: ${Object.keys(REGISTRY).join(', ')}`);
        continue;
    }
    if (meta.bytes === 0) {
        console.log(`# ${key} = (manual: ${meta.hint})`);
        continue;
    }
    const value = generateSecret(meta.bytes, meta.encoding || 'base64');
    console.log(`${key}=${value}`);
}

console.log();
console.log('# --- Post-rotation checklist ---');
console.log('# 1. Update .env (or secret manager) with the new values above');
console.log('# 2. Restart server: npm start');
console.log('# 3. Verify:');
console.log('#      curl -s http://127.0.0.1:3000/api/health');
console.log('# 4. Webhook/collector dependents: update HMAC secret in all senders');
console.log('# 5. Invalidate any cached tokens/sessions that depend on rotated secrets');
console.log('# 6. Document the rotation in docs/security/secret-rotation.md');
