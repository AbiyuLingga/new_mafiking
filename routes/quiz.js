const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
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

module.exports = router;
