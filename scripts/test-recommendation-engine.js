const assert = require('node:assert/strict');

const {
  buildRecommendationSummary,
  computeSkillNeedScores,
  loadRecommendationCatalog,
  normalizeSkillTag,
  recommendItems,
} = require('../lib/recommendation-engine');

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function run() {
  const catalog = loadRecommendationCatalog();

  assert.equal(catalog.version, '2026-05-20.purcell-v1');
  assert.equal(catalog.questions.length, 76);
  assert.equal(catalog.questions.filter((question) => question.difficulty === 'Super Hard').length, 14);
  assert.ok(catalog.questions.filter((question) => question.storyProblem).length >= 12);

  assert.equal(normalizeSkillTag('chain rule', catalog), 'chain_rule');
  assert.equal(normalizeSkillTag('aturan rantai', catalog), 'chain_rule');
  assert.equal(normalizeSkillTag('composite derivative', catalog), 'chain_rule');
  assert.equal(normalizeSkillTag('u substitution', catalog), 'u_substitution');
  assert.equal(normalizeSkillTag('substitusi u', catalog), 'u_substitution');

  const weakChainRuleAttempts = [
    {
      completedAt: daysAgo(0.2),
      score: 35,
      isCorrect: false,
      weaknessTags: ['chain rule', 'outer-inner function'],
      strengthTags: [],
    },
    {
      completedAt: daysAgo(1),
      score: 45,
      isCorrect: false,
      weaknessTags: ['aturan rantai'],
      strengthTags: [],
    },
    {
      completedAt: daysAgo(2),
      score: 62,
      isCorrect: false,
      weaknessTags: ['composite derivative'],
      strengthTags: ['power rule'],
    },
  ];

  const scores = computeSkillNeedScores(weakChainRuleAttempts, catalog, new Date());
  assert.ok(scores[0].needScore > 60);
  assert.equal(scores[0].skillId, 'chain_rule');
  assert.ok(scores[0].factors.recencyError > 0.7);
  assert.ok(scores[0].factors.lowScore > 0.4);

  const chainRuleItems = recommendItems({ attempts: weakChainRuleAttempts, catalog, now: new Date(), limit: 5 });
  assert.ok(chainRuleItems.length >= 3);
  assert.ok(chainRuleItems.every((item) => item.skillIds.includes('chain_rule')));
  assert.ok(chainRuleItems.every((item) => item.difficulty !== 'Super Hard'));
  assert.ok(chainRuleItems[0].reason.includes('Menerapkan Aturan Rantai'));

  const readyForChallengeAttempts = [
    {
      completedAt: daysAgo(0.1),
      score: 92,
      isCorrect: false,
      weaknessTags: ['related rates', 'geometric modeling'],
      strengthTags: ['chain rule'],
    },
    {
      completedAt: daysAgo(1),
      score: 88,
      isCorrect: false,
      weaknessTags: ['related rates'],
      strengthTags: ['chain rule'],
    },
    {
      completedAt: daysAgo(2),
      score: 95,
      isCorrect: false,
      weaknessTags: ['related rates', 'units'],
      strengthTags: ['chain rule'],
    },
  ];

  const challengeItems = recommendItems({ attempts: readyForChallengeAttempts, catalog, now: new Date(), limit: 5 });
  assert.ok(challengeItems.some((item) => item.difficulty === 'Super Hard'));

  const summary = buildRecommendationSummary({ attempts: weakChainRuleAttempts, catalog, now: new Date() });
  assert.equal(summary.recommendedItems.length, chainRuleItems.length);
  assert.equal(summary.recommendedQuestions.length, chainRuleItems.length);
  assert.ok(summary.weaknesses.includes('Menerapkan Aturan Rantai'));
  assert.ok(summary.overallSummary.includes('3 hasil koreksi'));

  const emptySummary = buildRecommendationSummary({ attempts: [], catalog, now: new Date() });
  assert.equal(emptySummary.recommendedItems.length, 0);
  assert.ok(emptySummary.recommendedQuestions.length >= 3);
}

run();
console.log('recommendation engine tests passed');
