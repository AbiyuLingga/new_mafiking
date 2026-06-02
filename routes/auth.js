const express = require('express');
const bcrypt = require('bcrypt');
const xss = require('xss');
const { mergeGuestIntoUser, readUser } = require('../lib/clerk-user-sync');
const router = express.Router();

const FACULTY_OPTIONS = new Set(['FMIPA', 'FITB', 'FTMD', 'FTTM', 'FTSL', 'FTI', 'SF', 'SAPPK', 'SITH-S', 'SITH-R', 'STEI-R', 'STEI-K']);
const PRIORITY_SUBJECTS = new Set(['Matematika', 'Fisika', 'Kimia']);
const REFERRAL_OPTIONS = new Set(['Instagram', 'WhatsApp/Line', 'Teman', 'Orang Tua']);
const REFERRAL_OTHER_PREFIX = 'Lainnya: ';
const MAJOR_OPTIONS_BY_FACULTY = {
    FMIPA: new Set(['Matematika', 'Fisika', 'Astronomi', 'Kimia', 'Aktuaria']),
    'SITH-R': new Set(['Rekayasa Hayati', 'Rekayasa Pertanian', 'Rekayasa Kehutanan', 'Teknologi Pasca Panen']),
    'SITH-S': new Set(['Biologi', 'Mikrobiologi']),
    SF: new Set(['Sains dan Teknologi Farmasi', 'Farmasi Klinik dan Komunitas']),
    FITB: new Set(['Teknik Geologi', 'Teknik Geodesi dan Geomatika', 'Meteorologi', 'Oseanografi']),
    FTSL: new Set(['Teknik Sipil', 'Teknik Lingkungan', 'Teknik Kelautan', 'Rekayasa Infrastruktur Lingkungan', 'Teknik dan Pengelolaan Sumber Daya Air']),
    FTI: new Set(['Teknik Kimia', 'Teknik Fisika', 'Teknik Industri', 'Manajemen Rekayasa Industri', 'Teknik Bioenergi dan Kemurgi', 'Teknik Pangan']),
    FTMD: new Set(['Teknik Mesin', 'Teknik Dirgantara', 'Teknik Material']),
    FTTM: new Set(['Teknik Pertambangan', 'Teknik Perminyakan', 'Teknik Geofisika', 'Teknik Metalurgi']),
    'STEI-K': new Set(['Teknik Informatika', 'Sistem dan Teknologi Informasi']),
    'STEI-R': new Set(['Teknik Elektro', 'Teknik Tenaga Listrik', 'Teknik Telekomunikasi', 'Teknik Biomedis']),
    SAPPK: new Set(['Arsitektur', 'Perencanaan Wilayah dan Kota']),
};

function parseMapelPrioritas(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

function normalizeMapelPrioritas(value) {
    const unique = [];
    for (const item of parseMapelPrioritas(value)) {
        const subject = String(item || '').trim();
        if (PRIORITY_SUBJECTS.has(subject) && !unique.includes(subject)) unique.push(subject);
    }
    return unique;
}

function isValidReferralSource(value) {
    const referral = String(value || '').trim();
    if (REFERRAL_OPTIONS.has(referral)) return true;
    if (!referral.startsWith(REFERRAL_OTHER_PREFIX)) return false;
    const other = referral.slice(REFERRAL_OTHER_PREFIX.length).trim();
    return other.length > 0 && other.length <= 80;
}

function isProfileComplete(user) {
    if (!user || user.role === 'admin') return true;
    const displayName = String(user.display_name || '').trim();
    const semester = Number(user.semester || 0);
    const subjects = normalizeMapelPrioritas(user.mapel_prioritas);
    const fakultas = String(user.fakultas || '').trim();
    const jurusan = String(user.jurusan || '').trim();
    const referralSource = String(user.referral_source || '').trim();
    if (!displayName || displayName.startsWith('Tamu_')) return false;
    if (semester < 1 || semester > 2 || subjects.length < 1) return false;
    if (!isValidReferralSource(referralSource)) return false;
    if (!FACULTY_OPTIONS.has(fakultas)) return false;
    if (semester === 1) return true;
    return Boolean(MAJOR_OPTIONS_BY_FACULTY[fakultas] && MAJOR_OPTIONS_BY_FACULTY[fakultas].has(jurusan));
}

function toPublicUser(user, session) {
    const mapelPrioritas = normalizeMapelPrioritas(user && user.mapel_prioritas);
    const profileNeedsCompletion = Boolean(user && user.role !== 'admin' && !isProfileComplete({ ...user, mapel_prioritas: mapelPrioritas }));
    return {
        ...user,
        mapel_prioritas: mapelPrioritas,
        needs_onboarding: false,
        profile_needs_completion: profileNeedsCompletion,
        suggested_display_name: (session && session.clerkSuggestedDisplayName) || (user && user.display_name) || '',
    };
}

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

// POST /api/auth/clerk-onboard
router.post('/clerk-onboard', (req, res) => {
    const userId = req.userId || (req.session && req.session.userId);
    if (!userId || !req.clerkUserId) {
        return res.status(401).json({ error: 'Login Google diperlukan' });
    }

    const displayName = xss(String(req.body.display_name || '').trim());
    if (!displayName) {
        return res.status(400).json({ error: 'Nama tampilan diperlukan' });
    }
    if (displayName.length > 100) {
        return res.status(400).json({ error: 'Nama terlalu panjang (max 100 karakter)' });
    }

    const db = req.app.locals.db;
    try {
        const guestUserId = Number(req.body.guest_user_id || 0);
        if (guestUserId && guestUserId !== Number(userId)) {
            mergeGuestIntoUser(db, guestUserId, Number(userId));
        }

        db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
        if (req.session) {
            req.session.clerkNeedsOnboarding = false;
            req.session.clerkSuggestedDisplayName = '';
        }
        res.json(toPublicUser(readUser(db, userId), req.session));
    } catch (err) {
        console.error('Clerk onboard error:', err);
        res.status(500).json({ error: 'Gagal menyimpan akun Google' });
    }
});

// POST /api/auth/profile-onboarding
router.post('/profile-onboarding', (req, res) => {
    const userId = req.userId || (req.session && req.session.userId);
    if (!userId) {
        return res.status(401).json({ error: 'Login diperlukan.' });
    }

    const displayName = xss(String(req.body.display_name || '').trim());
    const phoneNumber = xss(String(req.body.phone_number || '').trim());
    const semester = Number(req.body.semester || 0);
    const fakultas = xss(String(req.body.fakultas || '').trim());
    const jurusan = xss(String(req.body.jurusan || '').trim());
    const referralSource = xss(String(req.body.referral || req.body.referral_source || '').trim());
    const mapelPrioritas = normalizeMapelPrioritas(req.body.mapel_prioritas || req.body.mapelPrioritas);

    if (!displayName) return res.status(400).json({ error: 'Nama lengkap wajib diisi.' });
    if (displayName.length > 100) return res.status(400).json({ error: 'Nama terlalu panjang (max 100 karakter).' });
    if (phoneNumber && !/^[0-9+\-\s]{8,20}$/.test(phoneNumber)) return res.status(400).json({ error: 'No. HP harus 8-20 karakter dan hanya boleh angka, spasi, +, atau -.' });
    if (!Number.isInteger(semester) || semester < 1 || semester > 2) return res.status(400).json({ error: 'Semester wajib dipilih.' });
    if (!FACULTY_OPTIONS.has(fakultas)) return res.status(400).json({ error: 'Fakultas wajib dipilih.' });
    if (semester === 2 && (!jurusan || jurusan.length > 100)) return res.status(400).json({ error: 'Jurusan wajib diisi dan maksimal 100 karakter.' });
    if (semester === 2 && (!MAJOR_OPTIONS_BY_FACULTY[fakultas] || !MAJOR_OPTIONS_BY_FACULTY[fakultas].has(jurusan))) {
        return res.status(400).json({ error: 'Jurusan tidak sesuai dengan fakultas yang dipilih.' });
    }
    if (mapelPrioritas.length < 1 || mapelPrioritas.length > 3) return res.status(400).json({ error: 'Pilih 1 sampai 3 mapel prioritas.' });
    if (!isValidReferralSource(referralSource)) return res.status(400).json({ error: 'Pilih sumber kamu mengenal Mafiking.' });

    const db = req.app.locals.db;
    try {
        const user = db.prepare('SELECT id, role, password_hash, clerk_id, display_name FROM users WHERE id = ?').get(userId);
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
        if (user.role === 'admin') return res.json(toPublicUser(readUser(db, userId), req.session));
        if (user.password_hash === 'none' && !user.clerk_id && String(user.display_name || '').startsWith('Tamu_')) {
            return res.status(401).json({ error: 'Silakan login atau sign up terlebih dahulu.' });
        }

        db.prepare(`
            UPDATE users
            SET display_name = ?,
                phone_number = ?,
                semester = ?,
                fakultas = ?,
                jurusan = ?,
                mapel_prioritas = ?,
                referral_source = ?,
                onboarding_completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            displayName,
            phoneNumber,
            semester,
            fakultas,
            semester === 1 ? '' : jurusan,
            JSON.stringify(mapelPrioritas),
            referralSource,
            userId
        );

        if (req.session) {
            req.session.clerkNeedsOnboarding = false;
            req.session.clerkSuggestedDisplayName = '';
        }

        res.json(toPublicUser(readUser(db, userId), req.session));
    } catch (err) {
        console.error('Profile onboarding error:', err);
        res.status(500).json({ error: 'Gagal menyimpan data profil.' });
    }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    const userId = req.userId || (req.session && req.session.userId);
    if (!userId) {
        return res.status(401).json({ error: 'Belum login' });
    }

    const db = req.app.locals.db;
    const user = db.prepare(
        'SELECT id, username, display_name, fakultas, phone_number, semester, jurusan, mapel_prioritas, referral_source, onboarding_completed_at, role, xp, level, badge_tier, streak_days, highest_streak, last_active, email, auth_provider FROM users WHERE id = ?'
    ).get(userId);

    if (!user) {
        return res.status(401).json({ error: 'User tidak ditemukan' });
    }

    res.json(toPublicUser(user, req.session));
});

module.exports = router;
