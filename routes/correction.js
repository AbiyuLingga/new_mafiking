const express = require('express');
const fs = require('fs');
const path = require('path');
const { isAuthenticated } = require('../middleware/auth');
const { buildRecommendationSummary, formatLearningSkillLabel } = require('../lib/recommendation-engine');
const {
  call9RouterProfileSummary,
  shouldUse9RouterProfile,
} = require('../lib/ai-profile-provider');

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
const PROFILE_AI_ATTEMPT_LIMIT = 20;
const PROFILE_RECOMMENDATION_ATTEMPT_LIMIT = 200;
const PROFILE_AI_REFRESH_COOLDOWN_MS = 60 * 60 * 1000;
const PROFILE_MC_ATTEMPT_LIMIT = 120;
const CANVAS_REDLINE_SOP = readCanvasRedlineSop();
const PROFILE_NARRATIVE_SOP = readProfileNarrativeSop();

const TRANSCRIBE_SYSTEM_PROMPT = [
  'Kamu wajib membaca dan mengikuti SOP Gemini Canvas Redline berikut sebelum menjawab.',
  CANVAS_REDLINE_SOP,
  'Tugas saat ini hanya OCR/transkripsi canvas.',
  'Jangan mengoreksi jawaban, jangan memperbaiki langkah salah, dan jangan memberi skor.',
  'Balas hanya JSON valid sesuai schema.',
  'Semua field yang berisi teks untuk user harus berupa LaTeX.',
  'Semua teks biasa di dalam LaTeX wajib memakai \\text{...}.'
].join('\n\n');

const EVALUATE_SYSTEM_PROMPT = [
  'Kamu wajib membaca dan mengikuti SOP Gemini Canvas Redline berikut sebelum menjawab.',
  CANVAS_REDLINE_SOP,
  'Tugas saat ini adalah mengevaluasi jawaban canvas yang transkripsinya sudah dikonfirmasi user.',
  'Gunakan confirmedAnswerLatex sebagai teks utama dan gambar canvas sebagai bukti visual.',
  'Jika teks dan gambar tidak konsisten, set needsResubmission true.',
  'Jika ada kesalahan, isi wrongSteps dan redlineTargets agar frontend dapat mengubah coretan salah menjadi merah.',
  'Jangan mengembalikan Markdown, HTML, atau code fence.',
  'Balas hanya JSON valid sesuai schema.',
  'Semua field yang berisi teks untuk user harus berupa LaTeX.',
  'Semua teks biasa di dalam LaTeX wajib memakai \\text{...}.'
].join(' ');

const PROFILE_SYSTEM_PROMPT = [
  'Kamu wajib membaca dan mengikuti SOP 9Router Profile Summary berikut sebelum menjawab.',
  PROFILE_NARRATIVE_SOP,
  'Balas hanya JSON valid sesuai schema: strengths, weaknesses, recommendedQuestions, overallSummary. Jangan Markdown, jangan code fence, jangan properti tambahan.'
].join('\n\n');

const EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    isCorrect: { type: 'boolean' },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    detectedAnswerText: { type: 'string' },
    detectedAnswerLatex: { type: 'string' },
    needsResubmission: { type: 'boolean' },
    wrongSteps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stepNumber: { type: 'string' },
          previousStep: { type: 'string' },
          studentStep: { type: 'string' },
          studentStepLatex: { type: 'string' },
          correctStepLatex: { type: 'string' },
          issue: { type: 'string' },
          issueLatex: { type: 'string' },
          hint: { type: 'string' },
          hintLatex: { type: 'string' },
          wrongPartBoxPercent: boxSchema(),
          wrongBoxPercent: boxSchema(),
          combinedBoxPercent: boxSchema()
        },
        required: [
          'stepNumber',
          'previousStep',
          'studentStep',
          'studentStepLatex',
          'correctStepLatex',
          'issue',
          'issueLatex',
          'hint',
          'hintLatex'
        ]
      }
    },
    redlineTargets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stepNumber: { type: 'string' },
          targetTextLatex: { type: 'string' },
          reasonLatex: { type: 'string' },
          boxPercent: boxSchema(),
          severity: { type: 'string' }
        },
        required: ['stepNumber', 'targetTextLatex', 'reasonLatex', 'boxPercent', 'severity']
      }
    },
    fullFeedback: { type: 'string' },
    fullFeedbackLatex: { type: 'string' },
    strengthTags: { type: 'array', items: { type: 'string' } },
    weaknessTags: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'isCorrect',
    'score',
    'detectedAnswerText',
    'detectedAnswerLatex',
    'needsResubmission',
    'wrongSteps',
    'redlineTargets',
    'fullFeedback',
    'fullFeedbackLatex',
    'strengthTags',
    'weaknessTags'
  ]
};

const TRANSCRIPTION_SCHEMA = {
  type: 'object',
  properties: {
    detectedAnswerLatex: { type: 'string' },
    readingConfidence: { type: 'number', minimum: 0, maximum: 1 },
    unclearParts: { type: 'array', items: { type: 'string' } },
    needsUserConfirmation: { type: 'boolean' }
  },
  required: ['detectedAnswerLatex', 'readingConfidence', 'unclearParts', 'needsUserConfirmation']
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

function readCanvasRedlineSop() {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'SOP-GEMINI-CANVAS-REDLINE.md'), 'utf8');
  } catch {
    return [
      'SOP Gemini Canvas Redline:',
      'OCR harus terjadi sebelum evaluasi.',
      'User harus mengonfirmasi transkripsi.',
      'Semua teks user-facing harus LaTeX dan teks biasa wajib memakai \\text{...}.',
      'Gemini mengembalikan redlineTargets; frontend yang mengubah warna stroke menjadi merah.'
    ].join('\n');
  }
}

function readProfileNarrativeSop() {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'SOP-9ROUTER-PROFILE-SUMMARY.md'), 'utf8');
  } catch {
    return [
      'SOP 9Router Profile Summary:',
      'Tulis hanya diagnosis dan narasi belajar dari evidence attempt.',
      'Jangan memilih ref soal final, difficulty final, atau Purcell reference final.',
      'Backend lokal memilih recommendedItems dan skillNeedScores secara deterministik.',
      'Balas hanya JSON valid sesuai schema strengths, weaknesses, recommendedQuestions, overallSummary.'
    ].join('\n');
  }
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

function normalizeTranscription(raw, sourceText) {
  return {
    detectedAnswerLatex: String(raw.detectedAnswerLatex || raw.text || sourceText || ''),
    needsUserConfirmation: raw.needsUserConfirmation == null ? true : normalizeBoolean(raw.needsUserConfirmation),
    readingConfidence: Math.min(Math.max(Number(raw.readingConfidence) || 0, 0), 1),
    unclearParts: normalizeStringArray(raw.unclearParts)
  };
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
    hintLatex: String(step.hintLatex || step.hint || ''),
    issue: String(step.issue || ''),
    issueLatex: String(step.issueLatex || step.issue || ''),
    previousStep: String(step.previousStep || ''),
    stepNumber: String(step.stepNumber || ''),
    studentStep: String(step.studentStep || ''),
    studentStepLatex: String(step.studentStepLatex || step.studentStep || ''),
    correctStepLatex: String(step.correctStepLatex || ''),
    wrongBoxPercent: normalizeBox(step.wrongBoxPercent),
    wrongPartBoxPercent: normalizeBox(step.wrongPartBoxPercent)
  })) : [];
  const redlineTargets = Array.isArray(raw.redlineTargets) ? raw.redlineTargets.map((target) => ({
    boxPercent: normalizeBox(target.boxPercent),
    reasonLatex: String(target.reasonLatex || ''),
    severity: String(target.severity || 'error'),
    stepNumber: String(target.stepNumber || ''),
    targetTextLatex: String(target.targetTextLatex || '')
  })) : [];
  const fullFeedbackLatex = String(raw.fullFeedbackLatex || raw.fullFeedback || sourceText || 'Koreksi selesai, tetapi respons AI belum rapi.');

  return {
    detectedAnswerText: String(raw.detectedAnswerText || ''),
    detectedAnswerLatex: String(raw.detectedAnswerLatex || raw.detectedAnswerText || ''),
    fullFeedback: String(raw.fullFeedback || fullFeedbackLatex),
    fullFeedbackLatex,
    isCorrect,
    needsResubmission: normalizeBoolean(raw.needsResubmission),
    raw: sourceText,
    redlineTargets,
    score: raw.score == null && isCorrect ? 100 : clampScore(raw.score),
    strengthTags: normalizeStringArray(raw.strengthTags).map(formatLearningSkillLabel),
    weaknessTags: normalizeStringArray(raw.weaknessTags).map(formatLearningSkillLabel),
    wrongSteps
  };
}

function normalizeProfileSummary(raw, sourceText) {
  return {
    overallSummary: String(raw.overallSummary || sourceText || 'Ringkasan belajar belum tersedia.'),
    recommendedItems: normalizeRecommendedItems(raw.recommendedItems),
    recommendedQuestions: normalizeStringArray(raw.recommendedQuestions).slice(0, 5),
    skillNeedScores: normalizeSkillNeedScores(raw.skillNeedScores),
    strengths: normalizeStringArray(raw.strengths).map(formatLearningSkillLabel),
    weaknesses: normalizeStringArray(raw.weaknesses).map(formatLearningSkillLabel)
  };
}

function normalizeRecommendedItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object') return null;
    return {
      answerDisplay: String(item.answerDisplay || ''),
      chapter: String(item.chapter || ''),
      difficulty: String(item.difficulty || 'Medium'),
      needScore: clampScore(item.needScore),
      purcellReference: String(item.purcellReference || ''),
      questionDisplay: String(item.questionDisplay || item.questionText || ''),
      questionText: String(item.questionText || ''),
      reason: String(item.reason || ''),
      ref: String(item.ref || ''),
      skillIds: normalizeStringArray(item.skillIds),
      source: String(item.source || ''),
      storyProblem: normalizeBoolean(item.storyProblem),
      subtopic: String(item.subtopic || ''),
      targetSkill: item.targetSkill && typeof item.targetSkill === 'object'
        ? {
            chapter: String(item.targetSkill.chapter || ''),
            id: String(item.targetSkill.id || ''),
            label: formatLearningSkillLabel(item.targetSkill.label)
          }
        : null,
      weaknessTags: normalizeStringArray(item.weaknessTags)
    };
  }).filter((item) => item && (item.ref || item.questionDisplay)).slice(0, 5);
}

function normalizeSkillNeedScores(value) {
  if (!Array.isArray(value)) return [];
  return value.map((score) => {
    if (!score || typeof score !== 'object') return null;
    return {
      averageScore: clampScore(score.averageScore),
      chapter: String(score.chapter || ''),
      confidence: Math.max(0, Math.min(1, Number(score.confidence) || 0)),
      label: formatLearningSkillLabel(score.label),
      needScore: clampScore(score.needScore),
      skillId: String(score.skillId || ''),
      totalAttempts: Math.max(0, Number(score.totalAttempts) || 0),
      wrongAttempts: Math.max(0, Number(score.wrongAttempts) || 0)
    };
  }).filter((score) => score && score.skillId).slice(0, 8);
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

async function callProfileNarrativeSummary(attempts) {
  if (shouldUse9RouterProfile()) {
    return call9RouterProfileSummary({
      attempts,
      systemInstruction: PROFILE_SYSTEM_PROMPT,
    });
  }

  if (!getGeminiKeys().length) return null;

  const result = await callGeminiWithFallback({
    models: getGeminiModels(PROFILE_MODELS),
    schema: PROFILE_SCHEMA,
    systemInstruction: PROFILE_SYSTEM_PROMPT,
    parts: [{ text: `Buat raport belajar dari data berikut:\n\n${JSON.stringify(attempts)}` }]
  });

  return {
    keyIndex: result.keyIndex,
    modelUsed: result.modelUsed,
    provider: 'gemini',
    text: result.text,
  };
}

function fallbackProfileFromAttempts(attempts) {
  const deterministicSummary = buildDeterministicProfileSummary(attempts);
  if (deterministicSummary) return deterministicSummary;

  const weaknessCounts = new Map();
  const strengthCounts = new Map();

  for (const attempt of attempts) {
    for (const tag of attempt.weaknessTags || []) {
      const label = formatLearningSkillLabel(tag);
      weaknessCounts.set(label, (weaknessCounts.get(label) || 0) + 1);
    }
    for (const tag of attempt.strengthTags || []) {
      const label = formatLearningSkillLabel(tag);
      strengthCounts.set(label, (strengthCounts.get(label) || 0) + 1);
    }
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

function buildDeterministicProfileSummary(attempts) {
  try {
    return normalizeProfileSummary(buildRecommendationSummary({ attempts }), '');
  } catch (error) {
    console.warn('Recommendation summary fallback failed:', error.message);
    return null;
  }
}

function mergeProfileSummaries(aiSummary, deterministicSummary) {
  if (!deterministicSummary) return aiSummary;
  return {
    overallSummary: aiSummary.overallSummary || deterministicSummary.overallSummary,
    recommendedItems: deterministicSummary.recommendedItems,
    recommendedQuestions: deterministicSummary.recommendedQuestions.length
      ? deterministicSummary.recommendedQuestions
      : aiSummary.recommendedQuestions,
    skillNeedScores: deterministicSummary.skillNeedScores,
    strengths: aiSummary.strengths.length ? aiSummary.strengths : deterministicSummary.strengths,
    weaknesses: aiSummary.weaknesses.length ? aiSummary.weaknesses : deterministicSummary.weaknesses
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

function loadRecentCorrectionAttempts(db, userId, limit) {
  return db.prepare(`
    SELECT *
    FROM correction_attempts
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(userId, limit).map(serializeAttempt);
}

function compactAttemptsForProfile(attempts, limit = attempts.length) {
  return (Array.isArray(attempts) ? attempts : []).slice(0, limit).map((attempt, index) => {
    const evaluation = attempt.evaluation || {};
    return {
      nomor: index + 1,
      completedAt: attempt.completedAt || attempt.createdAt || attempt.submittedAt || '',
      questionText: String(attempt.questionText || ''),
      score: clampScore(attempt.score ?? evaluation.score),
      isCorrect: normalizeBoolean(attempt.isCorrect ?? evaluation.isCorrect),
      strengthTags: normalizeStringArray(attempt.strengthTags || evaluation.strengthTags).map(formatLearningSkillLabel),
      weaknessTags: normalizeStringArray(attempt.weaknessTags || evaluation.weaknessTags).map(formatLearningSkillLabel),
      wrongIssues: Array.isArray(evaluation.wrongSteps)
        ? evaluation.wrongSteps.map((step) => String(step.issue || '')).filter(Boolean)
        : []
    };
  });
}

function chooseProfileAttemptSource(dbAttempts, requestAttempts) {
  return Array.isArray(dbAttempts) && dbAttempts.length ? dbAttempts : (requestAttempts || []);
}

function getProfileUser(db, userId) {
  return db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId) || null;
}

function canBypassProfileAiCooldown(user) {
  return Boolean(user && (user.role === 'admin' || user.username === '123'));
}

function getProfileAiRefreshState(db, user, now = new Date()) {
  if (!user?.id) {
    return { allowed: false, bypass: false, remainingMs: PROFILE_AI_REFRESH_COOLDOWN_MS, availableAt: null };
  }

  if (canBypassProfileAiCooldown(user)) {
    return { allowed: true, bypass: true, remainingMs: 0, availableAt: null };
  }

  const row = db.prepare('SELECT last_ai_refresh_at FROM profile_ai_refreshes WHERE user_id = ?').get(user.id);
  if (!row?.last_ai_refresh_at) {
    return { allowed: true, bypass: false, remainingMs: 0, availableAt: null };
  }

  const lastAt = new Date(row.last_ai_refresh_at);
  const availableAt = new Date(lastAt.getTime() + PROFILE_AI_REFRESH_COOLDOWN_MS);
  const remainingMs = availableAt.getTime() - now.getTime();
  return {
    allowed: remainingMs <= 0,
    bypass: false,
    remainingMs: Math.max(0, remainingMs),
    availableAt: availableAt.toISOString()
  };
}

function recordProfileAiRefresh(db, userId, now = new Date()) {
  db.prepare(`
    INSERT INTO profile_ai_refreshes (user_id, last_ai_refresh_at)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET last_ai_refresh_at = excluded.last_ai_refresh_at
  `).run(userId, now.toISOString());
}

function loadMultipleChoiceEvidence(db, userId, limit = PROFILE_MC_ATTEMPT_LIMIT) {
  return db.prepare(`
    SELECT
      pa.created_at,
      pa.correct,
      pa.selected_answer,
      pa.correct_answer,
      pa.selected_choice_index,
      pa.correct_choice_index,
      pa.hints_used,
      p.id AS problem_id,
      p.question_display,
      p.question_text,
      p.answer_display,
      p.difficulty,
      p.question_type,
      s.title AS subtopic_title,
      c.title AS chapter_title
    FROM practice_attempts pa
    JOIN problems p ON p.id = pa.problem_id
    LEFT JOIN subtopics s ON s.id = p.subtopic_id
    LEFT JOIN chapters c ON c.id = s.chapter_id
    WHERE pa.user_id = ?
      AND pa.mode = 'choice'
    ORDER BY pa.created_at DESC, pa.id DESC
    LIMIT ?
  `).all(userId, limit);
}

function summarizeMultipleChoiceEvidence(rows) {
  const summary = new Map();
  const recentWrong = [];

  for (const row of rows || []) {
    const key = [
      row.chapter_title || 'Tanpa Bab',
      row.subtopic_title || 'Tanpa Subtopik',
      row.difficulty || 'Medium'
    ].join(' | ');
    const item = summary.get(key) || {
      chapter: row.chapter_title || '',
      difficulty: row.difficulty || '',
      subtopic: row.subtopic_title || '',
      totalAttempts: 0,
      wrongAttempts: 0
    };
    item.totalAttempts += 1;
    if (!row.correct) item.wrongAttempts += 1;
    summary.set(key, item);

    if (!row.correct && recentWrong.length < 12) {
      recentWrong.push({
        completedAt: row.created_at,
        correctAnswer: row.correct_answer || row.answer_display || '',
        correctChoiceIndex: row.correct_choice_index,
        difficulty: row.difficulty || '',
        problemId: row.problem_id,
        questionDisplay: row.question_display || row.question_text || '',
        selectedAnswer: row.selected_answer || '',
        selectedChoiceIndex: row.selected_choice_index,
        subtopic: row.subtopic_title || ''
      });
    }
  }

  return {
    patterns: Array.from(summary.values())
      .filter((item) => item.wrongAttempts > 0)
      .sort((a, b) => {
        if (b.wrongAttempts !== a.wrongAttempts) return b.wrongAttempts - a.wrongAttempts;
        return b.totalAttempts - a.totalAttempts;
      })
      .slice(0, 8),
    recentWrong
  };
}

function buildProfileAiEvidence({ aiAttempts, multipleChoiceEvidence }) {
  return {
    correctionAttempts: aiAttempts,
    multipleChoiceEvidence,
    instructions: {
      correctionAttempts: 'Gunakan untuk pola kesalahan canvas dan weaknessTags/strengthTags.',
      multipleChoiceEvidence: 'Gunakan untuk menyebut pola salah pilihan ganda berdasarkan subtopik, difficulty, jawaban terpilih, dan jawaban benar. Jangan jadikan ini sumber ref soal final.'
    }
  };
}

function serializeProfileAiRefreshState(refreshState, used) {
  return {
    availableAt: refreshState.availableAt,
    bypass: Boolean(refreshState.bypass),
    cooldownSeconds: Math.ceil((refreshState.remainingMs || 0) / 1000),
    skipped: !refreshState.allowed,
    used: Boolean(used)
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
    const { imageBase64, mimeType, questionText } = req.body;
    const { cleanBase64, normalizedMimeType } = validateImagePayload(imageBase64, mimeType);
    if (!cleanBase64) return res.status(400).json({ error: 'imageBase64 wajib dikirim.' });

    const result = await callGeminiWithFallback({
      models: getGeminiModels(TRANSCRIBE_MODELS),
      schema: TRANSCRIPTION_SCHEMA,
      systemInstruction: TRANSCRIBE_SYSTEM_PROMPT,
      parts: [
        {
          text: [
            'Transkripsikan isi gambar jawaban berikut sesuai SOP.',
            questionText ? `Soal: ${questionText}` : '',
            'Output wajib LaTeX. Teks biasa wajib memakai \\text{...}.'
          ].filter(Boolean).join('\n\n')
        },
        { inlineData: { data: cleanBase64, mimeType: normalizedMimeType } }
      ]
    });

    const parsed = safeJsonParse(result.text, (text) => ({ detectedAnswerLatex: text }));
    res.json({ ...normalizeTranscription(parsed, result.text), keyIndex: result.keyIndex, modelUsed: result.modelUsed });
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
      confirmedAnswerLatex,
      text,
      topicTags
    } = req.body;

    if (!questionText && !text && !imageBase64) {
      return res.status(400).json({ error: 'Kirim soal dan jawaban teks atau gambar canvas.' });
    }

    const { cleanBase64, normalizedMimeType } = validateImagePayload(imageBase64, mimeType);
    const confirmedLatex = String(confirmedAnswerLatex || text || '').trim();
    if (cleanBase64 && !confirmedLatex) {
      return res.status(400).json({ error: 'Konfirmasi hasil OCR terlebih dulu sebelum koreksi.' });
    }
    const parts = [
      {
        text: [
          'Evaluasi jawaban siswa sesuai SOP Gemini Canvas Redline dan kembalikan JSON sesuai schema.',
          questionId || problemId ? `ID soal: ${questionId || problemId}` : '',
          questionText ? `Soal: ${questionText}` : '',
          expectedAnswer ? `Jawaban acuan: ${expectedAnswer}` : '',
          Array.isArray(topicTags) && topicTags.length ? `Topik soal: ${topicTags.join(', ')}` : '',
          confirmedLatex ? `confirmedAnswerLatex:\n${confirmedLatex}` : '',
          text && text !== confirmedLatex ? `Teks jawaban siswa:\n${text}` : '',
          cleanBase64 ? 'Gambar canvas dilampirkan sebagai bukti visual.' : ''
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
      evaluation.detectedAnswerLatex || evaluation.detectedAnswerText,
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
    const user = getProfileUser(db, req.session.userId);
    const requestAttempts = Array.isArray(req.body?.attempts) && req.body.attempts.length
      ? req.body.attempts
      : null;
    const dbAttempts = loadRecentCorrectionAttempts(
      db,
      req.session.userId,
      PROFILE_RECOMMENDATION_ATTEMPT_LIMIT
    );
    const attempts = chooseProfileAttemptSource(dbAttempts, requestAttempts);
    const multipleChoiceEvidence = summarizeMultipleChoiceEvidence(
      loadMultipleChoiceEvidence(db, req.session.userId, PROFILE_MC_ATTEMPT_LIMIT)
    );

    if (!attempts.length && !multipleChoiceEvidence.patterns.length && !multipleChoiceEvidence.recentWrong.length) {
      return res.json({
        aiRefresh: serializeProfileAiRefreshState({ allowed: true, bypass: canBypassProfileAiCooldown(user), remainingMs: 0, availableAt: null }, false),
        summary: fallbackProfileFromAttempts([])
      });
    }

    const recommendationAttempts = compactAttemptsForProfile(attempts, PROFILE_RECOMMENDATION_ATTEMPT_LIMIT);
    const aiAttempts = compactAttemptsForProfile(attempts, PROFILE_AI_ATTEMPT_LIMIT);
    const deterministicSummary = buildDeterministicProfileSummary(recommendationAttempts);
    const refreshState = getProfileAiRefreshState(db, user, new Date());
    const aiEvidence = buildProfileAiEvidence({ aiAttempts, multipleChoiceEvidence });

    let result = null;
    if (refreshState.allowed) {
      try {
        result = await callProfileNarrativeSummary(aiEvidence);
        if (result && !refreshState.bypass) {
          recordProfileAiRefresh(db, req.session.userId, new Date());
        }
      } catch (error) {
        console.warn('Profile AI narrative provider failed:', error.message);
      }
    }

    if (!result) {
      return res.json({
        aiRefresh: serializeProfileAiRefreshState(refreshState, false),
        summary: deterministicSummary || fallbackProfileFromAttempts(recommendationAttempts)
      });
    }

    const parsed = safeJsonParse(result.text, (overallSummary) => ({ overallSummary }));
    const summary = mergeProfileSummaries(normalizeProfileSummary(parsed, result.text), deterministicSummary);

    res.json({
      aiRefresh: serializeProfileAiRefreshState(refreshState, true),
      keyIndex: result.keyIndex,
      modelUsed: result.modelUsed,
      provider: result.provider,
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
module.exports._profileSummaryInternals = {
  PROFILE_AI_ATTEMPT_LIMIT,
  PROFILE_AI_REFRESH_COOLDOWN_MS,
  PROFILE_MC_ATTEMPT_LIMIT,
  PROFILE_RECOMMENDATION_ATTEMPT_LIMIT,
  buildProfileAiEvidence,
  canBypassProfileAiCooldown,
  compactAttemptsForProfile,
  chooseProfileAttemptSource,
  getProfileAiRefreshState,
  loadRecentCorrectionAttempts,
  summarizeMultipleChoiceEvidence
};
