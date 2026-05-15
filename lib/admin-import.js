const path = require('path');
const fs = require('fs');
const axios = require('axios');
const mammoth = require('mammoth');
const { z } = require('zod');

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 120000;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);
const VALID_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const VALID_QUESTION_TYPES = new Set(['mc', 'open']);
const IMPORT_MODES = new Set(['ai_complete', 'hybrid', 'manual']);

const StepSchema = z.object({
  title: z.string().optional().default(''),
  content: z.string().optional().default(''),
  why: z.string().optional().default(''),
  intuition: z.string().optional().default(''),
  mistakes: z.string().optional().default(''),
  mistake_result: z.string().optional().default(''),
});

const QuestionSchema = z.object({
  source_index: z.number().int().positive().optional(),
  subtopic_id: z.number().int().positive().nullable().optional(),
  question_text: z.string().optional().default(''),
  question_display: z.string().min(1),
  answer_display: z.string().optional().default(''),
  acceptable_answers: z.array(z.string()).optional().default([]),
  difficulty: z.string().optional().default('Easy'),
  question_type: z.string().optional(),
  mc_options: z.array(z.string()).optional().default([]),
  steps: z.array(StepSchema).optional().default([]),
  warnings: z.array(z.string()).optional().default([]),
});

const DraftSchema = z.object({
  source_summary: z.string().optional().default(''),
  document_kind: z.enum(['questions_only', 'questions_with_solution', 'mixed']).optional().default('mixed'),
  needs_admin_input: z.boolean().optional().default(false),
  warnings: z.array(z.string()).optional().default([]),
  questions: z.array(QuestionSchema).min(1),
});

function detectUploadKind(file) {
  if (!file || !file.buffer || !file.originalname) {
    throw new Error('File wajib diupload.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Ukuran file maksimal 10MB.');
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Upload hanya mendukung PDF, DOCX, TXT, atau MD.');
  }

  const head = file.buffer.subarray(0, 8);
  if (ext === '.pdf') {
    if (head.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('File PDF tidak valid atau rusak.');
    }
    return 'pdf';
  }

  if (ext === '.docx') {
    if (!(head[0] === 0x50 && head[1] === 0x4b)) {
      throw new Error('File DOCX tidak valid atau rusak.');
    }
    return 'docx';
  }

  if (file.buffer.includes(0)) {
    throw new Error('File teks tidak valid.');
  }
  return ext === '.md' ? 'md' : 'txt';
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

async function extractTextFromUpload(file) {
  const kind = detectUploadKind(file);
  let text = '';

  if (kind === 'pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      text = result.text || '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  } else if (kind === 'docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    text = result.value || '';
  } else {
    text = file.buffer.toString('utf8');
  }

  const normalized = normalizeText(text);
  if (!normalized) {
    throw new Error('Teks soal tidak terbaca dari file. Jika PDF berupa scan gambar, gunakan OCR atau paste teks manual dulu.');
  }
  if (normalized.length > MAX_EXTRACTED_CHARS) {
    return normalized.slice(0, MAX_EXTRACTED_CHARS);
  }
  return normalized;
}

function normalizeMode(mode) {
  return IMPORT_MODES.has(mode) ? mode : 'ai_complete';
}

function getSopText(projectRoot) {
  const sopPath = path.join(projectRoot, 'SOP-DEEPSEEK-AI.md');
  return fs.existsSync(sopPath)
    ? fs.readFileSync(sopPath, 'utf8')
    : 'Output harus berupa json valid sesuai schema MAFIKING.';
}

function buildDeepSeekMessages({ sopText, extractedText, mode, subtopic, adminAnswerKey }) {
  const normalizedMode = normalizeMode(mode);
  const modeInstruction = {
    ai_complete: 'Mode otomatis. Jika file sudah berisi jawaban atau pembahasan, gunakan dan rapikan itu sebagai sumber utama. Jika file hanya berisi soal atau jawaban tidak lengkap, AI wajib melengkapi answer_display, acceptable_answers, pilihan ganda yang bermakna, dan langkah penyelesaian.',
    hybrid: 'Admin memberi kunci jawaban manual. Gunakan kunci admin sebagai sumber utama, lalu buat pilihan jawaban dan pembahasan.',
    manual: 'Admin akan mengisi kunci dan opsi manual. AI hanya mengekstrak dan merapikan daftar soal; kosongkan answer_display, acceptable_answers, mc_options, dan steps kecuali file memang jelas menyediakan pembahasan.',
  }[normalizedMode];

  const subtopicLine = subtopic
    ? `Target subtopik: id=${subtopic.id}, judul="${subtopic.title}", bab="${subtopic.chapter_title || ''}".`
    : 'Target subtopik belum pasti. Gunakan subtopic_id null bila tidak yakin.';

  return [
    {
      role: 'system',
      content: [
        'Kamu adalah import assistant untuk MAFIKING.',
        'Balas hanya json valid, tanpa markdown, tanpa komentar di luar json.',
        'Ikuti SOP berikut.',
        sopText,
      ].join('\n\n'),
    },
    {
      role: 'user',
      content: [
        'Konversi teks file admin menjadi draft soal MAFIKING dalam json.',
        subtopicLine,
        `Mode import: ${normalizedMode}. ${modeInstruction}`,
        'Aturan urutan: nomor seperti "Soal 1" di file hanya source_index lokal file. Jangan mengisi sort_order. Backend akan selalu menambahkan hasil upload ke posisi paling belakang subtopik tujuan.',
        adminAnswerKey ? `Kunci jawaban dari admin:\n${adminAnswerKey}` : 'Kunci jawaban dari admin: tidak ada. Isi otomatis semua jawaban dan pembahasan yang belum tersedia dari file.',
        'Gunakan schema json ini:',
        JSON.stringify({
          source_summary: 'ringkasan sumber',
          document_kind: 'questions_only | questions_with_solution | mixed',
          needs_admin_input: false,
          warnings: [],
          questions: [{
            source_index: 1,
            subtopic_id: subtopic ? subtopic.id : null,
            question_text: 'teks polos untuk AI',
            question_display: 'format soal untuk UI, LaTeX tanpa $',
            answer_display: 'jawaban utama atau kosong jika manual',
            acceptable_answers: ['variasi jawaban benar'],
            difficulty: 'Easy | Medium | Hard',
            question_type: 'mc | open',
            mc_options: ['opsi benar', 'distraktor dari miskonsepsi'],
            steps: [{
              title: 'nama langkah',
              content: 'rumus/operasi langkah',
              why: 'alasan langkah',
              intuition: 'cara memahami',
              mistakes: 'kesalahan umum',
              mistake_result: 'hasil salah yang mungkin muncul',
            }],
            warnings: [],
          }],
        }, null, 2),
        'Teks file:',
        extractedText,
      ].join('\n\n'),
    },
  ];
}

async function requestDeepSeekDraft({ messages }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const error = new Error('DEEPSEEK_API_KEY belum diset di .env.');
    error.status = 400;
    throw error;
  }

  const baseURL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
  const maxTokens = Number(process.env.DEEPSEEK_MAX_TOKENS || 12000);
  const response = await axios.post(`${baseURL}/chat/completions`, {
    model,
    messages,
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
  }, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: Number(process.env.DEEPSEEK_TIMEOUT_MS || 90000),
  });

  const content = response.data && response.data.choices && response.data.choices[0]
    && response.data.choices[0].message && response.data.choices[0].message.content;
  if (!content) {
    throw new Error('AI mengembalikan respons kosong. Coba ulang atau kecilkan file.');
  }
  return {
    content,
    model: response.data.model || model,
    usage: response.data.usage || null,
  };
}

function normalizeDeepSeekDraft(rawDraft, fallbackSubtopicId) {
  const parsed = DraftSchema.safeParse(rawDraft);
  if (!parsed.success) {
    throw new Error('Format JSON AI tidak sesuai schema MAFIKING.');
  }
  const draft = parsed.data;
  return {
    source_summary: String(draft.source_summary || '').trim(),
    document_kind: draft.document_kind,
    needs_admin_input: Boolean(draft.needs_admin_input),
    warnings: cleanStringArray(draft.warnings),
    questions: draft.questions.map((question, index) => normalizeQuestion(question, fallbackSubtopicId, index)),
  };
}


function parseJsonObject(content) {
  try {
    return JSON.parse(content);
  } catch (_) {
    const start = String(content).indexOf('{');
    const end = String(content).lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(String(content).slice(start, end + 1));
    }
    throw new Error('Respons AI bukan JSON valid.');
  }
}

function cleanStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function normalizeQuestion(question, fallbackSubtopicId, index) {
  const options = cleanStringArray(question.mc_options);
  const answer = String(question.answer_display || '').trim();
  const acceptable = cleanStringArray(question.acceptable_answers);
  const questionType = VALID_QUESTION_TYPES.has(question.question_type)
    ? question.question_type
    : (options.length ? 'mc' : 'open');
  const difficulty = VALID_DIFFICULTIES.has(question.difficulty) ? question.difficulty : 'Easy';

  return {
    source_index: Number(question.source_index) || index + 1,
    subtopic_id: Number(question.subtopic_id || fallbackSubtopicId) || null,
    question_text: String(question.question_text || question.question_display || '').trim(),
    question_display: String(question.question_display || '').trim(),
    answer_display: answer,
    acceptable_answers: acceptable.length ? acceptable : (answer ? [answer] : []),
    difficulty,
    question_type: questionType,
    mc_options: questionType === 'mc' && answer && !options.includes(answer) ? [answer].concat(options) : (questionType === 'mc' ? options : []),
    sort_order: Number(question.sort_order || 0),
    steps: Array.isArray(question.steps) ? question.steps.map((step, stepIdx) => ({
      step_order: Number(step.step_order || stepIdx + 1),
      title: String(step.title || `Langkah ${stepIdx + 1}`).trim(),
      content: String(step.content || '').trim(),
      why: String(step.why || '').trim(),
      intuition: String(step.intuition || '').trim(),
      mistakes: String(step.mistakes || '').trim(),
      mistake_result: String(step.mistake_result || '').trim(),
    })).filter((step) => step.title && step.content) : [],
    warnings: cleanStringArray(question.warnings),
  };
}


function normalizeQuestionsForCommit(defaultSubtopicId, questions) {
  if (!Number(defaultSubtopicId)) {
    throw new Error('Subtopik tujuan wajib dipilih.');
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Tidak ada soal untuk diimport.');
  }

  return questions.map((question, index) => {
    const normalized = normalizeQuestion(question, defaultSubtopicId, index);
    if (!normalized.question_display) {
      throw new Error(`Soal #${index + 1} belum memiliki teks soal.`);
    }
    if (!normalized.answer_display) {
      throw new Error(`Soal #${index + 1} belum memiliki kunci jawaban.`);
    }
    if (normalized.question_type === 'mc' && normalized.mc_options.length < 2) {
      throw new Error(`Soal #${index + 1} pilihan jawaban minimal 2 opsi.`);
    }
    return normalized;
  });
}

function assignAppendSortOrders(defaultSubtopicId, questions, getMaxSortForSubtopic) {
  if (!Number(defaultSubtopicId)) {
    throw new Error('Subtopik tujuan wajib dipilih.');
  }
  if (!Array.isArray(questions)) {
    throw new Error('Daftar soal import tidak valid.');
  }
  if (typeof getMaxSortForSubtopic !== 'function') {
    throw new Error('Pembaca urutan soal terakhir tidak tersedia.');
  }

  const nextSortBySubtopic = new Map();
  return questions.map((question) => {
    const questionSubtopicId = Number(question.subtopic_id || defaultSubtopicId);
    if (!questionSubtopicId) {
      throw new Error('Subtopik tujuan wajib dipilih.');
    }

    if (!nextSortBySubtopic.has(questionSubtopicId)) {
      nextSortBySubtopic.set(questionSubtopicId, Number(getMaxSortForSubtopic(questionSubtopicId) || 0));
    }

    const nextSort = nextSortBySubtopic.get(questionSubtopicId) + 1;
    nextSortBySubtopic.set(questionSubtopicId, nextSort);

    return {
      ...question,
      subtopic_id: questionSubtopicId,
      sort_order: nextSort,
    };
  });
}

module.exports = {
  MAX_UPLOAD_BYTES,
  MAX_EXTRACTED_CHARS,
  assignAppendSortOrders,
  detectUploadKind,
  extractTextFromUpload,
  normalizeText,
  normalizeMode,
  getSopText,
  buildDeepSeekMessages,
  requestDeepSeekDraft,
  parseJsonObject,
  normalizeDeepSeekDraft,
  normalizeQuestionsForCommit,
};
