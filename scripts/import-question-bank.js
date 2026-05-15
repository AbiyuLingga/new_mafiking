const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..');
const inputPath = process.env.INPUT || path.join(projectRoot, 'db', 'question-bank.json');
const targetDbPath = process.env.TARGET_DB || path.join(projectRoot, 'db', 'database.sqlite');
const force = process.argv.includes('--force') || process.env.FORCE_IMPORT === '1';

if (!fs.existsSync(inputPath)) {
  console.error(`Question bank not found: ${inputPath}`);
  process.exit(1);
}

const questionBank = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
for (const table of ['chapters', 'subtopics', 'problems', 'problem_steps']) {
  if (!Array.isArray(questionBank[table])) {
    console.error(`Invalid question bank: missing ${table}`);
    process.exit(1);
  }
}

fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
const db = new Database(targetDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(projectRoot, 'db', 'schema.sql'), 'utf-8');
db.exec(schema);

const progressCount = db.prepare('SELECT COUNT(*) AS count FROM user_progress').get().count;
const correctionCount = db.prepare(
  'SELECT COUNT(*) AS count FROM correction_attempts WHERE problem_id IS NOT NULL'
).get().count;

if (!force && (progressCount > 0 || correctionCount > 0)) {
  console.error([
    'Refusing to replace question tables because progress/correction rows reference existing problems.',
    'Run with --force only if you intentionally accept resetting question references.'
  ].join('\n'));
  process.exit(1);
}

const insertChapter = db.prepare(`
  INSERT INTO chapters (id, title, icon, sort_order)
  VALUES (@id, @title, @icon, @sort_order)
`);
const insertSubtopic = db.prepare(`
  INSERT INTO subtopics (id, chapter_id, slug, title, icon, description, sort_order)
  VALUES (@id, @chapter_id, @slug, @title, @icon, @description, @sort_order)
`);
const insertProblem = db.prepare(`
  INSERT INTO problems (
    id, subtopic_id, question_text, question_display, answer_display,
    acceptable_answers, difficulty, question_type, mc_options, sort_order,
    created_by, created_at
  )
  VALUES (
    @id, @subtopic_id, @question_text, @question_display, @answer_display,
    @acceptable_answers, @difficulty, @question_type, @mc_options, @sort_order,
    NULL, COALESCE(@created_at, CURRENT_TIMESTAMP)
  )
`);
const insertStep = db.prepare(`
  INSERT INTO problem_steps (
    id, problem_id, step_order, title, content, why, intuition, mistakes, mistake_result
  )
  VALUES (
    @id, @problem_id, @step_order, @title, @content, @why, @intuition, @mistakes, @mistake_result
  )
`);

const run = db.transaction(() => {
  db.prepare('DELETE FROM problem_steps').run();
  db.prepare('DELETE FROM problems').run();
  db.prepare('DELETE FROM subtopics').run();
  db.prepare('DELETE FROM chapters').run();

  for (const row of questionBank.chapters) {
    insertChapter.run({
      id: row.id,
      title: row.title || '',
      icon: row.icon || '',
      sort_order: Number(row.sort_order) || 0
    });
  }
  for (const row of questionBank.subtopics) {
    insertSubtopic.run({
      id: row.id,
      chapter_id: row.chapter_id,
      slug: row.slug || `subtopic-${row.id}`,
      title: row.title || '',
      icon: row.icon || '',
      description: row.description || '',
      sort_order: Number(row.sort_order) || 0
    });
  }
  for (const row of questionBank.problems) {
    insertProblem.run({
      id: row.id,
      subtopic_id: row.subtopic_id,
      question_text: row.question_text || '',
      question_display: row.question_display || '',
      answer_display: row.answer_display || '',
      acceptable_answers: row.acceptable_answers || '[]',
      difficulty: row.difficulty || 'Easy',
      question_type: row.question_type || 'open',
      mc_options: row.mc_options || '[]',
      sort_order: Number(row.sort_order) || 0,
      created_at: row.created_at || null
    });
  }
  for (const row of questionBank.problem_steps) {
    insertStep.run({
      id: row.id,
      problem_id: row.problem_id,
      step_order: row.step_order,
      title: row.title || '',
      content: row.content || '',
      why: row.why || '',
      intuition: row.intuition || '',
      mistakes: row.mistakes || '',
      mistake_result: row.mistake_result || ''
    });
  }
});

run();

const counts = {
  chapters: db.prepare('SELECT COUNT(*) AS count FROM chapters').get().count,
  subtopics: db.prepare('SELECT COUNT(*) AS count FROM subtopics').get().count,
  problems: db.prepare('SELECT COUNT(*) AS count FROM problems').get().count,
  problem_steps: db.prepare('SELECT COUNT(*) AS count FROM problem_steps').get().count
};
db.close();

console.log(JSON.stringify({ ok: true, target: targetDbPath, counts }, null, 2));
