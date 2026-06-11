const crypto = require('crypto');

/**
 * @typedef {Object} NormalizedMutation
 * @property {string}   provider              - 'qris_merchant' | 'mock'
 * @property {string}   [providerMutationId]  - ID unik dari provider
 * @property {'IN'|'OUT'} direction           - Arah transaksi
 * @property {number}   amount                - Nominal rupiah (integer positif)
 * @property {'SUCCESS'|'PENDING'|'FAILED'|'UNKNOWN'} status
 * @property {Date}     transactedAt          - Waktu transaksi terjadi
 * @property {string}   [payerName]           - Nama pengirim
 * @property {string}   [payerId]             - ID pengirim
 * @property {string}   [note]                - Catatan transaksi
 */

function validateNormalizedMutation(m) {
    if (!m || typeof m !== 'object') return false;
    if (!Number.isSafeInteger(m.amount) || m.amount <= 0) return false;
    if (m.direction !== 'IN' && m.direction !== 'OUT') return false;
    if (!(m.transactedAt instanceof Date) || isNaN(m.transactedAt.getTime())) return false;
    if (!['SUCCESS', 'PENDING', 'FAILED', 'UNKNOWN'].includes(m.status)) return false;
    return true;
}

module.exports = { validateNormalizedMutation };
