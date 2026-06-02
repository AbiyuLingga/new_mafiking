const express = require('express');
const { isAuthenticated, requireRegisteredUser } = require('../middleware/auth');
const { getTryoutChoices } = require('../lib/tryout-ranking');
const {
    FREE_MATH_TIME_LIMIT_SECONDS,
    FREE_MATH_TRYOUT_ID,
    FREE_MATH_TRYOUT_TITLE,
    createTryoutSession,
} = require('../lib/tryout-session');
const router = express.Router();

// GET /api/quiz/chapters
router.get('/chapters', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const chapters = db.prepare('SELECT * FROM chapters ORDER BY sort_order, id').all();
    res.json(chapters);
});

// GET /api/quiz/chapters/:id/subtopics
router.get('/chapters/:id/subtopics', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const subtopics = db.prepare(
        'SELECT * FROM subtopics WHERE chapter_id = ? ORDER BY sort_order, id'
    ).all(req.params.id);
    res.json(subtopics);
});

// GET /api/quiz/init — all chapters with subtopics + problem counts in 1 call (public)
router.get('/init', (req, res) => {
    const db = req.app.locals.db;
    const chapters = db.prepare('SELECT * FROM chapters ORDER BY sort_order, id').all();
    const subtopics = db.prepare('SELECT * FROM subtopics ORDER BY sort_order, id').all();
    const counts = db.prepare(
        'SELECT subtopic_id, COUNT(*) as count FROM problems GROUP BY subtopic_id'
    ).all();

    const countMap = {};
    for (const c of counts) countMap[c.subtopic_id] = c.count;

    for (const ch of chapters) {
        ch.subtopics = subtopics.filter(s => s.chapter_id === ch.id);
    }

    res.json({ chapters, problemCounts: countMap });
});

// GET /api/quiz/subtopics/:id/problems
router.get('/subtopics/:id/problems', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const problems = db.prepare(
        'SELECT id, subtopic_id, question_text, question_display, answer_display, difficulty, question_type, mc_options, sort_order FROM problems WHERE subtopic_id = ? ORDER BY sort_order, id'
    ).all(req.params.id);
    res.json(problems);
});

// GET /api/quiz/problems/:id — full detail with steps
router.get('/problems/:id', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const problem = db.prepare('SELECT * FROM problems WHERE id = ?').get(req.params.id);
    if (!problem) {
        return res.status(404).json({ error: 'Soal tidak ditemukan' });
    }

    problem.acceptable_answers = JSON.parse(problem.acceptable_answers);

    const steps = db.prepare(
        'SELECT * FROM problem_steps WHERE problem_id = ? ORDER BY step_order'
    ).all(req.params.id);

    problem.steps = steps;
    res.json(problem);
});

// GET /api/quiz/subtopics/:id — single subtopic detail
router.get('/subtopics/:id', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const subtopic = db.prepare('SELECT * FROM subtopics WHERE id = ?').get(req.params.id);
    if (!subtopic) {
        return res.status(404).json({ error: 'Subtopik tidak ditemukan' });
    }
    res.json(subtopic);
});

// GET /api/quiz/subtopics/:id/full — subtopic + all problems with steps in 1 call
router.get('/subtopics/:id/full', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const subtopic = db.prepare('SELECT * FROM subtopics WHERE id = ?').get(req.params.id);
    if (!subtopic) {
        return res.status(404).json({ error: 'Subtopik tidak ditemukan' });
    }
    const problems = db.prepare(
        'SELECT * FROM problems WHERE subtopic_id = ? ORDER BY sort_order, id'
    ).all(req.params.id);
    const stepsStmt = db.prepare('SELECT * FROM problem_steps WHERE problem_id = ? ORDER BY step_order');
    for (const p of problems) {
        p.acceptable_answers = JSON.parse(p.acceptable_answers);
        p.steps = stepsStmt.all(p.id);
    }
    res.json({ subtopic, problems });
});

// GET /api/quiz/tryout/free-math-session — 15 soal Matematika DB-backed dengan deadline server
router.get('/tryout/free-math-session', isAuthenticated, requireRegisteredUser, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    const limit = Math.max(1, Math.min(15, Number(req.query.limit) || 15));

    const rows = db.prepare(`
        SELECT
            p.id,
            p.subtopic_id,
            p.question_text,
            p.question_display,
            p.difficulty,
            p.question_type,
            p.mc_options,
            p.answer_text,
            p.answer_display,
            s.id AS source_subtopic_id,
            s.title AS source_subtopic_title,
            c.id AS source_chapter_id,
            c.title AS source_chapter_title,
            c.mapel AS source_mapel
        FROM problems p
        JOIN subtopics s ON s.id = p.subtopic_id
        JOIN chapters c ON c.id = s.chapter_id
        WHERE lower(coalesce(c.mapel, 'matematika')) = 'matematika'
        ORDER BY RANDOM()
        LIMIT ?
    `).all(limit);

    if (!rows.length) {
        return res.status(404).json({ error: 'Belum ada soal Matematika untuk tryout gratis' });
    }

    const { session, token } = createTryoutSession({
        userId,
        problemIds: rows.map((row) => row.id),
        timeLimitSeconds: FREE_MATH_TIME_LIMIT_SECONDS,
    });

    const problems = rows.map((row) => ({
        id: row.id,
        subtopic_id: row.subtopic_id,
        question_text: row.question_text,
        question_display: row.question_display,
        difficulty: row.difficulty,
        question_type: row.question_type,
        mc_options: getTryoutChoices(row, rows),
        sourceSubtopic: {
            id: row.source_subtopic_id,
            title: row.source_subtopic_title,
            chapterId: row.source_chapter_id,
            chapterTitle: row.source_chapter_title,
            mapel: row.source_mapel,
        },
    }));

    res.json({
        id: FREE_MATH_TRYOUT_ID,
        title: FREE_MATH_TRYOUT_TITLE,
        problemLimit: limit,
        timeLimitSeconds: session.timeLimitSeconds,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
        sessionToken: token,
        problems,
    });
});

module.exports = router;
