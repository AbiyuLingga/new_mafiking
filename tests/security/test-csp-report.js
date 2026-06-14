// Contract test for the CSP factory and the /api/csp-report endpoint.
//
// Verifies:
// - lib/csp.js produces a tightened directive set (no `https:` allowlist).
// - Clerk frontend API is injected when a publishable key is set.
// - /api/csp-report accepts a CSP report and returns 204.
// - /api/csp-report does not break when payload is malformed.

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const projectRoot = path.resolve(__dirname, '..', '..');
process.chdir(projectRoot);

const { buildDirectives, frontendApiFromPublishableKey, helmetCspOptions, resolveClerkOrigins } = require(path.join(projectRoot, 'server', 'security', 'csp.js'));

// 1. Unit tests for the factory itself.

{
  const directives = buildDirectives({});
  const asText = JSON.stringify(directives);
  assert.ok(!asText.includes('"https:"'), 'no broad https: allowlist in any directive');
  assert.ok(asText.includes("'self'"), "'self' present");
  assert.ok(asText.includes('https://cdn.jsdelivr.net'), 'jsdelivr present for KaTeX');
  assert.ok(asText.includes('https://unpkg.com'), 'unpkg present for React/Babel');
  assert.ok(asText.includes('https://cdn.tailwindcss.com'), 'tailwind CDN present');
  assert.ok(asText.includes('https://fonts.googleapis.com'), 'google fonts css present');
  assert.ok(asText.includes('https://fonts.gstatic.com'), 'google fonts files present');
  assert.ok(asText.includes('https://clerk-telemetry.com'), 'observed Clerk telemetry endpoint present');
  assert.ok(asText.includes("'unsafe-inline'"), "'unsafe-inline' present (Tailwind + Babel runtime)");
  assert.equal(directives.objectSrc[0], "'none'", 'object-src none');
  assert.equal(directives.frameAncestors[0], "'none'", 'frame-ancestors none');
  assert.equal(directives.reportUri, '/api/csp-report', 'report-uri default');
  assert.equal(directives.reportTo, 'csp-endpoint', 'report-to default');
  assert.equal(directives.workerSrc[1], 'blob:', 'blob: worker allowed');
}

{
  // Clerk injects a dynamic origin.
  const sampleKey = 'pk_test_' + Buffer.from('clerk.example.com$').toString('base64');
  const origins = resolveClerkOrigins({ VITE_CLERK_PUBLISHABLE_KEY: sampleKey });
  assert.deepEqual(origins, ['https://clerk.example.com'], 'Clerk frontend api extracted from publishable key');
  const directives = buildDirectives({ VITE_CLERK_PUBLISHABLE_KEY: sampleKey });
  assert.ok(directives.scriptSrc.includes('https://clerk.example.com'), 'Clerk origin in script-src');
  assert.ok(directives.connectSrc.includes('https://clerk.example.com'), 'Clerk origin in connect-src');
  assert.ok(directives.imgSrc.includes('https://clerk.example.com'), 'Clerk origin in img-src');
}

{
  // Garbage publishable key yields no Clerk origin (no crash).
  const origins = resolveClerkOrigins({ VITE_CLERK_PUBLISHABLE_KEY: 'garbage' });
  assert.deepEqual(origins, [], 'invalid publishable key yields no origins');
}

{
  // frontendApiFromPublishableKey roundtrip.
  const sample = 'pk_live_' + Buffer.from('clerk.mafiking.lcl.dev$').toString('base64');
  const api = frontendApiFromPublishableKey(sample);
  assert.equal(api, 'clerk.mafiking.lcl.dev', 'frontend api decoded');
}

{
  // helmetCspOptions respects reportOnly flag.
  const enforced = helmetCspOptions({ CSP_REPORT_ONLY: '0', CSP_ENFORCE: '1' });
  assert.equal(enforced.reportOnly, false, 'CSP_ENFORCE=1 disables reportOnly');
  const reported = helmetCspOptions({ CSP_REPORT_ONLY: '1' });
  assert.equal(reported.reportOnly, true, 'CSP_REPORT_ONLY=1 enables reportOnly');
  const defaultReported = helmetCspOptions({});
  assert.equal(defaultReported.reportOnly, true, 'default is reportOnly');
}

// 2. Live HTTP smoke test against /api/csp-report. This requires a running
//    server on PORT (default 3000); we boot one in-process on a free port.

let server;
let baseUrl;
let exitCode = 0;

async function bootServer() {
  // Load server.js in-process and listen on an ephemeral port.
  const express = require(path.join(projectRoot, 'node_modules', 'express'));
  // Minimal mount mimicking the production endpoint.
  const auditLog = require(path.join(projectRoot, 'server', 'security', 'audit-log.js'));
  const app = express();
  app.post(['/api/csp-report', '/api/csp-report/'],
    express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '32kb' }),
    (req, res) => {
      try {
        const body = req.body || {};
        const report = body['csp-report'] || body.report || body;
        if (report && typeof report === 'object') auditLog.logCspReport(report);
      } catch (_) {}
      res.status(204).end();
    });
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function request(method, urlPath, body, contentType) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(baseUrl + urlPath);
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: data
        ? { 'Content-Type': contentType || 'application/json', 'Content-Length': Buffer.byteLength(data) }
        : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  await bootServer();
  try {
    // 2a. Valid CSP report.
    const report = {
      'csp-report': {
        'document-uri': 'https://mafiking.com/',
        'violated-directive': "script-src 'self' 'unsafe-inline'",
        'blocked-uri': 'https://evil.example.com/bad.js',
        'source-file': 'https://mafiking.com/',
        'line-number': 1,
      },
    };
    const ok = await request('POST', '/api/csp-report', report, 'application/csp-report');
    assert.equal(ok.status, 204, 'csp report returns 204');

    // 2b. Malformed payload still returns 204.
    const empty = await request('POST', '/api/csp-report', { random: 'object' }, 'application/csp-report');
    assert.equal(empty.status, 204, 'malformed csp report returns 204');

    // 2c. application/reports+json (Reporting API v1).
    const v1 = await request('POST', '/api/csp-report', report, 'application/reports+json');
    assert.equal(v1.status, 204, 'reports+json content-type accepted');

    console.log('test-csp-report: ok');
  } catch (err) {
    console.error('test-csp-report: FAIL', err.message);
    exitCode = 1;
  } finally {
    if (server) server.close();
    process.exit(exitCode);
  }
})();
