const UNSUPPORTED_SCHEMA_KEYS = new Set([
  'description',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'pattern',
  'format',
]);

function simplifyGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(simplifyGeminiSchema);

  const simplified = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    simplified[key] = simplifyGeminiSchema(value);
  }
  return simplified;
}

module.exports = { simplifyGeminiSchema };
