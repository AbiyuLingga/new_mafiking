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

function parseAcceptableAnswers(rawAnswers) {
    if (Array.isArray(rawAnswers)) return rawAnswers.filter((item) => item != null).map(String);
    if (typeof rawAnswers !== 'string' || !rawAnswers.trim()) return [];
    try {
        const parsed = JSON.parse(rawAnswers);
        return Array.isArray(parsed) ? parsed.filter((item) => item != null).map(String) : [];
    } catch (_) {
        return rawAnswers
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean);
    }
}

function normalizeChoiceMap(rawChoiceMap, problemIds) {
    const source = rawChoiceMap && typeof rawChoiceMap === 'object' ? rawChoiceMap : {};
    const allowedIds = new Set((Array.isArray(problemIds) ? problemIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
        .map(String));
    const choiceMap = {};
    for (const [rawId, rawChoices] of Object.entries(source)) {
        const id = Number(rawId);
        if (!Number.isInteger(id) || id <= 0 || (allowedIds.size && !allowedIds.has(String(id)))) continue;
        const choices = Array.isArray(rawChoices)
            ? rawChoices
                .filter((item) => item != null)
                .map((item) => String(item).trim())
                .filter(Boolean)
                .slice(0, 20)
            : [];
        if (choices.length) choiceMap[String(id)] = choices;
    }
    return choiceMap;
}

function getPrimaryCorrectAnswer(problem) {
    const answerDisplay = String(problem && problem.answer_display || '').trim();
    if (answerDisplay) return answerDisplay;
    const acceptable = parseAcceptableAnswers(problem && problem.acceptable_answers);
    return acceptable[0] || '';
}

function isTryoutAnswerCorrect(selectedAnswer, problem) {
    const normalizedSelected = normalizeTryoutAnswer(selectedAnswer);
    if (!normalizedSelected) return false;
    const candidates = [getPrimaryCorrectAnswer(problem), ...parseAcceptableAnswers(problem && problem.acceptable_answers)];
    return candidates.some((candidate) => {
        const normalizedCandidate = normalizeTryoutAnswer(candidate);
        return normalizedCandidate && normalizedSelected === normalizedCandidate;
    });
}

function getTryoutCorrectChoiceIndex(problem, choices) {
    const safeChoices = Array.isArray(choices) ? choices : [];
    return safeChoices.findIndex((choice) => isTryoutAnswerCorrect(choice, problem));
}

function getTryoutChoices(problem, sessionProblems, choiceMap) {
    const snapshotChoices = problem && choiceMap && choiceMap[String(problem.id)];
    if (Array.isArray(snapshotChoices) && snapshotChoices.length) return snapshotChoices;
    const parsedChoices = parseChoices(problem && problem.mc_options);
    if (parsedChoices.length) return parsedChoices;
    return buildTryoutGeneratedChoices(problem, sessionProblems);
}

function buildTryoutGeneratedChoices(problem, problems) {
    const correct = getPrimaryCorrectAnswer(problem);
    if (!correct) return [];
    const seen = new Set([normalizeTryoutAnswer(correct)]);
    const distractors = [];
    for (const candidate of problems || []) {
        if (!candidate || candidate.id === problem.id) continue;
        const answer = getPrimaryCorrectAnswer(candidate);
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
    const choiceMap = normalizeChoiceMap(body && body.choiceMap, problemIds);
    const durationSeconds = clampInteger(body && body.durationSeconds, 0, 24 * 60 * 60);
    return { tryoutId, tryoutTitle, sessionToken, problemIds, answers, choiceMap, durationSeconds };
}

function calculateTryoutAttemptStats({ problems, answers, choiceMap }) {
    const sessionProblems = Array.isArray(problems) ? problems : [];
    let correctCount = 0;
    let answeredCount = 0;

    for (const problem of sessionProblems) {
        if (!problem) continue;
        const selectedChoiceIndex = answers ? answers[problem.id] : null;
        if (!Number.isInteger(selectedChoiceIndex)) continue;
        answeredCount += 1;

        const choices = getTryoutChoices(problem, sessionProblems, choiceMap);
        const selected = choices[selectedChoiceIndex];
        if (isTryoutAnswerCorrect(selected, problem)) {
            correctCount += 1;
        }
    }

    const totalQuestions = sessionProblems.length;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    return { score, correctCount, totalQuestions, answeredCount };
}

function normalizeStepSnapshot(step, index) {
    return {
        step_order: Number(step && step.step_order) || index + 1,
        title: String(step && step.title || `Langkah ${index + 1}`).trim(),
        content: String(step && step.content || '').trim(),
        why: String(step && step.why || '').trim(),
        intuition: String(step && step.intuition || '').trim(),
        mistakes: String(step && step.mistakes || '').trim(),
        mistake_result: String(step && step.mistake_result || '').trim()
    };
}

function buildTryoutReviewSnapshot({ tryoutId, tryoutTitle, questions, answers, choiceMap, durationSeconds }) {
    const sessionQuestions = Array.isArray(questions) ? questions : [];
    const safeAnswers = answers && typeof answers === 'object' ? answers : {};
    const safeChoiceMap = choiceMap && typeof choiceMap === 'object' ? choiceMap : {};
    const stats = calculateTryoutAttemptStats({ problems: sessionQuestions, answers: safeAnswers, choiceMap: safeChoiceMap });

    return {
        tryoutId: String(tryoutId || '').trim(),
        tryoutTitle: String(tryoutTitle || 'Try Out').trim() || 'Try Out',
        durationSeconds: clampInteger(durationSeconds, 0, 24 * 60 * 60),
        stats,
        questions: sessionQuestions.map((question, index) => {
            const choices = getTryoutChoices(question, sessionQuestions, safeChoiceMap);
            const selectedChoiceIndex = Number.isInteger(safeAnswers[question.id]) ? safeAnswers[question.id] : null;
            const selectedAnswer = selectedChoiceIndex == null ? '' : String(choices[selectedChoiceIndex] || '');
            const correctChoiceIndex = getTryoutCorrectChoiceIndex(question, choices);
            const correctAnswer = correctChoiceIndex >= 0
                ? String(choices[correctChoiceIndex] || '')
                : getPrimaryCorrectAnswer(question);
            return {
                id: Number(question.id),
                sourceIndex: Number(question.source_index || question.sort_order || index + 1),
                questionText: String(question.question_text || '').trim(),
                questionDisplay: String(question.question_display || '').trim(),
                imageUrl: String(question.image_url || '').trim(),
                imageAlt: String(question.image_alt || '').trim(),
                difficulty: String(question.difficulty || 'Easy').trim() || 'Easy',
                questionType: String(question.question_type || 'mc').trim() || 'mc',
                choices,
                selectedChoiceIndex,
                selectedAnswer,
                correctChoiceIndex,
                correctAnswer,
                isCorrect: selectedChoiceIndex != null && isTryoutAnswerCorrect(selectedAnswer, question),
                steps: (Array.isArray(question.steps) ? question.steps : [])
                    .map(normalizeStepSnapshot)
                    .filter((step) => step.title || step.content)
            };
        })
    };
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
        avatar_url: row.avatar_url || '',
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
    buildTryoutReviewSnapshot,
    calculateTryoutAttemptStats,
    getPrimaryCorrectAnswer,
    getTryoutCorrectChoiceIndex,
    getTryoutChoices,
    isTryoutAnswerCorrect,
    normalizeTryoutAnswer,
    normalizeTryoutAttemptInput,
    normalizeTryoutText,
    rankTryoutLeaderboardRows,
    safeInitials
};
