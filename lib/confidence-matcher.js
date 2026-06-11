// lib/confidence-matcher.js
// Confidence-scored matching for incoming QRIS mutations.
// Replaces exact-match-only logic with a 0-230 score; >= 180 → auto-match.

const { isEnabled: isFeatureEnabled } = require('./feature-flags');

const THRESHOLDS = {
    AMOUNT_MATCH: 100,
    TIME_WINDOW_MAX: 50,
    TIME_BEFORE_PAYMENT: 30,
    USER_ACTIVE_MAX: 30,
    NO_COLLISION: 50,
    ONE_COLLISION: 20,
    AUTO_MATCH_MIN: 180,
};

function scoreCandidate({ payment, mutation, transactedAtMs, userActivity = null, otherPendingSameAmount = 0 }) {
    let score = 0;

    // 1. Amount match (wajib, +100)
    const expectedAmount = Number(payment.qris_full_amount || payment.amount || 0);
    if (expectedAmount !== Number(mutation.amount)) {
        return 0; // disqualify
    }
    score += THRESHOLDS.AMOUNT_MATCH;

    // 2. Time window proximity (max +50)
    const createdAtMs = payment.created_at ? Date.parse(payment.created_at.replace(' ', 'T') + 'Z') : 0;
    if (createdAtMs > 0 && transactedAtMs > 0) {
        const minutesSinceCreated = (transactedAtMs - createdAtMs) / 60000;
        if (minutesSinceCreated >= 0 && minutesSinceCreated <= 30) {
            score += Math.max(0, THRESHOLDS.TIME_WINDOW_MAX - Math.floor(minutesSinceCreated));
        } else if (minutesSinceCreated < 0) {
            score += THRESHOLDS.TIME_BEFORE_PAYMENT; // partial: mutation sebelum payment (clock skew)
        }
    }

    // 3. User recent active session (max +30)
    if (userActivity && userActivity.lastActiveAt) {
        const lastActiveMs = Date.parse(String(userActivity.lastActiveAt).replace(' ', 'T') + 'Z');
        if (Number.isFinite(lastActiveMs) && transactedAtMs > 0) {
            const minutesSinceActive = (transactedAtMs - lastActiveMs) / 60000;
            if (minutesSinceActive >= -5 && minutesSinceActive <= 60) {
                score += Math.max(0, THRESHOLDS.USER_ACTIVE_MAX - Math.floor(Math.abs(minutesSinceActive)));
            }
        }
    }

    // 4. No collision (max +50)
    if (otherPendingSameAmount === 0) {
        score += THRESHOLDS.NO_COLLISION;
    } else if (otherPendingSameAmount === 1) {
        score += THRESHOLDS.ONE_COLLISION;
    }
    // 2+ collisions: 0 (too risky)

    return score;
}

function findCandidatesWithScores({ db, mutation, limit = 5 }) {
    const candidates = db.prepare(`
        SELECT *
        FROM payments
        WHERE status = 'PENDING'
          AND COALESCE(qris_full_amount, amount) = ?
          AND created_at <= ?
          AND (expires_at IS NULL OR expires_at >= ?)
        ORDER BY created_at ASC
        LIMIT ?
    `).all(mutation.amount, mutation.transacted_at, mutation.transacted_at, limit);

    if (candidates.length === 0) {
        return [];
    }

    const transactedAtMs = Date.parse(String(mutation.transacted_at).replace(' ', 'T') + 'Z');
    // P1-2 FIX: compute TRUE collision count by querying the DB, not from
    // `candidates.length - 1`. The previous code underestimated collisions
    // when there were more than `limit` pending payments with the same
    // amount, which inflated confidence and could cause a wrong-candidate
    // match.
    let trueCollisionCount = 0;
    try {
        const row = db.prepare(`
            SELECT COUNT(*) AS c
            FROM payments
            WHERE status = 'PENDING'
              AND COALESCE(qris_full_amount, amount) = ?
        `).get(mutation.amount);
        trueCollisionCount = Math.max(0, Number(row?.c) || 0) - 1;
    } catch (_) {
        trueCollisionCount = candidates.length - 1;
    }

    return candidates.map((payment) => {
        const score = scoreCandidate({
            payment,
            mutation,
            transactedAtMs: Number.isFinite(transactedAtMs) ? transactedAtMs : 0,
            userActivity: null, // TODO: wire user activity tracker in Phase C.5
            otherPendingSameAmount: trueCollisionCount,
        });
        return { payment, score };
    });
}

function shouldAutoMatch(scoredCandidates) {
    if (!isFeatureEnabled('CONFIDENCE_MATCHING')) {
        // Fallback: exact-match-only (legacy)
        return scoredCandidates.length === 1 ? scoredCandidates[0] : null;
    }
    const eligible = scoredCandidates.filter((c) => c.score >= THRESHOLDS.AUTO_MATCH_MIN);
    if (eligible.length === 1) {
        return eligible[0];
    }
    return null;
}

/**
 * P1-1 FIX: insert a row per candidate. The previous code only stored the
 * first candidate's `merchant_order_id` in the `payment_ambiguous_queue`
 * row, which meant admin resolvers had to SQL JOIN against `payments`
 * to see the other candidates. Now each candidate gets its own row,
 * marked with the same `mutation_id` so the admin resolver can GROUP BY
 * it.
 *
 * Schema reminder (db/migrations/006_ambiguous_queue.sql):
 *   id, mutation_id, merchant_order_id, confidence_score, transacted_at,
 *   amount, payer_name_masked, created_at, resolved_at, resolved_by,
 *   resolution, resolution_details
 *
 * We re-use this table by treating each row as a (mutation, candidate)
 * pair. Admin resolver UI groups by mutation_id to show all candidates.
 */
function recordAmbiguous(db, { mutationId, mutation, candidates }) {
    if (!Array.isArray(candidates) || candidates.length === 0) return;
    const transactedAt = mutation.transacted_at;
    const amount = mutation.amount;
    const payerMasked = mutation.payer_name_masked || null;
    const stmt = db.prepare(`
        INSERT INTO payment_ambiguous_queue (
            mutation_id, merchant_order_id, confidence_score,
            transacted_at, amount, payer_name_masked
        ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    try {
        db.transaction(() => {
            for (const candidate of candidates) {
                const payment = candidate?.payment;
                if (!payment || !payment.merchant_order_id) continue;
                stmt.run(
                    mutationId,
                    String(payment.merchant_order_id),
                    Number(candidate.score) || 0,
                    transactedAt,
                    amount,
                    payerMasked,
                );
            }
        })();
    } catch (err) {
        if (!String(err.message || '').includes('no such table')) {
            console.error('[confidence-matcher] ambiguous record failed:', err.message);
        }
    }
}

module.exports = {
    THRESHOLDS,
    scoreCandidate,
    findCandidatesWithScores,
    shouldAutoMatch,
    recordAmbiguous,
};
