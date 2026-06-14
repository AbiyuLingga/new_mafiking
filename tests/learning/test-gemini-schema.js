const assert = require('assert');
const { simplifyGeminiSchema } = require('../../server/ai/gemini-schema');

const schema = {
  type: 'object',
  description: 'long docs',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    rows: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200, pattern: '.+' },
          when: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

const simplified = simplifyGeminiSchema(schema);
const text = JSON.stringify(simplified);

for (const key of ['description', 'minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'format']) {
  assert.equal(text.includes(`"${key}"`), false, `${key} should be removed`);
}

assert.equal(simplified.type, 'object');
assert.equal(simplified.properties.score.type, 'integer');
assert.equal(simplified.properties.rows.items.properties.text.type, 'string');

console.log('Gemini schema simplifier tests passed');
