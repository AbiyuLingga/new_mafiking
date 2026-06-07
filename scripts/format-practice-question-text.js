#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const jsonPath = process.env.QUESTION_BANK_JSON || path.join(__dirname, '..', 'db', 'question-bank.json');
const dbPath = process.env.TARGET_DB || process.env.DB_PATH || path.join(__dirname, '..', 'db', 'database.sqlite');

function stripLeadingLabels(text) {
  let next = String(text || '').trim();
  let changed = true;
  while (changed) {
    changed = false;
    const stripped = next
      .replace(/^\s*\[[^\]]+\]\s*/, '')
      .replace(/^\s*\([^)]{3,90}\)\s*/, '');
    if (stripped !== next) {
      next = stripped.trim();
      changed = true;
    }
  }
  return next;
}

function normalizeGraphIntro(text) {
  return text.replace(/^Perhatikan\s+grafik(?:\s+di\s+bawah\s+ini|\s+berikut)?\.\s*/i, 'Perhatikan grafik berikut.\n\n');
}

function formatLineIntersectionQuestion(text) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!/Garis\s+\$l_1\$.*Garis\s+\$l_2\$.*Tentukan luas segitiga\s+\$OAB\$/i.test(compact)) return null;
  const eq1 = compact.match(/Garis\s+\$l_1\$\s+dengan\s+persamaan\s+(\$[^$]+\$)/i)?.[1] || '$y = 2x$';
  const eq2 = compact.match(/garis\s+\$l_2\$\s+dengan\s+persamaan\s+(\$[^$]+\$)/i)?.[1] || '$y = -x + 6$';
  return [
    'Perhatikan grafik berikut.',
    '',
    'Diketahui:',
    `- Garis $l_1$: ${eq1}`,
    `- Garis $l_2$: ${eq2}`,
    '- Garis $l_1$ dan $l_2$ berpotongan di titik $A$',
    '- Garis $l_2$ memotong sumbu-$x$ di titik $B$',
    '- Garis $l_1$ memotong sumbu-$x$ di titik $O(0,0)$',
    '',
    'Tentukan luas segitiga $OAB$.',
  ].join('\n');
}

function splitFinalPrompt(text) {
  const patterns = [
    /\s+(Tentukan\s+[^.?!]+[.?!]?)$/i,
    /\s+(Hitunglah\s+[^.?!]+[.?!]?)$/i,
    /\s+(Hitung\s+[^.?!]+[.?!]?)$/i,
    /\s+(Berapakah\s+[^.?!]+[.?!]?)$/i,
    /\s+(Tuliskan\s+[^.?!]+[.?!]?)$/i,
    /\s+(Orde\s+reaksi\s+total\s+adalah\s+\.\.\.)$/i,
    /\s+(Persen\s+perolehan\s+[^.?!]+adalah\s+\.\.\.)$/i,
    /\s+(Urutkan\s+[^.?!]+[.?!]?)$/i,
    /\s+(Setarakan\s+[^.?!]+[.?!]?)$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const prompt = match[1].trim().replace(/^([a-z])/, (char) => char.toUpperCase());
    const body = text.slice(0, match.index).trim();
    if (!body || body.length < 25) return text;
    return `${body}\n\n${prompt}`;
  }
  return text;
}

function splitDataSentences(text) {
  let next = text;
  next = next.replace(/(\.\s+)(Percobaan\s+\d+:)/g, '.\n$2');
  next = next.replace(/(\.\s+)(Jika\s+)/g, '.\n\n$2');
  next = next.replace(/(\.\s+)(Reaksi\s+yang\s+terjadi:)/g, '.\n\n$2');
  next = next.replace(/(\.\s+)(Posisi\s+partikel\s+berturut-turut\s+adalah\s+)/g, '.\n$2');
  return next;
}

function formatQuestionText(value) {
  const original = String(value || '');
  if (!original.trim()) return original;
  let text = stripLeadingLabels(original);
  text = normalizeGraphIntro(text);

  const lineIntersection = formatLineIntersectionQuestion(text);
  if (lineIntersection) return lineIntersection;

  text = splitDataSentences(text);
  text = splitFinalPrompt(text);
  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || original.trim();
}

function readBundledProblems() {
  if (!fs.existsSync(jsonPath)) return [];
  const bank = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return Array.isArray(bank.problems) ? bank.problems.map((problem) => ({ source: 'json', problem })) : [];
}

function updateBundledJson() {
  if (!fs.existsSync(jsonPath)) return [];
  const bank = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const changes = [];
  for (const problem of bank.problems || []) {
    const before = String(problem.question_display || problem.question_text || '');
    const after = formatQuestionText(before);
    if (after && after !== before) {
      changes.push({ id: problem.id, before, after });
      if (apply) {
        problem.question_display = after;
        problem.question_text = after;
      }
    }
  }
  if (apply && changes.length) {
    fs.writeFileSync(jsonPath, `${JSON.stringify(bank, null, 2)}\n`);
  }
  return changes;
}

function updateDatabase() {
  if (!fs.existsSync(dbPath)) return [];
  const db = new Database(dbPath);
  const rows = db.prepare('SELECT id, question_display, question_text FROM problems ORDER BY id').all();
  const changes = [];
  for (const row of rows) {
    const before = String(row.question_display || row.question_text || '');
    const after = formatQuestionText(before);
    if (after && after !== before) changes.push({ id: row.id, before, after });
  }
  if (apply && changes.length) {
    const update = db.prepare('UPDATE problems SET question_display = ?, question_text = ? WHERE id = ?');
    const tx = db.transaction((items) => {
      for (const item of items) update.run(item.after, item.after, item.id);
    });
    tx(changes);
  }
  db.close();
  return changes;
}

function printChanges(label, changes) {
  console.log(`${label}: ${changes.length} perubahan`);
  for (const change of changes.slice(0, 20)) {
    console.log(`\n#${change.id}`);
    console.log('BEFORE:', change.before.replace(/\n/g, '\\n'));
    console.log('AFTER :', change.after.replace(/\n/g, '\\n'));
  }
  if (changes.length > 20) console.log(`\n... ${changes.length - 20} perubahan lain tidak ditampilkan`);
}

if (require.main === module) {
  const jsonChanges = updateBundledJson();
  const dbChanges = updateDatabase();
  printChanges('Bundled question-bank.json', jsonChanges);
  printChanges('Database', dbChanges);
  console.log(apply ? '\nApplied.' : '\nDry-run saja. Pakai --apply untuk menulis perubahan.');
}

module.exports = { formatQuestionText };
