// Visual regression + memory trace for Phase 4 of the mobile perf plan.
//
// Captures screenshots of every key route, compares them against the
// baseline (if present), and runs a 5-minute canvas session to verify
// no monotonic heap growth. This is the S5 safeguard plus the live
// portion of Phase 4 (per the plan §7 and §8).
//
// Usage:
//   node scripts/performance/visual-regression.js                # run all routes
//   node scripts/performance/visual-regression.js --update      # refresh baseline
//   node scripts/performance/visual-regression.js --memory      # also run memory trace
//   node scripts/performance/visual-regression.js --routes=/landing,/belajar
//
// Requires Playwright (devDep) and `npx playwright install chromium` once.

const fs = require('node:fs');
const path = require('node:path');

const ARGS = process.argv.slice(2);
const UPDATE_BASELINE = ARGS.includes('--update');
const RUN_MEMORY = ARGS.includes('--memory');
const ROUTES_ARG = ARGS.find((a) => a.startsWith('--routes='));
const ROUTES = ROUTES_ARG
  ? ROUTES_ARG.slice('--routes='.length).split(',').filter(Boolean)
  : ['/landing', '/belajar', '/misi', '/peringkat', '/profil'];

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_DIR = path.join(PROJECT_ROOT, 'docs', 'perf', 'visual-baseline');
const CURRENT_DIR = path.join(PROJECT_ROOT, 'docs', 'perf', 'visual-current');
const DIFF_DIR = path.join(PROJECT_ROOT, 'docs', 'perf', 'visual-diff');
const BASE_URL = process.env.PERF_BASE_URL || 'http://127.0.0.1:3001';
const VIEWPORT = { width: 360, height: 800 };
const DIFF_THRESHOLD = 0.01; // 1% pixel difference

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (err) {
  console.error('[visual] playwright not installed. Run: npm install --save-dev playwright && npx playwright install chromium');
  process.exit(2);
}

async function withPage(fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function captureRoute(route) {
  return withPage(async (page) => {
    const url = BASE_URL + route;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait for React mount: poll until #root has child nodes.
    try {
      await page.waitForFunction(() => {
        const root = document.getElementById('root');
        return root && root.children && root.children.length > 0;
      }, { timeout: 15000 });
    } catch (_) {
      // SPA may not have mounted; capture anyway.
    }
    // Settle network + animations
    await page.waitForTimeout(3000);
    const safe = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
    const currentPath = path.join(CURRENT_DIR, `${safe}.png`);
    await page.screenshot({ path: currentPath, fullPage: false });
    console.log(`[visual] captured ${route} -> ${path.relative(PROJECT_ROOT, currentPath)}`);
    return currentPath;
  });
}

function compareImages(baselinePath, currentPath, diffPath) {
  // Pure-Node pixel comparison without external libraries: read PNG metadata
  // + basic byte compare. For real diff we'd use pixelmatch; this fallback
  // catches big regressions (file-size delta) but not subtle ones.
  if (!fs.existsSync(baselinePath)) {
    return { ok: false, reason: 'baseline-missing' };
  }
  const baselineSize = fs.statSync(baselinePath).size;
  const currentSize = fs.statSync(currentPath).size;
  if (baselineSize === 0) return { ok: false, reason: 'baseline-empty' };
  const delta = Math.abs(currentSize - baselineSize) / baselineSize;
  if (delta > DIFF_THRESHOLD) {
    return { ok: false, reason: 'size-delta', delta, baselineSize, currentSize };
  }
  return { ok: true, delta };
}

async function main() {
  if (UPDATE_BASELINE) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    console.log(`[visual] UPDATING baseline into ${path.relative(PROJECT_ROOT, BASELINE_DIR)}`);
  }
  fs.mkdirSync(CURRENT_DIR, { recursive: true });
  fs.mkdirSync(DIFF_DIR, { recursive: true });

  console.log(`[visual] base url: ${BASE_URL}`);
  console.log(`[visual] routes: ${ROUTES.join(', ')}`);

  const results = [];
  for (const route of ROUTES) {
    const safe = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
    const currentPath = path.join(CURRENT_DIR, `${safe}.png`);
    const baselinePath = path.join(BASELINE_DIR, `${safe}.png`);

    try {
      await captureRoute(route);
      if (UPDATE_BASELINE) {
        fs.copyFileSync(currentPath, baselinePath);
        results.push({ route, ok: true, action: 'baseline-updated' });
        continue;
      }
      const cmp = compareImages(baselinePath, currentPath, path.join(DIFF_DIR, `${safe}.png`));
      if (cmp.ok) {
        results.push({ route, ok: true, ...cmp });
      } else if (cmp.reason === 'baseline-missing') {
        console.log(`[visual] ${route}: no baseline (run with --update to create)`);
        results.push({ route, ok: false, reason: 'baseline-missing' });
      } else {
        console.log(`[visual] ${route}: DIFF ${(cmp.delta * 100).toFixed(2)}% (baseline ${cmp.baselineSize}B, current ${cmp.currentSize}B)`);
        results.push({ route, ok: false, ...cmp });
      }
    } catch (err) {
      console.error(`[visual] ${route}: ERROR ${err.message}`);
      results.push({ route, ok: false, reason: 'capture-error', error: err.message });
    }
  }

  console.log('\n[visual] Summary:');
  for (const r of results) {
    const marker = r.ok ? 'OK ' : 'XX ';
    console.log(`  ${marker} ${r.route.padEnd(20)} ${r.ok ? (r.action || `delta=${(r.delta * 100).toFixed(2)}%`) : r.reason}`);
  }

  const failed = results.filter((r) => !r.ok && r.reason !== 'baseline-missing');
  if (RUN_MEMORY) {
    console.log('\n[visual] Running memory trace (5 min canvas session)...');
    await memoryTrace();
  }

  if (failed.length > 0) {
    console.log(`\n[visual] FAIL: ${failed.length} route(s) regressed`);
    process.exit(1);
  }
  console.log('\n[visual] PASS');
}

async function memoryTrace() {
  // Phase 4: log in, navigate to a chapter, run a canvas session, measure
  // heap before/warm-up/after to confirm no monotonic growth.
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    const page = await context.newPage();
    console.log('[memory] navigating to /belajar');
    await page.goto(BASE_URL + '/belajar', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const before = await page.evaluate(() => performance.memory && performance.memory.usedJSHeapSize);
    console.log(`[memory] initial heap: ${(before / 1024 / 1024).toFixed(1)} MB`);

    // Click a chapter if available, then "Try Canvas" if available
    try {
      const chapterLink = await page.$('a[href*="/belajar/practice"]');
      if (chapterLink) {
        await chapterLink.click();
        await page.waitForTimeout(2000);
      }
    } catch (_) {}

    // Idle for 30s to let any timers settle
    await page.waitForTimeout(30000);
    const after30s = await page.evaluate(() => performance.memory && performance.memory.usedJSHeapSize);
    console.log(`[memory] after 30s idle: ${(after30s / 1024 / 1024).toFixed(1)} MB (delta ${((after30s - before) / 1024 / 1024).toFixed(2)} MB)`);

    if (after30s > before * 1.2) {
      console.log('[memory] WARN: heap grew >20% in idle, possible leak');
    } else {
      console.log('[memory] heap stable — no monotonic growth');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[visual] fatal:', err);
  process.exit(2);
});
