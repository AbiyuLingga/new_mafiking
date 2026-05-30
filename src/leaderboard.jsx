// Mafiking leaderboard route. Static data for v1; no backend/API coupling.

const Leaderboard = () => {
  const [activeTab, setActiveTab] = React.useState("semua");

  const podiums = [
    { place: 2, initials: "DA", name: "Diaz Akhmad Zulkarnaen", faculty: "FTTM", xp: "1.597", streak: 1 },
    { place: 1, initials: "AA", name: "Alya Amirah H", faculty: "STEI-R", xp: "3.619", streak: 3 },
    { place: 3, initials: "MR", name: "Muhammad Rizqon", faculty: "FTTM", xp: "1.475", streak: 2 },
  ];

  const usersAll = [
    { rank: 4, initials: "F", name: "Fazil", faculty: "FTI-RI", xp: "1.460", streak: 1 },
    { rank: 5, initials: "R", name: "Rania", faculty: "SAPPK", xp: "1.320", streak: 5 },
    { rank: 6, initials: "B", name: "Bagas", faculty: "FITB", xp: "1.250", streak: 2 },
    { rank: 7, initials: "N", name: "Nadia", faculty: "SF", xp: "1.180", streak: 4 },
    { rank: 8, initials: "A", name: "Alif", faculty: "STEI-K", xp: "1.100", streak: 7 },
    { rank: 9, initials: "D", name: "Dini", faculty: "SITH", xp: "1.050", streak: 3 },
    { rank: 10, initials: "E", name: "Eko", faculty: "FTTM", xp: "980", streak: 2 },
    { rank: 11, initials: "S", name: "Salsa", faculty: "FMIPA", xp: "940", streak: 6 },
    { rank: 12, initials: "H", name: "Hafiz", faculty: "FTSL", xp: "900", streak: 2 },
  ];

  const usersWeekly = [
    { rank: 4, initials: "F", name: "Fazil", faculty: "FTI-RI", xp: "460", streak: 1 },
    { rank: 5, initials: "N", name: "Nadia", faculty: "SF", xp: "420", streak: 4 },
    { rank: 6, initials: "R", name: "Rania", faculty: "SAPPK", xp: "350", streak: 5 },
    { rank: 7, initials: "A", name: "Alif", faculty: "STEI-K", xp: "310", streak: 7 },
    { rank: 8, initials: "D", name: "Dini", faculty: "SITH", xp: "280", streak: 3 },
    { rank: 9, initials: "B", name: "Bagas", faculty: "FITB", xp: "210", streak: 2 },
    { rank: 10, initials: "E", name: "Eko", faculty: "FTTM", xp: "150", streak: 2 },
    { rank: 11, initials: "S", name: "Salsa", faculty: "FMIPA", xp: "130", streak: 6 },
    { rank: 12, initials: "H", name: "Hafiz", faculty: "FTSL", xp: "110", streak: 2 },
  ];

  const displayUsers = activeTab === "semua" ? usersAll : usersWeekly;
  const pointLabel = activeTab === "semua" ? "Total Poin (XP)" : "Poin (XP) Minggu Ini";

  return (
    <section className="h-[calc(100vh-72px)] overflow-hidden bg-slate-50 text-slate-900">
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
            ]}
          />
        </div>

        <div className="hidden shrink-0 grid-cols-3 items-end gap-5 pb-5 md:grid">
          {podiums.map((user) => {
            const isChampion = user.place === 1;
            const placeClass = isChampion
              ? "bg-yel border-amber-300 shadow-lg h-[240px] lg:h-[270px]"
              : "bg-white border-slate-200 shadow-sm h-[210px] lg:h-[230px]";
            const avatarClass = isChampion
              ? "h-24 w-24 bg-ink text-white text-3xl"
              : "h-20 w-20 bg-slate-700 text-white text-2xl";
            return (
              <div
                key={user.place}
                className={`relative flex flex-col items-center rounded-[2rem] border p-6 text-center ${placeClass}`}
              >
                <div className={`absolute -top-4 flex h-9 w-9 items-center justify-center rounded-full font-black ring-4 ring-white ${
                  isChampion ? "bg-ink text-white" : "bg-slate-100 text-slate-700"
                }`}>
                  {user.place}
                </div>
                <div className={`mb-4 flex shrink-0 items-center justify-center rounded-full font-black tracking-wider ${avatarClass}`}>
                  {user.initials}
                </div>
                <h2 className="line-clamp-2 text-base font-black leading-tight text-ink lg:text-lg">
                  {user.name}
                </h2>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  {user.faculty}
                </p>
                <div className="mt-auto">
                  <div className={`font-black ${isChampion ? "text-3xl" : "text-2xl"} text-ink`}>
                    {user.xp} <span className="text-sm text-slate-500">XP</span>
                  </div>
                  <div className={`mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    isChampion ? "bg-ink text-white" : "bg-slate-100 text-slate-700"
                  }`}>
                    <Icon.Flame className="h-3.5 w-3.5 text-amber-500" /> {user.streak} Hari
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid shrink-0 grid-cols-[64px_1fr_128px] gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-400 sm:grid-cols-[80px_1fr_160px] sm:px-6">
            <div>Rank</div>
            <div>User</div>
            <div className="text-right">{pointLabel}</div>
          </div>

          <div key={activeTab} className="custom-scrollbar leaderboard-list-transition min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
            {displayUsers.map((user) => (
              <div
                key={user.rank}
                className="grid grid-cols-[64px_1fr_128px] items-center gap-3 px-4 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[80px_1fr_160px] sm:px-6"
              >
                <div className="font-black tabular-nums text-ink">
                  {user.rank < 10 ? `0${user.rank}` : user.rank}
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-white">
                    {user.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-ink sm:text-base">{user.name}</div>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{user.faculty}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <div className="text-sm font-black text-ink sm:text-base">{user.xp} XP</div>
                  <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <Icon.Flame className="h-3 w-3" /> {user.streak} hari
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

window.Leaderboard = Leaderboard;
