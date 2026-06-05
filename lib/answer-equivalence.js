function normalizeForEquivalence(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\\text\{([^{}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^{}]+)\}/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\leq|\\le/g, '<=')
    .replace(/\\geq|\\ge/g, '>=')
    .replace(/\\infty/g, 'inf')
    .replace(/\\pi/g, 'pi')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/[^0-9a-z+\-*/=().,]/g, '')
    .replace(/,/g, '.')
    .replace(/([0-9)])\(/g, '$1*(')
    .replace(/\)\(/g, ')*(');
}

function toNumericExpression(value) {
  const text = normalizeForEquivalence(value);
  if (!text || text.length > 100) return null;
  if (!/^[0-9+\-*/().]+$/.test(text)) return null;
  return text;
}

function numericValue(value) {
  const expression = toNumericExpression(value);
  if (!expression) return null;
  try {
    const result = Function('"use strict"; return (' + expression + ')')();
    return Number.isFinite(result) ? result : null;
  } catch (_) {
    return null;
  }
}

function isAnswerEquivalent(detected, expected) {
  const a = normalizeForEquivalence(detected);
  const b = normalizeForEquivalence(expected);
  if (!a || !b) return false;
  if (a === b) return true;

  const aNum = numericValue(detected);
  const bNum = numericValue(expected);
  return aNum != null && bNum != null && Math.abs(aNum - bNum) < 1e-6;
}

module.exports = { isAnswerEquivalent, normalizeForEquivalence };
