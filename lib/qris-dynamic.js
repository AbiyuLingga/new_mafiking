const QRCode = require('qrcode');
const {
    convertQRIS,
    parseQRIS,
    validateQRIS,
} = require('@prasetya/qris');

function qrisError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function normalizeQrisString(value) {
    return String(value || '').trim();
}

function normalizePositiveInteger(value, fieldName) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) {
        throw qrisError(`${fieldName} harus berupa integer positif`, 'INVALID_QRIS_AMOUNT');
    }
    return number;
}

function assertValidStaticQris(staticString) {
    const qris = normalizeQrisString(staticString);
    const result = validateQRIS(qris);
    if (!result.valid) {
        throw qrisError(`QRIS statis tidak valid: ${result.errors.join('; ')}`, 'INVALID_STATIC_QRIS');
    }

    const parsed = parseQRIS(qris);
    if (parsed.method !== 'static') {
        throw qrisError('QRIS_STATIC_STRING harus berupa QRIS statis dengan tag 01 bernilai 11', 'QRIS_STATIC_REQUIRED');
    }
    return parsed;
}

async function generateDynamicQRIS({ staticString, baseAmount, suffix }) {
    assertValidStaticQris(staticString);
    const normalizedBaseAmount = normalizePositiveInteger(baseAmount, 'baseAmount');
    const normalizedSuffix = normalizePositiveInteger(suffix, 'suffix');
    const fullAmount = normalizedBaseAmount + normalizedSuffix;

    const dynamicString = convertQRIS(normalizeQrisString(staticString), {
        amount: fullAmount,
    });

    const revalidated = validateQRIS(dynamicString);
    if (!revalidated.valid) {
        throw qrisError(`QRIS dinamis gagal validasi: ${revalidated.errors.join('; ')}`, 'INVALID_DYNAMIC_QRIS');
    }

    const parsed = parseQRIS(dynamicString);
    if (parsed.method !== 'dynamic') {
        throw qrisError('QRIS dinamis tidak memiliki tag 01 bernilai 12', 'INVALID_DYNAMIC_QRIS');
    }
    if (String(parsed.amount || '') !== String(fullAmount)) {
        throw qrisError(`Nominal QRIS dinamis tidak cocok: expected ${fullAmount}, got ${parsed.amount || '-'}`, 'INVALID_DYNAMIC_AMOUNT');
    }

    const qrImageDataUrl = await QRCode.toDataURL(dynamicString, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 512,
    });

    return {
        baseAmount: normalizedBaseAmount,
        suffix: normalizedSuffix,
        fullAmount,
        dynamicString,
        qrImageDataUrl,
        merchantName: parsed.merchantName,
        merchantCity: parsed.merchantCity,
    };
}

module.exports = {
    assertValidStaticQris,
    generateDynamicQRIS,
    normalizeQrisString,
    parseQRIS,
    validateQRIS,
};
