const assert = require('assert');
const {
    calculateTryoutAttemptStats,
    getTryoutChoices,
    normalizeTryoutAttemptInput,
    rankTryoutLeaderboardRows
} = require('../lib/tryout-ranking');

const problems = [
    { id: 10, answer_text: '2', answer_display: '2', mc_options: JSON.stringify(['1', '2', '3', '4']) },
    { id: 11, answer_text: 'x + 1', answer_display: 'x + 1', mc_options: JSON.stringify(['x', 'x + 1', 'x + 2']) },
    { id: 12, answer_text: '7', answer_display: '7', mc_options: '' },
];

const generatedChoices = getTryoutChoices(problems[2], problems);
assert.ok(generatedChoices.includes('7'), 'generated choices must include the correct answer');

const normalized = normalizeTryoutAttemptInput({
    tryoutId: ' free-math-tryout-15 ',
    tryoutTitle: ' Try Out Matematika ',
    problemIds: [10, 11, 12, -1, 'bad'],
    answers: { 10: 1, 11: 0, 12: generatedChoices.indexOf('7') },
    durationSeconds: 734.4,
});

assert.deepStrictEqual(normalized.problemIds, [10, 11, 12]);
assert.strictEqual(normalized.tryoutId, 'free-math-tryout-15');
assert.strictEqual(normalized.durationSeconds, 734);

const stats = calculateTryoutAttemptStats({
    problems,
    answers: normalized.answers,
});

assert.deepStrictEqual(stats, {
    score: 67,
    correctCount: 2,
    totalQuestions: 3,
    answeredCount: 3,
});

const leaderboard = rankTryoutLeaderboardRows([
    { user_id: 1, display_name: 'Alya Amirah', fakultas: 'STEI', score: 93, correct_count: 14, total_questions: 15, answered_count: 15, duration_seconds: 600, completed_at: '2026-06-01T00:00:00Z' },
    { user_id: 2, display_name: 'Budi', fakultas: 'FTSL', score: 93, correct_count: 14, total_questions: 15, answered_count: 15, duration_seconds: 650, completed_at: '2026-06-01T00:05:00Z' },
    { user_id: 1, display_name: 'Alya Amirah', fakultas: 'STEI', score: 80, correct_count: 12, total_questions: 15, answered_count: 15, duration_seconds: 500, completed_at: '2026-06-01T00:10:00Z' },
], 2);

assert.strictEqual(leaderboard.length, 2, 'only best attempt per user should be ranked');
assert.strictEqual(leaderboard[0].rank, 1);
assert.strictEqual(leaderboard[0].initials, 'AA');
assert.strictEqual(leaderboard[1].isMe, true);

console.log('Tryout ranking tests passed');
