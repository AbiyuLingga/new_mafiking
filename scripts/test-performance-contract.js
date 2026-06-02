const assert = require('assert');
const {
    createPerformanceStore,
    normalizeVitalsPayload,
    publicApiCacheHeader,
    shouldLogRequestTiming,
} = require('../lib/performance');

const normalized = normalizeVitalsPayload({
    metrics: [
        { name: 'LCP', value: 1800.4, rating: 'good', route: '/belajar?x=1', id: 'abc' },
        { name: 'bad', value: -1 },
        { name: 'CLS', value: 0.03, rating: 'good' },
    ],
    route: '/lobby',
    url: 'https://mafiking.test/lobby?debug=1',
    userAgent: 'Test Agent',
});

assert.strictEqual(normalized.metrics.length, 2);
assert.strictEqual(normalized.metrics[0].name, 'LCP');
assert.strictEqual(normalized.metrics[0].value, 1800.4);
assert.strictEqual(normalized.metrics[0].route, '/belajar');
assert.strictEqual(normalized.metrics[1].name, 'CLS');
assert.strictEqual(normalized.route, '/lobby');
assert.strictEqual(normalized.url, 'https://mafiking.test/lobby');

assert.strictEqual(publicApiCacheHeader(30, 120), 'public, max-age=30, stale-while-revalidate=120');
assert.strictEqual(publicApiCacheHeader(0, 0), 'public, max-age=0, stale-while-revalidate=0');

assert.strictEqual(shouldLogRequestTiming({ path: '/api/quiz/init', durationMs: 15, statusCode: 200 }), true);
assert.strictEqual(shouldLogRequestTiming({ path: '/api/auth/me', durationMs: 12, statusCode: 200 }), false);
assert.strictEqual(shouldLogRequestTiming({ path: '/api/auth/me', durationMs: 900, statusCode: 200 }), true);
assert.strictEqual(shouldLogRequestTiming({ path: '/api/auth/me', durationMs: 12, statusCode: 500 }), true);

const store = createPerformanceStore({ maxVitals: 2, maxRequests: 2 });
store.recordVital({ name: 'LCP', value: 1000, route: '/a' });
store.recordVital({ name: 'CLS', value: 0.02, route: '/a' });
store.recordVital({ name: 'INP', value: 120, route: '/b' });
store.recordRequest({ method: 'GET', path: '/api/a', statusCode: 200, durationMs: 10 });
store.recordRequest({ method: 'GET', path: '/api/b', statusCode: 200, durationMs: 20 });
store.recordRequest({ method: 'GET', path: '/api/c', statusCode: 200, durationMs: 30 });

assert.deepStrictEqual(store.getVitals().map((metric) => metric.name), ['CLS', 'INP']);
assert.deepStrictEqual(store.getRequests().map((request) => request.path), ['/api/b', '/api/c']);
assert.strictEqual(store.summary().vitalsCount, 2);
assert.strictEqual(store.summary().requestsCount, 2);

console.log('Performance contract tests passed');
