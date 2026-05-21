// MAFIKING — App router + Tweaks integration

class ScreenErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('[ScreenErrorBoundary]', error); }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, fontFamily: 'monospace', fontSize: 13, background: '#fff8f8', border: '1px solid #fca5a5', borderRadius: 12, margin: 24, color: '#dc2626' }}>
        <strong>Render error:</strong> {this.state.error.message}
        <br /><br />
        <button onClick={() => this.setState({ error: null })} style={{ padding: '6px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace' }}>Coba lagi</button>
      </div>
    );
    return this.props.children;
  }
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "heroLayout": "split",
  "density": "normal",
  "chapterCard": "soft",
  "mapelSelector": "tabs",
  "missionCard": "mafiking1",
  "accentColor": "#FFF44F",
  "cardRadius": "default",
  "navStyle": "ghost",
  "statsStyle": "strip",
  "ctaStyle": "dark"
}/*EDITMODE-END*/;

const App = () => {
  const [route, setRoute] = React.useState("lobby");
  const [practiceContext, setPracticeContext] = React.useState(null);
  const [paymentContext, setPaymentContext] = React.useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [forcePublicLanding, setForcePublicLanding] = React.useState(false);
  const isGuest = currentUser && currentUser.display_name?.startsWith("Tamu_");
  const isLoggedIn = currentUser && !isGuest;
  const isAdminAccount = currentUser?.role === "admin";

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasOrder = params.has("merchantOrderId");

    MafikingAPI.get("/api/auth/me")
      .then((user) => {
        setCurrentUser(user);
        const isGuest = user && user.display_name?.startsWith("Tamu_");
        const isLoggedIn = user && !isGuest;
        if (isLoggedIn && !hasOrder) {
          setRoute("belajar");
        } else if (hasOrder) {
          setRoute("payment");
        }
      })
      .catch(() => {
        setCurrentUser(null);
        if (hasOrder) setRoute("payment");
      });
  }, []);

  const navigate = React.useCallback((next) => {
    if (next && typeof next === "object") {
      if (next.practice) setPracticeContext(next.practice);
      if (next.payment) setPaymentContext(next.payment);
      else setPaymentContext(null);
      setForcePublicLanding(Boolean(next.publicLanding));
      setRoute(next.route || "lobby");
      return;
    }
    setPaymentContext(null);
    setForcePublicLanding(false);
    setRoute(next);
  }, []);

  React.useEffect(() => { window.__mafikingNavigate = navigate; }, [navigate]);

  const handleLogoClick = React.useCallback(() => {
    if (isAdminAccount || isAdmin) {
      navigate({ route: "lobby", publicLanding: true });
      return;
    }
    if (typeof window.__mafikingShowLanding === 'function') window.__mafikingShowLanding();
    else navigate("lobby");
  }, [isAdminAccount, isAdmin, navigate]);

  // Density to <html>
  React.useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("density-compact", "density-spacious", "density-normal");
    html.classList.add(`density-${tweaks.density}`);
  }, [tweaks.density]);

  // Accent color to CSS variable
  React.useEffect(() => {
    document.documentElement.style.setProperty("--yel", tweaks.accentColor);
  }, [tweaks.accentColor]);

  // Card radius to <html>
  React.useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("radius-default", "radius-sharp", "radius-smooth");
    if (tweaks.cardRadius !== "default") html.classList.add(`radius-${tweaks.cardRadius}`);
  }, [tweaks.cardRadius]);

  // Scroll top on route change
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [route]);

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <OfflineBanner />
      {route !== "practice" && isLoggedIn && (
        <Nav route={route} setRoute={navigate} navStyle={tweaks.navStyle} gamified={route === "belajar" || route === "misi" || route === "profile" || route === "tryout"} isLoggedIn={isLoggedIn} onLogoClick={handleLogoClick} />
      )}

      <main className="flex-1">
        <div data-screen-label={routeLabel(route)}>
          {route === "lobby" && <Lobby setRoute={navigate} tweaks={tweaks} currentUser={currentUser} forcePublicLanding={forcePublicLanding} />}
          {route === "belajar" && <Belajar setRoute={navigate} tweaks={tweaks} isAdmin={isAdmin} />}
          {route === "misi" && <ScreenErrorBoundary><Misi setRoute={navigate} tweaks={tweaks} isAdmin={isAdmin} /></ScreenErrorBoundary>}
          {route === "tryout" && <Tryout setRoute={navigate} tweaks={tweaks} isAdmin={isAdmin} />}
          {route === "profile" && <Profile setRoute={navigate} />}
          {route === "payment" && <Payment setRoute={navigate} currentUser={currentUser} context={paymentContext} />}
          {route === "practice" && <Practice setRoute={navigate} context={practiceContext} isAdmin={isAdmin} />}
        </div>
      </main>

      <ToastContainer />

      {route !== "payment" && (
        <button
          aria-label={isAdmin ? "Keluar mode admin" : "Masuk mode admin"}
          title={isAdmin ? "Keluar mode admin" : "Masuk mode admin"}
          onClick={() => setIsAdmin((v) => !v)}
          type="button"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 8000,
            width: 44, height: 44, borderRadius: "50%",
            background: isAdmin ? "var(--yel)" : "#0b1326",
            color: isAdmin ? "#0b1326" : "#fff",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "none",
            transition: "background .2s, transform .15s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </button>
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Navigasi cepat">
          <div className="grid grid-cols-2 gap-1.5">
            {[
              ["lobby", "Beranda"],
              ["belajar", "Belajar"],
              ["misi", "Misi"],
              ["tryout", "Tryout"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => navigate(id)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border ${route === id ? "bg-ink text-white border-ink" : "bg-white border-ink/15 hover:border-ink/40"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </TweakSection>

        <TweakSection label="Tata letak">
          <TweakSelect
            label="Hero (Beranda)"
            value={tweaks.heroLayout}
            onChange={(v) => setTweak("heroLayout", v)}
            options={[
              { label: "Split (asymmetric + photo)", value: "split" },
              { label: "Editorial (tipografi penuh)", value: "editorial" },
              { label: "Marquee (judul + stat ticker)", value: "marquee" },
            ]}
          />
          <TweakRadio
            label="Densitas"
            value={tweaks.density}
            onChange={(v) => setTweak("density", v)}
            options={[
              { label: "Compact", value: "compact" },
              { label: "Normal", value: "normal" },
              { label: "Spacious", value: "spacious" },
            ]}
          />
        </TweakSection>

        <TweakSection label="Komponen (Belajar)">
          <TweakSelect
            label="Mapel selector"
            value={tweaks.mapelSelector}
            onChange={(v) => setTweak("mapelSelector", v)}
            options={[
              { label: "Sidebar (nav vertikal)", value: "sidebar" },
              { label: "Underline tabs", value: "tabs" },
              { label: "Dropdown (compact select)", value: "dropdown" },
            ]}
          />
          <TweakSelect
            label="Chapter card"
            value={tweaks.chapterCard}
            onChange={(v) => setTweak("chapterCard", v)}
            options={[
              { label: "Numbered (angka besar, editorial)", value: "numbered" },
              { label: "Soft cards (3-col grid)", value: "soft" },
              { label: "Magazine (horizontal scroll)", value: "magazine" },
            ]}
          />
        </TweakSection>

        <TweakSection label="Komponen (Misi)">
          <TweakSelect
            label="Mission card"
            value={tweaks.missionCard}
            onChange={(v) => setTweak("missionCard", v)}
            options={[
              { label: "Mafiking-latihan_1", value: "mafiking1" },
              { label: "Timeline (vertikal per hari)", value: "timeline" },
              { label: "Kanban (3 kolom status)", value: "kanban" },
              { label: "Compact (tabel 5 hari)", value: "compact" },
            ]}
          />
        </TweakSection>

        <TweakSection label="Warna & bentuk">
          <TweakColor
            label="Warna aksen"
            value={tweaks.accentColor}
            onChange={(v) => setTweak("accentColor", v)}
            options={["#FFF44F", "#FFBF00", "#A8FF3E", "#00F5D4"]}
          />
          <TweakSelect
            label="Sudut kartu"
            value={tweaks.cardRadius}
            onChange={(v) => setTweak("cardRadius", v)}
            options={[
              { label: "Bulat (default)", value: "default" },
              { label: "Tajam (corporate)", value: "sharp" },
              { label: "Halus (friendly)", value: "smooth" },
            ]}
          />
        </TweakSection>

        <TweakSection label="Navigasi & beranda">
          <TweakSelect
            label="Gaya nav"
            value={tweaks.navStyle}
            onChange={(v) => setTweak("navStyle", v)}
            options={[
              { label: "Ghost (transparan → blur)", value: "ghost" },
              { label: "Selalu putih", value: "white" },
              { label: "Selalu gelap (ink)", value: "ink" },
            ]}
          />
          <TweakSelect
            label="Stats strip"
            value={tweaks.statsStyle}
            onChange={(v) => setTweak("statsStyle", v)}
            options={[
              { label: "Strip putih (border)", value: "strip" },
              { label: "Kartu 4 kolom", value: "cards" },
              { label: "Angka besar (bold)", value: "bold" },
            ]}
          />
          <TweakSelect
            label="CTA block"
            value={tweaks.ctaStyle}
            onChange={(v) => setTweak("ctaStyle", v)}
            options={[
              { label: "Gelap (ink)", value: "dark" },
              { label: "Aksen warna", value: "yellow" },
              { label: "Outline (minimal)", value: "outline" },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
};

function routeLabel(r) {
  return ({
    lobby: "01 Beranda",
    belajar: "02 Belajar",
    misi: "03 Misi Harian",
    tryout: "04 Tryout",
    profile: "05 Profil",
    payment: "06 Pembayaran",
    practice: "07 Latihan",
  })[r] || r;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
