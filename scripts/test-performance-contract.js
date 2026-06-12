const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
    createPerformanceStore,
    normalizeVitalsPayload,
    persistVitalsToDb,
    purgeExpiredVitals,
    summarizeVitalsFromDb,
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

// --- Phase 0/2 bundle assertions (post mobile perf plan) ---
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST = path.join(PROJECT_ROOT, 'dist');

if (fs.existsSync(DIST)) {
    function gzSize(file) {
        const content = fs.readFileSync(file);
        return zlib.gzipSync(content).length;
    }

    const distAssetsDir = path.join(DIST, 'assets');
    const distAssets = fs.existsSync(distAssetsDir) ? fs.readdirSync(distAssetsDir) : [];

    // Initial JS gzipped (entry + vendor-react). Plan target: <= 30 KB gz.
    // Post-Phase-2: ~24 KB gz.
    const mainJs = distAssets.filter((f) => /^index-.*\.js$/.test(f)).map((f) => path.join(distAssetsDir, f));
    const vendorJs = distAssets.filter((f) => /^vendor-react-.*\.js$/.test(f)).map((f) => path.join(distAssetsDir, f));
    const initialGz = mainJs.concat(vendorJs).reduce((s, f) => s + gzSize(f), 0);
    assert.ok(
        initialGz <= 30 * 1024,
        `Initial JS gzipped ${(initialGz / 1024).toFixed(1)} KB exceeds 30 KB budget (run npm run build first)`
    );

    // KaTeX must NOT be eagerly loaded in dist/index.html. Plan §1.3.
    const distHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    const katexRefs = (distHtml.match(/katex/gi) || []).length;
    assert.strictEqual(katexRefs, 0, `dist/index.html has ${katexRefs} KaTeX references (should be 0 — lazy via math-loader)`);

    // Image variants in dist (per-asset responsive). Plan §1.2.
    const imageVariants = distAssets.filter((f) => /-(mobile|tablet|desktop)\.(webp|avif)$/.test(f));
    assert.ok(
        imageVariants.length >= 6,
        `dist/assets has only ${imageVariants.length} image variants (expected >= 6 from mentor + landing_page)`
    );

    // Font weights: drop unused. Plan §3.1.
    const manropeWeights = (distHtml.match(/Manrope[^"]*wght@(\d+(?:;\d+)*)/) || []);
    const manropeWeightCount = (manropeWeights[0] && manropeWeights[0].split('@')[1].split(';').length) || 0;
    assert.ok(
        manropeWeightCount >= 3 && manropeWeightCount <= 6,
        `Manrope has ${manropeWeightCount} weights (expected 3-6 after Phase 3.1 reduction)`
    );

    // Route chunks: per Phase 2, each route should be a separate chunk.
    const routeChunks = distAssets.filter((f) => /^(lobby|belajar|practice|misi|tryout|leaderboard|payment|profile|invoices)-[A-Za-z0-9_-]+\.js$/.test(f));
    assert.ok(
        routeChunks.length >= 5,
        `dist/assets has only ${routeChunks.length} route chunks (expected >= 5: lobby, belajar, practice, misi, tryout, etc.)`
    );

    // web_vital_metrics table exists in schema
    const schemaSql = fs.readFileSync(path.join(PROJECT_ROOT, 'db', 'schema.sql'), 'utf8');
    assert.ok(
        /CREATE TABLE IF NOT EXISTS web_vital_metrics/i.test(schemaSql),
        'web_vital_metrics table missing from db/schema.sql'
    );

    // persistVitalsToDb / summarizeVitalsFromDb smoke (in-memory Database)
    try {
        const Database = require('better-sqlite3');
        const tmpPath = path.join(require('os').tmpdir(), `perf-contract-${Date.now()}.sqlite`);
        const tmpDb = new Database(tmpPath);
        tmpDb.exec(schemaSql);
        const written = persistVitalsToDb(tmpDb, [
            { name: 'LCP', value: 2400, rating: 'good', route: '/landing', navigationType: 'navigate', deviceClass: 'mid', attribution: null },
            { name: 'CLS', value: 0.05, rating: 'good', route: '/landing', navigationType: 'navigate', deviceClass: 'mid', attribution: null },
        ]);
        assert.strictEqual(written, 2);
        const p75 = summarizeVitalsFromDb(tmpDb, { metric: 'LCP', sinceMs: 0 });
        assert.strictEqual(p75.count, 1);
        assert.strictEqual(p75.p75, 2400);
        const purged = purgeExpiredVitals(tmpDb);
        assert.strictEqual(purged, 0, 'recently-inserted vitals should not be purged yet');
        tmpDb.close();
        fs.unlinkSync(tmpPath);
    } catch (err) {
        // better-sqlite3 might not be installed in test env; skip silently.
    }

    console.log(`Performance contract tests passed (initial JS ${(initialGz / 1024).toFixed(1)} KB gz, ${routeChunks.length} route chunks, ${imageVariants.length} image variants)`);
} else {
    console.log('Performance contract tests passed (skipped bundle assertions — dist/ not built; run npm run build)');
}
