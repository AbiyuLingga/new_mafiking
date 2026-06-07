const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..');
const inputPath = process.env.INPUT || path.join(projectRoot, 'db', 'question-bank.json');
const targetDbPath = process.env.TARGET_DB || path.join(projectRoot, 'db', 'database.sqlite');
const force = process.argv.includes('--force') || process.env.FORCE_IMPORT === '1';
const merge = process.argv.includes('--merge') || process.env.MERGE_IMPORT === '1';

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

ensureColumn('chapters', 'mapel', "TEXT DEFAULT 'Matematika'");
ensureColumn('chapters', 'semester', 'INTEGER DEFAULT 1');
ensureColumn('chapters', 'description', "TEXT DEFAULT ''");
ensureColumn('chapters', 'est', "TEXT DEFAULT ''");
ensureColumn('chapters', 'topics', "TEXT DEFAULT '[]'");
ensureColumn('problems', 'question_text', "TEXT DEFAULT ''");
ensureColumn('problems', 'created_by', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('problems', 'created_at', 'DATETIME');
ensureColumn('problems', 'image_url', "TEXT DEFAULT ''");
ensureColumn('problems', 'image_alt', "TEXT DEFAULT ''");
ensureColumn('problem_steps', 'mistake_result', "TEXT DEFAULT ''");
ensureColumn('problem_steps', 'hint', "TEXT DEFAULT ''");
ensureColumn('problem_steps', 'hintPlain', "TEXT DEFAULT ''");
ensureColumn('problem_steps', 'hintLatex', "TEXT DEFAULT ''");

const progressCount = db.prepare('SELECT COUNT(*) AS count FROM user_progress').get().count;
const correctionCount = db.prepare(
  'SELECT COUNT(*) AS count FROM correction_attempts WHERE problem_id IS NOT NULL'
).get().count;

if (!force && !merge && (progressCount > 0 || correctionCount > 0)) {
  console.error([
    'Refusing to replace question tables because progress/correction rows reference existing problems.',
    'Run with --merge to upsert bundled rows safely, or --force only if you intentionally accept resetting question references.'
  ].join('\n'));
  process.exit(1);
}

const insertChapter = db.prepare(`
  INSERT INTO chapters (id, title, icon, sort_order, mapel, semester, description, est, topics)
  VALUES (@id, @title, @icon, @sort_order, @mapel, @semester, @description, @est, @topics)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    icon = excluded.icon,
    sort_order = excluded.sort_order,
    mapel = excluded.mapel,
    semester = excluded.semester,
    description = excluded.description,
    est = excluded.est,
    topics = excluded.topics
`);
const insertSubtopic = db.prepare(`
  INSERT INTO subtopics (id, chapter_id, slug, title, icon, description, sort_order)
  VALUES (@id, @chapter_id, @slug, @title, @icon, @description, @sort_order)
  ON CONFLICT(id) DO UPDATE SET
    chapter_id = excluded.chapter_id,
    slug = excluded.slug,
    title = excluded.title,
    icon = excluded.icon,
    description = excluded.description,
    sort_order = excluded.sort_order
`);
const insertProblem = db.prepare(`
  INSERT INTO problems (
    id, subtopic_id, question_text, question_display, answer_display,
    acceptable_answers, difficulty, question_type, mc_options, image_url, image_alt, sort_order,
    created_by, created_at
  )
  VALUES (
    @id, @subtopic_id, @question_text, @question_display, @answer_display,
    @acceptable_answers, @difficulty, @question_type, @mc_options, @image_url, @image_alt, @sort_order,
    NULL, COALESCE(@created_at, CURRENT_TIMESTAMP)
  )
  ON CONFLICT(id) DO UPDATE SET
    subtopic_id = excluded.subtopic_id,
    question_text = excluded.question_text,
    question_display = excluded.question_display,
    answer_display = excluded.answer_display,
    acceptable_answers = excluded.acceptable_answers,
    difficulty = excluded.difficulty,
    question_type = excluded.question_type,
    mc_options = excluded.mc_options,
    image_url = excluded.image_url,
    image_alt = excluded.image_alt,
    sort_order = excluded.sort_order
`);
const insertStep = db.prepare(`
  INSERT INTO problem_steps (
    id, problem_id, step_order, title, content, why, intuition, mistakes, mistake_result,
    hint, hintPlain, hintLatex
  )
  VALUES (
    @id, @problem_id, @step_order, @title, @content, @why, @intuition, @mistakes, @mistake_result,
    @hint, @hintPlain, @hintLatex
  )
  ON CONFLICT(id) DO UPDATE SET
    problem_id = excluded.problem_id,
    step_order = excluded.step_order,
    title = excluded.title,
    content = excluded.content,
    why = excluded.why,
    intuition = excluded.intuition,
    mistakes = excluded.mistakes,
    mistake_result = excluded.mistake_result,
    hint = excluded.hint,
    hintPlain = excluded.hintPlain,
    hintLatex = excluded.hintLatex
`);

const run = db.transaction(() => {
  if (!merge) {
    db.prepare('DELETE FROM problem_steps').run();
    db.prepare('DELETE FROM problems').run();
    db.prepare('DELETE FROM subtopics').run();
    db.prepare('DELETE FROM chapters').run();
  } else {
    const problemIdsWithSteps = Array.from(new Set(
      questionBank.problem_steps
        .map((row) => Number(row.problem_id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ));
    const deleteStepsForProblem = db.prepare('DELETE FROM problem_steps WHERE problem_id = ?');
    for (const problemId of problemIdsWithSteps) {
      deleteStepsForProblem.run(problemId);
    }
  }

  for (const row of questionBank.chapters) {
    insertChapter.run({
      id: row.id,
      title: row.title || '',
      icon: row.icon || '',
      sort_order: Number(row.sort_order) || 0,
      mapel: row.mapel || 'Matematika',
      semester: Number(row.semester) || 1,
      description: row.description || '',
      est: row.est || '',
      topics: typeof row.topics === 'string'
        ? row.topics
        : JSON.stringify(Array.isArray(row.topics) ? row.topics : [])
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
      image_url: row.image_url || '',
      image_alt: row.image_alt || '',
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
      mistake_result: row.mistake_result || '',
      hint: row.hint || '',
      hintPlain: row.hintPlain || '',
      hintLatex: row.hintLatex || ''
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
