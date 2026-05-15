// Profile/report route. Uses the original Mafiking visual language.

const Profile = ({ setRoute }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [summary, setSummary] = useState(null);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError("");
      const me = await MafikingAPI.get("/api/auth/me");
      const progress = await MafikingAPI.get("/api/progress/stats");
      const correctionAttempts = await MafikingAPI.get("/api/correction/attempts");
      const profileSummary = await MafikingAPI.post("/api/correction/profile-summary", {
        attempts: correctionAttempts,
      });

      setUser(me);
      setStats(progress);
      setAttempts(correctionAttempts);
      setSummary(profileSummary.summary);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const weaknesses = summary?.weaknesses?.length
    ? summary.weaknesses
    : collectTags(attempts, "weaknessTags");
  const recommendations = summary?.recommendedQuestions || [];

  return (
    <div className="bg-paper">
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pt-12 pb-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b hairline pb-8">
            <div>
              <div className="kicker mb-2">Profil</div>
              <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
                Raport belajar.
              </h1>
              <p className="text-ink/60 text-lg mt-3">
                {user?.display_name || "Memuat profil"} · Level {user?.level || stats?.level || 1}
              </p>
            </div>
            <button onClick={loadProfile} className="btn-ghost self-start md:self-auto">
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pb-16">
          {error && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 mb-5">
              {error}
            </div>
          )}

          {loading ? (
            <div className="card p-8 text-center text-ink/55 font-semibold">
              Memuat raport...
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatBox label="Total Soal Dijawab" value={stats?.solvedProblems || 0} sub={`${attempts.length} koreksi canvas`} icon={Icon.Target} accent="yel" />
                <StatBox label="XP" value={user?.xp || stats?.xp || 0} sub={`Level ${user?.level || stats?.level || 1}`} icon={Icon.Bolt} />
                <StatBox label="Runtunan" value={user?.streak_days || stats?.streak_days || 0} sub="hari" icon={Icon.Flame} />
                <StatBox label="Mastery" value={`${stats?.mastery || 0}%`} sub={`${stats?.totalProblems || 0} soal`} icon={Icon.Trophy} />
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <article className="card p-6">
                  <div className="kicker mb-2">Kelemahan Kekurangan</div>
                  <h2 className="font-display font-bold text-2xl tracking-[-0.02em]">
                    Pola yang perlu diperbaiki.
                  </h2>
                  <div className="flex flex-wrap gap-2 mt-5">
                    {weaknesses.length ? weaknesses.map((tag) => (
                      <span key={tag} className="tag">{tag}</span>
                    )) : (
                      <p className="text-sm text-ink/50">Belum ada kelemahan terdeteksi.</p>
                    )}
                  </div>
                </article>

                <article className="card p-6">
                  <div className="kicker mb-2">Rekomendasi Soal</div>
                  <h2 className="font-display font-bold text-2xl tracking-[-0.02em]">
                    Latihan berikutnya.
                  </h2>
                  <ol className="grid gap-2 mt-5">
                    {recommendations.length ? recommendations.map((question, index) => (
                      <li key={`${question}-${index}`} className="rounded-2xl bg-ink/[0.035] p-4 text-sm text-ink/70">
                        {question}
                      </li>
                    )) : (
                      <li className="text-sm text-ink/50">Submit satu jawaban canvas untuk membuat rekomendasi.</li>
                    )}
                  </ol>
                </article>
              </div>

              <article className="card p-6">
                <div className="kicker mb-2">Ringkasan</div>
                <p className="text-ink/65 leading-relaxed">
                  {summary?.overallSummary || "Belum ada ringkasan. Kerjakan latihan canvas untuk mengisi raport."}
                </p>
                <button onClick={() => setRoute("belajar")} className="btn-ink mt-6">
                  Lanjut Latihan <Icon.Arrow />
                </button>
              </article>
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
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 6);
}

window.Profile = Profile;
