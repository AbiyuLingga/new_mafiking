const TRYOUT_LEADERBOARD_ID = "free-math-tryout-15";

const Leaderboard = () => {
  const [activeTab, setActiveTab] = React.useState("semua");
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      setLoading(true);
      setError("");
      try {
        const endpoint = activeTab === "tryout"
          ? `/api/progress/leaderboard/tryout?tryoutId=${encodeURIComponent(TRYOUT_LEADERBOARD_ID)}`
          : activeTab === "mingguan"
            ? "/api/progress/leaderboard/weekly"
            : "/api/progress/leaderboard";
        const data = await MafikingAPI.get(endpoint);
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (caught) {
        if (!cancelled) {
          setRows([]);
          setError(caught.message || "Gagal memuat leaderboard.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLeaderboard();
    return () => { cancelled = true; };
  }, [activeTab]);

  const isTryoutTab = activeTab === "tryout";
  const pointLabel = isTryoutTab
    ? "Skor Tryout"
    : activeTab === "semua"
      ? "Total Poin (XP)"
      : "Poin (XP) Minggu Ini";
  const podiumRows = [rows[1], rows[0], rows[2]].filter(Boolean);
  const podiumGridClass = podiumRows.length === 1
    ? "md:grid-cols-1 md:max-w-sm md:mx-auto"
    : podiumRows.length === 2
      ? "md:grid-cols-2 md:max-w-3xl md:mx-auto"
      : "md:grid-cols-3";

  function renderPrimaryMetric(user, compact) {
    if (isTryoutTab) {
      return (
        <React.Fragment>
          {formatNumber(user.score)} <span className={compact ? "text-xs text-slate-500" : "text-sm text-slate-500"}>Skor</span>
        </React.Fragment>
      );
    }
    return (
      <React.Fragment>
        {formatNumber(user.xp)} <span className={compact ? "text-xs text-slate-500" : "text-sm text-slate-500"}>XP</span>
      </React.Fragment>
    );
  }

  function renderSecondaryMetric(user, champion) {
    if (isTryoutTab) {
      return (
        <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
          champion ? "bg-ink text-white" : "bg-slate-100 text-slate-700"
        }`}>
          <Icon.Check className="h-3.5 w-3.5 text-emerald-500" />
          {formatNumber(user.correct_count)}/{formatNumber(user.total_questions)} benar
        </div>
      );
    }
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        champion ? "bg-ink text-white" : "bg-slate-100 text-slate-700"
      }`}>
        <Icon.Flame className="h-3.5 w-3.5 text-amber-500" /> {formatNumber(user.streak_days)} Hari
      </div>
    );
  }

  return (
    <section className="app-page-bg app-page-bg--peringkat h-[calc(100vh-72px)] overflow-hidden text-slate-900">
      <div className="mx-auto flex h-full max-w-6xl min-h-0 flex-col px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex shrink-0 flex-col gap-4 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="kicker mb-2">Peringkat</p>
            <h1 className="font-display text-3xl font-black tracking-[-0.04em] text-ink md:text-4xl">
              Leaderboard
            </h1>
          </div>
          <SlidingSegmented
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { id: "semua", label: "Semua" },
              { id: "mingguan", label: "Top Mingguan" },
              { id: "tryout", label: "Tryout" },
            ]}
          />
        </div>

        {!loading && !error && podiumRows.length > 0 && (
          <div className={`hidden shrink-0 items-end gap-5 pb-5 md:grid ${podiumGridClass}`}>
            {podiumRows.map((user) => {
              const isChampion = user.rank === 1;
              const placeClass = isChampion
                ? "bg-yel border-amber-300 shadow-lg h-[240px] lg:h-[270px]"
                : "bg-white border-slate-200 shadow-sm h-[210px] lg:h-[230px]";
              const avatarClass = isChampion
                ? "h-24 w-24 bg-ink text-white text-3xl"
                : "h-20 w-20 bg-slate-700 text-white text-2xl";
              return (
                <div
                  key={`podium-${user.id}-${user.rank}`}
                  className={`relative flex flex-col items-center rounded-[2rem] border p-6 text-center ${placeClass}`}
                >
                  <div className={`absolute -top-4 flex h-9 w-9 items-center justify-center rounded-full font-black ring-4 ring-white ${
                    isChampion ? "bg-ink text-white" : "bg-slate-100 text-slate-700"
                  }`}>
                    {user.rank}
                  </div>
                  <div className={`mb-4 flex shrink-0 items-center justify-center rounded-full font-black tracking-wider ${avatarClass}`}>
                    {user.initials}
                  </div>
                  <h2 className="line-clamp-2 text-base font-black leading-tight text-ink lg:text-lg">
                    {user.display_name}
                  </h2>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    {user.fakultas || "MAFIKING"}
                  </p>
                  <div className="mt-auto">
                    <div className={`font-black ${isChampion ? "text-3xl" : "text-2xl"} text-ink`}>
                      {renderPrimaryMetric(user)}
                    </div>
                    <div className="mx-auto mt-2">
                      {renderSecondaryMetric(user, isChampion)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid shrink-0 grid-cols-[64px_1fr_128px] gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-400 sm:grid-cols-[80px_1fr_180px] sm:px-6">
            <div>Rank</div>
            <div>User</div>
            <div className="text-right">{pointLabel}</div>
          </div>

          <div key={activeTab} className="custom-scrollbar leaderboard-list-transition min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
            {loading && (
              <div className="space-y-3 p-5">
                {[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-16 rounded-xl" />)}
              </div>
            )}

            {!loading && error && (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <Icon.Target className="mb-3 h-8 w-8 text-red-400" />
                <div className="text-sm font-black text-ink">{error}</div>
              </div>
            )}

            {!loading && !error && rows.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <Icon.Trophy className="mb-3 h-8 w-8 text-slate-300" />
                <div className="text-sm font-black text-ink">
                  {isTryoutTab ? "Belum ada peserta tryout." : "Belum ada data peringkat."}
                </div>
              </div>
            )}

            {!loading && !error && rows.map((user) => (
              <div
                key={`${activeTab}-${user.rank}-${user.id}`}
                className={`grid grid-cols-[64px_1fr_128px] items-center gap-3 px-4 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[80px_1fr_180px] sm:px-6 ${
                  user.rank <= 3 ? "md:hidden" : ""
                }`}
              >
                <div className="font-black tabular-nums text-ink">
                  {user.rank < 10 ? `0${user.rank}` : user.rank}
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-white">
                    {user.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-ink sm:text-base">{user.display_name}</div>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{user.fakultas || "MAFIKING"}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <div className="text-sm font-black text-ink sm:text-base">{renderPrimaryMetric(user, true)}</div>
                  <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                    {isTryoutTab ? (
                      <React.Fragment>
                        <Icon.Clock className="h-3 w-3" /> {formatLeaderboardDuration(user.duration_seconds)}
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <Icon.Flame className="h-3 w-3" /> {formatNumber(user.streak_days)} hari
                      </React.Fragment>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

function formatLeaderboardDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

window.Leaderboard = Leaderboard;
