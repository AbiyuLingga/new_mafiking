const { Qris } = require('qris-mutasi');
const { validateNormalizedMutation } = require('./PaymentMutationProvider');

class QrisMutasiProvider {
    constructor({ email, password, cookieDir, timeout, filter, lookbackDays, timeZone, debug }) {
        this.email = email;
        this.password = password;
        this.cookieDir = cookieDir || '/tmp';
        this.timeout = timeout || 15000;
        this.filter = typeof filter === 'string' && filter.trim() ? filter.trim() : null;
        this.lookbackDays = Math.max(0, Number(lookbackDays) || 0);
        this.timeZone = timeZone || 'Asia/Jakarta';
        this.debug = Boolean(debug);
        this.qris = null;
    }

    async _ensureClient() {
        if (!this.qris) {
            this.qris = new Qris(this.email, this.password);
        }
    }

    async fetchLatestMutations() {
        try {
            await this._ensureClient();

            const today = new Date();
            const fromDate = formatDateInTimeZone(addDays(today, -this.lookbackDays), this.timeZone);
            const toDate = formatDateInTimeZone(today, this.timeZone);

            const data = await this.qris.mutasi(
                this.filter,
                fromDate,
                toDate,
                50
            );

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
