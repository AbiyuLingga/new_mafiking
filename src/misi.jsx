// MAFIKING Misi Harian — minimalist with 4 mission card variants

const missionTimeline = [
  { day: 1, date: "Sen · 12 Mei", short: "Sen", status: "completed", mapel: "Matematika", target: "Kalkulus Harian", question: "Tentukan hasil dari ∫₀² 3x² dx.", xp: 150 },
  { day: 2, date: "Sel · 13 Mei", short: "Sel", status: "active", mapel: "Kimia", target: "Stoikiometri Harian", question: "Setarakan persamaan reaksi redoks berikut: MnO₄⁻ + Fe²⁺ → Mn²⁺ + Fe³⁺ dalam suasana asam.", xp: 200 },
  { day: 3, date: "Rab · 14 Mei", short: "Rab", status: "locked", mapel: "?", target: "Misi Rahasia", question: "Terbuka 14 Mei.", xp: 150 },
  { day: 4, date: "Kam · 15 Mei", short: "Kam", status: "locked", mapel: "?", target: "Misi Rahasia", question: "Terbuka 15 Mei.", xp: 200 },
  { day: 5, date: "Jum · 16 Mei", short: "Jum", status: "locked", mapel: "?", target: "Misi Rahasia", question: "Terbuka 16 Mei.", xp: 150 },
];

const Misi = ({ setRoute, tweaks }) => {
  const variant = tweaks.missionCard || "mafiking1";
  const active = missionTimeline.find(m => m.status === "active");
  const completed = missionTimeline.filter(m => m.status === "completed").length;
  const total = missionTimeline.length;

  return (
    <div className="bg-paper">
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pt-12 pb-10">
          <div className="grid lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-7">
              <div className="kicker mb-2">Misi Harian · Pekan 19</div>
              <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
                Lima menit hari ini,<br/>
                <span className="text-ink/40">satu langkah lebih dekat.</span>
              </h1>
              <p className="text-ink/65 text-lg mt-3 max-w-xl">
                Selesaikan misi harian untuk menjaga runtunan dan mengumpulkan XP bonus.
              </p>
            </div>
            <div className="lg:col-span-5 grid grid-cols-3 gap-3">
              <StatBox label="Pekan Ini" value={`${completed}/${total}`} sub="terselesaikan" />
              <StatBox label="Runtunan" value="12" sub="hari" icon={Icon.Flame} accent="yel" />
              <StatBox label="XP Pekan" value="350" sub="dari misi" icon={Icon.Bolt} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pb-12">
          {variant === "mafiking1" && <MissionMafikingLatihan timeline={missionTimeline} setRoute={setRoute} />}
          {variant === "timeline" && <MissionTimeline timeline={missionTimeline} setRoute={setRoute} />}
          {variant === "kanban" && <MissionKanban timeline={missionTimeline} setRoute={setRoute} />}
          {variant === "compact" && <MissionCompact timeline={missionTimeline} setRoute={setRoute} />}
        </div>
      </section>

      {/* Achievements */}
      <section className="pb-20">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <div className="kicker mb-1">Lencana Pekan Ini</div>
              <h2 className="font-display font-bold text-2xl tracking-[-0.02em]">Pencapaian yang sudah dikumpulkan.</h2>
            </div>
            <span className="text-sm text-ink/55 hidden md:block">3 dari 12</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { t: "Awal yang tepat", d: "Misi pertama < 5 mnt", earned: true },
              { t: "Tujuh hari", d: "Runtunan 7 hari", earned: true },
              { t: "Penjelajah", d: "Misi di 3 mapel", earned: true },
              { t: "Tanpa henti", d: "Runtunan 30 hari", earned: false },
            ].map(b => (
              <div key={b.t} className={`rounded-2xl p-5 border ${b.earned ? "bg-white hairline" : "bg-transparent hairline opacity-60"}`}>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-3 ${b.earned ? "bg-yel" : "bg-ink/5"}`}>
                  {b.earned ? <Icon.Star className="w-4 h-4" /> : <Icon.Lock className="w-4 h-4 text-ink/40" />}
                </div>
                <div className="font-semibold leading-tight">{b.t}</div>
                <div className="text-xs text-ink/55 mt-1">{b.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── VARIANT · MAFIKING-LATIHAN_1 (horizontal focused cards) ─────────────
const MissionMafikingLatihan = ({ timeline, setRoute }) => {
  const [focusedDay, setFocusedDay] = useState(
    timeline.find((m) => m.status === "active")?.day || 1
  );
  const scrollRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "instant",
      inline: "center",
      block: "nearest",
    });
  }, []);

  const scrollMissions = (direction) => {
    if (!scrollRef.current) return;
    const scrollAmount = window.innerWidth > 768 ? 400 : 300;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const centerPosition = container.scrollLeft + container.clientWidth / 2;
    let closestDay = focusedDay;
    let minDistance = Infinity;

    Array.from(container.children).forEach((child) => {
      const day = Number(child.dataset.day);
      if (!day) return;
      const childCenter = child.offsetLeft - container.offsetLeft + child.clientWidth / 2;
      const distance = Math.abs(childCenter - centerPosition);
      if (distance < minDistance) {
        minDistance = distance;
        closestDay = day;
      }
    });

    if (closestDay !== focusedDay) setFocusedDay(closestDay);
  };

  return (
    <div className="relative w-full pb-10 group">
      <button
        onClick={() => scrollMissions("left")}
        aria-label="Geser misi ke kiri"
        className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 bg-white/90 backdrop-blur-sm border border-ink/10 text-ink shadow-xl p-3 md:p-4 rounded-full hover:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/20 active:scale-95 transition-all flex items-center justify-center"
      >
        <Icon.ChevL className="w-6 h-6 md:w-8 md:h-8" />
      </button>
      <button
        onClick={() => scrollMissions("right")}
        aria-label="Geser misi ke kanan"
        className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 bg-white/90 backdrop-blur-sm border border-ink/10 text-ink shadow-xl p-3 md:p-4 rounded-full hover:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/20 active:scale-95 transition-all flex items-center justify-center"
      >
        <Icon.ChevR className="w-6 h-6 md:w-8 md:h-8" />
      </button>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 md:gap-8 overflow-x-auto snap-x snap-mandatory hide-scrollbar py-8 items-center px-[5vw] md:px-[15vw]"
      >
        {timeline.map((mission) => {
          const isActive = mission.status === "active";
          const isCompleted = mission.status === "completed";
          const isLocked = mission.status === "locked";
          const isFocused = focusedDay === mission.day;

          return (
            <article
              key={mission.day}
              data-day={mission.day}
              ref={isActive ? activeRef : null}
              className={`shrink-0 snap-center flex flex-col justify-between border transition-all duration-300 relative overflow-hidden w-[300px] md:w-[400px] min-h-[380px] rounded-[2rem] p-6 md:p-8 ${
                isFocused
                  ? "transform scale-100 shadow-2xl z-10 opacity-100"
                  : "transform scale-90 opacity-60 hover:opacity-80 shadow-sm"
              } ${
                isActive
                  ? "border-amber-300 bg-gradient-to-br from-amber-50 to-white"
                  : isCompleted
                    ? "bg-emerald-50/30 border-emerald-100"
                    : "bg-gray-50 border-gray-200"
              }`}
            >
              {isActive && (
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-200 blur-[80px] rounded-full opacity-40 pointer-events-none" />
              )}

              <div className="flex justify-between items-start mb-4 relative z-10 w-full">
                <div className="flex flex-col gap-2">
                  <span
                    className={`text-[10px] w-fit font-bold px-3 py-1.5 rounded-full uppercase tracking-widest ${
                      isActive
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : isCompleted
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    Hari {mission.day} &bull; {mission.date}
                  </span>
                  <h3 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight leading-tight">
                    {mission.target}
                  </h3>
                </div>
                <div
                  className={`flex items-center justify-center border-2 shrink-0 rounded-2xl w-14 h-14 ${
                    isActive
                      ? "bg-white text-amber-500 border-amber-200 shadow-sm"
                      : isCompleted
                        ? "bg-emerald-500 text-white border-emerald-400"
                        : "bg-gray-200 text-gray-400 border-white"
                  }`}
                >
                  {isActive ? (
                    <Icon.Bolt className="w-6 h-6" />
                  ) : isCompleted ? (
                    <Icon.CheckCircle className="w-6 h-6" />
                  ) : (
                    <Icon.Lock className="w-6 h-6" />
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4 relative z-10 flex-1">
                {isActive && (
                  <p className="font-bold text-gray-600 mb-2">{mission.mapel}</p>
                )}

                <div
                  className={`p-5 rounded-2xl flex-1 flex flex-col ${
                    isActive
                      ? "bg-white border border-amber-100 shadow-sm relative"
                      : isLocked
                        ? "bg-gray-200/50 items-center justify-center text-center"
                        : "bg-white/60 border border-emerald-100/50"
                  }`}
                >
                  {isLocked ? (
                    <>
                      <Icon.Lock className="w-6 h-6 mb-2 opacity-30" />
                      <p className="font-medium text-sm text-gray-500">{mission.question}</p>
                    </>
                  ) : (
                    <>
                      {isActive && (
                        <span className="absolute -top-3 -left-3 text-6xl text-amber-200 font-serif leading-none opacity-50">
                          "
                        </span>
                      )}
                      <p
                        className={`font-medium ${
                          isActive
                            ? "text-gray-900 text-lg leading-relaxed relative z-10"
                            : "text-gray-600 text-sm"
                        }`}
                      >
                        {mission.question}
                      </p>
                    </>
                  )}
                </div>

                {isActive && isFocused && (
                  <div className="flex items-center justify-between w-full mt-2 gap-4">
                    <span className="bg-white px-3 py-2 rounded-lg border shadow-sm text-sm font-bold text-gray-800 flex items-center gap-1.5 border-gray-200 shrink-0">
                      <Icon.Bolt className="w-4 h-4 text-amber-500" /> +{mission.xp} XP
                    </span>
                    <button
                      onClick={() => setRoute("belajar")}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#0b1326] text-white px-5 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-md group border border-gray-700 whitespace-nowrap"
                    >
                      Kerjakan
                      <Icon.Arrow className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </button>
                  </div>
                )}

                {isActive && !isFocused && (
                  <div className="w-full mt-2">
                    <button
                      onClick={() => setRoute("belajar")}
                      className="w-full flex items-center justify-center gap-2 bg-[#0b1326] text-white px-4 py-2 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-md"
                    >
                      Kerjakan
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

// ─── VARIANT A · TIMELINE (vertikal per hari, connector line kiri) ────────
const MissionTimeline = ({ timeline, setRoute }) => (
  <div className="max-w-2xl">
    {timeline.map((m, i) => {
      const isActive = m.status === "active";
      const isDone = m.status === "completed";
      const isLocked = m.status === "locked";
      const isLast = i === timeline.length - 1;
      return (
        <div key={m.day} className="flex gap-5">
          <div className="flex flex-col items-center shrink-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center z-10 ${
              isActive ? "bg-ink text-white" : isDone ? "bg-emerald-100 text-emerald-700" : "bg-ink/5 text-ink/30"
            }`} style={isActive ? { color: "var(--yel)" } : {}}>
              {isDone ? <Icon.Check className="w-4 h-4" /> : isActive ? <Icon.Bolt className="w-4 h-4" /> : <Icon.Lock className="w-3.5 h-3.5" />}
            </div>
            {!isLast && <div className={`w-px flex-1 my-2 ${isDone ? "bg-emerald-200" : "bg-ink/8"}`} />}
          </div>
          <div className={`flex-1 min-w-0 pb-5 ${isLast ? "" : ""}`}>
            <div className={`rounded-2xl p-5 border transition-all ${
              isActive ? "border-transparent" : isDone ? "bg-white hairline" : "bg-transparent hairline opacity-60"
            }`} style={isActive ? { background: "var(--yel)" } : {}}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-mono text-ink/45">{m.date}</div>
                <span className="text-xs font-mono inline-flex items-center gap-1 text-ink/50">
                  <Icon.Bolt className="w-3 h-3" /> +{m.xp} XP
                </span>
              </div>
              <div className="kicker mb-0.5">{isLocked ? "—" : m.mapel}</div>
              <h3 className="font-display font-bold text-xl mb-1.5 leading-tight">{m.target}</h3>
              {!isLocked && <p className="text-sm text-ink/70 leading-relaxed">{m.question}</p>}
              {isLocked && <p className="text-xs text-ink/40">Terbuka pada {m.short}.</p>}
              {isActive && (
                <button onClick={() => setRoute("belajar")} className="btn-ink mt-4 !py-2.5 !px-5 text-sm">
                  Kerjakan <Icon.Arrow />
                </button>
              )}
              {isDone && (
                <div className="mt-2.5 text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <Icon.CheckCircle className="w-3.5 h-3.5" /> Selesai
                </div>
              )}
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

// ─── VARIANT B · KANBAN (3 kolom: Selesai | Hari Ini | Akan Datang) ────────
const MissionKanban = ({ timeline, setRoute }) => {
  const done = timeline.filter(m => m.status === "completed");
  const today = timeline.filter(m => m.status === "active");
  const upcoming = timeline.filter(m => m.status === "locked");

  const KanbanCol = ({ label, items, accent }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div className="kicker">{label}</div>
        <span className="text-xs font-mono text-ink/45">{items.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map(m => (
          <div key={m.day} className={`rounded-2xl p-4 border ${
            accent === "active" ? "border-transparent" : accent === "done" ? "bg-white hairline" : "bg-transparent hairline opacity-65"
          }`} style={accent === "active" ? { background: "var(--yel)" } : {}}>
            <div className="text-xs font-mono text-ink/40 mb-1">{m.date}</div>
            <div className="kicker mb-0.5">{m.status === "locked" ? "—" : m.mapel}</div>
            <div className="font-display font-bold text-lg leading-tight mb-2">{m.target}</div>
            {accent === "active" && (
              <button onClick={() => setRoute("belajar")} className="btn-ink w-full justify-center !py-2 text-xs">
                Kerjakan <Icon.Arrow className="w-3.5 h-3.5" />
              </button>
            )}
            {accent === "done" && (
              <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                <Icon.Check className="w-3.5 h-3.5" /> +{m.xp} XP
              </div>
            )}
            {accent === "locked" && (
              <div className="text-xs text-ink/35 flex items-center gap-1">
                <Icon.Lock className="w-3 h-3" /> Terbuka {m.short}
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-ink/10 p-8 text-center text-xs text-ink/30">—</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex gap-4 md:gap-5">
      <KanbanCol label="Selesai" items={done} accent="done" />
      <KanbanCol label="Hari Ini" items={today} accent="active" />
      <KanbanCol label="Akan Datang" items={upcoming} accent="locked" />
    </div>
  );
};

// ─── VARIANT C · COMPACT (tabel 5 hari, sangat padat) ─────────────────────
const MissionCompact = ({ timeline, setRoute }) => (
  <div className="bg-white rounded-2xl border hairline overflow-hidden">
    <div className="grid grid-cols-12 px-5 py-3 border-b hairline bg-ink/[0.025] text-xs font-semibold text-ink/45 uppercase tracking-wide">
      <div className="col-span-1">No</div>
      <div className="col-span-2">Hari</div>
      <div className="col-span-2">Mapel</div>
      <div className="col-span-5">Misi</div>
      <div className="col-span-1 text-right">XP</div>
      <div className="col-span-1" />
    </div>
    {timeline.map((m, i) => {
      const isActive = m.status === "active";
      const isDone = m.status === "completed";
      const isLocked = m.status === "locked";
      return (
        <div key={m.day} className={`grid grid-cols-12 px-5 py-4 items-center gap-2 text-sm ${i > 0 ? "border-t hairline" : ""} ${isActive ? "bg-ink/[0.025]" : ""}`}
          style={isActive ? { background: "color-mix(in srgb, var(--yel) 18%, transparent)" } : {}}>
          <div className="col-span-1 font-display font-bold text-xl tnum text-ink/12">{pad2(m.day)}</div>
          <div className="col-span-2 text-xs text-ink/50 font-mono">{m.short}</div>
          <div className="col-span-2 text-xs font-semibold text-ink/70">{isLocked ? "—" : m.mapel.slice(0, 4)}</div>
          <div className="col-span-5 font-semibold truncate flex items-center gap-2">
            {isDone && <Icon.Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
            {isActive && <Icon.Bolt className="w-3.5 h-3.5 shrink-0" />}
            {isLocked && <Icon.Lock className="w-3.5 h-3.5 text-ink/25 shrink-0" />}
            <span className={isLocked ? "text-ink/35" : ""}>{m.target}</span>
          </div>
          <div className="col-span-1 text-right text-xs font-mono text-ink/45">+{m.xp}</div>
          <div className="col-span-1 flex justify-end">
            {isActive && (
              <button onClick={() => setRoute("belajar")} className="text-xs font-semibold inline-flex items-center gap-1 hover:gap-1.5 transition-all whitespace-nowrap">
                Mulai <Icon.Arrow className="w-3 h-3" />
              </button>
            )}
            {isDone && <Icon.CheckCircle className="w-4 h-4 text-emerald-500" />}
          </div>
        </div>
      );
    })}
  </div>
);

window.Misi = Misi;
