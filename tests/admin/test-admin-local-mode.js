const assert = require('assert');
const { isLocalAdminMode, isLoopbackAddress } = require('../../server/middleware/admin');

const originalEnv = { ...process.env };

function makeReq({ ip = '127.0.0.1', remoteAddress = '127.0.0.1', forwardedFor = '' } = {}) {
    return {
        ip,
        socket: { remoteAddress },
        headers: { 'x-forwarded-for': forwardedFor },
    };
}

try {
    assert.strictEqual(isLoopbackAddress('127.0.0.1'), true);
    assert.strictEqual(isLoopbackAddress('10.0.0.1'), false);

    process.env.NODE_ENV = 'development';
    delete process.env.LOCAL_ADMIN_MODE;
    assert.strictEqual(isLocalAdminMode(makeReq()), false, 'local admin must be opt-in');

    process.env.LOCAL_ADMIN_MODE = 'true';
    assert.strictEqual(isLocalAdminMode(makeReq()), true, 'loopback should pass when explicitly enabled');
    assert.strictEqual(
        isLocalAdminMode(makeReq({ ip: '10.0.0.5', remoteAddress: '10.0.0.5', forwardedFor: '127.0.0.1' })),
        false,
        'x-forwarded-for must not enable local admin mode'
    );

    process.env.NODE_ENV = 'production';
    assert.strictEqual(isLocalAdminMode(makeReq()), false, 'production must never enable local admin mode');
} finally {
    process.env = originalEnv;
}

console.log('Admin local mode tests passed');
