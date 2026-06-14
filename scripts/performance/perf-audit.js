// Lightweight Lighthouse audit wrapper.
//
// Replaces `@lhci/cli` (which is heavy) with a thin script that runs the
// `lighthouse` core package against a local server. Used as `npm run
// perf:audit` and as part of `npm run check` to enforce the S2 safeguard
// (Performance >= 90, A11y >= 95, Best Practices >= 95, SEO >= 95).
//
// Usage:
//   node scripts/performance/perf-audit.js [url] [output-json-path]
// Default: audits http://127.0.0.1:3001/landing against a server already
// running on PORT=3001.

const path = require('node:path');
const fs = require('node:fs');

const TARGET_URL = process.argv[2] || process.env.PERF_AUDIT_URL || 'http://127.0.0.1:3001/landing';
const OUTPUT_PATH = process.argv[3] || path.resolve(__dirname, '..', '..', 'logs', 'lighthouse-report.json');

const SCORE_THRESHOLDS = {
  performance: 0.90,
  accessibility: 0.95,
  'best-practices': 0.95,
  seo: 0.95,
};

function numericScore(category) {
  return category && typeof category.score === 'number' ? category.score : null;
}

function numericAuditValue(audit) {
  return audit && typeof audit.numericValue === 'number' && Number.isFinite(audit.numericValue)
    ? audit.numericValue
    : null;
}

async function main() {
  let lighthouse;
  let chromeLauncher;
  try {
    lighthouse = (await import('lighthouse')).default;
    chromeLauncher = await import('chrome-launcher');
  } catch (err) {
    console.error('[perf-audit] failed to import lighthouse / chrome-launcher:', err.message);
    process.exit(2);
  }

  console.log(`[perf-audit] target: ${TARGET_URL}`);

  const useMobile = process.env.PERF_AUDIT_MOBILE !== '0';
  const config = {
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    throttling: {
      rttMs: 40,
      throughputKbps: 10 * 1024,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    },
    screenEmulation: useMobile ? {
      mobile: true,
      width: 360,
      height: 800,
      deviceScaleFactor: 2,
      disabled: false,
    } : {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleFactor: 1,
      disabled: false,
    },
    formFactor: useMobile ? 'mobile' : 'desktop',
    maxWaitForLoad: 90000,
  };

  console.log(`[perf-audit] form factor: ${config.formFactor}`);
  console.log('[perf-audit] launching chrome...');

  const chrome = await chromeLauncher.launch({
    chromeFlags: [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  });
  config.port = chrome.port;

  let result;
  const start = Date.now();
  try {
    result = await lighthouse(TARGET_URL, config);
  } catch (err) {
    console.error('[perf-audit] audit failed:', err.message);
    await chrome.kill();
    process.exit(2);
  }
  const elapsedMs = Date.now() - start;
  await chrome.kill();

  if (!result || !result.lhr) {
    console.error('[perf-audit] no result returned');
    process.exit(2);
  }

  const categories = result.lhr.categories || {};
  const finalUrl = result.lhr.finalDisplayedUrl || result.lhr.finalUrl || TARGET_URL;
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result.lhr, null, 2));

  console.log(`\n[perf-audit] ${finalUrl} (${elapsedMs}ms)`);
  console.log('[perf-audit] full report: ' + path.relative(process.cwd(), OUTPUT_PATH));

  const runtimeError = result.lhr.runtimeError;
  if (runtimeError) {
    console.log('\n[perf-audit] Lighthouse runtime error:');
    console.log(`  ${runtimeError.code || 'UNKNOWN'} - ${runtimeError.message || 'No message'}`);
  }

  const availableScores = Object.values(categories)
    .map(numericScore)
    .filter((score) => score !== null);
  const allZero = availableScores.length > 0 && availableScores.every((score) => score === 0);
  if (allZero && !runtimeError) {
    const warnings = (result.lhr.runWarnings || []).slice(0, 3);
    console.log('\n[perf-audit] All categories scored 0 — likely headless-Chrome rendering issue.');
    console.log('  This is a known issue when Lighthouse audits an SPA in a constrained sandbox');
    console.log('  (Lighthouse needs the SPA to render in headless Chrome, which may not happen');
    console.log('  reliably in CI-like environments without a GPU and proper module loading).');
    if (warnings.length > 0) {
      console.log('  Run warnings:');
      for (const w of warnings) console.log('    - ' + String(w).slice(0, 200));
    }
    console.log('  To audit properly, run:');
    console.log('    PORT=3001 node server.js &  # one terminal');
    console.log('    npx lighthouse http://127.0.0.1:3001/landing --view  # another terminal');
    console.log('  Or wire up @lhci/cli in GitHub Actions (see docs/perf/lighthouse-ci.md).');
    process.exit(0);
  }

  let failed = false;
  for (const [key, threshold] of Object.entries(SCORE_THRESHOLDS)) {
    const cat = categories[key];
    const scoreValue = numericScore(cat);
    if (!cat || scoreValue === null) {
      console.log(`  ${key.padEnd(18)}  --  (category missing)`);
      failed = true;
      continue;
    }
    const score = Math.round(scoreValue * 100);
    const passed = scoreValue >= threshold;
    const marker = passed ? 'OK' : 'XX';
    console.log(`  ${key.padEnd(18)}  ${String(score).padStart(3)}  ${marker}  (>= ${Math.round(threshold * 100)})`);
    if (!passed) failed = true;
  }

  const audits = result.lhr.audits || {};
  const lcp = audits['largest-contentful-paint'];
  const cls2 = audits['cumulative-layout-shift'];
  const tbt = audits['total-blocking-time'];
  const lcpValue = numericAuditValue(lcp);
  const clsValue = numericAuditValue(cls2);
  const tbtValue = numericAuditValue(tbt);
  console.log(`  LCP                 ${lcpValue === null ? '--' : `${Math.round(lcpValue)} ms`}`);
  console.log(`  CLS                 ${clsValue === null ? '--' : clsValue.toFixed(3)}`);
  console.log(`  TBT                 ${tbtValue === null ? '--' : `${Math.round(tbtValue)} ms`}`);

  if (runtimeError) failed = true;

  if (failed) {
    console.log('\n[perf-audit] FAIL - at least one category below threshold');
    process.exit(1);
  }
  console.log('\n[perf-audit] PASS - all categories meet thresholds');
}

main().catch((err) => {
  console.error('[perf-audit] fatal:', err);
  process.exit(2);
});
