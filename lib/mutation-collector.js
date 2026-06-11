const { processNewMutations, matchPendingMutations } = require('./mutation-matcher');

function startMutationCollector(db, provider, options = {}) {
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

module.exports = { startMutationCollector };
