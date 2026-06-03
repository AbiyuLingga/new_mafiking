// Heuristic XSS-pattern scanner for the static-Babel frontend.
//
// What it does:
// 1. Lists every `dangerouslySetInnerHTML={...}` and `innerHTML=` site in
//    src/ (excluding the generated Vite bundle and the local dist/ output).
// 2. For each site, captures the helper function being called (if any) so
//    we can spot sites that pass RAW user-controlled text through
//    dangerouslySetInnerHTML without going through a math/escape helper.
//
// This is intentionally lightweight (no AST) — it is the smoke test, not
// the final word. The real audit is the manual review in
// docs/security/audit-2026-06.md and the per-call-site review during code
// review.
//
// Run via `node scripts/scan-xss-patterns.js` or as part of `npm run check`.

const fs = require('node:fs');
const path = require('node:path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const SKIP_DIRS = new Set(['dist', 'node_modules']);

const PATTERNS = [
  { name: 'dangerouslySetInnerHTML', regex: /dangerouslySetInnerHTML\s*[:=]\s*\{\s*\{?\s*__html\s*:\s*([^\n}]+?)(?:\s*\}\s*\}|\s*\}\s*,?)/g },
  { name: 'innerHTML', regex: /\.innerHTML\s*=\s*([^;\n]+)/g },
  { name: 'outerHTML', regex: /\.outerHTML\s*=\s*([^;\n]+)/g },
  { name: 'document.write', regex: /document\.write(?:ln)?\s*\(/g },
  { name: 'eval', regex: /(?<![A-Za-z0-9_$.])eval\s*\(/g },
  { name: 'new Function', regex: /new\s+Function\s*\(/g },
];

// Helpers that are known to be safe (escape or render with a safe API).
const SAFE_HELPERS = new Set([
  'renderMafikingMathHTML',
  'renderNarrativeHTML',
  'renderEquationHTML',
  'renderKatexToString',
  'escapeHtml',
  'xss', // the xss library used in routes/auth.js
]);

// Helpers that have been manually reviewed and confirmed safe in the
// audit-2026-06.md review. When adding a new helper to this set, the audit
// doc must be updated to record the review.
const MANUALLY_REVIEWED_SAFE = new Set([
  'renderRecommendationQuestionHTML', // src/profile.jsx — escapes via escapeHtml or math helper; verified in audit-2026-06.md
]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && entry.name.endsWith('.jsx')) files.push(full);
  }
  return files;
}

function firstIdentifier(expr) {
  const m = String(expr || '').match(/([A-Za-z_$][\w$]*)/);
  return m ? m[1] : '';
}

const files = walk(SRC_DIR);
const findings = [];
let totalHits = 0;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.join(__dirname, '..'), file);

  for (const { name, regex } of PATTERNS) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      totalHits += 1;
      const expr = (m[1] || '').trim();
      const helper = firstIdentifier(expr);
      const isSafeHelper = SAFE_HELPERS.has(helper) || MANUALLY_REVIEWED_SAFE.has(helper);
      const lineNo = text.slice(0, m.index).split('\n').length;
      findings.push({
        file: rel,
        line: lineNo,
        pattern: name,
        helper: helper || '(none / raw)',
        snippet: text.split('\n')[lineNo - 1].trim().slice(0, 160),
        safe: isSafeHelper,
        concern: !isSafeHelper
          ? 'Uses dangerouslySetInnerHTML/innerHTML/eval without a known-safe helper — review for XSS.'
          : null,
      });
    }
  }
}

const unsafe = findings.filter((f) => !f.safe);
const safe = findings.filter((f) => f.safe);

if (unsafe.length > 0) {
  console.error('XSS pattern scanner: UNSAFE sites found:');
  for (const f of unsafe) {
    console.error(`  ${f.file}:${f.line} [${f.pattern} via ${f.helper}]`);
    console.error(`     ${f.snippet}`);
    console.error(`     → ${f.concern}`);
  }
  console.error(`\n${unsafe.length} unsafe / ${totalHits} total hits in ${files.length} files.`);
  process.exit(1);
}

console.log(`XSS pattern scanner: ${totalHits} hits across ${files.length} files, all use a known-safe helper (${[...new Set(safe.map((f) => f.helper))].join(', ')}).`);
