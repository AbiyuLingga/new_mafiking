// Shared utilities, icons, nav, footer — MAFIKING minimalist

const { useState, useEffect, useRef, useMemo } = React;

// ─── Icons (line, minimal) ────────────────────────────────────────────────
const Icon = {
  Arrow: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  ArrowUp: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  ),
  Plus: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Check: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
  CheckCircle: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>
    </svg>
  ),
  Lock: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  Flame: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A4.5 4.5 0 0 0 12 22a7 7 0 0 0 7-7c0-4-3-7-5-10-.5 2.5-2 4-4 5.5-1.5 1.1-2 2.4-1.5 4z"/>
      <path d="M11 17.5c0 1.4 1 2.5 2.3 2.5 1.5 0 2.7-1.2 2.7-2.7 0-1.6-1-2.7-2-4.1-.2 1.2-.9 2-1.9 2.8-.7.5-1.1 1-1.1 1.5z" fill="currentColor" stroke="none" opacity=".18"/>
    </svg>
  ),
  Star: ({ className = "w-4 h-4", filled = true }) => (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
      <path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 16.8 6.6 19.6l1-6L3.3 9.4l6-.9L12 3z" />
    </svg>
  ),
  Bolt: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>
    </svg>
  ),
  Calendar: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>
    </svg>
  ),
  Trophy: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M6 4h12v4a6 6 0 0 1-12 0V4zM4 6h2M18 6h2M9 16h6M10 20h4M12 16v4"/>
    </svg>
  ),
  Search: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>
    </svg>
  ),
  Menu: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 8h16M4 16h16"/>
    </svg>
  ),
  X: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 5l14 14M19 5L5 19"/>
    </svg>
  ),
  Integral: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M16 5a2.5 2.5 0 0 0-5 0v14a2.5 2.5 0 0 1-5 0"/>
    </svg>
  ),
  Atom: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
      <ellipse cx="12" cy="12" rx="9" ry="3.5"/>
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)"/>
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)"/>
    </svg>
  ),
  Flask: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round">
      <path d="M9 3h6M10 3v6L5 19a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V3"/>
      <path d="M8 14h8"/>
    </svg>
  ),
  ChevR: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M9 6l6 6-6 6"/>
    </svg>
  ),
  ChevL: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M15 6l-6 6 6 6"/>
    </svg>
  ),
  ChevD: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 9l6 6 6-6"/>
    </svg>
  ),
  User: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
    </svg>
  ),
  Sparkles: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
      <path d="M19 14l.7 2.1L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-.9L19 14z" opacity=".5"/>
    </svg>
  ),
  Bulb: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6"/>
      <path d="M10 22h4"/>
      <path d="M8.6 14.6A6 6 0 1 1 15.4 14.6c-.8.6-1.4 1.5-1.4 2.4h-4c0-.9-.6-1.8-1.4-2.4z"/>
      <path d="M12 2v1"/>
    </svg>
  ),
  Target: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    </svg>
  ),
  Clock: ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
  ),
};

// ─── Constants ────────────────────────────────────────────────────────────
const MAPEL_META = {
  Matematika: { code: "MAT", icon: Icon.Integral, color: "amber" },
  Fisika: { code: "FIS", icon: Icon.Atom, color: "blue" },
  Kimia: { code: "KIM", icon: Icon.Flask, color: "emerald" },
};

const pad2 = (n) => String(n).padStart(2, "0");

// ─── Logo lockup ──────────────────────────────────────────────────────────
const Logo = ({ size = 32, inverted = false }) => (
  <div className="flex items-center gap-2.5">
    <img
      src="assets/logo.png"
      alt="MAFIKING"
      style={{ height: size, width: "auto", filter: inverted ? "invert(1) brightness(2)" : "none" }}
      className="object-contain"
    />
    <span className="font-display font-bold tracking-[-0.03em]" style={{ fontSize: size * 0.55 }}>
      MAFIKING
    </span>
  </div>
);

const StreakFlame = ({ className = "" }) => (
  <img
    src="/assets/flame.png"
    alt=""
    aria-hidden="true"
    className={`streak-flame-img${className ? ` ${className}` : ""}`}
  />
);

// ─── Top Nav ──────────────────────────────────────────────────────────────
const Nav = ({ route, setRoute, navStyle = "ghost", gamified = false, isLoggedIn = false, isAdminMode = false, onLogoClick, onAdminPanelOpen }) => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { id: "lobby", label: "Beranda" },
    { id: "belajar", label: "Belajar" },
    { id: "misi", label: "Misi Harian" },
    { id: "tryout", label: "Tryout" },
  ];

  const isInk = navStyle === "ink";
  const isWhite = navStyle === "white";
  const showPublicCtas = !gamified && !isLoggedIn;
  const goHome = () => {
    setRoute({ route: "lobby", publicLanding: true });
  };
  const goRoute = (id) => {
    if (id === "lobby") {
      goHome();
      return;
    }
    setRoute(id);
  };

  const headerCls = isInk
    ? "bg-ink text-white border-b border-white/10"
    : isWhite
    ? "bg-white/95 backdrop-blur-sm border-b hairline"
    : scrolled
    ? "bg-white/80 backdrop-blur-md border-b hairline"
    : "bg-transparent";

  return (
    <header className={`sticky top-0 z-40 transition-all ${headerCls}`}>
      <div className="max-w-6xl mx-auto px-6 md:px-8 flex items-center justify-between h-[72px]">
        <button onClick={() => {
          if (typeof onLogoClick === 'function') {
            onLogoClick();
            return;
          }
          if (typeof window.__mafikingShowLanding === 'function') window.__mafikingShowLanding();
          else goHome();
        }} className="flex items-center">
          <Logo size={32} inverted={isInk} />
        </button>
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => {
            const active = route !== "lobby" && route === l.id;
            return (
              <button
                key={l.id}
                onClick={() => goRoute(l.id)}
                className={`relative px-4 py-2 text-[14px] font-medium rounded-full transition-colors ${
                  active
                    ? "bg-ink text-amber-300 font-semibold"
                    : isInk ? "text-white/55 hover:text-white" : "text-ink/55 hover:text-ink"
                }`}
              >
                {l.label}
              </button>
            );
          })}
          {isAdminMode && (
            <button
              onClick={onAdminPanelOpen}
              className="relative px-4 py-2 text-[14px] font-semibold rounded-full transition-colors bg-yel text-ink hover:bg-yel/80"
              type="button"
            >
              Admin Panel
            </button>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {gamified && (
            <div className="flex items-center gap-2 mr-1">
              <button onClick={() => setRoute("misi")} className="chip-streak" title="Runtunan 12 hari">
                <StreakFlame />
                <span className="tnum">12</span>
              </button>
              <div className="chip-level hidden lg:inline-flex" title="Level 4 · 60% menuju L5">
                <span className="lvl-badge">L4</span>
                <div className="lvl-bar"><div style={{ width: "60%" }}></div></div>
                <span className="text-[10px] font-mono text-ink/45 tnum hidden xl:inline">60%</span>
              </div>
            </div>
          )}
          {showPublicCtas && <button onClick={() => setRoute("profile")} className={`hidden md:inline-flex text-sm font-semibold px-4 py-2 ${isInk ? "text-white/70 hover:text-white" : "text-ink/70 hover:text-ink"}`}>Masuk</button>}
          {showPublicCtas && (
            <button onClick={() => setRoute("belajar")} className={isInk ? "btn-yel !py-2.5 !px-5 text-sm" : "btn-ink !py-2.5 !px-5 text-sm"}>
              Coba Gratis
            </button>
          )}
          {gamified && (
            <button aria-label="Buka profil" onClick={() => setRoute("profile")} type="button" className={`w-9 h-9 inline-flex items-center justify-center rounded-full border hairline ${isInk ? "text-white hover:bg-white/10" : "hover:bg-ink/5"}`}>
              <Icon.User className="w-4 h-4" />
            </button>
          )}
          <button aria-label={menuOpen ? "Tutup menu" : "Buka menu"} aria-expanded={menuOpen} className={`md:hidden ml-1 w-10 h-10 inline-flex items-center justify-center rounded-full ${isInk ? "hover:bg-white/10 text-white" : "hover:bg-ink/5"}`} onClick={() => setMenuOpen(!menuOpen)} type="button">
            {menuOpen ? <Icon.X /> : <Icon.Menu />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className={`md:hidden border-t p-4 flex flex-col gap-1 ${isInk ? "bg-ink border-white/10" : "bg-white hairline"}`}>
          {links.map(l => (
            <button key={l.id} onClick={() => { goRoute(l.id); setMenuOpen(false); }} className={`text-left px-4 py-3 font-semibold rounded-xl ${isInk ? "text-white hover:bg-white/10" : "hover:bg-ink/5"}`}>
              {l.label}
            </button>
          ))}
          {isAdminMode && (
            <button onClick={() => { if (typeof onAdminPanelOpen === 'function') onAdminPanelOpen(); setMenuOpen(false); }} className={`text-left px-4 py-3 font-semibold rounded-xl ${isInk ? "bg-yel text-ink" : "bg-yel text-ink"}`} type="button">
              Admin Panel
            </button>
          )}
        </div>
      )}
    </header>
  );
};

// ─── Footer ───────────────────────────────────────────────────────────────
const Footer = ({ setRoute }) => (
  <footer className="bg-ink text-white/85 mt-24">
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-16">
      <div className="grid md:grid-cols-12 gap-10 pb-10 border-b border-white/10">
        <div className="md:col-span-5">
          <Logo size={36} inverted />
          <p className="text-white/60 mt-4 max-w-md leading-relaxed">
            Bimbingan Matematika, Fisika & Kimia dasar untuk mahasiswa TPB ITB. Belajar dengan struktur, latihan adaptif, dan komunitas mentor.
          </p>
          <button onClick={() => setRoute("belajar")} className="btn-yel mt-6 text-sm !py-3">
            Mulai Gratis <Icon.Arrow className="w-4 h-4" />
          </button>
        </div>
        <div className="md:col-span-7 grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="kicker mb-3 text-white/40">Mata Pelajaran</div>
            <ul className="space-y-2.5">
              <li><button onClick={() => setRoute("belajar")} className="hover:text-yel">Matematika</button></li>
              <li><button onClick={() => setRoute("belajar")} className="hover:text-yel">Fisika</button></li>
              <li><button onClick={() => setRoute("belajar")} className="hover:text-yel">Kimia</button></li>
            </ul>
          </div>
          <div>
            <div className="kicker mb-3 text-white/40">Platform</div>
            <ul className="space-y-2.5">
              <li><button onClick={() => setRoute("misi")} className="hover:text-yel">Misi Harian</button></li>
              <li><button onClick={() => setRoute("tryout")} className="hover:text-yel">Tryout</button></li>
              <li><button className="hover:text-yel">Peringkat</button></li>
            </ul>
          </div>
          <div>
            <div className="kicker mb-3 text-white/40">Perusahaan</div>
            <ul className="space-y-2.5">
              <li><button className="hover:text-yel">Tentang</button></li>
              <li><button className="hover:text-yel">Mentor</button></li>
              <li><button className="hover:text-yel">Kontak</button></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pt-6 gap-3 text-xs text-white/40">
        <div>© 2026 Mafiking Edukasi Integrasi · Bandung, Indonesia</div>
        <div className="flex gap-5">
          <button className="hover:text-white">Privasi</button>
          <button className="hover:text-white">Syarat</button>
        </div>
      </div>
    </div>
  </footer>
);

// ─── Skeleton shimmer ────────────────────────────────────────────────────
const Skeleton = ({ className = "" }) => (
  <div className={`skeleton-shimmer rounded-lg ${className}`} aria-hidden="true" />
);

// ─── Toast system ─────────────────────────────────────────────────────────
let _toastId = 0;
const _toastListeners = [];
function _notifyToastListeners(toasts) {
  _toastListeners.forEach((fn) => fn(toasts));
}
let _toasts = [];

function showToast(message, type = "info", duration = 4000) {
  const id = ++_toastId;
  _toasts = [{ id, message, type }, ..._toasts].slice(0, 5);
  _notifyToastListeners(_toasts);
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id);
    _notifyToastListeners(_toasts);
  }, duration);
}

const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    _toastListeners.push(setToasts);
    return () => {
      const idx = _toastListeners.indexOf(setToasts);
      if (idx !== -1) _toastListeners.splice(idx, 1);
    };
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === "success" && <Icon.CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />}
          {t.type === "error" && <Icon.Target className="w-4 h-4 shrink-0 text-red-400" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Offline banner ───────────────────────────────────────────────────────
const OfflineBanner = () => {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="offline-banner" role="status">
      Tidak ada koneksi internet
    </div>
  );
};

window.Icon = Icon;
window.MAPEL_META = MAPEL_META;
window.pad2 = pad2;
window.Logo = Logo;
window.Nav = Nav;
window.Footer = Footer;
window.Skeleton = Skeleton;
window.showToast = showToast;
window.ToastContainer = ToastContainer;
window.OfflineBanner = OfflineBanner;
