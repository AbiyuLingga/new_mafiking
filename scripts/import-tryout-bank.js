const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..');
const inputPath = process.env.INPUT || path.join(projectRoot, 'db', 'tryout-bank.json');
const targetDbPath = process.env.TARGET_DB || path.join(projectRoot, 'db', 'database.sqlite');
const force = process.argv.includes('--force') || process.env.FORCE_IMPORT === '1';

if (!fs.existsSync(inputPath)) {
  console.error(`Tryout bank not found: ${inputPath}`);
  process.exit(1);
}

const tryoutBank = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
for (const table of ['tryout_packages', 'tryout_questions', 'tryout_question_steps']) {
  if (!Array.isArray(tryoutBank[table])) {
    console.error(`Invalid tryout bank: missing ${table}`);
    process.exit(1);
  }
}

fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
const db = new Database(targetDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(projectRoot, 'db', 'schema.sql'), 'utf-8');
db.exec(schema);

const packagesByTryoutId = new Map(
  tryoutBank.tryout_packages
    .filter((row) => String(row.tryout_id || '').trim())
    .map((row) => [String(row.tryout_id).trim(), row])
);
const questionsByTryoutId = new Map();
for (const row of tryoutBank.tryout_questions) {
  const tryoutId = String(row.tryout_id || '').trim();
  if (!tryoutId) continue;
  if (!questionsByTryoutId.has(tryoutId)) questionsByTryoutId.set(tryoutId, []);
  questionsByTryoutId.get(tryoutId).push(row);
}
const stepsByQuestionId = new Map();
for (const row of tryoutBank.tryout_question_steps) {
  const questionId = Number(row.tryout_question_id);
  if (!questionId) continue;
  if (!stepsByQuestionId.has(questionId)) stepsByQuestionId.set(questionId, []);
  stepsByQuestionId.get(questionId).push(row);
}

const readPackage = db.prepare('SELECT id FROM tryout_packages WHERE tryout_id = ? ORDER BY id LIMIT 1');
const updatePackage = db.prepare(`
  UPDATE tryout_packages
  SET title = @title,
      description = @description,
      price = @price,
      original_price = @original_price,
      badge = @badge,
      duration = @duration,
      questions = @questions,
      features = @features,
      tone = @tone,
      sort_order = @sort_order
  WHERE id = @id
`);
const insertPackage = db.prepare(`
  INSERT INTO tryout_packages (
    tryout_id, title, description, price, original_price, badge,
    duration, questions, features, tone, sort_order
  )
  VALUES (
    @tryout_id, @title, @description, @price, @original_price, @badge,
    @duration, @questions, @features, @tone, @sort_order
  )
`);
const insertQuestion = db.prepare(`
  INSERT INTO tryout_questions (
    tryout_id, question_text, question_display, answer_display,
    acceptable_answers, difficulty, question_type, mc_options,
    image_url, image_alt, sort_order, created_by, created_at
  )
  VALUES (
    @tryout_id, @question_text, @question_display, @answer_display,
    @acceptable_answers, @difficulty, @question_type, @mc_options,
    @image_url, @image_alt, @sort_order, NULL, COALESCE(@created_at, CURRENT_TIMESTAMP)
  )
`);
const insertStep = db.prepare(`
  INSERT INTO tryout_question_steps (
    tryout_question_id, step_order, title, content, why, intuition, mistakes, mistake_result
  )
  VALUES (
    @tryout_question_id, @step_order, @title, @content, @why, @intuition, @mistakes, @mistake_result
  )
`);
const attemptCount = db.prepare('SELECT COUNT(*) AS count FROM tryout_attempts WHERE tryout_id = ?');
const existingQuestionCount = db.prepare('SELECT COUNT(*) AS count FROM tryout_questions WHERE tryout_id = ?');
const deleteQuestions = db.prepare('DELETE FROM tryout_questions WHERE tryout_id = ?');

function normalizePackage(row) {
  return {
    tryout_id: String(row.tryout_id || '').trim(),
    title: row.title || '',
    description: row.description || '',
    price: row.price || 'Gratis',
    original_price: row.original_price || null,
    badge: row.badge || '',
    duration: row.duration || '60 mnt',
    questions: Number(row.questions) || 0,
    features: row.features || '[]',
    tone: row.tone || 'default',
    sort_order: Number(row.sort_order) || 0,
  };
}

const summary = {
  packagesUpserted: 0,
  tryoutsImported: 0,
  tryoutsSkipped: [],
  questionsInserted: 0,
  stepsInserted: 0,
};

const run = db.transaction(() => {
  for (const [tryoutId, pkg] of packagesByTryoutId.entries()) {
    const normalized = normalizePackage(pkg);
    const existing = readPackage.get(tryoutId);
    if (existing) updatePackage.run({ ...normalized, id: existing.id });
    else insertPackage.run(normalized);
    summary.packagesUpserted += 1;
  }

  for (const [tryoutId, questions] of questionsByTryoutId.entries()) {
    const attempts = Number(attemptCount.get(tryoutId).count) || 0;
    const existing = Number(existingQuestionCount.get(tryoutId).count) || 0;
    if (!force && attempts > 0) {
      summary.tryoutsSkipped.push({ tryoutId, reason: 'attempts-exist', attempts, existingQuestions: existing });
      continue;
    }

    deleteQuestions.run(tryoutId);
    summary.tryoutsImported += 1;

    for (const question of questions) {
      const info = insertQuestion.run({
        tryout_id: tryoutId,
        question_text: question.question_text || '',
        question_display: question.question_display || '',
        answer_display: question.answer_display || '',
        acceptable_answers: question.acceptable_answers || '[]',
        difficulty: question.difficulty || 'Easy',
        question_type: question.question_type || 'mc',
        mc_options: question.mc_options || '[]',
        image_url: question.image_url || '',
        image_alt: question.image_alt || '',
        sort_order: Number(question.sort_order) || 0,
        created_at: question.created_at || null,
      });
      const newQuestionId = Number(info.lastInsertRowid);
      summary.questionsInserted += 1;

      for (const step of stepsByQuestionId.get(Number(question.id)) || []) {
        insertStep.run({
          tryout_question_id: newQuestionId,
          step_order: Number(step.step_order) || 1,
          title: step.title || '',
          content: step.content || '',
          why: step.why || '',
          intuition: step.intuition || '',
          mistakes: step.mistakes || '',
          mistake_result: step.mistake_result || '',
        });
        summary.stepsInserted += 1;
      }
    }
  }
});

run();
db.close();

console.log(JSON.stringify({ ok: true, target: targetDbPath, ...summary }, null, 2));
