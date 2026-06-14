const express = require('express');
const crypto = require('crypto');
const { isAuthenticated } = require('../middleware/auth');
const {
  FREE_MATH_TIME_LIMIT_SECONDS,
  FREE_MATH_TRYOUT_ID,
  createTryoutSession,
  normalizeTryoutDraftAnswers,
  normalizeTryoutDraftChoiceMap,
  parseTryoutSessionJson,
  verifyTryoutSessionToken,
} = require('../learning/tryout-session');

const router = express.Router();

router.use(isAuthenticated);

function parseTryoutId(value) {
  const tryoutId = String(value || '').trim();
  return tryoutId && tryoutId.length <= 120 ? tryoutId : '';
}

function readTryoutMeta(db, tryoutId) {
  const row = db.prepare('SELECT * FROM tryout_packages WHERE tryout_id = ?').get(tryoutId);
  if (row) return row;
  if (tryoutId === 'free-math-tryout-15') {
    return {
      id: null,
      tryout_id: tryoutId,
      title: 'Try Out Matematika',
      description: 'Try Out gratis Matematika',
      price: 'Gratis',
      original_price: null,
      badge: 'Try Out',
      duration: '30 mnt',
      questions: 15,
      features: JSON.stringify(['Hasil keluar instan', 'Pembahasan step-by-step']),
      tone: 'default',
      sort_order: 0,
    };
  }
  return null;
}

function parseDurationSeconds(value, fallbackSeconds) {
  const text = String(value || '').toLowerCase();
  const number = Number((text.match(/\d+/) || [])[0] || 0);
  if (!number) return Number(fallbackSeconds || FREE_MATH_TIME_LIMIT_SECONDS);
  if (text.includes('jam')) return number * 60 * 60;
  return number * 60;
}

function attachQuestionSteps(db, questions) {
  const stepsStmt = db.prepare(`
    SELECT id, tryout_question_id, step_order, title, content, why, intuition, mistakes, mistake_result
    FROM tryout_question_steps
    WHERE tryout_question_id = ?
    ORDER BY step_order, id
  `);
  return questions.map((question) => ({
    ...question,
    steps: stepsStmt.all(question.id),
  }));
}

function orderQuestionsByIds(questions, problemIds) {
  const byId = new Map((questions || []).map((question) => [Number(question.id), question]));
  return (problemIds || []).map((id) => byId.get(Number(id))).filter(Boolean);
}

function readActiveTryoutSession(db, { userId, tryoutId }) {
  if (!userId || !tryoutId) return null;
  return db.prepare(`
    SELECT *
    FROM tryout_sessions
    WHERE user_id = ? AND tryout_id = ? AND submitted_at IS NULL
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `).get(userId, tryoutId);
}

function serializeTryoutSessionRow(row) {
  if (!row) return null;
  const problemIds = parseTryoutSessionJson(row.problem_ids_json, [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  return {
    id: row.tryout_id,
    tryoutId: row.tryout_id,
    title: row.tryout_title,
    tryoutTitle: row.tryout_title,
    sessionToken: row.session_token,
    sessionSeed: row.session_seed || '',
    problemIds,
    answers: normalizeTryoutDraftAnswers(parseTryoutSessionJson(row.answers_json, {}), problemIds),
    choiceMap: normalizeTryoutDraftChoiceMap(parseTryoutSessionJson(row.choice_map_json, {}), problemIds),
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    timeLimitSeconds: Number(row.time_limit_seconds) || 0,
  };
}

function createPersistentTryoutSession(db, {
  userId,
  tryoutId,
  tryoutTitle,
  problemIds,
  timeLimitSeconds,
}) {
  const created = createTryoutSession({
    userId,
    problemIds,
    timeLimitSeconds,
    tryoutId,
    tryoutTitle,
  });
  const sessionSeed = crypto.randomBytes(8).toString('hex');
  db.prepare(`
    INSERT INTO tryout_sessions (
      user_id, tryout_id, tryout_title, session_token, session_seed,
      problem_ids_json, answers_json, choice_map_json,
      started_at, expires_at, time_limit_seconds
    ) VALUES (?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?, ?)
  `).run(
    userId,
    created.session.tryoutId,
    created.session.tryoutTitle,
    created.token,
    sessionSeed,
    JSON.stringify(created.session.problemIds),
    created.session.startedAt,
    created.session.expiresAt,
    created.session.timeLimitSeconds
  );
  return {
    ...created.session,
    id: created.session.tryoutId,
    title: created.session.tryoutTitle,
    sessionToken: created.token,
    sessionSeed,
    answers: {},
    choiceMap: {},
  };
}

router.get('/:tryoutId/full', (req, res) => {
  try {
    const tryoutId = parseTryoutId(req.params.tryoutId);
    if (!tryoutId) return res.status(400).json({ error: 'tryoutId tidak valid.' });

    const db = req.app.locals.db;
    const tryout = readTryoutMeta(db, tryoutId);
    if (!tryout) return res.status(404).json({ error: 'Try Out tidak ditemukan.' });

    const questions = db.prepare(`
      SELECT id, tryout_id, question_text, question_display, answer_display,
             acceptable_answers, difficulty, question_type, mc_options,
             image_url, image_alt, sort_order
      FROM tryout_questions
      WHERE tryout_id = ?
      ORDER BY sort_order, id
    `).all(tryoutId);
    const timeLimitSeconds = parseDurationSeconds(
      tryout.duration,
      tryoutId === FREE_MATH_TRYOUT_ID ? FREE_MATH_TIME_LIMIT_SECONDS : 90 * 60
    );
    const questionLimit = Math.max(1, Math.min(100, Number(tryout.questions) || questions.length || 1));
    const defaultProblemIds = questions.slice(0, Math.min(questionLimit, questions.length)).map((question) => question.id);
    let session = null;
    let responseQuestions = questions;
    if (req.session && req.session.userId && questions.length) {
      const activeSession = readActiveTryoutSession(db, { userId: req.session.userId, tryoutId });
      session = serializeTryoutSessionRow(activeSession);
      if (!session) {
        session = createPersistentTryoutSession(db, {
          userId: req.session.userId,
          tryoutId,
          tryoutTitle: tryout.title || 'Try Out Matematika',
          problemIds: defaultProblemIds,
          timeLimitSeconds,
        });
      }
      responseQuestions = orderQuestionsByIds(questions, session.problemIds);
    }

    res.json({
      tryout,
      questions: attachQuestionSteps(db, responseQuestions),
      session,
      timeLimitSeconds,
    });
  } catch (e) {
    console.error('GET /api/tryouts/:tryoutId/full error:', e);
    res.status(500).json({ error: 'Gagal memuat Try Out.' });
  }
});

router.put('/:tryoutId/session', (req, res) => {
  try {
    const tryoutId = parseTryoutId(req.params.tryoutId);
    if (!tryoutId) return res.status(400).json({ error: 'tryoutId tidak valid.' });
    const db = req.app.locals.db;
    const userId = req.session && req.session.userId;
    const sessionToken = String(req.body && req.body.sessionToken || '').trim();
    if (!userId || !sessionToken) return res.status(400).json({ error: 'Sesi tryout tidak valid.' });

    const row = readActiveTryoutSession(db, { userId, tryoutId });
    if (!row || row.session_token !== sessionToken) {
      return res.status(404).json({ error: 'Sesi tryout tidak ditemukan.' });
    }

    const verified = verifyTryoutSessionToken(sessionToken, { userId });
    if (!verified.ok) {
      return res.status(403).json({ error: verified.error });
    }

    const problemIds = parseTryoutSessionJson(row.problem_ids_json, [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    const answers = normalizeTryoutDraftAnswers(req.body && req.body.answers, problemIds);
    const choiceMap = normalizeTryoutDraftChoiceMap(req.body && req.body.choiceMap, problemIds);

    db.prepare(`
      UPDATE tryout_sessions
      SET answers_json = ?,
          choice_map_json = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(answers), JSON.stringify(choiceMap), row.id);

    res.json({ ok: true, answers, choiceMap, savedAt: new Date().toISOString() });
  } catch (e) {
    console.error('PUT /api/tryouts/:tryoutId/session error:', e);
    res.status(500).json({ error: 'Gagal menyimpan jawaban Try Out.' });
  }
});

module.exports = router;
