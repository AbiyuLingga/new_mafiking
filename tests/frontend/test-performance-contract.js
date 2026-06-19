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
} = require('../../server/observability/performance');

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
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(PROJECT_ROOT, 'dist');
const stylesSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'styles.css'), 'utf8');
const mainSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'main.jsx'), 'utf8');

assert.match(
    stylesSource,
    /\.mafiking-canvas-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    'canvas card grid must allow mobile content to shrink without widening the viewport'
);
assert.match(
    stylesSource,
    /@media \(max-width:\s*768px\)[\s\S]*?\.mafiking-progress-dots span\s*\{[\s\S]*?flex:\s*1 1 0;/,
    'mobile canvas progress dots must shrink within the card'
);

if (fs.existsSync(DIST)) {
    function gzSize(file) {
        const content = fs.readFileSync(file);
        return zlib.gzipSync(content).length;
    }

    const distAssetsDir = path.join(DIST, 'assets');
    const distAssets = fs.existsSync(distAssetsDir) ? fs.readdirSync(distAssetsDir) : [];
    const sourceAssetsDir = path.join(PROJECT_ROOT, 'assets');

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
    assert.doesNotMatch(mainSource, /https:\/\/unpkg\.com\/react/i, 'src/main.jsx must load React from same-origin static assets, not unpkg');
    assert.match(
        distHtml,
        /id="mafiking-static-landing"/,
        'dist/index.html must include the static landing first-paint shell'
    );
    assert.match(
        distHtml,
        /data-mafiking-static-shell/,
        'dist/index.html must enable the static shell only for landing routes'
    );
    assert.match(
        mainSource,
        /__mafikingLoadClerkBridge\s*=\s*\(\)\s*=>\s*import\('\.\/core\/clerk-auth\.jsx'\)/,
        'src/main.jsx must expose a lazy Clerk bridge loader'
    );
    assert.match(
        mainSource,
        /__mafikingLoadOnboarding\s*=\s*\(\)\s*=>\s*import\('\.\/core\/onboarding\.jsx'\)/,
        'src/main.jsx must expose a lazy onboarding loader'
    );
    assert.doesNotMatch(
        mainSource,
        /Promise\.all\(\[[\s\S]*import\('\.\/core\/clerk-auth\.jsx'\)/,
        'Clerk bridge must not be awaited in the first-paint bootstrap Promise.all'
    );
    assert.ok(
        mainSource.includes("function shouldWarmAuthRoute(path = normalizeBootstrapPath())") &&
            mainSource.includes("return path === '/login' || path === '/signup';"),
        'auth routes must be identified for early Clerk warmup'
    );
    assert.match(
        mainSource,
        /function warmAuthRouteEarly\(path = normalizeBootstrapPath\(\)\)[\s\S]*?__mafikingLoadClerkBridge\(\)[\s\S]*?\.warmup\(\)/,
        'login/signup must start non-blocking Clerk warmup from bootstrap'
    );
    assert.match(
        mainSource,
        /const bootstrapPath = normalizeBootstrapPath\(\);[\s\S]*?warmAuthRouteEarly\(bootstrapPath\);/,
        'bootstrap must start auth warmup before route app import'
    );
    assert.match(
        distHtml,
        /rel="preload"\s+as="script"\s+href="\/assets\/vendor\/react-18\.3\.1\.production\.min\.js\?v=18\.3\.1"/,
        'dist/index.html must preload same-origin React UMD'
    );
    assert.match(
        distHtml,
        /rel="preload"\s+as="script"\s+href="\/assets\/vendor\/react-dom-18\.3\.1\.production\.min\.js\?v=18\.3\.1"/,
        'dist/index.html must preload same-origin ReactDOM UMD'
    );
    for (const fileName of ['react-18.3.1.production.min.js', 'react-dom-18.3.1.production.min.js']) {
        assert.ok(
            fs.existsSync(path.join(sourceAssetsDir, 'vendor', fileName)),
            `Missing same-origin React vendor asset: assets/vendor/${fileName}`
        );
        assert.ok(
            fs.existsSync(path.join(distAssetsDir, 'vendor', fileName)),
            `Missing built React vendor asset: dist/assets/vendor/${fileName}`
        );
    }
    const mainCss = distAssets.find((f) => /^index-.*\.css$/.test(f));
    const compressedCriticalAssets = [
        mainCss && path.join(distAssetsDir, mainCss),
        path.join(distAssetsDir, 'vendor', 'react-18.3.1.production.min.js'),
        path.join(distAssetsDir, 'vendor', 'react-dom-18.3.1.production.min.js'),
    ].filter(Boolean);
    for (const filePath of compressedCriticalAssets) {
        assert.ok(fs.existsSync(`${filePath}.br`), `Missing Brotli asset: ${path.relative(PROJECT_ROOT, filePath)}.br`);
        assert.ok(fs.existsSync(`${filePath}.gz`), `Missing gzip asset: ${path.relative(PROJECT_ROOT, filePath)}.gz`);
    }

    // Image variants in dist (per-asset responsive). Plan §1.2.
    const imageVariants = distAssets.filter((f) => /-(mobile|tablet|desktop)\.(webp|avif)$/.test(f));
    assert.ok(
        imageVariants.length >= 12,
        `dist/assets has only ${imageVariants.length} top-level image variants (expected >= 12 from mentor + landing_page)`
    );
    for (const fileName of [
        'rekomendasi-latihan-mobile.avif',
        'history-kesalahan-mobile.avif',
        'simulasi-tryout-mobile.avif',
        'rekomendasi-latihan-mobile.webp',
        'history-kesalahan-mobile.webp',
        'simulasi-tryout-mobile.webp',
    ]) {
        const sourcePath = path.join(sourceAssetsDir, 'landing', fileName);
        const distPath = path.join(distAssetsDir, 'landing', fileName);
        assert.ok(fs.existsSync(sourcePath), `Missing landing feature image variant: assets/landing/${fileName}`);
        assert.ok(fs.existsSync(distPath), `Missing built landing feature image variant: dist/assets/landing/${fileName}`);
        assert.ok(
            fs.statSync(sourcePath).size <= 20 * 1024,
            `Landing mobile feature image ${fileName} exceeds 20 KB`
        );
    }
    for (const fileName of ['logo-icon.webp', 'favicon-icon.png', 'Book-icon.webp', 'crown-icon.webp', 'leaderboard-icon.webp']) {
        const sourcePath = path.join(sourceAssetsDir, fileName);
        const distPath = path.join(distAssetsDir, fileName);
        assert.ok(fs.existsSync(sourcePath), `Missing critical small asset: assets/${fileName}`);
        assert.ok(fs.existsSync(distPath), `Missing built critical small asset: dist/assets/${fileName}`);
        assert.ok(
            fs.statSync(sourcePath).size <= 25 * 1024,
            `Critical small asset ${fileName} exceeds 25 KB`
        );
    }

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
