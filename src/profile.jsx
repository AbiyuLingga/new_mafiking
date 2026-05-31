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

  const loadProfile = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setSummaryLoading(false);
      setError("");

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

  const weaknesses = limitLearningTags(summary?.weaknesses?.length
    ? summary.weaknesses.map(formatLearningLabel)
    : collectTags(attempts, "weaknessTags"));

  const strengths = limitLearningTags(summary?.strengths?.length
    ? summary.strengths.map(formatLearningLabel)
    : collectTags(attempts, "strengthTags"));

  const recommendations = summary?.recommendedQuestions || [];
  const recommendedItems = Array.isArray(summary?.recommendedItems) ? summary.recommendedItems : [];
  const dataRecommendationRows = recommendedItems.length
    ? recommendedItems.map((item) => ({
      ref: item.ref || "",
      questionDisplay: item.questionDisplay || item.questionText || "",
      questionText: item.questionText || "",
      answerDisplay: item.answerDisplay || "",
      difficulty: item.difficulty || "",
      purcellReference: item.purcellReference || "",
      reason: item.reason || "",
      storyProblem: Boolean(item.storyProblem),
      targetSkill: item.targetSkill?.label || "",
    }))
    : recommendations.map((question) => ({
      ref: "",
      questionDisplay: question,
      questionText: "",
      answerDisplay: "",
      difficulty: "",
      purcellReference: "",
      reason: "",
      storyProblem: false,
      targetSkill: "",
    }));
  const adminPreviewRecommendationRows = [
    {
      ref: "",
      questionDisplay: "Tentukan dy/dx dari x² + y² = 25.",
      questionText: "Tentukan dy/dx dari x² + y² = 25.",
      answerDisplay: "dy/dx = -x/y",
      difficulty: "Medium",
      purcellReference: "Turunan Implisit",
      reason: "",
      storyProblem: false,
      targetSkill: "Turunan Implisit",
    },
    {
      ref: "",
      questionDisplay: "Hitung ∫ x eˣ dx.",
      questionText: "Hitung integral x e^x dx.",
      answerDisplay: "x eˣ - eˣ + C",
      difficulty: "Medium",
      purcellReference: "Integrasi Parsial",
      reason: "",
      storyProblem: false,
      targetSkill: "Integrasi Parsial",
    },
  ];
  const recommendationRows = dataRecommendationRows.length
    ? dataRecommendationRows
    : (isAdmin ? adminPreviewRecommendationRows : []);

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
    if (state.bypass) return "Admin: tanpa jeda";
    if (state.used) return "AI baru diperbarui";
    if (state.skipped && state.cooldownSeconds > 0) {
      const minutes = Math.max(1, Math.ceil(state.cooldownSeconds / 60));
      return `Refresh lagi dalam ${minutes} mnt`;
    }
    return "Analisis lokal aktif";
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
    <div className="app-page-bg app-page-bg--profil min-h-screen">
      <section className="pt-12 pb-6">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b hairline pb-6">
            <div>
              <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-none mb-3">
                Raport Belajar
              </h1>
              <p className="text-ink/60 text-sm md:text-base">
                {user?.display_name || "Memuat profil"} · Level {user?.level || stats?.level || 1}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRoute("belajar")} className="btn-ink !py-2.5 !px-5 text-sm">
                Kembali Belajar
              </button>
              <button onClick={() => loadProfile(true)} className="btn-ghost !py-2.5 !px-5 text-sm">
                Refresh
              </button>
              {typeof onRequestLogout === "function" && (
                <button onClick={onRequestLogout} className="btn-ghost !py-2.5 !px-5 text-sm">
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
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
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-white/50">AI Tutor Assessment</span>
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
                      {summary?.overallSummary || "AI sedang mengumpulkan data latihan Anda. Kerjakan latihan di canvas untuk evaluasi kesalahan lebih mendalam."}
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
                      <span key={tag} className="tag bg-emerald-50/50 text-ink/70 border border-emerald-900/10 hover:bg-emerald-50/70 transition-colors">
                        {tag}
                      </span>
                    )) : (
                      <p className="text-xs text-ink/45">
                        Selesaikan pengerjaan dengan benar untuk mendeteksi kekuatan konsepmu.
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
                      <span key={tag} className="tag bg-rose-50/45 text-ink/70 border border-rose-900/10 hover:bg-rose-50/65 transition-colors">
                        {tag}
                      </span>
                    )) : (
                      <p className="text-xs text-ink/45">
                        Hebat! Belum ada kelemahan konsep terdeteksi. Pertahankan!
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommended Questions */}
              <div className="card p-6">
                <div className="flex items-center gap-2.5 mb-2">
                  <h3 className="font-display font-bold text-xl tracking-[-0.015em]">Rekomendasi Soal Latihan</h3>
                  {summaryLoading && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      className="ml-1 text-amber-500" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}>
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  )}
                </div>
                <p className="text-xs text-ink/50 mb-5">Rekomendasi soal berdasarkan kelemahan kamu</p>

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
                      return (
                        <div key={item.ref || index} className="rounded-xl border border-ink/5 bg-ink/[0.02] p-4 flex items-start gap-4 hover:bg-ink/[0.04] transition-all justify-between">
                          <div className="flex items-start gap-3 min-w-0">
                            <span className="text-xs font-mono font-bold text-ink/35 mt-0.5">#{index + 1}</span>
                            <div className="min-w-0">
                              {item.targetSkill ? (
                                <p className="text-[10px] uppercase tracking-wider font-bold text-ink/35 mb-1">
                                  Weakness: {item.targetSkill}
                                </p>
                              ) : null}
                              <p className="text-sm font-medium text-ink/80 leading-relaxed whitespace-pre-wrap">
                                {item.questionDisplay || ''}
                              </p>
                              {item.reason ? (
                                <p className="text-xs text-ink/50 mt-2 leading-relaxed">{item.reason}</p>
                              ) : null}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (item.ref) {
                                setRoute({
                                  route: "practice",
                                  practice: {
                                    title: item.targetSkill ? `Weakness: ${item.targetSkill}` : "Latihan AI",
                                    mapel: "Matematika",
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
                            className="btn-ink !py-1.5 !px-3.5 text-xs shrink-0 flex items-center gap-1"
                          >
                            Mulai <Icon.Arrow className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-ink/15 p-6 text-center">
                    <p className="text-sm text-ink/50">Belum ada rekomendasi soal yang bisa ditampilkan.</p>
                    <button
                      onClick={() => setRoute("belajar")}
                      className="btn-ink mt-3 !py-2 !px-4 text-xs"
                    >
                      Mulai Latihan Baru
                    </button>
                  </div>
                )}
              </div>

              {/* Recent Canvas History */}
              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b hairline flex items-center justify-between">
                  <h3 className="font-display font-bold text-lg">History Kesalahan Canvas</h3>
                  <span className="text-xs font-semibold text-ink/45">{attempts.length} pengerjaan terakhir</span>
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
                              __html: window.renderMafikingMathHTML && att.questionText
                                ? window.renderMafikingMathHTML(att.questionText)
                                : (att.questionText || "Latihan Bebas")
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
                    <p className="text-sm text-ink/50">Belum ada riwayat pengerjaan. Mari kerjakan soal di canvas!</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

function collectTags(attempts, key) {
  const counts = new Map();
  attempts.forEach((attempt) => {
    (attempt[key] || attempt.evaluation?.[key] || []).forEach((tag) => {
      const label = formatLearningLabel(tag);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 5);
}

function limitLearningTags(tags) {
  return Array.from(new Set(Array.isArray(tags) ? tags.filter(Boolean) : [])).slice(0, 5);
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

window.Profile = Profile;
