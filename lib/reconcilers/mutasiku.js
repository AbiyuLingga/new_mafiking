async function pollMutasiku() {
    return { skipped: true, reason: 'Mutasiku polling is not configured yet.' };
}

function startMutasikuPoller(db, env = process.env) {
    const apiKey = String(env.MUTASIKU_API_KEY || '').trim();
    const accountId = String(env.MUTASIKU_ACCOUNT_ID || '').trim();
    if (!apiKey || !accountId) return null;

    const intervalMs = Math.max(30000, Number(env.MUTASIKU_POLL_INTERVAL) || 60000);
    const timer = setInterval(() => {
        pollMutasiku(db, env).catch((error) => {
            console.error('[mutasiku] polling failed:', error);
        });
    }, intervalMs);
    timer.unref?.();
    console.log(`[mutasiku] poller configured (${intervalMs}ms), implementation pending API contract verification`);
    return timer;
}

module.exports = {
    pollMutasiku,
    startMutasikuPoller,
};
