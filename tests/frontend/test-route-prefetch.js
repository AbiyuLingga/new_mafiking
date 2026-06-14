const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const routePrefetchPath = path.join(PROJECT_ROOT, 'src', 'route-prefetch.js');
const routePrefetchSource = fs.readFileSync(routePrefetchPath, 'utf8');
const appSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'app.jsx'), 'utf8');
const sharedSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'shared.jsx'), 'utf8');

function createHarness(connection = {}) {
    const loadCalls = [];
    const idleCallbacks = [];
    const listeners = {};
    class FakeElement {}

    const window = {
        __loadRoute(routeName) {
            loadCalls.push(routeName);
            return Promise.resolve({ routeName });
        },
        requestAnimationFrame(callback) {
            callback();
        },
        requestIdleCallback(callback) {
            idleCallbacks.push(callback);
        },
        setTimeout(callback) {
            idleCallbacks.push(callback);
        },
        dispatchEvent() {},
    };
    const context = {
        CustomEvent: class CustomEvent {},
        Date,
        Element: FakeElement,
        Error,
        Map,
        Promise,
        Set,
        console,
        document: {
            addEventListener(name, callback) {
                listeners[name] = callback;
            },
        },
        navigator: { connection },
        performance: {
            clearMarks() {},
            getEntriesByName() { return []; },
            mark() {},
            measure() {},
        },
        window,
    };
    context.globalThis = context;

    const runnableSource = routePrefetchSource
        .replace(/export\s+function\s+/g, 'function ')
        .replace(/export\s+const\s+/g, 'const ')
        .replace(/\(\)\s*=>\s*import\("\.\/([^"]+)\.jsx"\)/g, '() => window.__loadRoute("$1")');

    vm.runInNewContext(runnableSource, context, { filename: routePrefetchPath });
    return {
        api: window.MafikingRoutePrefetch,
        FakeElement,
        idleCallbacks,
        listeners,
        loadCalls,
        window,
    };
}

async function flushPromises() {
    await new Promise((resolve) => setImmediate(resolve));
}

async function run() {
    assert.match(routePrefetchSource, /misi:\s*\{\s*globalName:\s*"Misi",\s*load:\s*\(\)\s*=>\s*import\("\.\/misi\.jsx"\)/);
    assert.doesNotMatch(routePrefetchSource, /@vite-ignore/);
    assert.doesNotMatch(routePrefetchSource, /if\s*\(\/\\\.jsx/);
    assert.match(appSource, /loadAppRoute\("leaderboard",\s*"Leaderboard"/);
    assert.match(appSource, /!routeChunkReady\s*&&\s*<RouteChunkFallback/);
    assert.match(sharedSource, /data-route=\{item\.id\}/);
    assert.match(sharedSource, /data-route=\{l\.id\}/);

    const fallbackHarness = createHarness();
    const fallbackComponent = () => null;
    fallbackHarness.window.Belajar = fallbackComponent;
    const fallbackModule = await fallbackHarness.api.loadRoute('belajar');
    assert.strictEqual(fallbackModule.Belajar, fallbackComponent);
    assert.deepStrictEqual(fallbackHarness.loadCalls, []);

    const dedupeHarness = createHarness();
    const firstLoad = dedupeHarness.api.loadRoute('misi');
    const secondLoad = dedupeHarness.api.loadRoute('misi');
    assert.strictEqual(firstLoad, secondLoad, 'route loads must share one cached promise');
    await firstLoad;
    assert.deepStrictEqual(dedupeHarness.loadCalls, ['misi']);

    const saveDataHarness = createHarness({ saveData: true, effectiveType: '4g' });
    saveDataHarness.api.prefetchAdjacentRoutes('belajar');
    assert.strictEqual(saveDataHarness.idleCallbacks.length, 0, 'Save-Data must skip speculative prefetch');
    await saveDataHarness.api.prefetchRoute('leaderboard', { intent: true });
    assert.deepStrictEqual(saveDataHarness.loadCalls, ['leaderboard'], 'direct navigation intent must still load its target');

    const normalHarness = createHarness({ saveData: false, effectiveType: '4g' });
    normalHarness.api.prefetchAdjacentRoutes('belajar');
    while (normalHarness.idleCallbacks.length) {
        normalHarness.idleCallbacks.shift()();
        await flushPromises();
    }
    assert.deepStrictEqual(
        normalHarness.loadCalls,
        ['misi', 'tryout', 'leaderboard'],
        'adjacent primary tabs must prefetch sequentially and remain capped'
    );

    const pointerHarness = createHarness({ saveData: true, effectiveType: '2g' });
    pointerHarness.api.attachIntentPrefetch();
    const target = new pointerHarness.FakeElement();
    target.closest = () => ({ getAttribute: () => 'leaderboard' });
    pointerHarness.listeners.pointerdown({ target });
    await flushPromises();
    assert.deepStrictEqual(pointerHarness.loadCalls, ['leaderboard'], 'pointerdown must warm the exact mobile target');

    console.log('Route prefetch tests passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
