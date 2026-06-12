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

function clampString(value, maxLength = 300) {
    return String(value || '').slice(0, maxLength);
}

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
    const navigationType = String(body.navigationType || '').slice(0, 24) || null;
    const deviceClass = String(body.deviceClass || '').slice(0, 16) || null;
    const normalizedMetrics = [];

    for (const metric of metrics) {
        const name = String(metric && metric.name || '').trim().toUpperCase();
        if (!ALLOWED_VITAL_NAMES.has(name)) continue;
        const value = Number(metric.value);
        if (!Number.isFinite(value) || value < 0) continue;
        const rating = ALLOWED_RATINGS.has(String(metric.rating || 'unknown'))
            ? String(metric.rating || 'unknown')
            : 'unknown';
        const attribution = metric.attribution && typeof metric.attribution === 'object'
            ? JSON.stringify(metric.attribution).slice(0, 1000)
            : null;
        normalizedMetrics.push({
            id: String(metric.id || '').slice(0, 80),
            name,
            rating,
            route: sanitizePath(metric.route || route),
            value: clampNumber(value, 0, 60 * 1000),
            navigationType,
            deviceClass,
            attribution,
        });
    }

    return {
        metrics: normalizedMetrics.slice(0, 12),
        route,
        url,
        userAgent,
    };
}

const VITAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function persistVitalsToDb(db, metrics) {
    if (!db || !Array.isArray(metrics) || metrics.length === 0) return 0;
    let tableReady = true;
    try {
        db.prepare("SELECT 1 FROM web_vital_metrics LIMIT 0").get();
    } catch (_) {
        tableReady = false;
    }
    if (!tableReady) return 0;
    const now = Date.now();
    const stmt = db.prepare(`INSERT INTO web_vital_metrics
        (path, metric, value, rating, navigation_type, device_class, attribution_json, captured_at, retention_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const tx = db.transaction((rows) => {
        for (const m of rows) {
            stmt.run(
                m.route || '/',
                m.name,
                m.value,
                m.rating,
                m.navigationType || null,
                m.deviceClass || null,
                m.attribution || null,
                now,
                now + VITAL_RETENTION_MS
            );
        }
    });
    tx(metrics);
    return metrics.length;
}

function purgeExpiredVitals(db) {
    if (!db) return 0;
    let tableReady = true;
    try {
        db.prepare("SELECT 1 FROM web_vital_metrics LIMIT 0").get();
    } catch (_) {
        tableReady = false;
    }
    if (!tableReady) return 0;
    const result = db.prepare('DELETE FROM web_vital_metrics WHERE retention_until < ?').run(Date.now());
    return result.changes || 0;
}

function summarizeVitalsFromDb(db, { metric, path, sinceMs, limit = 200 } = {}) {
    if (!db) return { count: 0, p75: null, samples: 0 };
    let tableReady = true;
    try {
        db.prepare("SELECT 1 FROM web_vital_metrics LIMIT 0").get();
    } catch (_) {
        tableReady = false;
    }
    if (!tableReady) return { count: 0, p75: null, samples: 0 };
    const conditions = ['captured_at >= ?'];
    const params = [sinceMs || (Date.now() - 7 * 24 * 60 * 60 * 1000)];
    if (metric) {
        conditions.push('metric = ?');
        params.push(metric);
    }
    if (path) {
        conditions.push('path = ?');
        params.push(path);
    }
    const rows = db.prepare(
        `SELECT value FROM web_vital_metrics WHERE ${conditions.join(' AND ')} ORDER BY value ASC LIMIT ?`
    ).all(...params, limit);
    if (rows.length === 0) return { count: 0, p75: null, samples: 0 };
    const p75Index = Math.min(rows.length - 1, Math.floor(rows.length * 0.75));
    return {
        count: rows.length,
        p75: Math.round(rows[p75Index].value * 100) / 100,
        samples: rows.length,
    };
}

function normalizeClientErrorPayload(body = {}) {
    return {
        source: clampString(body.source || 'unknown', 80),
        message: clampString(body.message || 'Unknown client error', 500),
        name: clampString(body.name || 'Error', 120),
        stack: clampString(body.stack || '', 2000),
        route: sanitizePath(body.route || body.path || '/'),
        url: sanitizeUrl(body.url || ''),
        userAgent: clampString(body.userAgent || '', 240),
        extra: body.extra && typeof body.extra === 'object'
            ? JSON.stringify(body.extra).slice(0, 1000)
            : '',
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

function createPerformanceStore({ maxVitals = 200, maxRequests = 200, maxClientErrors = 100 } = {}) {
    const vitals = [];
    const requests = [];
    const clientErrors = [];

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
        recordClientError(error) {
            pushBounded(clientErrors, {
                source: clampString(error.source || 'unknown', 80),
                message: clampString(error.message || 'Unknown client error', 500),
                name: clampString(error.name || 'Error', 120),
                route: sanitizePath(error.route || '/'),
                url: sanitizeUrl(error.url || ''),
                userAgent: clampString(error.userAgent || '', 240),
                userId: error.userId == null ? null : Number(error.userId),
            }, maxClientErrors);
        },
        getRequests() {
            return requests.slice();
        },
        getVitals() {
            return vitals.slice();
        },
        getClientErrors() {
            return clientErrors.slice();
        },
        summary() {
            return {
                requestsCount: requests.length,
                vitalsCount: vitals.length,
                clientErrorsCount: clientErrors.length,
                latestRequest: requests[requests.length - 1] || null,
                latestVital: vitals[vitals.length - 1] || null,
                latestClientError: clientErrors[clientErrors.length - 1] || null,
            };
        },
    };
}

module.exports = {
    createPerformanceStore,
    normalizeClientErrorPayload,
    normalizeVitalsPayload,
    persistVitalsToDb,
    purgeExpiredVitals,
    summarizeVitalsFromDb,
    publicApiCacheHeader,
    setPublicApiCache,
    shouldLogRequestTiming,
    VITAL_RETENTION_MS,
};
