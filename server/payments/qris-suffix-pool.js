const DEFAULT_SUFFIX_MIN = 1;
const DEFAULT_SUFFIX_MAX = 999;

class SuffixPoolExhaustedError extends Error {
    constructor(baseAmount, min, max) {
        super(`Slot kode unik QRIS penuh untuk nominal ${baseAmount} (${min}-${max})`);
        this.code = 'SUFFIX_POOL_EXHAUSTED';
        this.baseAmount = baseAmount;
    }
}

function normalizeIntegerEnv(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isInteger(parsed) ? parsed : fallback;
}

function suffixRange(env = process.env) {
    const min = normalizeIntegerEnv(env.QRIS_SUFFIX_MIN, DEFAULT_SUFFIX_MIN);
    const max = normalizeIntegerEnv(env.QRIS_SUFFIX_MAX, DEFAULT_SUFFIX_MAX);
    if (min < 0 || max < min || max > 9999) {
        return { min: DEFAULT_SUFFIX_MIN, max: DEFAULT_SUFFIX_MAX };
    }
    return { min, max };
}

function toSqlDateTime(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function runImmediateTransaction(db, fn) {
    const tx = db.transaction(fn);
    return tx.immediate ? tx.immediate.bind(tx) : tx;
}

function releaseExpiredSuffixes({ db, now = new Date() }) {
    return db.prepare(`
        UPDATE qris_suffix_locks
        SET released_at = ?
        WHERE released_at IS NULL
          AND expires_at <= ?
    `).run(toSqlDateTime(now), toSqlDateTime(now));
}

function allocateSuffix({ db, baseAmount, merchantOrderId, ttlSeconds, env = process.env, now = new Date() }) {
    const normalizedBaseAmount = Number(baseAmount);
    const normalizedTtl = Number(ttlSeconds);
    if (!Number.isSafeInteger(normalizedBaseAmount) || normalizedBaseAmount <= 0) {
        throw new Error('baseAmount QRIS tidak valid');
    }
    if (!Number.isFinite(normalizedTtl) || normalizedTtl <= 0) {
        throw new Error('ttlSeconds QRIS tidak valid');
    }

    const { min, max } = suffixRange(env);
    const orderId = String(merchantOrderId || '').trim();
    if (!orderId) throw new Error('merchantOrderId QRIS wajib diisi');

    const expiresAt = new Date(now.getTime() + normalizedTtl * 1000);
    const transaction = runImmediateTransaction(db, () => {
        releaseExpiredSuffixes({ db, now });

        const taken = db.prepare(`
            SELECT suffix
            FROM qris_suffix_locks
            WHERE base_amount = ?
              AND released_at IS NULL
        `).all(normalizedBaseAmount);
        const takenSet = new Set(taken.map((row) => Number(row.suffix)));

        const insert = db.prepare(`
            INSERT INTO qris_suffix_locks (base_amount, suffix, merchant_order_id, expires_at)
            VALUES (?, ?, ?, ?)
        `);

        for (let suffix = min; suffix <= max; suffix += 1) {
            if (takenSet.has(suffix)) continue;
            insert.run(normalizedBaseAmount, suffix, orderId, toSqlDateTime(expiresAt));
            return { suffix, expiresAt };
        }
        throw new SuffixPoolExhaustedError(normalizedBaseAmount, min, max);
    });

    return transaction();
}

function allocateRotatingSuffix({ db, baseAmount, merchantOrderId, ttlSeconds, env = process.env, now = new Date() }) {
    const normalizedBaseAmount = Number(baseAmount);
    const normalizedTtl = Number(ttlSeconds);
    if (!Number.isSafeInteger(normalizedBaseAmount) || normalizedBaseAmount <= 0) {
        throw new Error('baseAmount QRIS tidak valid');
    }
    if (!Number.isFinite(normalizedTtl) || normalizedTtl <= 0) {
        throw new Error('ttlSeconds QRIS tidak valid');
    }

    const { min, max } = suffixRange(env);
    const orderId = String(merchantOrderId || '').trim();
    if (!orderId) throw new Error('merchantOrderId QRIS wajib diisi');

    const expiresAt = new Date(now.getTime() + normalizedTtl * 1000);
    const transaction = runImmediateTransaction(db, () => {
        releaseExpiredSuffixes({ db, now });

        const taken = db.prepare(`
            SELECT suffix
            FROM qris_suffix_locks
            WHERE base_amount = ?
              AND released_at IS NULL
        `).all(normalizedBaseAmount);
        const takenSet = new Set(taken.map((row) => Number(row.suffix)));

        const last = db.prepare(`
            SELECT suffix
            FROM qris_suffix_locks
            WHERE base_amount = ?
            ORDER BY id DESC
            LIMIT 1
        `).get(normalizedBaseAmount);
        const lastSuffix = Number(last && last.suffix);
        let candidate = Number.isInteger(lastSuffix) && lastSuffix >= min && lastSuffix <= max
            ? lastSuffix + 1
            : min;
        if (candidate > max) candidate = min;

        const insert = db.prepare(`
            INSERT INTO qris_suffix_locks (base_amount, suffix, merchant_order_id, expires_at)
            VALUES (?, ?, ?, ?)
        `);

        const totalSlots = max - min + 1;
        for (let offset = 0; offset < totalSlots; offset += 1) {
            const suffix = min + ((candidate - min + offset) % totalSlots);
            if (takenSet.has(suffix)) continue;
            insert.run(normalizedBaseAmount, suffix, orderId, toSqlDateTime(expiresAt));
            return { suffix, expiresAt };
        }
        throw new SuffixPoolExhaustedError(normalizedBaseAmount, min, max);
    });

    return transaction();
}

function releaseSuffix({ db, merchantOrderId, now = new Date() }) {
    return db.prepare(`
        UPDATE qris_suffix_locks
        SET released_at = ?
        WHERE merchant_order_id = ?
          AND released_at IS NULL
    `).run(toSqlDateTime(now), String(merchantOrderId || '').trim());
}

module.exports = {
    SuffixPoolExhaustedError,
    allocateRotatingSuffix,
    allocateSuffix,
    releaseExpiredSuffixes,
    releaseSuffix,
    suffixRange,
    toSqlDateTime,
};
