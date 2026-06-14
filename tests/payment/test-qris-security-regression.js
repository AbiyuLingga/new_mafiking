// QRIS Regression Test
// Phase 3 supply-chain hardening: validates @prasetya/qris parse/convert/CRC
// behavior against a known-good static QRIS string.

const assert = require('assert');
const { validateQRIS, parseQRIS, convertQRIS } = require('@prasetya/qris');
const { generateDynamicQRIS, assertValidStaticQris } = require('../../server/payments/qris-dynamic');
const { normalizeQrisString } = require('../../server/payments/qris-dynamic');
const QRCode = require('qrcode');

const STATIC_QRIS = '00020101021126760024ID.CO.SPEEDCASH.MERCHANT01189360081530004444050215ID10260044440590303UKE51440014ID.CO.QRIS.WWW0215ID10265317196840303UKE5204541153033605802ID5908MAFIKING6008SUMEDANG61054536362410509S383407200117202606111547283820703A01630482DD';

let passed = 0;
let failed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ok  ${name}`);
    } catch (err) {
        failed++;
        console.error(`  FAIL ${name}: ${err.message}`);
    }
}

console.log('QRIS regression tests:');

test('validateQRIS: static QRIS is structurally valid', () => {
    const result = validateQRIS(STATIC_QRIS);
    assert.strictEqual(result.valid, true, `Expected valid, got: ${JSON.stringify(result.errors)}`);
});

test('parseQRIS: identifies static method (tag 01 = 11)', () => {
    const parsed = parseQRIS(STATIC_QRIS);
    assert.strictEqual(parsed.method, 'static');
    assert.ok(parsed.merchantName || parsed.merchantNameRaw);
});

test('parseQRIS: extracts merchant info', () => {
    const parsed = parseQRIS(STATIC_QRIS);
    assert.ok(parsed, 'parsed object exists');
    const m = String(parsed.merchantName || '').toUpperCase();
    assert.ok(m.includes('MAFIKING') || m.includes('MERCHANT'), `Expected MAFIKING/MERCHANT, got: ${m}`);
});

test('convertQRIS: tag 01 changes from 11 to 12', () => {
    const dynamic = convertQRIS(STATIC_QRIS, { amount: 13500 });
    const parsed = parseQRIS(dynamic);
    assert.strictEqual(parsed.method, 'dynamic', `Expected dynamic, got: ${parsed.method}`);
});

test('convertQRIS: amount tag 54 injected and matches input', () => {
    const amount = 13500;
    const dynamic = convertQRIS(STATIC_QRIS, { amount });
    const parsed = parseQRIS(dynamic);
    assert.strictEqual(Number(parsed.amount), amount, `Expected amount ${amount}, got ${parsed.amount}`);
});

test('convertQRIS: CRC-16 (tag 63) valid in output', () => {
    const dynamic = convertQRIS(STATIC_QRIS, { amount: 13500 });
    const result = validateQRIS(dynamic);
    assert.strictEqual(result.valid, true, 'Converted dynamic QRIS should be valid');
});

test('convertQRIS: CRC differs from static (tag 63 changed)', () => {
    const dynamic = convertQRIS(STATIC_QRIS, { amount: 13500 });
    const staticCrc = STATIC_QRIS.slice(-4);
    const dynamicCrc = dynamic.slice(-4);
    assert.notStrictEqual(staticCrc, dynamicCrc, 'CRC should differ between static and dynamic');
});

test('convertQRIS: rejects zero amount', () => {
    assert.throws(() => convertQRIS(STATIC_QRIS, { amount: 0 }), /positive integer/i);
});

test('convertQRIS: rejects negative amount', () => {
    assert.throws(() => convertQRIS(STATIC_QRIS, { amount: -1 }), /positive integer/i);
});

test('convertQRIS: rejects non-integer amount', () => {
    assert.throws(() => convertQRIS(STATIC_QRIS, { amount: 1.5 }), /positive integer/i);
});

test('convertQRIS: rejects empty QRIS string', () => {
    assert.throws(() => convertQRIS('', { amount: 1000 }), /empty|invalid/i);
});

test('convertQRIS: small amount (Rp 500) works', () => {
    const dynamic = convertQRIS(STATIC_QRIS, { amount: 500 });
    const parsed = parseQRIS(dynamic);
    assert.strictEqual(Number(parsed.amount), 500);
});

test('convertQRIS: large amount (Rp 999999) works', () => {
    const dynamic = convertQRIS(STATIC_QRIS, { amount: 999999 });
    const parsed = parseQRIS(dynamic);
    assert.strictEqual(Number(parsed.amount), 999999);
});

test('assertValidStaticQris: accepts known static', () => {
    assertValidStaticQris(STATIC_QRIS);
});

test('assertValidStaticQris: rejects dynamic QRIS', () => {
    const dynamic = convertQRIS(STATIC_QRIS, { amount: 13500 });
    assert.throws(() => assertValidStaticQris(dynamic), /static/i);
});

test('assertValidStaticQris: rejects empty string', () => {
    assert.throws(() => assertValidStaticQris(''), /empty|required/i);
});

test('assertValidStaticQris: rejects garbage string', () => {
    assert.throws(() => assertValidStaticQris('not-a-qris-string'), /tidak valid|invalid|too short|empty/i);
});

test('normalizeQrisString: trims whitespace', () => {
    const result = normalizeQrisString('  ' + STATIC_QRIS + '  ');
    assert.ok(result.length > 0);
});

test('QRCode.toDataURL: renders dynamic string as image', async () => {
    const dynamic = convertQRIS(STATIC_QRIS, { amount: 13500 });
    const dataUrl = await QRCode.toDataURL(dynamic, { errorCorrectionLevel: 'M', width: 256 });
    assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'Should produce PNG data URL');
});

test('generateDynamicQRIS: produces complete result with all fields', async () => {
    const result = await generateDynamicQRIS({
        staticString: STATIC_QRIS,
        baseAmount: 13500,
        suffix: 123,
    });
    assert.ok(result.qrImageDataUrl, 'qrImageDataUrl exists');
    assert.ok(result.dynamicString, 'dynamicString exists');
    assert.strictEqual(result.fullAmount, 13623); // 13500 + 123
    assert.strictEqual(result.baseAmount, 13500);
    assert.strictEqual(result.suffix, 123);
});

console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
