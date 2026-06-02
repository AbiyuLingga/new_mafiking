// Structured audit log for security-relevant and business events.
//
// Writes NDJSON to logs/audit.log and mirrors to stdout via console.info.
// Best-effort: never throws to the caller. Use a try/catch around `audit.log`
// in places where a logger failure would compound an existing error.

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');
const CSP_LOG_FILE = path.join(LOG_DIR, 'csp-reports.log');
const MAX_LINE_BYTES = 16 * 1024;

let stream = null;
let cspStream = null;

function ensureStream(filePath) {
  if (filePath === LOG_FILE && stream) return stream;
  if (filePath === CSP_LOG_FILE && cspStream) return cspStream;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const handle = fs.createWriteStream(filePath, { flags: 'a' });
    handle.on('error', () => {});
    if (filePath === LOG_FILE) stream = handle;
    if (filePath === CSP_LOG_FILE) cspStream = handle;
    return handle;
  } catch (_) {
    return null;
  }
}

function sanitize(value, maxBytes = MAX_LINE_BYTES) {
  if (value == null) return value;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length <= maxBytes) return str;
  return `${str.slice(0, maxBytes - 1)}\u2026`;
}

function buildLine(payload) {
  const entry = {
    ts: new Date().toISOString(),
    ...payload,
  };
  for (const key of Object.keys(entry)) {
    entry[key] = sanitize(entry[key]);
  }
  try {
    return JSON.stringify(entry);
  } catch (_) {
    return JSON.stringify({ ts: entry.ts, event: 'audit.encode_error' });
  }
}

function write(streamHandle, line) {
  if (!streamHandle || streamHandle.destroyed) return;
  try {
    streamHandle.write(`${line}\n`);
  } catch (_) {}
}

function log(action, payload = {}) {
  const line = buildLine({ action, ...payload });
  const handle = ensureStream(LOG_FILE);
  write(handle, line);
  try {
    console.info('[audit]', action, payload.event || '', payload.userId || '');
  } catch (_) {}
}

function logCspReport(report) {
  const line = buildLine({ action: 'csp.violation', report });
  const handle = ensureStream(CSP_LOG_FILE);
  write(handle, line);
  try {
    const blocked = report && report['blocked-uri'];
    const directive = report && report['violated-directive'];
    console.info('[csp-report]', directive || '?', blocked || '?');
  } catch (_) {}
}

function shutdown() {
  try { if (stream) stream.end(); } catch (_) {}
  try { if (cspStream) cspStream.end(); } catch (_) {}
  stream = null;
  cspStream = null;
}

process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(0); });
process.on('SIGTERM', () => { shutdown(); process.exit(0); });

module.exports = {
  log,
  logCspReport,
  LOG_DIR,
  LOG_FILE,
  CSP_LOG_FILE,
};
