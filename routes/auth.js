const express = require('express');
const bcrypt = require('bcrypt');
const xss = require('xss');
const router = express.Router();

// --- Brute force protection (per-username) ---
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 menit

setInterval(() => {
    const now = Date.now();
    for (const [key, val] of loginAttempts) {
        if (now - val.lastAttempt > LOCKOUT_MS) loginAttempts.delete(key);
    }
}, 10 * 60 * 1000);

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username dan password diperlukan' });
    }

    // Cek lockout
    const now = Date.now();
    const attempts = loginAttempts.get(username);
    if (attempts && attempts.count >= MAX_ATTEMPTS && (now - attempts.lastAttempt) < LOCKOUT_MS) {
        const remainingSec = Math.ceil((LOCKOUT_MS - (now - attempts.lastAttempt)) / 1000);
        return res.status(429).json({
            error: `Terlalu banyak percobaan. Coba lagi dalam ${remainingSec} detik.`
        });
    }

    const db = req.app.locals.db;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
        const current = loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
        current.count += 1;
        current.lastAttempt = Date.now();
        loginAttempts.set(username, current);
        return res.status(401).json({ error: 'Username atau password salah' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
        const current = loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
        current.count += 1;
        current.lastAttempt = Date.now();
        loginAttempts.set(username, current);
        return res.status(401).json({ error: 'Username atau password salah' });
    }

    // Beta mode: batasi akses hanya ke akun tertentu (admin selalu bisa masuk)
    const betaUser = process.env.BETA_USERNAME;
    if (betaUser && user.role !== 'admin' && user.username !== betaUser) {
        return res.status(401).json({ error: 'Username atau password salah' });
    }

    loginAttempts.delete(username);

    db.prepare('UPDATE users SET last_active = date(?) WHERE id = ?')
        .run(new Date().toISOString().split('T')[0], user.id);

    req.session.userId = user.id;
    req.session.role = user.role;

    req.session.save(err => {
        if (err) return res.status(500).json({ error: 'Session error' });
        res.json({
            ok: true,
            role: user.role,
            redirect: user.role === 'admin' ? '/admin.html' : '/app.html'
        });
    });
});

// POST /api/auth/register
router.post('/register', (req, res) => {
    const { username, password, display_name, fakultas } = req.body;
    if (!username || !password || !display_name) {
        return res.status(400).json({ error: 'Username, password, dan nama diperlukan' });
    }

    // Input validation
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password minimal 8 karakter' });
    }
    if (username.length > 255) {
        return res.status(400).json({ error: 'Username terlalu panjang (max 255 karakter)' });
    }
    if (display_name.length > 100) {
        return res.status(400).json({ error: 'Nama terlalu panjang (max 100 karakter)' });
    }

    // Sanitasi XSS
    const safeDisplayName = xss(display_name);
    const safeFakultas = xss(fakultas || '');
    const safeUsername = xss(username);

    const db = req.app.locals.db;

    // Check if username already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(safeUsername);
    if (existingUser) {
        return res.status(400).json({ error: 'Username (Email) sudah terdaftar' });
    }

    const password_hash = bcrypt.hashSync(password, 10);

    try {
        const info = db.prepare('INSERT INTO users (username, password_hash, display_name, fakultas, role) VALUES (?, ?, ?, ?, ?)')
            .run(safeUsername, password_hash, safeDisplayName, safeFakultas, 'user');

        // Log the user in immediately
        req.session.userId = info.lastInsertRowid;
        req.session.role = 'user';

        res.json({
            ok: true,
            role: 'user',
            redirect: '/app.html'
        });
    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ error: 'Terjadi kesalahan sistem' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ ok: true });
    });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Belum login' });
    }

    const db = req.app.locals.db;
    const user = db.prepare(
        'SELECT id, username, display_name, fakultas, role, xp, level, badge_tier, streak_days, highest_streak, last_active FROM users WHERE id = ?'
    ).get(req.session.userId);

    if (!user) {
        return res.status(401).json({ error: 'User tidak ditemukan' });
    }

    res.json(user);
});

module.exports = router;
