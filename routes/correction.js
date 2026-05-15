const express = require('express');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BASE64_CHARS = 10_000_000;
const TRANSCRIBE_MODELS = [
  'gemini-2.5-flash-lite',
];
const EVALUATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];
const PROFILE_MODELS = EVALUATE_MODELS;

const EVALUATE_SYSTEM_PROMPT = [
  'Kamu adalah asisten guru matematika yang teliti.',
  'Evaluasi langkah penyelesaian siswa dari gambar canvas atau teks.',
  'Soal dan jawaban acuan diberikan oleh aplikasi.',
  'Baca tulisan tangan, hitung ulang setiap baris, lalu jelaskan letak salahnya jika ada.',
  'Gunakan bahasa Indonesia yang mudah dipahami siswa.',
  'Jika ada koordinat kesalahan, semua box memakai persen 0-100 relatif ke gambar canvas.',
  'Jika posisi tidak yakin, isi null. Jangan mengarang koordinat besar.',
  'fullFeedback harus berisi penyelesaian lengkap dari awal sampai akhir dengan langkah bernomor.',
  'Hindari Markdown tebal, LaTeX mentah, dan blok kode. Gunakan simbol sederhana dan superscript Unicode untuk pangkat.'
].join(' ');

const PROFILE_SYSTEM_PROMPT = [
  'Kamu adalah guru matematika yang membuat raport belajar singkat.',
  'Balas dalam bahasa Indonesia yang ringkas dan actionable.',
  'strengths dan weaknesses berisi topik/kemampuan, bukan kalimat panjang.',
  'recommendedQuestions berisi 3 sampai 5 soal latihan baru yang mirip dengan kelemahan siswa.'
].join(' ');

const EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    isCorrect: { type: 'boolean' },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    detectedAnswerText: { type: 'string' },
    wrongSteps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stepNumber: { type: 'string' },
          previousStep: { type: 'string' },
          studentStep: { type: 'string' },
          issue: { type: 'string' },
          hint: { type: 'string' },
          wrongPartBoxPercent: boxSchema(),
          wrongBoxPercent: boxSchema(),
          combinedBoxPercent: boxSchema()
        },
        required: ['stepNumber', 'previousStep', 'studentStep', 'issue', 'hint']
      }
    },
    fullFeedback: { type: 'string' },
    strengthTags: { type: 'array', items: { type: 'string' } },
    weaknessTags: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'isCorrect',
    'score',
    'detectedAnswerText',
    'wrongSteps',
    'fullFeedback',
    'strengthTags',
    'weaknessTags'
  ]
};

const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    recommendedQuestions: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    overallSummary: { type: 'string' }
  },
  required: ['strengths', 'weaknesses', 'recommendedQuestions', 'overallSummary']
};

function boxSchema() {
  return {
    type: ['object', 'null'],
    properties: {
      x: { type: 'number', minimum: 0, maximum: 100 },
      y: { type: 'number', minimum: 0, maximum: 100 },
      width: { type: 'number', minimum: 0, maximum: 100 },
      height: { type: 'number', minimum: 0, maximum: 100 }
    }
  };
}

function getGeminiKeys() {
  return Array.from({ length: 20 }, (_, index) => process.env[`GEMINI_KEY_${index + 1}`])
    .map((key) => key && key.trim())
    .filter(Boolean);
}

function getGeminiModels(base) {
  const env = (process.env.GEMINI_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set([...env, ...base])];
}

function stripBase64Prefix(value) {
  return String(value || '').replace(/^data:[^;]+;base64,/, '');
}

function detectMimeType(imageBase64, mimeType) {
  return mimeType || String(imageBase64 || '').match(/^data:([^;]+);base64,/)?.[1] || '';
}

function validateImagePayload(imageBase64, mimeType) {
  if (!imageBase64) return { cleanBase64: '', normalizedMimeType: '' };

  const cleanBase64 = stripBase64Prefix(imageBase64);
  const normalizedMimeType = detectMimeType(imageBase64, mimeType);

  if (!ALLOWED_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    const error = new Error('Format gambar harus PNG, JPG, atau WEBP.');
    error.status = 400;
    throw error;
  }

  if (cleanBase64.length > MAX_BASE64_CHARS) {
    const error = new Error('Ukuran gambar canvas terlalu besar.');
    error.status = 413;
    throw error;
  }

  return { cleanBase64, normalizedMimeType };
}

function isRetryableGeminiError(error) {
  const status = error?.status ?? error?.response?.status;
  const message = String(error?.message || '').toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('resource_exhausted') ||
    message.includes('rate limit') ||
    message.includes('overloaded') ||
    message.includes('unavailable')
  );
}

function safeJsonParse(text, fallback) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return fallback(cleaned);
  }
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(Math.max(Math.round(number), 0), 100);
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return Boolean(value);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12);
}

function normalizeBox(box) {
  if (!box || typeof box !== 'object') return null;
  const x = clampPercent(box.x);
  const y = clampPercent(box.y);
  const width = Math.min(clampPercent(box.width), 100 - x);
  const height = Math.min(clampPercent(box.height), 100 - y);
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(Math.max(number, 0), 100);
}

function normalizeEvaluation(raw, sourceText) {
  const isCorrect = normalizeBoolean(raw.isCorrect);
  const wrongSteps = Array.isArray(raw.wrongSteps) ? raw.wrongSteps.map((step) => ({
    combinedBoxPercent: normalizeBox(step.combinedBoxPercent),
    hint: String(step.hint || ''),
    issue: String(step.issue || ''),
    previousStep: String(step.previousStep || ''),
    stepNumber: String(step.stepNumber || ''),
    studentStep: String(step.studentStep || ''),
    wrongBoxPercent: normalizeBox(step.wrongBoxPercent),
    wrongPartBoxPercent: normalizeBox(step.wrongPartBoxPercent)
  })) : [];

  return {
    detectedAnswerText: String(raw.detectedAnswerText || ''),
    fullFeedback: String(raw.fullFeedback || sourceText || 'Evaluasi selesai, tetapi respons AI belum rapi.'),
    isCorrect,
    raw: sourceText,
    score: raw.score == null && isCorrect ? 100 : clampScore(raw.score),
    strengthTags: normalizeStringArray(raw.strengthTags),
    weaknessTags: normalizeStringArray(raw.weaknessTags),
    wrongSteps
  };
}

function normalizeProfileSummary(raw, sourceText) {
  return {
    overallSummary: String(raw.overallSummary || sourceText || 'Ringkasan belajar belum tersedia.'),
    recommendedQuestions: normalizeStringArray(raw.recommendedQuestions).slice(0, 5),
    strengths: normalizeStringArray(raw.strengths),
    weaknesses: normalizeStringArray(raw.weaknesses)
  };
}

async function callGeminiWithFallback({ models, parts, schema, systemInstruction }) {
  const keys = getGeminiKeys();
  const attempts = [];

  if (!keys.length) {
    const error = new Error('Tidak ada API key. Isi GEMINI_KEY_1 di .env.');
    error.status = 500;
    throw error;
  }

  const { GoogleGenAI } = await import('@google/genai');
  let lastError = null;

  for (const model of models) {
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const ai = new GoogleGenAI({ apiKey: keys[keyIndex] });
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            responseJsonSchema: schema,
            responseMimeType: 'application/json',
            systemInstruction
          }
        });

        const text = typeof response.text === 'function' ? response.text() : response.text;
        return { keyIndex: keyIndex + 1, modelUsed: model, text: String(text || '') };
      } catch (error) {
        lastError = error;
        attempts.push({
          keyIndex: keyIndex + 1,
          message: error.message || 'AI request failed',
          model,
          retryable: isRetryableGeminiError(error),
          status: error.status ?? error.response?.status ?? 500
        });
        if (!isRetryableGeminiError(error)) {
          error.attempts = attempts;
          throw error;
        }
      }
    }
  }

  const error = new Error('Semua API key dan model cadangan sedang limit atau overload.');
  error.status = 503;
  error.cause = lastError;
  error.attempts = attempts;
  throw error;
}

function fallbackProfileFromAttempts(attempts) {
  const weaknessCounts = new Map();
  const strengthCounts = new Map();

  for (const attempt of attempts) {
    for (const tag of attempt.weaknessTags || []) weaknessCounts.set(tag, (weaknessCounts.get(tag) || 0) + 1);
    for (const tag of attempt.strengthTags || []) strengthCounts.set(tag, (strengthCounts.get(tag) || 0) + 1);
  }

  const weaknesses = [...weaknessCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag).slice(0, 5);
  const strengths = [...strengthCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag).slice(0, 5);

  return {
    strengths,
    weaknesses,
    recommendedQuestions: weaknesses.length
      ? weaknesses.slice(0, 3).map((tag) => `Latihan ulang topik ${tag} dengan menulis langkah lengkap di canvas.`)
      : ['Kerjakan 3 soal integral substitusi dengan langkah lengkap.', 'Ulangi satu soal yang salah dan bandingkan dengan pembahasan.', 'Pilih satu soal sedang lalu jelaskan alasan setiap langkah.'],
    overallSummary: attempts.length
      ? `Kamu sudah punya ${attempts.length} hasil koreksi. Fokus berikutnya adalah mengurangi pola salah yang paling sering muncul.`
      : 'Belum ada hasil koreksi untuk diringkas.'
  };
}

function serializeAttempt(row) {
  const evaluation = safeJsonParse(row.evaluation_json, () => ({}));
  return {
    completedAt: row.created_at,
    evaluation,
    feedback: row.feedback,
    id: row.id,
    mode: row.mode,
    problemId: row.problem_id,
    questionText: row.question_text,
    score: row.score,
    isCorrect: Boolean(row.is_correct),
    strengthTags: safeJsonParse(row.strength_tags, () => []),
    weaknessTags: safeJsonParse(row.weakness_tags, () => [])
  };
}

router.get('/attempts', isAuthenticated, (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare(`
    SELECT *
    FROM correction_attempts
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  `).all(req.session.userId);
  res.json(rows.map(serializeAttempt));
});

router.post('/transcribe', isAuthenticated, async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    const { cleanBase64, normalizedMimeType } = validateImagePayload(imageBase64, mimeType);
    if (!cleanBase64) return res.status(400).json({ error: 'imageBase64 wajib dikirim.' });

    const result = await callGeminiWithFallback({
      models: getGeminiModels(TRANSCRIBE_MODELS),
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      systemInstruction: 'Baca tulisan tangan matematika pada gambar. Jangan memperbaiki jawaban, hanya transkripsikan.',
      parts: [
        { text: 'Transkripsikan isi gambar jawaban berikut.' },
        { inlineData: { data: cleanBase64, mimeType: normalizedMimeType } }
      ]
    });

    const parsed = safeJsonParse(result.text, (text) => ({ text }));
    res.json({ keyIndex: result.keyIndex, modelUsed: result.modelUsed, text: String(parsed.text || '') });
  } catch (error) {
    res.status(error.status ?? error.response?.status ?? 500).json({
      error: error.message || 'Gagal membaca gambar.',
      attempts: error.attempts
    });
  }
});

router.post('/evaluate', isAuthenticated, async (req, res) => {
  try {
    const {
      expectedAnswer,
      imageBase64,
      mimeType,
      problemId,
      questionId,
      questionText,
      text,
      topicTags
    } = req.body;

    if (!questionText && !text && !imageBase64) {
      return res.status(400).json({ error: 'Kirim soal dan jawaban teks atau gambar canvas.' });
    }

    const { cleanBase64, normalizedMimeType } = validateImagePayload(imageBase64, mimeType);
    const parts = [
      {
        text: [
          'Evaluasi jawaban siswa dan kembalikan JSON sesuai schema.',
          questionId || problemId ? `ID soal: ${questionId || problemId}` : '',
          questionText ? `Soal: ${questionText}` : '',
          expectedAnswer ? `Jawaban acuan: ${expectedAnswer}` : '',
          Array.isArray(topicTags) && topicTags.length ? `Topik soal: ${topicTags.join(', ')}` : '',
          text ? `Teks jawaban siswa:\n${text}` : 'Jawaban siswa ada pada gambar canvas.'
        ].filter(Boolean).join('\n\n')
      }
    ];

    if (cleanBase64) {
      parts.push({ inlineData: { data: cleanBase64, mimeType: normalizedMimeType } });
    }

    const result = await callGeminiWithFallback({
      models: getGeminiModels(EVALUATE_MODELS),
      schema: EVALUATION_SCHEMA,
      systemInstruction: EVALUATE_SYSTEM_PROMPT,
      parts
    });
    const parsed = safeJsonParse(result.text, (fullFeedback) => ({ fullFeedback, isCorrect: false, score: 0 }));
    const evaluation = normalizeEvaluation(parsed, result.text);
    const feedback = evaluation.fullFeedback;

    const db = req.app.locals.db;
    const normalizedProblemId = Number(problemId || questionId) || null;
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
      evaluation.detectedAnswerText,
      evaluation.score,
      evaluation.isCorrect ? 1 : 0,
      feedback,
      JSON.stringify(evaluation.strengthTags),
      JSON.stringify(evaluation.weaknessTags),
      JSON.stringify(evaluation)
    );

    res.json({
      evaluation,
      feedback,
      keyIndex: result.keyIndex,
      modelUsed: result.modelUsed
    });
  } catch (error) {
    res.status(error.status ?? error.response?.status ?? 500).json({
      error: error.message || 'Gagal mengevaluasi jawaban.',
      attempts: error.attempts
    });
  }
});

router.post('/profile-summary', isAuthenticated, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const attempts = Array.isArray(req.body?.attempts) && req.body.attempts.length
      ? req.body.attempts
      : db.prepare(`
          SELECT *
          FROM correction_attempts
          WHERE user_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 20
        `).all(req.session.userId).map(serializeAttempt);

    if (!attempts.length) {
      return res.json({ summary: fallbackProfileFromAttempts([]) });
    }

    const compactAttempts = attempts.map((attempt, index) => {
      const evaluation = attempt.evaluation || {};
      return {
        nomor: index + 1,
        questionText: String(attempt.questionText || ''),
        score: clampScore(attempt.score ?? evaluation.score),
        isCorrect: normalizeBoolean(attempt.isCorrect ?? evaluation.isCorrect),
        strengthTags: normalizeStringArray(attempt.strengthTags || evaluation.strengthTags),
        weaknessTags: normalizeStringArray(attempt.weaknessTags || evaluation.weaknessTags),
        wrongIssues: Array.isArray(evaluation.wrongSteps)
          ? evaluation.wrongSteps.map((step) => String(step.issue || '')).filter(Boolean)
          : []
      };
    });

    if (!getGeminiKeys().length) {
      return res.json({ summary: fallbackProfileFromAttempts(compactAttempts) });
    }

    const result = await callGeminiWithFallback({
      models: getGeminiModels(PROFILE_MODELS),
      schema: PROFILE_SCHEMA,
      systemInstruction: PROFILE_SYSTEM_PROMPT,
      parts: [{ text: `Buat raport belajar dari data berikut:\n\n${JSON.stringify(compactAttempts)}` }]
    });
    const parsed = safeJsonParse(result.text, (overallSummary) => ({ overallSummary }));
    const summary = normalizeProfileSummary(parsed, result.text);

    res.json({
      keyIndex: result.keyIndex,
      modelUsed: result.modelUsed,
      summary
    });
  } catch (error) {
    res.status(error.status ?? error.response?.status ?? 500).json({
      error: error.message || 'Gagal membuat ringkasan profil.',
      attempts: error.attempts
    });
  }
});

module.exports = router;
