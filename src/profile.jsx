// Profile/report route. Uses the original Mafiking visual language.

const Profile = ({ setRoute, isAdmin = false, onRequestLogout = null }) => {
  const { useState, useEffect } = React;
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [aiRefresh, setAiRefresh] = useState(null);

  const katexReady = (window.MafikingMathLoader && typeof window.MafikingMathLoader.useKatexReady === "function")
    ? window.MafikingMathLoader.useKatexReady()
    : false;

  const loadProfile = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setSummaryLoading(false);
      setError("");

      // Trigger KaTeX lazy load so question text and correction history
      // render with proper math formatting instead of raw LaTeX.
      if (window.MafikingMathLoader && typeof window.MafikingMathLoader.loadKatex === "function") {
        window.MafikingMathLoader.loadKatex();
      }

      // Jalankan 3 request independen secara paralel
      const [me, progress, correctionAttempts] = await Promise.all([
        MafikingAPI.get("/api/auth/me"),
        MafikingAPI.get("/api/progress/stats"),
        MafikingAPI.get("/api/correction/attempts"),
      ]);

      // Render data dasar langsung tanpa tunggu AI
      setUser(me);
      setStats(progress);
      setAttempts(correctionAttempts);
      setLoading(false);

      // Panggil AI summary di background, tampilkan spinner kecil di seksinya saja
      setSummaryLoading(true);
      try {
        const profileSummary = await MafikingAPI.post("/api/correction/profile-summary", {
          attempts: correctionAttempts,
          forceRefresh
        });
        setSummary(profileSummary.summary);
        setAiRefresh(profileSummary.aiRefresh || null);
      } catch (summaryErr) {
        console.warn("Profile summary gagal:", summaryErr.message);
      } finally {
        setSummaryLoading(false);
      }
    } catch (caught) {
      setError(caught.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile(false);
  }, []);

  const localWeaknesses = limitLearningTags([
    ...collectTags(attempts, "weaknessTags"),
    ...collectInferredLearningTags(attempts, "weakness"),
  ]);
  const localStrengths = limitLearningTags([
    ...collectTags(attempts, "strengthTags"),
    ...collectInferredLearningTags(attempts, "strength"),
  ]);

  const weaknesses = limitLearningTags(summary?.weaknesses?.length
    ? summary.weaknesses.map(formatLearningLabel)
    : localWeaknesses);

  const strengths = limitLearningTags(summary?.strengths?.length
    ? summary.strengths.map(formatLearningLabel)
    : localStrengths);

  const hasCorrectionHistory = attempts.length > 0;
  const hasSummaryEvidence = hasCorrectionHistory || Boolean(summary);
  const recommendations = hasSummaryEvidence ? (summary?.recommendedQuestions || []) : [];
  const recommendedItems = hasSummaryEvidence && Array.isArray(summary?.recommendedItems) ? summary.recommendedItems : [];
  const dataRecommendationRows = recommendedItems.length
    ? recommendedItems.map((item) => {
      const targetSkill = typeof item.targetSkill === "string"
        ? item.targetSkill
        : (item.targetSkill?.label || "");
      return {
        evidence: Array.isArray(item.evidence) ? item.evidence : [],
        evidenceAt: item.evidenceAt || "",
        frontier: item.frontier,
        halfLifeDays: item.halfLifeDays,
        kind: item.kind || "",
        ref: item.ref || "",
        questionDisplay: item.questionDisplay || item.questionText || "",
        questionText: item.questionText || "",
        answerDisplay: item.answerDisplay || "",
        mapel: item.mapel || "",
        difficulty: item.difficulty || "",
        purcellReference: item.purcellReference || "",
        reason: item.reason || "",
        storyProblem: Boolean(item.storyProblem),
        targetSkill,
      };
    })
    : recommendations.map((question) => ({
      ref: "",
      questionDisplay: question,
      questionText: "",
      answerDisplay: "",
      mapel: "",
      difficulty: "",
      purcellReference: "",
      reason: "",
      storyProblem: false,
      targetSkill: "",
    }));
  const recommendationRows = dataRecommendationRows;
  const overallSummaryText = summary?.overallSummary || buildLocalOverallSummary(attempts, stats);

  function formatRecommendationEvidenceTitle(item) {
    const parts = [];
    if (item.kind) parts.push(item.kind === "review" ? "Recall" : "Frontier");
    if (typeof item.frontier === "boolean") parts.push(item.frontier ? "skill baru" : "review skill");
    if (typeof item.halfLifeDays === "number") {
      parts.push(`half-life ${item.halfLifeDays.toFixed(1)} hari`);
    }
    const evidence = Array.isArray(item.evidence) ? item.evidence[0] : null;
    if (evidence) {
      if (evidence.problemId) parts.push(`bukti soal #${evidence.problemId}`);
      if (evidence.selectedAnswer || evidence.correctAnswer) {
        parts.push(`jawabanmu: ${evidence.selectedAnswer || "-"}; benar: ${evidence.correctAnswer || "-"}`);
      }
      if (evidence.createdAt) parts.push(formatDate(evidence.createdAt));
    }
    return parts.join(" · ");
  }

  function formatDate(isoString) {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return isoString;
    }
  }

  function formatAiRefreshStatus(state) {
    if (!state) return "Analisis Aktif";
    if (state.bypass) return "Analisis Aktif";
    if (state.used) return "AI baru diperbarui";
    if (state.skipped && state.cooldownSeconds > 0) {
      const minutes = Math.max(1, Math.ceil(state.cooldownSeconds / 60));
      return `Refresh lagi dalam ${minutes} mnt`;
    }
    return "Analisis lokal aktif";
  }

  function truncateRecommendationText(value, maxLength = 92) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
  }

  function renderRecommendationQuestionHTML(value) {
    const text = truncateRecommendationText(value || '');
    if (window.renderMafikingMathHTML && text) return window.renderMafikingMathHTML(text);
    if (window.escapeHtml) return window.escapeHtml(text);
    return String(text || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function openCanvasWeaknessPractice() {
    openEasyCanvasPractice();
  }

  function openEasyCanvasPractice() {
    setRoute({
      route: "practice",
      practice: {
        title: "Latihan Canvas Mudah",
        mapel: "Matematika",
        semester: 1,
        problemLimit: 1,
        difficulty: "Easy",
        initialMode: "canvas",
        disableCanvasIntro: true,
        publicEasyCanvas: true,
      },
    });
  }

  function getProfileDisplayName() {
    return String(user?.display_name || user?.username || "Memuat profil").trim();
  }

  function getProfileEmail() {
    const email = String(user?.email || "").trim();
    if (email) return email;
    const username = String(user?.username || "").trim();
    return username.includes("@") ? username : "";
  }

  function getProfileInitial() {
    const name = getProfileDisplayName();
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || "M";
    return first.toUpperCase();
  }

  /* Inject spin keyframe once */
  React.useEffect(() => {
    if (document.getElementById("profile-spin-style")) return;
    const s = document.createElement("style");
    s.id = "profile-spin-style";
    s.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(s);
  }, []);

  return (
    <div className="app-page-bg app-page-bg--profil min-h-screen w-full max-w-full overflow-x-hidden" data-katex-ready={katexReady ? "1" : "0"}>
      <section className="pt-12 pb-6">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b hairline pb-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-700 text-3xl font-semibold text-white">
                {getProfileInitial()}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold leading-tight text-ink">
                  {getProfileDisplayName()}
                </h1>
                {getProfileEmail() ? (
                  <p className="mt-1 truncate text-sm font-medium text-ink/55">{getProfileEmail()}</p>
                ) : null}
                <p className="mt-1 text-xs font-medium text-ink/35">Klik foto untuk menggantinya</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRoute("invoices")}
                className="btn-ghost !h-11 !px-4 text-sm inline-flex items-center justify-center gap-2"
                type="button"
              >
                <Icon.Card className="w-4 h-4" />
                <span className="hidden sm:inline">Riwayat Pembelian</span>
              </button>
              <button
                onClick={() => loadProfile(true)}
                className="btn-ghost !h-11 !w-11 !p-0 text-sm inline-flex items-center justify-center"
                aria-label="Refresh raport"
                title="Refresh"
                type="button"
              >
                <Icon.Refresh className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-28 w-full max-w-full overflow-x-hidden">
        <div className="mx-auto w-full max-w-6xl px-6 md:px-8">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid gap-8" aria-busy="true" aria-label="Memuat raport">
              <style>{`
                @keyframes profile-shimmer {
                  0% { background-position: -600px 0; }
                  100% { background-position: 600px 0; }
                }
                .ps {
                  background: linear-gradient(90deg,#f1f5f9 25%,#e8edf4 50%,#f1f5f9 75%);
                  background-size: 1200px 100%;
                  animation: profile-shimmer 1.5s ease-in-out infinite;
                  border-radius: 10px;
                }
                @keyframes profile-fade-in {
                  from { opacity: 0; transform: translateY(8px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
                .ple { animation: profile-fade-in 0.4s ease both; }
              `}</style>

              {/* Metrics 4 cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 ple">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="card p-5 flex items-center gap-4">
                    <div className="ps w-11 h-11 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="ps h-3 w-16 rounded" />
                      <div className="ps h-6 w-12 rounded" />
                      <div className="ps h-2.5 w-20 rounded" />
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Evaluation Box */}
              <div
                className="ple rounded-[var(--card-radius)] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6"
                style={{ background: "linear-gradient(135deg,#0b1326 0%,#15223e 100%)", border: "1px solid rgba(255,255,255,0.08)", animationDelay: "80ms" }}
              >
                <div className="flex-1 space-y-3 w-full">
                  <div className="ps h-3 w-28 rounded opacity-30" />
                  <div className="ps h-7 w-56 rounded opacity-30" />
                  <div className="space-y-2 mt-2">
                    <div className="ps h-3 w-full rounded opacity-20" />
                    <div className="ps h-3 w-4/5 rounded opacity-20" />
                    <div className="ps h-3 w-3/5 rounded opacity-20" />
                  </div>
                </div>
                <div className="ps h-10 w-32 rounded-xl opacity-20 shrink-0" />
              </div>

              {/* Strength & Weakness */}
              <div className="grid md:grid-cols-2 gap-6 ple" style={{ animationDelay: "120ms" }}>
                {[0, 1].map((i) => (
                  <div key={i} className="card p-6">
                    <div className="ps h-5 w-24 mb-5 rounded" />
                    <div className="flex flex-wrap gap-2">
                      {[80, 100, 72, 90, 64].map((w, j) => (
                        <div key={j} className="ps h-7 rounded-full" style={{ width: `${w}px` }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rekomendasi Soal */}
              <div className="card p-6 ple" style={{ animationDelay: "160ms" }}>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="ps h-5 w-48 rounded" />
                </div>
                <div className="ps h-3 w-72 rounded mb-6" />
                <div className="grid gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-xl border border-ink/5 bg-ink/[0.02] p-4 flex items-center gap-4 justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="ps w-6 h-5 rounded shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="ps h-2.5 w-28 rounded" />
                          <div className="ps h-4 w-3/4 rounded" />
                        </div>
                      </div>
                      <div className="ps h-8 w-16 rounded-xl shrink-0" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Riwayat Koreksi */}
              <div className="card overflow-hidden ple" style={{ animationDelay: "200ms" }}>
                <div className="px-6 py-4 border-b hairline flex items-center justify-between">
                  <div className="ps h-5 w-44 rounded" />
                  <div className="ps h-4 w-32 rounded" />
                </div>
                <div className="divide-y hairline">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="ps h-5 w-24 rounded-full" />
                          <div className="ps h-4 w-28 rounded" />
                        </div>
                        <div className="ps h-5 w-64 rounded" />
                        <div className="ps h-3 w-full rounded" />
                        <div className="ps h-3 w-4/5 rounded" />
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="ps h-8 w-16 rounded" />
                        <div className="ps h-8 w-24 rounded-xl" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-8">

              <button
                onClick={openCanvasWeaknessPractice}
                type="button"
                className="group flex w-full items-center justify-between gap-4 rounded-[var(--card-radius)] border border-ink/10 bg-white px-5 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md md:px-6"
              >
                <span className="text-sm font-bold leading-relaxed text-ink md:text-base">
                  Kerjakan <span className="border-b-2 border-yel pb-0.5">Canvas</span> untuk Mendapat Analisis Kelemahan &amp; Dapatkan Rekomendasi Latihan Soal
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-yel transition-transform group-hover:translate-x-1">
                  <Icon.Arrow className="w-4 h-4" />
                </span>
              </button>

              {/* AI Evaluation Box */}
              <div
                className="relative overflow-hidden rounded-[var(--card-radius)] p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
                style={{
                  background: "linear-gradient(135deg, #0b1326 0%, #15223e 100%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 20px 40px -15px rgba(11, 19, 38, 0.3)"
                }}
              >
                <div
                  className="absolute w-[250px] h-[250px] rounded-full blur-[90px] pointer-events-none opacity-20"
                  style={{
                    bottom: "-60px",
                    left: "-40px",
                    background: "var(--yel)"
                  }}
                />

                <div className="relative z-10 flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-white/50">AI Analysis</span>
                    {summaryLoading ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-300">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          style={{ animation: "spin 1s linear infinite" }}>
                          <path d="M21 12a9 9 0 11-6.219-8.56" />
                        </svg>
                        Menganalisis...
                      </span>
                    ) : (
                      <span className="dot-active text-[10px] font-semibold text-emerald-400">{formatAiRefreshStatus(aiRefresh)}</span>
                    )}
                  </div>
                  <h2 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.025em] text-white">
                    Evaluasi Belajar
                  </h2>
                  {summaryLoading ? (
                    <div className="mt-3 space-y-2">
                      <div style={{
                        background: "linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 75%)",
                        backgroundSize: "600px 100%",
                        animation: "profile-shimmer 1.5s ease-in-out infinite, profile-fade-in 0.3s ease both",
                        borderRadius: 8, height: 14, width: "90%"
                      }} />
                      <div style={{
                        background: "linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 75%)",
                        backgroundSize: "600px 100%",
                        animation: "profile-shimmer 1.5s ease-in-out infinite",
                        borderRadius: 8, height: 14, width: "75%"
                      }} />
                      <div style={{
                        background: "linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 75%)",
                        backgroundSize: "600px 100%",
                        animation: "profile-shimmer 1.5s ease-in-out infinite",
                        borderRadius: 8, height: 14, width: "55%"
                      }} />
                    </div>
                  ) : (
                    <p className="text-white/80 text-sm md:text-base mt-3 leading-relaxed max-w-3xl whitespace-pre-wrap">
                      {overallSummaryText}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setRoute("belajar")}
                  className="btn-yel shrink-0 relative z-10 !py-3 !px-6 text-sm flex items-center gap-1.5"
                >
                  Lanjut Latihan <Icon.Arrow className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Strengths & Weaknesses Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="card p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <h3 className="font-display font-bold text-lg text-ink">Strength</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {summaryLoading ? (
                      [88, 110, 76, 94].map((w, i) => (
                        <div key={i} className="ps h-7 rounded-full" style={{ width: `${w}px` }} />
                      ))
                    ) : strengths.length ? strengths.map((tag) => (
                      <span key={tag} className="tag border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors">
                        {tag}
                      </span>
                    )) : (
                      <p className="text-xs text-ink/45">
                        -
                      </p>
                    )}
                  </div>
                </div>

                <div className="card p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <h3 className="font-display font-bold text-lg text-ink">Weakness</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {summaryLoading ? (
                      [104, 82, 96, 70, 88].map((w, i) => (
                        <div key={i} className="ps h-7 rounded-full" style={{ width: `${w}px` }} />
                      ))
                    ) : weaknesses.length ? weaknesses.map((tag) => (
                      <span key={tag} className="tag border border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-200 transition-colors">
                        {tag}
                      </span>
                    )) : (
                      <p className="text-xs text-ink/45">
                        -
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommended Questions */}
              <div className="card p-6 w-full max-w-full overflow-hidden">
                <div className="flex items-center gap-2.5 mb-2">
                  <h3 className="font-display font-bold text-xl tracking-[-0.015em]">Rekomendasi Soal Latihan</h3>
                  {summaryLoading && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      className="ml-1 text-amber-500" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}>
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  )}
                </div>
                {summaryLoading ? (
                  <div className="grid gap-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-xl border border-ink/5 bg-ink/[0.02] p-4 flex items-center gap-4 justify-between"
                        style={{ animation: `profile-fade-in 0.3s ease ${i * 60}ms both` }}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="ps w-6 h-5 rounded shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="ps h-2.5 w-28 rounded" />
                            <div className="ps h-4 w-3/4 rounded" />
                          </div>
                        </div>
                        <div className="ps h-8 w-16 rounded-xl shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : recommendationRows.length ? (
                  <div className="grid gap-3">
                    {recommendationRows.map((item, index) => {
                      const evidenceTitle = formatRecommendationEvidenceTitle(item);
                      return (
                        <div key={item.ref || index} className="rounded-xl border border-ink/5 bg-ink/[0.02] p-4 flex flex-col sm:flex-row sm:items-start gap-3 hover:bg-ink/[0.04] transition-all sm:justify-between" title={evidenceTitle || item.reason || ""}>
                          <div className="min-w-0 flex-1 w-full max-w-full">
                              {(item.mapel || item.difficulty) ? (
                                <p className="text-[10px] uppercase tracking-wider font-black text-ink/70 mb-1">
                                  {[item.mapel, item.difficulty].filter(Boolean).join(" · ")}
                                </p>
                              ) : null}
                              {item.targetSkill ? (
                                <p className="mb-1 text-xs font-semibold text-ink/50">
                                  Weakness: {item.targetSkill}
                                </p>
                              ) : null}
                              <div
                                className="block max-w-full overflow-hidden text-ellipsis whitespace-normal break-words text-lg font-bold text-ink/90 leading-snug sm:text-xl sm:whitespace-nowrap sm:truncate sm:leading-relaxed"
                                title={item.questionDisplay || ''}
                                dangerouslySetInnerHTML={{ __html: renderRecommendationQuestionHTML(item.questionDisplay || '') }}
                              />
                              {item.reason ? (
                                <p className="text-xs text-ink/50 mt-2 leading-relaxed" title={evidenceTitle || item.reason}>{item.reason}</p>
                              ) : null}
                          </div>
                          <button
                            onClick={() => {
                              if (item.ref) {
                                setRoute({
                                  route: "practice",
                                  practice: {
                                    title: item.targetSkill ? `Weakness: ${item.targetSkill}` : "Latihan AI",
                                    mapel: item.mapel || "Matematika",
                                    problems: [{
                                      id: item.ref,
                                      question_display: item.questionDisplay,
                                      question_text: item.questionText,
                                      answer_display: item.answerDisplay,
                                      question_type: item.questionType || "open",
                                      difficulty: item.difficulty,
                                      mc_options: item.mcOptions || "[]",
                                      acceptable_answers: item.acceptableAnswers || "[]"
                                    }]
                                  }
                                });
                              } else {
                                setRoute("belajar");
                              }
                            }}
                            className="btn-ink !py-1.5 !px-3.5 text-xs shrink-0 self-start sm:self-auto flex items-center gap-1"
                          >
                            Mulai <Icon.Arrow className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-ink/15 p-6 text-center text-2xl font-bold text-ink/45">
                    -
                  </div>
                )}
              </div>

              {/* Recent Canvas History */}
              <div className="card w-full max-w-full overflow-hidden">
                <div className="px-6 py-4 border-b hairline flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-lg">History Kesalahan Canvas</h3>
                  <span className="text-xs font-semibold text-ink/45 shrink-0">{attempts.length} pengerjaan terakhir</span>
                </div>
                {attempts.length ? (
                  <div className="divide-y hairline">
                    {attempts.map(att => (
                      <div key={att.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-ink/[0.01] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${att.isCorrect ? "bg-emerald-50/60 text-ink/65 border-emerald-900/10" : "bg-rose-50/60 text-ink/65 border-rose-900/10"
                              }`}>
                              {att.isCorrect ? "Benar" : "Perlu Perbaikan"}
                            </span>
                            <span className="text-xs font-mono text-ink/40">{formatDate(att.completedAt)}</span>
                          </div>
                          <h4
                            className="font-display font-semibold text-base mt-2 truncate text-ink"
                            dangerouslySetInnerHTML={{
                              __html: (() => {
                                const q = att.questionText || '';
                                if (window.renderMafikingMathHTML && q) return window.renderMafikingMathHTML(q);
                                if (window.escapeHtml) return window.escapeHtml(q);
                                return q.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                              })()
                            }}
                          />
                          <CorrectionIssueSummary attempt={att} />
                        </div>
                        <div className="flex items-center gap-6 shrink-0 justify-between md:justify-end">
                          {att.score !== undefined && (
                            <div className="text-right">
                              <span className="text-[10px] text-ink/40 block uppercase font-bold">Skor</span>
                              <span className={`font-display font-bold text-xl ${att.score >= 80 ? "text-emerald-600" : att.score >= 50 ? "text-amber-600" : "text-rose-600"
                                }`}>
                                {att.score}/100
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => setRoute("belajar")}
                            className="btn-ghost !py-1.5 !px-3 text-xs"
                          >
                            Latihan Lagi
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-sm text-ink/50">Belum pernah mengerjakan di Canvas</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {typeof onRequestLogout === "function" && (
        <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none px-4 pb-4 md:px-6 md:pb-6">
          <div className="mx-auto flex max-w-6xl items-end justify-between gap-4">
            <button
              onClick={onRequestLogout}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full border hairline bg-white/95 px-4 py-3 text-sm font-bold text-ink shadow-lg shadow-ink/10 backdrop-blur transition hover:bg-white"
              type="button"
            >
              <Icon.SwitchAccount className="w-4 h-4" />
              Switch account
            </button>
            <button
              onClick={onRequestLogout}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-bold text-white shadow-lg shadow-ink/20 transition hover:bg-ink/90"
              type="button"
            >
              Logout
              <Icon.LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function collectTags(attempts, key) {
  const counts = new Map();
  attempts.forEach((attempt) => {
    (attempt[key] || attempt.evaluation?.[key] || []).forEach((tag) => {
      const label = formatLearningLabel(tag);
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 5);
}

function collectInferredLearningTags(attempts, mode = "weakness") {
  const counts = new Map();
  (Array.isArray(attempts) ? attempts : []).forEach((attempt) => {
    const score = Number(attempt?.score ?? attempt?.evaluation?.score ?? 0);
    const isCorrect = Boolean(attempt?.isCorrect ?? attempt?.evaluation?.isCorrect);
    if (mode === "strength" && (!isCorrect || score < 80)) return;
    if (mode === "weakness" && isCorrect && score >= 80) return;
    const issues = getCorrectionIssuePoints(attempt);
    const text = [
      attempt?.questionText,
      attempt?.feedback,
      attempt?.evaluation?.fullFeedback,
      attempt?.evaluation?.fullFeedbackPlain,
      ...issues,
    ].filter(Boolean).join(" ");
    inferLearningLabelsFromText(text, mode).forEach((label) => {
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
    .slice(0, 5);
}

function limitLearningTags(tags) {
  return Array.from(new Set(Array.isArray(tags) ? tags.filter(Boolean) : [])).slice(0, 5);
}

function buildLocalOverallSummary(attempts, stats) {
  const rows = Array.isArray(attempts) ? attempts : [];
  if (!rows.length) {
    return "AI sedang mengumpulkan data latihan Anda. Kerjakan latihan di canvas untuk evaluasi kesalahan lebih mendalam.";
  }
  const wrong = rows.filter((attempt) => !attempt.isCorrect || Number(attempt.score || 0) < 80).length;
  const averageScore = Math.round(rows.reduce((sum, attempt) => sum + Number(attempt.score || 0), 0) / Math.max(rows.length, 1));
  const focus = collectInferredLearningTags(rows, "weakness")[0] || collectTags(rows, "weaknessTags")[0] || "langkah penyelesaian";
  const xpText = stats?.xp ? ` XP saat ini ${stats.xp}.` : "";
  return `Kamu sudah punya ${rows.length} history koreksi canvas dengan rata-rata skor ${averageScore}/100. ${wrong} pengerjaan masih perlu perbaikan; fokus berikutnya adalah ${focus}.${xpText}`;
}

function CorrectionIssueSummary({ attempt }) {
  const issues = getCorrectionIssuePoints(attempt);
  if (!issues.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 text-xs text-ink/65 leading-relaxed">
      {issues.map((issue, index) => (
        <div key={`${issue}-${index}`} className="flex gap-1.5">
          <span className="text-rose-400/75 font-bold shrink-0">•</span>
          <span>{issue}</span>
        </div>
      ))}
    </div>
  );
}

function getCorrectionIssuePoints(attempt) {
  const wrongSteps = Array.isArray(attempt?.evaluation?.wrongSteps) ? attempt.evaluation.wrongSteps : [];
  const stepIssues = wrongSteps
    .map((step) => {
      const stepLabel = String(step.stepNumber || '').trim();
      const issue = cleanCorrectionText(step.issue || step.issueLatex);
      if (!issue) return '';
      return stepLabel ? `Langkah ${stepLabel}: ${issue}` : issue;
    })
    .filter(Boolean);

  if (stepIssues.length) return stepIssues.slice(0, 2);
  return summarizeFeedbackIssues(attempt?.feedback).slice(0, 2);
}

function summarizeFeedbackIssues(feedback) {
  const text = cleanCorrectionText(feedback);
  if (!text) return [];
  const isolationMatch = text.match(/saat mengisolasi ([^,]+), terjadi kesalahan ([^.]+)\.\s*Seharusnya ([^.]+), bukan ([^.]+)\./i);
  if (isolationMatch) {
    return [
      `Salah saat mengisolasi ${isolationMatch[1].trim()}: seharusnya ${isolationMatch[3].trim()}, bukan ${isolationMatch[4].trim()}.`,
    ];
  }
  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  const issueSentences = sentences.filter((sentence) =>
    /salah|kesalahan|seharusnya|bukan|namun|perhatikan|kurang|keliru/i.test(sentence)
  );
  const source = issueSentences.length ? issueSentences : sentences;
  return source.map(compactIssueSentence).filter(Boolean);
}

function compactIssueSentence(sentence) {
  let text = cleanCorrectionText(sentence)
    .replace(/^namun,\s*/i, '')
    .replace(/^perhatikan juga bahwa\s*/i, 'Perhatikan: ')
    .replace(/Kesalahan ini berakibat.*$/i, '')
    .trim();
  if (!text) return '';
  if (text.length > 150) text = `${text.slice(0, 147).trim()}...`;
  return text;
}

function cleanCorrectionText(value) {
  return String(value || '')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();
}

function formatLearningLabel(label) {
  const text = String(label || '').trim();
  const key = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const labels = {
    turunan: 'Menghitung turunan',
    'aturan turunan dasar': 'Menghitung turunan dasar',
    'chain rule': 'Menerapkan aturan rantai',
    'aturan rantai': 'Menerapkan aturan rantai',
    'isolasi variabel': 'Mengisolasi variabel dalam persamaan',
    'dy dx isolation': 'Mengisolasi dy/dx',
    'konsep konstanta integrasi': 'Menentukan konstanta integrasi',
    'constant of integration': 'Menentukan konstanta integrasi',
    'anti turunan dasar': 'Menentukan anti-turunan',
    'integral tentu': 'Menghitung integral tentu',
    'substitusi u': 'Melakukan substitusi u',
    'u substitution': 'Melakukan substitusi u',
  };
  return labels[key] || text;
}

function inferLearningLabelsFromText(value, mode = "weakness") {
  const text = String(value || '').toLowerCase();
  const labels = [];
  if (/tidak memberikan jawaban|belum menjawab|jawaban kosong|tidak ada jawaban|menyalin soal/.test(text)) {
    labels.push("Menulis langkah penyelesaian");
  }
  if (/gambar|canvas|tulisan|terbaca/.test(text)) {
    labels.push("Kejelasan jawaban canvas");
  }
  if (/integral|\\int|∫|substitusi|anti[\s-]?turunan|dfrac|frac/.test(text)) {
    labels.push("Integral");
  }
  if (/turunan|derivative|diferensial|dy\/dx|dy dx/.test(text)) {
    labels.push("Diferensial");
  }
  if (/limit|\\lim/.test(text)) {
    labels.push("Limit");
  }
  if (/sin|cos|tan|trigonometri|trig/.test(text)) {
    labels.push("Trigonometri");
  }
  if (/aljabar|persamaan|variabel|pangkat|koefisien|konstanta/.test(text)) {
    labels.push("Aljabar");
  }
  if (!labels.length && mode === "weakness") labels.push("Ketelitian langkah");
  return limitLearningTags(labels.map(formatLearningLabel));
}

window.Profile = Profile;
