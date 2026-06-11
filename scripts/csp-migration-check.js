#!/usr/bin/env node
// CSP Migration Helper
// Phase 5: assist in migrating CSP from report-only to enforce.
//
// This script:
// 1. Inspects current CSP config
// 2. Lists inline scripts/styles that would be blocked under enforcement
// 3. Provides a checklist for safe migration
//
// Usage:
//   node scripts/csp-migration-check.js

const { buildDirectives, isReportOnly, helmetCspOptions } = require('../lib/csp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const MAFIKING_HTML = fs.readFileSync(path.join(ROOT, 'MAFIKING.html'), 'utf-8');
const inlineScripts = (MAFIKING_HTML.match(/<script[^>]*>/g) || []).length;
const inlineStyles = (MAFIKING_HTML.match(/<style[^>]*>/g) || []).length;
const babelScripts = (MAFIKING_HTML.match(/type=["']text\/babel["']/g) || []).length;
const cdnScripts = (MAFIKING_HTML.match(/https?:\/\/[^"' ]+\.js/g) || []);
const cdnStyles = (MAFIKING_HTML.match(/https?:\/\/[^"' ]+\.css/g) || []);

console.log('=== CSP Migration Check ===\n');
console.log('Current state:');
console.log(`  CSP_REPORT_ONLY: ${process.env.CSP_REPORT_ONLY ?? '<unset>'}`);
console.log(`  CSP_ENFORCE: ${process.env.CSP_ENFORCE ?? '<unset>'}`);
console.log(`  isReportOnly: ${isReportOnly()}`);

console.log('\nMAFIKING.html inventory:');
console.log(`  Inline <script>: ${inlineScripts} (Babel: ${babelScripts})`);
console.log(`  Inline <style>: ${inlineStyles}`);
console.log(`  External scripts: ${cdnScripts.length}`);
cdnScripts.forEach((s) => console.log(`    - ${s}`));
console.log(`  External stylesheets: ${cdnStyles.length}`);
cdnStyles.forEach((s) => console.log(`    - ${s}`));

const directives = buildDirectives();
console.log('\nCurrent CSP directives:');
for (const [k, v] of Object.entries(directives)) {
    console.log(`  ${k}: ${Array.isArray(v) ? v.join(' ') : v}`);
}

console.log('\n=== Migration checklist ===');
const blockers = [];
if (babelScripts > 0) blockers.push('Babel inline scripts need nonce or hash migration');
if (inlineStyles > 0) blockers.push('Inline <style> blocks need hashing or external CSS migration');
if (cdnScripts.some((s) => !directives.scriptSrc.includes(s.split('/')[2]))) {
    blockers.push('Some CDN scripts are not in CSP allowlist');
}
if (cdnStyles.some((s) => !directives.styleSrc.includes(s.split('/')[2]))) {
    blockers.push('Some CDN stylesheets are not in CSP allowlist');
}

if (blockers.length > 0) {
    console.log('  ! Migration blockers:');
    for (const b of blockers) console.log(`    - ${b}`);
    console.log('\n  Recommendation: keep CSP_REPORT_ONLY=true; fix blockers first.');
} else {
    console.log('  ok No blockers detected. CSP_ENFORCE=1 can be set safely.');
}

console.log('\nTo enforce:');
console.log('  CSP_ENFORCE=1 npm start');
console.log('  or set in .env: CSP_ENFORCE=1');
