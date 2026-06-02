const crypto = require('crypto');

const FREE_MATH_TRYOUT_ID = 'free-math-tryout-15';
const FREE_MATH_TRYOUT_TITLE = 'Try Out Matematika';
const FREE_MATH_TIME_LIMIT_SECONDS = 30 * 60;
const TRYOUT_SUBMIT_GRACE_MS = 30 * 1000;

function base64UrlEncode(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlDecode(value) {
    return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
}

function tryoutSessionSecret() {
    return process.env.TRYOUT_SESSION_SECRET || process.env.SESSION_SECRET || 'new-mafiking-local-tryout-session';
}

function signPayload(payload) {
    return crypto
        .createHmac('sha256', tryoutSessionSecret())
        .update(payload)
        .digest('base64url');
}

function signTryoutSession(session) {
    const payload = base64UrlEncode(session);
    return `${payload}.${signPayload(payload)}`;
}

function verifyTryoutSessionToken(token, { userId, now = Date.now() } = {}) {
    const [payload, signature, extra] = String(token || '').split('.');
    if (!payload || !signature || extra) {
        return { ok: false, error: 'Token tryout tidak valid' };
    }

    const expected = signPayload(payload);
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
        return { ok: false, error: 'Token tryout tidak valid' };
    }

    let session;
    try {
        session = base64UrlDecode(payload);
    } catch (_) {
        return { ok: false, error: 'Token tryout tidak valid' };
    }

    if (userId != null && Number(session.userId) !== Number(userId)) {
        return { ok: false, error: 'Sesi tryout bukan milik user ini' };
    }

    const expiresAtMs = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
        return { ok: false, error: 'Deadline tryout tidak valid' };
    }
    if (now > expiresAtMs + TRYOUT_SUBMIT_GRACE_MS) {
        return { ok: false, error: 'Waktu tryout sudah habis' };
    }

    const problemIds = Array.isArray(session.problemIds)
        ? session.problemIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
        : [];
    if (!problemIds.length) {
        return { ok: false, error: 'Daftar soal tryout kosong' };
    }

    return { ok: true, session: { ...session, problemIds } };
}

function createTryoutSession({
    userId,
    problemIds,
    timeLimitSeconds = FREE_MATH_TIME_LIMIT_SECONDS,
    now = new Date(),
    tryoutId = FREE_MATH_TRYOUT_ID,
    tryoutTitle = FREE_MATH_TRYOUT_TITLE,
}) {
    const startedAt = new Date(now);
    const limit = Math.max(60, Math.min(3 * 60 * 60, Number(timeLimitSeconds) || FREE_MATH_TIME_LIMIT_SECONDS));
    const expiresAt = new Date(startedAt.getTime() + limit * 1000);
    const session = {
        userId: Number(userId),
        tryoutId: String(tryoutId || FREE_MATH_TRYOUT_ID),
        tryoutTitle: String(tryoutTitle || FREE_MATH_TRYOUT_TITLE),
        problemIds: (problemIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0),
        startedAt: startedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        timeLimitSeconds: limit,
    };
    return { session, token: signTryoutSession(session) };
}

module.exports = {
    FREE_MATH_TIME_LIMIT_SECONDS,
    FREE_MATH_TRYOUT_ID,
    FREE_MATH_TRYOUT_TITLE,
    TRYOUT_SUBMIT_GRACE_MS,
    createTryoutSession,
    signTryoutSession,
    verifyTryoutSessionToken,
};
