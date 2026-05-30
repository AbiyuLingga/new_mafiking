// MAFIKING Lobby — minimalist with 3 hero variants

const Lobby = ({ setRoute, tweaks, currentUser, isAdmin = false, authMode = null, authRedirect = null, onAuthSuccess }) => {
  if (authMode) {
    return (
      <AuthScreen
        mode={authMode}
        redirect={authRedirect}
        setRoute={setRoute}
        onSuccess={onAuthSuccess}
        currentUser={currentUser}
      />
    );
  }

  return (
    <div>
      <Landing setRoute={setRoute} tweaks={tweaks} isAdmin={isAdmin} currentUser={currentUser} />
    </div>
  );
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

const AuthScreen = ({ mode = "login", redirect = null, setRoute, onSuccess, currentUser = null }) => {
  const { useState } = React;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clerkLoading, setClerkLoading] = useState(false);
  const [clerkEnabled, setClerkEnabled] = useState(false);
  const [pendingClerkUser, setPendingClerkUser] = useState(null);
  const isSignup = mode === "signup";
  const isGuestUser = currentUser && currentUser.display_name?.startsWith('Tamu_');

  React.useEffect(() => {
    let alive = true;
    if (!window.MafikingClerk || typeof window.MafikingClerk.isEnabled !== 'function') return undefined;
    window.MafikingClerk.isEnabled()
      .then((enabled) => {
        if (alive) setClerkEnabled(Boolean(enabled));
      })
      .catch(() => {
        if (alive) setClerkEnabled(false);
      });
    return () => { alive = false; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isSignup) {
        await MafikingAPI.post('/api/auth/register', {
          username,
          password,
          display_name: displayName || username,
          fakultas: '',
        });
      } else {
        await MafikingAPI.post('/api/auth/login', { username, password });
      }
      const user = await MafikingAPI.get('/api/auth/me');
      if (typeof onSuccess === 'function') onSuccess(user, redirect);
      else setRoute(redirect || { route: "belajar", section: "Try Out" });
    } catch (err) {
      setError(err.message || (isSignup ? 'Sign up gagal.' : 'Username atau password salah.'));
    } finally {
      setLoading(false);
    }
  };

  const handleClerkAuth = async () => {
    setClerkLoading(true);
    setError('');
    try {
      if (!window.MafikingClerk || typeof window.MafikingClerk.openAuth !== 'function') {
        throw new Error('Login Google belum siap dimuat.');
      }
      const user = await window.MafikingClerk.openAuth(isSignup ? 'signup' : 'login');
      if (user && user.needs_onboarding) {
        setPendingClerkUser(user);
        setDisplayName(user.suggested_display_name || user.display_name || '');
        return;
      }
      if (typeof onSuccess === 'function') onSuccess(user, redirect);
      else setRoute(redirect || { route: "belajar", section: "Try Out" });
    } catch (err) {
      setError(err.message || 'Login Google gagal.');
    } finally {
      setClerkLoading(false);
    }
  };

  const submitClerkDisplayName = async (e) => {
    e.preventDefault();
    setClerkLoading(true);
    setError('');
    try {
      const user = await MafikingAPI.post('/api/auth/clerk-onboard', {
        display_name: displayName,
        guest_user_id: isGuestUser ? currentUser.id : null,
      });
      setPendingClerkUser(null);
      if (typeof onSuccess === 'function') onSuccess(user, redirect);
      else setRoute(redirect || { route: "belajar", section: "Try Out" });
    } catch (err) {
      setError(err.message || 'Gagal menyimpan nama tampilan.');
    } finally {
      setClerkLoading(false);
    }
  };

  if (pendingClerkUser) {
    return (
      <div style={{
        backgroundColor: '#ffffff',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}>
        <form onSubmit={submitClerkDisplayName} style={{
          background: '#ffffff',
          border: '1px solid rgba(11,19,38,0.1)',
          borderRadius: 24,
          boxShadow: '0 8px 40px rgba(11,19,38,0.08)',
          margin: '0 16px',
          maxWidth: 420,
          padding: 40,
          width: '100%',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <img src="/assets/logo.png" alt="Mafiking" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 10 }} />
            <h1 style={{ color: '#0b1326', fontSize: 26, fontWeight: 800, margin: 0 }}>Pilih nama tampilan</h1>
            <p style={{ color: 'rgba(11,19,38,0.55)', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
              Nama ini yang akan muncul di akun Mafiking kamu.
            </p>
          </div>
          <label style={{ display: 'block', fontSize: 13, color: 'rgba(11,19,38,0.65)', fontWeight: 700, marginBottom: 8 }}>Nama tampilan</label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Nama kamu"
            required
            autoFocus
            style={{
              width: '100%', padding: '13px 16px', boxSizing: 'border-box',
              background: '#f8f8f8', border: '1px solid rgba(11,19,38,0.12)',
              borderRadius: 12, color: '#0b1326', fontSize: 15, outline: 'none',
            }}
          />
          {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{error}</p>}
          <button
            type="submit"
            disabled={clerkLoading}
            style={{
              width: '100%', padding: 14, marginTop: 22,
              background: clerkLoading ? 'rgba(11,19,38,0.4)' : '#0b1326',
              color: '#FFF44F', border: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 800, cursor: clerkLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {clerkLoading ? 'Menyimpan...' : 'Lanjut'}
          </button>
        </form>
      </div>
    );
  }

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
          <h1 style={{ fontSize: 28, color: '#0b1326', letterSpacing: '-0.01em', fontWeight: 700, margin: 0 }}>
            {isSignup ? 'Sign Up Mafiking' : 'Masuk Mafiking'}
          </h1>
          <p style={{ color: 'rgba(11,19,38,0.45)', fontSize: 13, marginTop: 6 }}>
            {isSignup ? 'Buat akun dulu, UI sign up khusus bisa diganti nanti.' : 'Lanjutkan progres belajarmu.'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'rgba(11,19,38,0.65)', fontWeight: 500, marginBottom: 8 }}>Nama tampilan</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Nama yang tampil di Mafiking"
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
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'rgba(11,19,38,0.65)', fontWeight: 500, marginBottom: 8 }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Masukkan username"
              required
              autoFocus={!isSignup}
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
            {loading ? (isSignup ? 'Membuat akun...' : 'Masuk...') : (isSignup ? 'Sign Up' : 'Masuk')}
          </button>
        </form>

        {clerkEnabled && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 18px' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(11,19,38,0.1)' }} />
              <span style={{ color: 'rgba(11,19,38,0.45)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>atau</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(11,19,38,0.1)' }} />
            </div>

            <button
              type="button"
              disabled={clerkLoading}
              onClick={handleClerkAuth}
              style={{
                alignItems: 'center',
                background: '#ffffff',
                border: '1px solid rgba(11,19,38,0.14)',
                borderRadius: 12,
                color: '#0b1326',
                cursor: clerkLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                fontSize: 15,
                fontWeight: 800,
                gap: 10,
                justifyContent: 'center',
                opacity: clerkLoading ? 0.65 : 1,
                padding: 14,
                width: '100%',
              }}
            >
              <span style={{ alignItems: 'center', border: '1px solid rgba(11,19,38,.08)', borderRadius: 999, display: 'inline-flex', height: 24, justifyContent: 'center', width: 24 }}>G</span>
              {clerkLoading ? 'Menunggu Google...' : (isSignup ? 'Daftar dengan Google' : 'Masuk dengan Google')}
            </button>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 18, fontSize: 13 }}>
          <button
            onClick={() => setRoute({ route: "lobby", publicLanding: true })}
            type="button"
            style={{ color: 'rgba(11,19,38,0.55)', fontWeight: 600 }}
          >
            Kembali landing
          </button>
          <button
            onClick={() => setRoute({ route: "lobby", authMode: isSignup ? "login" : "signup", authRedirect: redirect })}
            type="button"
            style={{ color: '#0b1326', fontWeight: 700 }}
          >
            {isSignup ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Landing (marketing, untuk anonymous/guest) ───────────────────────────
const LandingLegacy = ({ setRoute, tweaks, isAdmin = false, currentUser = null }) => {
  const [promoOpen, setPromoOpen] = React.useState(true);
  const isRegistered = currentUser && !currentUser.display_name?.startsWith("Tamu_");
  const startFree = () => setRoute({ route: "belajar", section: "Try Out" });
  const authRedirect = { route: "belajar", section: "Try Out" };
  const openLogin = () => setRoute({ route: "lobby", authMode: "login", authRedirect });
  const openSignup = () => setRoute({ route: "lobby", authMode: "signup", authRedirect });

  const subjectCards = [
    { title: "Matematika", desc: "Kalkulus, limit, integral, dan aljabar dengan jalur latihan yang rapi.", icon: Icon.Integral, tone: "bg-amber-50 text-amber-700 border-amber-100" },
    { title: "Fisika", desc: "Bangun intuisi mekanika dan konsep dasar tanpa loncat rumus.", icon: Icon.Atom, tone: "bg-blue-50 text-blue-700 border-blue-100" },
    { title: "Kimia", desc: "Stoikiometri, struktur atom, dan reaksi dibuat lebih terstruktur.", icon: Icon.Flask, tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  ];
  const featureCards = [
    { title: "Rekomendasi latihan", desc: "Sistem membaca pola kesalahan lalu mengarahkan latihan berikutnya.", icon: Icon.Target },
    { title: "History kesalahan canvas", desc: "Jawaban yang pernah keliru tersimpan supaya bisa diulang dengan fokus.", icon: Icon.Bulb },
    { title: "Simulasi Try Out CBT", desc: "Paket gratis tersedia lebih dulu sebelum kamu memilih paket penuh.", icon: Icon.Trophy },
  ];
  const testimonials = [
    { quote: "Materinya jadi lebih kebaca. Aku tahu harus mulai dari bab mana dulu.", name: "Alya", meta: "TPB ITB" },
    { quote: "Try out gratisnya ngebantu buat ngetes ritme sebelum beli paket.", name: "Rafi", meta: "STEI" },
    { quote: "Bagian koreksi canvas bikin kesalahan kecil jadi kelihatan jelas.", name: "Nadya", meta: "FTMD" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 md:px-10">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center" type="button">
            <Logo size={34} />
          </button>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-500 md:flex">
            <a href="#beranda" className="hover:text-slate-950">Beranda</a>
            <a href="#belajar" className="hover:text-slate-950">Belajar</a>
            <a href="#fitur" className="hover:text-slate-950">Fitur</a>
            <a href="#testimoni" className="hover:text-slate-950">Testimoni</a>
          </nav>
          <div className="flex items-center gap-3">
            {!isRegistered && (
              <button onClick={openLogin} className="hidden text-sm font-bold text-slate-500 hover:text-slate-950 md:inline-flex" type="button">
                Masuk
              </button>
            )}
            <button onClick={startFree} className="btn-ink !py-2.5 !px-5 text-sm" type="button">
              Coba Gratis <Icon.Arrow className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main id="beranda" className="pt-20">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-[0.55]" style={{
            backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,244,79,.35), transparent 28%), radial-gradient(circle at 80% 10%, rgba(59,130,246,.12), transparent 30%)"
          }} />
          <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-7xl items-center gap-12 px-6 py-16 md:px-10 lg:grid-cols-12">
            <div className="relative z-10 lg:col-span-7">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
                <Icon.Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Bimbel TPB ITB dengan struktur belajar adaptif
              </div>
              <h1 className="max-w-4xl text-[clamp(3rem,7vw,6.8rem)] font-black leading-[0.95] text-slate-950">
                Taklukkan TPB tanpa kecemasan, dengan struktur.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
                Bimbingan Matematika, Fisika, dan Kimia dasar untuk mahasiswa TPB. Mulai dari Try Out gratis, lanjut ke latihan yang lebih personal saat kamu siap.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <button onClick={startFree} className="btn-ink !py-4 !px-7" type="button">
                  Coba Gratis <Icon.Arrow />
                </button>
                <button onClick={() => setRoute("tryout")} className="btn-ghost !py-4 !px-7" type="button">
                  Lihat Paket
                </button>
              </div>
              <div className="mt-9 grid max-w-2xl grid-cols-2 gap-4 text-sm text-slate-500 md:grid-cols-4">
                {[
                  ["2.500+", "mahasiswa"],
                  ["15.000+", "latihan"],
                  ["98%", "lebih terarah"],
                  ["24/7", "akses belajar"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="font-display text-2xl font-black text-slate-950">{value}</div>
                    <div className="mt-1 text-xs font-semibold uppercase text-slate-400">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 lg:col-span-5">
              <div className="relative rounded-[2rem] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-200/70">
                <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase text-white/45">Try Out Gratis</div>
                      <div className="mt-1 text-2xl font-black">Bab 1-2 Preview</div>
                    </div>
                    <span className="rounded-full bg-yel px-3 py-1 text-xs font-black text-ink">FREE</span>
                  </div>
                  <div className="grid gap-3">
                    {["Limit dan turunan dasar", "Integral pengantar", "Pembahasan setelah login"].map((item, index) => (
                      <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/8 p-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-black text-slate-950">{index + 1}</span>
                        <span className="text-sm font-semibold text-white/80">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs font-bold uppercase text-slate-400">Fokus hari ini</div>
                    <div className="mt-2 text-lg font-black">Integral</div>
                    <div className="mt-3 h-2 rounded-full bg-slate-200"><div className="h-full w-3/5 rounded-full bg-slate-950" /></div>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <div className="text-xs font-bold uppercase text-amber-700/60">Target</div>
                    <div className="mt-2 text-lg font-black text-slate-950">45 menit</div>
                    <div className="mt-2 text-xs text-slate-500">latihan terarah</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="belajar" className="border-y border-slate-200 bg-white py-20">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <div className="mb-10 max-w-3xl">
              <p className="kicker mb-3">Area belajar</p>
              <h2 className="text-4xl font-black leading-tight md:text-5xl">Mulai dari Try Out gratis, lalu pilih fondasi yang ingin diperkuat.</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-4">
              <button onClick={startFree} className="group rounded-[1.5rem] border border-slate-900 bg-slate-950 p-6 text-left text-white transition hover:-translate-y-1" type="button">
                <Icon.Trophy className="mb-8 h-7 w-7 text-yel" />
                <h3 className="text-2xl font-black">Try Out</h3>
                <p className="mt-3 text-sm leading-6 text-white/65">Paket gratis untuk masuk ke alur latihan tanpa bayar.</p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-yel">Mulai gratis <Icon.Arrow className="w-3.5 h-3.5" /></span>
              </button>
              {subjectCards.map((item) => {
                const SubjectIcon = item.icon;
                return (
                  <button key={item.title} onClick={openLogin} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-6 text-left transition hover:-translate-y-1 hover:bg-white" type="button">
                    <div className={`mb-8 inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${item.tone}`}>
                      <SubjectIcon className="h-5 w-5" />
                    </div>
                    <h3 className="text-2xl font-black">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{item.desc}</p>
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-slate-950">Masuk untuk buka <Icon.Lock className="w-3.5 h-3.5" /></span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section id="fitur" className="py-20">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="kicker mb-3">Fitur inti</p>
                <h2 className="text-4xl font-black leading-tight md:text-5xl">Belajar lebih tenang karena langkah berikutnya jelas.</h2>
                <p className="mt-5 text-lg leading-8 text-slate-600">Fokus Mafiking bukan membuat halaman ramai, tapi membuat progres akademikmu terbaca dan bisa ditindaklanjuti.</p>
              </div>
              <div className="grid gap-4 lg:col-span-7">
                {featureCards.map((item) => {
                  const FeatureIcon = item.icon;
                  return (
                    <div key={item.title} className="rounded-[1.5rem] border border-slate-200 bg-white p-6">
                      <div className="flex gap-5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yel/70 text-ink">
                          <FeatureIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black">{item.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{item.desc}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-slate-950 py-20 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 md:px-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="kicker mb-3 text-white/45">Demo simulasi</p>
              <h2 className="text-4xl font-black leading-tight md:text-5xl">Coba alur latihan sebelum memilih paket.</h2>
              <p className="mt-5 text-lg leading-8 text-white/60">Video demo tetap memakai aset Mafiking lama sesuai catatan zip. Nanti CMS media bisa dibuat terpisah melalui Admin Panel.</p>
            </div>
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5">
              <video src="/assets/saas_demo_video.mp4" autoPlay muted loop playsInline className="aspect-video h-full w-full object-cover" />
            </div>
          </div>
        </section>

        <section id="testimoni" className="py-20">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="kicker mb-3">Testimoni</p>
                <h2 className="text-4xl font-black leading-tight md:text-5xl">Dipakai untuk belajar lebih terarah.</h2>
              </div>
              <button onClick={startFree} className="btn-ink self-start md:self-auto" type="button">Coba Gratis <Icon.Arrow /></button>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {testimonials.map((item) => (
                <div key={item.name} className="rounded-[1.5rem] border border-slate-200 bg-white p-6">
                  <div className="mb-5 flex gap-1 text-amber-400">{[0,1,2,3,4].map(i => <Icon.Star key={i} className="w-4 h-4" />)}</div>
                  <p className="text-slate-700 leading-7">"{item.quote}"</p>
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <div className="font-black">{item.name}</div>
                    <div className="text-sm text-slate-500">{item.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-20 md:px-10">
          <div className="mx-auto max-w-7xl rounded-[2rem] bg-yel p-8 text-center md:p-14">
            <h2 className="mx-auto max-w-3xl text-4xl font-black leading-tight md:text-6xl">Mulai gratis, lanjutkan saat kamu siap.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-slate-700">Try Out gratis tetap bisa dibuka. Pembahasan dan progres lengkap akan tersimpan setelah kamu masuk atau sign up.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button onClick={startFree} className="btn-ink !py-4 !px-7" type="button">Coba Gratis <Icon.Arrow /></button>
              {!isRegistered && <button onClick={openSignup} className="btn-ghost !border-ink/20 !bg-white/50 !py-4 !px-7" type="button">Sign Up</button>}
            </div>
          </div>
        </section>
      </main>

      <Footer setRoute={setRoute} />

      {promoOpen && (
        <div className="fixed bottom-5 right-5 z-50 hidden w-[320px] rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-300/50 md:block">
          <button onClick={() => setPromoOpen(false)} className="absolute right-3 top-3 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900" type="button" aria-label="Tutup promo">
            <Icon.X className="w-4 h-4" />
          </button>
          <div className="pr-8">
            <div className="text-xs font-black uppercase text-amber-600">Diskon paket aktif</div>
            <h3 className="mt-1 text-xl font-black">Diskon 50% kelas TPB</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Mulai dari Try Out gratis dulu, lalu upgrade saat butuh akses penuh.</p>
            <button onClick={() => setRoute("tryout")} className="mt-4 inline-flex items-center gap-2 text-sm font-black text-slate-950" type="button">
              Lihat Paket <Icon.Arrow className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Dashboard (untuk registered user yang sudah login) ───────────────────
const LandingFade = ({ children, delay = 0, className = "" }) => {
  const ref = React.useRef(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`landing-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

const LandingPlayIcon = ({ className = "w-10 h-10" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.4v13.2c0 .7.8 1.1 1.4.7l9.7-6.6c.5-.3.5-1.1 0-1.4L9.4 4.7C8.8 4.3 8 4.7 8 5.4z" />
  </svg>
);

const LandingUploadIcon = ({ className = "h-4 w-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V4" />
    <path d="M7 9l5-5 5 5" />
    <path d="M4 20h16" />
  </svg>
);

const LandingMediaImage = ({ src, alt }) => (
  <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover opacity-80 mix-blend-multiply" />
);

const LandingEditableMedia = ({ enabled, slot, mediaType = "image", label, onEdit, children }) => (
  <React.Fragment>
    {children}
    {enabled && (
      <button
        className="landing-edit-hotspot"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (onEdit) onEdit({ slot, mediaType, label });
        }}
        type="button"
      >
        <span className="landing-edit-pill">
          <LandingUploadIcon className="h-4 w-4" /> Ganti {mediaType === "video" ? "video" : "gambar"}
        </span>
      </button>
    )}
  </React.Fragment>
);

const LandingMediaUploadModal = ({ target, onClose, onUploaded }) => {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  if (!target) return null;

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("slot", target.slot);
      body.append("media", file);
      const response = await fetch("/api/admin/landing-media", {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Upload media gagal.");
      if (typeof showToast === "function") showToast("Media landing page diperbarui.", "success");
      if (onUploaded) onUploaded(target.slot, data);
      onClose();
    } catch (caught) {
      setError(caught.message || "Upload media gagal.");
    } finally {
      setBusy(false);
    }
  }

  return ReactDOM.createPortal((
    <div className="landing-media-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="landing-media-modal" role="dialog" aria-modal="true">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-amber-500">Landing CMS</p>
            <h2 className="text-2xl font-extrabold text-white">Upload {target.label}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              File ini langsung mengganti media landing untuk semua user.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" type="button" aria-label="Tutup upload media">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>
        <label className="landing-media-dropzone">
          <LandingUploadIcon className="h-8 w-8 text-amber-300" />
          <span className="font-bold text-white">{busy ? "Mengunggah..." : "Pilih file untuk upload"}</span>
          <span className="text-sm text-white/50">{target.mediaType === "video" ? "MP4 atau WEBM" : "JPG, PNG, WEBP, atau GIF"}</span>
          <input
            accept={target.mediaType === "video" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp,image/gif"}
            disabled={busy}
            onChange={(event) => upload(event.target.files && event.target.files[0])}
            type="file"
          />
        </label>
        {error && <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">{error}</p>}
      </div>
    </div>
  ), document.body);
};

// Landing page adapted from the Google AI Studio design in the provided zip.
const Landing = ({ setRoute, tweaks, isAdmin = false, currentUser = null }) => {
  const [promoOpen, setPromoOpen] = React.useState(true);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [landingMedia, setLandingMedia] = React.useState({});
  const [mediaEditTarget, setMediaEditTarget] = React.useState(null);
  const isRegistered = currentUser && !currentUser.display_name?.startsWith("Tamu_");
  const authRedirect = { route: "belajar", section: "Try Out" };
  const openLogin = () => setRoute({ route: "lobby", authMode: "login", authRedirect });
  const openPackages = () => setRoute("tryout");
  const startFree = () => {
    try { window.sessionStorage.setItem("mafiking:tryout-pop", "1"); } catch (_) {}
    setRoute({ route: "belajar", section: "Try Out" });
  };
  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        el.classList.remove("landing-section-pop");
        void el.offsetWidth;
        el.classList.add("landing-section-pop");
      }, 360);
    }
    setMenuOpen(false);
  };
  const mediaUrl = (slot, fallback) => (landingMedia && landingMedia[slot] && landingMedia[slot].url) || fallback;
  const updateLandingMedia = (slot, row) => setLandingMedia((prev) => ({ ...prev, [slot]: row }));

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/landing-media", { credentials: "same-origin" })
      .then((res) => res.ok ? res.json() : {})
      .then((data) => { if (!cancelled) setLandingMedia(data || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const promoImage = mediaUrl("promo_image", "https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=800&auto=format&fit=crop");
  const featureOne = mediaUrl("feature_image_1", "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop");
  const featureTwo = mediaUrl("feature_image_2", "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=1200&auto=format&fit=crop");
  const featureThree = mediaUrl("feature_image_3", "https://images.unsplash.com/photo-1501504905252-473c47e087f8?q=80&w=1600&auto=format&fit=crop");
  const demoVideo = mediaUrl("demo_video", "");

  const subjectCards = [
    { title: "Matematika", code: "MA 1101", desc: "Kalkulus, aljabar, deret tak terhingga - dari fungsi limit hingga uji konvergensi.", IconC: Icon.Integral, section: "Matematika", count: "14 bab" },
    { title: "Fisika", code: "FI 1101", desc: "Mekanika, termodinamika, listrik magnet - sesuai kaedah dahulu, namun kemaritiman.", IconC: Icon.Atom, section: "Fisika", count: "12 bab" },
    { title: "Kimia", code: "KI 1101", desc: "Wujud zat, stoikiometri - dari model Bohr hingga setara redoks.", IconC: Icon.Flask, section: "Kimia", count: "16 bab" },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-slate-200">
              {promoOpen && (
                <div className="landing-promo fixed bottom-6 right-6 z-[100] hidden w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl md:block">
          <button onClick={() => setPromoOpen(false)} className="absolute right-4 top-4 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70" type="button" aria-label="Tutup promo">
            <Icon.X className="w-4 h-4" />
          </button>
          <div className="relative flex h-32 items-center justify-center overflow-hidden bg-slate-100">
            <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#FDE047] to-amber-300 opacity-80" />
            <img src={promoImage} alt="Promo Background" className="absolute inset-0 z-10 h-full w-full object-cover opacity-30 mix-blend-multiply" />
            <LandingEditableMedia enabled={isAdmin} slot="promo_image" label="promo popup" mediaType="image" onEdit={setMediaEditTarget} />
            <div className="relative z-20 text-center">
              <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-800 shadow-sm">
                <Icon.Sparkles className="h-3 w-3 text-amber-500" /> PROMO TERBATAS
              </div>
              <h3 className="px-4 text-xl font-extrabold text-slate-900">Diskon 50% Kelas TPB!</h3>
            </div>
          </div>
          <div className="bg-white p-4 text-center">
            <p className="mb-4 text-sm font-medium text-slate-600">Amankan nilai A pertamamu sekarang.</p>
            <button onClick={openPackages} className="w-full rounded-xl bg-[#FDE047] py-2.5 text-sm font-bold text-slate-900 transition-colors hover:bg-[#FCE76B]" type="button">
              Lihat Promo
            </button>
          </div>
        </div>
      )}

      <nav className="fixed z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md transition-all">
        <div className="mx-auto w-full max-w-[1800px] px-6 md:px-12 lg:px-20">
          <div className="flex h-20 items-center justify-between">
            <button onClick={() => scrollToId("beranda")} className="flex items-center gap-2" type="button">
              <Logo size={34} />
            </button>
            <div className="hidden items-center space-x-8 md:flex">
              <button onClick={() => scrollToId("beranda")} className="font-medium text-slate-900" type="button">Beranda</button>
              <button onClick={() => scrollToId("belajar")} className="font-medium text-slate-500 transition-colors hover:text-slate-900" type="button">Belajar</button>
              <button onClick={() => scrollToId("fitur")} className="font-medium text-slate-500 transition-colors hover:text-slate-900" type="button">Fitur</button>
              <button onClick={() => scrollToId("testimoni")} className="font-medium text-slate-500 transition-colors hover:text-slate-900" type="button">Testimoni</button>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              {!isRegistered && <button onClick={openLogin} className="text-sm font-bold text-slate-500 hover:text-slate-900" type="button">Masuk</button>}
              <button onClick={startFree} className="flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3 font-bold text-white transition-all hover:bg-slate-800 active:scale-95" type="button">
                Coba Gratis <Icon.Arrow className="w-4 h-4" />
              </button>
            </div>
            <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center text-slate-900 md:hidden" type="button" aria-label={menuOpen ? "Tutup menu" : "Buka menu"} aria-expanded={menuOpen}>
              {menuOpen ? <Icon.X className="w-6 h-6" /> : <Icon.Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="landing-mobile-menu space-y-1 border-b border-slate-100 bg-white px-4 pb-4 pt-2 md:hidden">
            {[["beranda", "Beranda"], ["belajar", "Belajar"], ["fitur", "Fitur"], ["testimoni", "Testimoni"]].map(([id, label]) => (
              <button key={id} onClick={() => scrollToId(id)} className="block w-full rounded-md px-3 py-2 text-left font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900" type="button">{label}</button>
            ))}
            <button onClick={startFree} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#FDE047] px-5 py-2.5 font-bold text-slate-900 hover:bg-[#FCE76B]" type="button">
              Coba Gratis <Icon.Arrow className="w-4 h-4" />
            </button>
          </div>
        )}
      </nav>

      <main className="pb-16 pt-24">
        <section id="beranda" className="mx-auto w-full max-w-[1800px] scroll-mt-32 overflow-hidden px-6 pt-12 md:px-12 lg:px-20 lg:pb-20 lg:pt-24">
          <LandingFade>
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
              <div className="relative z-10 max-w-2xl">
                <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-bold text-slate-800 shadow-sm">
                  <Icon.Sparkles className="h-4 w-4 text-slate-600" /> Bimbel #1 untuk TPB ITB
                </div>
                <h1 className="mb-8 flex flex-col items-start gap-1 text-6xl font-extrabold leading-[1] tracking-tight md:text-7xl lg:text-[5.5rem]">
                  <span className="text-slate-900">Taklukkan TPB</span>
                  <span className="text-slate-400">tanpa</span>
                  <span className="text-slate-400">kecemasan,</span>
                  <span className="relative mt-2 inline-block"><span className="absolute bottom-1 left-0 -z-10 h-[50%] w-[105%] bg-[#FDE047]" /><span className="pr-2 text-slate-900">dengan</span></span>
                  <span className="relative mt-2 inline-block"><span className="absolute bottom-1 left-0 -z-10 h-[50%] w-[105%] bg-[#FDE047]" /><span className="pr-2 text-slate-900">struktur.</span></span>
                </h1>
                <p className="mb-10 max-w-xl text-lg leading-relaxed text-slate-600">Bimbingan Matematika, Fisika, dan Kimia dasar khusus mahasiswa ITB. Belajar dengan modul terstruktur, latihan adaptif, dan mentor IP 4.00.</p>
                <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row">
                  <button onClick={startFree} className="w-full rounded-xl bg-[#FDE047] px-8 py-4 font-bold text-slate-900 shadow-lg shadow-amber-200/50 transition-all hover:bg-[#FCE76B] active:scale-95 sm:w-auto" type="button">Coba Gratis &rarr;</button>
                  <div className="hidden font-medium text-slate-400 sm:block">atau</div>
                  <button onClick={openPackages} className="w-full rounded-xl border border-slate-200 px-8 py-4 font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95 sm:w-auto" type="button">lihat tryout &rarr;</button>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><Icon.CheckCircle className="h-4 w-4 text-green-500" /> Aktivasi langsung di landing page</div>
              </div>
              <div className="relative flex items-center justify-center lg:h-[600px]">
                <div className="relative mx-auto aspect-square w-full max-w-md lg:aspect-auto lg:h-full">
                  <div className="absolute left-1/2 top-1/2 z-0 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-50 opacity-50 blur-3xl" />
                  <div className="absolute right-0 top-10 z-20 w-48 rounded-2xl border border-slate-100 bg-white p-5 shadow-xl transition-transform duration-300 hover:-translate-y-2 lg:right-10">
                    <div className="mb-2 flex items-start justify-between"><div className="text-2xl font-extrabold text-slate-900">IP 4.00</div><Icon.Star className="h-6 w-6 text-yellow-400" /></div>
                    <div className="text-sm font-medium text-slate-500">Mentor ITB</div>
                  </div>
                  <div className="absolute bottom-10 -left-4 z-20 w-72 rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl transition-transform duration-300 hover:-translate-y-2 lg:left-0">
                    <div className="mb-4 flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50"><Icon.Trophy className="h-7 w-7 text-amber-500" /></div><div><div className="font-bold text-slate-900">Juara Internasional</div><div className="text-xs font-medium text-slate-500">Olimpiade Fisika</div></div></div>
                    <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-slate-200" /><div className="h-2 w-full rounded-full bg-slate-100" /></div>
                  </div>
                  <div className="absolute inset-x-8 bottom-20 top-32 z-10 flex flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-sm">
                    <div className="flex h-14 items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-6"><div className="h-3 w-3 rounded-full bg-slate-200" /><div className="h-3 w-3 rounded-full bg-slate-200" /><div className="h-3 w-3 rounded-full bg-slate-200" /></div>
                    <div className="flex flex-grow flex-col gap-4 p-6"><div className="h-24 w-full animate-pulse rounded-2xl border border-slate-100 bg-slate-50" /><div className="h-24 w-3/4 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" style={{ animationDelay: "150ms" }} /><div className="h-24 w-5/6 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" style={{ animationDelay: "300ms" }} /></div>
                  </div>
                </div>
              </div>
            </div>
          </LandingFade>
        </section>

        <section className="mt-8 border-y border-slate-100 bg-white py-12 lg:py-16">
          <LandingFade delay={80}>
            <div className="mx-auto w-full max-w-[1800px] px-6 md:px-12 lg:px-20">
              <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:divide-x md:divide-slate-100 md:gap-4">
                {[["2.500+", "Mahasiswa aktif"], ["15.000+", "Soal diselesaikan"], ["98%", "Tingkat kepuasan"], ["24/7", "Support mentor"]].map(([value, label]) => (
                  <div key={label} className="px-4 text-left md:text-center"><div className="mb-2 text-3xl font-extrabold text-slate-900 md:text-4xl">{value}</div><div className="text-sm font-medium text-slate-500">{label}</div></div>
                ))}
              </div>
            </div>
          </LandingFade>
        </section>

        <section id="belajar" className="mx-auto w-full max-w-[1800px] scroll-mt-24 px-6 py-24 md:px-12 lg:px-20">
          <LandingFade delay={120}>
            <div className="mb-16 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
              <div><div className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">Mata Pelajaran</div><h2 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">Tiga fondasi, <br className="hidden md:block" /> ratusan bab.</h2></div>
              <button onClick={() => setRoute({ route: "belajar", section: "Try Out" })} className="group flex items-center rounded-lg px-4 py-2 font-bold text-slate-900 transition-colors hover:bg-slate-50" type="button">Buka semua <Icon.ChevR className="ml-1 h-5 w-5 transition-transform group-hover:translate-x-1" /></button>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {subjectCards.map((item) => (
                <button key={item.title} onClick={() => setRoute({ route: "belajar", section: item.section })} className="group flex h-full flex-col rounded-[2rem] border border-slate-200 bg-white p-8 text-left transition-all hover:border-slate-300 hover:shadow-2xl hover:shadow-slate-200/50" type="button">
                  <div className="mb-12 flex items-start justify-between"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-900"><item.IconC className="h-6 w-6" /></div><div className="text-xs font-bold tracking-wider text-slate-400">{item.code}</div></div>
                  <h3 className="mb-4 text-3xl font-extrabold text-slate-900">{item.title}</h3>
                  <p className="mb-12 flex-grow font-medium leading-relaxed text-slate-600">{item.desc}</p>
                  <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-6 text-sm font-bold text-slate-900">{item.count} <Icon.Arrow className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
                </button>
              ))}
            </div>
          </LandingFade>
        </section>

        <section id="fitur" className="scroll-mt-24 border-y border-slate-200 bg-slate-50 py-24">
          <LandingFade delay={150}>
            <div className="mx-auto w-full max-w-[1800px] px-6 md:px-12 lg:px-20">
              <div className="mx-auto mb-16 max-w-3xl text-center md:mb-24"><div className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">Mengapa Mafiking Berbeda?</div><h2 className="mb-6 text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">Platform pembelajaran modern untuk mendukung kesuksesan belajar kamu</h2><p className="text-lg text-slate-600 md:text-xl">Platform belajar pertama untuk TPB ITB yang fokus pada pembentukan intuisi dan penanganan kelemahan secara personal.</p></div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="landing-card-motion flex flex-col rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"><h3 className="mb-3 text-2xl font-bold text-slate-900">Rekomendasi Latihan</h3><p className="mb-8 font-medium text-slate-500">AI mendeteksi kelemahanmu dan merekomendasikan porsi latihan yang sesuai.</p><div className="relative mt-auto aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><LandingEditableMedia enabled={isAdmin} slot="feature_image_1" label="gambar fitur 1" mediaType="image" onEdit={setMediaEditTarget}><LandingMediaImage src={featureOne} alt="Fitur rekomendasi latihan" /></LandingEditableMedia><div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><span className="rounded-xl border border-slate-100 bg-white/90 px-5 py-2.5 text-sm font-bold text-slate-800 shadow-sm backdrop-blur-sm">Tempat Gambar 1</span></div></div></div>
                <div className="landing-card-motion flex flex-col rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"><div className="mb-3 flex items-center gap-2"><h3 className="text-2xl font-bold text-slate-900">History Kesalahan Canvas</h3><span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-amber-700">Prioritas</span></div><p className="mb-8 font-medium text-slate-500">Semua coretan salah tertangkap otomatis. Ulangi di mana kamu salah, tanpa perlu mengulang dari awal.</p><div className="relative mt-auto aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><LandingEditableMedia enabled={isAdmin} slot="feature_image_2" label="gambar fitur 2" mediaType="image" onEdit={setMediaEditTarget}><LandingMediaImage src={featureTwo} alt="Fitur history kesalahan canvas" /></LandingEditableMedia><div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><span className="rounded-xl border border-slate-100 bg-white/90 px-5 py-2.5 text-sm font-bold text-slate-800 shadow-sm backdrop-blur-sm">Tempat Gambar 2</span></div></div></div>
                <div className="landing-card-motion flex flex-col items-center gap-8 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md md:flex-row lg:col-span-2"><div className="w-full md:w-1/3"><h3 className="mb-3 text-2xl font-bold text-slate-900">Simulasi Tryout CBT</h3><p className="mb-6 font-medium text-slate-500">Tampilan layar utuh yang mensimulasikan lingkungan UTS/UAS nyata. Dilengkapi timer presisi.</p><button onClick={startFree} className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-900 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50" type="button">Coba Tryout Gratis</button></div><div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 md:w-2/3 md:aspect-[21/9]"><LandingEditableMedia enabled={isAdmin} slot="feature_image_3" label="gambar fitur tryout" mediaType="image" onEdit={setMediaEditTarget}><LandingMediaImage src={featureThree} alt="Fitur simulasi tryout CBT" /></LandingEditableMedia><div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><span className="rounded-xl border border-slate-100 bg-white/90 px-5 py-2.5 text-sm font-bold text-slate-800 shadow-sm backdrop-blur-sm">Tempat Gambar 3</span></div></div></div>
              </div>
            </div>
          </LandingFade>
        </section>

        <section className="relative overflow-hidden bg-[#0B1221] py-24 text-white md:py-32">
          <LandingFade delay={170}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
            <div className="relative z-10 mx-auto w-full max-w-[1800px] px-6 md:px-12 lg:px-20">
              <div className="mb-16 text-center md:mb-20"><div className="mb-4 text-center text-sm font-bold uppercase tracking-[0.2em] text-slate-400">TONTON DULU, BARU YAKIN</div><h2 className="text-center text-3xl font-extrabold tracking-tight text-white md:text-5xl lg:text-6xl">Lihat langsung demo fitur <br className="hidden md:block" /> canvas & koreksi AI</h2></div>
              <div className="group relative mx-auto mb-16 flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900 shadow-2xl md:aspect-[21/9]">
                {demoVideo ? <video src={demoVideo} muted loop autoPlay playsInline className="h-full w-full object-cover opacity-60" /> : (
                  <div className="flex h-full w-full flex-col bg-[#0F172A] p-8 opacity-50"><div className="mb-6 flex w-full max-w-sm items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/80 px-4 py-3"><div className="flex gap-2"><div className="h-3 w-3 rounded-full bg-rose-500" /><div className="h-3 w-3 rounded-full bg-amber-500" /><div className="h-3 w-3 rounded-full bg-emerald-500" /></div><div className="font-mono text-xs text-slate-400">canvas_evaluation_ai.js</div></div><div className="flex-grow space-y-6"><div className="h-4 w-1/3 rounded-md bg-slate-800" /><div className="h-4 w-1/2 rounded-md bg-slate-800" /><div className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border border-rose-500/30 bg-slate-800/50 shadow-inner"><div className="absolute bottom-0 left-0 top-0 w-1 bg-rose-500" /><span className="font-mono text-sm text-rose-400">Error Detected: Calculation logic drift in Step 3.</span></div></div></div>
                )}
                <LandingEditableMedia enabled={isAdmin} slot="demo_video" label="video demo canvas" mediaType="video" onEdit={setMediaEditTarget} />
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/60 transition-colors duration-500 group-hover:bg-slate-900/40"><div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md transition-transform duration-300 group-hover:scale-110"><LandingPlayIcon className="ml-2 h-10 w-10 text-white" /></div></div>
              </div>
              <div className="mx-auto grid w-full grid-cols-1 gap-8 sm:grid-cols-3 md:gap-16">
                {[["1", "Tulis bebas", "Gunakan stylus atau mouse untuk menulis langkah-langkah selayaknya di kertas."], ["2", "Koreksi per baris", "AI menemukan persis di baris mana logikamu mulai meleset atau terjadi kesalahan aritmatika."], ["3", "Rekomendasi materi", "Langsung diarahkan kembali ke sub-bab modul yang relevan dengan kesalahan spesifikmu."]].map(([num, title, desc]) => (
                  <div key={num} className="text-center sm:text-left"><div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 sm:mx-0"><span className="text-xl font-bold">{num}</span></div><h4 className="mb-3 text-lg font-bold text-white">{title}</h4><p className="leading-relaxed text-slate-400">{desc}</p></div>
                ))}
              </div>
            </div>
          </LandingFade>
        </section>

        <section id="testimoni" className="mx-auto w-full max-w-[1800px] scroll-mt-24 px-6 py-24 md:px-12 lg:px-20 lg:py-32">
          <LandingFade delay={190}>
            <h2 className="mb-16 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 md:text-5xl lg:mb-24 lg:text-center lg:text-7xl">Mahasiswa yang sudah <br className="hidden lg:block" /> <span className="font-serif font-medium italic text-slate-500">berlangganan.</span></h2>
            <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
              {[["Dulu paling takut sama Kalkulus karena nggak ngerti konsep dasar limit. Di sini semua jadi visual dan terhubung. UTS dapet A.", "Budi R.", "STEI 23", "B"], ["Biasanya bimbel lain tutornya beneran cuma nyuruh hapal rumus nggak jelas. Latihannya terstruktur parah, serasa main game.", "Sarah M.", "FTMD 22", "S"], ["Fitur tracker progresnya ngebantu banget buat maintain konsistensi. Lihat streak harian langsung terpacu buat buka modul.", "Rizky D.", "FITB 23", "R"]].map(([quote, name, meta, initial]) => (
                <div key={name} className="rounded-[2rem] border border-slate-200 bg-slate-50 p-8 lg:p-10"><div className="mb-6 flex gap-1 text-amber-400">{[0,1,2,3,4].map(i => <Icon.Star key={i} className="h-5 w-5" />)}</div><p className="mb-10 text-lg font-medium leading-relaxed text-slate-700">"{quote}"</p><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-slate-200 font-bold text-slate-700">{initial}</div><div><div className="text-base font-bold text-slate-900">{name}</div><div className="text-sm font-medium text-slate-500">{meta}</div></div></div></div>
              ))}
            </div>
          </LandingFade>
        </section>
      </main>

      <footer className="w-full border-t border-slate-800 bg-[#0B1221] pb-12 pt-24">
        <LandingFade delay={210}>
          <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center px-6 text-center md:px-12 lg:px-20">
            <h2 className="mb-8 text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-7xl">Siap Mengamankan <br className="hidden md:block" /> <span className="text-[#FDE047]">Nilai A Pertamamu?</span></h2>
            <p className="mx-auto mb-12 max-w-2xl text-lg font-medium text-slate-400 lg:text-xl">Jangan tunggu sampai tertinggal materi. Bangun fondasi akademik terkuatmu hari ini juga.</p>
            <button onClick={startFree} className="mb-8 flex items-center justify-center gap-2 rounded-xl bg-[#FDE047] px-8 py-4 text-lg font-bold text-slate-900 shadow-xl shadow-amber-500/10 transition-all hover:bg-[#FCE76B] active:scale-95" type="button">Mulai Belajar Sekarang <Icon.Arrow className="ml-1 h-5 w-5" /></button>
            <div className="mb-24 flex flex-wrap items-center justify-center gap-8 text-sm font-bold uppercase tracking-wider text-slate-400"><div className="flex items-center gap-2"><Icon.CheckCircle className="h-5 w-5 text-emerald-500" /> AKSES LANGSUNG</div><div className="flex items-center gap-2"><Icon.CheckCircle className="h-5 w-5 text-emerald-500" /> TANPA KARTU KREDIT</div></div>
            <div className="mb-10 h-px w-full bg-slate-800/80" />
            <div className="flex w-full flex-col items-center justify-between gap-8 text-sm font-medium text-slate-500 lg:flex-row">
              <button onClick={() => scrollToId("beranda")} className="flex items-center gap-3" type="button"><img src="/assets/logo.png" alt="MAFIKING" className="h-8 w-auto brightness-0 invert" /><span className="text-xl font-extrabold tracking-tight text-white">MAFIKING.</span></button>
              <div className="flex flex-wrap justify-center gap-6 md:gap-8"><button onClick={() => scrollToId("belajar")} className="transition-colors hover:text-white" type="button">Tentang Kami</button><button onClick={openPackages} className="transition-colors hover:text-white" type="button">Harga</button><a className="transition-colors hover:text-white" href="https://wa.me/6281246049951" target="_blank" rel="noreferrer">WA +62 812-4604-9951</a><a className="transition-colors hover:text-white" href="https://www.instagram.com/mafiking._" target="_blank" rel="noreferrer">IG @mafiking._</a><button className="transition-colors hover:text-white" type="button">Kebijakan Privasi</button><a className="transition-colors hover:text-white" href="/syarat-ketentuan.html">Syarat &amp; Ketentuan</a></div>
              <div>&copy; 2026 Mafiking Edukasi Integrasi.</div>
            </div>
          </div>
        </LandingFade>
      </footer>
      <LandingMediaUploadModal
        target={mediaEditTarget}
        onClose={() => setMediaEditTarget(null)}
        onUploaded={updateLandingMedia}
      />
    </div>
  );
};

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
