const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CROSS_SITE_VALUES = new Set(['cross-site']);

const STATE_CHANGE_EXEMPT_PATHS = new Set([
    '/api/payment/callback',
    '/api/payment/reconcile/webhook',
    '/api/payment/reconcile/mutasiku-webhook',
    '/api/payment/reconcile/mutation-batch',
    '/api/webhooks/clerk',
    '/api/internal/collector-heartbeat',
]);

function normalizeOrigin(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        return new URL(raw).origin;
    } catch (_) {
        return '';
    }
}

function originFromRequest(req) {
    const protocol = req.protocol || (req.secure ? 'https' : 'http');
    const host = req.get ? req.get('host') : req.headers?.host;
    return host ? `${protocol}://${host}` : '';
}

function configuredOrigins(env = process.env) {
    return [
        env.APP_ORIGIN,
        env.PUBLIC_APP_URL,
        env.VITE_APP_ORIGIN,
        ...(String(env.ALLOWED_ORIGINS || '').split(',')),
    ].map(normalizeOrigin).filter(Boolean);
}

function allowedOriginsForRequest(req, env = process.env) {
    const origins = new Set(configuredOrigins(env));
    const requestOrigin = normalizeOrigin(originFromRequest(req));
    if (requestOrigin) origins.add(requestOrigin);
    return origins;
}

function isStateChangingRequest(req) {
    return !SAFE_METHODS.has(String(req.method || '').toUpperCase());
}

function isExemptPath(path) {
    return STATE_CHANGE_EXEMPT_PATHS.has(String(path || ''));
}

function isTrustedRequestOrigin(req, env = process.env) {
    const allowedOrigins = allowedOriginsForRequest(req, env);
    const origin = normalizeOrigin(req.get ? req.get('origin') : req.headers?.origin);
    if (origin && !allowedOrigins.has(origin)) return false;

    const refererHeader = req.get ? req.get('referer') : req.headers?.referer;
    const refererOrigin = refererHeader ? normalizeOrigin(refererHeader) : '';
    if (!origin && refererOrigin && !allowedOrigins.has(refererOrigin)) return false;

    const fetchSite = String(req.get ? req.get('sec-fetch-site') : req.headers?.['sec-fetch-site'] || '').toLowerCase();
    if (CROSS_SITE_VALUES.has(fetchSite)) return false;

    return true;
}

function shouldRejectCrossSiteRequest(req, env = process.env) {
    if (!req || !String(req.path || '').startsWith('/api/')) return false;
    if (!isStateChangingRequest(req)) return false;
    if (isExemptPath(req.path)) return false;
    return !isTrustedRequestOrigin(req, env);
}

function createRequestGuard(env = process.env) {
    return (req, res, next) => {
        if (shouldRejectCrossSiteRequest(req, env)) {
            return res.status(403).json({ error: 'Request lintas situs ditolak' });
        }
        return next();
    };
}

module.exports = {
    allowedOriginsForRequest,
    createRequestGuard,
    isStateChangingRequest,
    isTrustedRequestOrigin,
    shouldRejectCrossSiteRequest,
};
