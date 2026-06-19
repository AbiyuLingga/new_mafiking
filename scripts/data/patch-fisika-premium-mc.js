const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..', '..');
const seedPath = process.env.INPUT || path.join(projectRoot, 'db', 'seeds', 'question-bank.json');
const targetDbPath = process.env.TARGET_DB || path.join(projectRoot, 'db', 'database.sqlite');
const apply = process.argv.includes('--apply') || process.env.APPLY === '1';
const targetIds = Array.from({ length: 20 }, (_, idx) => 101201 + idx);

function readSeedUpdates() {
  const bank = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const problemsById = new Map(bank.problems.map((problem) => [Number(problem.id), problem]));
  const updates = [];

  for (const id of targetIds) {
    const problem = problemsById.get(id);
    if (!problem) throw new Error(`Seed tidak punya problem ${id}.`);
    let options = [];
    try {
      options = JSON.parse(problem.mc_options || '[]');
    } catch (_) {
      throw new Error(`mc_options problem ${id} bukan JSON valid.`);
    }
    if (problem.question_type !== 'mc') throw new Error(`Seed problem ${id} belum question_type=mc.`);
    if (!Array.isArray(options) || options.length < 4) throw new Error(`Seed problem ${id} belum punya opsi cukup.`);
    if (!options.includes(problem.answer_display)) throw new Error(`Opsi problem ${id} tidak memuat jawaban benar persis.`);
    updates.push({
      id,
      question_type: problem.question_type,
      mc_options: problem.mc_options,
      acceptable_answers: problem.acceptable_answers || '[]',
    });
  }

  return updates;
}

function backupDatabase(db) {
  fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (_) {}
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, 'Z');
  const backupPath = `${targetDbPath}.backup-fisika-premium-mc-${stamp}`;
  fs.copyFileSync(targetDbPath, backupPath);
  return backupPath;
}

if (!fs.existsSync(seedPath)) throw new Error(`Seed tidak ditemukan: ${seedPath}`);
if (!fs.existsSync(targetDbPath)) throw new Error(`Database tidak ditemukan: ${targetDbPath}`);

const updates = readSeedUpdates();
const db = new Database(targetDbPath);
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

try {
  const rows = db.prepare(`
    SELECT p.id, p.question_type, p.mc_options, c.mapel, c.title AS chapter_title
    FROM problems p
    JOIN subtopics s ON s.id = p.subtopic_id
    JOIN chapters c ON c.id = s.chapter_id
    WHERE p.id IN (${targetIds.map(() => '?').join(',')})
    ORDER BY p.id
  `).all(...targetIds);

  if (rows.length !== targetIds.length) {
    const present = new Set(rows.map((row) => Number(row.id)));
    const missing = targetIds.filter((id) => !present.has(id));
    throw new Error(`Database target tidak punya semua problem Fisika Premium. Missing: ${missing.join(', ')}`);
  }

  for (const row of rows) {
    if (row.mapel !== 'Fisika' || row.chapter_title !== 'Fisika Premium') {
      throw new Error(`Problem ${row.id} bukan Fisika Premium (${row.mapel}/${row.chapter_title}).`);
    }
  }

  const alreadyReady = rows.filter((row) => {
    try {
      const options = JSON.parse(row.mc_options || '[]');
      return row.question_type === 'mc' && Array.isArray(options) && options.length >= 4;
    } catch (_) {
      return false;
    }
  }).length;

  console.log(JSON.stringify({
    ok: true,
    apply,
    targetDbPath,
    seedPath,
    targetProblems: targetIds.length,
    alreadyMcReady: alreadyReady,
  }, null, 2));

  if (!apply) {
    console.log('Dry-run saja. Jalankan dengan --apply untuk update 20 soal Fisika Premium.');
    process.exit(0);
  }

  const backupPath = backupDatabase(db);
  const updateProblem = db.prepare(`
    UPDATE problems
    SET question_type = @question_type,
        mc_options = @mc_options,
        acceptable_answers = @acceptable_answers
    WHERE id = @id
  `);

  const run = db.transaction(() => {
    for (const update of updates) updateProblem.run(update);
  });
  run();

  const verify = db.prepare(`
    SELECT COUNT(*) AS count
    FROM problems
    WHERE id IN (${targetIds.map(() => '?').join(',')})
      AND question_type = 'mc'
      AND json_array_length(mc_options) >= 4
  `).get(...targetIds);

  if (Number(verify.count) !== targetIds.length) {
    throw new Error(`Verifikasi gagal: hanya ${verify.count}/${targetIds.length} problem MC-ready.`);
  }

  console.log(JSON.stringify({
    ok: true,
    updated: targetIds.length,
    backupPath,
  }, null, 2));
} finally {
  db.close();
}
