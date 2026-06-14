const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { calculateCRC16, parseQRIS, validateQRIS } = require('@prasetya/qris');
const { generateDynamicQRIS } = require('../../server/payments/qris-dynamic');

function buildStaticFixture() {
    const body = '00020101021126320014ID.CO.QRIS.WWW011012345678905204000053033605802ID5908MAFIKING6007BANDUNG6304';
    return body + calculateCRC16(body);
}

function decodeDataUrl(dataUrl) {
    const match = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ''));
    if (!match) throw new Error('QR image data URL bukan PNG base64');
    return Buffer.from(match[1], 'base64');
}

async function main() {
    const staticString = String(process.env.QRIS_STATIC_STRING || '').trim() || buildStaticFixture();
    const usingFixture = !String(process.env.QRIS_STATIC_STRING || '').trim();
    const baseAmount = Number.parseInt(String(process.env.QRIS_TEST_BASE_AMOUNT || '25000'), 10);
    const suffix = Number.parseInt(String(process.env.QRIS_TEST_SUFFIX || '12'), 10);

    const staticValidation = validateQRIS(staticString);
    assert.equal(staticValidation.valid, true, `QRIS statis invalid: ${staticValidation.errors.join('; ')}`);

    const result = await generateDynamicQRIS({ staticString, baseAmount, suffix });
    const dynamicValidation = validateQRIS(result.dynamicString);
    assert.equal(dynamicValidation.valid, true, `QRIS dinamis invalid: ${dynamicValidation.errors.join('; ')}`);

    const parsed = parseQRIS(result.dynamicString);
    assert.equal(parsed.method, 'dynamic');
    assert.equal(parsed.amount, String(baseAmount + suffix));
    assert.equal(result.fullAmount, baseAmount + suffix);
    assert.ok(result.qrImageDataUrl.startsWith('data:image/png;base64,'));

    const outputPath = process.env.QRIS_TEST_OUTPUT || '/tmp/qris-test.png';
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, decodeDataUrl(result.qrImageDataUrl));

    console.log(JSON.stringify({
        ok: true,
        usingFixture,
        fullAmount: result.fullAmount,
        method: parsed.method,
        merchantName: parsed.merchantName,
        outputPath,
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
