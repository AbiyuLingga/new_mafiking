// Practice route — choice (multiple choice) default, optional canvas mode.

const Practice = ({ context, setRoute }) => {
  const boardRef = useRef(null);
  const [mode, setMode] = useState("choice"); // "choice" | "canvas"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [problemIndex, setProblemIndex] = useState(0);
  const [attemptsByProblem, setAttemptsByProblem] = useState({});
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [boardDirty, setBoardDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    loadPractice();
  }, [context?.id, context?.mapel]);

  // Reset per-problem state on navigation.
  useEffect(() => {
    setSelectedChoiceIndex(null);
    setShowHint(false);
    setBoardDirty(false);
    setError("");
    setShowResultModal(false);
  }, [problemIndex, session?.subtopic?.id]);

  const problem = session?.problems?.[problemIndex];
  const totalProblems = session?.problems?.length || 0;
  const activeAttempt = problem ? attemptsByProblem[problem.id] : null;
  const availableChapters = getPracticeChapters(context);
  const currentChapter = getCurrentChapter(context, session, availableChapters);

  async function loadPractice() {
    try {
      setLoading(true);
      setError("");
      const init = await MafikingAPI.get("/api/quiz/init");
      const questionSource = chooseQuestionSource(init, context);
      if (!questionSource) {
        setSession({ problems: [], subtopic: { title: context?.title || "Latihan" } });
        setProblemIndex(0);
        return;
      }
      const data = await loadQuestionSource(questionSource);
      setSession(data);
      setProblemIndex(0);
      setAttemptsByProblem({});
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  function moveProblem(delta) {
    const total = session?.problems?.length || 0;
    setProblemIndex((current) => Math.min(Math.max(current + delta, 0), total - 1));
  }

  function getChoices(p) {
    if (!p) return [];
    try {
      if (Array.isArray(p.mc_options) && p.mc_options.length) return p.mc_options;
      if (typeof p.mc_options === "string" && p.mc_options.trim()) {
        const parsed = JSON.parse(p.mc_options);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (_) {}
    return buildGeneratedChoices(p, session?.problems || []);
  }

  function getCorrectChoiceIndex(p, choices) {
    if (!p || !choices.length) return -1;
    if (Number.isInteger(p.correct_choice_index)) return p.correct_choice_index;
    if (Number.isInteger(p.correctChoiceIndex)) return p.correctChoiceIndex;
    const target = normalizeAnswerText(p.answer_display || p.answer_text || "");
    if (!target) return -1;
    const idx = choices.findIndex((c) => normalizeAnswerText(c).includes(target) || target.includes(normalizeAnswerText(c)));
    return idx >= 0 ? idx : -1;
  }

  function submitChoice() {
    if (!problem) return;
    if (selectedChoiceIndex == null) { setError("Pilih salah satu jawaban dulu."); return; }
    const choices = getChoices(problem);
    const correctIndex = getCorrectChoiceIndex(problem, choices);
    const isCorrect = correctIndex >= 0 && selectedChoiceIndex === correctIndex;
    const selectedAnswer = choices[selectedChoiceIndex] || "";
    const correctAnswer = correctIndex >= 0 ? choices[correctIndex] : (problem.answer_display || "");

    const attempt = {
      completedAt: new Date().toISOString(),
      correctChoiceIndex: correctIndex,
      selectedChoiceIndex,
      mode: "choice",
      evaluation: {
        detectedAnswerText: selectedAnswer,
        isCorrect,
        score: isCorrect ? 100 : 0,
        fullFeedback: "",
      },
    };
    setAttemptsByProblem((prev) => ({ ...prev, [problem.id]: attempt }));
    setError("");

    MafikingAPI.post("/api/progress/submit", {
      correct: isCorrect, hintsUsed: showHint ? 1 : 0, problemId: problem.id,
    }).catch(() => null);
  }

  async function submitCanvas() {
    if (!problem) return;
    try {
      setError("");
      setShowResultModal(false);
      const imageBase64 = boardRef.current && boardRef.current.exportImage();
      if (!imageBase64 || !boardDirty) { setError("Tulis jawaban di canvas terlebih dulu."); return; }
      setSubmitting(true);
      const evaluation = await MafikingAPI.post("/api/correction/evaluate", {
        expectedAnswer: problem.answer_display,
        imageBase64,
        mimeType: "image/png",
        problemId: problem.id,
        questionId: problem.id,
        questionText: problem.question_display || problem.question_text,
        topicTags: [session?.subtopic?.title].filter(Boolean),
      });
      const attempt = {
        completedAt: new Date().toISOString(),
        evaluation: evaluation.evaluation,
        feedback: evaluation.feedback,
        imageBase64,
        mode: "canvas",
      };
      setAttemptsByProblem((prev) => ({ ...prev, [problem.id]: attempt }));
      setBoardDirty(false);
      setShowResultModal(true);
      MafikingAPI.post("/api/progress/submit", {
        correct: Boolean(evaluation.evaluation?.isCorrect),
        hintsUsed: 0,
        problemId: problem.id,
      }).catch(() => null);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode) {
    if (nextMode === mode) return;
    if (mode === "canvas" && boardDirty && !window.confirm("Beralih mode akan mengosongkan canvas. Lanjut?")) return;
    setMode(nextMode);
    setBoardDirty(false);
    setShowResultModal(false);
    setFocusMode(false);
  }

  function selectChapter(chapter) {
    if (!chapter) return;
    if (mode === "canvas" && boardDirty && !window.confirm("Berpindah bab akan mengosongkan canvas. Lanjut?")) return;
    setMode("choice");
    setBoardDirty(false);
    setShowResultModal(false);
    setFocusMode(false);
    setRoute({ route: "practice", practice: { ...chapter, mapel: chapter.mapel || context?.mapel || "Matematika" } });
  }

  if (loading) {
    return (
      <div className="mafiking-practice mafiking-canvas-practice">
        <section className="mafiking-canvas-card">
          <div className="mafiking-answer-heading">Memuat soal...</div>
        </section>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="mafiking-practice mafiking-canvas-practice">
        <div className="mafiking-session-bar">
          <button className="mafiking-back-button" onClick={() => setRoute("belajar")} type="button">
            <Icon.ChevL className="w-4 h-4" />
            Kembali
          </button>
        </div>
        <section className="mafiking-canvas-card">
          <div className="mafiking-answer-heading">Soal belum tersedia untuk bab ini.</div>
          <p className="mafiking-canvas-instruction mt-3">
            Bank soal yang ter-export saat ini baru berisi bab Integral. Pilih Bab Teknik Integrasi untuk latihan.
          </p>
        </section>
      </div>
    );
  }

  if (mode === "canvas") {
    return (
      <CanvasView
        attempt={activeAttempt}
        boardDirty={boardDirty}
        boardRef={boardRef}
        error={error}
        focusMode={focusMode}
        onBackToChoice={() => switchMode("choice")}
        onBoardDirtyChange={setBoardDirty}
        onFocusModeToggle={() => setFocusMode((v) => !v)}
        onMoveProblem={moveProblem}
        onSubmit={submitCanvas}
        problem={problem}
        problemIndex={problemIndex}
        showResultModal={showResultModal}
        submitting={submitting}
        totalProblems={totalProblems}
        onCloseResult={() => setShowResultModal(false)}
        subtopicTitle={session?.subtopic?.title}
        setRoute={setRoute}
      />
    );
  }

  return (
    <ChoiceView
      attempt={activeAttempt}
      error={error}
      onBack={() => setRoute("belajar")}
      onChoiceSelect={setSelectedChoiceIndex}
      onHintToggle={() => setShowHint((v) => !v)}
      onMoveProblem={moveProblem}
      onSubmit={submitChoice}
      onSwitchCanvas={() => switchMode("canvas")}
      problem={problem}
      problemIndex={problemIndex}
      selectedChoiceIndex={selectedChoiceIndex}
      showHint={showHint}
      totalProblems={totalProblems}
      subtopicTitle={session?.subtopic?.title}
      currentChapter={currentChapter}
      availableChapters={availableChapters}
      onChapterSelect={selectChapter}
      getChoices={getChoices}
      getCorrectChoiceIndex={getCorrectChoiceIndex}
    />
  );
};

const ChapterSwitcher = ({ chapter, chapters, fallbackTitle, onSelect }) => {
  const [open, setOpen] = useState(false);
  const chapterNumber = Number(chapter?.num || 0);
  const title = chapter?.title || fallbackTitle;
  const label = chapterNumber ? `Bab ${chapterNumber}: ${title}` : title;
  const canSwitch = Array.isArray(chapters) && chapters.length > 1;

  return (
    <div className="mafiking-chapter-switcher">
      <button
        aria-expanded={open ? "true" : "false"}
        className="mafiking-chapter-trigger"
        disabled={!canSwitch}
        onClick={() => canSwitch && setOpen((value) => !value)}
        type="button"
      >
        <span className="mafiking-chapter-name">{label}</span>
        <Icon.ChevD className={`w-4 h-4 ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <>
          <div className="mafiking-chapter-backdrop" onClick={() => setOpen(false)} />
          <div className="mafiking-chapter-menu">
            {chapters.map((item) => {
              const active = Number(item.id) === Number(chapter?.id);
              return (
                <button
                  className={active ? "is-active" : ""}
                  key={`${item.mapel || "mapel"}-${item.id}`}
                  onClick={() => {
                    setOpen(false);
                    if (!active) onSelect(item);
                  }}
                  type="button"
                >
                  <span>{`Bab ${Number(item.num || 0)}: ${item.title}`}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
};

// ─── Choice (Pilgan) view ─────────────────────────────────────────────────
const ChoiceView = ({
  attempt, error, onBack, onChoiceSelect, onHintToggle, onMoveProblem,
  onSubmit, onSwitchCanvas, problem, problemIndex, selectedChoiceIndex,
  showHint, totalProblems, subtopicTitle, currentChapter, availableChapters,
  onChapterSelect, getChoices, getCorrectChoiceIndex,
}) => {
  const choices = getChoices(problem);
  const correctIndex = getCorrectChoiceIndex(problem, choices);
  const isAnswered = attempt?.mode === "choice";
  const isCorrect = Boolean(attempt?.evaluation?.isCorrect);
  const firstStep = (problem.steps || [])[0];
  const canSubmitChoice = selectedChoiceIndex != null && !isAnswered && choices.length > 0;

  return (
    <div className="mafiking-practice">
      <div className="mafiking-session-bar">
        <button className="mafiking-back-button" onClick={onBack} type="button">
          <Icon.ChevL className="w-4 h-4" />
          Kembali
        </button>
        <div className="mafiking-session-copy">
          <ChapterSwitcher
            chapter={currentChapter}
            chapters={availableChapters}
            fallbackTitle={subtopicTitle || "Latihan"}
            onSelect={onChapterSelect}
          />
        </div>
        <div className="mafiking-session-stats">
          <button className="mafiking-canvas-button mafiking-session-canvas-button" onClick={onSwitchCanvas} type="button">
            <Icon.Sparkles className="w-4 h-4" />
            Try Canvas
          </button>
        </div>
      </div>

      <section className="mafiking-question-card">
        <div className="mafiking-question-meta">
          <span>Soal {problemIndex + 1} dari {totalProblems}</span>
          <span className="mafiking-difficulty">{problem.difficulty || "Medium"}</span>
        </div>

        <div className="mafiking-progress-dots" aria-hidden="true">
          {Array.from({ length: totalProblems }).map((_, idx) => (
            <span className={idx === problemIndex ? "is-current" : ""} key={idx} />
          ))}
        </div>

        <p className="mafiking-question-title">
          {renderEquation(problem.question_display || problem.question_text)}
        </p>

        <div className="mafiking-answer-heading">Jawaban Anda</div>
        {choices.length ? (
          <div className="mafiking-choice-list">
            {choices.map((choice, idx) => {
              const selected = selectedChoiceIndex === idx;
              const isAnswerCorrect = idx === correctIndex;
              const wrongSelected = isAnswered && selected && !isAnswerCorrect;
              return (
                <button
                  className="mafiking-choice-option"
                  data-correct={isAnswered && isAnswerCorrect ? "true" : undefined}
                  data-selected={selected ? "true" : undefined}
                  data-wrong={wrongSelected ? "true" : undefined}
                  disabled={isAnswered}
                  key={idx}
                  onClick={() => onChoiceSelect(idx)}
                  type="button"
                >
                  <span className="mafiking-choice-letter">{String.fromCharCode(65 + idx)}</span>
                  <span>{renderEquation(choice)}</span>
                  {isAnswered && isAnswerCorrect ? <Icon.Check className="w-5 h-5" /> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mafiking-error-box" style={{ marginTop: 8 }}>
            <Icon.Target className="w-4 h-4" />
            Soal ini belum punya pilihan jawaban. Coba mode Canvas.
          </div>
        )}

        {showHint && !isAnswered && firstStep ? (
          <div className="mafiking-hint-box">
            <strong>Petunjuk:</strong> {firstStep.title || ""}. {firstStep.body || firstStep.description || ""}
          </div>
        ) : null}

        {isAnswered ? (
          <div className={isCorrect ? "mafiking-answer-result is-correct" : "mafiking-answer-result is-wrong"}>
            {isCorrect ? "Jawaban benar. Kunci langkah sudah terbuka." :
              `Belum tepat. Jawaban benar: ${correctIndex >= 0 ? renderEquation(choices[correctIndex]) : (problem.answer_display || "—")}`}
          </div>
        ) : null}

        {error ? (
          <div className="mafiking-error-box">
            <Icon.Target className="w-4 h-4" />
            {error}
          </div>
        ) : null}
      </section>

      <div className="mafiking-action-row">
        <button
          className="mafiking-soft-button mafiking-action-left"
          disabled={problemIndex === 0}
          onClick={() => onMoveProblem(-1)}
          type="button"
        >
          <Icon.ChevL className="w-4 h-4" />
          Sebelumnya
        </button>
        <button className="mafiking-soft-button mafiking-action-center" onClick={onHintToggle} type="button">
          <Icon.Bulb className="w-4 h-4" />
          Hint
        </button>
        {canSubmitChoice ? (
          <button
            className="mafiking-primary-button mafiking-action-right"
            onClick={onSubmit}
            type="button"
          >
            Cek Jawaban
          </button>
        ) : (
        <button
          className="mafiking-soft-button mafiking-action-right"
          disabled={problemIndex >= totalProblems - 1}
          onClick={() => onMoveProblem(1)}
          type="button"
        >
          Lewati
          <Icon.Arrow className="w-4 h-4" />
        </button>
        )}
      </div>

      <SolutionStepsPanel attempt={attempt} problem={problem} />
    </div>
  );
};

// ─── Solution steps (revealed after answering) ────────────────────────────
const SolutionStepsPanel = ({ attempt, problem }) => {
  const steps = problem.steps || [];
  const isAnswered = Boolean(attempt);

  return (
    <section className="mafiking-solution-card">
      <div className="mafiking-solution-header">
        <div className="mafiking-solution-title">
          <span className="mafiking-bulb"><Icon.Sparkles className="w-4 h-4" /></span>
          <h2>Langkah Penyelesaian</h2>
        </div>
        <span className="mafiking-step-count">
          {isAnswered ? `${steps.length} / ${steps.length} Terungkap` : "Terkunci"}
        </span>
      </div>

      {isAnswered ? (
        <div className="mafiking-step-list">
          {steps.map((step, idx) => (
            <div className="mafiking-step-row" key={idx}>
              <div className="mafiking-step-index">{idx + 1}</div>
              <div className="mafiking-step-content">
                <h3>{step.title || `Langkah ${idx + 1}`}</h3>
                <div className="mafiking-formula-box">{renderEquation(step.body || step.description || "")}</div>
              </div>
            </div>
          ))}
          {!steps.length ? (
            <div className="mafiking-locked-steps"><p>Belum ada langkah untuk soal ini.</p></div>
          ) : null}
        </div>
      ) : (
        <div className="mafiking-locked-steps">
          <p>Pilih jawaban dulu untuk membuka langkah penyelesaian.</p>
        </div>
      )}
    </section>
  );
};

// ─── Canvas view ──────────────────────────────────────────────────────────
const CanvasView = ({
  attempt, boardDirty, boardRef, error, focusMode, onBackToChoice,
  onBoardDirtyChange, onFocusModeToggle, onMoveProblem, onSubmit, problem,
  problemIndex, showResultModal, submitting, totalProblems, onCloseResult,
  subtopicTitle, setRoute,
}) => {
  const AnswerBoard = window.AnswerBoard;

  return (
    <div className={`mafiking-practice mafiking-canvas-practice ${focusMode ? "is-focus-mode" : ""}`}>
      {!focusMode ? (
        <div className="mafiking-session-bar">
          <button className="mafiking-back-button" onClick={() => setRoute("belajar")} type="button">
            <Icon.ChevL className="w-4 h-4" />
            Kembali
          </button>
          <div className="mafiking-session-copy">
            <strong>Canvas untuk stylus pen</strong>
            <span>Tulis jawaban di paper, lalu kirim ke AI.</span>
          </div>
          <div className="mafiking-session-stats">
            <button className="mafiking-soft-button mafiking-session-canvas-button" onClick={onBackToChoice} type="button">
              Try Pilgan
            </button>
          </div>
        </div>
      ) : null}

      {!focusMode ? (
        <section className="mafiking-canvas-card">
          <div className="mafiking-question-meta">
            <span>Soal {problemIndex + 1} dari {totalProblems}</span>
            <span className="mafiking-difficulty">{problem.difficulty || "Medium"}</span>
            {subtopicTitle ? <span>{subtopicTitle}</span> : null}
          </div>

          <div className="mafiking-progress-dots" aria-hidden="true">
            {Array.from({ length: totalProblems }).map((_, idx) => (
              <span className={idx === problemIndex ? "is-current" : ""} key={idx} />
            ))}
          </div>

          <div className="mafiking-canvas-question-title">
            <div className="mafiking-canvas-equation">
              {renderEquation(problem.question_display || problem.question_text)}
            </div>
            <p className="mafiking-canvas-instruction">
              Tulis langkah penyelesaian langsung di paper. AI akan membaca canvas dan menjelaskan bagian yang salah.
            </p>
          </div>

          <div className="mafiking-answer-heading">Jawaban Anda</div>

          <div className="mafiking-canvas-card-actions">
            <button
              className="mafiking-soft-button"
              disabled={problemIndex === 0}
              onClick={() => onMoveProblem(-1)}
              type="button"
            >
              <Icon.ChevL className="w-4 h-4" />
              Soal Sebelumnya
            </button>
            <button
              className="mafiking-soft-button"
              disabled={problemIndex >= totalProblems - 1}
              onClick={() => onMoveProblem(1)}
              type="button"
            >
              Lewati Soal
              <Icon.Arrow className="w-4 h-4" />
            </button>
          </div>

          {error ? (
            <div className="mafiking-error-box">
              <Icon.Target className="w-4 h-4" />
              {error}
            </div>
          ) : null}
        </section>
      ) : null}

      <AnswerBoard
        key={problem.id}
        ref={boardRef}
        boardDirty={boardDirty}
        focusMode={focusMode}
        focusActions={{
          backDisabled: problemIndex === 0,
          nextDisabled: problemIndex >= totalProblems - 1,
          nextLabel: boardDirty ? "Submit" : "Next",
          nextPrimary: boardDirty,
          onBack: () => onMoveProblem(-1),
          onNext: boardDirty ? onSubmit : () => onMoveProblem(1),
        }}
        isSubmitting={submitting}
        onDirtyChange={onBoardDirtyChange}
        onFocusModeToggle={onFocusModeToggle}
        onSubmit={onSubmit}
        stickyQuestion={focusMode ? (
          <div className="canvas-board-question-card">
            <div className="mafiking-question-meta">
              <span>Soal {problemIndex + 1} dari {totalProblems}</span>
              <span className="mafiking-difficulty">{problem.difficulty || "Medium"}</span>
            </div>
            <div className="mafiking-canvas-question-title">
              <div className="mafiking-canvas-equation">
                {renderEquation(problem.question_display || problem.question_text)}
              </div>
            </div>
            {error ? <div className="mafiking-error-box"><Icon.Target className="w-4 h-4" />{error}</div> : null}
          </div>
        ) : null}
      />

      {submitting && !focusMode ? (
        <section className="mafiking-loading-card">
          <div className="mafiking-answer-heading">Mengevaluasi jawaban</div>
          <p>Gemini sedang membaca tulisan tangan dari canvas dan mengecek langkah pengerjaan.</p>
        </section>
      ) : null}

      {showResultModal && attempt ? (
        <ResultModal attempt={attempt} onClose={onCloseResult} />
      ) : null}
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────
function getPracticeChapters(context) {
  const mapel = context?.mapel || "Matematika";
  const allChapters = window.chapterData?.[mapel] || [];
  const semester = Number(context?.semester || 0);
  return allChapters
    .filter((chapter) => !semester || Number(chapter.semester) === semester)
    .map((chapter) => ({ ...chapter, mapel }));
}

function getCurrentChapter(context, session, availableChapters) {
  const byId = availableChapters.find((chapter) => Number(chapter.id) === Number(context?.id));
  if (byId) return byId;

  const wantedTitle = normalizeText(context?.title || session?.subtopic?.title);
  const byTitle = availableChapters.find((chapter) => normalizeText(chapter.title) === wantedTitle);
  if (byTitle) return byTitle;

  if (context?.title) return { ...context, mapel: context.mapel || "Matematika" };
  return { title: session?.subtopic?.title || "Latihan", mapel: context?.mapel || "Matematika" };
}

async function loadQuestionSource(questionSource) {
  if (questionSource.type === "subtopic") {
    const data = await MafikingAPI.get(`/api/quiz/subtopics/${questionSource.subtopic.id}/full`);
    return {
      ...data,
      problems: data.problems.map((p) => ({ ...p, sourceSubtopic: data.subtopic })),
    };
  }
  const subtopicSessions = await Promise.all(
    questionSource.subtopics.map((s) => MafikingAPI.get(`/api/quiz/subtopics/${s.id}/full`))
  );
  return {
    problems: subtopicSessions.flatMap((data) =>
      data.problems.map((p) => ({ ...p, sourceSubtopic: data.subtopic }))
    ),
    subtopic: { id: questionSource.chapter.id, title: questionSource.title },
  };
}

function chooseQuestionSource(init, context) {
  const chapters = init?.chapters || [];
  const problemCounts = init?.problemCounts || {};
  const allSubtopics = chapters.flatMap((c) => c.subtopics || []);
  const withProblems = allSubtopics.filter((s) => Number(problemCounts[s.id] || 0) > 0);
  if (!withProblems.length) return null;
  if (!context) return { subtopic: withProblems[0], type: "subtopic" };

  const mapel = normalizeText(context.mapel);
  if (mapel && mapel !== "matematika") return null;

  const title = normalizeText(context.title);
  if (title.includes("teknik integrasi")) {
    const integralChapter = chapters.find((c) => normalizeText(c.title).includes("integral"));
    const subtopics = (integralChapter?.subtopics || []).filter((s) => Number(problemCounts[s.id] || 0) > 0);
    if (!integralChapter || !subtopics.length) return null;
    return { chapter: integralChapter, subtopics, title: context.title, type: "chapter" };
  }

  const searchTerms = [context.title, ...(context.topics || [])]
    .map(normalizeText)
    .flatMap((t) => [t, ...topicAliases(t)])
    .filter(Boolean);
  const matched = withProblems.find((s) => {
    const haystack = normalizeText(`${s.title} ${s.slug} ${s.description || ""}`);
    return searchTerms.some((t) => haystack.includes(t) || t.includes(haystack));
  });
  return matched ? { subtopic: matched, type: "subtopic" } : null;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeAnswerText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^0-9a-z+\-*/=().,]/g, "");
}

function topicAliases(term) {
  const aliases = [];
  if (term.includes("substitusi")) aliases.push("u sub", "u substitution");
  if (term.includes("parsial")) aliases.push("ibp", "integration by parts");
  if (term.includes("trigonometri")) aliases.push("trig", "trigonometric integrals");
  return aliases;
}

function buildGeneratedChoices(problem, problems) {
  const correct = problem?.answer_display || problem?.answer_text || "";
  if (!correct) return [];
  const seen = new Set([normalizeAnswerText(correct)]);
  const distractors = [];
  for (const candidate of problems || []) {
    if (!candidate || candidate.id === problem.id) continue;
    const answer = candidate.answer_display || candidate.answer_text || "";
    const normalized = normalizeAnswerText(answer);
    if (!answer || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    distractors.push(answer);
  }
  const choices = [correct, ...deterministicShuffle(distractors, stableHash(`${problem.id}:${correct}`)).slice(0, 3)];
  return deterministicShuffle(choices, stableHash(`choice:${problem.id}:${correct}`));
}

function stableHash(value) {
  return String(value || "").split("").reduce((hash, char) => {
    return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }, 0);
}

function deterministicShuffle(items, seed) {
  const shuffled = [...items];
  let state = Math.abs(seed) || 1;
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const SUPERSCRIPT_CHARS = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "(": "⁽", ")": "⁾",
};

function toSuperscript(value) {
  return String(value).split("").map((c) => SUPERSCRIPT_CHARS[c] || c).join("");
}

function renderEquation(value) {
  const text = String(value || "")
    .replace(/\\,/g, " ")
    .replace(/\\int/g, "∫")
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\sin/g, "sin")
    .replace(/\\cos/g, "cos")
    .replace(/\\tan/g, "tan")
    .replace(/\\sec/g, "sec")
    .replace(/\\ln/g, "ln")
    .replace(/\\sqrt\{([^}]+)\}/g, "√($1)")
    .replace(/\\dfrac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2")
    .replace(/\^\s*\{\s*([^}]+)\s*\}/g, (_, e) => toSuperscript(e))
    .replace(/\^\s*\(\s*([^)]+)\s*\)/g, (_, e) => toSuperscript(`(${e})`))
    .replace(/\^\s*([+-]?\d+)/g, (_, e) => toSuperscript(e))
    .replace(/\s+/g, " ")
    .trim();
  return text || value;
}

// ─── Result modal ─────────────────────────────────────────────────────────
const ResultModal = ({ attempt, onClose }) => {
  const evaluation = attempt.evaluation || {};
  const wrongSteps = evaluation.wrongSteps || [];
  return (
    <div className="canvas-result-modal-backdrop" role="presentation">
      <article className="canvas-result-modal result-markdown">
        <button aria-label="Tutup hasil koreksi" className="canvas-result-modal-close" onClick={onClose} type="button">×</button>
        <div className="mafiking-solution-title">
          <span className="mafiking-bulb">{evaluation.isCorrect ? "✓" : "!"}</span>
          <div>
            <div className="kicker">Hasil Koreksi</div>
            <h2>Skor {Math.round(Number(evaluation.score) || 0)}/100</h2>
          </div>
        </div>
        {evaluation.detectedAnswerText ? (
          <p><strong>Terbaca:</strong> {evaluation.detectedAnswerText}</p>
        ) : null}
        <p>{attempt.feedback || evaluation.fullFeedback || "Koreksi selesai."}</p>
        {wrongSteps.length ? (
          <div className="result-step-list">
            {wrongSteps.map((step, idx) => (
              <div className="result-step-card" key={idx}>
                <strong>{step.stepNumber || `Langkah ${idx + 1}`}</strong>
                <p>{step.issue}</p>
                {step.hint ? <span>Petunjuk: {step.hint}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </article>
    </div>
  );
};

window.Practice = Practice;
