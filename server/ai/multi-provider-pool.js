const crypto = require('crypto');
const { GeminiClient, GEMINI_FLASH_LITE_MODEL } = require('./gemini-client');
const { GroqClient, GROQ_VISION_MODEL } = require('./groq-client');
const { OpenRouterClient, OPENROUTER_DEFAULT_MODEL } = require('./openrouter-client');
const { logTokenUsage } = require('./log-token-usage');

function getGeminiKeys() {
  return Array.from({ length: 20 }, (_, index) => process.env[`GEMINI_KEY_${index + 1}`])
    .map((key) => key && key.trim())
    .filter(Boolean);
}

function getGroqKey() {
  const key = process.env.GROQ_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function getOpenRouterKey() {
  const key = process.env.OPENROUTER_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function getPoolEnabled() {
  const v = String(process.env.MAFIKING_POOL_ENABLED || '').trim().toLowerCase();
  return v === '' || v === 'true' || v === '1' || v === 'yes';
}

function getNumberEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

class RequestQueue {
  constructor({ maxConcurrent }) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
    this.activeCount = 0;
    this.queue = [];
  }

  async enqueue(fn) {
    const enqueuedAt = Date.now();
    if (this.activeCount < this.maxConcurrent) {
      return this.execute(fn, enqueuedAt);
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, enqueuedAt });
    });
  }

  async execute(fn, enqueuedAt = Date.now()) {
    this.activeCount += 1;
    try {
      return await fn({ queueWaitMs: Math.max(0, Date.now() - enqueuedAt) });
    } finally {
      this.activeCount -= 1;
      this.drain();
    }
  }

  drain() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      this.execute(job.fn, job.enqueuedAt).then(job.resolve, job.reject);
    }
  }

  size() {
    return this.queue.length;
  }
}

class ResponseCache {
  constructor({ ttlMs }) {
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.map.size > 1000) {
      const now = Date.now();
      for (const [k, v] of this.map) {
        if (v.expiresAt < now) this.map.delete(k);
      }
    }
  }

  clear() {
    this.map.clear();
  }

  size() {
    return this.map.size;
  }

  static makeKey(parts, prompt, schema) {
    const hash = crypto.createHash('sha256');
    if (Array.isArray(parts)) {
      parts.forEach((p) => {
        if (!p) return;
        if (p.text) hash.update(String(p.text));
        if (p.inlineData && p.inlineData.data) {
          hash.update(String(p.inlineData.data).slice(0, 5000));
        }
      });
    }
    hash.update('|');
    hash.update(String(prompt || ''));
    hash.update('|');
    hash.update(JSON.stringify(schema || {}));
    return hash.digest('hex').slice(0, 32);
  }
}

class MultiProviderPool {
  constructor() {
    this.providers = [
      {
        name: 'gemini',
        client: new GeminiClient(),
        defaultModel: GEMINI_FLASH_LITE_MODEL,
        weight: getNumberEnv('MAFIKING_POOL_GEMINI_WEIGHT', 0.5),
        keyRpm: 15,
        keys: getGeminiKeys(),
      },
      {
        name: 'groq',
        client: new GroqClient(),
        defaultModel: GROQ_VISION_MODEL,
        weight: getNumberEnv('MAFIKING_POOL_GROQ_WEIGHT', 0.3),
        keyRpm: 30,
        keys: getGroqKey() ? [getGroqKey()] : [],
      },
      {
        name: 'openrouter',
        client: new OpenRouterClient(),
        defaultModel: process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL,
        weight: getNumberEnv('MAFIKING_POOL_OPENROUTER_WEIGHT', 0.2),
        keyRpm: 20,
        keys: getOpenRouterKey() ? [getOpenRouterKey()] : [],
      },
    ].filter((p) => p.keys.length > 0);

    this.queue = new RequestQueue({
      maxConcurrent: getNumberEnv('MAFIKING_POOL_MAX_CONCURRENT', 5),
    });
    this.cache = new ResponseCache({
      ttlMs: getNumberEnv('MAFIKING_POOL_CACHE_TTL_MS', 3600000),
    });
    this.keyLastUsedAt = new Map();
    this.stats = { calls: 0, cacheHits: 0, errors: 0, perProvider: {}, startedAt: Date.now() };
  }

  isAvailable() {
    return getPoolEnabled() && this.providers.length > 0;
  }

  async callWithPool({ prompt, parts, schema, maxOutputTokens, temperature, db, provider = 'auto', systemInstruction }) {
    if (!this.isAvailable()) {
      const error = new Error('Multi-provider pool tidak tersedia. Cek MAFIKING_POOL_ENABLED dan API keys.');
      error.status = 500;
      throw error;
    }

    const cacheKey = ResponseCache.makeKey(parts, systemInstruction || prompt, schema);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits += 1;
      return { ...cached, cached: true };
    }

    const initialPick = this.pickProvider(provider);
    if (!initialPick) {
      const error = new Error('Tidak ada provider yang tersedia di pool.');
      error.status = 500;
      throw error;
    }

    return this.queue.enqueue((queueInfo = {}) => this.executeWithFallback({
      prompt, parts, schema, maxOutputTokens, temperature, db, systemInstruction, cacheKey, requestedProvider: provider, queueWaitMs: queueInfo.queueWaitMs || 0,
    }, initialPick));
  }

  async executeWithFallback(params, initialPick) {
    const triedKeys = new Set();
    const candidates = [initialPick];

    const allowCrossProviderFallback = !params.requestedProvider || params.requestedProvider === 'auto';
    for (const p of this.providers) {
      if (!allowCrossProviderFallback && p.name !== initialPick.provider.name) continue;
      for (let i = 0; i < p.keys.length; i += 1) {
        candidates.push({ provider: p, keyIndex: i });
      }
    }

    let lastError = null;
    for (const cand of candidates) {
      const keyTag = `${cand.provider.name}:${cand.keyIndex}`;
      if (triedKeys.has(keyTag)) continue;
      triedKeys.add(keyTag);

      try {
        const result = await this.executeSingle(cand, params);
        return result;
      } catch (error) {
        lastError = error;
        this.stats.errors += 1;
        if (!error.retryable && error.status !== 429) {
          throw error;
        }
        continue;
      }
    }

    const finalError = new Error('Semua provider AI sedang limit atau overload. Coba lagi dalam beberapa detik.');
    finalError.status = 503;
    finalError.cause = lastError;
    finalError.attempts = [lastError];
    throw finalError;
  }

  async executeSingle(cand, params) {
    const { provider, keyIndex } = cand;
    const key = provider.keys[keyIndex];
    const startedAt = Date.now();

    const result = await provider.client.call({
      key,
      model: provider.defaultModel,
      parts: params.parts,
      prompt: params.prompt,
      schema: params.schema,
      maxOutputTokens: params.maxOutputTokens,
      temperature: params.temperature,
      systemInstruction: params.systemInstruction,
    });

    const durationMs = Date.now() - startedAt;
    this.keyLastUsedAt.set(`${provider.name}:${keyIndex}`, Date.now());

    if (params.cacheKey) {
      this.cache.set(params.cacheKey, result);
    }

    this.stats.calls += 1;
    this.stats.perProvider[provider.name] = (this.stats.perProvider[provider.name] || 0) + 1;

    if (params.db && result.usageMetadata) {
      try {
        logTokenUsage(params.db, {
          provider: provider.name,
          model: result.modelUsed,
          keyName: `${provider.name.toUpperCase()}_KEY_${keyIndex + 1}`,
          tokensUsed: result.usageMetadata.totalTokenCount || 0,
        });
      } catch (_) { /* logging must never break AI path */ }
    }

    return {
      ...result,
      durationMs,
      provider: provider.name,
      keyIndex: keyIndex + 1,
      queueWaitMs: params.queueWaitMs || 0,
    };
  }

  pickProvider(preferred) {
    const available = this.providers.filter((p) => p.weight > 0 && p.keys.length > 0);
    if (available.length === 0) return null;

    if (preferred && preferred !== 'auto') {
      const p = available.find((x) => x.name === preferred);
      if (p) return { provider: p, keyIndex: this.pickLeastUsedKey(p) };
    }

    const totalWeight = available.reduce((s, p) => s + p.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const p of available) {
      if (rand < p.weight) return { provider: p, keyIndex: this.pickLeastUsedKey(p) };
      rand -= p.weight;
    }
    return { provider: available[0], keyIndex: this.pickLeastUsedKey(available[0]) };
  }

  pickLeastUsedKey(provider) {
    let oldestKey = 0;
    let oldestTime = Infinity;
    provider.keys.forEach((_, idx) => {
      const t = this.keyLastUsedAt.get(`${provider.name}:${idx}`) || 0;
      if (t < oldestTime) {
        oldestTime = t;
        oldestKey = idx;
      }
    });
    return oldestKey;
  }

  getStats() {
    const totalCalls = this.stats.calls + this.stats.cacheHits;
    return {
      ...this.stats,
      cacheSize: this.cache.size(),
      queueSize: this.queue.size(),
      cacheHitRate: totalCalls > 0 ? this.stats.cacheHits / totalCalls : 0,
      uptimeMs: Date.now() - this.stats.startedAt,
    };
  }

  clearCache() {
    this.cache.clear();
  }
}

const pool = new MultiProviderPool();

module.exports = {
  callWithPool: (params) => pool.callWithPool(params),
  getPoolStats: () => pool.getStats(),
  isPoolAvailable: () => pool.isAvailable(),
  clearPoolCache: () => pool.clearCache(),
  MultiProviderPool,
  RequestQueue,
  ResponseCache,
};
