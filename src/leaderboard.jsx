const DEFAULT_TRYOUT_LEADERBOARD = {
  id: "free-math-tryout-15",
  label: "Try Out Gratis",
  meta: "15 soal",
};

const Leaderboard = () => {
  const [activeTab, setActiveTab] = React.useState("semua");
  const [tryoutOptions, setTryoutOptions] = React.useState([DEFAULT_TRYOUT_LEADERBOARD]);
  const [selectedTryoutId, setSelectedTryoutId] = React.useState(DEFAULT_TRYOUT_LEADERBOARD.id);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    async function loadTryoutOptions() {
      try {
        const optionsData = await MafikingAPI.get("/api/progress/leaderboard/tryout-options");
        if (cancelled) return;
        const loadedOptions = Array.isArray(optionsData)
          ? optionsData
              .map((pkg) => ({
                id: String(pkg.id || "").trim(),
                label: String(pkg.label || "").trim(),
                meta: String(pkg.meta || "").trim(),
              }))
              .filter((option) => option.id && option.label)
          : [];
        const seen = new Set();
        const options = loadedOptions.filter((option) => {
          if (seen.has(option.id)) return false;
          seen.add(option.id);
          return true;
        });
        setTryoutOptions(options);
        setSelectedTryoutId((current) => (
          options.some((option) => option.id === current)
            ? current
            : (options[0] || DEFAULT_TRYOUT_LEADERBOARD).id
        ));
      } catch (_) {
        if (!cancelled) setTryoutOptions([DEFAULT_TRYOUT_LEADERBOARD]);
      }
    }

    loadTryoutOptions();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      setLoading(true);
      setError("");
      try {
        const endpoint = activeTab === "tryout"
          ? `/api/progress/leaderboard/tryout?tryoutId=${encodeURIComponent(selectedTryoutId || DEFAULT_TRYOUT_LEADERBOARD.id)}`
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
  }, [activeTab, selectedTryoutId]);

  const isTryoutTab = activeTab === "tryout";
  const pointLabel = isTryoutTab
    ? "Skor Tryout"
    : activeTab === "semua"
      ? "Total Poin (XP)"
      : "Poin (XP) Minggu Ini";
  const podiumRows = [rows[1], rows[0], rows[2]].filter(Boolean);
  const mobilePodiumRows = rows.slice(0, 3);
  const showEmptyTryoutPodium = isTryoutTab && !loading && !error && rows.length === 0;
  const podiumSlots = showEmptyTryoutPodium
    ? [
        { rank: 2, isEmpty: true },
        { rank: 1, isEmpty: true },
        { rank: 3, isEmpty: true },
      ]
    : podiumRows;
  const showPodium = !loading && !error && podiumSlots.length > 0;
  const showMobilePodium = !loading && !error && mobilePodiumRows.length > 0;
  const selfRow = rows.find((user) => user.isMe) || null;
  const tableRows = selfRow ? rows.filter((user) => !user.isMe) : rows;
  const podiumGridClass = showEmptyTryoutPodium
    ? "md:grid-cols-3"
    : podiumRows.length === 1
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

  function renderAvatar(user, className, fallbackClassName = "") {
    const avatarUrl = String(user?.avatar_url || "").trim();
    const initials = user?.initials || "U";
    return (
      <div className={`${className} overflow-hidden ${fallbackClassName || "bg-slate-700 text-white"} ${avatarUrl ? "p-0" : ""}`}>
        {avatarUrl ? (
          <React.Fragment>
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(event) => {
                const fallback = event.currentTarget.nextElementSibling;
                event.currentTarget.remove();
                fallback?.classList.remove("hidden");
              }}
            />
            <span className="hidden h-full w-full items-center justify-center">{initials}</span>
          </React.Fragment>
        ) : (
          initials
        )}
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

        {isTryoutTab && tryoutOptions.length > 0 && (
          <div className="mb-4 flex shrink-0 gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {tryoutOptions.map((option) => {
              const isSelected = option.id === selectedTryoutId;
              return (
                <button
                  key={option.id}
                  onClick={() => setSelectedTryoutId(option.id)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-left transition-colors ${
                    isSelected
                      ? "border-ink bg-ink text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-ink"
                  }`}
                  type="button"
                >
                  <div className="text-xs font-black">{option.label}</div>
                  {option.meta && (
                    <div className={`mt-0.5 text-[10px] font-bold ${isSelected ? "text-white/65" : "text-slate-400"}`}>
                      {option.meta}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {showPodium && (
          <div className={`hidden shrink-0 items-end gap-5 pb-5 md:grid ${podiumGridClass}`}>
            {podiumSlots.map((user) => {
              const isChampion = user.rank === 1;
              const isEmpty = Boolean(user.isEmpty);
              const placeClass = isChampion
                ? `${isEmpty ? "bg-yel/40 border-amber-200 border-dashed" : "bg-yel border-amber-300 shadow-lg"} h-[270px] lg:h-[300px]`
                : `${isEmpty ? "bg-white/70 border-slate-200 border-dashed" : "bg-white border-slate-200 shadow-sm"} h-[240px] lg:h-[260px]`;
              const avatarClass = isChampion
                ? `${isEmpty ? "bg-white/60 ring-1 ring-amber-200" : "bg-ink text-white"} h-24 w-24 text-3xl`
                : `${isEmpty ? "bg-slate-100 ring-1 ring-slate-200" : "bg-slate-700 text-white"} h-20 w-20 text-2xl`;
              return (
                <div
                  key={isEmpty ? `podium-empty-${user.rank}` : `podium-${user.id}-${user.rank}`}
                  className={`relative flex flex-col items-center rounded-[2rem] border p-6 text-center overflow-visible ${placeClass}`}
                >
                  <div className={`absolute -top-4 flex h-9 w-9 items-center justify-center rounded-full font-black ring-4 ring-white ${
                    isChampion ? "bg-ink text-white" : "bg-slate-100 text-slate-700"
                  }`}>
                    {user.rank}
                  </div>
                  {!isEmpty
                    ? renderAvatar(user, `mb-4 flex shrink-0 items-center justify-center rounded-full font-black tracking-wider ${avatarClass}`)
                    : <div className={`mb-4 flex shrink-0 items-center justify-center rounded-full font-black tracking-wider ${avatarClass}`} />
                  }
                  {!isEmpty && (
                    <React.Fragment>
                      <h2 className="leaderboard-podium-name text-base font-black text-ink lg:text-lg">
                        {user.display_name}
                      </h2>
                      {user.fakultas && (
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          {user.fakultas}
                        </p>
                      )}
                      <div className="mt-4">
                        <div className={`font-black ${isChampion ? "text-3xl" : "text-2xl"} text-ink`}>
                          {renderPrimaryMetric(user)}
                        </div>
                        <div className="mx-auto mt-2">
                          {renderSecondaryMetric(user, isChampion)}
                        </div>
                      </div>
                    </React.Fragment>
                  )}
                  {isEmpty && (
                    <div className="mt-2 flex w-full flex-1 flex-col items-center justify-center" aria-hidden="true">
                      <div className="h-3 w-28 rounded-full bg-white/60" />
                      <div className="mt-3 h-2 w-20 rounded-full bg-white/45" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showMobilePodium && (
          <div className="mb-4 grid shrink-0 grid-cols-3 gap-2 md:hidden">
            {mobilePodiumRows.map((user) => {
              const isChampion = user.rank === 1;
              return (
                <article
                  key={`mobile-podium-${user.id}-${user.rank}`}
                  className={`relative min-w-0 rounded-2xl border px-2.5 pb-3 pt-4 text-center shadow-sm ${
                    isChampion
                      ? "border-amber-300 bg-yel text-ink"
                      : "border-slate-200 bg-white text-ink"
                  }`}
                >
                  <div className={`absolute -top-2 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-[11px] font-black ring-2 ring-white ${
                    isChampion ? "bg-ink text-white" : "bg-slate-100 text-slate-700"
                  }`}>
                    {user.rank}
                  </div>
                  {renderAvatar(
                    user,
                    "mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full text-xs font-black tracking-wider",
                    isChampion ? "bg-ink text-white" : "bg-slate-700 text-white"
                  )}
                  <div className="truncate text-xs font-black text-ink">
                    {user.display_name}
                  </div>
                  {user.fakultas && (
                    <div className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-widest text-slate-500">
                      {user.fakultas}
                    </div>
                  )}
                  <div className="mt-2 text-sm font-black text-ink">
                    {renderPrimaryMetric(user, true)}
                  </div>
                </article>
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
            {selfRow && (
              <div className="sticky top-0 z-10 border-b border-amber-200 bg-amber-50/95 backdrop-blur">
                <div className="grid grid-cols-[64px_1fr_128px] items-center gap-3 px-4 py-3 sm:grid-cols-[80px_1fr_180px] sm:px-6">
                  <div className="min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-widest text-amber-600">Kamu</div>
                    <div className="font-black tabular-nums text-amber-800">
                      #{selfRow.rank < 10 ? `0${selfRow.rank}` : selfRow.rank}
                    </div>
                  </div>
                  <div className="flex min-w-0 items-center gap-3">
                    {renderAvatar(selfRow, "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black ring-2 ring-amber-300", "bg-ink text-white")}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-ink sm:text-base">{selfRow.display_name}</div>
                      {selfRow.fakultas && (
                        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{selfRow.fakultas}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <div className="text-sm font-black text-ink sm:text-base">{renderPrimaryMetric(selfRow, true)}</div>
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                      {isTryoutTab ? (
                        <React.Fragment>
                          <Icon.Clock className="h-3 w-3" /> {formatLeaderboardDuration(selfRow.duration_seconds)}
                        </React.Fragment>
                      ) : (
                        <React.Fragment>
                          <Icon.Flame className="h-3 w-3" /> {formatNumber(selfRow.streak_days)} hari
                        </React.Fragment>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
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

            {!loading && !error && tableRows.map((user) => (
              <div
                key={`${activeTab}-${user.rank}-${user.id}`}
                className={`grid grid-cols-[64px_1fr_128px] items-center gap-3 px-4 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[80px_1fr_180px] sm:px-6 ${
                  user.rank <= 3 ? "hidden" : ""
                }`}
              >
                <div className="font-black tabular-nums text-ink">
                  {user.rank < 10 ? `0${user.rank}` : user.rank}
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  {renderAvatar(user, "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black", "bg-ink text-white")}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-ink sm:text-base">{user.display_name}</div>
                    {user.fakultas && (
                      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{user.fakultas}</div>
                    )}
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
