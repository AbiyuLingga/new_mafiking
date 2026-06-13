// Measures cold and warm mobile tab transitions against a running app.
// Usage: node scripts/benchmark-mobile-navigation.js [http://127.0.0.1:3001/belajar]

const assert = require('node:assert');
const { chromium } = require('playwright');

const targetUrl = process.argv[2] || process.env.MOBILE_NAV_URL || 'http://127.0.0.1:3001/belajar';
const COLD_BUDGET_MS = Number(process.env.MOBILE_NAV_COLD_BUDGET_MS || 200);
const SHELL_BUDGET_MS = Number(process.env.MOBILE_NAV_SHELL_BUDGET_MS || 100);
const LONG_TASK_BUDGET_MS = Number(process.env.MOBILE_NAV_LONG_TASK_BUDGET_MS || 100);

async function createPage(browser, { saveData = false, effectiveType = '4g' } = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(({ saveDataValue, effectiveTypeValue }) => {
        Object.defineProperty(navigator, 'connection', {
            configurable: true,
            value: { saveData: saveDataValue, effectiveType: effectiveTypeValue },
        });
        window.__mafikingLongTasks = [];
        new PerformanceObserver((list) => {
            window.__mafikingLongTasks.push(...list.getEntries().map((entry) => entry.duration));
        }).observe({ entryTypes: ['longtask'] });
    }, { saveDataValue: saveData, effectiveTypeValue: effectiveType });

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: 200 * 1024,
        uploadThroughput: 100 * 1024,
        connectionType: 'cellular3g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    return { context, page };
}

async function routeTiming(page, routeName) {
    return page.evaluate((name) => {
        const entries = performance.getEntriesByName(`mafiking-route-transition:${name}`);
        return entries.length ? entries[entries.length - 1].duration : null;
    }, routeName);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const normal = await createPage(browser);
        await normal.page.goto(targetUrl, { waitUntil: 'networkidle' });
        await normal.page.waitForSelector('.mafiking-mobile-bottom-nav [data-route="leaderboard"]');
        await normal.page.waitForTimeout(5000);

        const prefetchedBeforeTap = await normal.page.evaluate(() => (
            performance.getEntriesByType('resource').some((entry) => /leaderboard-[^/]+\.js/.test(entry.name))
        ));
        assert.ok(prefetchedBeforeTap, 'leaderboard chunk should be prefetched before the first tap on a normal connection');

        await normal.page.locator('.mafiking-mobile-bottom-nav [data-route="leaderboard"]').click();
        await normal.page.getByRole('heading', { name: 'Leaderboard' }).waitFor();
        const coldDuration = await routeTiming(normal.page, 'leaderboard');
        assert.ok(coldDuration != null && coldDuration <= COLD_BUDGET_MS, `prefetched transition took ${coldDuration}ms`);

        await normal.page.locator('.mafiking-mobile-bottom-nav [data-route="belajar"]').click();
        await normal.page.getByRole('heading', { name: /Selamat datang/ }).waitFor();
        await normal.page.locator('.mafiking-mobile-bottom-nav [data-route="leaderboard"]').click();
        await normal.page.getByRole('heading', { name: 'Leaderboard' }).waitFor();
        const warmDuration = await routeTiming(normal.page, 'leaderboard');
        assert.ok(warmDuration != null && warmDuration <= COLD_BUDGET_MS, `warm transition took ${warmDuration}ms`);

        const longTasks = await normal.page.evaluate(() => window.__mafikingLongTasks || []);
        assert.ok(Math.max(0, ...longTasks) <= LONG_TASK_BUDGET_MS, `navigation long task exceeded ${LONG_TASK_BUDGET_MS}ms`);
        await normal.context.close();

        const constrained = await createPage(browser, { saveData: true, effectiveType: '2g' });
        await constrained.page.goto(targetUrl, { waitUntil: 'networkidle' });
        await constrained.page.waitForSelector('.mafiking-mobile-bottom-nav [data-route="leaderboard"]');
        await constrained.page.waitForTimeout(2500);
        const speculativelyLoaded = await constrained.page.evaluate(() => (
            performance.getEntriesByType('resource').some((entry) => /leaderboard-[^/]+\.js/.test(entry.name))
        ));
        assert.strictEqual(speculativelyLoaded, false, 'Save-Data/2G must not speculatively preload leaderboard');

        const shellStartedAt = Date.now();
        await constrained.page.locator('.mafiking-mobile-bottom-nav [data-route="leaderboard"]').click({ noWaitAfter: true });
        await Promise.race([
            constrained.page.waitForSelector('.route-loading-shell'),
            constrained.page.getByRole('heading', { name: 'Leaderboard' }).waitFor(),
        ]);
        const shellDelay = Date.now() - shellStartedAt;
        assert.ok(shellDelay <= SHELL_BUDGET_MS, `loading feedback appeared after ${shellDelay}ms`);
        await constrained.page.getByRole('heading', { name: 'Leaderboard' }).waitFor();
        await constrained.context.close();

        console.log(`Mobile navigation benchmark passed (cold ${coldDuration.toFixed(1)}ms, warm ${warmDuration.toFixed(1)}ms, shell ${shellDelay}ms)`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
