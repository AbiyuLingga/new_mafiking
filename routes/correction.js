const express = require('express');
const fs = require('fs');
const path = require('path');
const { isAuthenticated, requireRegisteredUser } = require('../middleware/auth');
const { isLocalAdminMode } = require('../middleware/admin');
const {
  buildRecommendationSummary,
  computeBktLite,
  computePerSkillHalfLifeLite,
  enrichWithCatalog,
  formatLearningSkillLabel,
  interleaveRecallSlots,
  loadMasteryStates,
} = require('../lib/recommendation-engine');
const { logTokenUsage } = require('../lib/log-token-usage');
const { sanitizeForPrompt } = require('../lib/text-sanitize');
const { callWithPool, isPoolAvailable } = require('../lib/multi-provider-pool');
const { isAnswerEquivalent } = require('../lib/answer-equivalence');
const { getLatencySummary, recordLatency } = require('../lib/latency-tracker');
const { simplifyGeminiSchema } = require('../lib/gemini-schema');

const router = express.Router();

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BASE64_CHARS = 10_000_000;
const GEMINI_FLASH_LITE_MODEL = 'gemini-3.1-flash-lite';
const GEMMA_PROFILE_MODEL = 'gemma-4-31b-it';
const TRANSCRIBE_MODELS = [
  GEMINI_FLASH_LITE_MODEL,
];
const EVALUATE_MODELS = [
  GEMINI_FLASH_LITE_MODEL,
];
const PROFILE_MODELS = [
  GEMMA_PROFILE_MODEL,
];
const PROFILE_AI_ATTEMPT_LIMIT = 20;
const PROFILE_RECOMMENDATION_ATTEMPT_LIMIT = 200;
const PROFILE_AI_REFRESH_COOLDOWN_MS = 60 * 60 * 1000;
const PROFILE_MC_ATTEMPT_LIMIT = 120;
const MAX_LEARNING_TAGS = 5;
const TRANSCRIBE_MAX_OUTPUT_TOKENS = 512;
const EVALUATE_MAX_OUTPUT_TOKENS = 2600;
const PROFILE_NARRATIVE_SOP = readProfileNarrativeSop();

const TRANSCRIBE_SYSTEM_PROMPT = [
  'Kamu adalah sistem OCR matematika untuk tulisan tangan siswa.',
  'Tugas saat ini hanya transkripsi canvas.',
  'Baca isi gambar dari atas ke bawah dan ubah ke LaTeX ringkas.',
  'Jangan mengoreksi jawaban, jangan memperbaiki langkah salah, dan jangan memberi skor.',
  'Balas hanya JSON valid sesuai schema.',
  'Semua field yang berisi teks untuk user harus berupa LaTeX.',
  'Semua teks biasa di dalam LaTeX wajib memakai \\text{...}.'
].join('\n\n');

const EVALUATE_SYSTEM_PROMPT = [
  'Kamu adalah guru matematika yang teliti dan ringkas.',
  'Tugas saat ini adalah mengevaluasi jawaban canvas yang transkripsinya sudah dikonfirmasi user.',
  'Gunakan confirmedAnswerLatex sebagai teks utama dan gambar canvas sebagai bukti visual.',
  'Jika teks dan gambar tidak konsisten, set needsResubmission true.',
  'Jika ada kesalahan, isi wrongSteps dan redlineTargets agar frontend dapat mengubah coretan salah menjadi merah.',
  'redlineTargets wajib menandai seluruh transisi/baris yang menjadi salah, bukan hanya token kecil. Contoh: jika siswa menulis 1+1=3, targetTextLatex dan boxPercent harus mencakup seluruh 1+1=3.',
  'Jika kesalahan terjadi karena hasil sebelum/sesudah transisi tidak konsisten, jadikan combinedBoxPercent area dari ekspresi lengkap yang harus dikoreksi.',
  'Maksimal 5 wrongSteps dan 5 redlineTargets. Pilih kesalahan utama, tetapi beri pembahasan yang cukup jelas.',
  'Untuk setiap wrongStep, isi issuePlain dan hintPlain masing-masing 1-2 kalimat pendek yang konkret.',
  'Untuk semua teks yang tampil ke user, sapa user langsung sebagai "Kamu"; jangan menyebut user sebagai "siswa".',
  'Jangan mengembalikan Markdown, HTML, atau code fence.',
  'Balas hanya JSON valid sesuai schema.',
  'strengthTags dan weaknessTags masing-masing maksimal 5 tag; pilih yang paling utama.',
  'Field berakhiran Latex harus berisi LaTeX yang pendek dan valid.',
  'Field berakhiran Plain harus berisi Bahasa Indonesia biasa tanpa Markdown, tanpa HTML, dan tanpa command LaTeX seperti \\text atau \\frac.',
  'Jangan menggabungkan narasi panjang menjadi satu ekspresi LaTeX; narasi panjang masuk ke fullFeedbackPlain, issuePlain, dan hintPlain.'
].join(' ');

const PROFILE_SYSTEM_PROMPT = [
  'Kamu wajib membaca dan mengikuti SOP Profile Summary berikut sebelum menjawab.',
  PROFILE_NARRATIVE_SOP,
  'strengths dan weaknesses masing-masing maksimal 5 tag; pilih yang paling utama.',
  'Balas hanya JSON valid sesuai schema: strengths, weaknesses, recommendedQuestions, overallSummary. Jangan Markdown, jangan code fence, jangan properti tambahan.'
].join('\n\n');

const MERGED_SYSTEM_PROMPT = [
  'Kamu adalah guru matematika yang teliti dan ringkas. Tugasmu dalam 1 langkah:',
  '1. BACA gambar canvas tulisan tangan siswa dan transkripsikan ke LaTeX ringkas.',
  '2. EVALUASI jawaban tersebut terhadap soal dan jawaban acuan yang diberikan.',
  '3. KEMBALIKAN JSON valid sesuai schema dengan field transcription dan evaluation.',
  '',
  'ATURAN OCR:',
  '- Baca isi gambar dari atas ke bawah dan ubah ke LaTeX ringkas.',
  '- Jangan mengoreksi jawaban, jangan memperbaiki langkah salah, dan jangan memberi skor.',
  '- Semua field yang berisi teks untuk user harus berupa LaTeX.',
  '- Semua teks biasa di dalam LaTeX wajib memakai \\text{...}.',
  '- Jika tulisan tidak terbaca, isi readingConfidence rendah dan masukkan bagian yang tidak terbaca ke unclearParts.',
  '',
  'ATURAN EVALUASI:',
  '- Gunakan detectedAnswerLatex dari transcription sebagai teks utama dan gambar canvas sebagai bukti visual.',
  '- Jika teks dan gambar tidak konsisten, set needsResubmission true.',
  '- Jika ada kesalahan, isi wrongSteps dan redlineTargets agar frontend dapat mengubah coretan salah menjadi merah.',
  '- redlineTargets wajib menandai seluruh transisi/baris yang menjadi salah, bukan hanya token kecil. Contoh: jika siswa menulis 1+1=3, targetTextLatex dan boxPercent harus mencakup seluruh 1+1=3.',
  '- Jika kesalahan terjadi karena hasil sebelum/sesudah transisi tidak konsisten, jadikan combinedBoxPercent area dari ekspresi lengkap yang harus dikoreksi.',
  '- Maksimal 5 wrongSteps dan 5 redlineTargets. Pilih kesalahan utama, tetapi beri pembahasan yang cukup jelas.',
  '- Untuk setiap wrongStep, isi issuePlain dan hintPlain masing-masing 1-2 kalimat pendek yang konkret.',
  '- Untuk semua teks yang tampil ke user, sapa user langsung sebagai "Kamu"; jangan menyebut user sebagai "siswa".',
  '- Jangan mengembalikan Markdown, HTML, atau code fence.',
  '- strengthTags dan weaknessTags masing-masing maksimal 5 tag; pilih yang paling utama.',
  '- Field berakhiran Latex harus berisi LaTeX yang pendek dan valid.',
  '- Field berakhiran Plain harus berisi Bahasa Indonesia biasa tanpa Markdown, tanpa HTML, dan tanpa command LaTeX seperti \\text atau \\frac.',
  '- Jangan menggabungkan narasi panjang menjadi satu ekspresi LaTeX; narasi panjang masuk ke fullFeedbackPlain, issuePlain, dan hintPlain.'
].join(' ');

const EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    isCorrect: { type: 'boolean' },
    score: { type: 'integer' },
    detectedAnswerText: { type: 'string' },
    detectedAnswerLatex: { type: 'string' },
    needsResubmission: { type: 'boolean' },
    wrongSteps: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          stepNumber: { type: 'string' },
          previousStep: { type: 'string' },
          studentStep: { type: 'string' },
          studentStepLatex: { type: 'string' },
          studentStepPlain: { type: 'string' },
          correctStepLatex: { type: 'string' },
          correctStepPlain: { type: 'string' },
          issue: { type: 'string' },
          issueLatex: { type: 'string' },
          issuePlain: { type: 'string' },
          hint: { type: 'string' },
          hintLatex: { type: 'string' },
          hintPlain: { type: 'string' },
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
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          stepNumber: { type: 'string' },
          targetTextLatex: {
            type: 'string',
            description: 'Seluruh ekspresi/baris yang harus berubah merah, bukan hanya karakter terakhir yang salah.'
          },
          reasonLatex: { type: 'string' },
          boxPercent: {
            ...boxSchema(),
            description: 'Area persen yang mencakup seluruh ekspresi/baris salah. Untuk 1+1=3, kotak harus mencakup 1+1=3 penuh.'
          },
          severity: { type: 'string' }
        },
        required: ['stepNumber', 'targetTextLatex', 'reasonLatex', 'boxPercent', 'severity']
      }
    },
    fullFeedback: { type: 'string' },
    fullFeedbackLatex: { type: 'string' },
    fullFeedbackPlain: { type: 'string' },
    strengthTags: { type: 'array', items: { type: 'string' }, maxItems: MAX_LEARNING_TAGS },
    weaknessTags: { type: 'array', items: { type: 'string' }, maxItems: MAX_LEARNING_TAGS }
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
    strengths: { type: 'array', items: { type: 'string' }, maxItems: MAX_LEARNING_TAGS },
    weaknesses: { type: 'array', items: { type: 'string' }, maxItems: MAX_LEARNING_TAGS },
    recommendedQuestions: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    overallSummary: { type: 'string' }
  },
  required: ['strengths', 'weaknesses', 'recommendedQuestions', 'overallSummary']
};

const MERGED_EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    transcription: {
      type: 'object',
      properties: {
        detectedAnswerLatex: { type: 'string' },
        readingConfidence: { type: 'number', minimum: 0, maximum: 1 },
        unclearParts: { type: 'array', items: { type: 'string' } },
        needsUserConfirmation: { type: 'boolean' }
      },
      required: ['detectedAnswerLatex', 'readingConfidence', 'unclearParts', 'needsUserConfirmation']
    },
    evaluation: {
      type: 'object',
      properties: {
        isCorrect: { type: 'boolean' },
        score: { type: 'integer' },
        detectedAnswerText: { type: 'string' },
        detectedAnswerLatex: { type: 'string' },
        needsResubmission: { type: 'boolean' },
        wrongSteps: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              stepNumber: { type: 'string' },
              previousStep: { type: 'string' },
              studentStep: { type: 'string' },
              studentStepLatex: { type: 'string' },
              studentStepPlain: { type: 'string' },
              correctStepLatex: { type: 'string' },
              correctStepPlain: { type: 'string' },
              issue: { type: 'string' },
              issueLatex: { type: 'string' },
              issuePlain: { type: 'string' },
              hint: { type: 'string' },
              hintLatex: { type: 'string' },
              hintPlain: { type: 'string' },
              wrongPartBoxPercent: boxSchema(),
              wrongBoxPercent: boxSchema(),
              combinedBoxPercent: boxSchema()
            }
          }
        },
        redlineTargets: {
          type: 'array',
          maxItems: 5,
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
        fullFeedbackPlain: { type: 'string' },
        strengthTags: { type: 'array', items: { type: 'string' }, maxItems: MAX_LEARNING_TAGS },
        weaknessTags: { type: 'array', items: { type: 'string' }, maxItems: MAX_LEARNING_TAGS }
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
        'strengthTags',
        'weaknessTags'
      ]
    }
  },
  required: ['transcription', 'evaluation']
};

function boxSchema() {
  return {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' }
    }
  };
}

function readProfileNarrativeSop() {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'SOP-PROFILE-SUMMARY.md'), 'utf8');
  } catch {
    return [
      'SOP Profile Summary:',
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

function getProfileModels(base) {
  const env = (process.env.GEMMA_PROFILE_MODELS || process.env.GEMMA_PROFILE_MODEL || '')
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

function parsePositiveId(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id < 1e15 ? id : null;
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

const JSON_PARSE_FAILED = Symbol('json-parse-failed');

function cleanJsonText(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonObjectText(text) {
  const cleaned = cleanJsonText(text);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return '';
  return cleaned.slice(start, end + 1);
}

function parseJsonCandidate(candidate) {
  let current = candidate;
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed !== 'string') return parsed;
      current = parsed.trim();
    } catch {
      return JSON_PARSE_FAILED;
    }
  }
  return JSON_PARSE_FAILED;
}

function safeJsonParse(text, fallback) {
  const cleaned = cleanJsonText(text);
  const candidates = [cleaned, extractJsonObjectText(cleaned)].filter(Boolean);
  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed !== JSON_PARSE_FAILED) return parsed;
  }
  return fallback(cleaned);
}

function fallbackTranscriptionFromText(text) {
  const cleaned = cleanJsonText(text);
  const detectedMatch = cleaned.match(/"detectedAnswerLatex"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (detectedMatch) {
    try {
      return { detectedAnswerLatex: JSON.parse(`"${detectedMatch[1]}"`) };
    } catch {
      return { detectedAnswerLatex: detectedMatch[1] };
    }
  }
  return { detectedAnswerLatex: cleaned };
}

function safeTranscriptionParse(text) {
  const parsed = safeJsonParse(text, fallbackTranscriptionFromText);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  return fallbackTranscriptionFromText(text);
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

function stripLatexToPlain(value) {
  let text = String(value || '').trim();
  if (!text) return '';

  text = text
    .replace(/\\\[|\\\]/g, '')
    .replace(/\$\$/g, '')
    .replace(/^\s*\$|\$\s*$/g, '');

  for (let i = 0; i < 6; i += 1) {
    const next = text
      .replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|mbox)\{([^{}]*)\}/g, '$1')
      .replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');
    if (next === text) break;
    text = next;
  }

  text = text
    .replace(/\\,/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\\!/g, '')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq|\\ne/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\int/g, '∫')
    .replace(/\\infty/g, '∞')
    .replace(/\\ln/g, 'ln')
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\tan/g, 'tan')
    .replace(/\\log/g, 'log')
    .replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function normalizeLearningTags(value, limit = MAX_LEARNING_TAGS) {
  return Array.from(new Set(
    normalizeStringArray(value)
      .map(formatLearningSkillLabel)
      .filter(Boolean)
  )).slice(0, limit);
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
    hint: addressUserDirectly(step.hintPlain || step.hint || stripLatexToPlain(step.hintLatex) || ''),
    hintLatex: addressUserDirectly(step.hintLatex || step.hint || ''),
    hintPlain: addressUserDirectly(step.hintPlain || stripLatexToPlain(step.hint || step.hintLatex) || ''),
    issue: addressUserDirectly(step.issuePlain || step.issue || stripLatexToPlain(step.issueLatex) || ''),
    issueLatex: addressUserDirectly(step.issueLatex || step.issue || ''),
    issuePlain: addressUserDirectly(step.issuePlain || stripLatexToPlain(step.issue || step.issueLatex) || ''),
    previousStep: String(step.previousStep || ''),
    stepNumber: String(step.stepNumber || ''),
    studentStep: String(step.studentStepPlain || step.studentStep || stripLatexToPlain(step.studentStepLatex) || ''),
    studentStepLatex: String(step.studentStepLatex || step.studentStep || ''),
    studentStepPlain: String(step.studentStepPlain || stripLatexToPlain(step.studentStep || step.studentStepLatex) || ''),
    correctStepLatex: String(step.correctStepLatex || ''),
    correctStepPlain: String(step.correctStepPlain || stripLatexToPlain(step.correctStepLatex) || ''),
    wrongBoxPercent: normalizeBox(step.wrongBoxPercent),
    wrongPartBoxPercent: normalizeBox(step.wrongPartBoxPercent)
  })) : [];
  const redlineTargets = Array.isArray(raw.redlineTargets) ? raw.redlineTargets.map((target) => ({
    boxPercent: normalizeBox(target.boxPercent),
    reasonLatex: addressUserDirectly(target.reasonLatex || ''),
    severity: String(target.severity || 'error'),
    stepNumber: String(target.stepNumber || ''),
    targetTextLatex: String(target.targetTextLatex || '')
  })) : [];
  const fullFeedbackLatex = addressUserDirectly(raw.fullFeedbackLatex || raw.fullFeedback || sourceText || 'Koreksi selesai, tetapi respons AI belum rapi.');
  const fullFeedbackPlain = addressUserDirectly(
    raw.fullFeedbackPlain ||
    raw.fullFeedbackText ||
    stripLatexToPlain(raw.fullFeedback || fullFeedbackLatex) ||
    'Koreksi selesai.'
  );

  return {
    detectedAnswerText: String(raw.detectedAnswerText || ''),
    detectedAnswerLatex: String(raw.detectedAnswerLatex || raw.detectedAnswerText || ''),
    fullFeedback: fullFeedbackPlain,
    fullFeedbackLatex,
    fullFeedbackPlain,
    isCorrect,
    needsResubmission: normalizeBoolean(raw.needsResubmission),
    raw: sourceText,
    redlineTargets,
    score: raw.score == null && isCorrect ? 100 : clampScore(raw.score),
    strengthTags: normalizeLearningTags(raw.strengthTags),
    weaknessTags: normalizeLearningTags(raw.weaknessTags),
    wrongSteps
  };
}

function addressUserDirectly(text) {
  return String(text || '')
    .replace(/\bSiswa\b/g, 'Kamu')
    .replace(/\bsiswa\b/g, 'kamu');
}

function normalizeProfileSummary(raw, sourceText) {
  return {
    overallSummary: String(raw.overallSummary || sourceText || 'Ringkasan belajar belum tersedia.'),
    recommendedItems: normalizeRecommendedItems(raw.recommendedItems),
    recommendedQuestions: normalizeStringArray(raw.recommendedQuestions).slice(0, 5),
    skillNeedScores: normalizeSkillNeedScores(raw.skillNeedScores),
    strengths: normalizeLearningTags(raw.strengths),
    weaknesses: normalizeLearningTags(raw.weaknesses)
  };
}

function limitProfileSummaryTags(summary) {
  if (!summary || typeof summary !== 'object') return summary;
  return {
    ...summary,
    strengths: normalizeLearningTags(summary.strengths),
    weaknesses: normalizeLearningTags(summary.weaknesses)
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

function extractGeneratedText(response) {
  const directText = typeof response?.text === 'function' ? response.text() : response?.text;
  if (String(directText || '').trim()) return String(directText || '');

  const parts = Array.isArray(response?.candidates?.[0]?.content?.parts)
    ? response.candidates[0].content.parts
    : [];
  return parts
    .filter((part) => part && !part.thought && part.text)
    .map((part) => part.text)
    .join('');
}

async function callGeminiWithFallback({ maxOutputTokens, models, parts, provider = 'gemini', schema, systemInstruction, db }) {
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
        const startedAt = Date.now();
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            ...(maxOutputTokens ? { maxOutputTokens } : {}),
            responseJsonSchema: simplifyGeminiSchema(schema),
            responseMimeType: 'application/json',
            systemInstruction,
            temperature: 0.1
          }
        });

        const text = extractGeneratedText(response);
        const usageMetadata = response.usageMetadata || {};
        const geminiKeyIndex = keyIndex + 1;
        logTokenUsage(db, {
          provider,
          model,
          keyName: `GEMINI_KEY_${geminiKeyIndex}`,
          tokensUsed: usageMetadata.totalTokenCount
        });
        return {
          durationMs: Date.now() - startedAt,
          keyIndex: geminiKeyIndex,
          modelUsed: model,
          text: String(text || ''),
          usageMetadata
        };
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

async function callAiWithPoolFallback({
  db,
  legacyModels,
  legacyProvider = 'gemini',
  maxOutputTokens,
  parts,
  poolProvider = 'auto',
  schema,
  systemInstruction,
  temperature,
}) {
  if (isPoolAvailable()) {
    return callWithPool({
      db,
      maxOutputTokens,
      parts,
      provider: poolProvider,
      schema,
      systemInstruction,
      temperature,
    });
  }

  const legacyResult = await callGeminiWithFallback({
    db,
    maxOutputTokens,
    models: legacyModels,
    parts,
    provider: legacyProvider,
    schema,
    systemInstruction,
  });
  return { ...legacyResult, provider: legacyProvider };
}

async function callProfileNarrativeSummary(attempts, db) {
  try {
    const result = await callAiWithPoolFallback({
      systemInstruction: PROFILE_SYSTEM_PROMPT,
      schema: PROFILE_SCHEMA,
      maxOutputTokens: 1200,
      temperature: 0.2,
      db,
      poolProvider: 'gemini',
      legacyModels: getProfileModels(PROFILE_MODELS),
      legacyProvider: 'gemma',
      parts: [{ text: `Buat raport belajar dari data berikut:\n\n${JSON.stringify(attempts)}` }],
    });

    return {
      keyIndex: result.keyIndex,
      modelUsed: result.modelUsed,
      provider: result.provider,
      text: result.text,
    };
  } catch (error) {
    console.warn('Profile AI narrative via pool failed:', error.message);
    return null;
  }
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
      strengthTags: normalizeLearningTags(attempt.strengthTags || evaluation.strengthTags),
      weaknessTags: normalizeLearningTags(attempt.weaknessTags || evaluation.weaknessTags),
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
    return { allowed: false, bypass: false, remainingMs: PROFILE_AI_REFRESH_COOLDOWN_MS, availableAt: null, cachedSummary: null };
  }

  const row = db.prepare('SELECT last_ai_refresh_at, cached_summary FROM profile_ai_refreshes WHERE user_id = ?').get(user.id);
  const cachedSummary = row?.cached_summary ? safeJsonParse(row.cached_summary, () => null) : null;

  if (canBypassProfileAiCooldown(user)) {
    return { allowed: true, bypass: true, remainingMs: 0, availableAt: null, cachedSummary };
  }

  if (!row?.last_ai_refresh_at) {
    return { allowed: true, bypass: false, remainingMs: 0, availableAt: null, cachedSummary };
  }

  const lastAt = new Date(row.last_ai_refresh_at);
  const availableAt = new Date(lastAt.getTime() + PROFILE_AI_REFRESH_COOLDOWN_MS);
  const remainingMs = availableAt.getTime() - now.getTime();
  return {
    allowed: remainingMs <= 0,
    bypass: false,
    remainingMs: Math.max(0, remainingMs),
    availableAt: availableAt.toISOString(),
    cachedSummary
  };
}

function recordProfileAiRefresh(db, userId, summary, now = new Date()) {
  db.prepare(`
    INSERT INTO profile_ai_refreshes (user_id, last_ai_refresh_at, cached_summary)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      last_ai_refresh_at = excluded.last_ai_refresh_at,
      cached_summary = excluded.cached_summary
  `).run(userId, now.toISOString(), summary ? JSON.stringify(summary) : null);
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
      p.subtopic_id,
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
        skillId: row.subtopic_id,
        subtopicId: row.subtopic_id,
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

function buildMasteryHistory(masteryState) {
  return (masteryState?.attempts || [])
    .map((attempt) => ({
      correct: attempt.correct,
      createdAt: attempt.createdAt,
      skillId: attempt.subtopicId,
    }))
    .filter((attempt) => attempt.skillId != null);
}

function enrichProfileSummaryRecommendations(db, userId, attempts, multipleChoiceEvidence, summary, masteryContext) {
  const enrichedSummary = enrichWithDbProblems(db, userId, attempts, multipleChoiceEvidence, summary);
  if (!enrichedSummary || !Array.isArray(enrichedSummary.recommendedItems)) return enrichedSummary;

  const enrichedItems = enrichWithCatalog(enrichedSummary.recommendedItems, {
    halfLives: masteryContext?.halfLives || {},
    mastery: masteryContext?.mastery || {},
    mcEvidence: multipleChoiceEvidence?.recentWrong || [],
    now: masteryContext?.now || new Date(),
  });
  enrichedSummary.recommendedItems = interleaveRecallSlots(enrichedItems, { every: 3 });
  return enrichedSummary;
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

router.post('/transcribe', isAuthenticated, requireRegisteredUser, async (req, res) => {
  res.set('X-Deprecated', 'Use /evaluate with imageBase64 instead (merged flow)');
  try {
    const { imageBase64, mimeType, questionText } = req.body;
    const { cleanBase64, normalizedMimeType } = validateImagePayload(imageBase64, mimeType);
    if (!cleanBase64) return res.status(400).json({ error: 'imageBase64 wajib dikirim.' });

    const sanitizedQuestion = sanitizeForPrompt(questionText);
    if (sanitizedQuestion.truncated) {
      console.warn('[correction] transcribe: questionText truncated from', sanitizedQuestion.originalLength, 'to', sanitizedQuestion.sanitizedLength, 'chars');
    }

    const result = await callAiWithPoolFallback({
      maxOutputTokens: TRANSCRIBE_MAX_OUTPUT_TOKENS,
      legacyModels: getGeminiModels(TRANSCRIBE_MODELS),
      schema: TRANSCRIPTION_SCHEMA,
      systemInstruction: TRANSCRIBE_SYSTEM_PROMPT,
      db: req.app.locals.db,
      parts: [
        {
          text: [
            'Transkripsikan isi gambar jawaban berikut sesuai SOP.',
            sanitizedQuestion.text ? `Soal: ${sanitizedQuestion.text}` : '',
            'Output wajib LaTeX. Teks biasa wajib memakai \\text{...}.'
          ].filter(Boolean).join('\n\n')
        },
        { inlineData: { data: cleanBase64, mimeType: normalizedMimeType } }
      ]
    });

    const parsed = safeTranscriptionParse(result.text);
    res.json({ ...normalizeTranscription(parsed, result.text), durationMs: result.durationMs, keyIndex: result.keyIndex, modelUsed: result.modelUsed, provider: result.provider });
  } catch (error) {
    res.status(error.status ?? error.response?.status ?? 500).json({
      error: error.message || 'Gagal membaca gambar.',
      attempts: error.attempts
    });
  }
});

function estimateBase64Bytes(cleanBase64) {
  const text = String(cleanBase64 || '');
  if (!text) return 0;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((text.length * 3) / 4) - padding);
}

function isFastPathEnabled() {
  const raw = String(process.env.MAFIKING_FAST_PATH_ENABLED || '').trim().toLowerCase();
  return raw === '' || raw === 'true' || raw === '1' || raw === 'yes';
}

function applyFastPathIfEquivalent(parsed, expectedAnswer) {
  if (!isFastPathEnabled() || !parsed || !expectedAnswer) return { parsed, fastPath: false };
  const detected = parsed.transcription?.detectedAnswerLatex
    || parsed.evaluation?.detectedAnswerLatex
    || parsed.detectedAnswerLatex
    || '';
  if (!detected || !isAnswerEquivalent(detected, expectedAnswer)) return { parsed, fastPath: false };
  if (!parsed.transcription && !parsed.evaluation) {
    return {
      parsed: {
        ...parsed,
        detectedAnswerLatex: parsed.detectedAnswerLatex || detected,
        detectedAnswerText: parsed.detectedAnswerText || detected,
        fullFeedback: 'Jawaban Anda benar.',
        fullFeedbackLatex: '\\text{Jawaban Anda benar.}',
        fullFeedbackPlain: 'Jawaban Anda benar.',
        isCorrect: true,
        needsResubmission: false,
        redlineTargets: [],
        score: 100,
        weaknessTags: [],
        wrongSteps: [],
      },
      fastPath: true,
    };
  }
  const next = {
    ...parsed,
    evaluation: {
      ...(parsed.evaluation || {}),
      detectedAnswerLatex: parsed.evaluation?.detectedAnswerLatex || detected,
      detectedAnswerText: parsed.evaluation?.detectedAnswerText || detected,
      fullFeedback: 'Jawaban Anda benar.',
      fullFeedbackLatex: '\\text{Jawaban Anda benar.}',
      fullFeedbackPlain: 'Jawaban Anda benar.',
      isCorrect: true,
      needsResubmission: false,
      redlineTargets: [],
      score: 100,
      weaknessTags: [],
      wrongSteps: [],
    },
  };
  return { parsed: next, fastPath: true };
}

function insertCorrectionAttempt(db, { evaluation, expectedAnswer, problemId, questionText, resultText, transcription, userId }) {
  const feedback = evaluation.fullFeedback;
  db.prepare(`
    INSERT INTO correction_attempts (
      user_id, problem_id, mode, question_text, expected_answer, detected_answer_text,
      score, is_correct, feedback, strength_tags, weakness_tags, evaluation_json
    )
    VALUES (?, ?, 'canvas', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    problemId,
    String(questionText || ''),
    String(expectedAnswer || ''),
    evaluation.detectedAnswerLatex || evaluation.detectedAnswerText,
    evaluation.score,
    evaluation.isCorrect ? 1 : 0,
    feedback,
    JSON.stringify(evaluation.strengthTags),
    JSON.stringify(evaluation.weaknessTags),
    JSON.stringify(transcription ? { ...evaluation, transcription } : evaluation)
  );
  return feedback || resultText || '';
}

async function buildEvaluationResponse(req, { requestStartedAt = Date.now(), sendEvent } = {}) {
  const {
    expectedAnswer,
    imageBase64,
    imageDimension,
    mimeType,
    problemId,
    questionId,
    questionText,
    confirmedAnswerLatex,
    text,
    topicTags
  } = req.body;

  const { cleanBase64, normalizedMimeType } = validateImagePayload(imageBase64, mimeType);
  if (!questionText && !text && !imageBase64) {
    const error = new Error('Kirim soal dan jawaban teks atau gambar canvas.');
    error.status = 400;
    throw error;
  }
  const confirmedLatex = String(confirmedAnswerLatex || text || '').trim();

  const safeQuestionId = parsePositiveId(questionId);
  const safeProblemId = parsePositiveId(problemId);
  const safeIdForPrompt = safeQuestionId || safeProblemId;
  if ((questionId !== undefined && safeQuestionId === null)
      || (problemId !== undefined && safeProblemId === null)) {
    const error = new Error('ID soal tidak valid.');
    error.status = 400;
    throw error;
  }

  const sanitized = {
    questionText: sanitizeForPrompt(questionText),
    expectedAnswer: sanitizeForPrompt(expectedAnswer),
    confirmedAnswerLatex: sanitizeForPrompt(confirmedAnswerLatex),
    text: sanitizeForPrompt(text),
  };
  const truncatedFields = Object.entries(sanitized)
    .filter(([, value]) => value.truncated)
    .map(([key]) => key);
  if (truncatedFields.length) {
    console.warn('[correction] evaluate: prompt fields truncated:', truncatedFields.join(', '));
  }

  const safeTopicTags = Array.isArray(topicTags)
    ? topicTags.filter((tag) => typeof tag === 'string' && tag.length > 0).map((tag) => sanitizeForPrompt(tag, { maxChars: 64 }).text)
    : [];
  const useMergedFlow = Boolean(cleanBase64) && !confirmedLatex;

  let schema, systemInstruction, maxOutputTokens, parts;
  if (useMergedFlow) {
    schema = MERGED_EVALUATION_SCHEMA;
    systemInstruction = MERGED_SYSTEM_PROMPT;
    maxOutputTokens = 3200;
    parts = [
      {
        text: [
          'Evaluasi jawaban siswa sesuai SOP Mafiking Canvas (merged flow: OCR + evaluasi dalam 1 langkah).',
          safeIdForPrompt ? `ID soal: ${safeIdForPrompt}` : '',
          sanitized.questionText.text ? `Soal: ${sanitized.questionText.text}` : '',
          sanitized.expectedAnswer.text ? `Jawaban acuan: ${sanitized.expectedAnswer.text}` : '',
          safeTopicTags.length ? `Topik soal: ${safeTopicTags.join(', ')}` : '',
          'Baca gambar canvas, transkripsikan ke LaTeX, lalu evaluasi terhadap soal dan jawaban acuan.',
          'Kembalikan JSON dengan field transcription dan evaluation.'
        ].filter(Boolean).join('\n\n')
      },
      { inlineData: { data: cleanBase64, mimeType: normalizedMimeType } }
    ];
  } else {
    schema = EVALUATION_SCHEMA;
    systemInstruction = EVALUATE_SYSTEM_PROMPT;
    maxOutputTokens = EVALUATE_MAX_OUTPUT_TOKENS;
    parts = [
      {
        text: [
          'Evaluasi jawaban siswa sesuai SOP Gemini Canvas Redline dan kembalikan JSON sesuai schema.',
          safeIdForPrompt ? `ID soal: ${safeIdForPrompt}` : '',
          sanitized.questionText.text ? `Soal: ${sanitized.questionText.text}` : '',
          sanitized.expectedAnswer.text ? `Jawaban acuan: ${sanitized.expectedAnswer.text}` : '',
          safeTopicTags.length ? `Topik soal: ${safeTopicTags.join(', ')}` : '',
          sanitized.confirmedAnswerLatex.text ? `confirmedAnswerLatex:\n${sanitized.confirmedAnswerLatex.text}` : '',
          sanitized.text.text && sanitized.text.text !== sanitized.confirmedAnswerLatex.text
            ? `Teks jawaban siswa:\n${sanitized.text.text}`
            : '',
          cleanBase64 ? 'Gambar canvas dilampirkan sebagai bukti visual.' : ''
        ].filter(Boolean).join('\n\n')
      }
    ];
    if (cleanBase64) parts.push({ inlineData: { data: cleanBase64, mimeType: normalizedMimeType } });
  }

  if (sendEvent) sendEvent('phase', { phase: 'reading', message: 'Membaca canvas...' });
  if (sendEvent) sendEvent('phase', { phase: 'evaluating', message: 'Mengevaluasi jawaban...' });

  const result = await callAiWithPoolFallback({
    maxOutputTokens,
    legacyModels: getGeminiModels(EVALUATE_MODELS),
    schema,
    systemInstruction,
    db: req.app.locals.db,
    parts,
  });

  const db = req.app.locals.db;
  const normalizedProblemId = safeProblemId || safeQuestionId;
  let response;
  let fastPath = false;

  if (useMergedFlow) {
    const parsedBase = safeJsonParse(result.text, () => ({
      transcription: { detectedAnswerLatex: '', readingConfidence: 0, unclearParts: [], needsUserConfirmation: false },
      evaluation: { isCorrect: false, score: 0, fullFeedback: 'AI response invalid.' },
    }));
    const fastPathResult = applyFastPathIfEquivalent(parsedBase, sanitized.expectedAnswer.text);
    const parsed = fastPathResult.parsed;
    fastPath = fastPathResult.fastPath;
    if (fastPath && sendEvent) sendEvent('phase', { phase: 'fast-path', message: 'Jawaban cocok dengan kunci.' });

    const transcription = parsed.transcription || {};
    const evaluation = normalizeEvaluation(parsed.evaluation || {}, result.text);
    const feedback = insertCorrectionAttempt(db, {
      evaluation,
      expectedAnswer,
      problemId: normalizedProblemId,
      questionText,
      resultText: result.text,
      transcription,
      userId: req.session.userId,
    });

    response = {
      merged: true,
      transcription: normalizeTranscription(transcription, result.text),
      evaluation,
      feedback,
      durationMs: result.durationMs,
      keyIndex: result.keyIndex,
      modelUsed: result.modelUsed,
      provider: result.provider,
      cached: Boolean(result.cached),
      fastPath,
      queueWaitMs: result.queueWaitMs || 0,
    };
  } else {
    const parsedBase = safeJsonParse(result.text, (fullFeedback) => ({ fullFeedback, isCorrect: false, score: 0 }));
    const fastPathResult = applyFastPathIfEquivalent(parsedBase, sanitized.expectedAnswer.text);
    const parsed = fastPathResult.parsed;
    fastPath = fastPathResult.fastPath;
    if (fastPath && sendEvent) sendEvent('phase', { phase: 'fast-path', message: 'Jawaban cocok dengan kunci.' });

    const evaluation = normalizeEvaluation(parsed, result.text);
    const feedback = insertCorrectionAttempt(db, {
      evaluation,
      expectedAnswer,
      problemId: normalizedProblemId,
      questionText,
      resultText: result.text,
      userId: req.session.userId,
    });

    response = {
      merged: false,
      evaluation,
      feedback,
      durationMs: result.durationMs,
      keyIndex: result.keyIndex,
      modelUsed: result.modelUsed,
      provider: result.provider,
      cached: Boolean(result.cached),
      fastPath,
      queueWaitMs: result.queueWaitMs || 0,
    };
  }

  recordLatency(db, {
    userId: req.session.userId,
    problemId: normalizedProblemId,
    provider: response.provider,
    keyIndex: response.keyIndex,
    modelUsed: response.modelUsed,
    imageDimension,
    imageBytes: estimateBase64Bytes(cleanBase64),
    aiDurationMs: response.durationMs,
    totalDurationMs: Date.now() - requestStartedAt,
    cacheHit: response.cached,
    fastPath,
    isCorrect: response.evaluation?.isCorrect,
    queueWaitMs: response.queueWaitMs,
    status: 'success',
  });

  return response;
}

router.post('/evaluate', isAuthenticated, requireRegisteredUser, async (req, res) => {
  try {
    res.json(await buildEvaluationResponse(req, { requestStartedAt: Date.now() }));
  } catch (error) {
    res.status(error.status ?? error.response?.status ?? 500).json({
      error: error.message || 'Gagal mengevaluasi jawaban.',
      attempts: error.attempts
    });
  }
});

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
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 10000);

  try {
    const result = await buildEvaluationResponse(req, { requestStartedAt: Date.now(), sendEvent });
    sendEvent('result', result);
  } catch (error) {
    sendEvent('error', { message: error.message || 'Gagal mengevaluasi jawaban.', attempts: error.attempts });
  } finally {
    clearInterval(heartbeat);
    res.end();
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
    const now = new Date();
    const masteryState = loadMasteryStates(db, req.session.userId);
    const masteryHistory = buildMasteryHistory(masteryState);
    const masteryContext = {
      halfLives: computePerSkillHalfLifeLite(masteryHistory),
      mastery: computeBktLite(masteryHistory).mastery,
      now,
    };

    if (!attempts.length && !multipleChoiceEvidence.patterns.length && !multipleChoiceEvidence.recentWrong.length) {
      return res.json({
        aiRefresh: serializeProfileAiRefreshState({ allowed: true, bypass: canBypassProfileAiCooldown(user), remainingMs: 0, availableAt: null }, false),
        summary: fallbackProfileFromAttempts([])
      });
    }

    const recommendationAttempts = compactAttemptsForProfile(attempts, PROFILE_RECOMMENDATION_ATTEMPT_LIMIT);
    const aiAttempts = compactAttemptsForProfile(attempts, PROFILE_AI_ATTEMPT_LIMIT);
    const deterministicSummary = buildDeterministicProfileSummary(recommendationAttempts);
    const forceRefresh = Boolean(req.body?.forceRefresh);
    const refreshState = getProfileAiRefreshState(db, user, now);

    if (!forceRefresh && refreshState.cachedSummary) {
      const cachedSummary = enrichProfileSummaryRecommendations(
        db,
        req.session.userId,
        attempts,
        multipleChoiceEvidence,
        refreshState.cachedSummary,
        masteryContext
      );
      return res.json({
        aiRefresh: serializeProfileAiRefreshState(refreshState, false),
        summary: limitProfileSummaryTags(cachedSummary)
      });
    }

    const shouldCallAi = refreshState.allowed || forceRefresh;

    let result = null;
    if (shouldCallAi) {
      try {
        const aiEvidence = buildProfileAiEvidence({ aiAttempts, multipleChoiceEvidence });
        result = await callProfileNarrativeSummary(aiEvidence, db);
      } catch (error) {
        console.warn('Profile AI narrative provider failed:', error.message);
      }
    }

    let summary;
    if (!result) {
      let finalSummary = deterministicSummary || fallbackProfileFromAttempts(recommendationAttempts);
      summary = limitProfileSummaryTags(enrichProfileSummaryRecommendations(db, req.session.userId, attempts, multipleChoiceEvidence, finalSummary, masteryContext));
    } else {
      const parsed = safeJsonParse(result.text, (overallSummary) => ({ overallSummary }));
      let merged = mergeProfileSummaries(normalizeProfileSummary(parsed, result.text), deterministicSummary);
      summary = limitProfileSummaryTags(enrichProfileSummaryRecommendations(db, req.session.userId, attempts, multipleChoiceEvidence, merged, masteryContext));
    }

    if (shouldCallAi || !refreshState.cachedSummary) {
      recordProfileAiRefresh(db, req.session.userId, summary, now);
      refreshState.remainingMs = PROFILE_AI_REFRESH_COOLDOWN_MS;
      refreshState.availableAt = new Date(Date.now() + PROFILE_AI_REFRESH_COOLDOWN_MS).toISOString();
    }

    res.json({
      aiRefresh: serializeProfileAiRefreshState(refreshState, true),
      keyIndex: result?.keyIndex,
      modelUsed: result?.modelUsed,
      provider: result?.provider,
      summary
    });
  } catch (error) {
    res.status(error.status ?? error.response?.status ?? 500).json({
      error: error.message || 'Gagal membuat ringkasan profil.',
      attempts: error.attempts
    });
  }
});

function enrichWithDbProblems(db, userId, attempts, multipleChoiceEvidence, summary) {
  if (!summary) return summary;

  const wrongProblemIds = attempts
    .filter(a => a.isCorrect === false || (a.score != null && a.score < 80))
    .map(a => a.problemId)
    .filter(Boolean);

  if (multipleChoiceEvidence && multipleChoiceEvidence.recentWrong) {
    multipleChoiceEvidence.recentWrong.forEach(r => {
      if (r.problemId) wrongProblemIds.push(r.problemId);
    });
  }

  let subtopicIds = [];
  if (wrongProblemIds.length > 0) {
    const placeholders = wrongProblemIds.map(() => '?').join(',');
    const subtopics = db.prepare(`SELECT DISTINCT subtopic_id FROM problems WHERE id IN (${placeholders})`).all(...wrongProblemIds);
    subtopicIds = subtopics.map(r => r.subtopic_id).filter(Boolean);
  }

  if (subtopicIds.length === 0) {
    const randomSubtopics = db.prepare(`SELECT id FROM subtopics ORDER BY RANDOM() LIMIT 3`).all();
    subtopicIds = randomSubtopics.map(r => r.id);
  }

  const realProblems = [];
  const fetchedIds = new Set();

  for (const subtopicId of subtopicIds) {
    if (realProblems.length >= 3) break;
    const problem = db.prepare(`
      SELECT p.*, s.title as subtopic_title
      FROM problems p
      LEFT JOIN subtopics s ON s.id = p.subtopic_id
      WHERE p.subtopic_id = ?
        AND p.id NOT IN (
          SELECT problem_id FROM correction_attempts WHERE user_id = ? AND is_correct = 1
        )
      ORDER BY RANDOM()
      LIMIT 1
    `).get(subtopicId, userId);

    if (problem && !fetchedIds.has(problem.id)) {
      fetchedIds.add(problem.id);
      realProblems.push(problem);
    }
  }

  if (realProblems.length < 3 && subtopicIds.length > 0) {
     const needed = 3 - realProblems.length;
     const placeholders = subtopicIds.map(() => '?').join(',');
     const extraProblems = db.prepare(`
        SELECT p.*, s.title as subtopic_title
        FROM problems p
        LEFT JOIN subtopics s ON s.id = p.subtopic_id
        WHERE p.subtopic_id IN (${placeholders})
        ORDER BY RANDOM()
        LIMIT ?
     `).all(...subtopicIds, needed);
     for (const p of extraProblems) {
       if (realProblems.length >= 3) break;
       if (!fetchedIds.has(p.id)) {
         fetchedIds.add(p.id);
         realProblems.push(p);
       }
     }
  }

  if (realProblems.length === 0) {
    const randomProblems = db.prepare(`
        SELECT p.*, s.title as subtopic_title
        FROM problems p
        LEFT JOIN subtopics s ON s.id = p.subtopic_id
        ORDER BY RANDOM()
        LIMIT 3
    `).all();
    for (const p of randomProblems) {
       if (!fetchedIds.has(p.id)) {
         fetchedIds.add(p.id);
         realProblems.push(p);
       }
    }
  }

  if (realProblems.length > 0) {
    summary.recommendedItems = realProblems.map((p, i) => {
       const skillLabel = formatLearningSkillLabel(p.subtopic_title || 'General');
       // ensure the weakness is also in the weakness card
       if (skillLabel && (!summary.weaknesses || !summary.weaknesses.includes(skillLabel))) {
         if (!summary.weaknesses) summary.weaknesses = [];
         summary.weaknesses.push(skillLabel);
       }
       return {
          ref: p.id.toString(),
          questionDisplay: p.question_display,
          questionText: p.question_text,
          answerDisplay: p.answer_display,
          difficulty: p.difficulty || 'Medium',
          purcellReference: p.subtopic_title || 'General',
          reason: "Dipilih berdasarkan riwayat kesalahanmu pada topik " + (p.subtopic_title || "ini") + ".",
          storyProblem: p.question_type === 'story',
          targetSkill: { id: p.subtopic_id, label: skillLabel },
          questionType: p.question_type,
          mcOptions: p.mc_options,
          acceptableAnswers: p.acceptable_answers
       };
    });
  }

   return summary;
}

const { getPoolStats: getStats } = require('../lib/multi-provider-pool');
router.get('/pool/stats', isAuthenticated, (req, res) => {
  if (!(req.session?.role === 'admin' || isLocalAdminMode(req))) {
    return res.status(403).json({ error: 'Akses admin diperlukan' });
  }
  res.json(getStats());
});

router.get('/latency/summary', isAuthenticated, (req, res) => {
  if (!(req.session?.role === 'admin' || isLocalAdminMode(req))) {
    return res.status(403).json({ error: 'Akses admin diperlukan' });
  }
  res.json(getLatencySummary(req.app.locals.db, { sinceHours: req.query.hours }));
});

module.exports = router;
module.exports._profileSummaryInternals = {
  GEMMA_PROFILE_MODEL,
  MAX_LEARNING_TAGS,
  PROFILE_AI_ATTEMPT_LIMIT,
  PROFILE_AI_REFRESH_COOLDOWN_MS,
  PROFILE_MC_ATTEMPT_LIMIT,
  PROFILE_RECOMMENDATION_ATTEMPT_LIMIT,
  buildMasteryHistory,
  buildProfileAiEvidence,
  canBypassProfileAiCooldown,
  compactAttemptsForProfile,
  chooseProfileAttemptSource,
  enrichProfileSummaryRecommendations,
  extractGeneratedText,
  getProfileModels,
  getProfileAiRefreshState,
  loadRecentCorrectionAttempts,
  normalizeLearningTags,
  summarizeMultipleChoiceEvidence
};
module.exports._correctionInternals = {
  normalizeEvaluation,
  normalizeTranscription,
  parsePositiveId,
  safeJsonParse,
  safeTranscriptionParse,
  stripLatexToPlain
};
