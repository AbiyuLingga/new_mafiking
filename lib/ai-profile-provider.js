const DEFAULT_NINEROUTER_BASE_URL = 'http://127.0.0.1:20128/v1';
const DEFAULT_NINEROUTER_MODEL = 'kr/claude-sonnet-4.5';
const AUTO_MODEL_VALUES = new Set(['auto', 'all', 'round-robin', '*']);
let roundRobinIndex = 0;

function getProfileProvider(env = process.env) {
  return String(env.AI_PROFILE_PROVIDER || 'gemini').trim().toLowerCase();
}

function shouldUse9RouterProfile(env = process.env) {
  return ['9router', 'ninerouter'].includes(getProfileProvider(env));
}

function get9RouterConfig(env = process.env) {
  const models = parseModelList(env.NINEROUTER_MODELS || env.NINEROUTER_MODEL || DEFAULT_NINEROUTER_MODEL);
  return {
    apiKey: String(env.NINEROUTER_API_KEY || '').trim(),
    baseUrl: normalizeBaseUrl(env.NINEROUTER_BASE_URL || DEFAULT_NINEROUTER_BASE_URL),
    maxTokens: Number(env.NINEROUTER_MAX_TOKENS || 1200),
    model: models[0] || DEFAULT_NINEROUTER_MODEL,
    models,
    timeoutMs: Number(env.NINEROUTER_TIMEOUT_MS || 60000),
  };
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_NINEROUTER_BASE_URL).replace(/\/+$/, '');
}

function build9RouterProfilePayload({ attempts, model, systemInstruction }) {
  return {
    model,
    messages: [
      {
        role: 'system',
        content: [
          systemInstruction,
          'Balas hanya JSON valid sesuai schema: strengths, weaknesses, recommendedQuestions, overallSummary.',
          'Jangan memilih ref soal final, difficulty final, atau Purcell reference final. Rekomendasi soal final dipilih oleh engine lokal backend.',
          'Gunakan recommendedQuestions hanya sebagai fallback teks umum. Jangan mengarang soal katalog.',
        ].filter(Boolean).join('\n\n'),
      },
      {
        role: 'user',
        content: `Buat raport belajar dari data berikut:\n\n${JSON.stringify(attempts || [])}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  };
}

function parseModelList(value) {
  return String(value || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

function isAutoModelList(models) {
  return models.length === 1 && AUTO_MODEL_VALUES.has(models[0].toLowerCase());
}

function read9RouterModelsResponse(body) {
  if (!Array.isArray(body?.data)) return [];
  return body.data
    .map((item) => String(item?.id || '').trim())
    .filter(Boolean);
}

async function fetch9RouterModels(config, fetchImpl = fetch) {
  const response = await fetchImpl(`${config.baseUrl}/models`, {
    method: 'GET',
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
  });
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.message || `9Router models request failed (${response.status}).`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return read9RouterModelsResponse(body);
}

function chooseRoundRobinModel(models) {
  if (!models.length) return DEFAULT_NINEROUTER_MODEL;
  const model = models[roundRobinIndex % models.length];
  roundRobinIndex = (roundRobinIndex + 1) % models.length;
  return model;
}

async function resolve9RouterModel(config, fetchImpl = fetch) {
  if (isAutoModelList(config.models)) {
    const models = await fetch9RouterModels(config, fetchImpl);
    return chooseRoundRobinModel(models);
  }
  return chooseRoundRobinModel(config.models);
}

function extractOpenAiChatText(body) {
  const text = body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.text ?? '';
  return String(text || '');
}

async function call9RouterProfileSummary({ attempts, systemInstruction, fetchImpl = fetch, env = process.env }) {
  const config = get9RouterConfig(env);
  if (!config.apiKey) {
    const error = new Error('NINEROUTER_API_KEY belum diset di .env.');
    error.status = 500;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const selectedModel = await resolve9RouterModel(config, fetchImpl);
  const payload = {
    ...build9RouterProfilePayload({
      attempts,
      model: selectedModel,
      systemInstruction,
    }),
    max_tokens: config.maxTokens,
  };

  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw };
    }

    if (!response.ok) {
      const error = new Error(body?.error?.message || body?.message || `9Router request failed (${response.status}).`);
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return {
      modelUsed: body.model || selectedModel,
      provider: '9router',
      text: extractOpenAiChatText(body),
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('9Router profile summary timeout.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  build9RouterProfilePayload,
  call9RouterProfileSummary,
  chooseRoundRobinModel,
  extractOpenAiChatText,
  fetch9RouterModels,
  get9RouterConfig,
  getProfileProvider,
  isAutoModelList,
  normalizeBaseUrl,
  parseModelList,
  read9RouterModelsResponse,
  resolve9RouterModel,
  shouldUse9RouterProfile,
};
