// MAFIKING — App router + Tweaks integration

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
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

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
      <Nav route={route} setRoute={setRoute} navStyle={tweaks.navStyle} gamified={route === "belajar" || route === "misi"} />

      <main className="flex-1">
        <div data-screen-label={routeLabel(route)}>
          {route === "lobby" && <Lobby setRoute={setRoute} tweaks={tweaks} />}
          {route === "belajar" && <Belajar setRoute={setRoute} tweaks={tweaks} />}
          {route === "misi" && <Misi setRoute={setRoute} tweaks={tweaks} />}
          {route === "tryout" && <Tryout setRoute={setRoute} tweaks={tweaks} />}
        </div>
      </main>

      {route === "lobby" && <Footer setRoute={setRoute} />}

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
                onClick={() => setRoute(id)}
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
  })[r] || r;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
