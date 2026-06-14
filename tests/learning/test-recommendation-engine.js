const assert = require('node:assert/strict');

const {
  buildRecommendationSummary,
  computeSkillNeedScores,
  computeFactors,
  computeBktLite,
  computePerSkillHalfLifeLite,
  computeFrontier,
  enrichWithCatalog,
  interleaveRecallSlots,
  deduplicateRecentlySolved,
  loadRecommendationCatalog,
  normalizeSkillTag,
  recommendItems,
} = require('../../server/learning/recommendation-engine');

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function testBktLiteMonotonicity() {
  const correctHistory = Array.from({ length: 15 }, () => ({ skillId: 'mcq_basic', correct: true }));
  const wrongHistory = Array.from({ length: 15 }, () => ({ skillId: 'mcq_basic', correct: false }));

  const good = computeBktLite(correctHistory);
  const bad = computeBktLite(wrongHistory);

  assert.ok(good.mastery.mcq_basic > 0.7, `expected pMastery>0.7 for all-correct, got ${good.mastery.mcq_basic}`);
  assert.ok(bad.mastery.mcq_basic < 0.3, `expected pMastery<0.3 for all-wrong, got ${bad.mastery.mcq_basic}`);
  assert.ok(good.mastery.mcq_basic >= 0 && good.mastery.mcq_basic <= 1, 'pMastery must stay in [0,1]');
  assert.ok(bad.mastery.mcq_basic >= 0 && bad.mastery.mcq_basic <= 1, 'pMastery must stay in [0,1]');
  assert.equal(good.history.length, 15);
  assert.equal(bad.history.length, 15);
}

function testHalfLifeClamp() {
  const allCorrect = Array.from({ length: 10 }, () => ({ skillId: 's1', correct: true }));
  const allWrong = Array.from({ length: 10 }, () => ({ skillId: 's2', correct: false }));
  const mixed = [
    { skillId: 's3', correct: true },
    { skillId: 's3', correct: false },
  ];

  const fast = computePerSkillHalfLifeLite(allCorrect, { baseHalfLife: 100 });
  const slow = computePerSkillHalfLifeLite(allWrong, { baseHalfLife: 0.1 });
  const mid = computePerSkillHalfLifeLite(mixed, { baseHalfLife: 7 });

  assert.equal(fast.s1, 30, 'high base + all correct must clamp to 30');
  assert.equal(slow.s2, 1, 'low base + all wrong must clamp to 1');
  assert.equal(mid.s3, 7, 'mixed 0.5 success at base 7 must equal 7');
}

function testFrontierKind() {
  const masteredReady = computeFrontier({ pMastery: 0.85, prereqMastery: 0.7, attempts: 20, last30: 5 });
  assert.equal(masteredReady.kind, 'review', 'mastered + prereq ready must be review');
  assert.equal(masteredReady.frontier, false, 'mastered + prereq ready must not be frontier');

  const masteredWeakPrereq = computeFrontier({ pMastery: 0.85, prereqMastery: 0.4, attempts: 20, last30: 5 });
  assert.equal(masteredWeakPrereq.kind, 'new', 'mastered but weak prereq must be new');
  assert.equal(masteredWeakPrereq.frontier, true, 'mastered but weak prereq must be frontier');

  const lowMastery = computeFrontier({ pMastery: 0.3, prereqMastery: 0.9, attempts: 3, last30: 1 });
  assert.equal(lowMastery.kind, 'new', 'low pMastery must be new');
  assert.equal(lowMastery.frontier, true, 'low pMastery must be frontier');
}

function testRecencyErrorWeight() {
  const stat = { totalAttempts: 2, wrongAttempts: 2, scoreSum: 50, lastWrongAt: new Date('2026-06-01T00:00:00Z') };
  const now = new Date('2026-06-03T00:00:00Z');
  const halfLife = 7;
  const prereq = 0.1;

  const base = computeFactors(stat, now, halfLife, prereq, {});
  const mastered = computeFactors(stat, now, halfLife, prereq, { pMastery: 0.85 });
  const weak = computeFactors(stat, now, halfLife, prereq, { pMastery: 0.1 });

  assert.ok(base.recencyError > 0, 'base recencyError must be positive when lastWrongAt present');
  assert.equal(weak.recencyError, base.recencyError, 'pMastery<0.8 must not change recencyError');
  const ratio = mastered.recencyError / base.recencyError;
  assert.ok(Math.abs(ratio - 0.3) < 0.01, `mastery pMastery=0.85 must scale recencyError to 0.3x, got ratio ${ratio}`);
}

function testEnrichDeterminism() {
  const fixedNow = new Date('2026-06-03T00:00:00Z');
  const recItems = [
    { ref: 'X', targetSkill: { id: 'chain_rule' }, skillIds: ['chain_rule'] },
  ];
  const mcEvidence = [
    {
      problemId: 7,
      skillIds: ['chain_rule'],
      selectedAnswer: 'A',
      correctAnswer: 'B',
      createdAt: '2026-06-02T00:00:00Z',
    },
  ];

  const a = enrichWithCatalog(recItems, { mcEvidence, mastery: { chain_rule: 0.5 }, halfLives: { chain_rule: 7 }, now: fixedNow });
  const b = enrichWithCatalog(recItems, { mcEvidence, mastery: { chain_rule: 0.5 }, halfLives: { chain_rule: 7 }, now: fixedNow });

  assert.deepEqual(a, b, 'two enrich calls with same now must produce equal output');
  assert.equal(a[0].evidenceAt, fixedNow.toISOString(), 'evidenceAt must equal fixed now');
}

function testEvidenceNonEmpty() {
  const fixedNow = new Date('2026-06-03T00:00:00Z');
  const recItems = [
    { ref: 'X', targetSkill: { id: 'chain_rule' }, skillIds: ['chain_rule'] },
  ];
  const mcEvidence = [
    {
      problemId: 7,
      skillIds: ['chain_rule'],
      selectedAnswer: 'A',
      correctAnswer: 'B',
      createdAt: '2026-06-02T00:00:00Z',
    },
  ];

  const out = enrichWithCatalog(recItems, { mcEvidence, mastery: {}, halfLives: {}, now: fixedNow });
  assert.ok(out[0].evidence.length > 0, 'evidence must be non-empty when mcEvidence matches skill');
  assert.equal(out[0].evidence[0].problemId, 7, 'evidence[0].problemId must round-trip');
  assert.equal(out[0].frontier, true, 'pMastery=undefined must yield frontier=true');
  assert.equal(out[0].kind, 'new', 'pMastery=undefined must yield kind=new');
  assert.equal(out[0].halfLifeDays, null, 'halfLives missing must yield halfLifeDays=null');
  assert.equal(out[0].evidenceAt, fixedNow.toISOString(), 'evidenceAt must equal fixed now');
}

function testInterleaveInjection() {
  const items = [
    { id: 'F1', kind: 'new' },
    { id: 'F2', kind: 'new' },
    { id: 'F3', kind: 'new' },
    { id: 'R1', kind: 'review' },
    { id: 'F4', kind: 'new' },
  ];

  const result = interleaveRecallSlots(items, { every: 3 });
  assert.equal(result[0].id, 'F1');
  assert.equal(result[1].id, 'F2');
  assert.equal(result[2].id, 'F3');
  assert.equal(result[3].id, 'R1', 'recall slot must be injected after every 3 frontier items');
  assert.equal(result[4].id, 'F4');
  assert.equal(result.length, 5);
}

function testDeduplicateRecentlySolved() {
  const items = [
    { ref: 'A', problemId: 1 },
    { ref: 'B', problemId: 2 },
    { ref: 'C' },
  ];
  const solved = new Set(['p:1', 'r:C']);

  const result = deduplicateRecentlySolved(items, solved);
  assert.equal(result.length, 1, 'A (p:1) and C (r:C) must be filtered out');
  assert.equal(result[0].ref, 'B', 'only B (p:2) must remain');
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

  testBktLiteMonotonicity();
  testHalfLifeClamp();
  testFrontierKind();
  testRecencyErrorWeight();
  testEnrichDeterminism();
  testEvidenceNonEmpty();
  testInterleaveInjection();
  testDeduplicateRecentlySolved();
}

run();
console.log('recommendation engine tests passed');
