# Plan: Latency Reduction V2 — Target < 10s Off-Peak, < 15s Peak

**Tanggal:** 2026-06-04
**Lokasi:** `/home/abiyulinx/computing/king/new_mafiking`
**Basis:** Iterasi dari `PLAN_API_OPTIMIZATION.md` (sudah implemented). Plan ini tambahkan 5 optimasi baru untuk capai target latency user, tanpa kompromi akurasi matematika.

---

## 1. Latar Belakang & Tujuan

### 1.1 Kondisi Sekarang (Pasca-Plan V1)

User flow submit canvas saat ini:

```
User submit canvas
  ↓
Frontend exportImage({ maxDimension: 700, mimeType: "image/webp", quality: 0.7 })
  ↓
POST /api/correction/evaluate  [ada correctionLimiter 12/min/IP!]
  ↓
callWithPool() → multi-provider pool (Gemini 60% + Groq 40%)
  ↓
Single merged call: OCR + evaluasi
  ↓
SQLite insert + return
  ↓
Frontend tampilkan modal hasil
```

**Metrics aktual:**
| Kondisi | Latency | Status |
|---------|---------|--------|
| Off-peak, 1 user | 8-12s | OK (target < 10s) |
| Off-peak, 2-3 user konkuren | 8-15s | OK |
| Peak, 4+ user konkuren | 20-40s | ❌ target < 15s |
| Peak + IP shared (sekolah/kantor) | 30s+ atau 429 | ❌ |

### 1.2 Bottleneck Root-Cause Analysis

| # | Bottleneck | Impact | Risiko Akurasi |
|---|-----------|--------|----------------|
| 1 | Image 700px webp @ 0.7 | +1-2s per call | NONE (math masih jelas) |
| 2 | `correctionLimiter` 12/min per-IP | Hidden throttling untuk user shared IP | NONE |
| 3 | Pool concurrency = 3 | Queue wait 4+ user = 10-20s delay | NONE |
| 4 | Output 3200 tokens selalu di-generate | +1-3s untuk jawaban benar (over-generate) | NONE |
| 5 | No streaming | Perceived latency = actual latency | NONE |
| 6 | Capacity 75 RPM Gemini+Groq | Queue buildup saat peak | NONE |
| 7 | No fast-path untuk jawaban benar | Over-generate detailed feedback | NONE |

**Kabar baik:** Semua bottleneck di atas BUKAN masalah akurasi. Semuanya soal waktu dan throughput. Akurasi matematika bisa tetap dijaga 100%.

### 1.3 Tujuan Plan V2

1. **Off-peak latency:** 8-12s → **< 10s** (capai)
2. **Peak latency:** 20-40s → **< 15s** (capai)
3. **Akurasi matematika:** tetap tinggi (tidak dikompromikan)
4. **Zero cost tambahan** (semua provider tier gratis)
5. **Visible improvement di admin dashboard** (latency tracking)

---

## 2. Arsitektur Solusi

Enam optimasi yang akan dijalankan secara paralel:

```
┌────────────────────────────────────────────────────────────┐
│  Optimasi 1: Image downsize 700→550px + JPEG 0.55         │
│  → -1-2s per AI call                                       │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│  Optimasi 2: correctionLimiter per-user (bukan per-IP)    │
│  → Hilang throttling untuk shared IP                       │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│  Optimasi 3: Pool concurrency 3→5 + tambah OpenRouter      │
│  → -5-10s queue wait di peak + +20-30 RPM capacity        │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│  Optimasi 4: Fast-path equivalence check (DB-driven)       │
│  → -1-2s untuk jawaban benar                               │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│  Optimasi 5: SSE streaming + adaptive maxOutputTokens      │
│  → -30-50% perceived latency + -2-4s untuk jawaban benar  │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│  Optimasi 6: Latency metric tracking di admin dashboard    │
│  → Visible improvement untuk verifikasi                    │
└────────────────────────────────────────────────────────────┘
```

**Kombinasi hasil yang diharapkan:**

| Skenario | V1 saat ini | V2 target | Improvement |
|----------|-------------|-----------|-------------|
| Off-peak, 1 user | 8-12s | 5-8s | ~40% |
| Peak, 3-4 user | 15-20s | 8-12s | ~45% |
| Peak, 5-7 user | 20-40s | 10-15s | ~60% |
| Peak, 8-10 user | timeout | 12-18s | functional |

---

## 3. Detail Implementasi

### 3.1 Optimasi 1: Image Downsize 700→550 + JPEG 0.55

**File:** `src/practice.jsx` line 280-284

**Before:**
```js
const imageBase64 = boardRef.current && boardRef.current.exportImage({
  maxDimension: 700,
  mimeType: "image/webp",
  quality: 0.7,
});
const imageMimeType = getDataUrlMimeType(imageBase64) || "image/png";
```

**After:**
```js
const imageBase64 = boardRef.current && boardRef.current.exportImage({
  maxDimension: 550,
  mimeType: "image/jpeg",
  quality: 0.55,
});
const imageMimeType = getDataUrlMimeType(imageBase64) || "image/jpeg";
```

**Update `buildCanvasEvaluationPayload`** untuk handle JPEG:
```js
function buildCanvasEvaluationPayload(meta) {
  return {
    expectedAnswer: problem.answer_display,
    imageBase64: meta.imageBase64,
    mimeType: meta.imageMimeType || getDataUrlMimeType(meta.imageBase64) || "image/jpeg",
    problemId: problem.id,
    questionId: problem.id,
    questionText: problem.question_display || problem.question_text,
    topicTags: [session?.subtopic?.title].filter(Boolean),
  };
}
```

**Verifikasi akurasi:**
- Math equation: tetap jelas di 550px (struktur visual equation lebih penting dari detail pixel)
- Handwriting rapat: risk 5-10% loss, tapi untuk matematika (lebih banyak struktur rumus) biasanya aman
- JPEG 0.55: kompresi masih readable, blob artifact minimal di 550px

**Effort:** 5 menit | **Risk:** LOW | **Rollback:** Revert ke 700/webp/0.7

---

### 3.2 Optimasi 2: correctionLimiter per-user

**File:** `server.js` line 382-388

**Problem:** `correctionLimiter` saat ini scope per-IP (`keyGenerator: req.ip`). Sekolah/kantor yang share IP akan kena throttling.

**Solusi:** Ganti keyGenerator jadi `req.session.userId || req.userId || req.ip`.

**After:**
```js
const correctionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  keyGenerator: (req) => `correction:${req.session?.userId || req.userId || req.ip}`,
  message: { error: 'Terlalu banyak request koreksi. Coba lagi sebentar.' },
  standardHeaders: true,
  legacyHeaders: false
});
```

**Verifikasi:**
- 1 user rapid submit 12x dalam 1 menit → throttle (existing behavior)
- 5 user dari IP yang sama → masing-masing punya quota 12/min
- Guest user (no session) → fallback ke IP

**Effort:** 10 menit | **Risk:** LOW

---

### 3.3 Optimasi 3: Tambah OpenRouter + Naikkan Concurrency

#### 3.3.1 OpenRouter Free Models

**URL:** https://openrouter.ai

**Free vision models (per Juni 2026):**
- `meta-llama/llama-3.2-11b-vision-instruct:free`
- `qwen/qwen-2-vl-7b-instruct:free`
- `google/gemini-2.0-flash-exp:free` ← Recommended (Gemini lewat OpenRouter, free)

**Free tier limits:** ~20 requests/day per model, ~200/day total.

#### 3.3.2 Buat `server/ai/openrouter-client.js`

Pattern sama dengan `groq-client.js` (OpenAI-compatible). Length ~110 baris. Skeleton:

```js
// server/ai/openrouter-client.js
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';
const OPENROUTER_TIMEOUT_MS = 60000;

class OpenRouterClient {
  async call({ key, model, parts, prompt, schema, maxOutputTokens, temperature, systemInstruction }) {
    // ... sama persis dengan GroqClient.call, hanya beda baseUrl + header HTTP-Referer ...
  }
  buildMessages(parts, systemPrompt) { /* sama dengan GroqClient */ }
}

module.exports = { OpenRouterClient, OPENROUTER_DEFAULT_MODEL, OPENROUTER_BASE_URL };
```

#### 3.3.3 Update `server/ai/multi-provider-pool.js`

Tambah provider ke-3:

```js
const { OpenRouterClient, OPENROUTER_DEFAULT_MODEL } = require('./openrouter-client');

function getOpenRouterKey() {
  const key = process.env.OPENROUTER_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

// Di constructor:
this.providers = [
  { name: 'gemini', client: new GeminiClient(), defaultModel: GEMINI_FLASH_LITE_MODEL,
    weight: getNumberEnv('MAFIKING_POOL_GEMINI_WEIGHT', 0.5),    // 60→50
    keyRpm: 15, keys: getGeminiKeys() },
  { name: 'groq', client: new GroqClient(), defaultModel: GROQ_VISION_MODEL,
    weight: getNumberEnv('MAFIKING_POOL_GROQ_WEIGHT', 0.3),       // 40→30
    keyRpm: 30, keys: getGroqKey() ? [getGroqKey()] : [] },
  { name: 'openrouter', client: new OpenRouterClient(), defaultModel: OPENROUTER_DEFAULT_MODEL,
    weight: getNumberEnv('MAFIKING_POOL_OPENROUTER_WEIGHT', 0.2), // NEW
    keyRpm: 20, keys: getOpenRouterKey() ? [getOpenRouterKey()] : [] },
].filter((p) => p.keys.length > 0);
```

#### 3.3.4 Update env config

`.env`:
```bash
OPENROUTER_API_KEY=sk-or-v1-...
MAFIKING_POOL_OPENROUTER_WEIGHT=0.2
MAFIKING_POOL_MAX_CONCURRENT=5
```

**Penjelasan capacity baru:**
| Provider | Keys | RPM each | Total RPM | Weight |
|----------|------|----------|-----------|--------|
| Gemini | 3 | 15 | 45 | 50% |
| Groq | 1 | 30 | 30 | 30% |
| OpenRouter | 1 | ~20 | ~20 | 20% |
| **TOTAL** | | | **~95** | |

**Effort:** 2-3 jam | **Risk:** MEDIUM (provider baru, perlu validasi format)

---

### 3.4 Optimasi 4: Fast-Path Equivalence Check (DB-Driven)

**Konsep:** Setelah AI OCR return `detectedAnswerLatex`, bandingkan dengan `problem.answer_display` dari database. Jika equivalent, return `isCorrect: true, score: 100` dengan simplified feedback. Skip generate detailed redline/wrongSteps.

#### 3.4.1 Buat `server/learning/answer-equivalence.js`

```js
function normalizeForEquivalence(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\leq|\\le/g, '<=')
    .replace(/\\geq|\\ge/g, '>=')
    .replace(/\\infty/g, 'inf')
    .replace(/\\pi/g, 'pi')
    .replace(/\\int/g, 'int')
    .replace(/\\[a-zA-Z]+/g, '')  // hapus semua LaTeX commands
    .replace(/[^0-9a-z+\-*/=().,]/g, '')
    .replace(/([0-9)])\(/g, '$1*(')  // implicit multiplication
    .replace(/\)\(/g, ')*(');
}

function isAnswerEquivalent(detected, expected) {
  const a = normalizeForEquivalence(detected);
  const b = normalizeForEquivalence(expected);
  if (!a || !b) return false;
  if (a === b) return true;

  // Numeric equivalence (untuk hasil integral numerik)
  try {
    if (/^[\d+\-*/().,\s]+$/.test(a) && /^[\d+\-*/().,\s]+$/.test(b) && a.length < 100 && b.length < 100) {
      const aNum = Function('"use strict"; return (' + a + ')')();
      const bNum = Function('"use strict"; return (' + b + ')')();
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && Math.abs(aNum - bNum) < 1e-6) return true;
    }
  } catch (_) {}

  return false;
}

module.exports = { normalizeForEquivalence, isAnswerEquivalent };
```

#### 3.4.2 Integrasi di `server/routes/correction.js`

Wrapper `callAiWithPoolFallback` dengan fast-path:

```js
async function callAiWithPoolFallbackWithFastPath({ ...params, expectedAnswer, db, userId, problemId }) {
  const result = await callAiWithPoolFallback(params);

  const parsed = safeJsonParse(result.text, () => null);
  if (parsed && expectedAnswer) {
    const detected = parsed.transcription?.detectedAnswerLatex
                  || parsed.evaluation?.detectedAnswerLatex
                  || parsed.detectedAnswerLatex;
    if (detected && isAnswerEquivalent(detected, expectedAnswer)) {
      result.fastPath = true;
      // Override parsed result untuk return isCorrect=true dengan minimal response
      const fastParsed = {
        ...parsed,
        evaluation: {
          ...(parsed.evaluation || {}),
          isCorrect: true,
          score: 100,
          wrongSteps: [],
          redlineTargets: [],
          fullFeedback: 'Jawaban Anda benar.',
          fullFeedbackLatex: '\\text{Jawaban Anda benar.}',
          fullFeedbackPlain: 'Jawaban Anda benar.',
        },
      };
      result.text = JSON.stringify(fastParsed);
      result.fastPathEquivalent = { detected, expected: expectedAnswer };
    }
  }

  return result;
}
```

**Call site update** di route `/evaluate` (merged flow branch):
```js
const result = await callAiWithPoolFallbackWithFastPath({
  ... existing params ...,
  expectedAnswer: sanitized.expectedAnswer.text,
  db: req.app.locals.db,
  userId: req.session.userId,
  problemId: normalizedProblemId,
});
```

**Keuntungan fast-path:**
1. Konsistensi: student yang tulis jawaban sama dengan kunci selalu dapat benar
2. Output response lebih kecil → network transfer lebih cepat
3. Frontend tidak render wrongSteps/redline → CPU lebih ringan
4. **BUKAN pengurangan AI latency** (AI call tetap jalan), tapi cleanup post-processing

**Effort:** 2-3 jam | **Risk:** MEDIUM (false positive equivalence = student dapat poin padahal salah)

**Mitigasi:**
- Whitelist characters di numeric eval (hanya math ops, no function eval)
- Batas panjang ekspresi (max 100 chars)
- Logging semua fast-path match untuk audit
- A/B test dengan 30+ soal sebelum enable

---

### 3.5 Optimasi 5: SSE Streaming + Adaptive maxOutputTokens

**Tujuan:** User lihat progress real-time ("Membaca → Mengevaluasi → Selesai"). Perceived latency turun drastis.

#### 3.5.1 Backend: `/api/correction/evaluate-stream`

**File:** `server/routes/correction.js` — tambah route baru (existing `/evaluate` tetap utuh)

```js
router.post('/evaluate-stream', isAuthenticated, requireRegisteredUser, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Heartbeat agar koneksi tidak timeout
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 10000);

  try {
    // ... validasi sama dengan /evaluate ...
    sendEvent('phase', { phase: 'reading', message: 'Membaca canvas...' });

    const result = await callAiWithPoolFallbackWithFastPath({
      ... params ...,
      maxOutputTokens: 1500,  // smaller initial budget
    });

    sendEvent('phase', { phase: 'evaluating', message: 'Mengevaluasi jawaban...' });

    // ... build final result (sama dengan /evaluate) ...

    sendEvent('result', finalResult);
    res.end();
  } catch (error) {
    sendEvent('error', { message: error.message });
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
});
```

#### 3.5.2 Frontend: SSE Client Support

**File:** `src/backend-api.jsx` — extend `MafikingAPI.post` untuk support `options.stream`:

```js
post: async function(path, body, options = {}) {
  if (options.stream) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop();

      for (const eventText of events) {
        if (!eventText.trim()) continue;
        const lines = eventText.split('\n');
        let eventName = 'message';
        let dataLine = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventName = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataLine += line.slice(6);
        }
        if (dataLine) {
          const data = JSON.parse(dataLine);
          if (options.onEvent) options.onEvent(eventName, data);
          if (eventName === 'result') finalResult = data;
          if (eventName === 'error') throw new Error(data.message);
        }
      }
    }
    return finalResult;
  }
  // ... existing non-stream path ...
},
```

#### 3.5.3 Update `submitCanvas()` di `src/practice.jsx`

```js
async function submitCanvas() {
  // ... existing setup ...
  setSubmitting(true);

  try {
    const result = await MafikingAPI.post("/api/correction/evaluate-stream", {
      ... payload ...
    }, {
      stream: true,
      onEvent: (eventName, data) => {
        if (eventName === 'phase') {
          if (data.phase === 'reading') setCanvasProcess("reading");
          else if (data.phase === 'evaluating') setCanvasProcess("evaluating");
          else if (data.phase === 'fast-path') {
            setCanvasProcess("evaluating");
            showToast("Cocok dengan kunci jawaban!", "success", 1500);
          }
        }
      },
    });

    saveCanvasEvaluationResult({ imageBase64, strokeSnapshot }, result);
  } catch (caught) {
    handleCorrectionError(caught);
  } finally {
    setCanvasProcess(null);
    setSubmitting(false);
  }
}
```

**Update UI** untuk handle phase baru (reading/evaluating/fast-path):
- `reading` → "Membaca canvas..." (first ~3-4s)
- `evaluating` → "Mengevaluasi..." (next ~3-8s)
- `fast-path` → quick success toast

**Effort:** 6-8 jam | **Risk:** MEDIUM (SSE complexity, CSRF, connection management)

**Mitigasi:**
- Test dengan concurrent users (5+ koneksi SSE stabil)
- Frontend fallback ke `/evaluate` non-streaming kalau SSE gagal
- Heartbeat setiap 10s untuk jaga koneksi tetap hidup

---

### 3.6 Optimasi 6: Latency Metric Tracking

#### 3.6.1 Schema Baru

**File:** `db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS correction_latency_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  problem_id INTEGER,
  provider TEXT NOT NULL,           -- 'gemini' | 'groq' | 'openrouter'
  key_index INTEGER,
  model_used TEXT,
  image_dimension INTEGER,
  image_bytes INTEGER,
  ai_duration_ms INTEGER,
  total_duration_ms INTEGER,
  cache_hit INTEGER DEFAULT 0,
  fast_path INTEGER DEFAULT 0,
  is_correct INTEGER,
  queue_wait_ms INTEGER,
  status TEXT DEFAULT 'success',
  error_code INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_latency_created ON correction_latency_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_latency_provider ON correction_latency_metrics(provider);
```

#### 3.6.2 Buat `server/observability/latency-tracker.js`

Helper untuk record + query metrics. Length ~80 baris.

```js
function recordLatency(db, metrics) { /* INSERT */ }
function getLatencySummary(db, { sinceHours = 24 } = {}) {
  // Hitung p50, p90, p99, cacheHitRate, fastPathRate, byProvider
  return { count, ai: {p50,p90,p99}, total: {p50,p90,p99}, ... };
}
```

#### 3.6.3 Integrasi di `server/routes/correction.js`

Di route `/evaluate` (existing), tambah tracking sebelum return:

```js
const requestStartedAt = Date.now();
// ... existing call ...
recordLatency(req.app.locals.db, {
  userId, problemId, provider, keyIndex, modelUsed,
  imageBytes, aiDurationMs: result.durationMs,
  totalDurationMs: Date.now() - requestStartedAt,
  cacheHit: result.cached || false,
  fastPath: result.fastPath || false,
  isCorrect: evaluation.isCorrect,
  status: 'success',
});
```

#### 3.6.4 Admin Endpoint

```js
router.get('/latency/summary', isAuthenticated, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Akses admin diperlukan' });
  const hours = Number(req.query.hours) || 24;
  res.json(getLatencySummary(req.app.locals.db, { sinceHours: hours }));
});
```

#### 3.6.5 Admin UI Tab (Opsional, Fase 2)

Tambah tab "Latency Monitoring" di admin panel — p50/p90/p99 chart, cache hit rate, fast-path rate, per-provider breakdown.

**Effort:** 3-4 jam (backend only) | **Risk:** LOW (read-only observability)

---

## 4. Urutan Implementasi

| Step | Task | File | Effort | Risk | Impact |
|------|------|------|--------|------|--------|
| 1 | Image downsize 700→550 + JPEG 0.55 | `src/practice.jsx` | 5 min | LOW | -1-2s |
| 2 | correctionLimiter per-user | `server.js` | 10 min | LOW | Hilang shared-IP throttle |
| 3 | Tambah OpenRouter provider | `server/ai/openrouter-client.js`, `server/ai/multi-provider-pool.js`, `.env*` | 2-3 jam | MEDIUM | +20-30 RPM, peak -5-10s |
| 4 | Pool concurrency 3→5 | `.env` | 1 min | LOW | Peak lebih lancar |
| 5 | Latency tracking schema + tracker | `db/schema.sql`, `server/observability/latency-tracker.js`, `server/routes/correction.js` | 3-4 jam | LOW | Visibility |
| 6 | Fast-path equivalence check | `server/learning/answer-equivalence.js`, `server/routes/correction.js` | 2-3 jam | MEDIUM | -1-2s untuk jawaban benar |
| 7 | SSE streaming | `server/routes/correction.js`, `src/backend-api.jsx`, `src/practice.jsx` | 6-8 jam | MEDIUM | -30-50% perceived latency |
| 8 | Admin latency dashboard | `src/admin-monitoring.jsx` (opsional) | 4-6 jam | LOW | Visibility untuk user |

**Total effort:** 18-26 jam coding + testing

**Rekomendasi urutan eksekusi:**
- Step 1-2 dulu (quick wins, < 1 jam total, deployable immediate)
- Step 3-4 (capacity boost)
- Step 5 (visibility, support steps 6-7)
- Step 6 (fast-path, bisa testing dengan sample soal existing)
- Step 7 (SSE, paling kompleks, lakukan setelah observability jalan)
- Step 8 (admin UI, terakhir)

---

## 5. Test Plan

### 5.1 Per-Optimasi Test

**Step 1:** Submit canvas dengan tulisan kompleks (integral multi-step). Verify akurasi. Check ukuran base64 di network tab.

**Step 2:** 1 user rapid submit 13x → 429 di #13. 2 user dari IP sama masing-masing 10x → tidak ada 429.

**Step 3:** 5 submit canvas → ~1-2 pakai OpenRouter. Check `provider` di response. Submit salah → redline akurat.

**Step 4:** 6 concurrent submit → tidak ada queue wait >2s.

**Step 5:** Submit 10 canvas, GET `/api/correction/latency/summary` → p50/p90/byProvider terisi.

**Step 6:** Submit soal benar → `fastPath: true`, `wrongSteps: []`, `redlineTargets: []`. Submit salah → `fastPath: false`.

**Step 7:** Submit → UI menampilkan "Membaca canvas..." dulu, lalu "Mengevaluasi...". Test concurrent 5+.

### 5.2 Load Test (script baru)

```js
// scripts/load-test-canvas.js
// Simulate 5-10 concurrent users. Measure p50/p90/p99. Verify no 429.
```

### 5.3 Akurasi Regression Test

```js
// scripts/accuracy-test-canvas.js
// Submit 30 sample soal Integral. Bandingkan dengan ground truth.
// Expected: >= 90% (sama dengan V1).
```

---

## 6. Expected Outcomes

### 6.1 Performance

| Skenario | V1 (sekarang) | V2 (target) | Improvement |
|----------|---------------|-------------|-------------|
| Off-peak, 1 user, jawaban benar | 8-12s | 4-7s | -50% |
| Off-peak, 1 user, jawaban salah | 8-12s | 6-9s | -25% |
| Peak, 5 user konkuren | 20-40s | 8-14s | -65% |
| Peak, 8 user konkuren | timeout | 12-18s | functional |
| Perceived latency (SSE) | full wait | progressive | -40% perceived |

### 6.2 Capacity

| Provider | V1 RPM | V2 RPM |
|----------|--------|--------|
| Gemini | 45 | 45 |
| Groq | 30 | 30 |
| OpenRouter | 0 | ~20 |
| **TOTAL** | **75** | **~95** |
| Concurrency | 3 | 5 |

### 6.3 Cost

$0/bulan (semua provider free tier)

### 6.4 Akurasi

- Image 550px JPEG: math equation tetap jelas
- OpenRouter (Gemini 2.0 Flash via OpenRouter): model yang sama
- Fast-path: hanya override kalau equivalent (tidak kurangi akurasi)
- SSE: tidak affect output content

**Expected: akurasi tetap >= 90% (sama dengan V1)**

---

## 7. Risiko & Mitigasi

| Risiko | Severity | Mitigasi |
|--------|----------|----------|
| Image 550px blur handwriting rapat | MEDIUM | Test dengan sample tulisan tangan; rollback ke 600px kalau regression |
| OpenRouter response format tidak kompatibel | MEDIUM | Pakai format OpenAI yang sama dengan Groq; test 5-10 sample dulu |
| Fast-path false positive | HIGH | Whitelist chars di numeric eval; max 100 chars; log semua match; A/B test 30+ soal |
| SSE connection drop | MEDIUM | Fallback ke non-streaming `/evaluate`; heartbeat 10s |
| Concurrency 5 = lebih banyak rate limit | MEDIUM | Monitor pool stats; turunkan ke 4 kalau ada 429 |
| OpenRouter free tier limit tercapai | LOW | Weight kecil (20%); failover otomatis ke Gemini/Groq |

---

## 8. Rollback Plan

- **Step 1:** Revert 1 baris di `src/practice.jsx` (image 700px webp 0.7)
- **Step 2:** Hapus `keyGenerator` line
- **Step 3:** Set `MAFIKING_POOL_OPENROUTER_WEIGHT=0` (provider tidak dipilih)
- **Step 4:** Set `MAFIKING_POOL_MAX_CONCURRENT=3`
- **Step 5:** Tracking observability — bisa disable dengan hapus `recordLatency()` call
- **Step 6:** Set `MAFIKING_FAST_PATH_ENABLED=false` (env flag) → skip equivalence check
- **Step 7:** Frontend fallback ke `/evaluate` non-streaming

---

## 9. File Checklist

### Catatan Eksekusi 2026-06-04

- OpenRouter provider dibuat opsional. Model default implementasi memakai `google/gemma-4-31b-it:free` karena endpoint model OpenRouter saat dicek masih mengiklankan model ini sebagai free, mendukung image input, dan mendukung `response_format`; model `google/gemini-2.0-flash-exp:free` di draft plan tidak dipakai sebagai default.
- Pengurangan `maxOutputTokens` untuk merged OCR+evaluasi tidak diterapkan. Nilai efektif tetap `3200` supaya jawaban salah tetap punya ruang untuk `wrongSteps`, `redlineTargets`, dan penjelasan yang cukup. Ini mengikuti syarat bahwa canvas user dengan bagian salah berwarna merah harus tetap dikembalikan.
- Fast-path hanya mengosongkan `wrongSteps` dan `redlineTargets` saat jawaban terdeteksi equivalent dengan kunci dan hasil akhirnya benar. Jawaban salah tetap memakai output AI lengkap untuk redline.

### File Baru (3-4)
- [x] `server/ai/openrouter-client.js`
- [x] `server/learning/answer-equivalence.js`
- [x] `server/observability/latency-tracker.js`
- [ ] `scripts/load-test-canvas.js` (opsional)

### File Diubah (5-6)
- [x] `src/practice.jsx` — image config + SSE event handler
- [x] `src/backend-api.jsx` — SSE client support
- [x] `server.js` — correctionLimiter per-user
- [x] `server/ai/multi-provider-pool.js` — OpenRouter provider
- [x] `server/routes/correction.js` — fast-path + SSE endpoint + tracking
- [x] `.env.example` — new env vars
- [x] `db/schema.sql` — latency_metrics table

### File Diubah Minor (1, opsional)
- [ ] `src/admin-monitoring.jsx` — latency dashboard tab

---

## 10. Definisi of Done

- [x] Image 550px JPEG 0.55 aktif
- [x] correctionLimiter per-user aktif
- [x] OpenRouter provider optional tersedia, weight 20% saat `OPENROUTER_API_KEY` diisi
- [x] Pool concurrency 5
- [x] Latency metrics tersimpan di DB
- [x] `/api/correction/latency/summary` endpoint tersedia
- [x] Fast-path equivalence check aktif, dengan env kill switch `MAFIKING_FAST_PATH_ENABLED=false`
- [x] SSE streaming aktif, UI menampilkan progress
- [ ] Load test: 5 user konkuren, p90 < 15s, no 429
- [ ] Akurasi regression test: 30+ soal, akurasi >= 90%
- [ ] Admin dashboard menampilkan latency (kalau Step 8)
- [ ] Manual smoke test: submit canvas benar → < 10s, submit canvas salah → < 10s
- [x] `npm run check` pass, `npm run build` pass

---

**END OF PLAN**
