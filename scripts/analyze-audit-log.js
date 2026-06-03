// Audit-log analyzer for new_mafiking.
//
// Reads logs/audit.log and logs/csp-reports.log (NDJSON) and prints a
// short summary: 5xx error spike, auth failure burst, CSP violation
// pattern, and any other notable trends. Designed to be run from cron
// (or the GitHub Actions scheduled workflow) and mail the output to
// the security on-call.
//
// Run via `node scripts/analyze-audit-log.js` (optionally with
// `--since <iso>` to filter by timestamp).
//
// For now, the script reads from disk. A future Phase 4 task is to
// stream from a central log store (e.g. Loki or CloudWatch).

const fs = require('node:fs');
const path = require('node:path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const AUDIT_LOG = path.join(LOG_DIR, 'audit.log');
const CSP_LOG = path.join(LOG_DIR, 'csp-reports.log');

const argv = process.argv.slice(2);
const sinceIdx = argv.indexOf('--since');
const sinceMs = sinceIdx >= 0 ? Date.parse(argv[sinceIdx + 1]) : Date.now() - 24 * 60 * 60 * 1000;
if (!Number.isFinite(sinceMs)) {
  console.error('Invalid --since timestamp');
  process.exit(1);
}

function readNdjson(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  return text.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
}

function bucketBy(items, keyFn) {
  const out = new Map();
  for (const it of items) {
    const k = keyFn(it);
    out.set(k, (out.get(k) || 0) + 1);
  }
  return out;
}

function summarize() {
  const audit = readNdjson(AUDIT_LOG).filter((e) => Date.parse(e.ts) >= sinceMs);
  const csp = readNdjson(CSP_LOG).filter((e) => Date.parse(e.ts) >= sinceMs);

  const byAction = bucketBy(audit, (e) => e.action || '?');
  const cspByDirective = bucketBy(csp, (e) => (e.report && e.report['violated-directive']) || '?');
  const cspByBlockedUri = bucketBy(csp, (e) => (e.report && e.report['blocked-uri']) || '?');
  const fivexx = audit.filter((e) => Number(e.status) >= 500);
  const authFailures = audit.filter((e) => /auth|login|register/i.test(e.action || '') && Number(e.status) >= 400);

  const lines = [];
  lines.push(`Audit log summary (since ${new Date(sinceMs).toISOString()})`);
  lines.push(`  total events:    ${audit.length}`);
  lines.push(`  csp reports:     ${csp.length}`);
  lines.push(`  5xx errors:      ${fivexx.length}`);
  lines.push(`  auth failures:   ${authFailures.length}`);
  lines.push('');
  lines.push('Top actions:');
  for (const [action, count] of [...byAction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    lines.push(`  ${String(count).padStart(6)}  ${action}`);
  }
  lines.push('');
  lines.push('Top CSP-violated directives:');
  for (const [directive, count] of [...cspByDirective.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    lines.push(`  ${String(count).padStart(6)}  ${directive}`);
  }
  lines.push('');
  lines.push('Top blocked URIs:');
  for (const [uri, count] of [...cspByBlockedUri.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    lines.push(`  ${String(count).padStart(6)}  ${uri}`);
  }
  lines.push('');
  if (fivexx.length > 0) {
    lines.push('5xx events:');
    for (const e of fivexx.slice(0, 20)) {
      lines.push(`  ${e.ts}  ${e.action}  ${e.error || ''}`);
    }
    lines.push('');
  }

  // Findings thresholds.
  const findings = [];
  if (fivexx.length > 50) findings.push(`5xx error burst: ${fivexx.length} events`);
  if (authFailures.length > 200) findings.push(`Auth failure burst: ${authFailures.length} events`);
  if (csp.length > 100) findings.push(`CSP report volume high: ${csp.length} reports`);

  if (findings.length > 0) {
    lines.push('FINDINGS:');
    for (const f of findings) lines.push(`  - ${f}`);
  } else {
    lines.push('No notable findings.');
  }

  return lines.join('\n');
}

console.log(summarize());
