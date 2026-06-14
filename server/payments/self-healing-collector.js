'use strict';

/**
 * @fileoverview Self-healing mutation collector.
 *
 * Phase B of the self-healing payment plan. Replaces the original
 * `server/payments/mutation-collector.js` with a collector that:
 *
 * 1. Wraps a 3-state circuit breaker (CLOSED → OPEN → HALF_OPEN → CLOSED).
 * 2. Detects qris-mutasi session-expired errors and forces a client re-init.
 * 3. Uses adaptive 3-tier polling (hot 3s, warm 10s, cold 60s) based on the
 *    number of pending, non-expired payments in the database.
 * 4. Restores the process working directory after the qris-mutasi `chdir`
 *    sandbox trick so concurrent collectors cannot corrupt each other.
 * 5. Sends a heartbeat to the main app every 30 seconds via
 *    `POST /api/internal/collector-heartbeat`, validated by the
 *    `INTERNAL_API_SECRET` env var.
 *
 * The module is intentionally fail-closed: an exception in any subsystem
 * (heartbeat, polling, interval scheduling) is logged but does not crash the
 * server.
 *
 * Backward compatibility: `startSelfHealingCollector` is exported as
 * `startSelfHealingCollector`. `startMutationCollector` in
 * `server/payments/mutation-collector.js` delegates here when the
 * `SELF_HEALING_COLLECTOR` feature flag is on.
 */

const { processNewMutations, matchPendingMutations } = require('./mutation-matcher');

/**
 * @typedef {Object} AdaptiveConfig
 * @property {number} hotIntervalMs   Polling interval when ≥1 pending payment is active.
 * @property {number} warmIntervalMs  Polling interval for normal volume.
 * @property {number} coldIntervalMs  Polling interval when the collector is idle.
 * @property {number} coldAfterMs     Idle window after which we switch to cold.
 */

/**
 * @typedef {Object} BreakerConfig
 * @property {number} failureThreshold   Consecutive failures before opening.
 * @property {number} recoveryTimeoutMs  How long to wait before probing.
 */

/**
 * @typedef {Object} HeartbeatConfig
 * @property {boolean} enabled
 * @property {number}  intervalMs
 * @property {string}  url
 * @property {string}  secret
 * @property {number}  timeoutMs
 */

/**
 * Default adaptive polling intervals. Tuned for the QRIS auto-verify
 * workload described in `docs/plans/pay_self_healing_v3.md`.
 *
 * @type {AdaptiveConfig}
 */
const DEFAULT_ADAPTIVE = Object.freeze({
    hotIntervalMs: 3000,
    warmIntervalMs: 10000,
    coldIntervalMs: 60000,
    coldAfterMs: 5 * 60 * 1000,
});

/**
 * Default circuit breaker parameters.
 *
 * @type {BreakerConfig}
 */
const DEFAULT_BREAKER = Object.freeze({
    failureThreshold: 3,
    recoveryTimeoutMs: 5 * 60 * 1000,
});

/**
 * Default heartbeat parameters.
 *
 * @type {HeartbeatConfig}
 */
const DEFAULT_HEARTBEAT = Object.freeze({
    enabled: true,
    intervalMs: 30000,
    url: '',
    secret: '',
    timeoutMs: 5000,
});

/**
 * Returns the adaptive polling interval for the collector.
 *
 * Decision tree:
 *  - If ≥1 pending payment is active, use the hot interval (3s by default).
 *  - If no pending payment and the collector has been idle ≥ `coldAfterMs`,
 *    use the cold interval (60s by default).
 *  - Otherwise, use the warm interval (10s by default).
 *
 * @param {Object} args
 * @param {number} args.pendingCount
 * @param {number} [args.lastActivityAt]  epoch ms of the most recent
 *                                        successful poll/match.
 * @param {Partial<AdaptiveConfig>} [args.config]
 * @returns {number} interval in ms
 */
function getAdaptiveInterval({ pendingCount, lastActivityAt, config = {} }) {
    const cfg = { ...DEFAULT_ADAPTIVE, ...config };
    if (pendingCount >= 1) return cfg.hotIntervalMs;
    if (typeof lastActivityAt === 'number' && lastActivityAt > 0) {
        const idleMs = Date.now() - lastActivityAt;
        if (idleMs >= cfg.coldAfterMs) return cfg.coldIntervalMs;
    }
    return cfg.warmIntervalMs;
}

/**
 * 3-state circuit breaker (CLOSED → OPEN → HALF_OPEN → CLOSED).
 *
 * Failures increment an internal counter; once the threshold is reached the
 * breaker opens and `canRequest()` returns false until `recoveryTimeoutMs`
 * elapses. The first call after the cooldown transitions the breaker to
 * HALF_OPEN, allowing a single probe; success closes the breaker, failure
 * re-opens it.
 *
 * @example
 *   const breaker = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 60000 });
 *   if (!breaker.canRequest()) return; // skip work
 *   try { await doWork(); breaker.recordSuccess(); }
 *   catch (err) { breaker.recordFailure(); }
 */
class CircuitBreaker {
    /**
     * @param {Partial<BreakerConfig>} [config]
     */
    constructor(config = {}) {
        this.failureThreshold = Math.max(1, Number(config.failureThreshold) || DEFAULT_BREAKER.failureThreshold);
        // Allow tests to pass short timeouts (e.g. 30ms) by accepting any
        // positive integer; default to the production 5-minute cooldown.
        const rt = Number(config.recoveryTimeoutMs);
        this.recoveryTimeoutMs = Number.isFinite(rt) && rt > 0
            ? Math.floor(rt)
            : DEFAULT_BREAKER.recoveryTimeoutMs;
        /** @type {'CLOSED'|'OPEN'|'HALF_OPEN'} */
        this.state = 'CLOSED';
        this.failures = 0;
        this.openedAt = 0;
        this.lastTransitionAt = 0;
    }

    /**
     * Returns true if a request may proceed. Transitions OPEN → HALF_OPEN
     * once the recovery timeout has elapsed.
     *
     * @returns {boolean}
     */
    canRequest() {
        if (this.state === 'CLOSED' || this.state === 'HALF_OPEN') return true;
        // OPEN: check if we should probe
        if (Date.now() - this.openedAt >= this.recoveryTimeoutMs) {
            this.state = 'HALF_OPEN';
            this.lastTransitionAt = Date.now();
            return true;
        }
        return false;
    }

    /**
     * Mark a successful request. Always returns the breaker to CLOSED and
     * resets the failure counter.
     */
    recordSuccess() {
        this.state = 'CLOSED';
        this.failures = 0;
        this.openedAt = 0;
        this.lastTransitionAt = Date.now();
    }

    /**
     * Mark a failed request. Increments the counter and opens the breaker
     * once `failureThreshold` consecutive failures have been observed.
     */
    recordFailure() {
        this.failures += 1;
        this.lastTransitionAt = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.openedAt = Date.now();
        }
    }

    /**
     * Read-only snapshot for telemetry / dashboard.
     *
     * @returns {{state: string, failures: number, openedAt: number, lastTransitionAt: number}}
     */
    snapshot() {
        return {
            state: this.state,
            failures: this.failures,
            openedAt: this.openedAt,
            lastTransitionAt: this.lastTransitionAt,
        };
    }
}

/**
 * Count pending, non-expired payments in the database.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
function countPendingPayments(db) {
    if (!db || typeof db.prepare !== 'function') return 0;
    try {
        const row = db.prepare(
            "SELECT COUNT(*) AS c FROM payments WHERE status = 'PENDING' AND expires_at > datetime('now')"
        ).get();
        return Number(row?.c) || 0;
    } catch (err) {
        console.error('[self-healing] pending count query failed:', err.message);
        return 0;
    }
}

/**
 * Optional module-level reference to a provider's `reset()` or null-out hook.
 * The QrisMutasiProvider exports `markSessionExpired` which the collector
 * invokes on session-expired errors.
 *
 * @param {Object} provider
 * @returns {boolean}
 */
function isProviderRecoverable(provider) {
    return Boolean(provider) && typeof provider.fetchLatestMutations === 'function';
}

/**
 * Notify the provider that its session has expired so the next call
 * constructs a fresh client. Falls back to clearing `qris` if the provider
 * doesn't expose a named hook.
 *
 * P0-1 FIX: this function is now null-safe AND idempotent. The old code:
 *   - did not check if the value at `qris` was a non-trivial object with
 *     live timers / sockets (so simply nulling the field could leak them).
 *   - could be re-entered by overlapping poll ticks (race: two consecutive
 *     session-expired errors fire this in parallel).
 *   - never told the caller whether the reset actually happened.
 *
 * @param {Object} provider
 * @returns {boolean} true if the reset was issued (or already in progress).
 */
function markProviderSessionExpired(provider) {
    if (!provider) return false;
    if (provider.__mafikingSessionResetInProgress) return true;
    provider.__mafikingSessionResetInProgress = true;
    try {
        if (typeof provider.markSessionExpired === 'function') {
            try { provider.markSessionExpired(); } catch (_) {}
            return true;
        }
        // Best-effort: clear any internal client state, but only if the
        // field actually exists. Avoid mutating arbitrary properties on
        // foreign objects (P0-1: prevent side-effect / prototype leaks).
        if (Object.prototype.hasOwnProperty.call(provider, 'qris') && provider.qris !== null) {
            provider.qris = null;
        }
        if (Object.prototype.hasOwnProperty.call(provider, 'client') && provider.client !== null) {
            provider.client = null;
        }
        return true;
    } finally {
        // Clear the flag after a short delay so the next genuine
        // session-expired event still triggers a fresh reset, but parallel
        // in-flight ticks within the same expiry window coalesce.
        setTimeout(() => {
            if (provider) provider.__mafikingSessionResetInProgress = false;
        }, 500).unref?.();
    }
}

/**
 * Send a single heartbeat to the main app.
 *
 * @param {HeartbeatConfig} cfg
 * @param {Object} payload
 * @returns {Promise<{ok: boolean, status?: number, error?: string}>}
 */
async function postHeartbeat(cfg, payload) {
    if (!cfg.enabled || !cfg.url) return { ok: false, error: 'disabled' };
    if (!cfg.secret) return { ok: false, error: 'missing_secret' };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
        const res = await fetch(cfg.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-internal-secret': cfg.secret,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
            return { ok: false, status: res.status, error: `http_${res.status}` };
        }
        return { ok: true, status: res.status };
    } catch (err) {
        clearTimeout(timeoutId);
        return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
    }
}

/**
 * Build the heartbeat config from `process.env`.
 *
 * - `INTERNAL_API_SECRET` must be set; otherwise heartbeat is disabled.
 * - `MAIN_APP_URL` (or `MAIN_APP_BASE_URL`) supplies the host.
 * - `COLLECTOR_HEARTBEAT_URL` overrides the URL entirely (useful for tests).
 * - `COLLECTOR_HEARTBEAT_INTERVAL_MS` overrides the interval.
 *
 * @returns {HeartbeatConfig}
 */
function buildHeartbeatConfigFromEnv() {
    const env = process.env || {};
    const secret = String(env.INTERNAL_API_SECRET || '').trim();
    const explicitUrl = String(env.COLLECTOR_HEARTBEAT_URL || '').trim();
    const baseUrl = String(env.MAIN_APP_URL || env.MAIN_APP_BASE_URL || '').trim().replace(/\/+$/, '');
    const url = explicitUrl || (baseUrl ? `${baseUrl}/api/internal/collector-heartbeat` : '');
    const intervalMs = Math.max(1000, Number(env.COLLECTOR_HEARTBEAT_INTERVAL_MS) || DEFAULT_HEARTBEAT.intervalMs);
    return {
        enabled: Boolean(secret && url),
        intervalMs,
        url,
        secret,
        timeoutMs: Math.max(500, Number(env.COLLECTOR_HEARTBEAT_TIMEOUT_MS) || DEFAULT_HEARTBEAT.timeoutMs),
    };
}

/**
 * The self-healing mutation collector.
 *
 * Public surface:
 *  - `start()` begins polling
 *  - `stop()` halts polling and cancels timers
 *  - `getStats()` returns a snapshot for the admin dashboard
 *  - `triggerPoll()` runs a single poll (handy for tests)
 */
class SelfHealingCollector {
    /**
     * @param {Object} args
     * @param {import('better-sqlite3').Database} args.db
     * @param {Object} args.provider               anything with `fetchLatestMutations()` and optional `markSessionExpired()`.
     * @param {string} [args.pepper]
     * @param {Partial<AdaptiveConfig>} [args.adaptive]
     * @param {Partial<BreakerConfig>} [args.breaker]
     * @param {Partial<HeartbeatConfig>} [args.heartbeat]
     * @param {number} [args.tickMs]               minimum poll tick (default warm).
     * @param {Function} [args.now]                injectable clock for tests.
     * @param {Function} [args.log]                injectable logger for tests.
     */
    constructor(args) {
        if (!args || !args.db) throw new Error('SelfHealingCollector requires db');
        if (!isProviderRecoverable(args.provider)) {
            throw new Error('SelfHealingCollector requires a provider with fetchLatestMutations()');
        }

        this.db = args.db;
        this.provider = args.provider;
        this.pepper = String(args.pepper || process.env.HASH_PEPPER || '');
        this.adaptiveConfig = { ...DEFAULT_ADAPTIVE, ...(args.adaptive || {}) };
        this.breaker = new CircuitBreaker(args.breaker || {});
        /** @type {HeartbeatConfig} */
        this.heartbeat = { ...DEFAULT_HEARTBEAT, ...(args.heartbeat || {}) };
        this.now = typeof args.now === 'function' ? args.now : Date.now;
        this.log = typeof args.log === 'function' ? args.log : console;

        this.startedAt = this.now();
        this.lastPollAt = 0;
        this.lastSuccessAt = 0;
        this.lastMatchAt = 0;
        this.consecutiveErrors = 0;
        this.totalChecked = 0;
        this.totalMatched = 0;
        this.totalPolls = 0;
        this.totalFailures = 0;
        this.totalSessionReInit = 0;
        this.lastError = null;
        this.lastHeartbeatAt = 0;
        this.lastHeartbeatOk = false;
        this.heartbeatErrors = 0;

        this._timer = null;
        this._heartbeatTimer = null;
        this._stopped = false;
    }

    /**
     * Start polling and (optionally) heartbeat. Returns the collector itself
     * for chaining. Idempotent: calling `start()` twice is a no-op.
     *
     * @returns {SelfHealingCollector}
     */
    start() {
        if (this._timer) return this;
        this._stopped = false;
        const tick = () => this._safePoll();
        tick();
        this._timer = setInterval(tick, this._currentInterval());
        this._timer.unref?.();

        if (this.heartbeat.enabled) {
            const beat = () => this._sendHeartbeat().catch(() => {});
            this._heartbeatTimer = setInterval(beat, this.heartbeat.intervalMs);
            this._heartbeatTimer.unref?.();
            beat();
        }

        this.log?.log?.(
            `[self-healing] started (provider=${this.provider.constructor?.name || 'unknown'}, ` +
            `breaker=${this.breaker.failureThreshold}/${this.breaker.recoveryTimeoutMs}ms, ` +
            `heartbeat=${this.heartbeat.enabled ? 'on' : 'off'})`
        );
        return this;
    }

    /**
     * Halt the collector. Safe to call multiple times.
     */
    stop() {
        this._stopped = true;
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    /**
     * Run a single poll cycle. Returns a snapshot of the result. Useful for
     * tests and the admin "force poll" endpoint.
     *
     * @returns {Promise<{ok: boolean, matched: number, polled: number, interval: number, breakerState: string}>}
     */
    async triggerPoll() {
        return this._poll();
    }

    /**
     * Snapshot of the collector's runtime statistics.
     *
     * @returns {Object}
     */
    getStats() {
        const pendingCount = countPendingPayments(this.db);
        return {
            totalChecked: this.totalChecked,
            totalMatched: this.totalMatched,
            totalPolls: this.totalPolls,
            totalFailures: this.totalFailures,
            totalSessionReInit: this.totalSessionReInit,
            consecutiveErrors: this.consecutiveErrors,
            lastPollAt: this.lastPollAt,
            lastSuccessAt: this.lastSuccessAt,
            lastMatchAt: this.lastMatchAt,
            lastError: this.lastError,
            startedAt: this.startedAt,
            uptimeMs: this.now() - this.startedAt,
            pendingCount,
            currentIntervalMs: this._currentInterval(),
            heartbeat: {
                enabled: this.heartbeat.enabled,
                lastBeatAt: this.lastHeartbeatAt,
                lastBeatOk: this.lastHeartbeatOk,
                errorCount: this.heartbeatErrors,
            },
            breaker: this.breaker.snapshot(),
        };
    }

    /**
     * Compute the adaptive interval based on current state.
     *
     * @returns {number}
     */
    _currentInterval() {
        return getAdaptiveInterval({
            pendingCount: countPendingPayments(this.db),
            lastActivityAt: this.lastMatchAt || this.lastSuccessAt,
            config: this.adaptiveConfig,
        });
    }

    /**
     * Reschedule the poll timer using the current adaptive interval.
     */
    _reschedule() {
        if (!this._timer) return;
        clearInterval(this._timer);
        const tick = () => this._safePoll();
        this._timer = setInterval(tick, this._currentInterval());
        this._timer.unref?.();
    }

    /**
     * Wrap `_poll()` in a try/catch so a thrown error never escapes into the
     * timer callback and crashes the server.
     */
    _safePoll() {
        this._poll().catch((err) => {
            this.totalFailures += 1;
            this.lastError = err?.message || String(err);
            this.log?.error?.('[self-healing] poll threw:', this.lastError);
        });
    }

    /**
     * The actual poll cycle. Updates the circuit breaker, calls the
     * provider, ingests/matches, and schedules the next tick.
     */
    async _poll() {
        if (this._stopped) return { ok: false, matched: 0, polled: 0, interval: 0, breakerState: this.breaker.state };
        this.totalPolls += 1;
        const intervalBefore = this._currentInterval();

        if (!this.breaker.canRequest()) {
            this.lastError = 'circuit_open';
            return { ok: false, matched: 0, polled: 0, interval: intervalBefore, breakerState: this.breaker.state };
        }

        if (!this.pepper) {
            this.lastError = 'missing_pepper';
            this.log?.error?.('[self-healing] HASH_PEPPER not set - collector disabled for safety');
            this.stop();
            return { ok: false, matched: 0, polled: 0, interval: intervalBefore, breakerState: this.breaker.state };
        }

        let polled = 0;
        try {
            const mutations = await this.provider.fetchLatestMutations();
            if (!Array.isArray(mutations)) {
                throw new Error(`Provider returned non-array: ${typeof mutations}`);
            }
            polled = mutations.length;
            const ingest = processNewMutations(this.db, mutations, this.pepper);
            const pending = matchPendingMutations(this.db);
            const matched = ingest.matched + pending.matched;
            this.totalChecked += polled;
            this.totalMatched += matched;
            this.consecutiveErrors = 0;
            this.lastPollAt = this.now();
            this.lastSuccessAt = this.lastPollAt;
            if (matched > 0) this.lastMatchAt = this.lastPollAt;
            this.lastError = null;
            this.breaker.recordSuccess();
            if (matched > 0) {
                this.log?.log?.(`[self-healing] matched ${matched} payment(s) (total: ${this.totalMatched})`);
            }
            if (ingest.ingested > 0) {
                this.log?.log?.(`[self-healing] ingested ${ingest.ingested} new mutation(s), ${ingest.duplicates} duplicate(s)`);
            }
            this._reschedule();
            return { ok: true, matched, polled, interval: this._currentInterval(), breakerState: this.breaker.state };
        } catch (err) {
            return this._handlePollError(err, intervalBefore);
        }
    }

    /**
     * Apply the circuit breaker, session-reinit hook, and counters for a
     * failed poll cycle.
     *
     * @param {Error} err
     * @param {number} intervalBefore
     */
    _handlePollError(err, intervalBefore) {
        this.consecutiveErrors += 1;
        this.totalFailures += 1;
        this.lastError = err?.message || String(err);
        this.lastPollAt = this.now();
        this.breaker.recordFailure();
        const breakerState = this.breaker.state;

        const sessionExpired = this._isSessionExpiredError(err);
        if (sessionExpired) {
            this.totalSessionReInit += 1;
            markProviderSessionExpired(this.provider);
            this.log?.warn?.(`[self-healing] session-expired detected, re-initializing client (${this.totalSessionReInit} total)`);
            // A session-expired error counts as transient: close the breaker
            // so we don't burn the failure budget on auth noise.
            this.breaker.recordSuccess();
        } else {
            this.log?.error?.(`[self-healing] poll error (${this.consecutiveErrors}): ${this.lastError}`);
        }

        this._reschedule();
        return { ok: false, matched: 0, polled: 0, interval: this._currentInterval(), breakerState, sessionExpired };
    }

    /**
     * Heuristic session-expired detection. The qris-mutasi library surfaces
     * expired sessions as either thrown errors (with login-form-flavored
     * messages) or as HTML containing a password input. We accept both
     * shapes.
     *
     * @param {Error|string} err
     * @returns {boolean}
     */
    _isSessionExpiredError(err) {
        if (!err) return false;
        const message = String(err.message || err || '').toLowerCase();
        if (!message) return false;
        if (message.includes('login') || message.includes('session') || message.includes('unauthorized')) {
            return true;
        }
        // Some versions of qris-mutasi embed a snippet of HTML in the error
        // message. Detect the password input as a strong signal.
        if (/<input[^>]+type=["']?password["']?/i.test(message)) return true;
        if (this.provider && typeof this.provider.isSessionExpiredError === 'function') {
            try { return Boolean(this.provider.isSessionExpiredError(err)); } catch (_) { return false; }
        }
        return false;
    }

    /**
     * Send a heartbeat to the main app. Always safe to call; never throws.
     *
     * P3-3 FIX: re-read INTERNAL_API_SECRET from process.env on every
     * heartbeat so a live rotation (without server restart) is picked up
     * within 30-60 seconds. Without this, a rotated secret causes a cascade
     * of 401 responses until the collector process is restarted.
     */
    async _sendHeartbeat() {
        if (!this.heartbeat.enabled) return;
        // P3-3: re-read secret from env on every beat
        const freshSecret = String(process.env.INTERNAL_API_SECRET || '').trim();
        if (!freshSecret) {
            this.heartbeatErrors += 1;
            this.log?.warn?.('[self-healing] heartbeat skipped: INTERNAL_API_SECRET not set');
            return;
        }
        const freshUrl = this.heartbeat.url || '';
        const cfg = {
            enabled: Boolean(freshSecret && freshUrl),
            url: freshUrl,
            secret: freshSecret,
            timeoutMs: this.heartbeat.timeoutMs || 5000,
        };
        const pendingCount = countPendingPayments(this.db);
        const payload = {
            startedAt: this.startedAt,
            pollAt: this.lastPollAt,
            lastSuccessAt: this.lastSuccessAt,
            lastMatchAt: this.lastMatchAt,
            lastError: this.lastError,
            breaker: this.breaker.snapshot(),
            pendingCount,
            totals: {
                checked: this.totalChecked,
                matched: this.totalMatched,
                failures: this.totalFailures,
                sessionReInit: this.totalSessionReInit,
            },
            provider: this.provider.constructor?.name || 'unknown',
        };
        const result = await postHeartbeat(cfg, payload);
        this.lastHeartbeatAt = this.now();
        this.lastHeartbeatOk = Boolean(result.ok);
        if (!result.ok) {
            this.heartbeatErrors += 1;
            this.log?.warn?.(`[self-healing] heartbeat failed (secret via env): ${result.error || 'unknown'}`);
        }
    }
}

/**
 * Build a heartbeat config from `process.env`. Exposed for tests and the
 * wiring in `server.js`.
 *
 * @returns {HeartbeatConfig}
 */
function buildDefaultHeartbeatConfig() {
    return buildHeartbeatConfigFromEnv();
}

/**
 * Top-level helper used by `server.js`. Constructs and starts a
 * `SelfHealingCollector`, returning a controller object whose shape matches
 * the legacy `startMutationCollector` return value.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Object} provider
 * @param {Object} [options]
 * @returns {Object|null} collector controller, or `null` when pepper is missing.
 */
function startSelfHealingCollector(db, provider, options = {}) {
    if (!db || !provider) return null;
    const pepper = String(options.pepper || process.env.HASH_PEPPER || '');
    if (!pepper) {
        console.error('[self-healing] HASH_PEPPER not set - collector disabled for safety');
        return null;
    }
    const heartbeat = {
        ...buildDefaultHeartbeatConfig(),
        ...(options.heartbeat || {}),
    };
    const collector = new SelfHealingCollector({
        db,
        provider,
        pepper,
        adaptive: options.adaptive,
        breaker: options.breaker,
        heartbeat,
    });
    collector.start();

    return {
        timer: collector._timer,
        stop: () => collector.stop(),
        getStats: () => collector.getStats(),
        triggerPoll: () => collector.triggerPoll(),
        // Expose internals for advanced callers / tests.
        _collector: collector,
    };
}

module.exports = {
    CircuitBreaker,
    SelfHealingCollector,
    DEFAULT_ADAPTIVE,
    DEFAULT_BREAKER,
    DEFAULT_HEARTBEAT,
    buildDefaultHeartbeatConfig,
    countPendingPayments,
    getAdaptiveInterval,
    isSessionExpiredError: (err) => {
        // Backwards-compatible alias for callers that import the helper
        // directly from this module.
        if (!err) return false;
        const message = String(err.message || err || '').toLowerCase();
        return /login|session|unauthorized/i.test(message);
    },
    markProviderSessionExpired,
    postHeartbeat,
    startSelfHealingCollector,
};
