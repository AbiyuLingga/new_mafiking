const express = require('express');
const xss = require('xss');
const { isAuthenticated } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const router = express.Router();

router.use(isAuthenticated, isAdmin);

// ===== CHAPTERS =====
router.get('/chapters', (req, res) => {
    try {
        const db = req.app.locals.db;
        res.json(db.prepare('SELECT * FROM chapters ORDER BY sort_order, id').all());
    } catch (e) { console.error('GET /chapters error:', e); res.status(500).json({ error: e.message }); }
});

router.post('/chapters', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { title, sort_order, mapel, semester, description, est, topics } = req.body;
        const topicsJson = typeof topics === 'string' ? topics : JSON.stringify(Array.isArray(topics) ? topics : []);
        const result = db.prepare(
            'INSERT INTO chapters (title, icon, sort_order, mapel, semester, description, est, topics) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(xss(title), '', sort_order || 0, xss(mapel || 'Matematika'), Number(semester) || 1, xss(description || ''), xss(est || ''), topicsJson);
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) { console.error('POST /chapters error:', e); res.status(500).json({ error: e.message }); }
});

router.put('/chapters/:id', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { title, sort_order, mapel, semester, description, est, topics } = req.body;
        const topicsJson = typeof topics === 'string' ? topics : JSON.stringify(Array.isArray(topics) ? topics : []);
        db.prepare(
            'UPDATE chapters SET title = ?, icon = ?, sort_order = ?, mapel = ?, semester = ?, description = ?, est = ?, topics = ? WHERE id = ?'
        ).run(xss(title), '', sort_order || 0, xss(mapel || 'Matematika'), Number(semester) || 1, xss(description || ''), xss(est || ''), topicsJson, req.params.id);
        res.json({ ok: true });
    } catch (e) { console.error('PUT /chapters error:', e); res.status(500).json({ error: e.message }); }
});

router.delete('/chapters/:id', (req, res) => {
    try {
        const db = req.app.locals.db;
        db.prepare('DELETE FROM chapters WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (e) { console.error('DELETE /chapters error:', e); res.status(500).json({ error: e.message }); }
});

// ===== SUBTOPICS =====
router.get('/subtopics', (req, res) => {
    try {
        const db = req.app.locals.db;
        const rows = db.prepare(
            'SELECT s.*, c.title as chapter_title FROM subtopics s JOIN chapters c ON s.chapter_id = c.id ORDER BY c.sort_order, c.id, s.sort_order, s.id'
        ).all();
        res.json(rows);
    } catch (e) { console.error('GET /subtopics error:', e); res.status(500).json({ error: e.message }); }
});

router.post('/subtopics', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { chapter_id, slug, title, icon, description, sort_order } = req.body;
        const result = db.prepare(
            'INSERT INTO subtopics (chapter_id, slug, title, icon, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(chapter_id, xss(slug), xss(title), xss(icon || ''), xss(description || ''), sort_order || 0);
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) { console.error('POST /subtopics error:', e); res.status(500).json({ error: e.message }); }
});

router.put('/subtopics/:id', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { chapter_id, slug, title, icon, description, sort_order } = req.body;
        db.prepare(
            'UPDATE subtopics SET chapter_id = ?, slug = ?, title = ?, icon = ?, description = ?, sort_order = ? WHERE id = ?'
        ).run(chapter_id, xss(slug), xss(title), xss(icon || ''), xss(description || ''), sort_order || 0, req.params.id);
        res.json({ ok: true });
    } catch (e) { console.error('PUT /subtopics error:', e); res.status(500).json({ error: e.message }); }
});

router.delete('/subtopics/:id', (req, res) => {
    try {
        const db = req.app.locals.db;
        db.prepare('DELETE FROM subtopics WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (e) { console.error('DELETE /subtopics error:', e); res.status(500).json({ error: e.message }); }
});

// ===== PROBLEMS =====
router.get('/problems', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { subtopic_id } = req.query;
        let rows;
        if (subtopic_id) {
            rows = db.prepare(
                'SELECT p.*, u.username as created_by_username FROM problems p LEFT JOIN users u ON p.created_by = u.id WHERE p.subtopic_id = ? ORDER BY p.sort_order, p.id'
            ).all(subtopic_id);
        } else {
            rows = db.prepare(
                'SELECT p.*, s.title as subtopic_title, u.username as created_by_username FROM problems p JOIN subtopics s ON p.subtopic_id = s.id JOIN chapters c ON s.chapter_id = c.id LEFT JOIN users u ON p.created_by = u.id ORDER BY c.sort_order, c.id, s.sort_order, s.id, p.sort_order, p.id'
            ).all();
        }
        res.json(rows);
    } catch (e) { console.error('GET /problems error:', e); res.status(500).json({ error: e.message }); }
});

router.post('/problems', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { subtopic_id, question_text, question_display, answer_display, acceptable_answers, difficulty, question_type, mc_options, sort_order } = req.body;
        const answers = typeof acceptable_answers === 'string' ? acceptable_answers : JSON.stringify(acceptable_answers);
        const options = typeof mc_options === 'string' ? mc_options : JSON.stringify(mc_options || []);
        const result = db.prepare(
            'INSERT INTO problems (subtopic_id, question_text, question_display, answer_display, acceptable_answers, difficulty, question_type, mc_options, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(subtopic_id, question_text || '', question_display, answer_display, answers, difficulty || 'Easy', question_type || 'open', options, sort_order || 0, req.session.userId || null);
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) { console.error('POST /problems error:', e); res.status(500).json({ error: e.message }); }
});

router.put('/problems/:id', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { subtopic_id, question_text, question_display, answer_display, acceptable_answers, difficulty, question_type, mc_options, sort_order } = req.body;
        const answers = typeof acceptable_answers === 'string' ? acceptable_answers : JSON.stringify(acceptable_answers);
        const options = typeof mc_options === 'string' ? mc_options : JSON.stringify(mc_options || []);
        db.prepare(
            'UPDATE problems SET subtopic_id = ?, question_text = ?, question_display = ?, answer_display = ?, acceptable_answers = ?, difficulty = ?, question_type = ?, mc_options = ?, sort_order = ? WHERE id = ?'
        ).run(subtopic_id, question_text || '', question_display, answer_display, answers, difficulty || 'Easy', question_type || 'open', options, sort_order || 0, req.params.id);
        res.json({ ok: true });
    } catch (e) { console.error('PUT /problems error:', e); res.status(500).json({ error: e.message }); }
});

router.patch('/problems/:id/sort', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { sort_order } = req.body;
        db.prepare('UPDATE problems SET sort_order = ? WHERE id = ?').run(sort_order, req.params.id);
        res.json({ ok: true });
    } catch (e) { console.error('PATCH /problems sort error:', e); res.status(500).json({ error: e.message }); }
});

router.delete('/problems/:id', (req, res) => {
    try {
        const db = req.app.locals.db;
        db.prepare('DELETE FROM problems WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (e) { console.error('DELETE /problems error:', e); res.status(500).json({ error: e.message }); }
});

// ===== PROBLEM STEPS =====
router.get('/problems/:id/steps', (req, res) => {
    try {
        const db = req.app.locals.db;
        const steps = db.prepare('SELECT * FROM problem_steps WHERE problem_id = ? ORDER BY step_order').all(req.params.id);
        res.json(steps);
    } catch (e) { console.error('GET /steps error:', e); res.status(500).json({ error: e.message }); }
});

router.post('/problems/:id/steps', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { step_order, title, content, why, intuition, mistakes, mistake_result } = req.body;
        const result = db.prepare(
            'INSERT INTO problem_steps (problem_id, step_order, title, content, why, intuition, mistakes, mistake_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(req.params.id, step_order, title, content, why || '', intuition || '', mistakes || '', mistake_result || '');
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) { console.error('POST /steps error:', e); res.status(500).json({ error: e.message }); }
});

router.put('/steps/:id', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { step_order, title, content, why, intuition, mistakes, mistake_result } = req.body;
        db.prepare(
            'UPDATE problem_steps SET step_order = ?, title = ?, content = ?, why = ?, intuition = ?, mistakes = ?, mistake_result = ? WHERE id = ?'
        ).run(step_order, title, content, why || '', intuition || '', mistakes || '', mistake_result || '', req.params.id);
        res.json({ ok: true });
    } catch (e) { console.error('PUT /steps error:', e); res.status(500).json({ error: e.message }); }
});

router.delete('/steps/:id', (req, res) => {
    try {
        const db = req.app.locals.db;
        db.prepare('DELETE FROM problem_steps WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (e) { console.error('DELETE /steps error:', e); res.status(500).json({ error: e.message }); }
});

// ===== USERS =====
router.get('/users', (req, res) => {
    try {
        const db = req.app.locals.db;
        const users = db.prepare('SELECT id, username, display_name, role, xp, level, streak_days, last_active FROM users ORDER BY id').all();
        res.json(users);
    } catch (e) { console.error('GET /users error:', e); res.status(500).json({ error: e.message }); }
});

router.put('/users/:id/password', async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: 'Password minimal 8 karakter' });
        }
        const bcrypt = require('bcrypt');
        const password_hash = await bcrypt.hash(newPassword, 10);
        const db = req.app.locals.db;
        const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
        res.json({ ok: true });
    } catch (e) { console.error('PUT /users/password error:', e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
