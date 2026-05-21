const assert = require('node:assert/strict');

const {
  build9RouterProfilePayload,
  call9RouterProfileSummary,
  extractOpenAiChatText,
  get9RouterConfig,
  isAutoModelList,
  normalizeBaseUrl,
  parseModelList,
  read9RouterModelsResponse,
  resolve9RouterModel,
  shouldUse9RouterProfile,
} = require('../lib/ai-profile-provider');

async function run() {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:20128/v1/'), 'http://127.0.0.1:20128/v1');
  assert.equal(shouldUse9RouterProfile({ AI_PROFILE_PROVIDER: '9router' }), true);
  assert.equal(shouldUse9RouterProfile({ AI_PROFILE_PROVIDER: 'gemini' }), false);
  assert.deepEqual(parseModelList('a,b, c '), ['a', 'b', 'c']);
  assert.equal(isAutoModelList(['auto']), true);
  assert.equal(isAutoModelList(['a', 'b']), false);

  const config = get9RouterConfig({
    NINEROUTER_BASE_URL: 'http://localhost:20128/v1/',
    NINEROUTER_API_KEY: 'sk-test',
    NINEROUTER_MODEL: 'kr/claude-sonnet-4.5',
    NINEROUTER_TIMEOUT_MS: '1500',
    NINEROUTER_MAX_TOKENS: '777',
  });
  assert.equal(config.baseUrl, 'http://localhost:20128/v1');
  assert.equal(config.apiKey, 'sk-test');
  assert.equal(config.maxTokens, 777);
  assert.equal(config.timeoutMs, 1500);
  assert.deepEqual(config.models, ['kr/claude-sonnet-4.5']);

  const multiConfig = get9RouterConfig({
    NINEROUTER_MODELS: 'model-a, model-b',
  });
  assert.deepEqual(multiConfig.models, ['model-a', 'model-b']);

  const payload = build9RouterProfilePayload({
    attempts: [{ score: 40, weaknessTags: ['chain rule'] }],
    model: config.model,
    systemInstruction: 'Buat raport singkat.',
  });
  assert.equal(payload.model, 'kr/claude-sonnet-4.5');
  assert.equal(payload.response_format.type, 'json_object');
  assert.equal(payload.messages.length, 2);
  assert.ok(payload.messages[0].content.includes('Jangan memilih ref soal final'));
  assert.ok(payload.messages[0].content.includes('Gunakan recommendedQuestions hanya sebagai fallback'));
  assert.ok(payload.messages[1].content.includes('chain rule'));

  assert.deepEqual(read9RouterModelsResponse({
    data: [{ id: 'cc/a' }, { id: 'cc/b' }, { id: '' }],
  }), ['cc/a', 'cc/b']);

  assert.equal(extractOpenAiChatText({
    choices: [{ message: { content: '{"overallSummary":"ok"}' } }],
  }), '{"overallSummary":"ok"}');

  const fakeFetch = async (url, options = {}) => {
    if (url.endsWith('/models')) {
      return responseJson(200, { data: [{ id: 'cc/a' }, { id: 'cc/b' }] });
    }
    const body = JSON.parse(options.body);
    return responseJson(200, {
      choices: [{ message: { content: '{"overallSummary":"ok"}' } }],
      model: body.model,
    });
  };

  const autoEnv = {
    NINEROUTER_API_KEY: 'sk-test',
    NINEROUTER_MODEL: 'auto',
  };
  assert.equal(await resolve9RouterModel(get9RouterConfig(autoEnv), fakeFetch), 'cc/a');
  assert.equal(await resolve9RouterModel(get9RouterConfig(autoEnv), fakeFetch), 'cc/b');

  const result = await call9RouterProfileSummary({
    attempts: [{ score: 70 }],
    systemInstruction: 'Buat ringkasan.',
    fetchImpl: fakeFetch,
    env: autoEnv,
  });
  assert.equal(result.provider, '9router');
  assert.equal(result.text, '{"overallSummary":"ok"}');
  assert.ok(['cc/a', 'cc/b'].includes(result.modelUsed));

  console.log('AI profile provider tests passed');
}

function responseJson(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
