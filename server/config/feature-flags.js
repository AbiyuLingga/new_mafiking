// server/config/feature-flags.js
// Runtime feature flags for the v3 payment system.
// Default: all flags ON. Set env var to 'false' to disable.

const flags = {
    SSE_PAYMENT_PUSH: process.env.SSE_PAYMENT_PUSH !== 'false',
    ADAPTIVE_POLLING: process.env.ADAPTIVE_POLLING !== 'false',
    BULK_ADMIN: process.env.BULK_ADMIN !== 'false',
    CONFIDENCE_MATCHING: process.env.CONFIDENCE_MATCHING !== 'false',
    SELF_HEALING_COLLECTOR: process.env.SELF_HEALING_COLLECTOR !== 'false',
    PAYMENT_SUCCESS_EMAIL: process.env.PAYMENT_SUCCESS_EMAIL !== 'false',
};

/**
 * Returns whether a feature flag is enabled.
 * @param {string} flag
 * @returns {boolean}
 */
function isEnabled(flag) {
    if (!Object.prototype.hasOwnProperty.call(flags, flag)) {
        return false;
    }
    return Boolean(flags[flag]);
}

module.exports = { isEnabled, flags };
