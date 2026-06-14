#!/usr/bin/env node
// Phase 0 Baseline Audit
// Runs non-mutating checks: env production readiness, npm audit, header/TLS audit.
//
// Usage:
//   node scripts/security/baseline-audit.js [--npm-audit] [--live-url <url>]
//
// Exit 0 = clean, 1 = warnings/errors.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

let issues = 0;
function warn(msg) { issues++; console.warn(`  !  ${msg}`); }
function ok(msg) { console.log(`  ok ${msg}`); }
function info(msg) { console.log(`  .  ${msg}`); }

console.log('=== Phase 0 Baseline Audit ===\n');

info('--- Production env checklist ---');
const REQUIRED_PROD_VARS = [
    'SESSION_SECRET',
    'CSRF_SECRET',
    'HASH_PEPPER',
    'QRIS_STATIC_STRING',
    'PAYMENT_WEBHOOK_SECRET',
    'MUTASIKU_WEBHOOK_SECRET',
    'COLLECTOR_HMAC_SECRET',
    'COLLECTOR_KEY_ID',
    'DUITKU_MERCHANT_CODE',
    'DUITKU_API_KEY',
    'SMTP_USER',
    'SMTP_PASS',
    'CLERK_SECRET_KEY',
];

for (const v of REQUIRED_PROD_VARS) {
    const value = process.env[v];
    if (!value) {
        warn(`${v}: not set in production env`);
    } else if (value === 'change-me' || value.includes('placeholder')) {
        warn(`${v}: still set to placeholder value`);
    } else {
        ok(`${v}: present (${value.length} chars)`);
    }
}

const FORBIDDEN_IN_PROD = [
    'PAYMENT_ALLOW_MOCK_IN_PRODUCTION',
    'ENABLE_GUEST_CHECKOUT',
    'NODE_ENV=test',
];
for (const v of FORBIDDEN_IN_PROD) {
    if (['1', 'true', 'yes', 'on'].includes(String(process.env[v] || '').toLowerCase())) {
        warn(`${v}: enabled — disable in production`);
    } else {
        ok(`${v}: not enabled`);
    }
}

info('');
info('--- Mutating operations freeze ---');
const enabledCollector = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MUTATION_COLLECTOR_ENABLED || '').toLowerCase()
);
if (enabledCollector) {
    warn('MUTATION_COLLECTOR_ENABLED=true — verify Phase 0-4 gates have passed before enabling in production');
} else {
    ok('MUTATION_COLLECTOR_ENABLED is off (frozen state, expected until Phase 4 signed collector is verified)');
}

if (process.argv.includes('--npm-audit')) {
    info('');
    info('--- `npm audit --omit=dev` ---');
    try {
        const stdout = execSync('npm audit --omit=dev --json', { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        const audit = JSON.parse(stdout.toString());
        const v = audit.metadata?.vulnerabilities || {};
        const total = v.total || 0;
        if (total === 0) {
            ok(`no vulnerabilities (info: ${v.info||0}, low: ${v.low||0}, moderate: ${v.moderate||0}, high: ${v.high||0}, critical: ${v.critical||0})`);
        } else {
            warn(`${total} vulnerabilities found`);
        }
    } catch (err) {
        const stderr = err.stderr ? err.stderr.toString() : err.message;
        if (err.stdout) {
            try {
                const audit = JSON.parse(err.stdout.toString());
                const v = audit.metadata?.vulnerabilities || {};
                if ((v.total || 0) === 0) {
                    ok(`no vulnerabilities (dev deps excluded)`);
                } else {
                    warn(`${v.total} vulnerabilities found (low: ${v.low||0}, moderate: ${v.moderate||0}, high: ${v.high||0}, critical: ${v.critical||0})`);
                }
            } catch (_) {
                warn(`npm audit failed: ${stderr.slice(0, 200)}`);
            }
        } else {
            warn(`npm audit failed: ${stderr.slice(0, 200)}`);
        }
    }
}

info('');
info('--- File integrity baseline ---');
const criticalFiles = [
    'server.js',
    'db/schema.sql',
    'lib/payment-reconciler.js',
    'lib/mutation-matcher.js',
    'lib/payment-rate-limiter.js',
    'lib/payment-alerts.js',
    'lib/ip-allowlist.js',
    'routes/payment.js',
    'routes/admin-payments.js',
];
for (const f of criticalFiles) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) ok(`${f}: present`);
    else warn(`${f}: MISSING`);
}

const liveUrl = process.argv.find((a, i) => process.argv[i-1] === '--live-url');

async function runLiveAudit() {
    if (!liveUrl) return;
    info('');
    info(`--- Live header/TLS audit for ${liveUrl} ---`);
    try {
        const res = await fetch(liveUrl, { method: 'GET', redirect: 'manual' });
        const headers = res.headers;
        for (const h of ['content-security-policy', 'content-security-policy-report-only', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy']) {
            const v = headers.get(h);
            if (v) ok(`${h}: ${v.slice(0, 80)}${v.length > 80 ? '…' : ''}`);
            else warn(`${h}: MISSING`);
        }
    } catch (err) {
        warn(`live header audit failed: ${err.message}`);
    }
}

runLiveAudit().then(() => {
    info('');
    console.log(`Baseline audit: ${issues === 0 ? 'clean' : `${issues} issue(s)`}`);
    process.exit(issues > 0 ? 1 : 0);
});
