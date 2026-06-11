#!/usr/bin/env node
// Test feature flags for v3 payment system
// Run from project root: node scripts/test-feature-flags.js

const assert = require('assert');
const { isEnabled, flags } = require('../lib/feature-flags');

let passed = 0;
let failed = 0;

function ok(name) {
    console.log(`ok ${name}`);
    passed += 1;
}

function fail(name, detail) {
    console.log(`FAIL ${name}: ${detail}`);
    failed += 1;
}

function test(name, fn) {
    try {
        fn();
        ok(name);
    } catch (err) {
        fail(name, err.message);
    }
}

// 1. Default flags: all ON
test('default flags: all v3 features ON', () => {
    assert.strictEqual(isEnabled('SSE_PAYMENT_PUSH'), true, 'SSE_PAYMENT_PUSH should default ON');
    assert.strictEqual(isEnabled('ADAPTIVE_POLLING'), true, 'ADAPTIVE_POLLING should default ON');
    assert.strictEqual(isEnabled('BULK_ADMIN'), true, 'BULK_ADMIN should default ON');
    assert.strictEqual(isEnabled('CONFIDENCE_MATCHING'), true, 'CONFIDENCE_MATCHING should default ON');
    assert.strictEqual(isEnabled('SELF_HEALING_COLLECTOR'), true, 'SELF_HEALING_COLLECTOR should default ON');
    assert.strictEqual(isEnabled('PAYMENT_SUCCESS_EMAIL'), true, 'PAYMENT_SUCCESS_EMAIL should default ON');
});

// 2. flags object exposed
test('flags object exposes all v3 features', () => {
    const required = [
        'SSE_PAYMENT_PUSH',
        'ADAPTIVE_POLLING',
        'BULK_ADMIN',
        'CONFIDENCE_MATCHING',
        'SELF_HEALING_COLLECTOR',
        'PAYMENT_SUCCESS_EMAIL',
    ];
    for (const name of required) {
        assert.ok(Object.prototype.hasOwnProperty.call(flags, name), `flags must include ${name}`);
    }
});

// 3. Disable via env var
test('SSE_PAYMENT_PUSH=false via env returns false', () => {
    const original = process.env.SSE_PAYMENT_PUSH;
    process.env.SSE_PAYMENT_PUSH = 'false';
    // Reload to pick up env
    delete require.cache[require.resolve('../lib/feature-flags')];
    const reloaded = require('../lib/feature-flags');
    assert.strictEqual(reloaded.isEnabled('SSE_PAYMENT_PUSH'), false);
    // Restore
    if (original === undefined) {
        delete process.env.SSE_PAYMENT_PUSH;
    } else {
        process.env.SSE_PAYMENT_PUSH = original;
    }
    delete require.cache[require.resolve('../lib/feature-flags')];
});

// 4. Unknown flag returns false
test('unknown flag returns false', () => {
    assert.strictEqual(isEnabled('DOES_NOT_EXIST'), false);
    assert.strictEqual(isEnabled(''), false);
    assert.strictEqual(isEnabled(null), false);
});

// 5. Truthy values
test('isEnabled returns boolean (not truthy value)', () => {
    const result = isEnabled('SSE_PAYMENT_PUSH');
    assert.strictEqual(typeof result, 'boolean', 'isEnabled must return boolean');
});

// Summary
console.log('');
console.log(`Result: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
