const crypto = require('crypto');

function paymentRateLimiter({ windowMs = 60 * 1000, maxRequests = 5, minIntervalMs = 3000 } = {}) {
    return function (req, res, next) {
        const db = req.app?.locals?.db;
        if (!db) return next();

        const userId = req.session?.userId || req.userId || null;
        const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
        const identifier = userId ? `user:${userId}` : `ip:${clientIp}`;

        const now = Date.now();
        const windowStart = now - windowMs;

        try {
            db.prepare(`
                DELETE FROM payment_rate_limits WHERE window_start < ?
            `).run(windowStart);

            const rateHash = crypto.createHash('sha256').update(identifier).digest('hex');

            const count = db.prepare(`
                SELECT COUNT(*) as cnt FROM payment_rate_limits
                WHERE rate_hash = ? AND window_start = ?
            `).get(rateHash, windowStart);

            if (count && count.cnt >= maxRequests) {
                return res.status(429).json({
                    error: 'Terlalu banyak permintaan pembayaran. Coba lagi sebentar.',
                });
            }

            const lastRequest = db.prepare(`
                SELECT MAX(created_at) as last_at FROM payment_rate_limits
                WHERE rate_hash = ?
            `).get(rateHash);

            if (lastRequest && lastRequest.last_at) {
                const lastTime = new Date(lastRequest.last_at).getTime();
                if (now - lastTime < minIntervalMs) {
                    return res.status(429).json({
                        error: 'Harap tunggu beberapa detik sebelum mencoba lagi.',
                    });
                }
            }

            db.prepare(`
                INSERT INTO payment_rate_limits (rate_hash, window_start)
                VALUES (?, ?)
            `).run(rateHash, windowStart);
        } catch (err) {
            console.error('[payment-rate-limiter] error:', err.message);
            return next();
        }

        next();
    };
}

module.exports = { paymentRateLimiter };
