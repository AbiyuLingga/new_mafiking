const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const bank = JSON.parse(fs.readFileSync(path.join(projectRoot, 'db', 'seeds', 'question-bank.json'), 'utf8'));

const chapters = new Map(bank.chapters.map((chapter) => [Number(chapter.id), chapter]));
const subtopics = new Map(bank.subtopics.map((subtopic) => [Number(subtopic.id), subtopic]));

function parseOptions(problem) {
  if (Array.isArray(problem.mc_options)) return problem.mc_options;
  try {
    return JSON.parse(problem.mc_options || '[]');
  } catch (_) {
    return [];
  }
}

function hasExactAnswerOption(problem, options) {
  const answer = String(problem.answer_display || '').trim();
  return Boolean(answer) && options.some((option) => String(option || '').trim() === answer);
}

const fisikaPremiumProblems = bank.problems.filter((problem) => {
  const subtopic = subtopics.get(Number(problem.subtopic_id));
  const chapter = subtopic ? chapters.get(Number(subtopic.chapter_id)) : null;
  return chapter && chapter.mapel === 'Fisika' && /premium/i.test(chapter.title || '');
});

assert.equal(fisikaPremiumProblems.length, 20, 'Fisika Premium seed should contain 20 problems');

for (const problem of fisikaPremiumProblems) {
  const options = parseOptions(problem);
  assert.equal(problem.question_type, 'mc', `Fisika Premium problem ${problem.id} must be multiple-choice`);
  assert.ok(options.length >= 4, `Fisika Premium problem ${problem.id} must have at least 4 choices`);
  assert.ok(hasExactAnswerOption(problem, options), `Fisika Premium problem ${problem.id} choices must include the exact answer`);
}

console.log('question bank quality tests passed');
