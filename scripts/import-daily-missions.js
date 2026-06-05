const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..');
const inputPath = process.env.INPUT || path.join(projectRoot, 'db', 'daily-missions.json');
const targetDbPath = process.env.TARGET_DB || path.join(projectRoot, 'db', 'database.sqlite');

if (!fs.existsSync(inputPath)) {
  console.error(`Daily mission bank not found: ${inputPath}`);
  process.exit(1);
}

const missionBank = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
if (!Array.isArray(missionBank.missions)) {
  console.error('Invalid daily mission bank: missing missions');
  process.exit(1);
}

fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
const db = new Database(targetDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(projectRoot, 'db', 'schema.sql'), 'utf-8');
db.exec(schema);

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function tableColumns(tableName) {
  return new Set(
    db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
      .all()
      .map((column) => column.name)
  );
}

function ensureColumn(tableName, columnName, ddl) {
  if (!tableColumns(tableName).has(columnName)) {
    db.exec(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${columnName} ${ddl}`);
  }
}

ensureColumn('daily_missions', 'release_date', "TEXT NOT NULL DEFAULT ''");
ensureColumn('daily_missions', 'image_url', "TEXT DEFAULT ''");
ensureColumn('daily_missions', 'image_alt', "TEXT DEFAULT ''");

const insertMission = db.prepare(`
  INSERT INTO daily_missions (
    id, day, date_label, short_label, release_date, status, mapel,
    target, question, image_url, image_alt, xp, week_label, sort_order
  )
  VALUES (
    @id, @day, @date_label, @short_label, @release_date, @status, @mapel,
    @target, @question, @image_url, @image_alt, @xp, @week_label, @sort_order
  )
`);

const run = db.transaction(() => {
  db.prepare('DELETE FROM daily_missions').run();
  for (const row of missionBank.missions) {
    insertMission.run({
      id: row.id,
      day: Number(row.day) || 1,
      date_label: row.date_label || '',
      short_label: row.short_label || '',
      release_date: row.release_date || '',
      status: row.status || 'locked',
      mapel: row.mapel || '?',
      target: row.target || '',
      question: row.question || '',
      image_url: row.image_url || '',
      image_alt: row.image_alt || '',
      xp: Number(row.xp) || 150,
      week_label: row.week_label || 'Pekan 1',
      sort_order: Number(row.sort_order) || 0,
    });
  }
});

run();

const count = db.prepare('SELECT COUNT(*) AS count FROM daily_missions').get().count;
db.close();

console.log(JSON.stringify({ ok: true, target: targetDbPath, counts: { daily_missions: count } }, null, 2));
