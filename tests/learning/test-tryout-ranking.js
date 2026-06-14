const assert = require('assert');
const {
    buildTryoutReviewSnapshot,
    calculateTryoutAttemptStats,
    getTryoutChoices,
    normalizeTryoutAttemptInput,
    rankTryoutLeaderboardRows
} = require('../../server/learning/tryout-ranking');

const problems = [
    { id: 10, answer_display: '2', acceptable_answers: JSON.stringify(['2']), mc_options: JSON.stringify(['1', '2', '3', '4']) },
    { id: 11, answer_display: 'x + 1', acceptable_answers: JSON.stringify(['x+1']), mc_options: JSON.stringify(['x', 'x + 1', 'x + 2']) },
    { id: 12, answer_display: '7', acceptable_answers: JSON.stringify(['7']), mc_options: '' },
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

const shuffledChoiceMap = {
    20: ['Benar', 'Salah A', 'Salah B', 'Salah C'],
};
const shuffledInput = normalizeTryoutAttemptInput({
    tryoutId: 'free-math-tryout-15',
    problemIds: [20],
    answers: { 20: 0 },
    choiceMap: shuffledChoiceMap,
});
assert.deepStrictEqual(shuffledInput.choiceMap, shuffledChoiceMap, 'choice snapshots must be accepted from the client');
const shuffledStats = calculateTryoutAttemptStats({
    problems: [
        { id: 20, answer_display: 'Benar', acceptable_answers: JSON.stringify(['Benar']), mc_options: JSON.stringify(['Salah A', 'Benar', 'Salah B', 'Salah C']) },
    ],
    answers: shuffledInput.answers,
    choiceMap: shuffledInput.choiceMap,
});
assert.deepStrictEqual(shuffledStats, {
    score: 100,
    correctCount: 1,
    totalQuestions: 1,
    answeredCount: 1,
});

const review = buildTryoutReviewSnapshot({
    tryoutId: 'free-math-tryout-15',
    tryoutTitle: 'Try Out Matematika',
    durationSeconds: 734,
    questions: [
        {
            id: 10,
            question_text: 'Hitung 1 + 1',
            question_display: '1 + 1',
            answer_display: '2',
            acceptable_answers: JSON.stringify(['2']),
            mc_options: JSON.stringify(['1', '2', '3', '4']),
            image_url: '/assets/tryout/example.svg',
            image_alt: 'Diagram contoh',
            steps: [
                { step_order: 1, title: 'Jumlahkan', content: '1 + 1 = 2', why: 'Definisi penjumlahan' },
            ],
        },
        {
            id: 11,
            question_text: 'Turunan x^2',
            question_display: 'd/dx x^2',
            answer_display: '2x',
            acceptable_answers: JSON.stringify(['2x']),
            mc_options: JSON.stringify(['x', 'x^2', '2x']),
            steps: [],
        },
    ],
    answers: { 10: 1, 11: 0 },
    choiceMap: {
        10: ['2', '1', '3', '4'],
        11: ['2x', 'x', 'x^2'],
    },
});

assert.strictEqual(review.stats.score, 50);
assert.strictEqual(review.stats.correctCount, 1);
assert.strictEqual(review.questions[0].selectedAnswer, '1');
assert.strictEqual(review.questions[0].correctAnswer, '2');
assert.strictEqual(review.questions[0].correctChoiceIndex, 0);
assert.strictEqual(review.questions[0].isCorrect, false);
assert.strictEqual(review.questions[0].imageUrl, '/assets/tryout/example.svg');
assert.strictEqual(review.questions[0].imageAlt, 'Diagram contoh');
assert.strictEqual(review.questions[0].steps[0].title, 'Jumlahkan');
assert.strictEqual(review.questions[1].selectedAnswer, '2x');
assert.strictEqual(review.questions[1].correctAnswer, '2x');
assert.strictEqual(review.questions[1].correctChoiceIndex, 0);
assert.strictEqual(review.questions[1].isCorrect, true);

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
