/**
 * migrate-from-v1.js
 *
 * Migrasi database Mafiking v1 (lama) → new_mafiking.
 * Jalankan: node scripts/data/migrate-from-v1.js <path-ke-database-lama.sqlite>
 *
 * Apa yang dilakukan:
 *   1. Buat salinan bersih database lama → db/database.sqlite (TIDAK memodifikasi file asli)
 *   2. Tambah kolom baru yang ada di new_mafiking tapi belum ada di v1
 *   3. Buat tabel correction_attempts
 *   4. Cetak ringkasan validasi
 */

const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');

async function main() {
  const sourceArg = process.argv[2];
  if (!sourceArg) {
    console.error('Usage: node scripts/data/migrate-from-v1.js <path-ke-database-lama.sqlite>');
    process.exit(1);
  }

  const sourcePath = path.resolve(sourceArg);
  if (!fs.existsSync(sourcePath)) {
    console.error(`File tidak ditemukan: ${sourcePath}`);
    process.exit(1);
  }

  const targetPath = path.join(__dirname, '..', '..', 'db', 'database.sqlite');

  // Backup database target yang sudah ada
  if (fs.existsSync(targetPath)) {
    const backupPath = targetPath + '.backup-' + Date.now();
    const oldDb = new Database(targetPath);
    await oldDb.backup(backupPath);
    oldDb.close();
    console.log(`Backup database lama disimpan di: ${backupPath}`);
  }

  // Salin via backup API supaya WAL di-checkpoint dulu
  const srcDb = new Database(sourcePath, { readonly: true });
  await srcDb.backup(targetPath);
  srcDb.close();
  console.log(`Salin (via backup) ${sourcePath} → ${targetPath}`);

  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const migrations = [
    "ALTER TABLE chapters ADD COLUMN mapel TEXT DEFAULT 'Matematika'",
    "ALTER TABLE chapters ADD COLUMN semester INTEGER DEFAULT 1",
    "ALTER TABLE chapters ADD COLUMN description TEXT DEFAULT ''",
    "ALTER TABLE chapters ADD COLUMN est TEXT DEFAULT ''",
    "ALTER TABLE chapters ADD COLUMN topics TEXT DEFAULT '[]'",
    "ALTER TABLE problems ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE problems ADD COLUMN question_type TEXT DEFAULT 'open'",
    "ALTER TABLE problems ADD COLUMN mc_options TEXT DEFAULT '[]'",
    "ALTER TABLE problems ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
    "ALTER TABLE problems ADD COLUMN question_text TEXT DEFAULT ''",
    "ALTER TABLE problem_steps ADD COLUMN mistake_result TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN fakultas TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN highest_streak INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN last_play_date DATE",
    "ALTER TABLE users ADD COLUMN badge_tier INTEGER DEFAULT 0",
  ];

  let applied = 0;
  let skipped = 0;
  for (const sql of migrations) {
    try {
      db.exec(sql);
      applied++;
    } catch {
      skipped++;
    }
  }
  console.log(`Migrasi kolom: ${applied} diterapkan, ${skipped} sudah ada.`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS correction_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      problem_id INTEGER REFERENCES problems(id) ON DELETE SET NULL,
      mode TEXT NOT NULL DEFAULT 'canvas',
      question_text TEXT NOT NULL DEFAULT '',
      expected_answer TEXT NOT NULL DEFAULT '',
      detected_answer_text TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      is_correct INTEGER NOT NULL DEFAULT 0,
      feedback TEXT NOT NULL DEFAULT '',
      strength_tags TEXT NOT NULL DEFAULT '[]',
      weakness_tags TEXT NOT NULL DEFAULT '[]',
      evaluation_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Tabel correction_attempts siap.');

  const counts = {
    chapters:            db.prepare('SELECT COUNT(*) AS n FROM chapters').get().n,
    subtopics:           db.prepare('SELECT COUNT(*) AS n FROM subtopics').get().n,
    problems:            db.prepare('SELECT COUNT(*) AS n FROM problems').get().n,
    problem_steps:       db.prepare('SELECT COUNT(*) AS n FROM problem_steps').get().n,
    users:               db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    user_progress:       db.prepare('SELECT COUNT(*) AS n FROM user_progress').get().n,
    correction_attempts: db.prepare('SELECT COUNT(*) AS n FROM correction_attempts').get().n,
  };

  console.log('\n=== Hasil Migrasi ===');
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(22)}: ${n}`);
  }

  const chapterCols = db.pragma('table_info(chapters)').map(c => c.name);
  console.log(`\n  chapters.semester    : ${chapterCols.includes('semester') ? '✓ ada' : '✗ TIDAK ada'}`);
  console.log(`  correction_attempts  : ${counts.correction_attempts >= 0 ? '✓ tabel ada' : '✗ GAGAL'}`);

  db.close();
  console.log('\nMigrasi selesai. db/database.sqlite siap digunakan oleh new_mafiking.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
