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
    const otherPendingSameAmount = candidates.length - 1;

    return candidates.map((payment) => {
        const score = scoreCandidate({
            payment,
            mutation,
            transactedAtMs: Number.isFinite(transactedAtMs) ? transactedAtMs : 0,
            userActivity: null, // TODO: wire user activity tracker in Phase C.5
            otherPendingSameAmount,
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

function recordAmbiguous(db, { mutationId, mutation, candidates }) {
    try {
        db.prepare(`
            INSERT INTO payment_ambiguous_queue (
                mutation_id, merchant_order_id, confidence_score,
                transacted_at, amount, payer_name_masked
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            mutationId,
            String(candidates[0]?.payment?.merchant_order_id || ''),
            Math.min(...candidates.map((c) => c.score)),
            mutation.transacted_at,
            mutation.amount,
            mutation.payer_name_masked || null,
        );
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
