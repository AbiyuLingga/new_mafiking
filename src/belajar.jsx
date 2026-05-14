// MAFIKING Belajar Dashboard — minimalist with chapter card variants

const chapterData = {
  Matematika: [
    { id: 1, num: 7, title: "Teknik Integrasi", sub: "Pelajari konsep dasar integral substitusi dan **parsial** dengan interaktif.", progress: 6, total: 15, semester: 1, est: "45 mnt", topics: ["Substitusi U", "Integral parsial", "Trigonometri", "Pecahan parsial"], read: true },
    { id: 2, num: 8, title: "Bentuk Tak Tentu & Integral Tak Wajar", sub: "L'Hôpital dan **konvergensi** integral improper.", progress: 0, total: 27, semester: 1, est: "60 mnt", topics: ["L'Hôpital", "Integral improper", "Konvergensi"], read: false },
    { id: 3, num: 9, title: "Deret Tak Terhingga", sub: "Uji konvergensi, **deret Taylor** dan Maclaurin.", progress: 0, total: 20, semester: 2, est: "55 mnt", topics: ["Uji rasio", "Taylor", "Maclaurin"], read: false },
    { id: 4, num: 10, title: "Vektor & Matriks", sub: "Operasi dasar dan **determinan** matriks.", progress: 0, total: 18, semester: 2, est: "50 mnt", topics: ["Vektor", "Determinan"], read: false },
  ],
  Fisika: [
    { id: 5, num: 1, title: "Kinematika", sub: "Gerak lurus, **gerak parabola**, dan kerangka acuan.", progress: 0, total: 20, semester: 1, est: "50 mnt", topics: ["GLB", "GLBB", "Parabola"], read: false },
    { id: 6, num: 2, title: "Dinamika Newton", sub: "Gaya, **hukum Newton**, dan gerak melingkar.", progress: 0, total: 22, semester: 1, est: "55 mnt", topics: ["3 Hukum Newton", "Gesek", "Sentripetal"], read: false },
    { id: 7, num: 6, title: "Termodinamika", sub: "Hukum termodinamika dan **mesin Carnot**.", progress: 0, total: 15, semester: 2, est: "60 mnt", topics: ["Hukum 1-3", "Carnot"], read: false },
  ],
  Kimia: [
    { id: 8, num: 1, title: "Struktur Atom", sub: "Model Bohr dan **mekanika kuantum** dasar.", progress: 0, total: 12, semester: 1, est: "40 mnt", topics: ["Model Bohr", "Bilangan kuantum"], read: false },
    { id: 9, num: 5, title: "Reaksi Redoks", sub: "Bilangan oksidasi dan **sel elektrokimia**.", progress: 0, total: 18, semester: 2, est: "55 mnt", topics: ["Oksidasi", "Elektrokimia"], read: false },
  ],
};

// Render subtitle with **bold** markers
const renderSub = (text) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => p.startsWith("**") && p.endsWith("**")
    ? <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>
    : <span key={i}>{p}</span>);
};

const Belajar = ({ setRoute, tweaks }) => {
  const [mapel, setMapel] = useState("Matematika");
  const [semester, setSemester] = useState(1);

  const cardStyle = tweaks.chapterCard || "list";
  const selectorStyle = tweaks.mapelSelector || "pills";

  const chapters = chapterData[mapel].filter((c) => c.semester === semester);

  return (
    <div className="bg-paper">
      {/* Header */}
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pt-12 pb-8">
          <div>
            <SemesterKicker semester={semester} setSemester={setSemester} />
            <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
              Selamat pagi, Abiyyu.
            </h1>
          </div>
        </div>
      </section>

      {/* Mapel Selector — variant */}
      <MapelSelector style={selectorStyle} mapel={mapel} setMapel={setMapel} semester={semester} setSemester={setSemester} />

      {/* Main content */}
      <section>
        <div key={mapel} className="max-w-6xl mx-auto px-6 md:px-8 py-10">
          {(() => {
            const totalSoal = chapters.reduce((s, c) => s + c.total, 0);
            const doneSoal  = chapters.reduce((s, c) => s + c.progress, 0);
            const inProgress = chapters.filter(c => c.progress > 0).length;
            const pct = totalSoal > 0 ? (doneSoal / totalSoal) * 100 : 0;
            const M = MAPEL_META[mapel];
            const tonePalette = {
              amber:   { bg: "#FEF3C7", fg: "#B45309", ring: "rgba(217, 119, 6, 0.18)" },
              blue:    { bg: "#DBEAFE", fg: "#1D4ED8", ring: "rgba(37, 99, 235, 0.18)" },
              emerald: { bg: "#D1FAE5", fg: "#047857", ring: "rgba(5, 150, 105, 0.18)" },
            };
            const tone = tonePalette[M.color] || tonePalette.amber;
            const barTone = { amber: "bar-amber", blue: "bar-blue", emerald: "bar-emerald" }[M.color] || "bar-amber";
            return (
              <div className="flex items-start gap-4 mb-6 mapel-anim">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: tone.bg, color: tone.fg, boxShadow: `0 0 0 1px ${tone.ring}` }}
                >
                  <M.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-display font-bold text-2xl tracking-[-0.02em] mb-1">{mapel}</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink/50">
                      {inProgress} dari {chapters.length} bab dikerjakan · {doneSoal}/{totalSoal} soal selesai
                    </span>
                    <div className={`bar ${barTone} w-24 shrink-0`}><div style={{ width: `${pct}%` }}></div></div>
                  </div>
                </div>
              </div>
            );
          })()}


          {/* Chapter cards — variant */}
          {cardStyle === "numbered" && <ChaptersNumbered chapters={chapters} setRoute={setRoute} />}
          {cardStyle === "soft" && <ChaptersSoft chapters={chapters} setRoute={setRoute} mapel={mapel} />}
          {cardStyle === "magazine" && <ChaptersMagazine chapters={chapters} setRoute={setRoute} />}

        </div>
      </section>

    </div>
  );
};

// ─── Semester kicker (header) ─────────────────────────────────────────────
const SemesterKicker = ({ semester, setSemester }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4">
      <div className="relative inline-block">
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-2 font-display font-bold text-xl tracking-[-0.02em] hover:text-ink/70 transition-colors"
        >
          Semester {semester}
          <Icon.ChevD className={`w-5 h-5 text-ink/35 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-[calc(100%+6px)] left-0 w-48 bg-white rounded-2xl border hairline shadow-xl z-50 p-2 flex flex-col gap-0.5">
              {[1, 2].map(s => (
                <button
                  key={s}
                  onClick={() => { setSemester(s); setOpen(false); }}
                  className="w-full text-left px-4 py-3 rounded-xl flex items-center justify-between hover:bg-ink/[0.04] transition-all"
                >
                  <span className={`text-sm font-semibold ${semester === s ? "text-ink" : "text-ink/55"}`}>
                    Semester {s}
                  </span>
                  {semester === s && (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-ink/5 text-ink/55">
                      Aktif
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Stat box ─────────────────────────────────────────────────────────────
const StatBox = ({ label, value, sub, icon: IconC, accent }) => (
  <div className={`rounded-2xl border hairline p-4 flex flex-col min-w-0 ${accent === "yel" ? "bg-yel border-transparent" : "bg-white"}`}>
    <div className="flex items-center justify-between text-xs text-ink/55">
      <span className="font-medium truncate">{label}</span>
      {IconC && <IconC className="w-3.5 h-3.5" />}
    </div>
    <div className="font-display font-bold text-2xl mt-1.5 tnum truncate">{value}</div>
    <div className="text-[11px] text-ink/55 mt-0.5 truncate">{sub}</div>
  </div>
);

// ─── MAPEL SELECTOR · 3 VARIANTS ──────────────────────────────────────────
const MapelSelector = ({ style, mapel, setMapel, semester, setSemester }) => {
  if (style === "sidebar") return <MapelSidebar mapel={mapel} setMapel={setMapel} semester={semester} setSemester={setSemester} />;
  if (style === "tabs") return <MapelTabs mapel={mapel} setMapel={setMapel} semester={semester} setSemester={setSemester} />;
  return <MapelDropdown mapel={mapel} setMapel={setMapel} semester={semester} setSemester={setSemester} />;
};

// Variant A — Sidebar (vertical nav)
const MapelSidebar = ({ mapel, setMapel, semester, setSemester }) => (
  <section className="sticky top-[72px] z-30 border-y hairline bg-white/92 backdrop-blur-md">
    <div className="max-w-6xl mx-auto px-6 md:px-8">
      <div className="flex gap-0">
        <div className="border-r hairline py-5 pr-6 flex flex-col gap-1 min-w-[180px] md:min-w-[200px]">
          {(["Matematika", "Fisika", "Kimia"]).map(m => {
            const M = MAPEL_META[m];
            const active = mapel === m;
            return (
              <button
                key={m}
                onClick={() => setMapel(m)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${active ? "bg-ink text-white" : "hover:bg-ink/5 text-ink/65 hover:text-ink"}`}
              >
                <M.icon className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{m}</span>
                {active && <span className="ml-auto text-xs font-mono opacity-50">{M.code}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex-1 px-8 py-5 flex items-center">
          {(() => { const M = MAPEL_META[mapel]; return (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-ink/5 flex items-center justify-center">
                <M.icon className="w-6 h-6" />
              </div>
              <div>
                <div className="font-display font-bold text-2xl">{mapel}</div>
                <div className="text-sm text-ink/50">{M.code} · Semester {semester}</div>
              </div>
            </div>
          ); })()}
        </div>
      </div>
    </div>
  </section>
);

// Variant B — Underline tabs
const MapelTabs = ({ mapel, setMapel }) => (
  <section className="sticky top-[72px] z-30 bg-paper border-b hairline">
    <div className="max-w-6xl mx-auto px-6 md:px-8">
      <div className="flex gap-8 overflow-x-auto hide-scrollbar pt-5">
        {(["Matematika", "Fisika", "Kimia"]).map(m => {
          const M = MAPEL_META[m];
          const active = mapel === m;
          return (
            <button
              key={m}
              onClick={() => setMapel(m)}
              className="text-left whitespace-nowrap relative pb-3"
            >
              <div className={`font-display font-bold text-xl transition-colors duration-300 ${active ? "" : "text-ink/40"}`}>{m}</div>
              {active && <div className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-amber-500"></div>}
            </button>
          );
        })}
      </div>
    </div>
  </section>
);

// Variant C — Dropdown (mapel pills saja, semester ada di header)
const MapelDropdown = ({ mapel, setMapel }) => (
  <section className="sticky top-[72px] z-30 border-y hairline bg-white/92 backdrop-blur-md">
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-4 flex items-center gap-1">
      {["Matematika", "Fisika", "Kimia"].map(m => (
        <button key={m} onClick={() => setMapel(m)}
          className={`px-4 py-2.5 rounded-full text-sm font-semibold border transition-all ${mapel === m ? "bg-ink text-white border-ink" : "border-transparent text-ink/55 hover:text-ink hover:border-ink/15"}`}>
          {m}
        </button>
      ))}
    </div>
  </section>
);

// ─── CHAPTER CARDS · 3 VARIANTS ───────────────────────────────────────────

// Variant A — NUMBERED (editorial, angka bab besar di kiri, tanpa box)
const ChaptersNumbered = ({ chapters, setRoute }) => (
  <div className="flex flex-col mapel-stagger">
    {chapters.map((c, i) => {
      const isActive = c.progress > 0;
      const pct = (c.progress / c.total) * 100;
      return (
        <button
          key={c.id}
          onClick={() => setRoute("misi")}
          className={`group text-left flex gap-5 md:gap-8 py-7 -mx-2 px-2 rounded-xl transition-all hover:bg-ink/[0.018] ${i > 0 ? "border-t hairline" : ""}`}
        >
          <div className="font-display font-bold text-5xl md:text-7xl tnum text-ink/10 shrink-0 w-16 md:w-24 text-right leading-none mt-1">
            {pad2(c.num)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {isActive && <span className="tag-yel tag">Aktif</span>}
              <span className="text-xs text-ink/40 flex items-center gap-1"><Icon.Clock className="w-3 h-3" /> {c.est} · {c.total} soal</span>
            </div>
            <h3 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.02em] leading-tight mb-1.5">{c.title}</h3>
            <p className="text-sm text-ink/60 leading-relaxed">{c.sub}</p>
            {pct > 0 && (
              <div className="flex items-center gap-3 mt-4">
                <div className="bar w-40"><div style={{ width: `${pct}%` }}></div></div>
                <span className="text-xs font-mono text-ink/45 tnum">{c.progress}/{c.total}</span>
              </div>
            )}
          </div>
          <div className="shrink-0 self-center text-ink/25 group-hover:text-ink transition-colors">
            <Icon.Arrow className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </div>
        </button>
      );
    })}
  </div>
);

// Variant B — SOFT CARDS (3-col grid, soft shadow, photo placeholder)
const ChaptersSoft = ({ chapters, setRoute, mapel }) => {
  const toneClass = { Matematika: "card-amber", Fisika: "card-blue", Kimia: "card-emerald" }[mapel] || "card-amber";
  const barClass  = { Matematika: "bar-amber", Fisika: "bar-blue", Kimia: "bar-emerald" }[mapel] || "bar-amber";
  return (
  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mapel-stagger">
    {chapters.map(c => {
      const pct = (c.progress / c.total) * 100;
      return (
        <button
          key={c.id}
          onClick={() => setRoute("misi")}
          className={`text-left card-tone ${toneClass} p-6 group flex flex-col hover:-translate-y-1 transition-all`}
        >
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center justify-between mb-5">
              <div className="font-display font-bold text-4xl tnum text-ink/75">{pad2(c.num)}</div>
              <span className="tag">{c.est}</span>
            </div>
            <h3 className="font-display font-bold text-2xl leading-tight mb-2">{c.title}</h3>
            <p className="text-ink/60 text-sm leading-relaxed mb-5 flex-1">{c.sub}</p>

            {c.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {c.topics.slice(0, 3).map(t => (
                  <span key={t} className="text-xs text-ink/55 bg-ink/5 px-2 py-1 rounded-md">{t}</span>
                ))}
              </div>
            )}

            <div className="pt-4 border-t hairline flex items-center justify-between">
              {pct > 0 ? (
                <div className="flex items-center gap-2 flex-1 mr-3">
                  <div className={`bar ${barClass} flex-1`}><div style={{ width: `${pct}%` }}></div></div>
                  <span className="text-xs font-mono text-ink/50 tnum">{c.progress}/{c.total}</span>
                </div>
              ) : (
                <span className="text-xs font-mono text-ink/50">{c.total} soal</span>
              )}
              <span className="btn-ink !py-2 !px-4 text-xs shrink-0">
                Buka <Icon.Arrow className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </button>
      );
    })}
  </div>
  );
};

// Variant C — MAGAZINE (horizontal scroll, editorial full-bleed cards)
const ChaptersMagazine = ({ chapters, setRoute }) => (
  <div className="flex gap-4 md:gap-5 overflow-x-auto hide-scrollbar pb-4 -mx-6 px-6 md:-mx-8 md:px-8 mapel-stagger">
    {chapters.map((c, i) => {
      const isActive = c.progress > 0;
      const pct = (c.progress / c.total) * 100;
      const isHero = i === 0;
      return (
        <button
          key={c.id}
          onClick={() => setRoute("misi")}
          className={`shrink-0 text-left flex flex-col group hover:-translate-y-1 transition-all
            ${isHero ? "w-[340px] md:w-[420px] bg-ink text-white rounded-[var(--card-radius)] p-6 md:p-8" : "w-[260px] md:w-[300px] card pad-d"}`}
        >
          <div className="flex items-start justify-between mb-auto">
            <div className={`font-display font-bold text-7xl md:text-8xl tnum leading-none ${isHero ? "text-white/12" : "text-ink/8"}`}>
              {pad2(c.num)}
            </div>
            {isActive && (
              <span className={`tag ${isHero ? "!bg-white/10 !border-transparent !text-white" : "tag-yel"}`} style={isHero ? {} : { background: "var(--yel)", borderColor: "transparent" }}>Aktif</span>
            )}
          </div>
          <div className="mt-5">
            <div className={`text-xs font-mono mb-1.5 ${isHero ? "text-white/40" : "text-ink/40"}`}>Bab {c.num} · {c.est}</div>
            <h3 className={`font-display font-bold text-2xl tracking-[-0.02em] leading-tight mb-1.5 ${isHero ? "text-white" : ""}`}>{c.title}</h3>
            <p className={`text-sm leading-relaxed ${isHero ? "text-white/60" : "text-ink/60"}`}>{c.sub}</p>
            {pct > 0 && (
              <div className="flex items-center gap-3 mt-4">
                <div className={`bar flex-1`} style={isHero ? {"--tw-bg-opacity":"1"} : {}}>
                  <div style={{ width: `${pct}%`, background: isHero ? "var(--yel)" : undefined }}></div>
                </div>
                <span className={`text-xs font-mono tnum ${isHero ? "text-white/50" : "text-ink/45"}`}>{c.progress}/{c.total}</span>
              </div>
            )}
            {!pct && (
              <div className={`mt-4 pt-4 border-t ${isHero ? "border-white/10" : "hairline"} flex items-center justify-between`}>
                <span className={`text-xs font-mono ${isHero ? "text-white/40" : "text-ink/45"}`}>{c.total} soal</span>
                <Icon.Arrow className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${isHero ? "text-white/60" : ""}`} />
              </div>
            )}
          </div>
        </button>
      );
    })}
  </div>
);

window.Belajar = Belajar;
window.StatBox = StatBox;
