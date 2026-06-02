const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..');
const sourceDbPath = process.env.SOURCE_DB || path.join(projectRoot, 'db', 'database.sqlite');
const outputPath = process.env.OUTPUT || path.join(projectRoot, 'db', 'tryout-bank.json');

if (!fs.existsSync(sourceDbPath)) {
  console.error(`Tryout source database not found: ${sourceDbPath}`);
  process.exit(1);
}

const db = new Database(sourceDbPath, { readonly: true, fileMustExist: true });

const tryoutIds = db.prepare(`
  SELECT DISTINCT tryout_id
  FROM tryout_questions
  WHERE tryout_id <> ''
  ORDER BY tryout_id
`).all().map((row) => row.tryout_id);

const packages = db.prepare(`
  SELECT id, tryout_id, title, description, price, original_price, badge, duration,
         questions, features, tone, sort_order
  FROM tryout_packages
  WHERE tryout_id <> ''
  ORDER BY sort_order, id
`).all();

const questions = db.prepare(`
  SELECT id, tryout_id, question_text, question_display, answer_display,
         acceptable_answers, difficulty, question_type, mc_options, image_url,
         image_alt, sort_order, created_at
  FROM tryout_questions
  WHERE tryout_id <> ''
  ORDER BY tryout_id, sort_order, id
`).all();

const steps = db.prepare(`
  SELECT s.id, s.tryout_question_id, q.tryout_id, q.sort_order AS question_sort_order,
         s.step_order, s.title, s.content, s.why, s.intuition, s.mistakes, s.mistake_result
  FROM tryout_question_steps s
  JOIN tryout_questions q ON q.id = s.tryout_question_id
  WHERE q.tryout_id <> ''
  ORDER BY q.tryout_id, q.sort_order, q.id, s.step_order, s.id
`).all();

const bank = {
  exportedAt: new Date().toISOString(),
  source: path.relative(projectRoot, sourceDbPath),
  tryoutIds,
  tryout_packages: packages,
  tryout_questions: questions,
  tryout_question_steps: steps,
};

db.close();

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(bank, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  output: outputPath,
  counts: {
    tryoutIds: tryoutIds.length,
    tryout_packages: packages.length,
    tryout_questions: questions.length,
    tryout_question_steps: steps.length,
  },
}, null, 2));
