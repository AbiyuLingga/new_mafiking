const assert = require('assert');
const {
    isStateChangingRequest,
    isTrustedRequestOrigin,
    shouldRejectCrossSiteRequest,
} = require('../../lib/request-guard');

function makeReq({ method = 'POST', path = '/api/progress/submit', headers = {}, protocol = 'https', host = 'mafiking.test' } = {}) {
    const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    return {
        method,
        path,
        protocol,
        headers: { host, ...lowerHeaders },
        get(name) {
            return this.headers[String(name).toLowerCase()];
        },
    };
}

assert.strictEqual(isStateChangingRequest(makeReq({ method: 'GET' })), false);
assert.strictEqual(isStateChangingRequest(makeReq({ method: 'POST' })), true);

assert.strictEqual(isTrustedRequestOrigin(makeReq({
    headers: { Origin: 'https://mafiking.test' },
})), true);
assert.strictEqual(shouldRejectCrossSiteRequest(makeReq({
    headers: { Origin: 'https://evil.test' },
})), true);
assert.strictEqual(shouldRejectCrossSiteRequest(makeReq({
    headers: { 'sec-fetch-site': 'cross-site' },
})), true);
assert.strictEqual(shouldRejectCrossSiteRequest(makeReq({
    path: '/api/payment/callback',
    headers: { Origin: 'https://payment-provider.test' },
})), false);
assert.strictEqual(shouldRejectCrossSiteRequest(makeReq({
    path: '/api/performance/vitals',
    headers: { Origin: 'https://evil.test' },
})), true);
assert.strictEqual(shouldRejectCrossSiteRequest(makeReq({
    path: '/api/performance/vitals',
    headers: { Origin: 'https://mafiking.test' },
})), false);

console.log('Request guard tests passed');
