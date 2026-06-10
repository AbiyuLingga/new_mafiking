const express = require('express');
const bcrypt = require('bcrypt');
const xss = require('xss');
const { mergeGuestIntoUser, readUser } = require('../lib/clerk-user-sync');
const { sendMail, getConfig: getMailerConfig } = require('../lib/mailer');
const { renderVerifyEmail } = require('../lib/email-templates');
const {
    canResend,
    createOrRefreshVerification,
    consumeVerificationToken,
    RESEND_COOLDOWN_MS,
} = require('../lib/email-verification');
const router = express.Router();

const FACULTY_OPTIONS = new Set(['FMIPA', 'FITB', 'FTMD', 'FTTM', 'FTSL', 'FTI', 'SF', 'SAPPK', 'SITH-S', 'SITH-R', 'STEI-R', 'STEI-K']);
const PRIORITY_SUBJECTS = new Set(['Matematika', 'Fisika', 'Kimia']);
const REFERRAL_OPTIONS = new Set(['Instagram', 'WhatsApp/Line', 'Teman', 'Orang Tua']);
const REFERRAL_OTHER_PREFIX = 'Lainnya: ';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

function buildVerifyUrl(req, token) {
    const base = process.env.PUBLIC_BASE_URL
        || (process.env.NODE_ENV === 'production' ? 'https://mafiking.com' : `${req.protocol}://${req.get('host')}`);
    return `${String(base).replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail(req, db, user) {
    if (!user || !user.id || !user.username) return { ok: false, error: 'User verifikasi tidak valid' };
    const { token } = createOrRefreshVerification(db, user.id);
    const verifyUrl = buildVerifyUrl(req, token);
    const appUrl = process.env.PUBLIC_BASE_URL || 'https://mafiking.com';
    const tpl = renderVerifyEmail({
        displayName: user.display_name,
        verifyUrl,
        appUrl,
    });
    try {
        if (getMailerConfig().dryRun) {
            console.info(`[auth:verify-email:dry-run] ${verifyUrl}`);
        }
        await sendMail({ to: user.username, subject: tpl.subject, html: tpl.html, text: tpl.text });
        return { ok: true };
    } catch (err) {
        console.error('[auth] verification email failed', { username: user.username, code: err && err.code });
        return { ok: false, error: err && err.message };
    }
}

function cooldownSeconds(ms = RESEND_COOLDOWN_MS) {
    return Math.max(1, Math.ceil(Number(ms || 0) / 1000));
}

function makeWindowLimiter({ max, windowMs, message }) {
    const attempts = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of attempts) {
            if (now - value.firstAttempt > windowMs) attempts.delete(key);
        }
    }, windowMs).unref?.();

    return function windowLimiter(req, res, next) {
        const key = req.ip || req.get('x-forwarded-for') || 'unknown';
        const now = Date.now();
        const current = attempts.get(key);
        if (!current || now - current.firstAttempt > windowMs) {
            attempts.set(key, { count: 1, firstAttempt: now });
            return next();
        }
        current.count += 1;
        if (current.count > max) {
            return res.status(429).json({ error: message });
        }
        return next();
    };
}

const resendVerificationLimiter = makeWindowLimiter({
    max: 3,
    windowMs: 10 * 60 * 1000,
    message: 'Terlalu banyak permintaan email verifikasi. Coba lagi nanti.',
});

const verifyEmailLimiter = makeWindowLimiter({
    max: 10,
    windowMs: 10 * 60 * 1000,
    message: 'Terlalu banyak percobaan verifikasi. Coba lagi nanti.',
});

// --- Brute force protection (per-username) ---
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 menit

const loginAttemptsCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of loginAttempts) {
        if (now - val.lastAttempt > LOCKOUT_MS) loginAttempts.delete(key);
    }
}, 10 * 60 * 1000);
if (typeof loginAttemptsCleanup.unref === 'function') loginAttemptsCleanup.unref();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Email dan password diperlukan' });
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
        return res.status(401).json({ error: 'Email belum terdaftar' });
    }

    if (String(user.auth_provider || '') === 'clerk' && String(user.password_hash || '') === 'clerk') {
        return res.status(401).json({ error: 'Akun ini terdaftar dengan Google. Silakan login dengan Google.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
        const current = loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
        current.count += 1;
        current.lastAttempt = Date.now();
        loginAttempts.set(username, current);
        return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Beta mode: batasi akses hanya ke akun tertentu (admin selalu bisa masuk)
    const betaUser = process.env.BETA_USERNAME;
    if (betaUser && user.role !== 'admin' && user.username !== betaUser) {
        return res.status(401).json({ error: 'Email atau password salah' });
    }

    loginAttempts.delete(username);

    const mustVerify = String(user.auth_provider || 'local') === 'local'
        && user.role !== 'admin'
        && !user.email_verified_at;
    if (mustVerify) {
        const cooldown = canResend(user.email_verification_last_sent_at);
        let nextCooldownSeconds = cooldownSeconds(cooldown.cooldownMs);
        if (cooldown.allowed) {
            await sendVerificationEmail(req, db, user);
            nextCooldownSeconds = cooldownSeconds();
        }
        return res.json({
            ok: false,
            requiresVerification: true,
            email: user.username,
            displayName: user.display_name,
            cooldownSeconds: nextCooldownSeconds,
        });
    }

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
router.post('/register', async (req, res) => {
    const email = String(req.body.email || req.body.username || '').trim().toLowerCase();
    const { password, fakultas } = req.body;
    const display_name = String(req.body.display_name || email.split('@')[0] || email).trim();
    if (!email || !password || !display_name) {
        return res.status(400).json({ error: 'Email dan password diperlukan' });
    }

    // Input validation
    if (!EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ error: 'Email tidak valid' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password minimal 8 karakter' });
    }
    if (email.length > 255) {
        return res.status(400).json({ error: 'Email terlalu panjang (max 255 karakter)' });
    }
    if (display_name.length > 100) {
        return res.status(400).json({ error: 'Nama terlalu panjang (max 100 karakter)' });
    }

    // Sanitasi XSS
    const safeDisplayName = xss(display_name);
    const safeFakultas = xss(fakultas || '');
    const safeUsername = xss(email);

    const db = req.app.locals.db;

    // Check if username already exists
    const existingUser = db.prepare(`
        SELECT id, username, display_name, email_verified_at, auth_provider, role, email_verification_last_sent_at
        FROM users
        WHERE username = ?
    `).get(safeUsername);
    if (existingUser) {
        const isPendingLocal = !existingUser.email_verified_at
            && String(existingUser.auth_provider || 'local') === 'local'
            && existingUser.role !== 'admin';
        if (isPendingLocal) {
            const cooldown = canResend(existingUser.email_verification_last_sent_at);
            let nextCooldownSeconds = cooldownSeconds(cooldown.cooldownMs);
            if (cooldown.allowed) {
                const sent = await sendVerificationEmail(req, db, existingUser);
                if (!sent.ok) {
                    return res.status(502).json({ error: 'Email verifikasi gagal dikirim. Cek konfigurasi SMTP lalu coba lagi.' });
                }
                nextCooldownSeconds = cooldownSeconds();
            }
            return res.json({
                ok: true,
                requiresVerification: true,
                email: existingUser.username,
                displayName: existingUser.display_name,
                cooldownSeconds: nextCooldownSeconds,
            });
        }
        return res.status(400).json({ error: 'Username (Email) sudah terdaftar' });
    }

    const password_hash = bcrypt.hashSync(password, 10);

    try {
        const info = db.prepare(`
            INSERT INTO users (username, email, password_hash, display_name, fakultas, role, auth_provider, email_verified_at)
            VALUES (?, ?, ?, ?, ?, 'user', 'local', NULL)
        `).run(safeUsername, safeUsername, password_hash, safeDisplayName, safeFakultas);

        const sent = await sendVerificationEmail(req, db, {
            id: Number(info.lastInsertRowid),
            username: safeUsername,
            display_name: safeDisplayName,
        });
        if (!sent.ok) {
            db.prepare('DELETE FROM users WHERE id = ? AND email_verified_at IS NULL').run(Number(info.lastInsertRowid));
            return res.status(502).json({ error: 'Email verifikasi gagal dikirim. Cek konfigurasi SMTP lalu coba lagi.' });
        }
        res.json({
            ok: true,
            requiresVerification: true,
            email: safeUsername,
            displayName: safeDisplayName,
            cooldownSeconds: cooldownSeconds(),
        });
    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ error: 'Terjadi kesalahan sistem' });
    }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', resendVerificationLimiter, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const generic = { ok: true, cooldownSeconds: cooldownSeconds() };
    if (!email || !EMAIL_PATTERN.test(email)) return res.json(generic);

    const db = req.app.locals.db;
    const user = db.prepare(`
        SELECT id, username, display_name, email_verified_at, auth_provider, role,
               email_verification_last_sent_at
        FROM users
        WHERE lower(username) = lower(?) OR lower(email) = lower(?)
        ORDER BY id
        LIMIT 1
    `).get(email, email);

    if (!user || user.email_verified_at || String(user.auth_provider || 'local') !== 'local' || user.role === 'admin') {
        return res.json(generic);
    }

    const cooldown = canResend(user.email_verification_last_sent_at);
    if (!cooldown.allowed) {
        return res.json({ ok: true, cooldownSeconds: cooldownSeconds(cooldown.cooldownMs) });
    }

    await sendVerificationEmail(req, db, user);
    return res.json(generic);
});

// POST /api/auth/verify-email
router.post('/verify-email', verifyEmailLimiter, (req, res) => {
    const token = String(req.body && req.body.token || '').trim();
    if (!token) return res.status(400).json({ ok: false, reason: 'missing_token' });

    const db = req.app.locals.db;
    const result = consumeVerificationToken(db, token);
    if (!result.ok) {
        return res.status(400).json({ ok: false, reason: result.reason });
    }

    const user = db.prepare('SELECT id, role, email, username FROM users WHERE id = ?').get(result.userId);
    if (!user) return res.status(404).json({ ok: false, reason: 'user_not_found' });
    req.session.userId = user.id;
    req.session.role = user.role || 'user';
    req.session.save((err) => {
        if (err) return res.status(500).json({ ok: false, reason: 'session_error' });
        res.json({ ok: true, role: req.session.role, email: user.email || user.username || '', redirect: '/' });
    });
});

router.get('/verify-email', verifyEmailLimiter, (_req, res) => {
    res.status(405).json({ ok: false, reason: 'method_not_allowed' });
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
