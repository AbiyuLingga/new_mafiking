'use strict';

/**
 * @fileoverview Backward-compatible thin wrapper around the self-healing
 * mutation collector.
 *
 * Historically, callers did `const { startMutationCollector } = require('./mutation-collector')`.
 * Phase B of the self-healing plan replaces the inner loop with
 * `lib/self-healing-collector.js`, but keeps this file as a stable import
 * surface so existing wiring (e.g. `server.js`, `scripts/collector.js` tests)
 * continues to work.
 *
 * The `SELF_HEALING_COLLECTOR` feature flag controls which implementation
 * runs. Default is `true` (new behavior). Setting
 * `SELF_HEALING_COLLECTOR=false` falls back to the legacy behavior preserved
 * below for emergency rollback.
 *
 * The legacy implementation is preserved verbatim at the bottom of this file
 * and is only reachable when the feature flag is off.
 */

const { processNewMutations, matchPendingMutations } = require('./mutation-matcher');

/**
 * Resolve the SELF_HEALING_COLLECTOR feature flag.
 *
 * @returns {boolean}
 */
function selfHealingEnabled() {
    const raw = String(process.env.SELF_HEALING_COLLECTOR || '').trim().toLowerCase();
    if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
    return true;
}

/**
 * Start the mutation collector. Returns a controller object compatible with
 * the legacy contract: `{ timer, stop, getStats }`. When the self-healing
 * implementation is active the controller is augmented with
 * `triggerPoll()` and a `_collector` reference for advanced callers.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Object} provider
 * @param {Object} [options]
 * @returns {Object|null}
 */
function startMutationCollector(db, provider, options = {}) {
    if (!selfHealingEnabled()) {
        return startLegacyMutationCollector(db, provider, options);
    }

    let startSelfHealing;
    try {
        ({ startSelfHealingCollector: startSelfHealing } = require('./self-healing-collector'));
    } catch (err) {
        console.error('[collector] failed to load self-healing implementation, falling back to legacy:', err.message);
        return startLegacyMutationCollector(db, provider, options);
    }

    return startSelfHealing(db, provider, {
        ...options,
        // Map legacy options to the new API.
        adaptive: options.adaptive,
        breaker: {
            failureThreshold: Number(options.maxConsecutiveErrors) || undefined,
            recoveryTimeoutMs: undefined,
        },
        heartbeat: options.heartbeat,
    });
}

/**
 * Legacy implementation, preserved verbatim for emergency rollback when
 * `SELF_HEALING_COLLECTOR=false`.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Object} provider
 * @param {Object} [options]
 * @returns {Object|null}
 */
function startLegacyMutationCollector(db, provider, options = {}) {
    const intervalMs = Math.max(5000, Number(options.intervalMs) || 15000);
    const maxConsecutiveErrors = Number(options.maxConsecutiveErrors) || 5;
    const pepper = String(options.pepper || process.env.HASH_PEPPER || '');

    if (!pepper) {
        console.error('[collector] HASH_PEPPER not set - collector disabled for safety');
        return null;
    }

    let consecutiveErrors = 0;
    let backoffMs = 0;
    let lastPollAt = 0;
    let totalMatched = 0;
    let totalChecked = 0;

    async function poll() {
        const now = Date.now();

        if (backoffMs > 0 && now - lastPollAt < backoffMs) return;

        try {
            const mutations = await provider.fetchLatestMutations();

            if (!Array.isArray(mutations)) {
                throw new Error(`Provider returned non-array: ${typeof mutations}`);
            }

            const result = processNewMutations(db, mutations, pepper);
            const pendingResult = matchPendingMutations(db);

            totalChecked += mutations.length;
            totalMatched += result.matched + pendingResult.matched;

            if (result.matched > 0 || pendingResult.matched > 0) {
                console.log(
                    `[collector] matched ${result.matched + pendingResult.matched} payment(s)` +
                    ` (total: ${totalMatched})`
                );
            }

            if (result.ingested > 0) {
                console.log(
                    `[collector] ingested ${result.ingested} new mutation(s),` +
                    ` ${result.duplicates} duplicate(s)`
                );
            }

            consecutiveErrors = 0;
            backoffMs = 0;
            lastPollAt = now;

        } catch (error) {
            consecutiveErrors++;
            backoffMs = Math.min(300000, (backoffMs || 5000) * 2);

            console.error(
                `[collector] poll error (${consecutiveErrors}/${maxConsecutiveErrors}):`,
                error.message
            );

            if (consecutiveErrors >= maxConsecutiveErrors) {
                console.error(
                    '[collector] ALERT: max consecutive errors reached.' +
                    ' Collector will retry with extended backoff.'
                );
            }

            lastPollAt = Date.now();
        }
    }

    poll();

    const timer = setInterval(poll, intervalMs);
    timer.unref?.();

    console.log(`[collector] started (interval ${intervalMs}ms, provider: ${provider.constructor.name})`);

    return {
        timer,
        stop: () => clearInterval(timer),
        getStats: () => ({
            totalChecked,
            totalMatched,
            consecutiveErrors,
            backoffMs,
            lastPollAt,
        }),
    };
}

module.exports = {
    startMutationCollector,
    startLegacyMutationCollector,
    selfHealingEnabled,
};
