// MAFIKING Lobby — minimalist with 3 hero variants

const Lobby = ({ setRoute, tweaks, currentUser }) => {
  const isRegistered = currentUser && !currentUser.display_name?.startsWith("Tamu_");
  if (isRegistered) return <Dashboard user={currentUser} setRoute={setRoute} tweaks={tweaks} />;
  if (currentUser) return <LoginScreen />;
  return null;
};

const LoginScreen = () => {
  const { useState } = React;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await MafikingAPI.post('/api/auth/login', { username, password });
      window.location.reload();
    } catch (err) {
      setError(err.message || 'Username atau password salah.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: '#0F172A',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'inherit',
    }}>
      {/* Blobs */}
      <div style={{
        position: 'absolute', borderRadius: '50%', filter: 'blur(80px)', opacity: 0.5,
        width: 400, height: 400, background: 'rgba(245,228,79,0.15)', top: -100, left: -100,
      }} />
      <div style={{
        position: 'absolute', borderRadius: '50%', filter: 'blur(80px)', opacity: 0.5,
        width: 500, height: 500, background: 'rgba(30,64,175,0.4)', bottom: -150, right: -100,
      }} />

      {/* Card */}
      <div style={{
        background: 'rgba(30,41,59,0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 24,
        padding: 40,
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        position: 'relative',
        zIndex: 10,
        margin: '0 16px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/assets/logo.png" alt="Mafiking" style={{ width: 60, height: 60, objectFit: 'contain', marginBottom: 10 }} />
          <h1 style={{ fontSize: 28, color: '#FDF15B', letterSpacing: 1, margin: 0 }}>Mafiking</h1>
          <p style={{ color: 'rgba(203,213,225,0.7)', fontSize: 13, marginTop: 6 }}>Bimbel TPB ITB</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Masukkan username"
              required
              autoFocus
              style={{
                width: '100%', padding: '14px 16px', boxSizing: 'border-box',
                background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, color: '#fff', fontSize: 15, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#FDF15B'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', padding: '14px 16px', boxSizing: 'border-box',
                background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, color: '#fff', fontSize: 15, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#FDF15B'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
            {error && (
              <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8, marginLeft: 4 }}>{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: 14,
              background: loading ? 'rgba(253,241,91,0.5)' : 'linear-gradient(135deg,#FDF15B,#F5E44F)',
              color: '#0F172A', border: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 15px rgba(253,241,91,0.3)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
          >
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Landing (marketing, untuk anonymous/guest) ───────────────────────────
const Landing = ({ setRoute, tweaks }) => {
  const heroLayout = tweaks.heroLayout || "split";
  return (
    <div>
      {heroLayout === "split" && <HeroSplit setRoute={setRoute} />}
      {heroLayout === "editorial" && <HeroEditorial setRoute={setRoute} />}
      {heroLayout === "marquee" && <HeroMarquee setRoute={setRoute} />}

      <Stats tweaks={tweaks} />
      <Mapel setRoute={setRoute} />
      <Method />
      <ProgressFeature />
      <Testimonials />
      <CTA setRoute={setRoute} tweaks={tweaks} />
    </div>
  );
};

// ─── Dashboard (untuk registered user yang sudah login) ───────────────────
const Dashboard = ({ user, setRoute, tweaks }) => {
  const { useState, useEffect } = React;
  const [stats, setStats] = useState(null);

  useEffect(() => {
    MafikingAPI.get("/api/progress/stats").then(setStats).catch(() => null);
  }, []);

  const hour = new Date().getHours();
  const salam = hour < 10 ? "pagi" : hour < 15 ? "siang" : hour < 18 ? "sore" : "malam";
  const firstName = (user.display_name || "Kawan").split(" ")[0];

  const allChapters = (() => {
    const cd = window.chapterData;
    if (!cd) return [];
    return Object.entries(cd).flatMap(([mapel, chs]) => chs.map((ch) => ({ ...ch, mapel })));
  })();
  const continueChapter = allChapters.find((ch) => ch.progress > 0) || allChapters[0];

  return (
    <div className="bg-paper">
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pt-12 pb-6">
          <p className="kicker mb-2">Dashboard</p>
          <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
            Selamat {salam}, {firstName}.
          </h1>
        </div>
      </section>

      {continueChapter ? (
        <section>
          <div className="max-w-6xl mx-auto px-6 md:px-8 pb-8">
            <div className="card pad-d flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="kicker mb-1">Lanjutkan belajar</p>
                <h2 className="font-display font-bold text-xl tracking-[-0.02em]">
                  Bab {continueChapter.num}: {continueChapter.title}
                </h2>
                <p className="text-ink/55 text-sm mt-1">{continueChapter.mapel} · {continueChapter.est}</p>
                {continueChapter.progress > 0 ? (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="bar bar-amber w-28 shrink-0"><div style={{ width: `${Math.round((continueChapter.progress / continueChapter.total) * 100)}%` }} /></div>
                    <span className="text-xs text-ink/55">{continueChapter.progress}/{continueChapter.total} soal</span>
                  </div>
                ) : null}
              </div>
              <button
                className="btn-ink shrink-0"
                onClick={() => setRoute({ route: "practice", practice: continueChapter })}
                type="button"
              >
                {continueChapter.progress > 0 ? "Lanjutkan" : "Mulai"} <Icon.Arrow />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {stats ? (
        <section>
          <div className="max-w-6xl mx-auto px-6 md:px-8 pb-10">
            <div className="flex flex-wrap items-center gap-3">
              <button className="chip-streak" onClick={() => setRoute("misi")} type="button" title={`Streak ${stats.streak_days} hari`}>
                <Icon.Star className="w-3.5 h-3.5" />
                {stats.streak_days || 0} hari berturut
              </button>
              <div className="chip-level">
                <span className="lvl-badge">L{user.level || 1}</span>
                <span className="text-xs font-semibold text-ink/70">{stats.xp || 0} XP</span>
              </div>
              <div className="tag">
                {stats.solvedProblems}/{stats.totalProblems} soal selesai
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <Mapel setRoute={setRoute} />
    </div>
  );
};

// ─── HERO 1 · SPLIT (asymmetric, minimal photo right) ─────────────────────
const HeroSplit = ({ setRoute }) => (
  <section className="bg-paper">
    <div className="max-w-6xl mx-auto px-6 md:px-8 pt-12 md:pt-20 pb-16 md:pb-24">
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 tag mb-7">
            <Icon.Sparkles className="w-3.5 h-3.5" />
            Bimbel #1 untuk TPB ITB
          </div>
          <h1 className="font-display font-bold text-[clamp(2.6rem,6.5vw,5.4rem)] leading-[1.02] tracking-[-0.03em]">
            Taklukkan TPB<br/>
            <span className="text-ink/40">tanpa kecemasan,</span><br/>
            <span className="hi-yel">dengan struktur.</span>
          </h1>
          <p className="text-ink/65 text-lg md:text-xl leading-relaxed mt-6 max-w-xl">
            Bimbingan Matematika, Fisika, dan Kimia dasar khusus mahasiswa ITB. Belajar dengan modul terstruktur, latihan adaptif, dan mentor IP&nbsp;4,00.
          </p>
          <div className="flex flex-wrap items-center gap-5 mt-9">
            <button onClick={() => setRoute("belajar")} className="btn-ink">
              Coba Gratis <Icon.Arrow />
            </button>
            <button onClick={() => setRoute("tryout")} className="text-ink/70 font-semibold text-sm hover:text-ink inline-flex items-center gap-1.5">
              atau lihat tryout <Icon.Arrow className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-6 mt-10 text-sm text-ink/55">
            <div className="flex items-center gap-2">
              <Icon.CheckCircle className="w-4 h-4 text-emerald-600" /> Tanpa kartu kredit
            </div>
            <div className="flex items-center gap-2">
              <Icon.CheckCircle className="w-4 h-4 text-emerald-600" /> Aktivasi langsung
            </div>
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="relative">
            <div className="photo-frame aspect-[4/5] w-full" data-label="FOTO · sesi mentor"></div>
            <div className="absolute -bottom-4 -left-4 card pad-d !p-4 flex items-center gap-3 bg-white">
              <div className="w-10 h-10 rounded-xl bg-yel/40 flex items-center justify-center">
                <Icon.Star className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold tnum">4,9 / 5</div>
                <div className="text-xs text-ink/55">dari 2.500+ mahasiswa</div>
              </div>
            </div>
            <div className="absolute -top-4 -right-4 card !p-4 flex items-center gap-3 bg-white">
              <div className="w-10 h-10 rounded-xl bg-ink text-yel flex items-center justify-center">
                <Icon.Trophy className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold">IP 4,00</div>
                <div className="text-xs text-ink/55">Mentor ITB</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── HERO 2 · EDITORIAL (full-width tipografi besar, tanpa foto) ─────────
const HeroEditorial = ({ setRoute }) => (
  <section className="bg-paper border-b hairline">
    <div className="max-w-6xl mx-auto px-6 md:px-8 pt-16 md:pt-24 pb-14 md:pb-20">
      <div className="flex items-center gap-4 mb-10">
        <div className="h-px bg-ink w-10"></div>
        <div className="kicker">Bimbel #1 TPB ITB</div>
        <div className="h-px bg-ink/10 flex-1"></div>
        <div className="kicker text-ink/35">Est. 2023</div>
      </div>
      <h1 className="font-display font-bold text-[clamp(3.5rem,10vw,8rem)] leading-[0.93] tracking-[-0.04em] max-w-5xl">
        Taklukkan<br/>
        TPB<br/>
        <span className="text-ink/20">dengan struktur.</span>
      </h1>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mt-12 pt-10 border-t hairline">
        <p className="text-ink/65 text-xl leading-relaxed max-w-lg">
          Matematika, Fisika, Kimia — modul terstruktur, latihan adaptif, mentor IP 4,00.
        </p>
        <div className="flex items-center gap-4 shrink-0">
          <button onClick={() => setRoute("belajar")} className="btn-ink !py-4 !px-7">
            Coba Gratis <Icon.Arrow />
          </button>
          <button onClick={() => setRoute("misi")} className="text-ink/60 font-semibold text-sm hover:text-ink inline-flex items-center gap-1.5">
            atau misi harian <Icon.Arrow className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </section>
);

// ─── HERO 3 · MARQUEE (judul besar + stat ticker horizontal) ─────────────
const HeroMarquee = ({ setRoute }) => (
  <section className="bg-paper">
    <div className="max-w-6xl mx-auto px-6 md:px-8 pt-14 md:pt-20 pb-10">
      <div className="inline-flex items-center gap-2 tag mb-8">
        <span className="dot-active"></span> Pendaftaran semester baru terbuka
      </div>
      <div className="grid lg:grid-cols-12 gap-8 items-end">
        <div className="lg:col-span-8">
          <h1 className="font-display font-bold text-[clamp(2.8rem,8vw,6.5rem)] leading-[0.96] tracking-[-0.04em]">
            Bimbel TPB ITB<br/>
            yang <span className="hi-yel">terbukti.</span>
          </h1>
        </div>
        <div className="lg:col-span-4 flex flex-col gap-3 pb-2">
          <p className="text-ink/65 leading-relaxed">Modul mingguan, latihan adaptif, dan mentor IP 4,00. Tanpa hafalan, lebih banyak intuisi.</p>
          <button onClick={() => setRoute("belajar")} className="btn-ink self-start">
            Coba Gratis <Icon.Arrow />
          </button>
        </div>
      </div>
    </div>
    <div className="border-y hairline bg-white overflow-hidden">
      <div className="flex items-center py-4 overflow-x-auto hide-scrollbar">
        <div className="flex gap-10 px-8 shrink-0">
          {[
            ["2.500+", "Mahasiswa aktif"],
            ["98%", "Kepuasan"],
            ["15.000+", "Soal selesai"],
            ["3×", "Lebih cepat paham"],
            ["IP 4,00", "Mentor kami"],
            ["24/7", "Support"],
          ].map(([v, l]) => (
            <div key={l} className="shrink-0 flex items-center gap-3">
              <span className="font-display font-bold text-2xl tnum">{v}</span>
              <span className="text-sm text-ink/50">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// ─── Stats strip ──────────────────────────────────────────────────────────
const Stats = ({ tweaks = {} }) => {
  const style = tweaks.statsStyle || "strip";
  const items = [
    ["2.500+", "Mahasiswa aktif"],
    ["15.000+", "Soal diselesaikan"],
    ["98%", "Tingkat kepuasan"],
    ["24/7", "Support mentor"],
  ];

  if (style === "cards") {
    return (
      <section className="sec-y-sm">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {items.map(([v, l]) => (
              <div key={l} className="card pad-d text-center">
                <div className="font-display font-bold text-3xl md:text-4xl tnum">{v}</div>
                <div className="text-sm text-ink/55 mt-1.5">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (style === "bold") {
    return (
      <section className="sec-y">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {items.map(([v, l]) => (
              <div key={l}>
                <div className="font-display font-bold text-5xl md:text-6xl tnum">{v}</div>
                <div className="text-sm text-ink/55 mt-2 font-medium uppercase tracking-widest" style={{fontSize:"10px",letterSpacing:"0.12em"}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-y hairline bg-white">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-2 text-center md:text-left">
        {items.map(([v, l]) => (
          <div key={l} className="md:px-4">
            <div className="font-display font-bold text-3xl md:text-4xl tnum">{v}</div>
            <div className="text-sm text-ink/55 mt-1">{l}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

// ─── Mapel section ────────────────────────────────────────────────────────
const Mapel = ({ setRoute }) => {
  const items = [
    { mapel: "Matematika", desc: "Kalkulus, aljabar, deret tak terhingga — dari fungsi limit hingga uji konvergensi.", chapters: 14 },
    { mapel: "Fisika", desc: "Mekanika, termodinamika, listrik magnet — intuisi terlebih dahulu, rumus kemudian.", chapters: 12 },
    { mapel: "Kimia", desc: "Atom, reaksi, stoikiometri — dari model Bohr hingga setara redoks.", chapters: 10 },
  ];
  return (
    <section className="sec-y">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="flex items-end justify-between mb-10 gap-6">
          <div>
            <div className="kicker mb-2">Mata Pelajaran</div>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.025em]">Tiga fondasi, ratusan bab.</h2>
          </div>
          <button onClick={() => setRoute("belajar")} className="hidden md:inline-flex text-sm font-semibold items-center gap-1 hover:gap-2 transition-all">
            Buka semua <Icon.Arrow />
          </button>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {items.map(it => {
            const M = MAPEL_META[it.mapel];
            return (
              <button
                key={it.mapel}
                onClick={() => setRoute("belajar")}
                className="card card-hover pad-d text-left group flex flex-col"
              >
                <div className="w-12 h-12 rounded-2xl bg-ink/5 flex items-center justify-center mb-5">
                  <M.icon className="w-5 h-5" />
                </div>
                <div className="text-xs font-mono text-ink/55 mb-1">{M.code}</div>
                <h3 className="font-display font-bold text-2xl mb-2">{it.mapel}</h3>
                <p className="text-ink/65 text-sm leading-relaxed flex-1">{it.desc}</p>
                <div className="flex items-center justify-between mt-6 pt-4 border-t hairline">
                  <span className="text-xs font-mono text-ink/50">{it.chapters} bab</span>
                  <Icon.Arrow className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// ─── Method ───────────────────────────────────────────────────────────────
const Method = () => (
  <section className="sec-y bg-white border-y hairline">
    <div className="max-w-6xl mx-auto px-6 md:px-8">
      <div className="grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5">
          <div className="kicker mb-2">Metode</div>
          <h2 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
            Membentuk kebiasaan,<br/>
            <span className="text-ink/55">bukan sekadar hafalan.</span>
          </h2>
          <p className="text-ink/65 text-lg mt-6 max-w-md">
            Platform kami didesain untuk membangun intuisi matematis dan analitis yang bertahan lama — bukan hanya menyelesaikan PR.
          </p>
        </div>
        <div className="lg:col-span-7">
          {[
            { n: "01", t: "Materi terstruktur", d: "Topik rumit dipecah menjadi unit kecil yang mudah dicerna." },
            { n: "02", t: "Latihan adaptif", d: "Sistem pintar menyesuaikan kesulitan soal dengan pemahamanmu secara real-time." },
            { n: "03", t: "Komunitas & mentor", d: "Diskusi, tanya PR, dan dapatkan bimbingan langsung dari mentor ITB." },
          ].map((f, i) => (
            <div key={f.n} className={`flex gap-6 py-6 ${i > 0 ? "border-t hairline" : ""}`}>
              <div className="font-mono text-sm text-ink/55 shrink-0 w-8">{f.n}</div>
              <div className="flex-1">
                <h3 className="font-display font-semibold text-xl mb-1">{f.t}</h3>
                <p className="text-ink/60 leading-relaxed">{f.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// ─── Progress feature ────────────────────────────────────────────────────
const ProgressFeature = () => (
  <section className="sec-y">
    <div className="max-w-6xl mx-auto px-6 md:px-8">
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="kicker mb-2">Progres</div>
          <h2 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
            IP yang bisa<br/>kamu <span className="hi-yel">ukur sendiri.</span>
          </h2>
          <p className="text-ink/65 text-lg mt-6 max-w-md">
            Setiap bab, setiap soal, setiap menit baca — terekam. Lihat sendiri sejauh mana fondasi akademikmu sudah terbangun.
          </p>
          <div className="flex items-center gap-6 mt-8">
            <div>
              <div className="font-display font-bold text-3xl tnum">3,84</div>
              <div className="text-xs text-ink/55">IP prediksi</div>
            </div>
            <div>
              <div className="font-display font-bold text-3xl tnum">12</div>
              <div className="text-xs text-ink/55">Hari berturut</div>
            </div>
            <div>
              <div className="font-display font-bold text-3xl tnum">8,4h</div>
              <div className="text-xs text-ink/55">Total baca</div>
            </div>
          </div>
        </div>
        <div className="card-soft p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="kicker text-xs">Laporan Pekan ini</div>
              <div className="font-semibold text-lg mt-0.5">Abiyyu L. · Sem. 1</div>
            </div>
            <span className="tag tag-emerald">
              <span className="dot-active"></span> On track
            </span>
          </div>
          <div className="space-y-5">
            {[
              ["Kalkulus 2A", 85],
              ["Fisika Dasar", 60],
              ["Kimia Dasar", 92],
            ].map(([t, v]) => (
              <div key={t}>
                <div className="flex justify-between mb-1.5 text-sm">
                  <span className="font-medium">{t}</span>
                  <span className="font-mono tnum text-ink/60">{v}%</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${v}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── Testimonials ─────────────────────────────────────────────────────────
const Testimonials = () => {
  const list = [
    { t: "Dulu paling takut sama Kalkulus karena nggak ngerti konsep dasar limit. Di sini semua jadi visual dan nyambung. UTS dapet A.", n: "Budi P.", r: "STEI-K '25" },
    { t: "Bedanya sama bimbel lain, tutornya beneran ngajak mikir bukan ngasih jalan pintas. Latihannya seru kayak main game.", n: "Sarah M.", r: "FTMD '25" },
    { t: "Fitur tracker progresnya ngebantu banget buat maintain semangat. Lihat streak harian langsung terpacu buka modul.", n: "Rizky D.", r: "SAPPK '25" },
  ];
  return (
    <section className="sec-y bg-white border-y hairline">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="mb-12">
          <div className="kicker mb-2">Kata mereka</div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.025em]">Mahasiswa yang sudah berlangganan.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {list.map((q, i) => (
            <div key={q.n} className="card pad-d">
              <div className="flex gap-0.5 mb-4">
                {[0,1,2,3,4].map(k => <Icon.Star key={k} className="w-4 h-4 text-yel" />)}
              </div>
              <p className="text-ink/80 leading-relaxed mb-6">"{q.t}"</p>
              <div className="flex items-center gap-3 pt-4 border-t hairline">
                <div className="w-9 h-9 rounded-full bg-ink/5 flex items-center justify-center font-semibold">
                  {q.n.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-sm">{q.n}</div>
                  <div className="text-xs text-ink/55">{q.r}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── CTA ─────────────────────────────────────────────────────────────────
const CTA = ({ setRoute, tweaks = {} }) => {
  const style = tweaks.ctaStyle || "dark";
  const isInk = style === "dark";
  const isYel = style === "yellow";

  const wrapCls = isInk
    ? "bg-ink text-white rounded-[2rem] md:rounded-[2.5rem] px-8 md:px-14 py-14 md:py-20 text-center relative overflow-hidden"
    : isYel
    ? "rounded-[2rem] md:rounded-[2.5rem] px-8 md:px-14 py-14 md:py-20 text-center relative overflow-hidden text-ink"
    : "border-2 border-ink/12 rounded-[2rem] md:rounded-[2.5rem] px-8 md:px-14 py-14 md:py-20 text-center relative overflow-hidden text-ink";

  const wrapStyle = isYel ? { background: "var(--yel)" } : {};

  return (
    <section className="sec-y">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className={wrapCls} style={wrapStyle}>
          <h2 className="font-display font-bold text-4xl md:text-6xl tracking-[-0.03em] leading-[1.0] max-w-3xl mx-auto">
            Siap mengamankan<br/>
            {isInk
              ? <span style={{color:"var(--yel)"}}>nilai A</span>
              : isYel
              ? <span className="underline decoration-2 underline-offset-4">nilai A</span>
              : <span>nilai A</span>
            } pertamamu?
          </h2>
          <p className={`text-lg mt-6 max-w-xl mx-auto ${isInk ? "text-white/65" : "text-ink/65"}`}>
            Jangan tunggu sampai tertinggal materi. Bangun fondasi akademik terkuatmu mulai hari ini.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
            <button onClick={() => setRoute("belajar")} className={isInk ? "btn-yel !py-4 !px-7" : "btn-ink !py-4 !px-7"}>
              Coba Gratis <Icon.Arrow />
            </button>
          </div>
          <div className={`flex items-center justify-center gap-6 mt-7 text-sm ${isInk ? "text-white/60" : "text-ink/55"}`}>
            <div className="flex items-center gap-2"><Icon.CheckCircle className="w-4 h-4" /> Akses langsung</div>
            <div className="flex items-center gap-2"><Icon.CheckCircle className="w-4 h-4" /> Tanpa kartu kredit</div>
          </div>
        </div>
      </div>
    </section>
  );
};

window.Lobby = Lobby;
