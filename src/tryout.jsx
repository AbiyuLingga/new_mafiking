// MAFIKING Tryout — minimalist

const tryoutPackages = [
  {
    id: 1,
    title: "Tryout Bundling: Semester 1",
    desc: "Evaluasi lengkap Matematika, Fisika, dan Kimia untuk persiapan UAS.",
    price: "Rp 50.000",
    originalPrice: null,
    badge: "Populer",
    duration: "180 mnt",
    questions: 90,
    features: ["3 Mata pelajaran dasar", "Sistem CBT seperti UAS", "Analisis butir soal AI", "Pembahasan video eksklusif"],
    tone: "default",
  },
  {
    id: 2,
    title: "Tryout Premium: TPB Prep",
    desc: "Simulasi TPB ITB tingkat tinggi dengan arsip soal 5 tahun terakhir.",
    price: "Rp 100.000",
    originalPrice: "Rp 150.000",
    badge: "Terlengkap",
    duration: "240 mnt",
    questions: 120,
    features: ["Prediksi akurasi tinggi", "Konsultasi Zoom mentor", "Skoring adaptif IRT", "Sertifikat pencapaian"],
    tone: "feature",
  },
  {
    id: 3,
    title: "Tryout Gratis: Bab 1-2",
    desc: "Coba sistem CBT kami secara gratis untuk Kalkulus Dasar.",
    price: "Gratis",
    originalPrice: null,
    badge: "Promo",
    duration: "60 mnt",
    questions: 30,
    features: ["1 mata pelajaran", "Hasil keluar instan", "Pembahasan teks dasar"],
    tone: "default",
  },
];

const Tryout = ({ setRoute }) => {
  const [tab, setTab] = useState("beli");

  return (
    <div className="bg-paper">
      {/* Header */}
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pt-12 pb-10">
          <div className="grid lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-7">
              <div className="kicker mb-2">Tryout Arena</div>
              <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
                Uji nyalimu dengan<br/>
                simulasi ujian <span className="hi-yel">berstandar kampus.</span>
              </h1>
              <p className="text-ink/65 text-lg mt-3 max-w-xl">
                Dapatkan analisis performa mendalam untuk memaksimalkan nilai UAS dan TPB.
              </p>
            </div>
            <div className="lg:col-span-5 flex lg:justify-end">
              <div className="bg-white border hairline rounded-full p-1 flex">
                <button onClick={() => setTab("beli")} className={`px-5 py-2.5 rounded-full text-sm font-semibold ${tab === "beli" ? "bg-ink text-white" : "text-ink/55 hover:text-ink"}`}>
                  Beli Tryout
                </button>
                <button onClick={() => setTab("milikku")} className={`px-5 py-2.5 rounded-full text-sm font-semibold ${tab === "milikku" ? "bg-ink text-white" : "text-ink/55 hover:text-ink"}`}>
                  Tryout Saya
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {tab === "beli" && (
        <section>
          <div className="max-w-6xl mx-auto px-6 md:px-8 pb-10">
            <div className="grid md:grid-cols-3 gap-5">
              {tryoutPackages.map(pkg => <PackageCard key={pkg.id} pkg={pkg} setRoute={setRoute} />)}
            </div>
          </div>
        </section>
      )}

      {tab === "milikku" && (
        <section>
          <div className="max-w-6xl mx-auto px-6 md:px-8 pb-10">
            <div className="bg-ink text-white rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 mb-5">
              <div>
                <span className="tag-yel tag mb-3">Aktif</span>
                <h3 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.02em] mt-2">Tryout Gratis: Kalkulus</h3>
                <p className="text-white/65 mt-1.5">Sisa waktu: 6 hari 14 jam</p>
                <div className="grid grid-cols-4 gap-5 mt-6 pt-5 border-t border-white/15">
                  <div><div className="text-xs text-white/55">Soal</div><div className="font-display font-bold text-2xl tnum">12<span className="opacity-40">/30</span></div></div>
                  <div><div className="text-xs text-white/55">Waktu</div><div className="font-display font-bold text-2xl tnum">42'</div></div>
                  <div><div className="text-xs text-white/55">Benar</div><div className="font-display font-bold text-2xl tnum">9</div></div>
                  <div><div className="text-xs text-white/55">Prediksi</div><div className="font-display font-bold text-2xl">A−</div></div>
                </div>
              </div>
              <button onClick={() => setRoute("belajar")} className="btn-yel shrink-0">
                Lanjutkan <Icon.Arrow />
              </button>
            </div>
            <div className="text-center py-12 rounded-2xl border hairline">
              <Icon.Trophy className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-ink/60 mt-3">Belum ada tryout berbayar yang aktif.</p>
              <button onClick={() => setTab("beli")} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold hover:gap-2.5 transition-all">
                Lihat semua tryout <Icon.Arrow />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="sec-y bg-white border-t hairline">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="mb-10">
            <div className="kicker mb-2">Bagaimana Arena bekerja</div>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.025em]">Tiga langkah, satu nilai.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "01", t: "Pilih edisi", d: "Setiap tryout dirancang sebagai simulasi UAS atau TPB. Pilih sesuai jadwal ujianmu." },
              { n: "02", t: "Kerjakan CBT", d: "Antarmuka identik dengan sistem ujian kampus — termasuk timer dan navigasi soal." },
              { n: "03", t: "Analisis & bahasan", d: "Hasil dianalisis per-butir oleh AI. Setiap butir dilengkapi video pembahasan." },
            ].map(s => (
              <div key={s.n} className="flex flex-col">
                <div className="text-xs font-mono text-ink/45 mb-2">{s.n}</div>
                <h3 className="font-display font-bold text-xl mb-2">{s.t}</h3>
                <p className="text-ink/60 text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

const PackageCard = ({ pkg, setRoute }) => {
  const feature = pkg.tone === "feature";
  return (
    <article className={`rounded-3xl p-7 flex flex-col ${feature ? "bg-ink text-white" : "bg-white border hairline"}`}>
      <div className="flex items-center justify-between mb-5">
        <span className={feature ? "tag-yel tag" : "tag"}>{pkg.badge}</span>
        <Icon.Trophy className={`w-5 h-5 ${feature ? "text-yel" : "text-ink/40"}`} />
      </div>
      <h3 className="font-display font-bold text-2xl leading-tight tracking-[-0.02em]">{pkg.title}</h3>
      <p className={`text-sm leading-relaxed mt-2 ${feature ? "text-white/65" : "text-ink/60"}`}>{pkg.desc}</p>

      <div className={`grid grid-cols-2 gap-4 mt-6 pt-5 border-t ${feature ? "border-white/15" : "hairline"}`}>
        <div>
          <div className={`text-xs ${feature ? "text-white/50" : "text-ink/50"}`}>Durasi</div>
          <div className="font-display font-bold text-xl">{pkg.duration}</div>
        </div>
        <div>
          <div className={`text-xs ${feature ? "text-white/50" : "text-ink/50"}`}>Soal</div>
          <div className="font-display font-bold text-xl tnum">{pkg.questions}</div>
        </div>
      </div>

      <ul className="space-y-2.5 mt-5 mb-7 flex-1">
        {pkg.features.map(f => (
          <li key={f} className={`flex items-start gap-2 text-sm ${feature ? "text-white/85" : "text-ink/75"}`}>
            <Icon.Check className={`w-4 h-4 mt-0.5 shrink-0 ${feature ? "text-yel" : ""}`} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className={`pt-5 border-t ${feature ? "border-white/15" : "hairline"} flex items-end justify-between gap-3`}>
        <div>
          {pkg.originalPrice && <div className={`text-xs line-through ${feature ? "text-white/40" : "text-ink/40"}`}>{pkg.originalPrice}</div>}
          <div className="font-display font-bold text-3xl tracking-[-0.02em]">{pkg.price}</div>
        </div>
        <button onClick={() => setRoute("belajar")} className={feature ? "btn-yel !py-3 !px-5 text-sm" : "btn-ink !py-3 !px-5 text-sm"}>
          {pkg.price === "Gratis" ? "Mulai" : "Beli"} <Icon.Arrow className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
};

window.Tryout = Tryout;
