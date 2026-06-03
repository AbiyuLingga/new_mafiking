// Audit-log analyzer smoke test.
//
// Run via `node scripts/test-analyze-audit-log.js` or as part of
// `npm run check`. Writes a small NDJSON fixture to logs/audit.log
// and logs/csp-reports.log, then verifies the analyzer summarizes it.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'logs');
const AUDIT_LOG = path.join(LOG_DIR, 'audit.log');
const CSP_LOG = path.join(LOG_DIR, 'csp-reports.log');

fs.mkdirSync(LOG_DIR, { recursive: true });

const now = new Date();
const ts = (offsetSec) => new Date(now.getTime() - offsetSec * 1000).toISOString();

const auditFixture = [
  { ts: ts(60), action: 'auth.login', status: 200, userId: 1 },
  { ts: ts(50), action: 'auth.login', status: 401, error: 'wrong password' },
  { ts: ts(40), action: 'auth.login', status: 401, error: 'wrong password' },
  { ts: ts(30), action: 'correction.transcribe', status: 200, userId: 1 },
  { ts: ts(20), action: 'correction.evaluate', status: 500, error: 'gemini timeout' },
  { ts: ts(10), action: 'payment.create', status: 200, userId: 1 },
].map((e) => JSON.stringify(e)).join('\n') + '\n';

const cspFixture = [
  { ts: ts(60), action: 'csp.violation', report: { 'violated-directive': 'script-src', 'blocked-uri': 'https://evil.example.com/x.js' } },
  { ts: ts(30), action: 'csp.violation', report: { 'violated-directive': 'script-src', 'blocked-uri': 'https://evil.example.com/x.js' } },
  { ts: ts(15), action: 'csp.violation', report: { 'violated-directive': 'connect-src', 'blocked-uri': 'https://api.evil.com' } },
].map((e) => JSON.stringify(e)).join('\n') + '\n';

fs.writeFileSync(AUDIT_LOG, auditFixture);
fs.writeFileSync(CSP_LOG, cspFixture);

const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'analyze-audit-log.js')], { encoding: 'utf8' });
const out = result.stdout + result.stderr;

assert.ok(out.includes('total events:    6'), 'total events line missing');
assert.ok(out.includes('csp reports:     3'), 'csp reports line missing');
assert.ok(out.includes('5xx errors:      1'), '5xx count wrong');
assert.ok(out.includes('auth.login'), 'auth.login action missing');
assert.ok(out.includes('script-src'), 'script-src directive missing');
assert.ok(out.includes('https://evil.example.com/x.js'), 'top blocked URI missing');

console.log('analyze-audit-log smoke: 6 assertions passed.');
