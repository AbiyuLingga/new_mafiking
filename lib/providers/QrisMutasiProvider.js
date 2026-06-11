const { Qris } = require('qris-mutasi');
const { validateNormalizedMutation } = require('./PaymentMutationProvider');
const fs = require('fs');
const path = require('path');
const os = require('os');

class QrisMutasiProvider {
    constructor({ email, password, cookieDir, timeout, filter, lookbackDays, timeZone, debug, allowedHosts = null }) {
        this.email = email;
        this.password = password;
        this.debug = Boolean(debug);
        this.allowedHosts = Array.isArray(allowedHosts) ? allowedHosts : ['merchant.qris.online'];
        this.timeout = timeout || 15000;
        this.filter = typeof filter === 'string' && filter.trim() ? filter.trim() : null;
        this.lookbackDays = Math.max(0, Number(lookbackDays) || 0);
        this.timeZone = timeZone || 'Asia/Jakarta';
        this.qris = null;

        // The qris-mutasi library ignores cookieDir and stores the cookie file
        // in process.cwd() as `<user+pass-hash>_cookie.txt`. We sandbox the
        // working directory before constructing Qris, then restore it after.
        this._originalCwd = process.cwd();
        this.cookieDir = this._resolveCookieDir(cookieDir);
        this._cookieFilePath = null;
    }

    _resolveCookieDir(supplied) {
        const fallback = path.join(os.homedir(), '.mafiking-qris-cookie');
        const target = String(supplied || process.env.QRIS_COOKIE_DIR || fallback).trim();
        try {
            fs.mkdirSync(target, { recursive: true, mode: 0o700 });
            try {
                fs.chmodSync(target, 0o700);
            } catch (_) {
                // chown/chmod may be restricted on some platforms.
            }
            return fs.realpathSync(target);
        } catch (err) {
            console.error('[QrisMutasiProvider] failed to create cookie dir:', err.message);
            return this._originalCwd;
        }
    }

    _ensureSecureCookieFilePermissions() {
        if (!this._cookieFilePath) return;
        try {
            fs.chmodSync(this._cookieFilePath, 0o600);
        } catch (_) {}
    }

    _egressAllowed(url) {
        try {
            const u = new URL(url);
            return this.allowedHosts.includes(u.hostname);
        } catch (_) {
            return false;
        }
    }

    async _ensureClient() {
        if (!this.qris) {
            // chdir into the sandbox before constructing Qris so its cookie
            // file lands inside the protected directory, not in app cwd.
            try {
                process.chdir(this.cookieDir);
            } catch (err) {
                console.error('[QrisMutasiProvider] chdir failed:', err.message);
            }
            this.qris = new Qris(this.email, this.password);
            // Cookie file path mirrors the library's hash(name) formula.
            const hash = this._hash(this.email + this.password);
            this._cookieFilePath = path.join(this.cookieDir, `${hash}_cookie.txt`);
            this._ensureSecureCookieFilePermissions();
        }
    }

    _hash(input) {
        let h = 0;
        for (let i = 0; i < input.length; i++) {
            h = (h << 5) - h + input.charCodeAt(i);
            h |= 0;
        }
        return h.toString();
    }

    async fetchLatestMutations() {
        try {
            await this._ensureClient();
            this._ensureSecureCookieFilePermissions();

            const today = new Date();
            const fromDate = formatDateInTimeZone(addDays(today, -this.lookbackDays), this.timeZone);
            const toDate = formatDateInTimeZone(today, this.timeZone);

            const data = await Promise.race([
                this.qris.mutasi(this.filter, fromDate, toDate, 50),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Mutasi fetch timeout')), this.timeout)
                ),
            ]);

            if (!Array.isArray(data)) {
                if (this.debug) {
                    console.warn('[QrisMutasiProvider] non-array response:', typeof data);
                }
                return [];
            }

            const normalized = [];
            const invalid = [];
            for (const row of data) {
                const mutation = normalizeQrisRow(row);
                if (mutation && validateNormalizedMutation(mutation)) {
                    normalized.push(mutation);
                } else if (row) {
                    invalid.push(summarizeQrisRow(row));
                }
            }

            if (this.debug) {
                console.log('[QrisMutasiProvider] fetch summary', JSON.stringify({
                    fromDate,
                    toDate,
                    filter: this.filter || '',
                    rawRows: data.length,
                    normalizedRows: normalized.length,
                    invalidRows: invalid.length,
                    sample: data.slice(0, 3).map(summarizeQrisRow),
                    invalidSample: invalid.slice(0, 3),
                }));
            }

            return normalized;

        } catch (error) {
            console.error('[QrisMutasiProvider] fetch error:', error.message);
            return [];
        }
    }
}

function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function formatDateInTimeZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
}

function parseAmount(value) {
    if (typeof value === 'number') return Math.round(value);
    const cleaned = String(value || '').replace(/[^0-9]/g, '');
    return Number.parseInt(cleaned, 10) || 0;
}

function parseMutationDate(row) {
    const timestamp = Number(row && row.timestamp);
    if (Number.isFinite(timestamp) && timestamp > 0) {
        const milliseconds = timestamp > 9999999999 ? timestamp : timestamp * 1000;
        return new Date(milliseconds);
    }
    return new Date(row && row.tanggal);
}

function normalizeStatus(status) {
    const raw = String(status || '').trim().toUpperCase();
    if (raw.includes('SUCCESS') || raw.includes('BERHASIL') || raw.includes('PAID')) {
        return 'SUCCESS';
    }
    if (['SUCCESS', 'BERHASIL', 'PAID', 'SETTLED', 'COMPLETED', 'VALID', 'OK'].includes(raw)) {
        return 'SUCCESS';
    }
    if (['PENDING', 'PROCESS', 'PROCESSING'].includes(raw)) return 'PENDING';
    if (['FAILED', 'FAIL', 'GAGAL', 'EXPIRED', 'CANCELLED', 'CANCELED'].includes(raw)) return 'FAILED';
    return raw ? 'UNKNOWN' : 'SUCCESS';
}

function normalizeQrisRow(row) {
    if (!row) return null;
    const amount = parseAmount(row.nominal);
    if (amount <= 0) return null;
    return {
                    provider: 'qris_merchant',
                    providerMutationId: String(row.rrn || row.id || ''),
                    direction: 'IN',
        amount,
        status: normalizeStatus(row.status),
        transactedAt: parseMutationDate(row),
                    payerName: String(row.nama_costumer || ''),
                    payerId: String(row.rrn || ''),
                    note: String(row.asal_transaksi || ''),
    };
}

function summarizeQrisRow(row) {
    return {
        id: row && row.id,
        amount: parseAmount(row && row.nominal),
        status: String(row && row.status || ''),
        tanggal: String(row && row.tanggal || ''),
        hasRrn: Boolean(row && row.rrn),
        asalTransaksi: String(row && row.asal_transaksi || ''),
    };
}

module.exports = {
    QrisMutasiProvider,
    normalizeQrisRow,
    normalizeStatus,
    parseAmount,
    parseMutationDate,
};
