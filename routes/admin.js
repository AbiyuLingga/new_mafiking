const express = require('express');
const bcrypt = require('bcrypt');
const xss = require('xss');
const { isAuthenticated } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const router = express.Router();

router.use(isAuthenticated, isAdmin);

const ACCESS_TYPES = new Set(['tryout', 'subscription', 'package', 'manual']);
const USER_ROLES = new Set(['admin', 'user']);
const DEFAULT_ADMIN_RESET_PASSWORD = '123456';

function parsePositiveId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeAccessType(value) {
    const accessType = String(value || '').trim().toLowerCase();
    return ACCESS_TYPES.has(accessType) ? accessType : null;
}

function normalizeAccessValue(value) {
    const accessValue = String(value || '').trim();
    if (!accessValue || accessValue.length > 120) return null;
    return accessValue;
}

function readUser(db, userId) {
    return db.prepare('SELECT id, username, display_name, role, xp, level, streak_days, last_active, created_at FROM users WHERE id = ?').get(userId);
}

function rowsByUserId(rows) {
    return rows.reduce((acc, row) => {
        const key = String(row.user_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
    }, {});
}

function rowMapByUserId(rows) {
    return rows.reduce((acc, row) => {
        acc[String(row.user_id)] = row;
        return acc;
    }, {});
}

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

// ===== DAILY MISSIONS =====
router.get('/missions', (req, res) => {
    try {
        res.json(req.app.locals.db.prepare('SELECT * FROM daily_missions ORDER BY sort_order, day').all());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/missions', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { day, date_label, short_label, release_date, status, mapel, target, question, xp, week_label, sort_order } = req.body;
        const result = db.prepare(
            'INSERT INTO daily_missions (day, date_label, short_label, release_date, status, mapel, target, question, xp, week_label, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
        ).run(Number(day)||1, xss(date_label||''), xss(short_label||''), xss(release_date||''), status||'locked', xss(mapel||'?'), xss(target||''), xss(question||''), Number(xp)||150, xss(week_label||'Pekan 1'), Number(sort_order)||0);
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/missions/:id', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { day, date_label, short_label, release_date, status, mapel, target, question, xp, week_label, sort_order } = req.body;
        db.prepare(
            'UPDATE daily_missions SET day=?, date_label=?, short_label=?, release_date=?, status=?, mapel=?, target=?, question=?, xp=?, week_label=?, sort_order=? WHERE id=?'
        ).run(Number(day)||1, xss(date_label||''), xss(short_label||''), xss(release_date||''), status||'locked', xss(mapel||'?'), xss(target||''), xss(question||''), Number(xp)||150, xss(week_label||'Pekan 1'), Number(sort_order)||0, req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/missions/:id', (req, res) => {
    try {
        req.app.locals.db.prepare('DELETE FROM daily_missions WHERE id=?').run(req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== TRYOUT PACKAGES =====
router.get('/tryout-packages', (req, res) => {
    try {
        res.json(req.app.locals.db.prepare('SELECT * FROM tryout_packages ORDER BY sort_order, id').all());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tryout-packages', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { title, description, price, original_price, badge, duration, questions, features, tone, sort_order } = req.body;
        const featuresJson = typeof features === 'string' ? features : JSON.stringify(Array.isArray(features) ? features : []);
        const result = db.prepare(
            'INSERT INTO tryout_packages (title, description, price, original_price, badge, duration, questions, features, tone, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)'
        ).run(xss(title||''), xss(description||''), xss(price||'Gratis'), original_price ? xss(original_price) : null, xss(badge||''), xss(duration||''), Number(questions)||0, featuresJson, tone||'default', Number(sort_order)||0);
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/tryout-packages/:id', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { title, description, price, original_price, badge, duration, questions, features, tone, sort_order } = req.body;
        const featuresJson = typeof features === 'string' ? features : JSON.stringify(Array.isArray(features) ? features : []);
        db.prepare(
            'UPDATE tryout_packages SET title=?, description=?, price=?, original_price=?, badge=?, duration=?, questions=?, features=?, tone=?, sort_order=? WHERE id=?'
        ).run(xss(title||''), xss(description||''), xss(price||'Gratis'), original_price ? xss(original_price) : null, xss(badge||''), xss(duration||''), Number(questions)||0, featuresJson, tone||'default', Number(sort_order)||0, req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/tryout-packages/:id', (req, res) => {
    try {
        req.app.locals.db.prepare('DELETE FROM tryout_packages WHERE id=?').run(req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== USERS =====
router.get('/dashboard-data', (req, res) => {
    try {
        const db = req.app.locals.db;
        const users = db.prepare(`
            SELECT id, username, display_name, role, xp, level, streak_days, last_active, created_at,
                   phone_number, semester, fakultas, jurusan, mapel_prioritas, onboarding_completed_at
            FROM users
            ORDER BY id
        `).all();

        const grantsByUser = rowsByUserId(db.prepare(`
            SELECT id, user_id, access_type, access_value, granted_at
            FROM user_access_grants
            ORDER BY granted_at DESC, id DESC
        `).all());

        const progressByUser = rowMapByUserId(db.prepare(`
            SELECT
                user_id,
                COUNT(*) AS progress_rows,
                SUM(CASE WHEN solved = 1 THEN 1 ELSE 0 END) AS solved_count,
                COALESCE(SUM(attempts), 0) AS total_attempts,
                COALESCE(SUM(xp_earned), 0) AS xp_earned
            FROM user_progress
            GROUP BY user_id
        `).all());

        const practiceByUser = rowMapByUserId(db.prepare(`
            SELECT
                user_id,
                COUNT(*) AS attempt_count,
                SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct_count
            FROM practice_attempts
            GROUP BY user_id
        `).all());

        const correctionsByUser = rowMapByUserId(db.prepare(`
            SELECT
                user_id,
                COUNT(*) AS correction_count,
                ROUND(AVG(score), 1) AS average_score,
                MAX(created_at) AS last_correction_at
            FROM correction_attempts
            GROUP BY user_id
        `).all());

        const geminiUsageByKey = db.prepare(`
            SELECT
                key_name,
                COUNT(*) AS requests_today,
                COALESCE(SUM(tokens_used), 0) AS tokens_today
            FROM ai_token_usage
            WHERE provider = 'gemini'
              AND date(created_at) = date('now')
            GROUP BY key_name
        `).all().reduce((acc, row) => {
            acc[row.key_name] = row;
            return acc;
        }, {});

        const requestDailyLimit = Math.max(1, Number(process.env.GEMINI_REQUEST_DAILY_LIMIT) || 1500);
        const tokenDailyLimit = Math.max(1, Number(process.env.GEMINI_TOKEN_DAILY_LIMIT) || 1000000);
        const geminiKeys = Array.from({ length: 20 }, (_, index) => {
            const keyName = `GEMINI_KEY_${index + 1}`;
            const usage = geminiUsageByKey[keyName] || {};
            const requestsToday = Number(usage.requests_today) || 0;
            const tokensToday = Number(usage.tokens_today) || 0;
            return {
                keyName,
                configured: Boolean(String(process.env[keyName] || '').trim()),
                requestsToday,
                tokensToday,
                requestDailyLimit,
                tokenDailyLimit,
                remainingRequests: Math.max(0, requestDailyLimit - requestsToday),
                remainingTokens: Math.max(0, tokenDailyLimit - tokensToday)
            };
        });

        const enrichedUsers = users.map((user) => {
            const progress = progressByUser[String(user.id)] || {};
            const practice = practiceByUser[String(user.id)] || {};
            const corrections = correctionsByUser[String(user.id)] || {};
            return {
                ...user,
                access_grants: grantsByUser[String(user.id)] || [],
                progress: {
                    rows: Number(progress.progress_rows) || 0,
                    solved: Number(progress.solved_count) || 0,
                    attempts: Number(progress.total_attempts) || 0,
                    xpEarned: Number(progress.xp_earned) || 0
                },
                practice: {
                    attempts: Number(practice.attempt_count) || 0,
                    correct: Number(practice.correct_count) || 0
                },
                corrections: {
                    count: Number(corrections.correction_count) || 0,
                    averageScore: corrections.average_score == null ? null : Number(corrections.average_score),
                    lastAt: corrections.last_correction_at || null
                }
            };
        });

        res.json({
            generatedAt: new Date().toISOString(),
            currentUserId: req.session.userId || null,
            users: enrichedUsers,
            geminiKeys
        });
    } catch (e) {
        console.error('GET /dashboard-data error:', e);
        res.status(500).json({ error: 'Gagal memuat data dashboard admin.' });
    }
});

router.get('/users', (req, res) => {
    try {
        const db = req.app.locals.db;
        const users = db.prepare(`
            SELECT id, username, display_name, role, xp, level, streak_days, last_active,
                   phone_number, semester, fakultas, jurusan, mapel_prioritas, onboarding_completed_at
            FROM users
            ORDER BY id
        `).all();
        res.json(users);
    } catch (e) { console.error('GET /users error:', e); res.status(500).json({ error: e.message }); }
});

router.put('/users/:id/password', async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: 'Password minimal 8 karakter' });
        }
        const password_hash = await bcrypt.hash(newPassword, 10);
        const db = req.app.locals.db;
        const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.params.id);
        if (info.changes === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
        res.json({ ok: true });
    } catch (e) { console.error('PUT /users/password error:', e); res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const userId = parsePositiveId(req.params.id);
        if (!userId) return res.status(400).json({ error: 'ID user tidak valid.' });

        const db = req.app.locals.db;
        const user = readUser(db, userId);
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

        const password_hash = await bcrypt.hash(DEFAULT_ADMIN_RESET_PASSWORD, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, userId);
        res.json({ ok: true, userId, temporaryPassword: DEFAULT_ADMIN_RESET_PASSWORD });
    } catch (e) {
        console.error('POST /users/reset-password error:', e);
        res.status(500).json({ error: 'Gagal reset password user.' });
    }
});

router.post('/users/:id/grant-access', (req, res) => {
    try {
        const userId = parsePositiveId(req.params.id);
        if (!userId) return res.status(400).json({ error: 'ID user tidak valid.' });

        const accessType = normalizeAccessType(req.body.access_type || req.body.accessType);
        const accessValue = normalizeAccessValue(req.body.access_value || req.body.accessValue);
        if (!accessType) return res.status(400).json({ error: 'Tipe akses tidak valid.' });
        if (!accessValue) return res.status(400).json({ error: 'Nilai akses wajib diisi dan maksimal 120 karakter.' });

        const db = req.app.locals.db;
        const user = readUser(db, userId);
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

        const existing = db.prepare(`
            SELECT id
            FROM user_access_grants
            WHERE user_id = ? AND access_type = ? AND access_value = ?
        `).get(userId, accessType, accessValue);
        if (existing) {
            return res.json({ ok: true, id: existing.id, duplicate: true });
        }

        const info = db.prepare(`
            INSERT INTO user_access_grants (user_id, access_type, access_value)
            VALUES (?, ?, ?)
        `).run(userId, accessType, accessValue);
        res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
        console.error('POST /users/grant-access error:', e);
        res.status(500).json({ error: 'Gagal memberi akses user.' });
    }
});

router.post('/users/:id/role', (req, res) => {
    try {
        const userId = parsePositiveId(req.params.id);
        if (!userId) return res.status(400).json({ error: 'ID user tidak valid.' });

        const role = String(req.body.role || '').trim().toLowerCase();
        if (!USER_ROLES.has(role)) return res.status(400).json({ error: 'Role tidak valid.' });
        if (req.session.userId === userId && role !== 'admin') {
            return res.status(400).json({ error: 'Tidak bisa mencabut akses admin dari akun sendiri.' });
        }

        const db = req.app.locals.db;
        const user = readUser(db, userId);
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
        res.json({ ok: true, userId, role });
    } catch (e) {
        console.error('POST /users/role error:', e);
        res.status(500).json({ error: 'Gagal mengubah role user.' });
    }
});

router.delete('/users/:id', (req, res) => {
    try {
        const userId = parsePositiveId(req.params.id);
        if (!userId) return res.status(400).json({ error: 'ID user tidak valid.' });

        const currentUserId = Number(req.userId || (req.session && req.session.userId));
        if (currentUserId === userId) {
            return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri.' });
        }

        const db = req.app.locals.db;
        const user = readUser(db, userId);
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
        if (user.role === 'admin') {
            return res.status(400).json({ error: 'Akun admin tidak bisa dihapus dari panel ini.' });
        }

        const info = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        res.json({ ok: true, userId, deleted: info.changes });
    } catch (e) {
        console.error('DELETE /users error:', e);
        res.status(500).json({ error: 'Gagal menghapus user.' });
    }
});

module.exports = router;
