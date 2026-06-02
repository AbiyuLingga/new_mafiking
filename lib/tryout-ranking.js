function normalizeTryoutText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeTryoutAnswer(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^0-9a-z+\-*/=().,]/g, '');
}

function safeInitials(name) {
    const initials = String(name || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    return initials || 'U';
}

function clampInteger(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, Math.round(number)));
}

function parseChoices(rawOptions) {
    if (Array.isArray(rawOptions)) return rawOptions.filter((item) => item != null).map(String);
    if (typeof rawOptions !== 'string' || !rawOptions.trim()) return [];
    try {
        const parsed = JSON.parse(rawOptions);
        return Array.isArray(parsed) ? parsed.filter((item) => item != null).map(String) : [];
    } catch (_) {
        return [];
    }
}

function getTryoutChoices(problem, sessionProblems) {
    const parsedChoices = parseChoices(problem && problem.mc_options);
    if (parsedChoices.length) return parsedChoices;
    return buildTryoutGeneratedChoices(problem, sessionProblems);
}

function buildTryoutGeneratedChoices(problem, problems) {
    const correct = problem && (problem.answer_display || problem.answer_text || '');
    if (!correct) return [];
    const seen = new Set([normalizeTryoutAnswer(correct)]);
    const distractors = [];
    for (const candidate of problems || []) {
        if (!candidate || candidate.id === problem.id) continue;
        const answer = candidate.answer_display || candidate.answer_text || '';
        const normalized = normalizeTryoutAnswer(answer);
        if (!answer || !normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        distractors.push(answer);
    }
    const choices = [correct, ...shuffleTryoutChoices(distractors, hashTryoutValue(`${problem.id}:${correct}`)).slice(0, 4)];
    return shuffleTryoutChoices(choices.slice(0, 5), hashTryoutValue(`choice:${problem.id}:${correct}`));
}

function hashTryoutValue(value) {
    return String(value || '').split('').reduce((hash, char) => {
        return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    }, 0);
}

function shuffleTryoutChoices(items, seed) {
    const shuffled = [...items];
    let state = Math.abs(seed) || 1;
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        state = (state * 1664525 + 1013904223) >>> 0;
        const j = state % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function normalizeTryoutAttemptInput(body) {
    const tryoutId = String(body && body.tryoutId || '').trim().slice(0, 120);
    const tryoutTitle = String(body && body.tryoutTitle || 'Try Out').trim().slice(0, 160) || 'Try Out';
    const sessionToken = String(body && body.sessionToken || '').trim();
    const problemIds = Array.isArray(body && body.problemIds)
        ? body.problemIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0).slice(0, 100)
        : [];
    const rawAnswers = body && body.answers && typeof body.answers === 'object' ? body.answers : {};
    const answers = {};
    for (const id of problemIds) {
        const value = rawAnswers[id] == null ? rawAnswers[String(id)] : rawAnswers[id];
        if (value == null || value === '') continue;
        answers[id] = clampInteger(value, 0, 20);
    }
    const durationSeconds = clampInteger(body && body.durationSeconds, 0, 24 * 60 * 60);
    return { tryoutId, tryoutTitle, sessionToken, problemIds, answers, durationSeconds };
}

function calculateTryoutAttemptStats({ problems, answers }) {
    const sessionProblems = Array.isArray(problems) ? problems : [];
    let correctCount = 0;
    let answeredCount = 0;

    for (const problem of sessionProblems) {
        if (!problem) continue;
        const selectedChoiceIndex = answers ? answers[problem.id] : null;
        if (!Number.isInteger(selectedChoiceIndex)) continue;
        answeredCount += 1;

        const choices = getTryoutChoices(problem, sessionProblems);
        const selected = choices[selectedChoiceIndex];
        const correct = problem.answer_display || problem.answer_text || '';
        if (normalizeTryoutAnswer(selected) && normalizeTryoutAnswer(selected) === normalizeTryoutAnswer(correct)) {
            correctCount += 1;
        }
    }

    const totalQuestions = sessionProblems.length;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    return { score, correctCount, totalQuestions, answeredCount };
}

function rankTryoutLeaderboardRows(rows, currentUserId) {
    const bestByUser = new Map();
    for (const row of rows || []) {
        if (!row || bestByUser.has(row.user_id)) continue;
        bestByUser.set(row.user_id, row);
    }
    return [...bestByUser.values()].map((row, index) => ({
        rank: index + 1,
        id: row.user_id,
        display_name: row.display_name || 'User',
        fakultas: row.fakultas || '',
        initials: safeInitials(row.display_name),
        score: Number(row.score) || 0,
        correct_count: Number(row.correct_count) || 0,
        total_questions: Number(row.total_questions) || 0,
        answered_count: Number(row.answered_count) || 0,
        duration_seconds: Number(row.duration_seconds) || 0,
        completed_at: row.completed_at,
        isMe: row.user_id === currentUserId
    }));
}

module.exports = {
    calculateTryoutAttemptStats,
    getTryoutChoices,
    normalizeTryoutAnswer,
    normalizeTryoutAttemptInput,
    normalizeTryoutText,
    rankTryoutLeaderboardRows,
    safeInitials
};
