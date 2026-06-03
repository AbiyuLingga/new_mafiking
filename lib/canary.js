// Canary-token middleware for the admin surface.
//
// A "canary" is a URL that no real user or admin should ever visit
// during normal operation. If a request hits one, the source is
// almost certainly a scanner, a leaked-credential attacker, or a
// compromised admin account. We log the hit at high severity and
// return 404 so the attacker does not learn they tripped an alert.
//
// The set of canary paths is read from env (`CANARY_PATHS`) so the
// actual list is not committed to the repo. The env file holds the
// list as a comma-separated string. A reasonable default is shipped
// in `.env.example`.
//
// What this does NOT do:
// - It does not block the request. We log + alert; the WAF (Phase 4)
//   is the right place to enforce IP blocks.
// - It does not phone home. The audit log is the alerting channel;
//   Phase 4 wires the log to an email / Slack hook.

const auditLog = require('./audit-log');

const DEFAULT_CANARY_PATHS = [
  // None by default — the env file is the source of truth.
];

function parseCanaryPaths(env = process.env) {
  const raw = String(env.CANARY_PATHS || '').trim();
  if (!raw) return DEFAULT_CANARY_PATHS;
  return raw.split(',').map((p) => p.trim()).filter(Boolean);
}

function createCanaryMiddleware(options = {}) {
  const env = options.env || process.env;
  const paths = new Set(parseCanaryPaths(env));

  return function canaryMiddleware(req, res, next) {
    if (!req.path.startsWith('/api/')) return next();
    if (!paths.has(req.path)) return next();

    const event = {
      action: 'canary.hit',
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
      userId: req.session?.userId || null,
      role: req.session?.role || null,
    };
    try { auditLog.log('canary.hit', event); } catch (_) { /* best-effort */ }
    try { console.warn('[canary] hit', event); } catch (_) { /* best-effort */ }
    return res.status(404).type('text/plain; charset=utf-8').send('Not found');
  };
}

module.exports = {
  createCanaryMiddleware,
  parseCanaryPaths,
  DEFAULT_CANARY_PATHS,
};
