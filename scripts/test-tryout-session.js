const assert = require('assert');
const {
    FREE_MATH_TIME_LIMIT_SECONDS,
    FREE_MATH_TRYOUT_ID,
    createTryoutSession,
    normalizeTryoutDraftAnswers,
    normalizeTryoutDraftChoiceMap,
    verifyTryoutSessionToken,
} = require('../lib/tryout-session');

const now = new Date('2026-06-02T00:00:00.000Z');
const { session, token } = createTryoutSession({
    userId: 42,
    problemIds: [10, 11, 12],
    now,
});

assert.strictEqual(session.tryoutId, FREE_MATH_TRYOUT_ID);
assert.strictEqual(session.timeLimitSeconds, FREE_MATH_TIME_LIMIT_SECONDS);

const verified = verifyTryoutSessionToken(token, {
    userId: 42,
    now: now.getTime() + 60 * 1000,
});
assert.strictEqual(verified.ok, true);
assert.deepStrictEqual(verified.session.problemIds, [10, 11, 12]);

assert.strictEqual(verifyTryoutSessionToken(token, { userId: 7, now: now.getTime() }).ok, false);
assert.strictEqual(verifyTryoutSessionToken(`${token.slice(0, -1)}x`, { userId: 42, now: now.getTime() }).ok, false);
assert.strictEqual(verifyTryoutSessionToken(token, { userId: 42, now: now.getTime() + (31 * 60 * 1000) }).ok, false);
assert.strictEqual(verifyTryoutSessionToken(token, { userId: 42, now: now.getTime() + (31 * 60 * 1000), allowExpired: true }).ok, true);

assert.deepStrictEqual(
    normalizeTryoutDraftAnswers({ 10: 2, 11: '3.7', 999: 1, bad: 4 }, [10, 11]),
    { 10: 2, 11: 4 }
);
assert.deepStrictEqual(
    normalizeTryoutDraftChoiceMap({ 10: ['A', 'B', '', null], 999: ['X'] }, [10]),
    { 10: ['A', 'B'] }
);

console.log('Tryout session tests passed');
