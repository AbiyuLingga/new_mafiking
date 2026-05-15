// Practice route — choice (multiple choice) default, optional canvas mode.

const Practice = ({ context, setRoute, isAdmin }) => {
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

  async function loadPractice(options = {}) {
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
      const nextProblems = data?.problems || [];
      const activeIndex = options.activeProblemId
        ? nextProblems.findIndex((item) => Number(item.id) === Number(options.activeProblemId))
        : -1;
      const fallbackIndex = Number.isInteger(options.fallbackIndex)
        ? Math.min(Math.max(options.fallbackIndex, 0), Math.max(nextProblems.length - 1, 0))
        : 0;
      setSession(data);
      setProblemIndex(activeIndex >= 0 ? activeIndex : fallbackIndex);
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

    if (isCorrect) showToast("+10 XP · Jawaban benar!", "success", 2500);
    MafikingAPI.post("/api/progress/submit", {
      correct: isCorrect, hintsUsed: showHint ? 1 : 0, problemId: problem.id,
    }).then((res) => {
      if (res && res.leveledUp) showToast(`Naik ke Level ${res.level}! 🎉`, "success", 5000);
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
      const isCorrect = Boolean(evaluation.evaluation?.isCorrect);
      if (isCorrect) showToast("Jawaban benar! Progress tersimpan.", "success");
      MafikingAPI.post("/api/progress/submit", {
        correct: isCorrect,
        hintsUsed: 0,
        problemId: problem.id,
      }).catch(() => null);
    } catch (caught) {
      const msg = caught.message || "";
      if (msg.toLowerCase().includes("rate limit") || msg.includes("429")) {
        showToast("Batas API tercapai — coba lagi dalam beberapa detik.", "error");
      } else if (msg.toLowerCase().includes("api key")) {
        showToast("Konfigurasi belum lengkap — koreksi tidak tersedia.", "error");
      } else {
        showToast("Koreksi gagal: " + msg, "error");
      }
      setError(msg);
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
        <section className="mafiking-canvas-card" aria-label="Memuat soal" aria-busy="true">
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4 mb-6" />
          <Skeleton className="h-12 w-full mb-2" />
          <Skeleton className="h-12 w-full mb-2" />
          <Skeleton className="h-12 w-full mb-2" />
          <Skeleton className="h-12 w-full" />
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
            Bank soal yang ter-export saat ini baru berisi bab Integral.
          </p>
          <button
            className="mafiking-primary-button mt-6"
            onClick={() => setRoute("belajar")}
            type="button"
          >
            Pilih bab lain
          </button>
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
        isAdmin={isAdmin}
        onBackToChoice={() => switchMode("choice")}
        onSwitchMode={switchMode}
        onBoardDirtyChange={setBoardDirty}
        onFocusModeToggle={() => setFocusMode((v) => !v)}
        onMoveProblem={moveProblem}
        onProblemSelect={setProblemIndex}
        onReloadSession={loadPractice}
        onSubmit={submitCanvas}
        problem={problem}
        problemIndex={problemIndex}
        problems={session?.problems || []}
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
      isAdmin={isAdmin}
      onBack={() => setRoute("belajar")}
      onChoiceSelect={setSelectedChoiceIndex}
      onHintToggle={() => setShowHint((v) => !v)}
      onMoveProblem={moveProblem}
      onProblemSelect={setProblemIndex}
      onReloadSession={loadPractice}
      onSubmit={submitChoice}
      onSwitchCanvas={() => switchMode("canvas")}
      onSwitchMode={switchMode}
      problem={problem}
      problemIndex={problemIndex}
      problems={session?.problems || []}
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

const ModeSegment = ({ value, onChange }) => (
  <div aria-label="Mode latihan" className="mode-segment" role="group">
    <button
      aria-pressed={value === "choice"}
      className={`mode-segment-item ${value === "choice" ? "is-active" : ""}`}
      onClick={() => onChange("choice")}
      type="button"
    >
      Pilgan
    </button>
    <button
      aria-pressed={value === "canvas"}
      className={`mode-segment-item ${value === "canvas" ? "is-active" : ""}`}
      onClick={() => onChange("canvas")}
      type="button"
    >
      Kanvas
    </button>
  </div>
);

const AdminQuestionControls = ({
  compact = false, problem, problems, problemIndex, onProblemSelect, onReloadSession,
}) => {
  const [subtopics, setSubtopics] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragDropIndex, setDragDropIndex] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSubtopic, setImportSubtopic] = useState(null);
  const stripRef = useRef(null);
  const pointerDragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const dragDropIndexRef = useRef(null);
  const total = Array.isArray(problems) ? problems.length : 0;
  const visibleRows = problems.map((item, idx) => ({ item, originalIndex: idx }));
  const motionRectsRef = useRef(new Map());
  const motionFrameRef = useRef(null);
  const visibleMotionKey = visibleRows.map((row) => `${row.item?.id || row.originalIndex}:${row.originalIndex}`).join("|");

  useEffect(() => {
    if (typeof MafikingAPI === "undefined") return;
    MafikingAPI.get("/api/admin/subtopics").then(setSubtopics).catch(() => setSubtopics([]));
  }, []);

  useEffect(() => {
    if (!subtopics.length) return;
    const current = subtopics.find((subtopic) => Number(subtopic.id) === Number(problem?.subtopic_id));
    setImportSubtopic(current || subtopics[0]);
  }, [problem?.subtopic_id, subtopics]);

  function summarizeProblem(item) {
    const raw = String(item?.question_display || item?.question_text || "Soal tanpa judul").replace(/\s+/g, " ").trim();
    const text = typeof renderEquation === "function" ? renderEquation(raw) : raw;
    return text.length > 86 ? text.slice(0, 83) + "..." : text;
  }

  function updateDragDropIndex(nextIndex) {
    if (dragDropIndexRef.current === nextIndex) return;
    dragDropIndexRef.current = nextIndex;
    setDragDropIndex(nextIndex);
  }

  async function createBlankProblem() {
    const targetSubtopicId = problem?.subtopic_id || importSubtopic?.id || subtopics[0]?.id;
    if (!targetSubtopicId) {
      showToast("Subtopik tujuan belum tersedia.", "error");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/problems", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtopic_id: targetSubtopicId,
          question_text: "",
          question_display: "",
          answer_display: "",
          acceptable_answers: [],
          difficulty: "Easy",
          question_type: "mc",
          mc_options: ["", "", "", ""],
          sort_order: total + 1,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gagal menambah soal");
      showToast("Soal kosong ditambahkan.", "success");
      if (onProblemSelect) onProblemSelect(total);
      if (onReloadSession) onReloadSession({ activeProblemId: data.id, fallbackIndex: total });
    } catch (caught) {
      showToast(caught.message || "Gagal menambah soal", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCurrentProblem() {
    if (!problem || !window.confirm("Hapus soal ini beserta semua langkahnya?")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/problems/" + problem.id, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gagal menghapus soal");
      showToast("Soal dihapus.", "success");
      const nextIndex = Math.max(0, Math.min(problemIndex, total - 2));
      if (onProblemSelect) onProblemSelect(nextIndex);
      if (onReloadSession) onReloadSession({ fallbackIndex: nextIndex });
    } catch (caught) {
      showToast(caught.message || "Gagal menghapus soal", "error");
    } finally {
      setBusy(false);
    }
  }

  async function rewriteOrder(nextProblems, nextActiveIndex) {
    setBusy(true);
    try {
      await Promise.all(nextProblems.map((item, idx) => fetch("/api/admin/problems/" + item.id + "/sort", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: idx + 1 }),
      }).then((response) => {
        if (!response.ok) throw new Error("Gagal memindahkan urutan soal");
      })));
      showToast("Urutan soal diperbarui.", "success");
      if (onProblemSelect) onProblemSelect(nextActiveIndex);
      if (onReloadSession) onReloadSession({ activeProblemId: problem.id, fallbackIndex: nextActiveIndex });
    } catch (caught) {
      showToast(caught.message || "Gagal memindahkan urutan soal", "error");
    } finally {
      setBusy(false);
    }
  }

  function reorderProblems(fromIndex, nextIndex) {
    if (busy || fromIndex === nextIndex) return;
    if (fromIndex < 0 || fromIndex >= total || nextIndex < 0 || nextIndex >= total) return;
    const nextProblems = problems.slice();
    const [current] = nextProblems.splice(fromIndex, 1);
    nextProblems.splice(nextIndex, 0, current);
    rewriteOrder(nextProblems, nextIndex);
  }

  function reorderLiftedProblem(fromIndex, insertIndex) {
    if (busy || fromIndex < 0 || fromIndex >= total) return;
    const remaining = problems.filter((_, idx) => idx !== fromIndex);
    const nextIndex = Math.max(0, Math.min(remaining.length, insertIndex));
    const nextProblems = remaining.slice();
    nextProblems.splice(nextIndex, 0, problems[fromIndex]);
    if (nextProblems.every((item, idx) => item.id === problems[idx]?.id)) return;
    rewriteOrder(nextProblems, Math.min(nextIndex, nextProblems.length - 1));
  }

  function getDropIndex(event, idx) {
    const strip = event.currentTarget.closest(".admin-question-card-strip");
    const row = event.currentTarget.closest("[data-admin-question-index]");
    const flow = strip && window.getComputedStyle(strip).gridAutoFlow;
    const isHorizontal = String(flow || "").includes("column");
    const rect = (row || event.currentTarget).getBoundingClientRect();
    const beforeCard = isHorizontal
      ? event.clientX < rect.left + rect.width / 2
      : event.clientY < rect.top + rect.height / 2;
    return beforeCard ? idx : idx + 1;
  }

  function getPointerDropIndex(clientX, clientY) {
    const strip = stripRef.current;
    if (!strip) return total;
    const flow = window.getComputedStyle(strip).gridAutoFlow;
    const isHorizontal = String(flow || "").includes("column");
    const cards = Array.from(strip.querySelectorAll("[data-admin-question-index]"));
    for (const card of cards) {
      const idx = Number(card.getAttribute("data-admin-visible-index"));
      const rect = card.getBoundingClientRect();
      const beforeCard = isHorizontal
        ? clientX < rect.left + rect.width / 2
        : clientY < rect.top + rect.height / 2;
      if (beforeCard) return idx;
    }
    return total;
  }

  function finishDrag(fromIndex, rawDropIndex) {
    setDragIndex(null);
    dragDropIndexRef.current = null;
    setDragDropIndex(null);
    setDragPreview(null);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(rawDropIndex)) return;
    const boundedDropIndex = Math.max(0, Math.min(total, rawDropIndex));
    const insertIndex = boundedDropIndex > fromIndex ? boundedDropIndex - 1 : boundedDropIndex;
    reorderLiftedProblem(fromIndex, insertIndex);
  }

  function renderDropSlot(position, isAfter = false) {
    if (dragIndex === null || dragDropIndex !== position) return null;
    return (
      <span
        className={`admin-question-drop-indicator${isAfter ? " is-after" : ""}`}
        aria-hidden="true"
        key={`drop-${position}`}
      />
    );
  }

  function getPreviewShiftClass(index) {
    if (!Number.isInteger(dragIndex) || !Number.isInteger(dragDropIndex)) return "";
    const boundedDropIndex = Math.max(0, Math.min(total, dragDropIndex));
    const insertIndex = boundedDropIndex > dragIndex ? boundedDropIndex - 1 : boundedDropIndex;
    if (insertIndex === dragIndex) return "";

    if (insertIndex > dragIndex && index > dragIndex && index <= insertIndex) {
      return "is-preview-shift-up";
    }
    if (insertIndex < dragIndex && index >= insertIndex && index < dragIndex) {
      return "is-preview-shift-down";
    }
    return "";
  }

  function startPointerReorder(event, idx) {
    if (busy || event.button !== 0) return;
    const row = event.currentTarget.closest("[data-admin-question-row]");
    const rect = (row || event.currentTarget).getBoundingClientRect();
    pointerDragRef.current = {
      fromIndex: idx,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      dragging: false,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch (_) {}
  }

  function movePointerReorder(event) {
    const state = pointerDragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
    if (!state.dragging && distance < 6) return;
    state.dragging = true;
    suppressClickRef.current = true;
    setDragIndex(state.fromIndex);
    state.dropIndex = getPointerDropIndex(event.clientX, event.clientY);
    updateDragDropIndex(state.dropIndex);
    setDragPreview({
      x: event.clientX,
      y: event.clientY,
      width: state.width,
      height: state.height,
      item: problems[state.fromIndex],
      originalIndex: state.fromIndex,
    });
    event.preventDefault();
  }

  function endPointerReorder(event) {
    const state = pointerDragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    pointerDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch (_) {}
    if (!state.dragging) return;
    suppressClickRef.current = true;
    const dropIndex = Number.isInteger(state.dropIndex) ? state.dropIndex : getPointerDropIndex(event.clientX, event.clientY);
    finishDrag(state.fromIndex, dropIndex);
    event.preventDefault();
  }

  function cancelPointerReorder() {
    pointerDragRef.current = null;
    dragDropIndexRef.current = null;
    setDragIndex(null);
    setDragDropIndex(null);
    setDragPreview(null);
  }

  useEffect(() => {
    function handlePointerMove(event) {
      movePointerReorder(event);
    }
    function handlePointerUp(event) {
      endPointerReorder(event);
    }
    function handlePointerCancel() {
      cancelPointerReorder();
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerCancel, { passive: false });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [busy, problems, total]);

  React.useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip || typeof window === "undefined") return;

    const rows = Array.from(strip.querySelectorAll("[data-admin-question-row]"));
    const nextRects = new Map(rows.map((row) => [
      row.getAttribute("data-admin-question-row"),
      row.getBoundingClientRect(),
    ]));
    const previousRects = motionRectsRef.current;
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (dragIndex !== null) {
      if (motionFrameRef.current) window.cancelAnimationFrame(motionFrameRef.current);
      rows.forEach((row) => {
        row.style.transition = "";
        row.style.transform = "";
        row.style.willChange = "";
      });
      motionRectsRef.current = nextRects;
      return;
    }

    if (!reduceMotion && previousRects.size) {
      const moves = rows.map((row) => {
        const key = row.getAttribute("data-admin-question-row");
        const previous = previousRects.get(key);
        const next = nextRects.get(key);
        if (!previous || !next) return null;

        const dx = previous.left - next.left;
        const dy = previous.top - next.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;

        row.style.transition = "none";
        row.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        row.style.willChange = "transform";
        return row;
      }).filter(Boolean);

      if (moves.length) {
        if (motionFrameRef.current) window.cancelAnimationFrame(motionFrameRef.current);
        motionFrameRef.current = window.requestAnimationFrame(() => {
          moves.forEach((row) => {
            row.style.transition = "transform 240ms cubic-bezier(.22, .8, .22, 1)";
            row.style.transform = "";
            window.setTimeout(() => {
              row.style.transition = "";
              row.style.willChange = "";
            }, 260);
          });
        });
      }
    }

    motionRectsRef.current = nextRects;
  }, [visibleMotionKey, dragIndex, dragDropIndex, problemIndex, total]);

  return (
    <div className={`admin-question-controls${compact ? " is-compact" : ""}`} aria-label="Kontrol admin soal">
      <div className="admin-question-controls-head">
        <div className="admin-question-controls-copy">
          <span className="kicker">Admin Soal</span>
          <strong>{compact ? "Aksi cepat" : total ? "Urutan soal" : "Belum ada soal"}</strong>
          {total && !compact ? <span className="admin-question-controls-note">Tarik kapsul untuk memindahkan · {problemIndex + 1}/{total}</span> : null}
        </div>
        <div className="admin-question-control-actions">
          <button className="admin-question-control-btn" disabled={busy} onClick={createBlankProblem} type="button">
            + Soal
          </button>
          {compact ? (
            <button className="admin-question-control-btn" disabled={busy || !subtopics.length} onClick={() => setImportOpen(true)} type="button">
              Upload Soal
            </button>
          ) : (
            <button className="admin-question-control-btn is-danger" disabled={busy || !problem} onClick={deleteCurrentProblem} type="button">
              Hapus
            </button>
          )}
        </div>
      </div>
      {!compact ? (
        <div
          ref={stripRef}
          className="admin-question-card-strip"
          aria-label="Kartu urutan soal"
          onDragOver={(event) => {
            if (dragIndex === null || event.target !== event.currentTarget) return;
            event.preventDefault();
            updateDragDropIndex(total);
          }}
          onDrop={(event) => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            const fromIndex = Number(event.dataTransfer.getData("text/plain"));
            finishDrag(fromIndex, dragDropIndex ?? total);
          }}
        >
          {visibleRows.map((row, visibleIdx) => (
            <React.Fragment key={row.item.id || row.originalIndex}>
              <div
                className={[
                  "admin-question-order-row",
                  getPreviewShiftClass(row.originalIndex),
                ].filter(Boolean).join(" ")}
                data-admin-question-index={row.originalIndex}
                data-admin-question-row={String(row.item.id || row.originalIndex)}
                data-admin-visible-index={visibleIdx}
              >
                {renderDropSlot(visibleIdx)}
                {visibleIdx === visibleRows.length - 1 ? renderDropSlot(visibleRows.length, true) : null}
                <span className="admin-question-order-number" aria-hidden="true">{row.originalIndex + 1}</span>
                <button
                  aria-current={row.originalIndex === problemIndex ? "true" : undefined}
                  aria-label={`Soal ${row.originalIndex + 1}: ${summarizeProblem(row.item)}`}
                  className={[
                    "admin-question-order-card",
                    row.originalIndex === problemIndex ? "is-active" : "",
                    row.originalIndex === dragIndex ? "is-dragging" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={busy}
                  draggable={false}
                  onClick={(event) => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      event.preventDefault();
                      return;
                    }
                    if (onProblemSelect) onProblemSelect(row.originalIndex);
                  }}
                  onDragEnd={() => {
                    dragDropIndexRef.current = null;
                    setDragIndex(null);
                    setDragDropIndex(null);
                    setDragPreview(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dragIndex !== null) updateDragDropIndex(getDropIndex(event, visibleIdx));
                  }}
                  onDragStart={(event) => {
                    setDragIndex(row.originalIndex);
                    updateDragDropIndex(visibleIdx);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(row.originalIndex));
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
                    finishDrag(fromIndex, dragDropIndex ?? getDropIndex(event, visibleIdx));
                  }}
                  onPointerCancel={cancelPointerReorder}
                  onPointerDown={(event) => startPointerReorder(event, row.originalIndex)}
                  title="Tarik kartu ini untuk memindahkan urutan soal"
                  type="button"
                >
                  <span className="admin-question-order-top">
                    <span className="admin-question-order-meta">{row.item.difficulty || "Easy"} · {row.item.question_type || "open"}</span>
                  </span>
                  <span className="admin-question-order-title">{summarizeProblem(row.item)}</span>
                </button>
              </div>
            </React.Fragment>
          ))}
        </div>
      ) : null}

      {!compact && dragPreview ? (
        <div
          className="admin-question-drag-preview"
          aria-hidden="true"
          style={{
            left: dragPreview.x,
            top: dragPreview.y,
            width: dragPreview.width,
            minHeight: dragPreview.height,
          }}
        >
          <span className="admin-question-order-number">{dragPreview.originalIndex + 1}</span>
          <span className="admin-question-preview-capsule">
            <span className="admin-question-order-title">{summarizeProblem(dragPreview.item)}</span>
          </span>
        </div>
      ) : null}

      {importOpen && typeof AdminModal !== "undefined" && typeof AdminAiImportPanel !== "undefined" ? (
        <AdminModal title="Upload Soal" onClose={() => setImportOpen(false)} wide>
          <AdminAiImportPanel
            subtopics={subtopics}
            selectedSubtopic={importSubtopic}
            onSelectSubtopic={setImportSubtopic}
            onImported={(subtopicId) => {
              setImportOpen(false);
              if (onReloadSession && problem && Number(subtopicId) === Number(problem.subtopic_id)) {
                onReloadSession({ activeProblemId: problem.id, fallbackIndex: problemIndex });
              } else if (onReloadSession) {
                onReloadSession({ fallbackIndex: problemIndex });
              }
            }}
          />
        </AdminModal>
      ) : null}
    </div>
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
  attempt, error, isAdmin, onBack, onChoiceSelect, onHintToggle, onMoveProblem,
      onReloadSession, onSubmit, onSwitchCanvas, onSwitchMode, problem, problemIndex, selectedChoiceIndex,
      problems, onProblemSelect, showHint, totalProblems, subtopicTitle, currentChapter, availableChapters,
  onChapterSelect, getChoices, getCorrectChoiceIndex,
}) => {
  const rawChoices = getChoices(problem);
  const choices = isAdmin && !rawChoices.length ? ["", "", "", ""] : rawChoices;
  const correctIndex = getCorrectChoiceIndex(problem, choices);
  const isAnswered = attempt?.mode === "choice";
  const isCorrect = Boolean(attempt?.evaluation?.isCorrect);
  const firstStep = (problem.steps || [])[0];
  const canSubmitChoice = selectedChoiceIndex != null && !isAnswered && choices.length > 0;

  const [qDraft, setQDraft] = useState(null);
  const [editingChoice, setEditingChoice] = useState(null);
  const [adminSaving, setAdminSaving] = useState(false);
  const questionText = problem.question_display || problem.question_text || "";

  useEffect(() => { setQDraft(null); setEditingChoice(null); }, [problem.id]);

  async function saveProblem(overrides) {
    setAdminSaving(true);
    try {
      const r = await fetch('/api/admin/problems/' + problem.id, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtopic_id: problem.subtopic_id,
          question_text: problem.question_text || '',
          question_display: problem.question_display || '',
          answer_display: problem.answer_display || '',
          acceptable_answers: typeof problem.acceptable_answers === 'string' ? problem.acceptable_answers : '[]',
          difficulty: problem.difficulty || 'Easy',
          question_type: problem.question_type || 'mc',
          mc_options: choices,
          sort_order: problem.sort_order || 0,
          ...overrides,
        }),
      });
      if (!r.ok) throw new Error('Gagal simpan');
      showToast('Disimpan.', 'success');
      onReloadSession({ activeProblemId: problem.id, fallbackIndex: problemIndex });
      return true;
    } catch (e) { showToast(e.message, 'error'); return false; }
    finally { setAdminSaving(false); }
  }

  async function adminDeleteProblem() {
    if (!window.confirm('Hapus soal ini beserta semua langkahnya?')) return;
    try {
      const r = await fetch('/api/admin/problems/' + problem.id, { method: 'DELETE', credentials: 'same-origin' });
      if (!r.ok) throw new Error('Gagal menghapus');
      showToast('Soal dihapus.', 'success');
      onReloadSession({ fallbackIndex: Math.max(0, problemIndex - 1) });
    } catch (e) { showToast(e.message, 'error'); }
  }

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
          <ModeSegment value="choice" onChange={onSwitchMode} />
        </div>
      </div>

      <div className={isAdmin ? "mafiking-admin-practice-layout" : "mafiking-practice-main"}>
        <main className="mafiking-practice-main">
      <section className="mafiking-question-card">
        {isAdmin ? (
          <AdminQuestionControls
            compact
            problem={problem}
            problems={problems}
            problemIndex={problemIndex}
            onProblemSelect={onProblemSelect}
            onReloadSession={onReloadSession}
          />
        ) : null}

        <div className="mafiking-question-meta">
          <span>Soal {problemIndex + 1} dari {totalProblems}</span>
          {isAdmin ? (
            <select
              aria-label="Tingkat kesulitan"
              className="admin-difficulty-select"
              disabled={adminSaving}
              value={problem.difficulty || "Easy"}
              onChange={(event) => saveProblem({ difficulty: event.target.value })}
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          ) : (
            <span className="mafiking-difficulty">{problem.difficulty || "Medium"}</span>
          )}
        </div>

        <div className="mafiking-progress-dots" aria-hidden="true">
          {Array.from({ length: totalProblems }).map((_, idx) => (
            <span className={idx === problemIndex ? "is-current" : ""} key={idx} />
          ))}
        </div>

        {isAdmin && qDraft !== null ? (
          <div className="admin-inline-edit">
            <textarea
              className="admin-inline-textarea"
              value={qDraft}
              onChange={e => setQDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setQDraft(null); }}
              rows={3}
              autoFocus
            />
            <div className="admin-inline-actions">
              <button onClick={() => setQDraft(null)} className="admin-btn-ghost" type="button">Batal</button>
              <button
                onClick={async () => { if (await saveProblem({ question_display: qDraft, question_text: qDraft })) setQDraft(null); }}
                disabled={adminSaving}
                className="admin-btn-primary"
                type="button"
              >{adminSaving ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </div>
        ) : (
              <div
            className={isAdmin ? 'admin-question-editable' : ''}
            onClick={isAdmin ? () => setQDraft(questionText) : undefined}
            title={isAdmin ? 'Klik untuk edit soal' : undefined}
          >
            <p className={`mafiking-question-title ${isAdmin && !questionText ? "is-admin-empty" : ""}`}>
              {questionText ? React.createElement(Eq, { value: questionText }) : "Klik untuk isi soal / angka"}
            </p>
            {isAdmin && (
              <div className="admin-question-edit-hint">
                <AdminIcon.Pencil /> Klik untuk edit soal
              </div>
            )}
          </div>
        )}

        <div className="mafiking-answer-heading">
          {isAdmin ? 'Opsi Jawaban — klik untuk edit, ✓ untuk tandai benar' : 'Jawaban Anda'}
        </div>
        {choices.length ? (
          <div className="mafiking-choice-list">
            {choices.map((choice, idx) => {
              const selected = selectedChoiceIndex === idx;
              const isAnswerCorrect = idx === correctIndex;
              const wrongSelected = isAnswered && selected && !isAnswerCorrect;

              if (isAdmin && editingChoice && editingChoice.idx === idx) {
                return (
                  <div key={idx} className="admin-choice-edit-row">
                    <span className="mafiking-choice-letter">{String.fromCharCode(65 + idx)}</span>
                    <input
                      className="admin-inline-input"
                      value={editingChoice.value}
                      onChange={e => setEditingChoice({ ...editingChoice, value: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingChoice(null);
                        if (e.key === 'Enter') {
                          const nc = choices.map((c, i) => i === idx ? editingChoice.value : c);
                          saveProblem({
                            mc_options: nc,
                            question_type: 'mc',
                            answer_display: idx === correctIndex ? editingChoice.value : problem.answer_display,
                          }).then(ok => ok && setEditingChoice(null));
                        }
                      }}
                      autoFocus
                    />
                    <button
                      onClick={async () => {
                        const nc = choices.map((c, i) => i === idx ? editingChoice.value : c);
                        if (await saveProblem({
                          mc_options: nc,
                          answer_display: editingChoice.value,
                          acceptable_answers: [editingChoice.value].filter(Boolean),
                          question_type: 'mc',
                        })) setEditingChoice(null);
                      }}
                      className="admin-correct-btn"
                      title="Tandai sebagai jawaban benar"
                      type="button"
                    >✓ Benar</button>
                    <button
                      onClick={async () => {
                        const nc = choices.map((c, i) => i === idx ? editingChoice.value : c);
                        if (await saveProblem({
                          mc_options: nc,
                          question_type: 'mc',
                          answer_display: idx === correctIndex ? editingChoice.value : problem.answer_display,
                        })) setEditingChoice(null);
                      }}
                      disabled={adminSaving}
                      className="admin-btn-primary"
                      type="button"
                    >{adminSaving ? '…' : 'Simpan'}</button>
                    <button onClick={() => setEditingChoice(null)} className="admin-btn-ghost" type="button">✕</button>
                  </div>
                );
              }

              return (
                <button
                  className={`mafiking-choice-option${isAdmin ? ' admin-choice-editable' : ''}`}
                  data-correct={isAnswerCorrect && (isAdmin || isAnswered) ? "true" : undefined}
                  data-selected={!isAdmin && selected ? "true" : undefined}
                  data-wrong={!isAdmin && wrongSelected ? "true" : undefined}
                  disabled={!isAdmin && isAnswered}
                  key={idx}
                  onClick={() => isAdmin ? setEditingChoice({ idx, value: choice }) : onChoiceSelect(idx)}
                  type="button"
                >
                  <span className="mafiking-choice-letter">{String.fromCharCode(65 + idx)}</span>
                  <span className={isAdmin && !choice ? "admin-choice-empty" : ""}>
                    {choice ? React.createElement(Eq, { value: choice }) : "Klik untuk isi pilihan"}
                  </span>
                  {isAdmin && isAnswerCorrect ? <span className="admin-correct-marker">✓ Benar</span> : null}
                  {!isAdmin && isAnswered && isAnswerCorrect ? <Icon.Check className="w-5 h-5" /> : null}
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
            <strong>Petunjuk:</strong> <Eq value={firstStep.title || ""} />. <Eq value={firstStep.why || firstStep.intuition || firstStep.body || firstStep.description || ""} />
          </div>
        ) : null}

        {isAnswered ? (
          <div className={isCorrect ? "mafiking-answer-result is-correct" : "mafiking-answer-result is-wrong"}>
            {isCorrect ? "Jawaban benar. Kunci langkah sudah terbuka." : (
              React.createElement(React.Fragment, null,
                "Belum tepat. Jawaban benar: ",
                React.createElement(Eq, { value: correctIndex >= 0 ? choices[correctIndex] : (problem.answer_display || "—") })
              )
            )}
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

      <SolutionStepsPanel attempt={attempt} problem={problem} isAdmin={isAdmin} onStepSaved={onReloadSession} />

      {isAdmin && (
        <div className="admin-problem-footer">
          <button onClick={adminDeleteProblem} className="admin-btn-ghost" style={{ color: '#ef4444' }} type="button">
            Hapus Soal Ini
          </button>
        </div>
      )}
        </main>
        {isAdmin ? (
          <aside className="mafiking-admin-question-sidebar" aria-label="Urutan soal admin">
            <AdminQuestionControls
              problem={problem}
              problems={problems}
              problemIndex={problemIndex}
              onProblemSelect={onProblemSelect}
              onReloadSession={onReloadSession}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
};

// ─── Solution steps (revealed after answering; admin always visible + inline edit) ────
const SolutionStepsPanel = ({ attempt, problem, isAdmin, onStepSaved }) => {
  const steps = problem.steps || [];
  const isAnswered = Boolean(attempt);
  const showSteps = isAnswered || isAdmin;

  const [editingField, setEditingField] = useState(null); // { stepId, field, value }
  const [stepSaving, setStepSaving] = useState(false);
  const [stepMutating, setStepMutating] = useState(false);

  useEffect(() => { setEditingField(null); }, [problem.id]);

  async function addStep() {
    if (!isAdmin || stepMutating) return;
    setStepMutating(true);
    try {
      const nextOrder = steps.length + 1;
      const response = await fetch('/api/admin/problems/' + problem.id + '/steps', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_order: nextOrder,
          title: `Langkah ${nextOrder}`,
          content: '',
          why: '',
          intuition: '',
          mistakes: '',
          mistake_result: '',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Gagal tambah langkah');
      showToast('Langkah baru ditambahkan.', 'success');
      if (onStepSaved) onStepSaved({ activeProblemId: problem.id });
    } catch (e) {
      showToast(e.message || 'Gagal tambah langkah', 'error');
    } finally {
      setStepMutating(false);
    }
  }

  async function deleteStep(step) {
    if (!isAdmin || !step?.id || stepMutating) return;
    if (!window.confirm(`Hapus ${step.title || 'langkah ini'}?`)) return;
    setStepMutating(true);
    try {
      const response = await fetch('/api/admin/steps/' + step.id, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Gagal hapus langkah');
      showToast('Langkah dihapus.', 'success');
      if (onStepSaved) onStepSaved({ activeProblemId: problem.id });
    } catch (e) {
      showToast(e.message || 'Gagal hapus langkah', 'error');
    } finally {
      setStepMutating(false);
    }
  }

  async function saveStepField() {
    if (!editingField) return;
    setStepSaving(true);
    try {
      const step = steps.find(s => s.id === editingField.stepId);
      if (!step) return;
      const r = await fetch('/api/admin/steps/' + editingField.stepId, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_order: step.step_order,
          title: editingField.field === 'title' ? editingField.value : (step.title || ''),
          content: editingField.field === 'content' ? editingField.value : (step.content || ''),
          why: editingField.field === 'why' ? editingField.value : (step.why || ''),
          intuition: editingField.field === 'intuition' ? editingField.value : (step.intuition || ''),
          mistakes: editingField.field === 'mistakes' ? editingField.value : (step.mistakes || ''),
          mistake_result: editingField.field === 'mistake_result' ? editingField.value : (step.mistake_result || ''),
        }),
      });
      if (!r.ok) throw new Error('Gagal simpan langkah');
      showToast('Langkah diperbarui.', 'success');
      setEditingField(null);
      if (onStepSaved) onStepSaved({ activeProblemId: problem.id });
    } catch (e) { showToast(e.message, 'error'); } finally { setStepSaving(false); }
  }

  function renderField(step, field, display, placeholder, multiline) {
    const isEditing = editingField && editingField.stepId === step.id && editingField.field === field;
    if (isAdmin && isEditing) {
      return (
        <div className="admin-inline-edit" style={{ marginTop: 4 }}>
          {multiline ? (
            <textarea
              className="admin-inline-textarea"
              value={editingField.value}
              onChange={e => setEditingField({ ...editingField, value: e.target.value })}
              onKeyDown={e => { if (e.key === 'Escape') setEditingField(null); }}
              rows={3}
              autoFocus
            />
          ) : (
            <input
              className="admin-inline-textarea"
              value={editingField.value}
              onChange={e => setEditingField({ ...editingField, value: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Escape') setEditingField(null);
                if (e.key === 'Enter') saveStepField();
              }}
              autoFocus
            />
          )}
          <div className="admin-inline-actions">
            <button onClick={() => setEditingField(null)} className="admin-btn-ghost" type="button">Batal</button>
            <button onClick={saveStepField} disabled={stepSaving} className="admin-btn-primary" type="button">
              {stepSaving ? '…' : 'Simpan'}
            </button>
          </div>
        </div>
      );
    }
    if (isAdmin) {
      return (
        <span
          className="admin-step-field-editable"
          onClick={() => setEditingField({ stepId: step.id, field, value: step[field] || '' })}
          title="Klik untuk edit"
        >
          {display || <em className="admin-step-field-empty">{placeholder}</em>}
        </span>
      );
    }
    return display;
  }

  return (
    <section className="mafiking-solution-card">
      <div className="mafiking-solution-header">
        <div className="mafiking-solution-title">
          <span className="mafiking-bulb"><Icon.Sparkles className="w-4 h-4" /></span>
          <h2>Langkah Penyelesaian</h2>
        </div>
        <div className="mafiking-step-header-actions">
          {isAdmin ? (
            <button className="admin-step-add-inline" disabled={stepMutating} onClick={addStep} type="button">
              + Langkah
            </button>
          ) : null}
          <span className="mafiking-step-count">
            {showSteps ? `${steps.length} / ${steps.length} ${isAdmin && !isAnswered ? 'Admin' : 'Terungkap'}` : "Terkunci"}
          </span>
        </div>
      </div>

      {showSteps ? (
        <div className="mafiking-step-list">
          {steps.map((step, idx) => (
            <div className="mafiking-step-row" key={step.id || idx}>
              <div className="mafiking-step-index">{idx + 1}</div>
              <div className="mafiking-step-content">
                <div className="admin-step-title-row">
                  <h3>
                    {renderField(step, 'title',
                      React.createElement(Eq, { value: step.title || `Langkah ${idx + 1}` }),
                      'Judul langkah…',
                      false
                    )}
                  </h3>
                  {isAdmin ? (
                    <button
                      aria-label={`Hapus ${step.title || `Langkah ${idx + 1}`}`}
                      className="admin-step-delete-inline"
                      disabled={stepMutating}
                      onClick={() => deleteStep(step)}
                      title="Hapus langkah"
                      type="button"
                    >
                      Hapus
                    </button>
                  ) : null}
                </div>
                <div className="mafiking-formula-box">
                  {renderField(step, 'content',
                    React.createElement(Eq, { value: step.content || step.body || step.description || "" }),
                    'Isi / rumus…',
                    true
                  )}
                </div>
                {(step.why || isAdmin) ? (
                  <div className="mafiking-step-note note-why">
                    <span className="mafiking-step-note-label">Kenapa langkah ini?</span>
                    <p>{renderField(step, 'why', React.createElement(Eq, { value: step.why }), 'Klik untuk isi alasan…', true)}</p>
                  </div>
                ) : null}
                {(step.intuition || isAdmin) ? (
                  <div className="mafiking-step-note note-intuition">
                    <span className="mafiking-step-note-label">Cara memahaminya</span>
                    <p>{renderField(step, 'intuition', React.createElement(Eq, { value: step.intuition }), 'Klik untuk isi intuisi…', true)}</p>
                  </div>
                ) : null}
                {(step.mistakes || isAdmin) ? (
                  <div className="mafiking-step-note note-mistakes">
                    <span className="mafiking-step-note-label">Hati-hati</span>
                    <p>{renderField(step, 'mistakes', React.createElement(Eq, { value: step.mistakes }), 'Klik untuk isi kesalahan umum…', true)}</p>
                    {(step.mistake_result || isAdmin) ? (
                      <p className="mafiking-step-note-result">
                        Kalau keliru:{' '}
                        {renderField(step, 'mistake_result',
                          step.mistake_result ? React.createElement(Eq, { value: step.mistake_result }) : null,
                          'Klik untuk isi hasil keliru…',
                          false
                        )}
                      </p>
                    ) : null}
                  </div>
                ) : null}
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
  attempt, boardDirty, boardRef, error, focusMode, isAdmin, onBackToChoice, onSwitchMode,
  onBoardDirtyChange, onFocusModeToggle, onMoveProblem, onProblemSelect, onReloadSession, onSubmit, problem,
  problemIndex, problems, showResultModal, submitting, totalProblems, onCloseResult,
  subtopicTitle, setRoute,
}) => {
  const AnswerBoard = window.AnswerBoard;

  const [cqDraft, setCqDraft] = useState(null);
  const [cAdminSaving, setCAdminSaving] = useState(false);

  useEffect(() => { setCqDraft(null); }, [problem.id]);

  async function saveCanvasQuestion() {
    if (cqDraft === null) return;
    setCAdminSaving(true);
    try {
      const r = await fetch('/api/admin/problems/' + problem.id, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtopic_id: problem.subtopic_id,
          question_text: cqDraft,
          question_display: cqDraft,
          answer_display: problem.answer_display || '',
          acceptable_answers: typeof problem.acceptable_answers === 'string' ? problem.acceptable_answers : '[]',
          difficulty: problem.difficulty || 'Easy',
          question_type: problem.question_type || 'open',
          mc_options: [],
          sort_order: problem.sort_order || 0,
        }),
      });
      if (!r.ok) throw new Error('Gagal simpan');
      showToast('Soal diperbarui.', 'success');
      setCqDraft(null);
      onReloadSession();
    } catch (e) { showToast(e.message, 'error'); } finally { setCAdminSaving(false); }
  }

  async function adminDeleteProblem() {
    if (!window.confirm('Hapus soal ini beserta semua langkahnya?')) return;
    try {
      const r = await fetch('/api/admin/problems/' + problem.id, { method: 'DELETE', credentials: 'same-origin' });
      if (!r.ok) throw new Error('Gagal menghapus');
      showToast('Soal dihapus.', 'success');
      onReloadSession();
    } catch (e) { showToast(e.message, 'error'); }
  }

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
            <ModeSegment value="canvas" onChange={onSwitchMode} />
          </div>
        </div>
      ) : null}

      {!focusMode ? (
        <section className="mafiking-canvas-card">
          {isAdmin ? (
            <AdminQuestionControls
              problem={problem}
              problems={problems}
              problemIndex={problemIndex}
              onProblemSelect={onProblemSelect}
              onReloadSession={onReloadSession}
            />
          ) : null}

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

          {isAdmin && cqDraft !== null ? (
            <div className="admin-inline-edit">
              <textarea
                className="admin-inline-textarea"
                value={cqDraft}
                onChange={e => setCqDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setCqDraft(null); }}
                rows={3}
                autoFocus
              />
              <div className="admin-inline-actions">
                <button onClick={() => setCqDraft(null)} className="admin-btn-ghost" type="button">Batal</button>
                <button onClick={saveCanvasQuestion} disabled={cAdminSaving} className="admin-btn-primary" type="button">
                  {cAdminSaving ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </div>
          ) : (
            <div
              className={isAdmin ? 'admin-question-editable' : ''}
              onClick={isAdmin ? () => setCqDraft(problem.question_display || problem.question_text || '') : undefined}
              title={isAdmin ? 'Klik untuk edit soal' : undefined}
            >
              <div className="mafiking-canvas-question-title">
                <div className="mafiking-canvas-equation">
                  <Eq value={problem.question_display || problem.question_text} />
                </div>
                <p className="mafiking-canvas-instruction">
                  Tulis langkah penyelesaian langsung di paper. AI akan membaca canvas dan menjelaskan bagian yang salah.
                </p>
              </div>
              {isAdmin && (
                <div className="admin-question-edit-hint">
                  <AdminIcon.Pencil /> Klik untuk edit soal
                </div>
              )}
            </div>
          )}

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
          nextLabel: "lewati",
          nextPrimary: false,
          onBack: () => onMoveProblem(-1),
          onNext: () => onMoveProblem(1),
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
                <Eq value={problem.question_display || problem.question_text} />
              </div>
            </div>
            {error ? <div className="mafiking-error-box"><Icon.Target className="w-4 h-4" />{error}</div> : null}
          </div>
        ) : null}
      />

      {submitting && !focusMode ? (
        <section className="mafiking-loading-card">
          <div className="mafiking-answer-heading">Mengevaluasi jawaban</div>
          <p>Sedang membaca tulisan tangan dari canvas dan mengecek langkah pengerjaan.</p>
        </section>
      ) : null}

      {isAdmin && (
        <div className="admin-problem-footer">
          <button onClick={adminDeleteProblem} className="admin-btn-ghost" style={{ color: '#ef4444' }} type="button">
            Hapus Soal Ini
          </button>
        </div>
      )}

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
  "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ", "f": "ᶠ", "g": "ᵍ",
  "h": "ʰ", "i": "ⁱ", "j": "ʲ", "k": "ᵏ", "l": "ˡ", "m": "ᵐ", "n": "ⁿ",
  "o": "ᵒ", "p": "ᵖ", "r": "ʳ", "s": "ˢ", "t": "ᵗ", "u": "ᵘ", "v": "ᵛ",
  "w": "ʷ", "x": "ˣ", "y": "ʸ", "z": "ᶻ",
};

function toSuperscript(value) {
  return String(value).split("").map((c) => SUPERSCRIPT_CHARS[c] || c).join("");
}

const SUBSCRIPT_CHARS = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "(": "₍", ")": "₎",
  "a": "ₐ", "e": "ₑ", "o": "ₒ", "x": "ₓ", "n": "ₙ",
};
function toSubscript(value) {
  return String(value).split("").map((c) => SUBSCRIPT_CHARS[c] || c).join("");
}

function renderEquation(value) {
  let t = String(value || "");

  // 1. strip math delimiters
  t = t.replace(/\\\[|\\\]/g, "").replace(/\$\$/g, "").replace(/\$/g, "");

  // 2. text/style wrappers — keep inner content (must run early for nested cases)
  t = t.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|boldsymbol|mbox|intertext|underbrace|overbrace)\{([^}]+)\}/g, "$1");

  // 3. spacing
  t = t.replace(/\\,/g, " ").replace(/\\;/g, " ").replace(/\\!/g, "")
       .replace(/\\quad/g, "  ").replace(/\\qquad/g, "   ");

  // 4. subscripts BEFORE fracs (so _n inside \dfrac doesn't break regex)
  t = t.replace(/_\s*\{([^}]+)\}/g, (_, s) => toSubscript(s))
       .replace(/_([0-9a-zA-Z])/g, (_, s) => toSubscript(s));

  // 5. superscripts BEFORE fracs (so ^{3x} inside \dfrac doesn't break regex)
  t = t.replace(/\^\s*\{([^}]+)\}/g, (_, e) => toSuperscript(e))
       .replace(/\^\s*\(([^)]+)\)/g, (_, e) => toSuperscript(`(${e})`))
       .replace(/\^\s*([+-]?\d+[a-z]*)/g, (_, e) => toSuperscript(e))
       .replace(/\^\s*([a-zA-Z])\b/g, (_, e) => toSuperscript(e));

  // 6. functions & operators (before fracs so \sin inside \dfrac is clean)
  t = t
    .replace(/\\arcsin/g, "arcsin").replace(/\\arccos/g, "arccos").replace(/\\arctan/g, "arctan")
    .replace(/\\sinh/g, "sinh").replace(/\\cosh/g, "cosh").replace(/\\tanh/g, "tanh")
    .replace(/\\sin/g, "sin").replace(/\\cos/g, "cos").replace(/\\tan/g, "tan")
    .replace(/\\cot/g, "cot").replace(/\\sec/g, "sec").replace(/\\csc/g, "csc")
    .replace(/\\log_([0-9a-zA-Z])/g, "log$1").replace(/\\log/g, "log")
    .replace(/\\ln/g, "ln").replace(/\\exp/g, "exp")
    .replace(/\\max/g, "max").replace(/\\min/g, "min")
    .replace(/\\gcd/g, "gcd").replace(/\\lcm/g, "lcm").replace(/\\det/g, "det")
    .replace(/\\deg/g, "°")
    .replace(/\\int_([^{])([^{])/g, "∫$1$2")
    .replace(/\\int/g, "∫")
    .replace(/\\partial/g, "∂").replace(/\\nabla/g, "∇").replace(/\\infty/g, "∞")
    .replace(/\\lim/g, "lim").replace(/\\sum/g, "Σ").replace(/\\prod/g, "Π");

  // 7. fractions & roots (nested ^{} and _{} already resolved above)
  t = t
    .replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, "$1√($2)")
    .replace(/\\sqrt\{([^}]+)\}/g, "√($1)")
    .replace(/\\sqrt\s(\S+)/g, "√$1")
    .replace(/\\dfrac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\\tfrac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");

  // 8. operators & relations
  t = t
    .replace(/\\cdot/g, "·").replace(/\\times/g, "×").replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±").replace(/\\mp/g, "∓").replace(/\\circ/g, "°")
    .replace(/\\neq|\\ne/g, "≠").replace(/\\leq|\\le/g, "≤").replace(/\\geq|\\ge/g, "≥")
    .replace(/\\approx/g, "≈").replace(/\\equiv/g, "≡").replace(/\\propto/g, "∝")
    .replace(/\\ll/g, "≪").replace(/\\gg/g, "≫").replace(/\\sim/g, "~");

  // 9. arrows & logic
  t = t
    .replace(/\\implies/g, "⟹").replace(/\\iff/g, "⟺")
    .replace(/\\Leftrightarrow/g, "⟺").replace(/\\Rightarrow/g, "⟹").replace(/\\Leftarrow/g, "⟸")
    .replace(/\\leftrightarrow/g, "↔").replace(/\\rightarrow|\\to\b/g, "→").replace(/\\leftarrow/g, "←")
    .replace(/\\in\b/g, "∈").replace(/\\notin/g, "∉")
    .replace(/\\subseteq/g, "⊆").replace(/\\subset/g, "⊂").replace(/\\supset/g, "⊃")
    .replace(/\\cup/g, "∪").replace(/\\cap/g, "∩")
    .replace(/\\emptyset|\\varnothing/g, "∅")
    .replace(/\\forall/g, "∀").replace(/\\exists/g, "∃")
    .replace(/\\neg/g, "¬").replace(/\\land/g, "∧").replace(/\\lor/g, "∨");

  // 10. greek lowercase
  t = t
    .replace(/\\alpha/g, "α").replace(/\\beta/g, "β").replace(/\\gamma/g, "γ")
    .replace(/\\delta/g, "δ").replace(/\\epsilon|\\varepsilon/g, "ε")
    .replace(/\\zeta/g, "ζ").replace(/\\eta/g, "η").replace(/\\theta|\\vartheta/g, "θ")
    .replace(/\\iota/g, "ι").replace(/\\kappa/g, "κ").replace(/\\lambda/g, "λ")
    .replace(/\\mu/g, "μ").replace(/\\nu/g, "ν").replace(/\\xi/g, "ξ")
    .replace(/\\pi/g, "π").replace(/\\rho|\\varrho/g, "ρ").replace(/\\sigma/g, "σ")
    .replace(/\\tau/g, "τ").replace(/\\upsilon/g, "υ").replace(/\\phi|\\varphi/g, "φ")
    .replace(/\\chi/g, "χ").replace(/\\psi/g, "ψ").replace(/\\omega/g, "ω");

  // 11. greek uppercase
  t = t
    .replace(/\\Gamma/g, "Γ").replace(/\\Delta/g, "Δ").replace(/\\Theta/g, "Θ")
    .replace(/\\Lambda/g, "Λ").replace(/\\Xi/g, "Ξ").replace(/\\Pi/g, "Π")
    .replace(/\\Sigma/g, "Σ").replace(/\\Upsilon/g, "Υ").replace(/\\Phi/g, "Φ")
    .replace(/\\Psi/g, "Ψ").replace(/\\Omega/g, "Ω");

  // 12. dots & misc
  t = t
    .replace(/\\cdots/g, "···").replace(/\\ldots|\\dots/g, "...").replace(/\\vdots/g, "⋮")
    .replace(/\\lvert|\\rvert/g, "|").replace(/\\lVert|\\rVert/g, "‖")
    .replace(/\\langle/g, "⟨").replace(/\\rangle/g, "⟩")
    .replace(/\\lfloor/g, "⌊").replace(/\\rfloor/g, "⌋")
    .replace(/\\lceil/g, "⌈").replace(/\\rceil/g, "⌉");

  // 13. bracket sizing — strip commands, keep bracket character
  t = t
    .replace(/\\[Bb]igg?[lr]?\s*\|/g, "|")
    .replace(/\\[Bb]igg?[lr]?\b/g, "")
    .replace(/\\left\s*\|/g, "|").replace(/\\right\s*\|/g, "|")
    .replace(/\\left/g, "").replace(/\\right/g, "");

  // 14. strip any remaining \commands and bare braces
  t = t
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}]/g, "");

  return t.replace(/\s+/g, " ").trim() || String(value || "");
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function normalizeKatexInput(value) {
  return String(value || "")
    .replace(/\\\[|\\\]/g, "")
    .replace(/\$\$/g, "")
    .replace(/^\s*\$|\$\s*$/g, "")
    .trim();
}

function canRenderAsSingleMath(value) {
  const text = normalizeKatexInput(value);
  if (!text) return false;
  if (/\\[a-zA-Z]+|[\^_{}]|[∫√ΣΠ∞≤≥≠≈]/.test(text)) return true;
  if (/^[\d\s+\-*/=().,]+$/.test(text)) return true;
  return false;
}

function renderKatexToString(latex, displayMode = false) {
  if (typeof katex === "undefined" || !katex || typeof katex.renderToString !== "function") {
    throw new Error("KaTeX belum tersedia");
  }
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
  });
}

const ALIGN_WRAP_RE = /^\{\\(raggedright|centering|raggedleft)\s([\s\S]+)\}$/;
const ALIGN_MAP = { raggedright: "left", centering: "center", raggedleft: "right" };

function renderMafikingMathHTML(value) {
  const raw = String(value || "");

  const alignMatch = raw.trim().match(ALIGN_WRAP_RE);
  if (alignMatch) {
    const align = ALIGN_MAP[alignMatch[1]];
    const inner = renderMafikingMathHTML(alignMatch[2]);
    return `<span style="display:block;text-align:${align}">${inner}</span>`;
  }

  const text = normalizeKatexInput(raw);
  if (!text) return "";

  if (typeof katex !== "undefined" && katex && typeof katex.renderToString === "function") {
    try {
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every(canRenderAsSingleMath)) {
        return lines.map((line) => `<span class="eq-katex-line">${renderKatexToString(line, false)}</span>`).join("");
      }
      if (canRenderAsSingleMath(text)) {
        return renderKatexToString(text, false);
      }

      const escaped = escapeHtml(raw);
      if (/\$[^$]+\$/.test(raw)) {
        return escaped.replace(/\$([^$]+)\$/g, (_, tex) => {
          try {
            return renderKatexToString(tex, false);
          } catch (_) {
            return escapeHtml(tex);
          }
        }).replace(/\n/g, "<br>");
      }
    } catch (_) {
      // Fall through to text fallback if KaTeX cannot parse malformed input.
    }
  }

  return escapeHtml(renderEquation(value)).replace(/\n/g, "<br>");
}

function renderEquationHTML(value) {
  let t = escapeHtml(String(value || ""));

  t = t.replace(/\\\[|\\\]/g, "").replace(/\$\$/g, "").replace(/\$/g, "");
  t = t.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|boldsymbol|mbox|intertext|underbrace|overbrace)\{([^}]+)\}/g, "$1");
  t = t.replace(/\\,/g, " ").replace(/\\;/g, " ").replace(/\\!/g, "")
       .replace(/\\quad/g, "  ").replace(/\\qquad/g, "   ");
  t = t.replace(/_\s*\{([^}]+)\}/g, (_, s) => toSubscript(s))
       .replace(/_([0-9a-zA-Z])/g, (_, s) => toSubscript(s));
  t = t.replace(/\^\s*\{([^}]+)\}/g, (_, e) => toSuperscript(e))
       .replace(/\^\s*\(([^)]+)\)/g, (_, e) => toSuperscript(`(${e})`))
       .replace(/\^\s*([+-]?\d+[a-z]*)/g, (_, e) => toSuperscript(e))
       .replace(/\^\s*([a-zA-Z])\b/g, (_, e) => toSuperscript(e));
  t = t
    .replace(/\\arcsin/g, "arcsin").replace(/\\arccos/g, "arccos").replace(/\\arctan/g, "arctan")
    .replace(/\\sinh/g, "sinh").replace(/\\cosh/g, "cosh").replace(/\\tanh/g, "tanh")
    .replace(/\\sin/g, "sin").replace(/\\cos/g, "cos").replace(/\\tan/g, "tan")
    .replace(/\\cot/g, "cot").replace(/\\sec/g, "sec").replace(/\\csc/g, "csc")
    .replace(/\\log_([0-9a-zA-Z])/g, "log$1").replace(/\\log/g, "log")
    .replace(/\\ln/g, "ln").replace(/\\exp/g, "exp")
    .replace(/\\max/g, "max").replace(/\\min/g, "min")
    .replace(/\\gcd/g, "gcd").replace(/\\lcm/g, "lcm").replace(/\\det/g, "det")
    .replace(/\\deg/g, "°")
    .replace(/\\int_([^{])([^{])/g, "∫$1$2")
    .replace(/\\int/g, "∫")
    .replace(/\\partial/g, "∂").replace(/\\nabla/g, "∇").replace(/\\infty/g, "∞")
    .replace(/\\lim/g, "lim").replace(/\\sum/g, "Σ").replace(/\\prod/g, "Π");
  t = t
    .replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '<span class="eq-root"><span class="eq-root-index">$1</span><span class="eq-radical">√</span><span class="eq-radicand">$2</span></span>')
    .replace(/\\sqrt\{([^}]+)\}/g, '<span class="eq-root"><span class="eq-radical">√</span><span class="eq-radicand">$1</span></span>')
    .replace(/\\sqrt\s(\S+)/g, '<span class="eq-root"><span class="eq-radical">√</span><span class="eq-radicand">$1</span></span>')
    .replace(/\\dfrac\{([^}]+)\}\{([^}]+)\}/g, '<span class="eq-frac"><span class="eq-num">$1</span><span class="eq-den">$2</span></span>')
    .replace(/\\tfrac\{([^}]+)\}\{([^}]+)\}/g, '<span class="eq-frac"><span class="eq-num">$1</span><span class="eq-den">$2</span></span>')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="eq-frac"><span class="eq-num">$1</span><span class="eq-den">$2</span></span>');
  t = t
    .replace(/\\cdot/g, "·").replace(/\\times/g, "×").replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±").replace(/\\mp/g, "∓").replace(/\\circ/g, "°")
    .replace(/\\neq|\\ne/g, "≠").replace(/\\leq|\\le/g, "≤").replace(/\\geq|\\ge/g, "≥")
    .replace(/\\approx/g, "≈").replace(/\\equiv/g, "≡").replace(/\\propto/g, "∝")
    .replace(/\\ll/g, "≪").replace(/\\gg/g, "≫").replace(/\\sim/g, "~");
  t = t
    .replace(/\\implies/g, "⟹").replace(/\\iff/g, "⟺")
    .replace(/\\Leftrightarrow/g, "⟺").replace(/\\Rightarrow/g, "⟹").replace(/\\Leftarrow/g, "⟸")
    .replace(/\\leftrightarrow/g, "↔").replace(/\\rightarrow|\\to\b/g, "→").replace(/\\leftarrow/g, "←")
    .replace(/\\in\b/g, "∈").replace(/\\notin/g, "∉")
    .replace(/\\subseteq/g, "⊆").replace(/\\subset/g, "⊂").replace(/\\supset/g, "⊃")
    .replace(/\\cup/g, "∪").replace(/\\cap/g, "∩")
    .replace(/\\emptyset|\\varnothing/g, "∅")
    .replace(/\\forall/g, "∀").replace(/\\exists/g, "∃")
    .replace(/\\neg/g, "¬").replace(/\\land/g, "∧").replace(/\\lor/g, "∨");
  t = t
    .replace(/\\alpha/g, "α").replace(/\\beta/g, "β").replace(/\\gamma/g, "γ")
    .replace(/\\delta/g, "δ").replace(/\\epsilon|\\varepsilon/g, "ε")
    .replace(/\\zeta/g, "ζ").replace(/\\eta/g, "η").replace(/\\theta|\\vartheta/g, "θ")
    .replace(/\\iota/g, "ι").replace(/\\kappa/g, "κ").replace(/\\lambda/g, "λ")
    .replace(/\\mu/g, "μ").replace(/\\nu/g, "ν").replace(/\\xi/g, "ξ")
    .replace(/\\pi/g, "π").replace(/\\rho|\\varrho/g, "ρ").replace(/\\sigma/g, "σ")
    .replace(/\\tau/g, "τ").replace(/\\upsilon/g, "υ").replace(/\\phi|\\varphi/g, "φ")
    .replace(/\\chi/g, "χ").replace(/\\psi/g, "ψ").replace(/\\omega/g, "ω");
  t = t
    .replace(/\\Gamma/g, "Γ").replace(/\\Delta/g, "Δ").replace(/\\Theta/g, "Θ")
    .replace(/\\Lambda/g, "Λ").replace(/\\Xi/g, "Ξ").replace(/\\Pi/g, "Π")
    .replace(/\\Sigma/g, "Σ").replace(/\\Upsilon/g, "Υ").replace(/\\Phi/g, "Φ")
    .replace(/\\Psi/g, "Ψ").replace(/\\Omega/g, "Ω");
  t = t
    .replace(/\\cdots/g, "···").replace(/\\ldots|\\dots/g, "...").replace(/\\vdots/g, "⋮")
    .replace(/\\lvert|\\rvert/g, "|").replace(/\\lVert|\\rVert/g, "‖")
    .replace(/\\langle/g, "⟨").replace(/\\rangle/g, "⟩")
    .replace(/\\lfloor/g, "⌊").replace(/\\rfloor/g, "⌋")
    .replace(/\\lceil/g, "⌈").replace(/\\rceil/g, "⌉");
  t = t
    .replace(/\\[Bb]igg?[lr]?\s*\|/g, "|")
    .replace(/\\[Bb]igg?[lr]?\b/g, "")
    .replace(/\\left\s*\|/g, "|").replace(/\\right\s*\|/g, "|")
    .replace(/\\left/g, "").replace(/\\right/g, "");
  t = t
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/\{/g, "").replace(/\}/g, "");

  return t.replace(/\s+/g, " ").trim() || escapeHtml(String(value || ""));
}

function Eq({ value }) {
  return React.createElement("span", {
    className: "eq-katex",
    dangerouslySetInnerHTML: { __html: renderMafikingMathHTML(value || "") }
  });
}

// ─── Result modal ─────────────────────────────────────────────────────────
const ResultModal = ({ attempt, onClose }) => {
  const evaluation = attempt.evaluation || {};
  const wrongSteps = evaluation.wrongSteps || [];
  const score = Math.round(Number(evaluation.score) || 0);
  const isCorrect = Boolean(evaluation.isCorrect);

  return (
    <div className="canvas-result-modal-backdrop" role="presentation">
      <article className="canvas-result-modal result-markdown" aria-label="Hasil koreksi jawaban">
        <button aria-label="Tutup hasil koreksi" className="canvas-result-modal-close" onClick={onClose} type="button">×</button>

        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 ${isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {isCorrect ? "✓" : "!"}
          </div>
          <div>
            <div className="kicker mb-0.5">Hasil Koreksi</div>
            <h2 className="font-display font-bold text-2xl leading-none">Skor {score}/100</h2>
          </div>
        </div>

        {evaluation.detectedAnswerText ? (
          <div className="bg-ink/[0.04] rounded-xl px-4 py-3 mb-4 text-sm">
            <span className="font-semibold text-ink/60">Terbaca:</span> <Eq value={evaluation.detectedAnswerText} />
          </div>
        ) : null}

        <p className="text-sm leading-relaxed mb-4"><Eq value={attempt.feedback || evaluation.fullFeedback || "Koreksi selesai."} /></p>

        {wrongSteps.length ? (
          <div>
            <div className="kicker mb-2">Langkah yang perlu diperbaiki</div>
            <div className="result-step-list">
              {wrongSteps.map((step, idx) => (
                <div className="result-step-card" key={idx}>
                  <div className="flex items-start gap-3">
                    <span className="inline-flex w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs font-bold items-center justify-center shrink-0 mt-0.5">
                      {step.stepNumber || idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold mb-1"><Eq value={step.issue} /></p>
                      {step.hint ? <p className="text-xs text-ink/60">Petunjuk: <Eq value={step.hint} /></p> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
};

window.Practice = Practice;
