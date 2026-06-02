const IMPORTANT_API_PREFIXES = [
    '/api/landing-media',
    '/api/payment',
    '/api/performance',
    '/api/progress',
    '/api/quiz/init',
    '/api/quiz/tryout',
    '/api/tryout-packages',
];

const ALLOWED_VITAL_NAMES = new Set(['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB']);
const ALLOWED_RATINGS = new Set(['good', 'needs-improvement', 'poor', 'unknown']);

function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
}

function sanitizePath(value, fallback = '/') {
    const raw = String(value || fallback).trim() || fallback;
    try {
        const parsed = raw.startsWith('http://') || raw.startsWith('https://')
            ? new URL(raw)
            : new URL(raw, 'https://mafiking.local');
        return parsed.pathname || fallback;
    } catch (_) {
        return raw.split('?')[0].slice(0, 160) || fallback;
    }
}

function sanitizeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString().slice(0, 300);
    } catch (_) {
        return sanitizePath(raw, '');
    }
}

function normalizeVitalsPayload(body = {}) {
    const metrics = Array.isArray(body.metrics) ? body.metrics : [body.metric || body].filter(Boolean);
    const route = sanitizePath(body.route || body.path || '/');
    const url = sanitizeUrl(body.url || '');
    const userAgent = String(body.userAgent || '').slice(0, 240);
    const normalizedMetrics = [];

    for (const metric of metrics) {
        const name = String(metric && metric.name || '').trim().toUpperCase();
        if (!ALLOWED_VITAL_NAMES.has(name)) continue;
        const value = Number(metric.value);
        if (!Number.isFinite(value) || value < 0) continue;
        const rating = ALLOWED_RATINGS.has(String(metric.rating || 'unknown'))
            ? String(metric.rating || 'unknown')
            : 'unknown';
        normalizedMetrics.push({
            id: String(metric.id || '').slice(0, 80),
            name,
            rating,
            route: sanitizePath(metric.route || route),
            value: clampNumber(value, 0, 60 * 1000),
        });
    }

    return {
        metrics: normalizedMetrics.slice(0, 12),
        route,
        url,
        userAgent,
    };
}

function publicApiCacheHeader(maxAgeSeconds = 30, staleSeconds = 120) {
    const maxAge = Math.max(0, Math.round(Number(maxAgeSeconds) || 0));
    const stale = Math.max(0, Math.round(Number(staleSeconds) || 0));
    return `public, max-age=${maxAge}, stale-while-revalidate=${stale}`;
}

function setPublicApiCache(res, maxAgeSeconds = 30, staleSeconds = 120) {
    res.setHeader('Cache-Control', publicApiCacheHeader(maxAgeSeconds, staleSeconds));
}

function shouldLogRequestTiming({ path, durationMs, statusCode }) {
    const duration = Number(durationMs) || 0;
    const status = Number(statusCode) || 0;
    if (status >= 500) return true;
    if (duration >= 750) return true;
    return IMPORTANT_API_PREFIXES.some((prefix) => String(path || '').startsWith(prefix));
}

function createPerformanceStore({ maxVitals = 200, maxRequests = 200 } = {}) {
    const vitals = [];
    const requests = [];

    function pushBounded(target, value, limit) {
        target.push({ ...value, timestamp: new Date().toISOString() });
        while (target.length > limit) target.shift();
    }

    return {
        recordRequest(request) {
            pushBounded(requests, {
                method: String(request.method || '').slice(0, 12),
                path: sanitizePath(request.path || '/'),
                statusCode: Number(request.statusCode) || 0,
                durationMs: Math.round((Number(request.durationMs) || 0) * 10) / 10,
                userId: request.userId == null ? null : Number(request.userId),
            }, maxRequests);
        },
        recordVital(metric) {
            pushBounded(vitals, {
                id: String(metric.id || '').slice(0, 80),
                name: String(metric.name || '').slice(0, 12),
                rating: String(metric.rating || 'unknown').slice(0, 24),
                route: sanitizePath(metric.route || '/'),
                value: Number(metric.value) || 0,
                userId: metric.userId == null ? null : Number(metric.userId),
            }, maxVitals);
        },
        getRequests() {
            return requests.slice();
        },
        getVitals() {
            return vitals.slice();
        },
        summary() {
            return {
                requestsCount: requests.length,
                vitalsCount: vitals.length,
                latestRequest: requests[requests.length - 1] || null,
                latestVital: vitals[vitals.length - 1] || null,
            };
        },
    };
}

module.exports = {
    createPerformanceStore,
    normalizeVitalsPayload,
    publicApiCacheHeader,
    setPublicApiCache,
    shouldLogRequestTiming,
};
