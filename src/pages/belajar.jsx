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

const BELAJAR_MAPELS = ["Try Out", "Matematika", "Fisika", "Kimia"];
const BELAJAR_MAPEL_STORAGE_KEY = "mafiking:last-belajar-mapel";

const normalizeBelajarSection = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "tryout" || text === "try out" || text === "try-out") return "Try Out";
  return BELAJAR_MAPELS.find((item) => item.toLowerCase() === text) || null;
};

const getInitialBelajarMapel = () => {
  try {
    const saved = normalizeBelajarSection(window.localStorage.getItem(BELAJAR_MAPEL_STORAGE_KEY));
    if (saved) return saved;
  } catch (_) {}
  return "Try Out";
};

function slugifyBelajarPath(value) {
  const slug = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "latihan";
}

function buildChapterPracticeContext(chapter, mapel) {
  return {
    ...chapter,
    mapel,
    chapterSlug: slugifyBelajarPath(chapter?.title || chapter?.id),
    mapelSlug: slugifyBelajarPath(mapel),
    requiresSpecialPractice: true,
  };
}

function openPremiumChapterPractice(setRoute, chapter, mapel, hasPremiumAccess) {
  setRoute({ route: "practice", practice: buildChapterPracticeContext(chapter, mapel) });
}

function getTwoWordDisplayName(user) {
  const name = String(user?.display_name || user?.username || "").trim();
  if (!name || name.startsWith("Tamu_")) return "";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
}

const Belajar = ({ setRoute, tweaks, isAdmin, isLoggedIn = false, currentUser = null, authReady = true, hasPremiumAccess = false, initialSection = null, onSectionChange = null }) => {
  const [mapel, setMapelState] = useState(normalizeBelajarSection(initialSection) || getInitialBelajarMapel);
  const [semester, setSemester] = useState(1);
  const [dbInit, setDbInit] = useState(null);
  const [dbInitLoading, setDbInitLoading] = useState(true);

  const cardStyle = tweaks.chapterCard || "list";
  const selectorStyle = tweaks.mapelSelector || "pills";
  const setMapel = (nextMapel) => {
    const safeMapel = BELAJAR_MAPELS.includes(nextMapel) ? nextMapel : "Try Out";
    try {
      window.localStorage.setItem(BELAJAR_MAPEL_STORAGE_KEY, safeMapel);
    } catch (_) {}
    if (typeof onSectionChange === "function") onSectionChange(safeMapel);
    setMapelState(safeMapel);
  };

  useEffect(() => {
    const nextSection = normalizeBelajarSection(initialSection);
    if (nextSection && nextSection !== mapel) setMapel(nextSection);
  }, [initialSection]);

  function loadDbChapters() {
    setDbInitLoading(true);
    MafikingAPI.get('/api/quiz/init')
      .then(data => setDbInit(data))
      .catch(() => setDbInit(null))
      .finally(() => setDbInitLoading(false));
  }

  useEffect(() => { loadDbChapters(); }, []);

  const problemCounts = (dbInit && dbInit.problemCounts) || {};
  const rawDbChapters = dbInit ? (dbInit.chapters || []).map((c, idx) => ({
    id: c.id,
    num: c.sort_order || idx + 1,
    title: c.title,
    icon: c.icon || '',
    sub: c.description || '',
    est: c.est || '',
    progress: 0,
    total: (c.subtopics || []).reduce((s, sub) => s + (problemCounts[sub.id] || 0), 0),
    semester: Number(c.semester) || 1,
    mapel: c.mapel || 'Matematika',
    topics: (() => { try { return JSON.parse(c.topics || '[]'); } catch(_) { return []; } })(),
    is_hidden: Number(c.is_hidden) === 1,
    read: false,
  })) : null;

  const useDb = rawDbChapters !== null;
  const staticMapelChapters = chapterData[mapel] || [];
  const dbMapelChapters = useDb ? rawDbChapters.filter(c => c.mapel === mapel) : [];
  const dbSemesterChapters = dbMapelChapters.filter(c => c.semester === semester);
  const staticSemesterChapters = staticMapelChapters.filter(c => c.semester === semester);
  const allMapelChapters = useDb ? dbMapelChapters : staticMapelChapters;
  const baseChapters = useDb ? dbSemesterChapters : staticSemesterChapters;
  const chapters = baseChapters;
  const isTryOutSection = mapel === "Try Out";
  const greetingName = isLoggedIn ? getTwoWordDisplayName(currentUser) : "";
  const showChapterLoading = !isTryOutSection && dbInitLoading;

  return (
    <div className="app-page-bg app-page-bg--belajar min-h-[calc(100vh-72px)]">
      {/* Header */}
      <section>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 pt-6 sm:pt-12 pb-4 sm:pb-8">
          <div>
            <SemesterKicker semester={semester} setSemester={setSemester} />
            <h1 className="font-display font-bold text-2xl sm:text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
              Selamat datang<br />
              {greetingName ? (
                <span className="hi-yel-word">{greetingName}</span>
              ) : !authReady ? (
                <span className="inline-block h-[1em] w-[8.5em] rounded-xl bg-ink/10 align-baseline animate-pulse" aria-label="Memuat profil" />
              ) : (
                <React.Fragment>
                  <span className="hi-yel-word">pejuang</span> <span className="hi-yel-word">IP 4.0</span>
                </React.Fragment>
              )}
            </h1>
          </div>
        </div>
      </section>

      {/* Mapel Selector — variant */}
      <MapelSelector style={selectorStyle} mapel={mapel} setMapel={setMapel} semester={semester} setSemester={setSemester} />

      {/* Main content */}
      <section>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-4 sm:py-10">
          {isTryOutSection ? (
            <div key={`cards-${mapel}`}>
              <TryOutBelajarPanel setRoute={setRoute} isLoggedIn={isLoggedIn} isAdmin={isAdmin} />
            </div>
          ) : (() => {
            const totalSoal = chapters.reduce((s, c) => s + c.total, 0);
            const doneSoal  = chapters.reduce((s, c) => s + c.progress, 0);
            const inProgress = chapters.filter(c => c.progress > 0).length;
            const pct = totalSoal > 0 ? (doneSoal / totalSoal) * 100 : 0;
            const M = MAPEL_META[mapel];
            const toneClass = { amber: "tone-icon-amber", blue: "tone-icon-blue", emerald: "tone-icon-emerald", rose: "tone-icon-rose" }[M.color] || "tone-icon-amber";
            const barTone = { amber: "bar-amber", blue: "bar-blue", emerald: "bar-emerald", rose: "bar-rose" }[M.color] || "bar-amber";
            return (
              <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div
                  className={`w-9 h-9 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 ${toneClass}`}
                >
                  <M.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-display font-bold text-xl sm:text-2xl tracking-[-0.02em] mb-0.5 sm:mb-1">{mapel}</h2>
                  <div className="flex items-center gap-2 sm:gap-3">
                    {showChapterLoading ? (
                      <React.Fragment>
                        <span className="text-[10px] sm:text-xs text-ink/40">Memuat bank soal...</span>
                        <div className="h-1.5 w-16 sm:w-24 rounded-full bg-ink/10 animate-pulse" />
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <span className="text-[10px] sm:text-xs text-ink/50">
                          {inProgress} dari {chapters.length} bab · {doneSoal}/{totalSoal} soal
                        </span>
                        <div className={`bar ${barTone} w-16 sm:w-24 shrink-0`}><div style={{ width: `${pct}%` }}></div></div>
                      </React.Fragment>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}


          {/* Chapter cards — admin mode shows inline editor, user mode shows card variants */}
          {!isTryOutSection && showChapterLoading ? (
            <BelajarChapterSkeleton />
          ) : !isTryOutSection && isAdmin && typeof AdminBelajarView !== "undefined" ? (
            <AdminBelajarView setRoute={setRoute} mapel={mapel} chapters={allMapelChapters} onChaptersChanged={loadDbChapters} />
          ) : !isTryOutSection ? (
            <React.Fragment>
              <div key={`cards-${mapel}-${semester}-${cardStyle}`}>
                {cardStyle === "numbered" && <ChaptersNumbered chapters={chapters} setRoute={setRoute} mapel={mapel} hasPremiumAccess={hasPremiumAccess} />}
                {cardStyle === "soft" && <ChaptersSoft chapters={chapters} setRoute={setRoute} mapel={mapel} hasPremiumAccess={hasPremiumAccess} />}
                {cardStyle === "magazine" && <ChaptersMagazine chapters={chapters} setRoute={setRoute} mapel={mapel} hasPremiumAccess={hasPremiumAccess} />}
              </div>
            </React.Fragment>
          ) : null}

        </div>
      </section>

    </div>
  );
};

// ─── Semester kicker (header) ─────────────────────────────────────────────
const PREMIUM_TRYOUT_ID = "tryout-premium-tpb-prep";
const PREMIUM_TRYOUT_IDS = ["bimbel-persiapan-pretest-tpb", PREMIUM_TRYOUT_ID];
const PREMIUM_TRYOUT_FALLBACK = {
  tryout_id: PREMIUM_TRYOUT_ID,
  title: "Tryout Premium: The Trinity TPB",
  duration: "90 mnt",
  questions: 30,
  price: "Rp 100.000",
  access_features: ["tryout-access"],
};

function parseBelajarTryoutDurationSeconds(value, fallbackSeconds) {
  const text = String(value || "").toLowerCase();
  const number = Number((text.match(/\d+/) || [])[0] || 0);
  if (!number) return Number(fallbackSeconds || 90 * 60);
  return text.includes("jam") ? number * 60 * 60 : number * 60;
}

function parseBelajarPackageAccessFeatures(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch (_) {
    return text.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  }
}

function isPaidBelajarTryoutPackage(pkg) {
  const priceText = String(pkg?.price || "").trim().toLowerCase();
  return Boolean(priceText && priceText !== "gratis" && priceText !== "free" && !priceText.includes("gratis"));
}

function hasBelajarTryoutQuestions(pkg) {
  if (pkg?.question_count === undefined && pkg?.questionCount === undefined) return true;
  return Number(pkg?.question_count ?? pkg?.questionCount ?? 0) > 0;
}

function isLikelyBelajarPremiumPackage(pkg) {
  const text = `${pkg?.tryout_id || pkg?.tryoutId || ""} ${pkg?.title || ""}`.toLowerCase();
  if (/(^|\s|-)(test|cek|qris|lokal)(\s|-|$)/.test(text)) return false;
  return /(bimbel|premium|pretest|tpb|trinity)/.test(text);
}

function selectBelajarPremiumPackage(packages) {
  const list = Array.isArray(packages) ? packages.filter(Boolean) : [];
  const withTryoutAccess = list.filter((pkg) => (
    isPaidBelajarTryoutPackage(pkg)
    && parseBelajarPackageAccessFeatures(pkg.access_features).includes("tryout-access")
    && String(pkg.tryout_id || pkg.tryoutId || "").trim()
    && hasBelajarTryoutQuestions(pkg)
  ));
  const exactPremium = withTryoutAccess.find((pkg) => PREMIUM_TRYOUT_IDS.includes(pkg.tryout_id || pkg.tryoutId));
  const namedPremium = withTryoutAccess.find(isLikelyBelajarPremiumPackage);
  return exactPremium || namedPremium || withTryoutAccess[0] || null;
}

const TryOutBelajarPanel = ({ setRoute, isLoggedIn, isAdmin = false }) => {
  const [premiumPackage, setPremiumPackage] = useState(null);
  const [activePackages, setActivePackages] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const activePackagesRequest = (isLoggedIn || isAdmin)
      ? MafikingAPI.get('/api/payment/active-packages').catch(() => [])
      : Promise.resolve([]);
    Promise.all([
      MafikingAPI.get('/api/tryout-packages').catch(() => []),
      activePackagesRequest,
    ]).then(([packages, active]) => {
      if (cancelled) return;
      const premium = selectBelajarPremiumPackage(packages);
      setPremiumPackage(premium ? { ...PREMIUM_TRYOUT_FALLBACK, ...premium } : null);
      setActivePackages(Array.isArray(active) ? active : []);
    });
    return () => { cancelled = true; };
  }, [isLoggedIn, isAdmin]);

  const displayPremiumPackage = premiumPackage || PREMIUM_TRYOUT_FALLBACK;
  const premiumPackageReady = Boolean(premiumPackage && String(premiumPackage.tryout_id || premiumPackage.tryoutId || "").trim());
  const hasPremiumAccess = isAdmin
    || activePackages.includes("tryout-access")
    || activePackages.includes(displayPremiumPackage.title)
    || activePackages.includes(displayPremiumPackage.tryout_id)
    || activePackages.some((title) => ["Trial 7 Hari", "Bulanan", "Semester"].includes(title));

  const startPractice = () => {
    if (!isLoggedIn && !isAdmin) {
      showToast("Masuk atau sign up dulu untuk membuka soal tryout.", "error");
      setRoute({
        route: "lobby",
        authMode: "login",
        authRedirect: {
          route: "belajar",
          section: "Try Out"
        }
      });
      return;
    }
    setRoute({
      route: "tryout",
      tryout: {
        id: "free-math-tryout-15",
        mode: "free-math-confirm",
        title: "Try Out Matematika",
        mapel: "Matematika",
        semester: 1,
        est: "30 mnt",
        total: 15,
        problemLimit: 15,
        timeLimitSeconds: 30 * 60,
        topics: ["Try Out Gratis", "Matematika"],
        freeTryout: true,
        isTryoutSession: true,
      },
    });
  };

  const startPremiumTryout = () => {
    if (!premiumPackage || !String(premiumPackage.tryout_id || premiumPackage.tryoutId || "").trim()) {
      showToast("Paket premium sedang dimuat. Coba lagi sebentar.", "info");
      return;
    }
    if (!hasPremiumAccess) {
      setRoute("tryout");
      return;
    }
    const timeLimitSeconds = parseBelajarTryoutDurationSeconds(premiumPackage.duration, 90 * 60);
    setRoute({
      route: "tryout",
      tryout: {
        id: premiumPackage.tryout_id || PREMIUM_TRYOUT_ID,
        tryout_id: premiumPackage.tryout_id || PREMIUM_TRYOUT_ID,
        mode: "tryout-confirm",
        title: premiumPackage.title || PREMIUM_TRYOUT_FALLBACK.title,
        mapel: "",
        semester: 1,
        est: premiumPackage.duration || "90 mnt",
        total: Number(premiumPackage.questions || 30),
        problemLimit: Number(premiumPackage.questions || 30),
        timeLimitSeconds,
        topics: [premiumPackage.title || PREMIUM_TRYOUT_FALLBACK.title, "Premium"],
        freeTryout: false,
        isTryoutSession: true,
        packageTitle: premiumPackage.title || PREMIUM_TRYOUT_FALLBACK.title,
        disableCanvasIntro: true,
        disableCanvasMode: true,
        backRoute: { route: "belajar", section: "Try Out" },
      },
    });
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mapel-stagger">
      <section className="relative overflow-hidden rounded-[var(--card-radius)] bg-ink p-4 sm:p-6 text-white group flex flex-col justify-between transition-all">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-yel/20 blur-3xl" />
        <div className="absolute -bottom-16 -left-12 h-32 w-32 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold tracking-widest uppercase bg-yel text-ink px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border border-yel">
              Try Out
            </span>
            <div className="h-7 sm:h-8 min-w-[3rem] sm:min-w-[3.75rem] px-1.5 sm:px-2 rounded-lg bg-white/5 flex items-center justify-center gap-1 text-[9px] sm:text-[10px] font-mono font-bold tracking-widest uppercase text-white/65 border border-white/10">
              <Icon.Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              30 mnt
            </div>
          </div>

          <h2 className="font-display font-extrabold text-lg sm:text-2xl leading-tight tracking-tight mb-2 sm:mb-3 text-white">
            Tryout pre-test TPB
          </h2>
          <div className="mt-auto pt-3 sm:pt-4 border-t border-white/10 flex items-center justify-between gap-2 sm:gap-3 w-full">
            <span className="text-[10px] sm:text-xs font-mono font-bold text-white/50">
              Gratis
            </span>
            <button onClick={startPractice} className="btn-yel !px-3 !py-1.5 sm:!px-4 sm:!py-2 text-[10px] sm:text-xs shrink-0" type="button">
              Mulai
              <Icon.Arrow className="w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

        </div>
      </section>
      <section className="relative overflow-hidden rounded-[var(--card-radius)] bg-ink p-4 sm:p-6 text-white group flex flex-col justify-between transition-all">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-yel/15 blur-3xl" />
        <div className="absolute -bottom-16 -left-12 h-32 w-32 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold tracking-widest uppercase bg-white text-ink px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border border-white">
              Premium
            </span>
            <div className="h-7 sm:h-8 min-w-[3rem] sm:min-w-[3.75rem] px-1.5 sm:px-2 rounded-lg bg-white/5 flex items-center justify-center gap-1 text-[9px] sm:text-[10px] font-mono font-bold tracking-widest uppercase text-white/65 border border-white/10">
              <Icon.Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              {displayPremiumPackage.duration || "90 mnt"}
            </div>
          </div>

          <h2 className="font-display font-extrabold text-lg sm:text-2xl leading-tight tracking-tight mb-2 sm:mb-3 text-white">
            {displayPremiumPackage.title || "Tryout Premium"}
          </h2>
          <div className="mt-auto pt-3 sm:pt-4 border-t border-white/10 flex items-center justify-between gap-2 sm:gap-3 w-full">
            <span className="text-[10px] sm:text-xs font-mono font-bold text-white/50">
              {!premiumPackageReady ? "Memuat paket" : hasPremiumAccess ? "Akses aktif" : "Perlu akses"}
            </span>
            <button
              onClick={startPremiumTryout}
              disabled={!premiumPackageReady}
              className={hasPremiumAccess ? "btn-yel !px-3 !py-1.5 sm:!px-4 sm:!py-2 text-[10px] sm:text-xs shrink-0" : "inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-white bg-white px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-bold text-ink shadow-sm hover:bg-slate-100 transition-colors shrink-0"}
              type="button"
            >
              {!premiumPackageReady ? "Memuat" : hasPremiumAccess ? "Mulai" : "Beli"}
              <Icon.Arrow className="w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

const SemesterKicker = ({ semester, setSemester }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4">
      <div className="relative inline-block">
        <button
          aria-expanded={open}
          aria-label={`Ganti semester. Aktif: Semester ${semester}`}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-2 font-display font-bold text-xl tracking-[-0.02em] hover:text-ink/70 transition-colors"
          type="button"
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

const mapelToneClasses = {
  amber: {
    activeButton: "bg-white text-ink border-transparent border-b-2 border-b-amber-500",
    activePill: "bg-white text-ink border-transparent border-b-2 border-b-amber-500",
    activeText: "text-ink",
    activeUnderline: "bg-amber-500",
    toneIcon: "tone-icon-amber",
  },
  blue: {
    activeButton: "bg-white text-ink border-transparent border-b-2 border-b-blue-500",
    activePill: "bg-white text-ink border-transparent border-b-2 border-b-blue-500",
    activeText: "text-ink",
    activeUnderline: "bg-blue-500",
    toneIcon: "tone-icon-blue",
  },
  emerald: {
    activeButton: "bg-white text-ink border-transparent border-b-2 border-b-emerald-500",
    activePill: "bg-white text-ink border-transparent border-b-2 border-b-emerald-500",
    activeText: "text-ink",
    activeUnderline: "bg-emerald-500",
    toneIcon: "tone-icon-emerald",
  },
  rose: {
    activeButton: "bg-white text-ink border-transparent border-b-2 border-b-rose-500",
    activePill: "bg-white text-ink border-transparent border-b-2 border-b-rose-500",
    activeText: "text-ink",
    activeUnderline: "bg-rose-500",
    toneIcon: "tone-icon-rose",
  },
};

const getMapelTone = (mapelName) => {
  const color = MAPEL_META[mapelName]?.color || "amber";
  return mapelToneClasses[color] || mapelToneClasses.amber;
};

const getMapelUnderlineColor = (mapelName) => {
  if (mapelName === "Try Out") return "rgb(11 19 38)";
  const color = MAPEL_META[mapelName]?.color || "amber";
  return {
    amber: "#f59e0b",
    blue: "#3b82f6",
    emerald: "#10b981",
    rose: "#ef4444",
  }[color] || "#f59e0b";
};

// Variant A — Sidebar (vertical nav)
const MapelSidebar = ({ mapel, setMapel, semester, setSemester }) => (
  <section className="sticky top-[72px] z-30 border-y hairline bg-white/92 backdrop-blur-md">
    <div className="max-w-6xl mx-auto px-6 md:px-8">
      <div className="flex gap-0">
        <div className="border-r hairline py-5 pr-6 flex flex-col gap-1 min-w-[180px] md:min-w-[200px]">
          {BELAJAR_MAPELS.map(m => {
            const M = MAPEL_META[m];
            const active = mapel === m;
            const tone = getMapelTone(m);
            return (
              <button
                key={m}
                onClick={() => setMapel(m)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border border-transparent transition-all ${active ? tone.activeButton : "hover:bg-ink/5 text-ink/65 hover:text-ink"}`}
              >
                <M.icon className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-sm">{m}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1 px-8 py-5 flex items-center">
          {(() => { const M = MAPEL_META[mapel]; const tone = getMapelTone(mapel); return (
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tone.toneIcon}`}>
                <M.icon className="w-6 h-6" />
              </div>
              <div>
                <div className={`font-display font-bold text-2xl ${tone.activeText}`}>{mapel}</div>
                <div className="text-sm text-ink/50">Semester {semester}</div>
              </div>
            </div>
          ); })()}
        </div>
      </div>
    </div>
  </section>
);

// Variant B — Underline tabs
const MapelTabs = ({ mapel, setMapel }) => {
  const trackRef = useRef(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0, ready: false });

  useEffect(() => {
    if (!trackRef.current) return;
    let raf = 0;
    const measure = () => {
      const track = trackRef.current;
      if (!track) return;
      const active = track.querySelector(`[data-mapel-id="${mapel}"]`);
      if (!active) return;
      const trackRect = track.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      setUnderline({
        left: activeRect.left - trackRect.left + track.scrollLeft,
        width: activeRect.width,
        ready: true,
      });
    };
    raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [mapel]);

  return (
    <section className="sticky top-[72px] z-30 bg-transparent border-b hairline">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div ref={trackRef} className="mapel-tabs-track flex gap-3 sm:gap-8 overflow-x-auto hide-scrollbar pt-3 sm:pt-5">
          {underline.ready && (
            <span
              aria-hidden="true"
              className="mapel-tabs-underline"
              style={{
                width: `${underline.width}px`,
                transform: `translateX(${underline.left}px)`,
                backgroundColor: getMapelUnderlineColor(mapel),
              }}
            />
          )}
          {BELAJAR_MAPELS.map(m => {
            const active = mapel === m;
            const tone = getMapelTone(m);
            return (
              <button
                key={m}
                data-mapel-id={m}
                onClick={() => setMapel(m)}
                className="text-left whitespace-nowrap relative pb-3"
                type="button"
              >
                <div className={`font-display font-bold text-base sm:text-xl transition-colors duration-300 ${active ? tone.activeText : "text-ink/40"}`}>{m}</div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// Variant C — Dropdown (mapel pills saja, semester ada di header)
const MapelDropdown = ({ mapel, setMapel }) => (
  <section className="sticky top-[72px] z-30 border-y hairline bg-white/92 backdrop-blur-md">
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-4 flex items-center gap-1">
      {BELAJAR_MAPELS.map(m => {
        const tone = getMapelTone(m);
        return (
          <button key={m} onClick={() => setMapel(m)}
            className={`px-4 py-2.5 rounded-full text-sm font-semibold border transition-all ${mapel === m ? tone.activePill : "border-transparent text-ink/55 hover:text-ink hover:border-ink/15"}`}>
            {m}
          </button>
        );
      })}
    </div>
  </section>
);

// ─── CHAPTER CARDS · 3 VARIANTS ───────────────────────────────────────────

const BelajarChapterSkeleton = () => (
  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6" aria-label="Memuat bab">
    {[0, 1, 2].map((item) => (
      <div
        key={item}
        className="h-[210px] sm:h-[250px] rounded-[24px] border border-ink/10 bg-white/55 p-5 sm:p-6 animate-pulse"
      >
        <div className="mb-8 h-8 w-20 rounded-xl bg-ink/10" />
        <div className="mb-4 h-7 w-2/3 rounded-xl bg-ink/10" />
        <div className="mb-2 h-4 w-full rounded-lg bg-ink/10" />
        <div className="h-4 w-3/5 rounded-lg bg-ink/10" />
        <div className="mt-12 flex items-center justify-between">
          <div className="h-4 w-16 rounded-lg bg-ink/10" />
          <div className="h-10 w-24 rounded-full bg-ink/10" />
        </div>
      </div>
    ))}
  </div>
);

// Variant A — NUMBERED (editorial, angka bab besar di kiri, tanpa box)
const ChaptersNumbered = ({ chapters, setRoute, mapel, hasPremiumAccess = false }) => (
  <div className="flex flex-col mapel-stagger">
    {chapters.map((c, i) => {
      const isActive = c.progress > 0;
      const pct = (c.progress / c.total) * 100;
      return (
        <button
          key={c.id}
          onClick={() => openPremiumChapterPractice(setRoute, c, mapel, hasPremiumAccess)}
          className={`group text-left flex gap-5 md:gap-8 py-7 -mx-2 px-2 rounded-xl transition-all hover:bg-ink/[0.018] ${i > 0 ? "border-t hairline" : ""}`}
        >
          <div className="font-display font-bold text-5xl md:text-7xl tnum text-ink/10 shrink-0 w-16 md:w-24 text-right leading-none mt-1">
            {pad2(c.num)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {isActive && <span className="tag-yel tag">Aktif</span>}
              <span className="text-xs text-ink/55 flex items-center gap-1"><Icon.Clock className="w-3 h-3" /> {c.est} · {c.total} soal</span>
            </div>
            <h3 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.02em] leading-tight mb-1.5">{c.title}</h3>
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
const ChaptersSoft = ({ chapters, setRoute, mapel, hasPremiumAccess = false }) => {
  const toneClass = { Matematika: "card-premium-amber", Fisika: "card-premium-blue", Kimia: "card-premium-rose" }[mapel] || "card-premium-amber";
  const artClass = { Matematika: "card-premium-art-matematika", Fisika: "card-premium-art-fisika", Kimia: "card-premium-art-kimia" }[mapel] || "card-premium-art-matematika";
  const glowColor = { Matematika: "glow-amber", Fisika: "glow-blue", Kimia: "glow-rose" }[mapel] || "glow-amber";
  const pillClass = { Matematika: "topic-pill-premium-amber", Fisika: "topic-pill-premium-blue", Kimia: "topic-pill-premium-rose" }[mapel] || "topic-pill-premium-amber";
  const barColor  = { Matematika: "bg-amber-500", Fisika: "bg-blue-500", Kimia: "bg-rose-500" }[mapel] || "bg-amber-500";
  const ctaClass  = { Matematika: "btn-premium-cta-amber", Fisika: "btn-premium-cta-blue", Kimia: "btn-premium-cta-rose" }[mapel] || "btn-premium-cta-amber";

  const M = MAPEL_META[mapel];
  const SubjectIcon = M ? M.icon : null;

  const renderTextWithBold = (text) => {
    if (!text) return null;
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-extrabold text-ink">{part}</strong> : part);
  };

  return (
  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mapel-stagger">
    {chapters.map(c => {
      const pct = (c.progress / c.total) * 100;
      return (
        <button
          key={c.id}
          onClick={() => openPremiumChapterPractice(setRoute, c, mapel, hasPremiumAccess)}
          className={`text-left card-premium card-premium-subject-art ${toneClass} ${artClass} p-4 sm:p-6 group flex flex-col justify-between transition-all`}
        >
          {/* Ambient Glows */}
          <div className={`card-premium-glow glow-top-right ${glowColor}`} />
          <div className={`card-premium-glow glow-bottom-left ${glowColor}`} />
          {/* Dot Grid Background */}
          <div className="card-grid-pattern" />

          {/* Top Row: Bab Info & Est */}
          <div className="relative z-10 w-full flex flex-col h-full">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[9px] sm:text-[10px] font-mono font-bold tracking-widest uppercase bg-ink/5 text-ink/65 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border border-ink/5">
                  Bab {pad2(c.num)}
                </span>
              </div>
              {c.est && (
                <div className="h-6 sm:h-8 min-w-[3rem] sm:min-w-[3.75rem] px-1.5 sm:px-2 rounded-lg bg-transparent flex items-center justify-center text-[9px] sm:text-[10px] font-mono font-bold tracking-widest uppercase text-ink/60 border border-ink/5 group-hover:text-ink transition-all duration-300 animate-pulse-subtle">
                  {c.est}
                </div>
              )}
            </div>

            {/* Chapter Title */}
            <h3 className="font-display font-extrabold text-lg sm:text-2xl text-ink leading-tight tracking-tight mb-1.5 sm:mb-3 group-hover:text-ink/80 transition-colors">
              {c.title}
            </h3>

            {/* Chapter Subtitle (description) */}
            {c.sub && (
              <p className="hidden sm:block text-xs text-ink/55 font-sans leading-relaxed mb-4 line-clamp-2">
                {renderTextWithBold(c.sub)}
              </p>
            )}

            {/* Topics Covered */}
            {c.topics && c.topics.length > 0 && (
              <div className="hidden sm:flex flex-wrap gap-1.5 mb-6">
                {c.topics.slice(0, 3).map(t => (
                  <span key={t} className={`topic-pill-premium ${pillClass}`}>
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Divider & Footer (Progress / CTA) */}
            <div className="mt-auto pt-3 sm:pt-4 flex items-center justify-between w-full">
              {pct > 0 ? (
                <div className="flex flex-col gap-1 sm:gap-1.5 flex-1 mr-3 sm:mr-4">
                  <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono font-bold text-ink/60">
                    <span>{c.progress} / {c.total} Soal</span>
                    <span>{Math.round(pct)}%</span>
                  </div>
                  <div className="w-full h-1 sm:h-1.5 bg-ink/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              ) : (
                <span className="text-[10px] sm:text-xs font-mono font-bold text-ink/45 flex items-center gap-1.5">
                  <span>{c.total} soal</span>
                </span>
              )}

              <span className={`btn-premium-cta ${ctaClass} shrink-0 !px-2.5 !py-1.5 sm:!px-3.5 sm:!py-2 text-[10px] sm:text-xs`}>
                Buka
                <Icon.Arrow className="w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform group-hover:translate-x-1" />
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
const ChaptersMagazine = ({ chapters, setRoute, mapel, hasPremiumAccess = false }) => (
  <div className="flex gap-4 md:gap-5 overflow-x-auto hide-scrollbar pb-4 -mx-6 px-6 md:-mx-8 md:px-8 mapel-stagger">
    {chapters.map((c, i) => {
      const isActive = c.progress > 0;
      const pct = (c.progress / c.total) * 100;
      const isHero = i === 0;
      return (
        <button
          key={c.id}
          onClick={() => openPremiumChapterPractice(setRoute, c, mapel, hasPremiumAccess)}
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
            <div className={`text-xs font-mono mb-1.5 ${isHero ? "text-white/55" : "text-ink/55"}`}>Bab {c.num} · {c.est}</div>
            <h3 className={`font-display font-bold text-2xl tracking-[-0.02em] leading-tight ${isHero ? "text-white" : ""}`}>{c.title}</h3>
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
window.chapterData = chapterData;
