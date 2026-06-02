const express = require('express');
const { isAuthenticated, requireRegisteredUser } = require('../middleware/auth');
const {
    calculateTryoutAttemptStats,
    normalizeTryoutAttemptInput,
    rankTryoutLeaderboardRows,
    safeInitials
} = require('../lib/tryout-ranking');
const router = express.Router();

// POST /api/progress/submit — submit answer
router.post('/submit', isAuthenticated, requireRegisteredUser, (req, res) => {
    const {
        problemId,
        correct,
        hintsUsed,
        mode,
        selectedAnswer,
        correctAnswer,
        selectedChoiceIndex,
        correctChoiceIndex
    } = req.body;
    const userId = req.session.userId;
    const db = req.app.locals.db;

    if (!problemId) {
        return res.status(400).json({ error: 'problemId diperlukan' });
    }

    // Check problem exists
    const problem = db.prepare('SELECT id, difficulty FROM problems WHERE id = ?').get(problemId);
    if (!problem) {
        return res.status(404).json({ error: 'Soal tidak ditemukan' });
    }

    recordPracticeAttempt(db, {
        correct,
        correctAnswer,
        correctChoiceIndex,
        hintsUsed,
        mode,
        problemId,
        selectedAnswer,
        selectedChoiceIndex,
        userId
    });

    const levelBefore = getUserProgressStats(db, userId).level;

    // Upsert progress
    const existing = db.prepare(
        'SELECT * FROM user_progress WHERE user_id = ? AND problem_id = ?'
    ).get(userId, problemId);

    const baseXP = problem.difficulty === 'Hard' ? 100 : problem.difficulty === 'Medium' ? 50 : 20;
    // Pity XP: minimum 10% dari baseXP agar usaha tetap dihargai
    const pityXP = Math.round(baseXP * 0.10);
    // Penalti salah: 10% dari baseXP per kesalahan (dikurangi langsung dari XP user)
    const mistakePenalty = Math.round(baseXP * 0.10);

    let xpEarned = 0;
    let xpPenalty = 0;

    function calcXP(mistakes, hints) {
        // Penalti hint: progresif 15%, 20%, 25%, dst.
        let hintPenalty = 0;
        for (let i = 0; i < hints; i++) hintPenalty += 5 + (i * 3);

        // Penalti salah: progresif 10%, 20%, 30%, dst.
        let mp = 0;
        for (let i = 0; i < mistakes; i++) mp += 10 + (i * 10);

        const totalPenalty = Math.min(90, hintPenalty + mp);
        return Math.max(pityXP, Math.round(baseXP * (1 - totalPenalty / 100)));
    }

    if (existing) {
        if (existing.solved) {
            // Soal sudah pernah diselesaikan — tidak ada XP tambahan, tidak ada penalti
            // (tidak update attempts agar tidak merusak statistik)
        } else if (correct) {
            // Pertama kali benar setelah beberapa percobaan
            const mistakes = existing.attempts;
            xpEarned = calcXP(mistakes, hintsUsed || 0);

            db.prepare(
                'UPDATE user_progress SET solved = 1, attempts = attempts + 1, hints_used = MAX(hints_used, ?), xp_earned = ?, solved_at = datetime(?) WHERE user_id = ? AND problem_id = ?'
            ).run(hintsUsed || 0, xpEarned, new Date().toISOString(), userId, problemId);

            db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(xpEarned, userId);
            updateLevel(db, userId);
        } else {
            // Jawaban salah, soal belum solved — tambah attempts dan kurangi XP
            xpPenalty = mistakePenalty;
            db.prepare(
                'UPDATE user_progress SET attempts = attempts + 1, hints_used = MAX(hints_used, ?) WHERE user_id = ? AND problem_id = ?'
            ).run(hintsUsed || 0, userId, problemId);

            db.prepare('UPDATE users SET xp = MAX(0, xp - ?) WHERE id = ?').run(xpPenalty, userId);
            updateLevel(db, userId);
        }
    } else {
        if (correct) {
            xpEarned = calcXP(0, hintsUsed || 0);
            db.prepare(
                'INSERT INTO user_progress (user_id, problem_id, solved, attempts, hints_used, xp_earned, solved_at) VALUES (?, ?, 1, 1, ?, ?, datetime(?))'
            ).run(userId, problemId, hintsUsed || 0, xpEarned, new Date().toISOString());

            db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(xpEarned, userId);
            updateLevel(db, userId);
        } else {
            // Percobaan pertama salah — insert dan kurangi XP
            xpPenalty = mistakePenalty;
            db.prepare(
                'INSERT INTO user_progress (user_id, problem_id, solved, attempts, hints_used, xp_earned, solved_at) VALUES (?, ?, 0, 1, ?, 0, NULL)'
            ).run(userId, problemId, hintsUsed || 0);

            db.prepare('UPDATE users SET xp = MAX(0, xp - ?) WHERE id = ?').run(xpPenalty, userId);
            updateLevel(db, userId);
        }
    }

    // --- Streak Logic with 2-day tolerance ---
    const todayStr = new Date().toISOString().split('T')[0];
    const userToVerify = db.prepare('SELECT streak_days, highest_streak, last_play_date FROM users WHERE id = ?').get(userId);
    
    let streakDays = userToVerify.streak_days || 0;
    let highestStreak = userToVerify.highest_streak || 0;
    
    if (userToVerify.last_play_date) {
        const lastPlay = new Date(userToVerify.last_play_date + 'T00:00:00Z');
        const today = new Date(todayStr + 'T00:00:00Z');
        const diffTime = today.getTime() - lastPlay.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0 && diffDays <= 3) {
            streakDays += 1;
        } else if (diffDays > 3) {
            streakDays = 1;
        }
    } else {
        streakDays = 1;
    }
    
    if (streakDays > highestStreak) {
        highestStreak = streakDays;
    }
    
    db.prepare('UPDATE users SET streak_days = ?, highest_streak = ?, last_play_date = date(?), last_active = date(?) WHERE id = ?')
        .run(streakDays, highestStreak, todayStr, todayStr, userId);

    const user = getUserProgressStats(db, userId);

    res.json({
        ok: true,
        xpEarned,
        xpPenalty,
        totalXp: user.xp,
        level: user.level,
        streakDays: user.streak_days,
        highestStreak: user.highest_streak,
        levelProgress: user.level_progress,
        xpCurrentLevel: user.xp_current_level,
        xpNextLevel: user.xp_next_level,
        xpToNextLevel: user.xp_to_next_level,
        leveledUp: user.level > levelBefore
    });
});

function recordPracticeAttempt(db, {
    correct,
    correctAnswer,
    correctChoiceIndex,
    hintsUsed,
    mode,
    problemId,
    selectedAnswer,
    selectedChoiceIndex,
    userId
}) {
    const normalizedMode = ['choice', 'canvas'].includes(String(mode || '').trim())
        ? String(mode).trim()
        : 'choice';
    db.prepare(`
        INSERT INTO practice_attempts (
            user_id,
            problem_id,
            mode,
            correct,
            selected_answer,
            correct_answer,
            selected_choice_index,
            correct_choice_index,
            hints_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        userId,
        problemId,
        normalizedMode,
        correct ? 1 : 0,
        String(selectedAnswer || ''),
        String(correctAnswer || ''),
        Number.isInteger(selectedChoiceIndex) ? selectedChoiceIndex : null,
        Number.isInteger(correctChoiceIndex) ? correctChoiceIndex : null,
        Math.max(0, Number(hintsUsed) || 0)
    );
}

// GET /api/progress/me — all progress for current user
router.get('/me', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const progress = db.prepare(
        'SELECT up.*, p.subtopic_id FROM user_progress up JOIN problems p ON up.problem_id = p.id WHERE up.user_id = ?'
    ).all(req.session.userId);
    res.json(progress);
});

// GET /api/progress/stats — user stats
router.get('/stats', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;

    const user = getUserProgressStats(db, userId);

    const totalProblems = db.prepare('SELECT COUNT(*) as count FROM problems').get().count;
    const solvedProblems = db.prepare(
        'SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND solved = 1'
    ).get(userId).count;

    res.json({
        xp: user.xp,
        level: user.level,
        streak_days: user.streak_days,
        highest_streak: user.highest_streak,
        level_progress: user.level_progress,
        xp_current_level: user.xp_current_level,
        xp_next_level: user.xp_next_level,
        xp_to_next_level: user.xp_to_next_level,
        totalProblems,
        solvedProblems,
        mastery: totalProblems > 0 ? Math.round((solvedProblems / totalProblems) * 100) : 0
    });
});

// GET /api/progress/leaderboard — semua user (bukan admin) diurutkan berdasarkan XP
router.get('/leaderboard', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const currentUserId = req.session.userId;

    const users = db.prepare(
        `SELECT id, display_name, fakultas, xp, level, badge_tier, streak_days
         FROM users
         WHERE role != 'admin'
         ORDER BY xp DESC`
    ).all();

    const result = users.map((u, i) => ({
        rank: i + 1,
        id: u.id,
        display_name: u.display_name,
        fakultas: u.fakultas || '',
        initials: safeInitials(u.display_name),
        xp: u.xp,
        level: u.level,
        badge_tier: u.badge_tier || 0,
        streak_days: u.streak_days,
        isMe: u.id === currentUserId
    }));

    res.json(result);
});

// GET /api/progress/leaderboard/weekly — top skor mingguan (reset tiap Senin)
router.get('/leaderboard/weekly', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const currentUserId = req.session.userId;

    // Hitung awal minggu (Senin 00:00)
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon, ...
    const diff = day === 0 ? 6 : day - 1; // Senin = 0
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.toISOString();

    const users = db.prepare(
        `SELECT u.id, u.display_name, u.fakultas, u.level, u.badge_tier, u.streak_days,
                COALESCE(SUM(up.xp_earned), 0) AS weekly_xp
         FROM users u
         LEFT JOIN user_progress up ON up.user_id = u.id AND up.solved_at >= ?
         WHERE u.role != 'admin'
         GROUP BY u.id
         HAVING weekly_xp > 0
         ORDER BY weekly_xp DESC`
    ).all(weekStart);

    const result = users.map((u, i) => ({
        rank: i + 1,
        id: u.id,
        display_name: u.display_name,
        fakultas: u.fakultas || '',
        initials: safeInitials(u.display_name),
        xp: u.weekly_xp,
        level: u.level,
        badge_tier: u.badge_tier || 0,
        streak_days: u.streak_days,
        isMe: u.id === currentUserId
    }));

    res.json(result);
});

// POST /api/progress/tryout-attempts — simpan hasil tryout dari jawaban user
router.post('/tryout-attempts', isAuthenticated, requireRegisteredUser, (req, res) => {
    const db = req.app.locals.db;
    const userId = req.session.userId;
    const input = normalizeTryoutAttemptInput(req.body || {});

    if (!input.tryoutId) {
        return res.status(400).json({ error: 'tryoutId diperlukan' });
    }
    if (!input.problemIds.length) {
        return res.status(400).json({ error: 'Daftar soal tryout kosong' });
    }

    const placeholders = input.problemIds.map(() => '?').join(',');
    const problemRows = db.prepare(
        `SELECT id, answer_text, answer_display, mc_options
         FROM problems
         WHERE id IN (${placeholders})`
    ).all(...input.problemIds);
    const problemsById = new Map(problemRows.map((problem) => [problem.id, problem]));
    const orderedProblems = input.problemIds
        .map((id) => problemsById.get(id))
        .filter(Boolean);

    if (orderedProblems.length !== input.problemIds.length) {
        return res.status(400).json({ error: 'Sebagian soal tryout tidak ditemukan' });
    }

    const stats = calculateTryoutAttemptStats({
        problems: orderedProblems,
        answers: input.answers,
    });

    const info = db.prepare(`
        INSERT INTO tryout_attempts (
            user_id,
            tryout_id,
            tryout_title,
            score,
            correct_count,
            total_questions,
            answered_count,
            duration_seconds,
            completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(?))
    `).run(
        userId,
        input.tryoutId,
        input.tryoutTitle,
        stats.score,
        stats.correctCount,
        stats.totalQuestions,
        stats.answeredCount,
        input.durationSeconds,
        new Date().toISOString()
    );

    res.json({
        ok: true,
        attempt: {
            id: info.lastInsertRowid,
            tryoutId: input.tryoutId,
            tryoutTitle: input.tryoutTitle,
            durationSeconds: input.durationSeconds,
            ...stats,
        },
    });
});

// GET /api/progress/leaderboard/tryout — best attempt per user untuk satu tryout
router.get('/leaderboard/tryout', isAuthenticated, (req, res) => {
    const db = req.app.locals.db;
    const currentUserId = req.session.userId;
    const tryoutId = String(req.query.tryoutId || 'free-math-tryout-15').trim().slice(0, 120);

    if (!tryoutId) {
        return res.status(400).json({ error: 'tryoutId diperlukan' });
    }

    const rows = db.prepare(`
        SELECT
            ta.user_id,
            ta.score,
            ta.correct_count,
            ta.total_questions,
            ta.answered_count,
            ta.duration_seconds,
            ta.completed_at,
            u.display_name,
            u.fakultas
        FROM tryout_attempts ta
        JOIN users u ON u.id = ta.user_id
        WHERE ta.tryout_id = ? AND u.role != 'admin'
        ORDER BY ta.score DESC, ta.correct_count DESC, ta.duration_seconds ASC, ta.completed_at ASC, ta.id ASC
    `).all(tryoutId);

    res.json(rankTryoutLeaderboardRows(rows, currentUserId));
});

function updateLevel(db, userId) {
    const user = db.prepare('SELECT xp FROM users WHERE id = ?').get(userId);
    
    let newLevel = calculateLevel(user.xp);
    if (newLevel < 1) newLevel = 1;

    // Badge tier berubah tiap kelipatan 3 level (micro-reward visual)
    // tier: 0=abu, 1=hijau, 2=biru, 3=ungu, 4=kuning, 5=merah
    const badgeTier = Math.min(5, Math.floor((newLevel - 1) / 3));

    db.prepare('UPDATE users SET level = ?, badge_tier = ? WHERE id = ?').run(newLevel, badgeTier, userId);
}

function calculateLevel(xp) {
    const safeXp = Math.max(0, Number(xp) || 0);
    return Math.max(1, Math.floor((Math.sqrt(9 + 0.16 * safeXp) - 1) / 2));
}

function xpRequiredForLevel(level) {
    const safeLevel = Math.max(1, Number(level) || 1);
    if (safeLevel <= 1) return 0;
    return 25 * (safeLevel + 2) * (safeLevel - 1);
}

function getUserProgressStats(db, userId) {
    const row = db.prepare(
        'SELECT xp, level, streak_days, highest_streak FROM users WHERE id = ?'
    ).get(userId) || {};
    const xp = Math.max(0, Number(row.xp) || 0);
    const level = calculateLevel(xp);
    const currentLevelXp = xpRequiredForLevel(level);
    const nextLevelXp = xpRequiredForLevel(level + 1);
    const levelRange = Math.max(1, nextLevelXp - currentLevelXp);
    const levelProgress = Math.max(0, Math.min(100, Math.round(((xp - currentLevelXp) / levelRange) * 100)));
    const badgeTier = Math.min(5, Math.floor((level - 1) / 3));

    if (Number(row.level) !== level) {
        db.prepare('UPDATE users SET level = ?, badge_tier = ? WHERE id = ?').run(level, badgeTier, userId);
    }

    return {
        xp,
        level,
        streak_days: Math.max(0, Number(row.streak_days) || 0),
        highest_streak: Math.max(0, Number(row.highest_streak) || 0),
        level_progress: levelProgress,
        xp_current_level: currentLevelXp,
        xp_next_level: nextLevelXp,
        xp_to_next_level: Math.max(0, nextLevelXp - xp)
    };
}

module.exports = router;
