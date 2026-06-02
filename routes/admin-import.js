const express = require('express');
const multer = require('multer');
const path = require('path');
const { isAuthenticated } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const {
  MAX_UPLOAD_BYTES,
  MAX_EXTRACTED_CHARS,
  assignAppendSortOrders,
  buildDeepSeekMessages,
  extractTextFromUpload,
  normalizeText,
  getSopText,
  normalizeDeepSeekDraft,
  normalizeMode,
  normalizeQuestionsForCommit,
  parseJsonObject,
  requestDeepSeekDraft,
} = require('../lib/admin-import');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 8,
    fieldSize: 200 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!['.pdf', '.docx', '.txt', '.md'].includes(ext)) {
      cb(new Error('Upload hanya mendukung PDF, DOCX, TXT, atau MD.'));
      return;
    }
    cb(null, true);
  },
});

router.use(isAuthenticated, isAdmin);

function uploadSingle(req, res, next) {
  upload.single('source')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Ukuran file maksimal 10MB.'
      : (err.message || 'Upload gagal.');
    res.status(400).json({ error: message });
  });
}

function getSubtopic(db, subtopicId) {
  if (!Number(subtopicId)) return null;
  return db.prepare(`
    SELECT s.*, c.title AS chapter_title
    FROM subtopics s
    JOIN chapters c ON c.id = s.chapter_id
    WHERE s.id = ?
  `).get(Number(subtopicId));
}

function normalizeTryoutId(value) {
  return String(value || '').trim();
}

function getTryoutTarget(db, tryoutId) {
  const normalizedId = normalizeTryoutId(tryoutId);
  if (!normalizedId) return null;
  const pkg = db.prepare('SELECT tryout_id, title FROM tryout_packages WHERE tryout_id = ?').get(normalizedId);
  return {
    id: 1,
    tryout_id: normalizedId,
    title: (pkg && pkg.title) || normalizedId,
    chapter_title: 'Try Out',
  };
}

router.post('/draft', uploadSingle, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const tryoutTarget = getTryoutTarget(db, req.body.tryout_id);
    const subtopic = tryoutTarget || getSubtopic(db, req.body.subtopic_id);
    if (!subtopic) return res.status(400).json({ error: 'Tujuan import wajib dipilih.' });

    const mode = normalizeMode(req.body.mode);

    let extractedText;
    let sourceInfo;
    if (req.file) {
      extractedText = await extractTextFromUpload(req.file);
      sourceInfo = { filename: req.file.originalname, size: req.file.size, extracted_chars: extractedText.length, preview: extractedText.slice(0, 800) };
    } else {
      const raw = normalizeText(String(req.body.source_text || ''));
      if (!raw) return res.status(400).json({ error: 'Kode LaTeX atau teks soal tidak boleh kosong.' });
      extractedText = raw.length > MAX_EXTRACTED_CHARS ? raw.slice(0, MAX_EXTRACTED_CHARS) : raw;
      sourceInfo = { filename: 'input-latex.txt', size: Buffer.byteLength(extractedText, 'utf8'), extracted_chars: extractedText.length, preview: extractedText.slice(0, 800) };
    }

    const sopText = getSopText(path.join(__dirname, '..'));
    const messages = buildDeepSeekMessages({
      sopText,
      extractedText,
      mode,
      subtopic,
      adminAnswerKey: String(req.body.admin_answer_key || '').trim(),
    });
    const aiResponse = await requestDeepSeekDraft({ messages });
    const rawDraft = parseJsonObject(aiResponse.content);
    const draft = normalizeDeepSeekDraft(rawDraft, subtopic.id);

    res.json({
      ok: true,
      mode,
      source: sourceInfo,
      deepseek: {
        model: aiResponse.model,
        usage: aiResponse.usage,
      },
      draft,
    });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('POST /api/admin/import/draft error:', e);
    res.status(status).json({ error: e.message || 'Gagal membuat draft import.' });
  }
});

router.post('/commit', (req, res) => {
  try {
    const db = req.app.locals.db;
    const tryoutId = normalizeTryoutId(req.body.tryout_id);
    if (tryoutId) {
      const target = getTryoutTarget(db, tryoutId);
      if (!target) return res.status(400).json({ error: 'Try Out tujuan wajib dipilih.' });

      const questions = normalizeQuestionsForCommit(1, req.body.questions);
      const insertQuestion = db.prepare(`
        INSERT INTO tryout_questions (
          tryout_id, question_text, question_display, answer_display,
          acceptable_answers, difficulty, question_type, mc_options,
          sort_order, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertStep = db.prepare(`
        INSERT INTO tryout_question_steps (
          tryout_question_id, step_order, title, content, why, intuition, mistakes, mistake_result
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM tryout_questions WHERE tryout_id = ?');

      const commitTryout = db.transaction((rows) => {
        const inserted = [];
        let nextSort = Number(maxSort.get(tryoutId).max_sort || 0);
        rows.forEach((question) => {
          nextSort += 1;
          const questionInfo = insertQuestion.run(
            tryoutId,
            question.question_text,
            question.question_display,
            question.answer_display,
            JSON.stringify(question.acceptable_answers),
            question.difficulty,
            question.question_type,
            JSON.stringify(question.mc_options),
            nextSort,
            req.session.userId || null
          );
          const questionId = Number(questionInfo.lastInsertRowid);
          question.steps.forEach((step, stepIdx) => {
            insertStep.run(
              questionId,
              Number(step.step_order || stepIdx + 1),
              step.title,
              step.content,
              step.why || '',
              step.intuition || '',
              step.mistakes || '',
              step.mistake_result || ''
            );
          });
          inserted.push({ id: questionId, source_index: question.source_index, sort_order: nextSort });
        });
        return inserted;
      });

      return res.json({ ok: true, inserted: commitTryout(questions) });
    }

    const subtopicId = Number(req.body.subtopic_id);
    const targetSubtopic = getSubtopic(db, subtopicId);
    if (!targetSubtopic) return res.status(400).json({ error: 'Subtopik tujuan wajib dipilih.' });

    const questions = normalizeQuestionsForCommit(subtopicId, req.body.questions);

    const insertProblem = db.prepare(`
      INSERT INTO problems (
        subtopic_id, question_text, question_display, answer_display,
        acceptable_answers, difficulty, question_type, mc_options,
        sort_order, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertStep = db.prepare(`
      INSERT INTO problem_steps (
        problem_id, step_order, title, content, why, intuition, mistakes, mistake_result
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM problems WHERE subtopic_id = ?');

    const commit = db.transaction((rows) => {
      const inserted = [];
      const rowsWithAppendOrder = assignAppendSortOrders(
        subtopicId,
        rows,
        (questionSubtopicId) => Number(maxSort.get(questionSubtopicId).max_sort || 0)
      );

      rowsWithAppendOrder.forEach((question) => {
        const questionSubtopicId = Number(question.subtopic_id);
        const nextSort = Number(question.sort_order);

        const problemInfo = insertProblem.run(
          questionSubtopicId,
          question.question_text,
          question.question_display,
          question.answer_display,
          JSON.stringify(question.acceptable_answers),
          question.difficulty,
          question.question_type,
          JSON.stringify(question.mc_options),
          nextSort,
          req.session.userId || null
        );
        const problemId = Number(problemInfo.lastInsertRowid);
        question.steps.forEach((step, stepIdx) => {
          insertStep.run(
            problemId,
            Number(step.step_order || stepIdx + 1),
            step.title,
            step.content,
            step.why || '',
            step.intuition || '',
            step.mistakes || '',
            step.mistake_result || ''
          );
        });
        inserted.push({ id: problemId, source_index: question.source_index, sort_order: nextSort });
      });
      return inserted;
    });

    res.json({ ok: true, inserted: commit(questions) });
  } catch (e) {
    const status = e.status || 400;
    if (status >= 500) console.error('POST /api/admin/import/commit error:', e);
    res.status(status).json({ error: e.message || 'Gagal import soal.' });
  }
});

module.exports = router;
