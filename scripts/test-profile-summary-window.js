const assert = require('node:assert/strict');

const correctionRouter = require('../routes/correction');

const {
  GEMMA_PROFILE_MODEL,
  MAX_LEARNING_TAGS,
  PROFILE_AI_ATTEMPT_LIMIT,
  PROFILE_AI_REFRESH_COOLDOWN_MS,
  PROFILE_RECOMMENDATION_ATTEMPT_LIMIT,
  buildMasteryHistory,
  buildProfileAiEvidence,
  canBypassProfileAiCooldown,
  compactAttemptsForProfile,
  chooseProfileAttemptSource,
  enrichProfileSummaryRecommendations,
  extractGeneratedText,
  getProfileModels,
  getProfileAiRefreshState,
  normalizeLearningTags,
  summarizeMultipleChoiceEvidence,
} = correctionRouter._profileSummaryInternals;

const {
  normalizeTranscription,
  safeTranscriptionParse,
} = correctionRouter._correctionInternals;

assert.equal(MAX_LEARNING_TAGS, 5);
assert.equal(GEMMA_PROFILE_MODEL, 'gemma-4-31b-it');
assert.equal(PROFILE_AI_ATTEMPT_LIMIT, 20);
assert.equal(PROFILE_RECOMMENDATION_ATTEMPT_LIMIT, 200);
assert.equal(PROFILE_AI_REFRESH_COOLDOWN_MS, 60 * 60 * 1000);
assert.ok(PROFILE_RECOMMENDATION_ATTEMPT_LIMIT > PROFILE_AI_ATTEMPT_LIMIT);
assert.deepEqual(getProfileModels(['gemma-4-31b-it']), ['gemma-4-31b-it']);
assert.equal(
  extractGeneratedText({
    candidates: [{
      content: {
        parts: [
          { text: 'internal thought', thought: true },
          { text: '{"overallSummary":"ok"}' }
        ]
      }
    }]
  }),
  '{"overallSummary":"ok"}'
);

assert.deepEqual(
  normalizeLearningTags([
    'chain rule',
    'u substitution',
    'chain rule',
    'definite integral',
    'limits',
    'derivative',
    'series'
  ]),
  [
    'Menerapkan aturan rantai',
    'Melakukan substitusi u',
    'Integral',
    'Limit',
    'Diferensial'
  ]
);

const attempts = Array.from({ length: 25 }, (_, index) => ({
  completedAt: `2026-05-${String(20 - index).padStart(2, '0')}T00:00:00.000Z`,
  questionText: `Soal ${index + 1}`,
  score: 50,
  isCorrect: false,
  weaknessTags: ['chain rule'],
}));

const aiAttempts = compactAttemptsForProfile(attempts, PROFILE_AI_ATTEMPT_LIMIT);
const recommendationAttempts = compactAttemptsForProfile(attempts, PROFILE_RECOMMENDATION_ATTEMPT_LIMIT);

assert.equal(aiAttempts.length, 20);
assert.equal(aiAttempts[0].nomor, 1);
assert.equal(aiAttempts[19].questionText, 'Soal 20');
assert.equal(recommendationAttempts.length, 25);

const requestAttempts = attempts.slice(0, 50);
const dbAttempts = attempts.concat(Array.from({ length: 175 }, (_, index) => ({
  completedAt: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  questionText: `DB Soal ${index + 1}`,
  score: 70,
  isCorrect: false,
  weaknessTags: ['u substitution'],
})));

assert.equal(chooseProfileAttemptSource(dbAttempts, requestAttempts), dbAttempts);
assert.equal(chooseProfileAttemptSource([], requestAttempts), requestAttempts);

const now = new Date('2026-05-20T14:00:00.000Z');
const ordinaryUser = { id: 7, username: 'mahasiswa', role: 'user' };
const adminUser = { id: 8, username: '123', role: 'admin' };
const refreshDb = {
  prepare(sql) {
    assert.match(sql, /profile_ai_refreshes/);
    return {
      get(userId) {
        if (userId === ordinaryUser.id) {
          return { last_ai_refresh_at: '2026-05-20T13:30:00.000Z' };
        }
        return null;
      }
    };
  }
};

assert.equal(canBypassProfileAiCooldown(ordinaryUser), false);
assert.equal(canBypassProfileAiCooldown(adminUser), true);
const blockedRefresh = getProfileAiRefreshState(refreshDb, ordinaryUser, now);
assert.equal(blockedRefresh.allowed, false);
assert.equal(blockedRefresh.remainingMs, 30 * 60 * 1000);
assert.equal(blockedRefresh.availableAt, '2026-05-20T14:30:00.000Z');
const adminRefresh = getProfileAiRefreshState(refreshDb, adminUser, now);
assert.equal(adminRefresh.allowed, true);
assert.equal(adminRefresh.bypass, true);

const mcEvidence = summarizeMultipleChoiceEvidence([
  {
    answer_display: '4',
    chapter_title: 'Turunan',
    correct: 0,
    correct_answer: '4',
    correct_choice_index: 1,
    created_at: '2026-05-20T13:59:00.000Z',
    difficulty: 'Medium',
    problem_id: 11,
    question_display: '2 + 2 = ?',
    selected_answer: '5',
    selected_choice_index: 2,
    subtopic_id: 101,
    subtopic_title: 'Aljabar Dasar'
  },
  {
    chapter_title: 'Turunan',
    correct: 1,
    created_at: '2026-05-20T13:58:00.000Z',
    difficulty: 'Medium',
    problem_id: 12,
    question_display: '1 + 1 = ?',
    subtopic_id: 101,
    subtopic_title: 'Aljabar Dasar'
  },
  {
    answer_display: '0',
    chapter_title: 'Integral',
    correct: 0,
    correct_answer: '0',
    correct_choice_index: 0,
    created_at: '2026-05-20T13:57:00.000Z',
    difficulty: 'Easy',
    problem_id: 13,
    question_display: 'sin 0 = ?',
    selected_answer: '1',
    selected_choice_index: 3,
    subtopic_id: 102,
    subtopic_title: 'Trigonometri'
  }
]);

assert.equal(mcEvidence.patterns.length, 2);
assert.deepEqual(mcEvidence.patterns[0], {
  chapter: 'Turunan',
  difficulty: 'Medium',
  subtopic: 'Aljabar Dasar',
  totalAttempts: 2,
  wrongAttempts: 1
});
assert.equal(mcEvidence.recentWrong.length, 2);
assert.equal(mcEvidence.recentWrong[0].selectedAnswer, '5');
assert.equal(mcEvidence.recentWrong[0].correctAnswer, '4');
assert.equal(mcEvidence.recentWrong[0].skillId, 101);
assert.equal(mcEvidence.recentWrong[0].subtopicId, 101);

const aiEvidence = buildProfileAiEvidence({ aiAttempts, multipleChoiceEvidence: mcEvidence });
assert.equal(aiEvidence.correctionAttempts.length, 20);
assert.equal(aiEvidence.multipleChoiceEvidence.recentWrong.length, 2);
assert.match(aiEvidence.instructions.multipleChoiceEvidence, /pilihan ganda/);

const masteryHistory = buildMasteryHistory({
  attempts: [
    { correct: 0, createdAt: '2026-05-20T13:59:00.000Z', subtopicId: 101 },
    { correct: 1, createdAt: '2026-05-20T13:58:00.000Z', subtopicId: 101 },
  ]
});
assert.deepEqual(masteryHistory, [
  { correct: 0, createdAt: '2026-05-20T13:59:00.000Z', skillId: 101 },
  { correct: 1, createdAt: '2026-05-20T13:58:00.000Z', skillId: 101 },
]);

const recommendationDb = {
  prepare(sql) {
    if (/SELECT DISTINCT subtopic_id FROM problems/.test(sql)) {
      return {
        all() {
          return [{ subtopic_id: 101 }];
        }
      };
    }
    if (/WHERE p\.subtopic_id = \?/.test(sql)) {
      return {
        get() {
          return {
            id: 201,
            subtopic_id: 101,
            subtopic_title: 'Aljabar Dasar',
            question_display: '2 + 3 = ?',
            question_text: '2 + 3 = ?',
            answer_display: '5',
            difficulty: 'Medium',
            question_type: 'choice',
            mc_options: '["4","5","6"]',
            acceptable_answers: '["5"]',
          };
        }
      };
    }
    if (/WHERE p\.subtopic_id IN/.test(sql)) {
      return {
        all() {
          return [];
        }
      };
    }
    if (/FROM problems p/.test(sql)) {
      return {
        all() {
          return [];
        }
      };
    }
    throw new Error(`Unexpected SQL in recommendation test: ${sql}`);
  }
};

const enrichedRecommendationSummary = enrichProfileSummaryRecommendations(
  recommendationDb,
  7,
  [],
  mcEvidence,
  { weaknesses: [], recommendedQuestions: [], overallSummary: 'Ringkas.' },
  {
    halfLives: { 101: 7 },
    mastery: { 101: 0.35 },
    now: new Date('2026-05-20T14:00:00.000Z'),
  }
);

assert.equal(enrichedRecommendationSummary.recommendedItems.length, 1);
assert.deepEqual(enrichedRecommendationSummary.recommendedItems[0].targetSkill, {
  id: 101,
  label: 'Aljabar',
});
assert.equal(enrichedRecommendationSummary.recommendedItems[0].frontier, true);
assert.equal(enrichedRecommendationSummary.recommendedItems[0].kind, 'new');
assert.equal(enrichedRecommendationSummary.recommendedItems[0].halfLifeDays, 7);
assert.equal(enrichedRecommendationSummary.recommendedItems[0].evidenceAt, '2026-05-20T14:00:00.000Z');
assert.equal(enrichedRecommendationSummary.recommendedItems[0].evidence[0].problemId, 11);

assert.deepEqual(
  normalizeTranscription(
    safeTranscriptionParse('{"detectedAnswerLatex":"1+1=3","readingConfidence":0.91,"unclearParts":[],"needsUserConfirmation":true}'),
    ''
  ),
  {
    detectedAnswerLatex: '1+1=3',
    needsUserConfirmation: true,
    readingConfidence: 0.91,
    unclearParts: []
  }
);

assert.equal(
  normalizeTranscription(
    safeTranscriptionParse('"{\\"detectedAnswerLatex\\":\\"x^2+1\\",\\"readingConfidence\\":0.8,\\"unclearParts\\":[],\\"needsUserConfirmation\\":true}"'),
    ''
  ).detectedAnswerLatex,
  'x^2+1'
);

assert.equal(
  normalizeTranscription(
    safeTranscriptionParse('Gemini OCR result: {"detectedAnswerLatex":"\\\\frac{1}{2}","readingConfidence":0.7,"unclearParts":[],"needsUserConfirmation":true}'),
    ''
  ).detectedAnswerLatex,
  '\\frac{1}{2}'
);

console.log('profile summary window tests passed');
