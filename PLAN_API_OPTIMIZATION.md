# Plan: Multi-Provider API Pool — Groq + Gemini 2.5 Flash Lite

**Status:** In progress — Phase 1 dan Phase 2 implemented, validation pending
**Tanggal:** 2026-06-03
**Target:** Mengganti 3-key Gemini-only dengan pool Groq + Gemini untuk capacity 2x, latency 50% lebih cepat, zero cost

---

## 1. Latar Belakang & Masalah

### 1.1 Kondisi Saat Ini

User baru (anonymous/guest) di Mafiking yang submit canvas memicu flow:

```
User submit canvas
  ↓
POST /api/correction/transcribe → Gemini call (1x) [~3-8 detik]
  ↓ (return OCR text, tampilkan ke user, tunggu konfirmasi)
POST /api/correction/evaluate   → Gemini call (1x) [~8-15 detik]
  ↓
POST /api/progress/submit        → SQLite (instan)
```

**Total wait user:** ~11-23 detik per soal canvas (sequential)

Backend saat ini (`routes/correction.js:575-643`, fungsi `callGeminiWithFallback`):
- Loop sequential melalui 3 Gemini keys
- Kalau key 1 limit (429), tunggu network timeout sebelum coba key 2
- Tidak ada queue global, tidak ada cache, tidak ada parallel key rotation

### 1.2 Capacity Constraints

| Metric | Nilai |
|--------|-------|
| Gemini Flash Lite free tier | 15 RPM/key |
| Total keys | 3 |
| **Effective RPM** | **45 RPM** |
| Try out 15 soal (1 user) | 30 calls / 15 menit = 2 RPM sustained |
| **Max concurrent users** | **~3-4 users** (sebelum 429 errors) |

**Kesimpulan:** Saat ini Mafiking hanya bisa handle **3-4 user simultan** sebelum terjadi rate limit. Tidak scalable.

### 1.3 Tujuan

1. **Menggandakan capacity** dari 45 RPM ke **75 RPM** (gratis)
2. **Mengurangi latency** single user dari 15-23 detik ke **8-12 detik** (50% lebih cepat)
3. **Eliminasi 429 errors** saat traffic spike
4. **Zero cost** — semua provider tier gratis
5. **Single-request canvas** — hapus OCR confirmation step, dari 2 API calls jadi 1

---

## 2. Arsitektur Solusi

### 2.1 Multi-Provider Pool

```
┌──────────────────────────────────────────┐
│          Weighted Random Pool             │
│                                          │
│  Gemini 2.5 Flash Lite (3 keys) → 60%    │ ← 45 RPM
│  Groq Llama 3.2 Vision          → 40%    │ ← 30 RPM
│                                          │
│  + Cache deduplication (per-user)        │
│  + Queue concurrency limit (max 3)       │
│  + Least-recently-used key tracking      │
└──────────────────────────────────────────┘
         ↓
   User submit canvas
         ↓
   1 request ke pool
         ↓
   Response ~8-12 detik
```

### 2.2 Single-Request Canvas Flow (Baru)

**Sebelum (2 request):**
```
transcribe → confirm → evaluate
```

**Sesudah (1 request):**
```
evaluate-merged (image + soal + expected answer)
  → Backend: Gemini/Groq baca gambar + return { transcription, evaluation }
  → Frontend: langsung tampilkan result modal
```

User tidak perlu konfirmasi OCR. Total **1 API call per submit**.

### 2.3 API Provider yang Dipakai

| Provider | Model | Free Tier RPM | Signup URL |
|----------|-------|---------------|------------|
| Google AI Studio | `gemini-2.5-flash-lite` | 15/key × 3 = 45 | https://aistudio.google.com/apikey |
| Groq | `meta-llama/llama-4-scout-17b-16e-instruct` | lihat dashboard rate limit Groq | https://console.groq.com |

**Total gratis: 75 RPM, $0/bulan**

---

## 3. Detail Implementasi

### 3.1 Environment Variables

Tambah ke `.env.local` (jangan commit):

```bash
# Existing (jangan diubah)
GEMINI_KEY_1=AIza...
GEMINI_KEY_2=AIza...
GEMINI_KEY_3=AIza...

# NEW
GROQ_API_KEY=gsk_...

# NEW: pool config
MAFIKING_POOL_ENABLED=true
MAFIKING_POOL_GEMINI_WEIGHT=0.6
MAFIKING_POOL_GROQ_WEIGHT=0.4
MAFIKING_POOL_MAX_CONCURRENT=3
MAFIKING_POOL_CACHE_TTL_MS=3600000
```

Update `.env.example` (untuk dokumentasi, no secrets):

```bash
# ─── Multi-Provider Pool ──────────────────────────────────────
MAFIKING_POOL_ENABLED=true
MAFIKING_POOL_GEMINI_WEIGHT=0.6
MAFIKING_POOL_GROQ_WEIGHT=0.4
MAFIKING_POOL_MAX_CONCURRENT=3
MAFIKING_POOL_CACHE_TTL_MS=3600000

# Groq (free tier: https://console.groq.com)
GROQ_API_KEY=
```

### 3.2 File Baru: `lib/multi-provider-pool.js`

**Tujuan:** Router yang memilih provider terbaik dan mengeksekusi request.

**API yang akan diekspor:**

```js
const { callWithPool, getPoolStats } = require('./multi-provider-pool');

// Main entry point
await callWithPool({
  prompt,        // system + user prompt
  parts,         // multimodal parts (image, text)
  schema,        // JSON schema untuk response
  maxOutputTokens,
  temperature = 0.1,
  db,            // untuk token usage logging
  provider = 'auto'  // 'auto' | 'gemini' | 'groq'
});
```

**Struktur internal:**

```js
class MultiProviderPool {
  constructor() {
    this.providers = [
      {
        name: 'gemini',
        client: new GeminiClient(),
        weight: parseFloat(process.env.MAFIKING_POOL_GEMINI_WEIGHT) || 0.6,
        keyRpm: 15,
        keys: getGeminiKeys(),
      },
      {
        name: 'groq',
        client: new GroqClient(),
        weight: parseFloat(process.env.MAFIKING_POOL_GROQ_WEIGHT) || 0.4,
        keyRpm: 30,
        keys: [process.env.GROQ_API_KEY].filter(Boolean),
      },
    ];
    this.queue = new RequestQueue({
      maxConcurrent: parseInt(process.env.MAFIKING_POOL_MAX_CONCURRENT) || 3,
    });
    this.cache = new ResponseCache({
      ttlMs: parseInt(process.env.MAFIKING_POOL_CACHE_TTL_MS) || 3600000,
    });
    this.keyLastUsedAt = new Map();
    this.stats = { calls: 0, cacheHits: 0, errors: 0, perProvider: {} };
  }

  async callWithPool({ prompt, parts, schema, maxOutputTokens, temperature, db, provider = 'auto' }) {
    // 1. Check cache
    const cacheKey = this.makeCacheKey(parts, prompt, schema);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return { ...cached, cached: true };
    }

    // 2. Pick provider & key (least-recently-used)
    const { provider: p, keyIndex } = this.pickProvider(provider);

    // 3. Enqueue (concurrency limit)
    return this.queue.enqueue(async () => {
      const startedAt = Date.now();
      try {
        const result = await p.client.call({
          key: p.keys[keyIndex],
          model: this.getModelForProvider(p.name),
          parts, prompt, schema, maxOutputTokens, temperature,
        });
        const durationMs = Date.now() - startedAt;
        this.keyLastUsedAt.set(`${p.name}:${keyIndex}`, Date.now());
        this.cache.set(cacheKey, result);
        this.stats.calls++;
        this.stats.perProvider[p.name] = (this.stats.perProvider[p.name] || 0) + 1;

        // Log token usage
        if (db && result.usageMetadata) {
          logTokenUsage(db, {
            provider: p.name,
            model: result.modelUsed,
            keyName: `${p.name.toUpperCase()}_${keyIndex + 1}`,
            tokensUsed: result.usageMetadata.totalTokenCount || 0,
          });
        }

        return { ...result, durationMs, provider: p.name, keyIndex: keyIndex + 1 };
      } catch (error) {
        this.stats.errors++;
        // Fallback ke key berikutnya atau provider lain
        return this.retryWithFallback({ prompt, parts, schema, maxOutputTokens, temperature, db, provider }, error);
      }
    });
  }

  pickProvider(preferred) {
    if (preferred !== 'auto') {
      const p = this.providers.find(x => x.name === preferred);
      if (p && p.keys.length > 0) {
        return { provider: p, keyIndex: this.pickLeastUsedKey(p) };
      }
    }

    // Weighted random
    const available = this.providers.filter(p => p.weight > 0 && p.keys.length > 0);
    if (available.length === 0) {
      throw new Error('Tidak ada provider yang tersedia. Set GEMINI_KEY_1 atau GROQ_API_KEY di .env');
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

  async retryWithFallback(params, lastError) {
    // Try next provider in the list
    const available = this.providers.filter(p => p.weight > 0 && p.keys.length > 0);
    const triedProviders = new Set([lastError.provider || '']);

    for (const p of available) {
      if (triedProviders.has(p.name)) continue;
      triedProviders.add(p.name);
      try {
        const keyIndex = this.pickLeastUsedKey(p);
        const startedAt = Date.now();
        const result = await p.client.call({
          key: p.keys[keyIndex],
          model: this.getModelForProvider(p.name),
          parts: params.parts,
          prompt: params.prompt,
          schema: params.schema,
          maxOutputTokens: params.maxOutputTokens,
          temperature: params.temperature,
        });
        const durationMs = Date.now() - startedAt;
        this.keyLastUsedAt.set(`${p.name}:${keyIndex}`, Date.now());
        this.stats.perProvider[p.name] = (this.stats.perProvider[p.name] || 0) + 1;
        return { ...result, durationMs, provider: p.name, keyIndex: keyIndex + 1 };
      } catch (err) {
        this.stats.errors++;
        continue;
      }
    }

    // Semua provider gagal
    const error = new Error('Semua provider AI sedang limit atau overload. Coba lagi dalam beberapa detik.');
    error.status = 503;
    error.attempts = [lastError];
    throw error;
  }

  getModelForProvider(providerName) {
    if (providerName === 'gemini') return 'gemini-2.5-flash-lite';
    if (providerName === 'groq') return 'meta-llama/llama-4-scout-17b-16e-instruct';
    return null;
  }

  makeCacheKey(parts, prompt, schema) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    parts.forEach(p => {
      if (p.text) hash.update(p.text);
      if (p.inlineData) hash.update(String(p.inlineData.data).slice(0, 5000));
    });
    hash.update('|');
    hash.update(prompt || '');
    hash.update('|');
    hash.update(JSON.stringify(schema));
    return hash.digest('hex').slice(0, 32);
  }
}

class RequestQueue {
  constructor({ maxConcurrent }) {
    this.maxConcurrent = maxConcurrent;
    this.activeCount = 0;
    this.queue = [];
  }

  async enqueue(fn) {
    if (this.activeCount < this.maxConcurrent) {
      return this.execute(fn);
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, enqueuedAt: Date.now() });
    });
  }

  async execute(fn) {
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      this.drain();
    }
  }

  drain() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      this.execute(job.fn).then(job.resolve, job.reject);
    }
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
}

function getGeminiKeys() {
  return Array.from({ length: 20 }, (_, index) => process.env[`GEMINI_KEY_${index + 1}`])
    .map((key) => key && key.trim())
    .filter(Boolean);
}

const pool = new MultiProviderPool();
module.exports = {
  callWithPool: pool.callWithPool.bind(pool),
  getPoolStats: () => ({ ...pool.stats, cacheSize: pool.cache.size() }),
  MultiProviderPool,
  RequestQueue,
  ResponseCache,
};
```

### 3.3 File Baru: `lib/groq-client.js`

**Tujuan:** HTTP client untuk Groq API (OpenAI-compatible).

```js
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

class GroqClient {
  constructor() {
    this.baseUrl = GROQ_BASE_URL;
    this.model = GROQ_VISION_MODEL;
  }

  async call({ key, model, parts, prompt, schema, maxOutputTokens, temperature, systemInstruction }) {
    const messages = this.buildMessages(parts, systemInstruction || prompt);
    const schemaHint = schema
      ? '\n\nBalas hanya JSON valid sesuai schema ini: ' + JSON.stringify(schema)
      : '\n\nBalas hanya JSON valid.';

    if (messages[0]?.role === 'system') {
      messages[0].content += schemaHint;
    } else {
      messages.unshift({ role: 'system', content: schemaHint.trim() });
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || this.model,
        messages,
        response_format: { type: 'json_object' },
        max_tokens: maxOutputTokens || 2600,
        temperature: temperature || 0.1,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`Groq ${response.status}: ${body.slice(0, 200)}`);
      error.status = response.status;
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};

    return {
      text,
      modelUsed: data.model || this.model,
      usageMetadata: {
        totalTokenCount: usage.total_tokens || 0,
        promptTokenCount: usage.prompt_tokens || 0,
        candidatesTokenCount: usage.completion_tokens || 0,
      },
    };
  }

  buildMessages(parts, systemPrompt) {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    const userContent = parts.map(p => {
      if (p.text) return { type: 'text', text: p.text };
      if (p.inlineData) {
        return {
          type: 'image_url',
          image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` },
        };
      }
      return null;
    }).filter(Boolean);
    messages.push({ role: 'user', content: userContent });
    return messages;
  }
}

module.exports = { GroqClient, GROQ_VISION_MODEL };
```

### 3.4 File Baru: `lib/gemini-client.js`

**Tujuan:** Refactor Gemini call dari inline di `correction.js` ke module terpisah. Pool-agnostic.

```js
const { GoogleGenAI } = require('@google/genai');

const GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite';

class GeminiClient {
  constructor() {
    this.model = GEMINI_FLASH_LITE_MODEL;
  }

  async call({ key, model, parts, prompt, schema, maxOutputTokens, temperature, systemInstruction }) {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: model || this.model,
      contents: [{ role: 'user', parts }],
      config: {
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        responseJsonSchema: schema,
        responseMimeType: 'application/json',
        systemInstruction: systemInstruction || prompt,
        temperature: temperature || 0.1,
      },
    });

    const text = this.extractText(response);
    return {
      text,
      modelUsed: model || this.model,
      usageMetadata: response.usageMetadata || {},
    };
  }

  extractText(response) {
    const direct = typeof response?.text === 'function' ? response.text() : response?.text;
    if (String(direct || '').trim()) return String(direct);
    const parts = Array.isArray(response?.candidates?.[0]?.content?.parts)
      ? response.candidates[0].content.parts
      : [];
    return parts.filter(p => p && !p.thought && p.text).map(p => p.text).join('');
  }
}

module.exports = { GeminiClient, GEMINI_FLASH_LITE_MODEL };
```

### 3.5 File Diubah: `routes/correction.js`

**Perubahan besar:**

1. Hapus `callGeminiWithFallback` (line 575-643), ganti dengan `callWithPool` dari pool
2. Tambah `MERGED_EVALUATION_SCHEMA` untuk single-request flow
3. Tambah `MERGED_SYSTEM_PROMPT` (gabung transcribe + evaluate prompt)
4. Modify route `/evaluate` — terima image tanpa confirmedAnswerLatex, langsung merged
5. Route `/transcribe` — TETAP ADA tapi marked deprecated
6. Route `/profile-summary` — pakai pool, force Gemini (Gemma model)

**Schema baru:**

```js
const MERGED_EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    transcription: {
      type: 'object',
      properties: {
        detectedAnswerLatex: { type: 'string' },
        readingConfidence: { type: 'number', minimum: 0, maximum: 1 },
        unclearParts: { type: 'array', items: { type: 'string' } },
      },
      required: ['detectedAnswerLatex', 'readingConfidence', 'unclearParts'],
    },
    evaluation: {
      type: 'object',
      properties: {
        isCorrect: { type: 'boolean' },
        score: { type: 'integer' },
        detectedAnswerText: { type: 'string' },
        detectedAnswerLatex: { type: 'string' },
        needsResubmission: { type: 'boolean' },
        wrongSteps: { type: 'array', maxItems: 5, items: { /* existing */ } },
        redlineTargets: { type: 'array', maxItems: 5, items: { /* existing */ } },
        fullFeedback: { type: 'string' },
        fullFeedbackLatex: { type: 'string' },
        fullFeedbackPlain: { type: 'string' },
        strengthTags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        weaknessTags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      },
      required: ['isCorrect', 'score', 'detectedAnswerText', 'detectedAnswerLatex', 'wrongSteps', 'redlineTargets', 'fullFeedback', 'strengthTags', 'weaknessTags'],
    },
  },
  required: ['transcription', 'evaluation'],
};
```

**System prompt baru (gabung transcribe + evaluate):**

```js
const MERGED_SYSTEM_PROMPT = [
  'Kamu adalah guru matematika yang teliti. Tugasmu dalam 1 langkah:',
  '1. BACA gambar canvas tulisan tangan siswa dan transkripsikan ke LaTeX ringkas.',
  '2. EVALUASI jawaban tersebut terhadap soal dan jawaban acuan yang diberikan.',
  '3. KEMBALIKAN JSON valid sesuai schema dengan field transcription dan evaluation.',
  '',
  'ATURAN OCR:',
  '- Baca gambar dari atas ke bawah.',
  '- Jangan memperbaiki jawaban, jangan mengoreksi, jangan memberi skor di tahap transkripsi.',
  '- Semua teks dalam LaTeX, teks biasa wajib \\text{...}.',
  '',
  'ATURAN EVALUASI:',
  '- Gunakan detectedAnswerLatex sebagai teks utama.',
  '- Jika ada kesalahan, isi wrongSteps (max 5) dan redlineTargets (max 5).',
  '- redlineTargets: tandai seluruh ekspresi/baris salah, bukan hanya token.',
  '- Untuk 1+1=3 yang salah, targetTextLatex dan boxPercent harus mencakup seluruh "1+1=3".',
  '- strengthTags dan weaknessTags masing-masing max 5.',
  '- Field berakhiran Latex: LaTeX valid pendek.',
  '- Field berakhiran Plain: Bahasa Indonesia biasa, tanpa Markdown, tanpa \\text, tanpa \\frac.',
  '- Jangan gabungkan narasi panjang ke LaTeX; taruh di fullFeedbackPlain/issuePlain/hintPlain.',
  '- Jangan Markdown, HTML, atau code fence.',
].join(' ');
```

**Route `/evaluate` yang dimodifikasi (single request):**

```js
const { callWithPool } = require('../lib/multi-provider-pool');

router.post('/evaluate', isAuthenticated, requireRegisteredUser, async (req, res) => {
  try {
    const { expectedAnswer, imageBase64, mimeType, problemId, questionId, questionText } = req.body;
    const { cleanBase64, normalizedMimeType } = validateImagePayload(imageBase64, mimeType);
    if (!cleanBase64) return res.status(400).json({ error: 'imageBase64 wajib dikirim.' });
    if (!questionText) return res.status(400).json({ error: 'questionText wajib dikirim.' });

    const safeQuestionId = parsePositiveId(questionId);
    const safeProblemId = parsePositiveId(problemId);
    if ((questionId !== undefined && safeQuestionId === null) || (problemId !== undefined && safeProblemId === null)) {
      return res.status(400).json({ error: 'ID soal tidak valid.' });
    }

    const sanitizedQuestion = sanitizeForPrompt(questionText);
    const sanitizedExpected = sanitizeForPrompt(expectedAnswer);

    const parts = [
      {
        text: [
          'Evaluasi jawaban siswa sesuai SOP Mafiking Canvas.',
          safeQuestionId ? `ID soal: ${safeQuestionId}` : '',
          `Soal: ${sanitizedQuestion.text}`,
          sanitizedExpected.text ? `Jawaban acuan: ${sanitizedExpected.text}` : '',
          'Gambar canvas dilampirkan. Baca dulu, lalu evaluasi.',
        ].filter(Boolean).join('\n\n'),
      },
      { inlineData: { data: cleanBase64, mimeType: normalizedMimeType } },
    ];

    const result = await callWithPool({
      systemInstruction: MERGED_SYSTEM_PROMPT,
      parts,
      schema: MERGED_EVALUATION_SCHEMA,
      maxOutputTokens: 3200,
      temperature: 0.1,
      db: req.app.locals.db,
    });

    const parsed = safeJsonParse(result.text, () => ({
      transcription: { detectedAnswerLatex: '', readingConfidence: 0, unclearParts: [] },
      evaluation: { isCorrect: false, score: 0, fullFeedback: 'AI response invalid.' },
    }));

    const transcription = parsed.transcription || {};
    const evaluation = normalizeEvaluation(parsed.evaluation || {}, result.text);

    const db = req.app.locals.db;
    const normalizedProblemId = safeProblemId || safeQuestionId;
    db.prepare(`
      INSERT INTO correction_attempts (
        user_id, problem_id, mode, question_text, expected_answer, detected_answer_text,
        score, is_correct, feedback, strength_tags, weakness_tags, evaluation_json
      )
      VALUES (?, ?, 'canvas', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.session.userId,
      normalizedProblemId,
      String(questionText || ''),
      String(expectedAnswer || ''),
      evaluation.detectedAnswerLatex || evaluation.detectedAnswerText,
      evaluation.score,
      evaluation.isCorrect ? 1 : 0,
      evaluation.fullFeedback,
      JSON.stringify(evaluation.strengthTags),
      JSON.stringify(evaluation.weaknessTags),
      JSON.stringify(evaluation),
    );

    res.json({
      transcription,
      evaluation,
      feedback: evaluation.fullFeedback,
      durationMs: result.durationMs,
      keyIndex: result.keyIndex,
      modelUsed: result.modelUsed,
      provider: result.provider || 'auto',
      merged: true,
    });
  } catch (error) {
    res.status(error.status ?? 500).json({
      error: error.message || 'Gagal mengevaluasi jawaban.',
      attempts: error.attempts,
    });
  }
});
```

**Route `/transcribe` — tetap ada tapi deprecated:**

```js
router.post('/transcribe', isAuthenticated, requireRegisteredUser, async (req, res) => {
  res.set('X-Deprecated', 'Use /evaluate with imageBase64 instead (merged flow)');
  // ... existing logic tetap, hanya pakai pool ...
  try {
    const result = await callWithPool({...});
    // existing response
  }
});
```

**Route `/profile-summary` — pakai pool tapi force Gemini:**

```js
const result = await callWithPool({
  systemInstruction: PROFILE_SYSTEM_PROMPT,
  parts: [{ text: `Buat raport belajar dari data berikut:\n\n${JSON.stringify(attempts)}` }],
  schema: PROFILE_SCHEMA,
  maxOutputTokens: 1200,
  temperature: 0.2,
  db,
  provider: 'gemini',  // Force Gemini (Gemma model hanya di Gemini)
});
```

### 3.6 File Diubah: `src/practice.jsx`

**Perubahan besar:**

1. Hapus OCR confirmation step (langsung evaluate setelah submit)
2. Hapus `ocrReview` state, `ocrPrefetchActive`, `confirmingOcrRef`
3. Hapus `OCR_TRUST_STREAK` logic
4. Simplify `submitCanvas()` — 1 request instead of 2
5. Update `saveCanvasEvaluationResult()` untuk accept merged result

**Yang akan dihapus:**

```js
// HAPUS constants
- const OCR TRUST_STREAK KEY = "mafiking:canvas-ocr-trust-streak";
- const OCR_TRUST_THRESHOLD = 4;
- const OCR_AUTO_ACCEPT_MS = 12000;

// HAPUS refs
- const ocrPrefetchRef = useRef({...});
- const confirmingOcrRef = useRef(false);

// HAPUS state
- const [ocrReview, setOcrReview] = useState(null);
- const [ocrTrustStreak, setOcrTrustStreak] = useState(readOcrTrustStreak);
- const [ocrPrefetchActive, setOcrPrefetchActive] = useState(false);

// HAPUS helper functions
- function readOcrTrustStreak() { ... }
- function writeOcrTrustStreak() { ... }
- function setStoredOcrTrustStreak() { ... }
- function resetOcrTrustStreak() { ... }
- function startTrustedCanvasPrefetch() { ... }
- function confirmCanvasTranscription() { ... }
- function cancelCanvasTranscription() { ... }
- function resetOcrPrefetch() { ... }

// HAPUS useEffect untuk OCR
- useEffect(() => {
-   if (!ocrReview?.trustedFastPath || !ocrReview?.detectedAnswerLatex || submitting || canvasProcess) return;
-   const timer = window.setTimeout(() => {
-     confirmCanvasTranscription({ autoAccepted: true });
-   }, OCR_AUTO_ACCEPT_MS);
-   return () => window.clearTimeout(timer);
- }, [ocrReview?.ocrToken, ocrReview?.trustedFastPath, submitting, canvasProcess]);
```

**`submitCanvas()` baru:**

```js
async function submitCanvas() {
  if (!problem) return;
  if (timeExpired) { setError("Waktu try out sudah habis."); return; }
  if (context?.isPreview) { setError("Canvas correction tidak tersedia di mode preview."); return; }
  if (requiresLoginForAnswer()) { requestAnswerLogin(); return; }

  try {
    setError("");
    setShowResultModal(false);
    const imageBase64 = boardRef.current?.exportImage({
      maxDimension: 700,
      mimeType: "image/webp",
      quality: 0.7,
    });
    if (!imageBase64 || !boardDirty) {
      setError("Tulis jawaban di canvas terlebih dulu.");
      return;
    }
    const imageMimeType = getDataUrlMimeType(imageBase64) || "image/png";
    const strokeSnapshot = boardRef.current?.exportSnapshot?.();

    setSubmitting(true);
    setCanvasProcess("evaluating");

    // SINGLE REQUEST - merged flow
    const result = await MafikingAPI.post("/api/correction/evaluate", {
      imageBase64,
      mimeType: imageMimeType,
      problemId: problem.id,
      questionId: problem.id,
      questionText: problem.question_display || problem.question_text,
      expectedAnswer: problem.answer_display,
      topicTags: [session?.subtopic?.title].filter(Boolean),
    });

    // Save result langsung
    saveCanvasEvaluationResult({ imageBase64, strokeSnapshot }, result);
  } catch (caught) {
    handleCorrectionError(caught);
  } finally {
    setCanvasProcess(null);
    setSubmitting(false);
  }
}
```

**`saveCanvasEvaluationResult()` baru:**

```js
function saveCanvasEvaluationResult(meta, result) {
  const attempt = {
    completedAt: new Date().toISOString(),
    evaluation: result.evaluation,
    feedback: result.feedback,
    transcription: result.transcription,
    imageBase64: meta.imageBase64,
    mode: "canvas",
    strokeSnapshot: meta.strokeSnapshot,
  };
  setAttemptsByProblem((prev) => ({ ...prev, [problem.id]: attempt }));
  setBoardDirty(false);
  setShowResultModal(true);
  const isCorrect = Boolean(result.evaluation?.isCorrect);
  if (isCorrect) showToast("Jawaban benar! Progress tersimpan.", "success");
  MafikingAPI.post("/api/progress/submit", {
    correct: isCorrect,
    hintsUsed: 0,
    mode: "canvas",
    problemId: problem.id,
  })
    .then(() => window.dispatchEvent(new CustomEvent("mafiking:progress-updated")))
    .catch(() => null);
}
```

**CanvasView UI — hapus OCR modal:**

Cari component yang menampilkan OCR review (mungkin `OCRReviewModal`, `CanvasTranscriptionModal`, atau inline di CanvasView). Hapus atau refactor.

### 3.7 File Diubah: `.env.example`

Tambah section:

```bash
# ─── Multi-Provider Pool ──────────────────────────────────────
MAFIKING_POOL_ENABLED=true
MAFIKING_POOL_GEMINI_WEIGHT=0.6
MAFIKING_POOL_GROQ_WEIGHT=0.4
MAFIKING_POOL_MAX_CONCURRENT=3
MAFIKING_POOL_CACHE_TTL_MS=3600000

# Groq (free tier: https://console.groq.com)
GROQ_API_KEY=
```

### 3.8 File Diubah Minor: `.env.local` (tidak di-commit)

Tambah `GROQ_API_KEY=gsk_...` ke local env.

---

## 4. Urutan Implementasi

| Step | Task | File | Effort | Risk |
|------|------|------|--------|------|
| 1 | Signup Groq + generate API key | External | 5 min | None |
| 2 | Tambah env vars ke `.env.local` | .env.local | 2 min | Low |
| 3 | Update `.env.example` dokumentasi | .env.example | 5 min | None |
| 4 | Buat `lib/groq-client.js` | New file | 1 hour | Low |
| 5 | Buat `lib/gemini-client.js` | New file | 30 min | Low |
| 6 | Buat `lib/multi-provider-pool.js` | New file | 2-3 hours | Medium |
| 7 | Test pool di isolation | Test script | 1 hour | Low |
| 8 | Modify `routes/correction.js` | Modified | 2-3 hours | High |
| 9 | Modify `src/practice.jsx` | Modified | 2-3 hours | Medium |
| 10 | Manual testing end-to-end | Test | 1 hour | — |
| 11 | Load test concurrent users | Test | 1 hour | — |

**Total effort: 12-16 jam coding + testing**

---

## 5. Test Plan

### 5.1 Unit Tests (opsional)

- `test-multi-provider-pool.js`:
  - Pool pilih provider sesuai weight
  - Least-recently-used key rotation benar
  - Cache hit mengembalikan cached result
  - Cache miss + concurrent calls queue dengan benar
  - Fallback ke provider lain kalau satu gagal
  - Stats tracking akurat

- `test-groq-client.js`:
  - Parts Gemini-style dikonversi ke OpenAI-style
  - Image base64 diteruskan dengan MIME type benar
  - Error 401/429/500 di-handle dengan benar

### 5.2 Manual End-to-End Tests

- [ ] User submit canvas → result tampil < 15 detik
- [ ] User submit soal yang sama 2x → cache hit di #2 (instan)
- [ ] Groq key invalid → fallback ke Gemini otomatis
- [ ] Gemini keys 1-3 semua limit → fallback ke Groq, tetap jalan
- [ ] 5 users submit canvas simultan → semua dapat response < 30 detik
- [ ] 10 users submit canvas simultan → max 3 concurrent, sisanya queue

### 5.3 Load Test Script (opsional)

```js
// scripts/test-pool-load.js
// Simulate 10 concurrent users submit canvas
// Assert: semua dapat response, no 429 errors, total time < 60 detik
```

---

## 6. Expected Outcomes

### 6.1 Performance

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Single user canvas | 15-23s | 8-12s | 50% lebih cepat |
| 5 concurrent users | 30-60s/user | 15-20s/user | 60% lebih cepat |
| 10 concurrent users | timeout/errors | 25-35s/user | Functional |
| Max throughput | 45 RPM | 75 RPM | 67% lebih banyak |
| Cache hit rate (expected) | 0% | 30-40% | — |

### 6.2 Cost

- Gemini 2.5 Flash Lite free tier: $0
- Groq free tier: $0
- **Total: $0/bulan**

### 6.3 Reliability

- Single provider down: traffic dialihkan ke provider lain
- Auto-failover: 1-2 detik latency tambahan saat failover
- Uptime target: 99.5%+ (vs 95% dengan single provider)

---

## 7. Rollback Plan

### 7.1 Jika Pool Bermasalah

Set `MAFIKING_POOL_ENABLED=false` di `.env.local` → fallback otomatis ke existing `callGeminiWithFallback` (kode lama perlu di-keep sebagai fallback atau restore via git).

### 7.2 Jika Groq Bermasalah

Set `MAFIKING_POOL_GROQ_WEIGHT=0` → Groq tidak dipilih, traffic full ke Gemini.

### 7.3 Jika Merged Flow Bermasalah

Frontend tetap support flag `merged: false` → backend fallback ke existing 2-request flow.

### 7.4 Refactor Safety

- Pool API drop-in replacement untuk `callGeminiWithFallback` (return shape sama)
- `gemini-client.js` extract dari inline logic, behavior identik
- Frontend `submitCanvas()` refactor tapi flow logic sama

---

## 8. Monitoring & Observability

### 8.1 Stats Endpoint (opsional)

Tambah `GET /api/pool/stats` (admin-only):

```js
router.get('/pool/stats', isAuthenticated, isAdmin, (req, res) => {
  res.json(getPoolStats());
});
```

Response:
```json
{
  "calls": 1234,
  "cacheHits": 412,
  "errors": 5,
  "perProvider": { "gemini": 740, "groq": 494 },
  "cacheSize": 250,
  "cacheHitRate": 0.33
}
```

### 8.2 Logging

Setiap AI call di-log:
- Provider name
- Key index
- Duration (ms)
- Token count
- Cache hit/miss

Sudah ada via `logTokenUsage()` di `lib/log-token-usage.js`.

### 8.3 Admin UI (opsional, phase 2)

Tambah tab di admin panel yang menampilkan pool stats real-time.

---

## 9. Risiko & Mitigasi

| Risiko | Severity | Mitigasi |
|--------|----------|----------|
| Groq quality lebih rendah dari Gemini untuk math OCR | Medium | Weight 60% Gemini (primary), Groq fallback. Monitor quality via user feedback |
| Groq rate limit di tengah traffic | Medium | Auto-failover ke Gemini. Set Groq weight lebih rendah |
| Cache stale data (user submit soal sama 2x dapat result lama) | Low | TTL 1 jam, key = user_id + image hash |
| Pool bug menyebabkan requests hang | Medium | Queue timeout 60s, fallback ke provider lain |
| Frontend OCR removal menurunkan akurasi | Medium | Tambah retry hint di error toast. User bisa switch ke Pilgan |
| Gemma model hanya di Gemini | Medium | Profile summary force ke Gemini (sudah ada di plan) |

---

## 10. Future Enhancements (Phase 2, TIDAK dalam scope ini)

1. Adaptive weighting (auto-adjust berdasarkan real-time latency)
2. Per-user pool preference (fast mode vs quality mode)
3. Streaming response (Gemini support SSE)
4. Local OCR fallback (Tesseract.js)
5. Pre-warmed cache (background pre-compute)
6. OpenRouter integration sebagai tertiary

---

## 11. File Checklist

### 11.1 File Baru (3)

- [x] `lib/multi-provider-pool.js`
- [x] `lib/groq-client.js`
- [x] `lib/gemini-client.js`

### 11.2 File Diubah (3)

- [x] `routes/correction.js` — pakai pool, tambah merged flow
- [x] `src/practice.jsx` — hapus OCR step, single request
- [x] `.env.example` — dokumentasi env vars

### 11.3 File Diubah Minor (1)

- [ ] `.env.local` (local only, tidak di-commit) — tambah `GROQ_API_KEY`

### 11.4 Test File Baru (opsional, 2-3)

- [ ] `scripts/test-multi-provider-pool.js`
- [ ] `scripts/test-groq-client.js`
- [ ] `scripts/test-pool-load.js`

### 11.5 Docs (opsional, 1)

- [ ] `docs/security/secrets.md` — update dengan pool config

### 11.6 Evidence Update

- [x] Groq official vision docs checked on 2026-06-03: current supported JSON-capable vision model is `meta-llama/llama-4-scout-17b-16e-instruct`.
- [x] Groq deprecation docs checked on 2026-06-03: `llama-3.2-90b-vision-preview` shut down on 2025-04-14 and should not be used.

---

## 12. Timeline Estimasi

| Hari | Task | Output |
|------|------|--------|
| Hari 1 (4-5 jam) | Setup + backend pool (steps 1-8) | Pool berfungsi, route /evaluate pakai pool |
| Hari 2 (4-5 jam) | Frontend refactor + merged flow (step 9) | User submit canvas 1 request |
| Hari 3 (3-4 jam) | Testing + load test (steps 10-11) | Production-ready |

**Total: 3 hari kerja @ 4-5 jam/hari = 12-15 jam**

---

## 13. Definition of Done

- [ ] Groq API key aktif di `.env.local`
- [x] Pool route AI calls ke Gemini atau Groq dengan weighted random
- [x] Frontend submit canvas 1 request (no OCR step)
- [x] Backend merged schema return `{ transcription, evaluation }` dalam 1 call
- [x] Cache deduplication aktif secara kode
- [x] Queue concurrency limit max 3 secara kode
- [x] Auto-failover antar provider/key terimplementasi
- [x] Token usage ter-track per provider
- [ ] Load test: 5 users simultan, semua dapat response < 30s
- [ ] No 429 errors dalam load test
- [x] `npm run check` pass
- [x] `npm run build` pass
- [ ] Manual smoke test: Coba Gratis → submit canvas → result tampil

---

**END OF PLAN**
