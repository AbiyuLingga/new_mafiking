'use strict';

/**
 * @fileoverview Internal worker endpoints.
 *
 * Routes in this file are NOT exposed to browsers or admins. They are
 * consumed by background workers (currently: the self-healing mutation
 * collector). Authentication is via a shared secret
 * (`INTERNAL_API_SECRET`) supplied in the `x-internal-secret` request
 * header. Mounted at `/api/internal` in `server.js`.
 *
 * Phase B of `docs/plans/pay_self_healing_v3.md` introduced this file for
 * the self-healing collector heartbeat. New internal endpoints should
 * land here too so they share the same auth gate.
 */

const express = require('express');

const router = express.Router();

/**
 * Resolve the active `INTERNAL_API_SECRET`. The optional override is
 * honored for the lifetime of the request and is the only way to inject
 * a secret in tests; production reads the env var at request time so
 * runtime rotation of the secret does not require a server restart.
 *
 * @param {string|undefined} override
 * @returns {string}
 */
function resolveSecret(override) {
    if (override !== undefined && override !== null) {
        return String(override).trim();
    }
    return String(process.env.INTERNAL_API_SECRET || '').trim();
}

/**
 * POST /api/internal/collector-heartbeat
 *
 * The self-healing mutation collector posts a status snapshot here
 * every 30 seconds. The payload is normalized and stored in
 * `req.app.locals.collectorHeartbeat` for the admin dashboard.
 */
function heartbeatHandler(secretOverride) {
    return function handleHeartbeat(req, res) {
        const secret = resolveSecret(secretOverride);
        if (!secret) {
            return res.status(503).json({ error: 'INTERNAL_API_SECRET not configured' });
        }
        const provided = String(
            req.get('x-internal-secret') || (req.body && req.body.secret) || ''
        ).trim();
        if (!provided || provided !== secret) {
            return res.status(401).json({ error: 'invalid_internal_secret' });
        }

        const body = req.body || {};
        const previous = req.app.locals.collectorHeartbeat || null;
        const startedAt = Number(body.startedAt) || Date.now();
        const next = {
            startedAt,
            lastHeartbeatAt: Date.now(),
            pollAt: Number(body.pollAt) || 0,
            lastSuccessAt: Number(body.lastSuccessAt) || 0,
            lastMatchAt: Number(body.lastMatchAt) || 0,
            lastError: body.lastError ? String(body.lastError).slice(0, 500) : null,
            pendingCount: Number.isFinite(Number(body.pendingCount)) ? Number(body.pendingCount) : 0,
            provider: String(body.provider || 'unknown').slice(0, 80),
            breaker: body.breaker && typeof body.breaker === 'object' ? {
                state: String(body.breaker.state || 'CLOSED'),
                failures: Number(body.breaker.failures) || 0,
                openedAt: Number(body.breaker.openedAt) || 0,
                lastTransitionAt: Number(body.breaker.lastTransitionAt) || 0,
            } : { state: 'CLOSED', failures: 0, openedAt: 0, lastTransitionAt: 0 },
            totals: body.totals && typeof body.totals === 'object' ? {
                checked: Number(body.totals.checked) || 0,
                matched: Number(body.totals.matched) || 0,
                failures: Number(body.totals.failures) || 0,
                sessionReInit: Number(body.totals.sessionReInit) || 0,
            } : { checked: 0, matched: 0, failures: 0, sessionReInit: 0 },
            previous: previous ? {
                lastHeartbeatAt: previous.lastHeartbeatAt,
            } : null,
        };
        req.app.locals.collectorHeartbeat = next;
        res.json({ ok: true, receivedAt: next.lastHeartbeatAt });
    };
}

router.post('/collector-heartbeat', heartbeatHandler());

/**
 * Build a fresh router instance with a custom `INTERNAL_API_SECRET`
 * override. Used by `server.js` and by tests that need to control the
 * auth secret without mutating `process.env`.
 *
 * @param {Object} [options]
 * @param {string} [options.heartbeatSecret]
 * @returns {express.Router}
 */
function buildInternalRouter({ heartbeatSecret } = {}) {
    const r = express.Router();
    r.post('/collector-heartbeat', heartbeatHandler(heartbeatSecret));
    return r;
}

module.exports = router;
module.exports.buildInternalRouter = buildInternalRouter;
