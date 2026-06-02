const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const {
  FREE_MATH_TIME_LIMIT_SECONDS,
  FREE_MATH_TRYOUT_ID,
  createTryoutSession,
} = require('../lib/tryout-session');

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
    let session = null;
    if (tryoutId === FREE_MATH_TRYOUT_ID && req.session && req.session.userId) {
      const created = createTryoutSession({
        userId: req.session.userId,
        problemIds: questions.map((question) => question.id),
        timeLimitSeconds,
        tryoutId,
        tryoutTitle: tryout.title || 'Try Out Matematika',
      });
      session = {
        ...created.session,
        id: created.session.tryoutId,
        title: created.session.tryoutTitle,
        sessionToken: created.token,
      };
    }

    res.json({
      tryout,
      questions: attachQuestionSteps(db, questions),
      session,
      timeLimitSeconds,
    });
  } catch (e) {
    console.error('GET /api/tryouts/:tryoutId/full error:', e);
    res.status(500).json({ error: 'Gagal memuat Try Out.' });
  }
});

module.exports = router;
