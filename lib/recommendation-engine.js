const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_CATALOG_PATH = path.join(PROJECT_ROOT, 'data', 'recommendation-catalog.json');
const DEFAULT_QUESTION_BANK_PATH = path.join(PROJECT_ROOT, 'docs', 'purcell-inspired-question-bank.md');

const DIFFICULTY_RANK = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
  'Super Hard': 4,
};

const LEARNING_LABEL_OVERRIDES = new Map([
  ['turunan', 'Menghitung turunan'],
  ['aturan turunan dasar', 'Menghitung turunan dasar'],
  ['derivative rules', 'Menghitung turunan dasar'],
  ['power rule', 'Menggunakan aturan pangkat turunan'],
  ['chain rule', 'Menerapkan aturan rantai'],
  ['aturan rantai', 'Menerapkan aturan rantai'],
  ['diferensiasi implisit', 'Menurunkan fungsi implisit'],
  ['implicit differentiation', 'Menurunkan fungsi implisit'],
  ['isolasi variabel', 'Mengisolasi variabel dalam persamaan'],
  ['dy dx isolation', 'Mengisolasi dy/dx'],
  ['aplikasi turunan', 'Menganalisis grafik dengan turunan'],
  ['related rates', 'Memodelkan laju terkait'],
  ['anti turunan dasar', 'Menentukan anti-turunan'],
  ['antiderivative', 'Menentukan anti-turunan'],
  ['konsep konstanta integrasi', 'Menentukan konstanta integrasi'],
  ['constant of integration', 'Menentukan konstanta integrasi'],
  ['integral tentu', 'Menghitung integral tentu'],
  ['substitusi u', 'Melakukan substitusi u'],
  ['u substitution', 'Melakukan substitusi u'],
  ['kesalahan aljabar', 'Aljabar'],
  ['aljabar', 'Aljabar'],
  ['aljabar dasar', 'Aljabar'],
  ['kesalahan perhitungan', 'Kalkulasi'],
  ['perhitungan', 'Kalkulasi'],
  ['kalkulasi', 'Kalkulasi'],
]);

function loadRecommendationCatalog(options = {}) {
  const catalogPath = options.catalogPath || DEFAULT_CATALOG_PATH;
  const questionBankPath = options.questionBankPath || DEFAULT_QUESTION_BANK_PATH;
  const rawCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const markdown = fs.readFileSync(questionBankPath, 'utf8');
  const baseSkills = Array.isArray(rawCatalog.skills) ? rawCatalog.skills.map(normalizeSkill) : [];
  const skillById = new Map(baseSkills.map((skill) => [skill.id, skill]));
  const catalog = {
    ...rawCatalog,
    skills: baseSkills,
    questions: [],
  };

  attachAliasIndex(catalog);

  const questions = parsePurcellQuestionBank(markdown).map((question) => {
    const skillIds = unique(question.weaknessTags.map((tag) => {
      const skillId = normalizeSkillTag(tag, catalog);
      if (!skillById.has(skillId)) {
        const generated = normalizeSkill({
          id: skillId,
          label: titleFromSlug(skillId),
          chapter: question.chapter,
          prerequisites: [],
          aliases: [tag],
          generatedFromQuestionBank: true,
        });
        skillById.set(skillId, generated);
        catalog.skills.push(generated);
      }
      return skillId;
    }));

    return {
      ...question,
      skillIds,
    };
  });

  catalog.questions = questions;
  attachAliasIndex(catalog);
  catalog.skillById = Object.fromEntries(catalog.skills.map((skill) => [skill.id, skill]));
  return catalog;
}

function parsePurcellQuestionBank(markdown) {
  return String(markdown || '')
    .split(/\n(?=## MF-PUR-\d+)/)
    .map((block) => block.trim())
    .filter((block) => /^## MF-PUR-\d+/m.test(block))
    .map((block) => {
      const ref = block.match(/^##\s+(MF-PUR-\d+)/m)?.[1];
      const weaknessTags = parseJsonArrayField(readField(block, 'weakness_tags'));
      return {
        ref,
        purcellReference: readField(block, 'purcell_reference'),
        chapter: readField(block, 'chapter'),
        subtopic: readField(block, 'subtopic'),
        difficulty: normalizeDifficulty(readField(block, 'difficulty')),
        storyProblem: /^true$/i.test(readField(block, 'story_problem')),
        weaknessTags,
        recommendationTrigger: readField(block, 'recommendation_trigger'),
        questionDisplay: stripInlineCode(readField(block, 'question_display')),
        questionText: readField(block, 'question_text'),
        answerDisplay: stripInlineCode(readField(block, 'answer_display')),
      };
    })
    .filter((question) => question.ref && question.questionDisplay);
}

function buildRecommendationSummary({ attempts, catalog, now = new Date(), limit = 5 } = {}) {
  const loadedCatalog = catalog || loadRecommendationCatalog();
  const normalizedAttempts = Array.isArray(attempts) ? attempts : [];

  if (!normalizedAttempts.length) {
    return {
      strengths: [],
      weaknesses: [],
      recommendedItems: [],
      recommendedQuestions: loadedCatalog.defaultRecommendations || [],
      skillNeedScores: [],
      overallSummary: 'Belum ada hasil koreksi untuk diringkas. Kerjakan latihan canvas agar sistem bisa memetakan kebutuhan belajarmu.',
    };
  }

  const skillNeedScores = computeSkillNeedScores(normalizedAttempts, loadedCatalog, now);
  const recommendedItems = recommendItems({ attempts: normalizedAttempts, catalog: loadedCatalog, now, limit });
  const weaknesses = skillNeedScores
    .filter((score) => score.needScore >= 10)
    .slice(0, 5)
    .map((score) => score.label);
  const strengths = collectStrengthLabels(normalizedAttempts, loadedCatalog)
    .filter((label) => !weaknesses.includes(label))
    .slice(0, 5);

  return {
    strengths,
    weaknesses,
    recommendedItems,
    recommendedQuestions: recommendedItems.length
      ? recommendedItems.map(formatRecommendedQuestion)
      : (loadedCatalog.defaultRecommendations || []),
    skillNeedScores: skillNeedScores.slice(0, 8),
    overallSummary: buildOverallSummary(normalizedAttempts.length, skillNeedScores, recommendedItems),
  };
}

function computeSkillNeedScores(attempts, catalog, now = new Date()) {
  const loadedCatalog = catalog || loadRecommendationCatalog();
  const stats = collectSkillStats(Array.isArray(attempts) ? attempts : [], loadedCatalog);
  const scoring = loadedCatalog.scoring || {};
  const weights = scoring.weights || {};
  const confidenceAttempts = Number(scoring.confidenceAttempts) || 3;
  const halfLifeDays = Number(scoring.recencyHalfLifeDays) || 7;
  const baseRows = Array.from(stats.values()).map((stat) => {
    const factors = computeFactors(stat, now, halfLifeDays, 0);
    const confidence = Math.min(1, stat.totalAttempts / confidenceAttempts);
    const baseNeedScore = computeWeightedNeed(factors, weights, confidence);
    return { stat, factors, confidence, baseNeedScore };
  });
  const baseNeedBySkill = new Map(baseRows.map((row) => [row.stat.skillId, row.baseNeedScore]));

  return baseRows.map((row) => {
    const skill = getSkill(loadedCatalog, row.stat.skillId);
    const prerequisiteGap = Math.max(
      0,
      ...(skill.prerequisites || []).map((skillId) => (baseNeedBySkill.get(skillId) || 0) / 100)
    );
    const factors = computeFactors(row.stat, now, halfLifeDays, prerequisiteGap);
    const needScore = computeWeightedNeed(factors, weights, row.confidence);

    return {
      skillId: row.stat.skillId,
      label: skill.label,
      chapter: skill.chapter || '',
      prerequisites: skill.prerequisites || [],
      totalAttempts: row.stat.totalAttempts,
      wrongAttempts: row.stat.wrongAttempts,
      averageScore: round(row.stat.scoreSum / Math.max(1, row.stat.totalAttempts), 1),
      lastWrongAt: row.stat.lastWrongAt ? row.stat.lastWrongAt.toISOString() : null,
      factors,
      confidence: round(row.confidence, 3),
      needScore: round(needScore, 2),
    };
  }).sort((a, b) => {
    if (b.needScore !== a.needScore) return b.needScore - a.needScore;
    return b.wrongAttempts - a.wrongAttempts;
  });
}

function recommendItems({ attempts, catalog, now = new Date(), limit = 5 } = {}) {
  const loadedCatalog = catalog || loadRecommendationCatalog();
  const scores = computeSkillNeedScores(attempts || [], loadedCatalog, now)
    .filter((score) => score.needScore >= 10);
  const selected = [];
  const selectedRefs = new Set();

  for (const score of scores) {
    const skillCandidates = candidatesForSkill(score, loadedCatalog)
      .filter((question) => shouldIncludeDifficulty(question, score, loadedCatalog))
      .sort((a, b) => compareQuestionFit(a, b, score, loadedCatalog));

    for (const question of skillCandidates) {
      if (selectedRefs.has(question.ref)) continue;
      selectedRefs.add(question.ref);
      selected.push(toRecommendedItem(question, score, loadedCatalog));
      if (selected.length >= limit) return selected;
    }
  }

  return selected;
}

function normalizeSkillTag(tag, catalog) {
  const key = normalizeKey(tag);
  if (!key) return '';
  const loadedCatalog = catalog || loadRecommendationCatalog();
  if (!loadedCatalog._aliasIndex) attachAliasIndex(loadedCatalog);
  return loadedCatalog._aliasIndex.get(key) || slugify(tag);
}

function collectSkillStats(attempts, catalog) {
  const stats = new Map();

  for (const attempt of attempts) {
    const evaluation = attempt.evaluation || {};
    const score = clampScore(attempt.score ?? evaluation.score);
    const completedAt = parseDate(
      attempt.completedAt || attempt.createdAt || attempt.submittedAt || attempt.timestamp || evaluation.completedAt
    );
    const weakIds = new Set(readAttemptTags(attempt, evaluation, 'weaknessTags').map((tag) => normalizeSkillTag(tag, catalog)).filter(Boolean));
    const strongIds = new Set(readAttemptTags(attempt, evaluation, 'strengthTags').map((tag) => normalizeSkillTag(tag, catalog)).filter(Boolean));

    for (const skillId of weakIds) {
      const stat = getOrCreateStat(stats, skillId);
      stat.totalAttempts += 1;
      stat.wrongAttempts += 1;
      stat.scoreSum += score;
      if (completedAt && (!stat.lastWrongAt || completedAt > stat.lastWrongAt)) stat.lastWrongAt = completedAt;
      if (completedAt && (!stat.lastAttemptAt || completedAt > stat.lastAttemptAt)) stat.lastAttemptAt = completedAt;
    }

    for (const skillId of strongIds) {
      if (weakIds.has(skillId)) continue;
      const stat = getOrCreateStat(stats, skillId);
      stat.totalAttempts += 1;
      stat.scoreSum += score;
      if (completedAt && (!stat.lastAttemptAt || completedAt > stat.lastAttemptAt)) stat.lastAttemptAt = completedAt;
    }
  }

  return stats;
}

function computeFactors(stat, now, halfLifeDays, prerequisiteGap, options = {}) {
  const averageScore = stat.scoreSum / Math.max(1, stat.totalAttempts);
  const daysSinceLastWrong = stat.lastWrongAt
    ? Math.max(0, (new Date(now).getTime() - stat.lastWrongAt.getTime()) / (24 * 60 * 60 * 1000))
    : Infinity;
  const pMastery = (typeof options.pMastery === 'number' && Number.isFinite(options.pMastery))
    ? Math.max(0, Math.min(1, options.pMastery))
    : null;
  const recencyMultiplier = (pMastery != null && pMastery >= 0.8) ? 0.3 : 1.0;

  return {
    wrongFrequency: stat.totalAttempts ? stat.wrongAttempts / stat.totalAttempts : 0,
    recencyError: (Number.isFinite(daysSinceLastWrong) ? Math.exp(-daysSinceLastWrong / halfLifeDays) : 0) * recencyMultiplier,
    lowScore: Math.max(0, Math.min(1, 1 - averageScore / 100)),
    prerequisiteGap: Math.max(0, Math.min(1, prerequisiteGap || 0)),
    attemptPressure: Math.min(1, Math.log(1 + stat.totalAttempts) / Math.log(6)),
    pMastery,
  };
}

function computeWeightedNeed(factors, weights, confidence) {
  const basePrereqWeight = Number(weights.prerequisiteGap) || 0.15;
  const prereqWeight = (factors.pMastery != null && factors.pMastery < 0.3) ? 0.25 : basePrereqWeight;
  const raw =
    (Number(weights.wrongFrequency) || 0.3) * factors.wrongFrequency +
    (Number(weights.recencyError) || 0.25) * factors.recencyError +
    (Number(weights.lowScore) || 0.2) * factors.lowScore +
    prereqWeight * factors.prerequisiteGap +
    (Number(weights.attemptPressure) || 0.1) * factors.attemptPressure;
  return Math.max(0, Math.min(100, confidence * 100 * raw));
}

function candidatesForSkill(score, catalog) {
  return (catalog.questions || []).filter((question) => question.skillIds.includes(score.skillId));
}

function shouldIncludeDifficulty(question, score, catalog) {
  if (question.difficulty !== 'Super Hard') return true;
  const policy = catalog.difficultyPolicy || {};
  const minimumAverage = Number(policy.superHardMinimumAverageScore) || 80;
  const maximumNeed = Number(policy.superHardMaximumNeedScore) || 70;
  const minimumAttempts = Number(policy.superHardMinimumAttempts) || 3;
  return (
    score.averageScore >= minimumAverage &&
    score.needScore <= maximumNeed &&
    score.totalAttempts >= minimumAttempts
  );
}

function compareQuestionFit(a, b, score, catalog) {
  const order = difficultyPreference(score, catalog);
  const diff = order.indexOf(a.difficulty) - order.indexOf(b.difficulty);
  if (diff !== 0) return diff;
  if (a.storyProblem !== b.storyProblem) return Number(a.storyProblem) - Number(b.storyProblem);
  return a.ref.localeCompare(b.ref);
}

function difficultyPreference(score, catalog) {
  const policy = catalog.difficultyPolicy || {};
  const highNeed = Number(policy.highNeedThreshold) || 75;
  const mediumNeed = Number(policy.mediumNeedThreshold) || 50;
  if (score.needScore >= highNeed) return ['Easy', 'Medium', 'Hard', 'Super Hard'];
  if (score.needScore >= mediumNeed) return ['Medium', 'Hard', 'Easy', 'Super Hard'];
  return ['Hard', 'Super Hard', 'Medium', 'Easy'];
}

function toRecommendedItem(question, score, catalog) {
  return {
    ref: question.ref,
    questionDisplay: question.questionDisplay,
    questionText: question.questionText,
    answerDisplay: question.answerDisplay,
    chapter: question.chapter,
    subtopic: question.subtopic,
    difficulty: question.difficulty,
    storyProblem: question.storyProblem,
    purcellReference: question.purcellReference,
    source: 'purcell-inspired',
    skillIds: question.skillIds,
    weaknessTags: question.weaknessTags,
    needScore: score.needScore,
    targetSkill: {
      id: score.skillId,
      label: score.label,
      chapter: score.chapter,
    },
    reason: `Dipilih karena kebutuhan belajar tertinggi terdeteksi pada ${score.label} (skor ${score.needScore}/100).`,
  };
}

function formatRecommendedQuestion(item) {
  return `${item.ref}: ${item.questionDisplay}`;
}

function buildOverallSummary(attemptCount, scores, items) {
  const top = scores[0];
  if (!top) {
    return `Kamu sudah punya ${attemptCount} hasil koreksi. Belum ada pola kelemahan yang cukup kuat, jadi lanjutkan latihan campuran.`;
  }
  const next = items[0]?.difficulty ? ` Rekomendasi pertama disetel pada level ${items[0].difficulty}.` : '';
  return `Kamu sudah punya ${attemptCount} hasil koreksi. Fokus utama berikutnya adalah ${top.label} karena pola salah, skor, dan recency paling tinggi.${next}`;
}

function collectStrengthLabels(attempts, catalog) {
  const counts = new Map();
  for (const attempt of attempts) {
    const evaluation = attempt.evaluation || {};
    for (const tag of readAttemptTags(attempt, evaluation, 'strengthTags')) {
      const skillId = normalizeSkillTag(tag, catalog);
      if (!skillId) continue;
      counts.set(skillId, (counts.get(skillId) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([skillId]) => getSkill(catalog, skillId).label);
}

function readAttemptTags(attempt, evaluation, key) {
  const direct = normalizeStringArray(attempt[key]);
  const nested = normalizeStringArray(evaluation[key]);
  return direct.length ? direct : nested;
}

function getOrCreateStat(stats, skillId) {
  if (!stats.has(skillId)) {
    stats.set(skillId, {
      skillId,
      totalAttempts: 0,
      wrongAttempts: 0,
      scoreSum: 0,
      lastWrongAt: null,
      lastAttemptAt: null,
    });
  }
  return stats.get(skillId);
}

function getSkill(catalog, skillId) {
  return catalog.skillById?.[skillId] || {
    id: skillId,
    label: formatLearningSkillLabel(titleFromSlug(skillId)),
    chapter: '',
    prerequisites: [],
    aliases: [skillId],
  };
}

function attachAliasIndex(catalog) {
  const aliasIndex = new Map();
  for (const skill of catalog.skills || []) {
    const aliases = unique([
      skill.id,
      skill.label,
      ...(skill.aliases || []),
    ]);
    for (const alias of aliases) {
      const key = normalizeKey(alias);
      if (key) aliasIndex.set(key, skill.id);
    }
  }
  Object.defineProperty(catalog, '_aliasIndex', {
    configurable: true,
    enumerable: false,
    value: aliasIndex,
  });
}

function normalizeSkill(skill) {
  return {
    id: slugify(skill.id || skill.label),
    label: formatLearningSkillLabel(skill.label || titleFromSlug(skill.id)),
    chapter: String(skill.chapter || '').trim(),
    prerequisites: normalizeStringArray(skill.prerequisites).map(slugify),
    aliases: normalizeStringArray(skill.aliases),
    generatedFromQuestionBank: Boolean(skill.generatedFromQuestionBank),
  };
}

function formatLearningSkillLabel(label) {
  const text = String(label || '').trim();
  if (!text) return '';
  const key = normalizeKey(text);
  
  if (key.includes('tidak ada jawaban') || key.includes('kosong') || key.includes('belum dijawab') || key.includes('no answer') || key.includes('empty')) {
    return '';
  }
  
  if (key.includes('aljabar') || key.includes('mengisolasi variabel') || key.includes('manipulasi') || key.includes('variabel') || key.includes('persamaan')) {
    if (!key.includes('diferensial') && !key.includes('differensial')) {
       return 'Aljabar';
    }
  }
  if (key.includes('diferensial') || key.includes('differensial') || key.includes('turunan') || key.includes('derivative') || key.includes('differential')) {
    return 'Diferensial';
  }
  if (key.includes('integral') || key.includes('integrasi') || key.includes('integration') || key.includes('anti turunan') || key.includes('antiderivative')) {
    return 'Integral';
  }
  if (key.includes('limit')) {
    return 'Limit';
  }
  if (key.includes('trigonometri') || key.includes('sinus') || key.includes('cosinus') || key.includes('tangen')) {
    return 'Trigonometri';
  }
  if (key.includes('kalkulasi') || key.includes('perhitungan') || key.includes('hitung') || key.includes('aritmatika')) {
    return 'Kalkulasi';
  }

  const override = LEARNING_LABEL_OVERRIDES.get(key);
  return override || text;
}

function readField(block, fieldName) {
  const match = String(block || '').match(new RegExp(`^${escapeRegExp(fieldName)}:\\s*(.*)$`, 'm'));
  return match ? String(match[1] || '').replace(/\s{2,}$/g, '').trim() : '';
}

function parseJsonArrayField(value) {
  try {
    const parsed = JSON.parse(value);
    return normalizeStringArray(parsed);
  } catch {
    return [];
  }
}

function stripInlineCode(value) {
  const text = String(value || '').trim();
  if (text.startsWith('`') && text.endsWith('`')) return text.slice(1, -1).trim();
  return text;
}

function normalizeDifficulty(value) {
  const text = String(value || '').trim();
  return DIFFICULTY_RANK[text] ? text : 'Medium';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function slugify(value) {
  return normalizeKey(value).replace(/\s+/g, '_');
}

function titleFromSlug(slug) {
  return String(slug || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(Math.max(number, 0), 100);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeBktLite(history, options = {}) {
  const pInit = Number.isFinite(options.pInit) ? options.pInit : 0.2;
  const pTransit = Number.isFinite(options.pTransit) ? options.pTransit : 0.1;
  const pSlip = Number.isFinite(options.pSlip) ? options.pSlip : 0.1;
  const pGuess = Number.isFinite(options.pGuess) ? options.pGuess : 0.2;

  const bySkill = new Map();
  const historyRecords = [];

  for (const event of history || []) {
    if (!event || !event.skillId) continue;
    const isCorrect = event.correct === true || event.correct === 1 || event.correct === 'true';
    let entry = bySkill.get(event.skillId);
    if (!entry) {
      entry = { pKnown: pInit, count: 0 };
      bySkill.set(event.skillId, entry);
    }
    const pK = entry.pKnown;
    let pKnownPosterior;
    if (isCorrect) {
      pKnownPosterior = (pK * (1 - pSlip)) / (pK * (1 - pSlip) + (1 - pK) * pGuess);
    } else {
      pKnownPosterior = (pK * pSlip) / (pK * pSlip + (1 - pK) * (1 - pGuess));
    }
    entry.pKnown = pKnownPosterior + (1 - pKnownPosterior) * pTransit;
    entry.count += 1;
    historyRecords.push({ skillId: event.skillId, pKnown: entry.pKnown, correct: isCorrect });
  }

  const mastery = Object.fromEntries(
    Array.from(bySkill.entries()).map(([skillId, entry]) => [skillId, Math.max(0, Math.min(1, entry.pKnown))])
  );
  return { mastery, history: historyRecords };
}

function computePerSkillHalfLifeLite(history, options = {}) {
  const clampMin = Number.isFinite(options.clampMin) ? options.clampMin : 1;
  const clampMax = Number.isFinite(options.clampMax) ? options.clampMax : 30;
  const baseHalfLife = Number.isFinite(options.baseHalfLife) ? options.baseHalfLife : 7;

  const bySkill = new Map();
  for (const event of history || []) {
    if (!event || !event.skillId) continue;
    const isCorrect = event.correct === true || event.correct === 1 || event.correct === 'true';
    let entry = bySkill.get(event.skillId);
    if (!entry) {
      entry = { total: 0, correct: 0 };
      bySkill.set(event.skillId, entry);
    }
    entry.total += 1;
    if (isCorrect) entry.correct += 1;
  }

  const result = {};
  for (const [skillId, entry] of bySkill.entries()) {
    const successRate = entry.total ? entry.correct / entry.total : 0.5;
    const raw = baseHalfLife * (0.5 + successRate);
    result[skillId] = Math.max(clampMin, Math.min(clampMax, raw));
  }
  return result;
}

function computeFrontier(input, options = {}) {
  const masteryThreshold = Number.isFinite(options.masteryThreshold) ? options.masteryThreshold : 0.8;
  const prereqThreshold = Number.isFinite(options.prereqThreshold) ? options.prereqThreshold : 0.6;
  const src = input || {};
  const pMastery = (typeof src.pMastery === 'number' && Number.isFinite(src.pMastery))
    ? Math.max(0, Math.min(1, src.pMastery))
    : 0;
  const prereqMastery = (typeof src.prereqMastery === 'number' && Number.isFinite(src.prereqMastery))
    ? Math.max(0, Math.min(1, src.prereqMastery))
    : 0;
  const attempts = Number(src.attempts) || 0;
  const last30 = Number(src.last30) || 0;

  const mastered = pMastery >= masteryThreshold;
  const prereqReady = prereqMastery >= prereqThreshold;

  if (mastered && prereqReady) {
    return { kind: 'review', frontier: false, pMastery, prereqMastery, attempts, last30 };
  }
  return { kind: 'new', frontier: true, pMastery, prereqMastery, attempts, last30 };
}

function interleaveRecallSlots(items, options = {}) {
  const every = Number.isFinite(options.every) ? options.every : 3;
  if (!Array.isArray(items) || items.length === 0) return [];

  const isRecall = (item) => {
    if (!item) return false;
    if (item.frontier === false) return true;
    if (item.kind === 'review') return true;
    return false;
  };
  const isFrontier = (item) => {
    if (!item) return false;
    if (item.frontier === true) return true;
    if (item.kind === 'new') return true;
    if (!item.frontier && !item.kind) return true;
    return false;
  };

  const frontier = items.filter(isFrontier);
  const recall = items.filter(isRecall);
  if (frontier.length === 0) return recall.slice();
  if (recall.length === 0) return frontier.slice();

  const result = [];
  let fi = 0;
  let ri = 0;
  while (fi < frontier.length || ri < recall.length) {
    for (let i = 0; i < every && fi < frontier.length; i += 1) {
      result.push(frontier[fi]);
      fi += 1;
    }
    if (ri < recall.length) {
      result.push(recall[ri]);
      ri += 1;
    }
  }
  return result;
}

function deduplicateRecentlySolved(items, solvedSet, days = 14) {
  if (!Array.isArray(items)) return [];
  let lookup = solvedSet;
  if (!(lookup instanceof Set)) {
    if (Array.isArray(lookup)) {
      lookup = new Set(lookup);
    } else if (lookup && typeof lookup === 'object') {
      lookup = new Set(Object.values(lookup).filter(Boolean));
    } else {
      return items.slice();
    }
  }
  return items.filter((item) => {
    if (!item) return false;
    const key = item.problemId != null
      ? `p:${item.problemId}`
      : (item.ref ? `r:${item.ref}` : null);
    if (!key) return true;
    return !lookup.has(key);
  });
}

function enrichWithCatalog(recItems, options = {}) {
  if (!Array.isArray(recItems)) return [];
  const mcEvidence = Array.isArray(options.mcEvidence) ? options.mcEvidence : [];
  const mastery = (options.mastery && typeof options.mastery === 'object') ? options.mastery : {};
  const halfLives = (options.halfLives && typeof options.halfLives === 'object') ? options.halfLives : {};
  const now = options.now instanceof Date ? options.now : new Date();

  const evidenceBySkill = new Map();
  for (const ev of mcEvidence) {
    if (!ev) continue;
    const skillIds = (Array.isArray(ev.skillIds) && ev.skillIds.length)
      ? ev.skillIds
      : (ev.skillId ? [ev.skillId] : []);
    for (const skillId of skillIds) {
      if (!skillId) continue;
      if (!evidenceBySkill.has(skillId)) evidenceBySkill.set(skillId, []);
      evidenceBySkill.get(skillId).push({
        problemId: ev.problemId || null,
        selectedAnswer: ev.selectedAnswer || null,
        correctAnswer: ev.correctAnswer || null,
        selectedChoiceIndex: (ev.selectedChoiceIndex != null) ? ev.selectedChoiceIndex : null,
        correctChoiceIndex: (ev.correctChoiceIndex != null) ? ev.correctChoiceIndex : null,
        createdAt: ev.createdAt || null,
      });
    }
  }

  for (const arr of evidenceBySkill.values()) {
    arr.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return String(a.problemId || '').localeCompare(String(b.problemId || ''));
    });
  }

  return recItems.map((item) => {
    const skillIds = (Array.isArray(item.skillIds) && item.skillIds.length)
      ? item.skillIds
      : (item.targetSkill && item.targetSkill.id ? [item.targetSkill.id] : []);
    const evidence = [];
    const seen = new Set();
    for (const skillId of skillIds) {
      const evList = evidenceBySkill.get(skillId) || [];
      for (const ev of evList) {
        const evKey = `${ev.problemId || ''}|${ev.selectedAnswer || ''}|${ev.correctAnswer || ''}|${ev.createdAt || ''}`;
        if (seen.has(evKey)) continue;
        seen.add(evKey);
        evidence.push(ev);
        if (evidence.length >= 3) break;
      }
      if (evidence.length >= 3) break;
    }

    const targetSkillId = item.targetSkill && item.targetSkill.id;
    const pMastery = targetSkillId ? mastery[targetSkillId] : null;
    const halfLifeDays = targetSkillId ? halfLives[targetSkillId] : null;
    const frontier = (pMastery == null) ? true : (pMastery < 0.8);
    const kind = frontier ? 'new' : 'review';

    return {
      ...item,
      evidence,
      frontier,
      kind,
      halfLifeDays: (halfLifeDays != null) ? halfLifeDays : null,
      evidenceAt: now.toISOString(),
    };
  });
}

function loadMasteryStates(db, userId) {
  if (!db || userId == null) {
    return { attempts: [], solvedRecent: new Set(), solvedKeys: new Set() };
  }
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
    const attempts = (db.prepare(`
      SELECT pa.problem_id AS problemId,
             pa.correct,
             pa.created_at AS createdAt,
             p.subtopic_id AS subtopicId,
             s.title AS subtopicTitle,
             c.title AS chapterTitle
      FROM practice_attempts pa
      LEFT JOIN problems p ON p.id = pa.problem_id
      LEFT JOIN subtopics s ON s.id = p.subtopic_id
      LEFT JOIN chapters c ON c.id = s.chapter_id
      WHERE pa.user_id = ?
      ORDER BY pa.created_at ASC
    `).all(userId)) || [];

    const solvedRecentRows = (db.prepare(`
      SELECT problem_id AS problemId
      FROM user_progress
      WHERE user_id = ? AND solved = 1 AND solved_at >= ?
    `).all(userId, cutoff)) || [];
    const solvedRecent = new Set(solvedRecentRows.map((r) => `p:${r.problemId}`));
    const solvedKeys = new Set(solvedRecentRows.map((r) => `p:${r.problemId}`));

    return { attempts, solvedRecent, solvedKeys };
  } catch (err) {
    return { attempts: [], solvedRecent: new Set(), solvedKeys: new Set() };
  }
}

module.exports = {
  buildRecommendationSummary,
  computeSkillNeedScores,
  computeFactors,
  loadRecommendationCatalog,
  formatLearningSkillLabel,
  normalizeSkillTag,
  parsePurcellQuestionBank,
  recommendItems,
  computeBktLite,
  computePerSkillHalfLifeLite,
  computeFrontier,
  interleaveRecallSlots,
  deduplicateRecentlySolved,
  enrichWithCatalog,
  loadMasteryStates,
};
