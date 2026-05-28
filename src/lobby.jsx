// MAFIKING Lobby — minimalist with 3 hero variants

const Lobby = ({ setRoute, tweaks, currentUser, forcePublicLanding = false, isAdmin = false }) => {
  const { useState, useEffect, useCallback } = React;
  const [phase, setPhase] = useState('dev'); // 'dev' | 'login'
  const [unlockCount, setUnlockCount] = useState(0);
  const [showLanding, setShowLanding] = useState(false);

  // Ekspos fungsi ke Nav logo agar bisa trigger landing
  useEffect(() => {
    window.__mafikingShowLanding = () => setShowLanding(true);
    return () => { delete window.__mafikingShowLanding; };
  }, []);

  const advanceDevGate = useCallback(() => {
    setUnlockCount(n => {
      const next = n + 1;
      if (next >= 4) setPhase('login');
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (phase !== 'dev') return;
      if (e.key === 'Enter') advanceDevGate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advanceDevGate, phase]);

  const isRegistered = currentUser && !currentUser.display_name?.startsWith("Tamu_");
  const shouldShowLanding = forcePublicLanding || showLanding;

  useEffect(() => {
    if (isRegistered && !shouldShowLanding) {
      setRoute("belajar");
    }
  }, [isRegistered, shouldShowLanding, setRoute]);

  if (shouldShowLanding) {
    return (
      <div>
        <Landing setRoute={(r) => { setShowLanding(false); setRoute(r); }} tweaks={tweaks} isAdmin={isAdmin} />
      </div>
    );
  }

  if (isRegistered) {
    return null;
  }

  if (!currentUser) return null;
  if (phase === 'dev') return <DevScreen unlockCount={unlockCount} onUnlockAttempt={advanceDevGate} />;
  return <LoginScreen />;
};

const DevScreen = ({ unlockCount, onUnlockAttempt }) => {
  const dotsLeft = Math.max(0, 4 - unlockCount);
  return (
    <div onClick={onUnlockAttempt} style={{
      backgroundColor: '#ffffff',
      backgroundImage:
        'linear-gradient(rgba(11,19,38,0.045) 1px, transparent 1px),' +
        'linear-gradient(90deg, rgba(11,19,38,0.045) 1px, transparent 1px)',
      backgroundSize: '40px 40px',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      userSelect: 'none',
      cursor: 'pointer',
    }}>
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 24px' }}>
        <img src="/assets/logo.png" alt="Mafiking" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 24, opacity: 0.9 }} />
        <h1 style={{
          color: '#0b1326',
          fontSize: 'clamp(28px, 6vw, 52px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '0 0 12px',
          lineHeight: 1.1,
        }}>
          Under development
        </h1>
        <p style={{ color: 'rgba(11,19,38,0.4)', fontSize: 14, margin: 0 }}>
          {'· '.repeat(dotsLeft).trim() || ''}
        </p>
      </div>
    </div>
  );
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
      backgroundColor: '#ffffff',
      backgroundImage:
        'linear-gradient(rgba(11,19,38,0.045) 1px, transparent 1px),' +
        'linear-gradient(90deg, rgba(11,19,38,0.045) 1px, transparent 1px)',
      backgroundSize: '40px 40px',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      fontFamily: 'inherit',
    }}>
      {/* Card */}
      <div style={{
        background: '#ffffff',
        border: '1px solid rgba(11,19,38,0.1)',
        borderRadius: 24,
        padding: 40,
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 8px 40px rgba(11,19,38,0.08)',
        position: 'relative',
        zIndex: 10,
        margin: '0 16px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/assets/logo.png" alt="Mafiking" style={{ width: 60, height: 60, objectFit: 'contain', marginBottom: 10 }} />
          <h1 style={{ fontSize: 28, color: '#0b1326', letterSpacing: '-0.01em', fontWeight: 700, margin: 0 }}>Mafiking</h1>
          <p style={{ color: 'rgba(11,19,38,0.45)', fontSize: 13, marginTop: 6 }}>Bimbel TPB ITB</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'rgba(11,19,38,0.65)', fontWeight: 500, marginBottom: 8 }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Masukkan username"
              required
              autoFocus
              style={{
                width: '100%', padding: '13px 16px', boxSizing: 'border-box',
                background: '#f8f8f8', border: '1px solid rgba(11,19,38,0.12)',
                borderRadius: 12, color: '#0b1326', fontSize: 15, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#0b1326'}
              onBlur={e => e.target.style.borderColor = 'rgba(11,19,38,0.12)'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'rgba(11,19,38,0.65)', fontWeight: 500, marginBottom: 8 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', padding: '13px 16px', boxSizing: 'border-box',
                background: '#f8f8f8', border: '1px solid rgba(11,19,38,0.12)',
                borderRadius: 12, color: '#0b1326', fontSize: 15, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#0b1326'}
              onBlur={e => e.target.style.borderColor = 'rgba(11,19,38,0.12)'}
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
              background: loading ? 'rgba(11,19,38,0.4)' : '#0b1326',
              color: '#FFF44F', border: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.01em',
              transition: 'opacity 0.15s',
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
const Landing = ({ setRoute, tweaks, isAdmin = false }) => {
  const heroLayout = tweaks.heroLayout || "split";
  return (
    <div>
      {heroLayout === "split" && <HeroSplit setRoute={setRoute} />}
      {heroLayout === "editorial" && <HeroEditorial setRoute={setRoute} />}
      {heroLayout === "marquee" && <HeroMarquee setRoute={setRoute} />}

      <Stats tweaks={tweaks} />
      <Mapel setRoute={setRoute} />
      <UniqueFeatures setRoute={setRoute} isAdmin={isAdmin} />
      <VideoDemo />
      <Testimonials />
      <CTA setRoute={setRoute} tweaks={tweaks} />
      <Footer setRoute={setRoute} />
    </div>
  );
};

// ─── Dashboard (untuk registered user yang sudah login) ───────────────────
const Dashboard = ({ user, setRoute, tweaks }) => {
  const { useState, useEffect } = React;
  const [stats, setStats] = useState(null);
  const [correctionAttempts, setCorrectionAttempts] = useState([]);
  const [profileSummary, setProfileSummary] = useState(null);

  useEffect(() => {
    MafikingAPI.get("/api/progress/stats").then(setStats).catch(() => null);
    MafikingAPI.get("/api/correction/attempts")
      .then((attempts) => {
        const normalizedAttempts = Array.isArray(attempts) ? attempts : [];
        setCorrectionAttempts(normalizedAttempts);
        return MafikingAPI.post("/api/correction/profile-summary", { attempts: normalizedAttempts });
      })
      .then((data) => setProfileSummary(data?.summary || null))
      .catch(() => null);
  }, []);

  const hour = new Date().getHours();
  const salam = hour < 10 ? "pagi" : hour < 15 ? "siang" : hour < 18 ? "sore" : "malam";
  const firstName = (user.display_name || "Kawan").split(" ")[0];
  const level = user.level || stats?.level || 1;
  const xp = stats?.xp || user.xp || 0;
  const levelProgress = Math.min(100, xp % 100);

  const allChapters = (() => {
    const cd = window.chapterData;
    if (!cd) return [];
    return Object.entries(cd).flatMap(([mapel, chs]) => chs.map((ch) => ({ ...ch, mapel })));
  })();
  const continueChapter = allChapters.find((ch) => ch.progress > 0) || allChapters[0];

  return (
    <div className="bg-paper">
      <section className="pt-12 pb-6">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b hairline">
            <div>
              <p className="kicker mb-1.5">Dashboard</p>
              <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-none mb-3">
                Selamat {salam}, {firstName}.
              </h1>
              <p className="text-ink/65 text-sm md:text-base">Siap melanjutkan perjalanan akademismu di TPB ITB?</p>
            </div>
            {stats && (
              <div className="flex flex-wrap items-center gap-3">
                <button className="chip-streak" onClick={() => setRoute("misi")} type="button" title={`Streak ${stats.streak_days} hari`}>
                  <StreakFlame />
                  <span className="tnum">{stats.streak_days || 0}</span>
                </button>
                <div className="chip-level" title={`Level ${level} · ${xp} XP`}>
                  <span className="lvl-badge">L{level}</span>
                  <div className="lvl-bar"><div style={{ width: `${levelProgress}%` }}></div></div>
                  <span className="text-[10px] font-mono text-ink/45 tnum">{xp} XP</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {continueChapter ? (
        <section className="pb-8">
          <div className="max-w-6xl mx-auto px-6 md:px-8">
            <div 
              className="relative overflow-hidden rounded-[var(--card-radius)] p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
              style={{
                background: "linear-gradient(135deg, #0b1326 0%, #15223e 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 40px -15px rgba(11, 19, 38, 0.3)"
              }}
            >
              {/* Subtle background glow */}
              <div 
                className="absolute w-[200px] h-[200px] rounded-full blur-[80px] pointer-events-none opacity-20"
                style={{
                  top: "-50px",
                  right: "-20px",
                  background: "var(--yel)"
                }}
              />
              
              <div className="relative z-10 flex-1 min-w-0">
                <p className="text-xs uppercase tracking-widest font-semibold text-white/50 mb-2">Lanjutkan Belajar</p>
                <h2 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.025em] text-white">
                  Bab {continueChapter.num}: {continueChapter.title}
                </h2>
                <p className="text-white/70 text-sm md:text-base mt-2 flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-white/10 text-xs font-semibold uppercase">{continueChapter.mapel}</span>
                  <span>Estimasi waktu: {continueChapter.est}</span>
                </p>
                {continueChapter.progress > 0 ? (
                  <div className="flex items-center gap-3 mt-4">
                    <div className="bar flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full" 
                        style={{ 
                          width: `${Math.round((continueChapter.progress / continueChapter.total) * 100)}%`,
                          background: "var(--yel)"
                        }} 
                      />
                    </div>
                    <span className="text-xs font-mono text-white/60 shrink-0 tnum">
                      {continueChapter.progress} / {continueChapter.total} Soal Selesai ({Math.round((continueChapter.progress / continueChapter.total) * 100)}%)
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-white/50 mt-3">Kamu belum memulai bab ini. Mari raih nilai A!</p>
                )}
              </div>
              <button
                className="btn-yel shrink-0 relative z-10 !py-3 !px-6 text-sm flex items-center gap-1.5"
                onClick={() => setRoute({ route: "practice", practice: continueChapter })}
                type="button"
              >
                {continueChapter.progress > 0 ? "Lanjutkan" : "Mulai"} <Icon.Arrow className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <StudyRecap
        attempts={correctionAttempts}
        stats={stats}
        summary={profileSummary}
        user={user}
        setRoute={setRoute}
      />
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
              <Icon.CheckCircle className="w-4 h-4 text-emerald-600" /> Aktivasi langsung di landing page
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
                <div className="font-bold">Juara Internasional</div>
                <div className="text-xs text-ink/55">Olimpiade Fisika</div>
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

// ─── Logged-in recap section ───────────────────────────────────────────────
const StudyRecap = ({ attempts = [], stats, summary, user, setRoute }) => {
  const weaknesses = dashboardCollectTags(attempts, "weaknessTags", summary?.weaknesses).slice(0, 5);
  const recommendations = (summary?.recommendedQuestions || []).slice(0, 3);
  const wrongAttempts = attempts
    .filter((attempt) => attempt && (attempt.isCorrect === false || attempt.evaluation?.isCorrect === false))
    .slice(0, 3);
  const mistakeItems = wrongAttempts.length
    ? wrongAttempts.map((attempt) => ({
        title: attempt.questionText || "Jawaban canvas",
        detail: dashboardCollectTags([attempt], "weaknessTags").join(", ") || "Perlu cek ulang langkah dan alasan jawaban.",
      }))
    : weaknesses.slice(0, 3).map((tag) => ({
        title: tag,
        detail: "Muncul sebagai pola yang perlu dikurangi di koreksi terakhir.",
      }));
  const visibleMistakes = mistakeItems.length ? mistakeItems : [
    { title: "Belum ada kesalahan tercatat", detail: "Kirim satu jawaban canvas agar sistem bisa membaca pola salahmu." },
  ];
  const visibleRecommendations = recommendations.length ? recommendations : [
    "Kerjakan satu soal sedang dengan langkah lengkap di canvas.",
    "Ulangi soal terakhir, lalu bandingkan alasan tiap langkah.",
    "Pilih satu bab yang belum dimulai dan kerjakan 3 soal pertama.",
  ];
  const patternItems = weaknesses.length ? weaknesses : ["Konsistensi langkah", "Justifikasi rumus", "Kerapian substitusi"];

  const metrics = [
    { label: "Soal selesai", value: `${stats?.solvedProblems || 0}/${stats?.totalProblems || 0}`, icon: Icon.Target },
    { label: "Koreksi canvas", value: attempts.length, icon: Icon.CheckCircle },
    { label: "XP", value: user?.xp || stats?.xp || 0, icon: Icon.Bolt },
    { label: "Mastery", value: `${stats?.mastery || 0}%`, icon: Icon.Trophy },
  ];

  return (
    <section className="sec-y">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-8 gap-5">
          <div>
            <div className="kicker mb-2">Ringkasan Belajar</div>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.025em]">
              Fokus berikutnya dari hasil latihanmu.
            </h2>
          </div>
          <button onClick={() => setRoute("profile")} className="hidden md:inline-flex text-sm font-semibold items-center gap-1 hover:gap-2 transition-all">
            Lihat raport lengkap <Icon.Arrow />
          </button>
        </div>

        <div className="grid lg:grid-cols-12 gap-5">
          <article className="lg:col-span-5 card pad-d bg-white">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <div className="kicker mb-1">Recap Kesalahan</div>
                <h3 className="font-display font-bold text-2xl tracking-[-0.02em]">Yang perlu dibereskan.</h3>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center shrink-0">
                <Icon.Target className="w-5 h-5" />
              </div>
            </div>
            <div className="grid gap-3">
              {visibleMistakes.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-2xl bg-ink/[0.025] border hairline p-4">
                  <div className="text-xs font-mono text-ink/40 mb-1">0{index + 1}</div>
                  <div className="font-semibold leading-snug line-clamp-2">{item.title}</div>
                  <div className="text-sm text-ink/55 mt-1 leading-relaxed">{item.detail}</div>
                </div>
              ))}
            </div>
          </article>

          <article className="lg:col-span-4 card pad-d bg-white">
            <div className="kicker mb-1">Rekomendasi Soal</div>
            <h3 className="font-display font-bold text-2xl tracking-[-0.02em] mb-5">Latihan berikutnya.</h3>
            <ol className="grid gap-3">
              {visibleRecommendations.map((question, index) => (
                <li key={`${question}-${index}`} className="flex gap-3 rounded-2xl border hairline p-4">
                  <span className="w-7 h-7 rounded-full bg-ink text-white text-xs font-mono flex items-center justify-center shrink-0">{index + 1}</span>
                  <span className="text-sm text-ink/70 leading-relaxed">{question}</span>
                </li>
              ))}
            </ol>
            <button onClick={() => setRoute("belajar")} className="btn-ink mt-5 w-full justify-center">
              Mulai dari rekomendasi <Icon.Arrow />
            </button>
          </article>

          <article className="lg:col-span-3 card pad-d bg-ink text-white overflow-hidden relative">
            <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl opacity-30" style={{ background: "var(--yel)" }} />
            <div className="relative">
              <div className="kicker mb-1 !text-white/45">Pola Diperbaiki</div>
              <h3 className="font-display font-bold text-2xl tracking-[-0.02em] mb-5">Prioritas minggu ini.</h3>
              <div className="flex flex-wrap gap-2">
                {patternItems.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80">{tag}</span>
                ))}
              </div>
              <p className="text-sm text-white/60 leading-relaxed mt-6">
                {summary?.overallSummary || "Belum ada ringkasan koreksi. Kerjakan latihan canvas untuk membuat pola belajar yang lebih presisi."}
              </p>
            </div>
          </article>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border hairline bg-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-ink/[0.035] flex items-center justify-center shrink-0">
                <metric.icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-2xl tnum truncate">{metric.value}</div>
                <div className="text-[11px] text-ink/55 truncate">{metric.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

function dashboardCollectTags(attempts, key, fallback = []) {
  const counts = new Map();
  attempts.forEach((attempt) => {
    const tags = attempt?.[key] || attempt?.evaluation?.[key] || [];
    tags.forEach((tag) => {
      const normalized = formatDashboardLearningLabel(tag);
      if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });
  });
  const collected = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  return collected.length ? collected : (Array.isArray(fallback) ? fallback.map(formatDashboardLearningLabel) : []);
}

function formatDashboardLearningLabel(label) {
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
            <div className="flex items-center gap-2"><Icon.CheckCircle className="w-4 h-4" /> Aktivasi langsung di landing page</div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── Fitur Unggulan (compact grid) ────────────────────────────────────────

const FeatureCard = ({ title, desc, children, span = 1 }) => (
  <div
    className={`bg-white rounded-2xl border hairline overflow-hidden flex flex-col ${span === 2 ? 'md:col-span-2' : ''}`}
    style={{ boxShadow: '0 4px 24px -6px rgba(11,19,38,0.06)' }}
  >
    {/* Visual area */}
    <div className="relative overflow-hidden bg-paper border-b hairline" style={{ minHeight: 200 }}>
      {children}
    </div>
    {/* Text */}
    <div className="p-5">
      <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-ink mb-1.5">{title}</h3>
      <p className="text-ink/55 text-sm leading-relaxed">{desc}</p>
    </div>
  </div>
);

const UniqueFeatures = ({ setRoute, isAdmin = false }) => (
  <section className="sec-y bg-paper border-t border-b hairline">
    <div className="max-w-6xl mx-auto px-6 md:px-8">
      {/* Section Header */}
      <div className="text-center mb-12 max-w-3xl mx-auto">
        <span className="kicker mb-3 block">Mengapa Mafiking Berbeda?</span>
        <h2 className="font-display font-bold text-3xl md:text-5xl tracking-[-0.03em] leading-tight text-ink mb-4">
          Fitur terlengkap & terintegrasi AI
        </h2>
        <p className="text-ink/55 text-base md:text-lg leading-relaxed">
          Platform belajar pertama untuk TPB ITB yang fokus pada pembentukan intuisi dan penanganan kelemahan secara personal.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Rekomendasi */}
        <FeatureCard
          title="Rekomendasi Belajar"
          desc="AI memetakan kelemahanmu dan merekomendasikan porsi latihan yang sesuai."
        >
          <div className="p-4 h-full">
            <div className="card bg-white p-4 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
                  <Icon.Bolt className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-display font-bold text-base tracking-[-0.015em] text-ink">Rekomendasi Soal Latihan</h4>
                  <p className="text-xs text-ink/50">Berdasarkan kelemahan utama</p>
                </div>
              </div>
              {isAdmin ? (
                <div className="grid grid-cols-2 gap-2.5 flex-1">
                  {[
                    {
                      skill: "dy/dx dari x² + y² = 25",
                      action: "Turunan implisit",
                      tone: "bg-rose-50/60 border-rose-900/10"
                    },
                    {
                      skill: "∫ x eˣ dx",
                      action: "Integrasi parsial",
                      tone: "bg-amber-50/60 border-amber-900/10"
                    }
                  ].map((item, index) => (
                    <div key={item.skill} className={`rounded-xl border ${item.tone} p-3 flex flex-col justify-between min-w-0`}>
                      <div>
                        <span className="text-xs font-mono font-bold text-ink/35">#{index + 1}</span>
                        <p className="font-display font-bold text-sm text-ink leading-tight mt-1">{item.skill}</p>
                        <p className="text-xs text-ink/55 leading-snug mt-1">{item.action}</p>
                      </div>
                      <button className="btn-ink !py-1.5 !px-2.5 text-[10px] mt-3 w-full justify-center flex items-center gap-1" type="button">
                        Mulai <Icon.Arrow className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-ink/15 bg-ink/[0.02] p-4 flex-1 flex flex-col justify-center">
                  <p className="font-display font-bold text-sm text-ink">Rekomendasi muncul setelah latihan.</p>
                  <p className="text-xs text-ink/55 leading-snug mt-1">Data contoh hanya ditampilkan di mode admin.</p>
                </div>
              )}
            </div>
          </div>
        </FeatureCard>

        {/* Riwayat Kesalahan */}
        <FeatureCard
          title="Riwayat Kesalahan"
          desc="Semua soal salah terarsip otomatis. Ulangi kapan saja sampai benar."
        >
          <div className="p-4 h-full">
            <div className="card bg-white overflow-hidden h-full">
              <div className="px-4 py-3 border-b hairline flex items-center justify-between">
                <h4 className="font-display font-bold text-base text-ink">History Kesalahan Canvas</h4>
                <span className="text-xs font-semibold text-ink/45">Prioritas</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 p-3">
                {[
                  {
                    status: "Perlu Perbaikan",
                    title: "Integral Substitusi",
                    issue: "Ulangi konsep",
                    score: "45/100",
                    tone: "text-rose-600"
                  },
                  {
                    status: "Perlu Perbaikan",
                    title: "Turunan Komposisi",
                    issue: "Perkuat aturan rantai",
                    score: "60/100",
                    tone: "text-amber-600"
                  }
                ].map((item) => (
                  <div key={item.title} className="rounded-xl border border-ink/5 bg-ink/[0.02] p-3 min-w-0">
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border bg-rose-50/60 text-ink/65 border-rose-900/10">
                      {item.status}
                    </span>
                    <h5 className="font-display font-bold text-sm mt-2 text-ink leading-tight">{item.title}</h5>
                    <p className="text-xs text-ink/55 leading-snug mt-1">{item.issue}</p>
                    <div className="flex items-end justify-between gap-2 mt-3">
                      <div>
                        <span className="text-[9px] text-ink/40 block uppercase font-bold">Skor</span>
                        <span className={`font-display font-bold text-base ${item.tone}`}>{item.score}</span>
                      </div>
                      <button className="btn-ghost !py-1.5 !px-2.5 text-[10px]" type="button">Ulangi</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FeatureCard>

        {/* Tryout */}
        <FeatureCard
          title="Simulasi Tryout CBT"
          desc="Tryout berwaktu yang menyimulasikan UTS/UAS TPB ITB dengan evaluasi instan."
        >
          <div className="flex flex-col h-full">
            <div className="bg-ink text-white px-3 py-1.5 flex items-center justify-between text-[9px] font-mono">
              <span>Tryout UTS Kalkulus 1A</span>
              <span className="text-yel font-bold flex items-center gap-1">
                <Icon.Clock className="w-3 h-3"/>
                01:24:12
              </span>
            </div>
            <div className="flex-1 grid grid-cols-12 gap-0">
              <div className="col-span-8 p-3 flex flex-col justify-between border-r border-ink/5">
                <div className="space-y-1.5">
                  <div className="text-[8px] font-mono font-bold text-ink/35">SOAL 6 / 15</div>
                  <div className="text-[11px] font-semibold text-ink">Tentukan nilai dari limit:</div>
                  <div className="font-serif italic text-[11px] text-center bg-white py-1.5 rounded border border-ink/5">
                    lim (x → 0) [ sin(2x) / x ]
                  </div>
                  <div className="space-y-1">
                    <div className="border border-ink/10 rounded p-1 text-[9px] flex items-center gap-1"><span className="w-3 h-3 rounded-full border border-ink/15 flex items-center justify-center text-[7px]">A</span>0</div>
                    <div className="border border-ink/10 rounded p-1 text-[9px] flex items-center gap-1"><span className="w-3 h-3 rounded-full border border-ink/15 flex items-center justify-center text-[7px]">B</span>1</div>
                    <div className="border border-ink bg-yel/10 rounded p-1 text-[9px] font-bold flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-ink text-yel flex items-center justify-center text-[7px]">C</span>2</div>
                  </div>
                </div>
              </div>
              <div className="col-span-4 p-2 bg-paper flex flex-col justify-between">
                <div>
                  <div className="text-[7px] font-bold text-ink/35 uppercase font-mono mb-1">CBT</div>
                  <div className="grid grid-cols-3 gap-0.5">
                    {[
                      {n:1,c:'bg-emerald-600 text-white'},{n:2,c:'bg-emerald-600 text-white'},{n:3,c:'bg-emerald-600 text-white'},
                      {n:4,c:'bg-amber-400 text-ink'},{n:5,c:'bg-emerald-600 text-white'},{n:6,c:'bg-ink text-white'},
                      {n:7,c:'bg-white border hairline text-ink/40'},{n:8,c:'bg-white border hairline text-ink/40'},{n:9,c:'bg-white border hairline text-ink/40'},
                    ].map(i=><div key={i.n} className={`aspect-square rounded text-[7px] font-semibold flex items-center justify-center ${i.c}`}>{i.n}</div>)}
                  </div>
                </div>
                <button className="w-full bg-emerald-600 text-white text-[7px] font-bold py-0.5 rounded mt-1">Selesai</button>
              </div>
            </div>
          </div>
        </FeatureCard>
      </div>
    </div>
  </section>
);

const VideoDemo = () => {
  const videoRef = React.useRef(null);
  const [soundEnabled, setSoundEnabled] = React.useState(false);

  React.useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !soundEnabled;
    }
  }, [soundEnabled]);

  const toggleSound = async () => {
    const video = videoRef.current;
    if (!video) return;
    const nextEnabled = !soundEnabled;
    video.muted = !nextEnabled;
    try {
      await video.play();
      setSoundEnabled(nextEnabled);
    } catch (_) {
      video.muted = true;
      setSoundEnabled(false);
    }
  };

  return (
    <section className="sec-y text-white" style={{ backgroundColor: '#0b1326' }}>
      <div className="max-w-4xl mx-auto px-6 md:px-8 text-center">
        {/* Header */}
        <div className="mb-10">
          <span className="kicker mb-3 block text-white/45">Tonton Dulu, Baru Yakin!</span>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.025em] leading-tight text-white mb-4">
            Lihat langsung demo fitur canvas & koreksi AI
          </h2>
          <p className="text-white/60 text-sm md:text-base max-w-xl mx-auto">
            Pelajari bagaimana coretan tanganmu dianalisis, dievaluasi baris demi baris, dan diberi skor secara instan oleh kecerdasan buatan.
          </p>
        </div>

        {/* Video Player Frame */}
        <div 
          className="relative rounded-[1.25rem] overflow-hidden border border-white/5 bg-slate-950 aspect-[16/9] shadow-2xl max-w-3xl mx-auto"
        >
          <video 
            ref={videoRef}
            src="/assets/saas_demo_video.mp4"
            autoPlay 
            muted
            loop 
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Sound Toggle Overlay Button */}
          <button 
            onClick={toggleSound}
            className="absolute top-4 left-4 bg-white/90 hover:bg-white text-ink font-bold text-xs py-1.5 px-3 rounded-full shadow-lg flex items-center gap-1.5 z-10 transition-colors"
            type="button"
            aria-label={soundEnabled ? "Matikan suara demo" : "Nyalakan suara demo"}
          >
            {soundEnabled ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            )}
            <span className="font-mono text-[10px]">{soundEnabled ? "SOUND ON" : "SOUND OFF"}</span>
          </button>
        </div>

        {/* Quick process layout below the video */}
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 mt-12 text-sm text-white/50">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-yel">1</span>
            <span>Tulis penyelesaian bebas</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-yel">2</span>
            <span>AI koreksi per baris secara instan</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-yel">3</span>
            <span>Rekomendasi materi otomatis</span>
          </div>
        </div>
      </div>
    </section>
  );
};

window.Lobby = Lobby;
