#!/usr/bin/env node
// CSP Migration Helper
// Phase 5: assist in migrating CSP from report-only to enforce.
//
// This script:
// 1. Inspects current CSP config
// 2. Inspects the production Vite shell used by the deployed app
// 3. Reports the legacy development shell separately
// 4. Provides a checklist for safe migration
//
// Usage:
//   node scripts/security/csp-migration-check.js

const { buildDirectives, isReportOnly, helmetCspOptions } = require('../../server/security/csp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function readIfPresent(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
}

function inventoryHtml(html) {
  const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
  const styleTags = html.match(/<style\b[^>]*>/gi) || [];
  const externalUrls = html.match(/https?:\/\/[^"' <>)]+/g) || [];
  return {
    inlineScripts: scriptTags.filter((tag) => !/\bsrc\s*=/i.test(tag)).length,
    inlineStyles: styleTags.length,
    babelScripts: scriptTags.filter((tag) => /type=["']text\/babel["']/i.test(tag)).length,
    externalOrigins: [...new Set(externalUrls.map((value) => new URL(value).origin))].sort(),
  };
}

const productionPath = path.join(ROOT, 'dist', 'index.html');
const legacyPath = path.join(ROOT, 'MAFIKING.html');
const productionHtml = readIfPresent(productionPath);
const production = inventoryHtml(productionHtml);
const legacy = inventoryHtml(readIfPresent(legacyPath));

console.log('=== CSP Migration Check ===\n');
console.log('Current state:');
console.log(`  CSP_REPORT_ONLY: ${process.env.CSP_REPORT_ONLY ?? '<unset>'}`);
console.log(`  CSP_ENFORCE: ${process.env.CSP_ENFORCE ?? '<unset>'}`);
console.log(`  isReportOnly: ${isReportOnly()}`);

console.log('\nProduction dist/index.html inventory:');
console.log(`  Present: ${productionHtml ? 'yes' : 'no (run npm run build first)'}`);
console.log(`  Inline <script>: ${production.inlineScripts}`);
console.log(`  Inline <style>: ${production.inlineStyles}`);
console.log(`  External origins: ${production.externalOrigins.join(', ') || '<none>'}`);

console.log('\nLegacy MAFIKING.html inventory (development fallback only):');
console.log(`  Inline <script>: ${legacy.inlineScripts} (Babel: ${legacy.babelScripts})`);
console.log(`  Inline <style>: ${legacy.inlineStyles}`);

const directives = buildDirectives();
console.log('\nCurrent CSP directives:');
for (const [k, v] of Object.entries(directives)) {
    console.log(`  ${k}: ${Array.isArray(v) ? v.join(' ') : v}`);
}

console.log('\n=== Migration checklist ===');
const blockers = [];
if (!productionHtml) blockers.push('Production build is missing; run npm run build');
if (production.inlineScripts > 0) blockers.push('Production inline scripts need nonce or hash migration');
if (production.inlineStyles > 0) blockers.push('Production inline style blocks need hashing or external CSS migration');
const allowedOrigins = new Set(Object.values(directives).flat().filter((value) => /^https:\/\//.test(value)));
const missingOrigins = production.externalOrigins.filter((origin) => !allowedOrigins.has(origin));
if (missingOrigins.length > 0) blockers.push(`Production external origins missing from CSP: ${missingOrigins.join(', ')}`);

if (blockers.length > 0) {
    console.log('  ! Migration blockers:');
    for (const b of blockers) console.log(`    - ${b}`);
    console.log('\n  Recommendation: keep CSP report-only; fix production blockers first.');
} else {
    console.log('  ok No static production blockers detected.');
    console.log('  Review at least 7 days of CSP reports and critical flows before CSP_ENFORCE=1.');
}

console.log('\nTo enforce:');
console.log('  CSP_ENFORCE=1 npm start');
console.log('  or set in .env: CSP_ENFORCE=1');
