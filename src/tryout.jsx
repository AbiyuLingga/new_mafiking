// MAFIKING Tryout — minimalist

const BLANK_PKG = { title: '', description: '', price: 'Gratis', original_price: '', badge: '', duration: '60 mnt', questions: 30, features: '', tone: 'default', sort_order: 0 };

const Tryout = ({ setRoute, isAdmin, isLoggedIn, context }) => {
  const [tab, setTab] = useState("beli");
  const [packages, setPackages] = useState([]);
  const [activePackages, setActivePackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editPkg, setEditPkg] = useState(null);
  const [inlineEdit, setInlineEdit] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!String(context?.mode || "").startsWith("free-math")) loadPackages();
  }, [context?.mode]);

  if (context?.mode === "free-math-confirm") {
    return (
      <TryoutStartConfirmation
        setRoute={setRoute}
        context={buildFreeMathTryoutPracticeContext(context)}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
      />
    );
  }

  if (context?.mode === "free-math") {
    return (
      <FreeMathTryoutExam
        setRoute={setRoute}
        context={buildFreeMathTryoutPracticeContext(context)}
      />
    );
  }

  async function loadPackages() {
    setLoading(true);
    try {
      const data = await MafikingAPI.get('/api/tryout-packages');
      setPackages(data.map(p => ({ ...p, features: parseFeatures(p.features) })));
      
      const activeData = await MafikingAPI.get('/api/payment/active-packages');
      setActivePackages(activeData || []);
    } catch (_) {}
    setLoading(false);
  }

  function hasAccess(pkg) {
    if (!pkg) return false;
    if (pkg.price === "Gratis") return true;
    return activePackages.includes(pkg.title) || 
           activePackages.some(title => ["Trial 7 Hari", "Bulanan", "Semester"].includes(title));
  }

  function parseFeatures(f) {
    if (Array.isArray(f)) return f.join('\n');
    try { const arr = JSON.parse(f); return Array.isArray(arr) ? arr.join('\n') : (f || ''); } catch (_) { return f || ''; }
  }

  async function savePkg(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const id = editPkg.id;
      const body = buildPackageBody(editPkg);
      if (id) {
        await MafikingAPI.put(`/api/admin/tryout-packages/${id}`, body);
      } else {
        await MafikingAPI.post('/api/admin/tryout-packages', body);
      }
      setEditPkg(null);
      await loadPackages();
      showToast(id ? 'Paket diperbarui.' : 'Paket ditambahkan.', 'success');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan', 'error');
    }
    setSaving(false);
  }

  function buildPackageBody(pkg, patch) {
    const source = patch ? Object.assign({}, pkg, patch) : pkg;
    const featureText = Array.isArray(source.features) ? source.features.join('\n') : String(source.features || '');
    return {
      title: source.title,
      description: source.description,
      price: source.price,
      original_price: source.original_price,
      badge: source.badge,
      duration: source.duration,
      questions: source.questions,
      features: featureText.split('\n').map(s => s.trim()).filter(Boolean),
      tone: source.tone,
      sort_order: source.sort_order,
    };
  }

  function startTryoutPackage(pkg) {
    setRoute({
      route: "practice",
      practice: buildTryoutPracticeContext(pkg),
    });
  }

  function startInlineEdit(pkg, field, rows) {
    if (!isAdmin || !pkg || !pkg.id) return;
    const raw = field === 'features'
      ? (Array.isArray(pkg.features) ? pkg.features.join('\n') : String(pkg.features || ''))
      : String(pkg[field] == null ? '' : pkg[field]);
    setInlineEdit({
      id: pkg.id,
      field,
      rows: rows || 1,
      value: raw,
    });
  }

  async function saveInlineEdit() {
    if (!inlineEdit) return;
    const pkg = packages.find(item => item.id === inlineEdit.id);
    if (!pkg) {
      setInlineEdit(null);
      return;
    }
    setSaving(true);
    try {
      const patch = {};
      patch[inlineEdit.field] = inlineEdit.value;
      await MafikingAPI.put(`/api/admin/tryout-packages/${inlineEdit.id}`, buildPackageBody(pkg, patch));
      setInlineEdit(null);
      await loadPackages();
      showToast('Paket diperbarui.', 'success');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan', 'error');
    }
    setSaving(false);
  }

  async function deletePkg(id) {
    if (!window.confirm('Hapus paket tryout ini?')) return;
    try {
      await MafikingAPI.del(`/api/admin/tryout-packages/${id}`);
      await loadPackages();
      showToast('Paket dihapus.', 'success');
    } catch (err) {
      showToast(err.message || 'Gagal menghapus', 'error');
    }
  }

  return (
    <div className="app-page-bg app-page-bg--paket min-h-[calc(100vh-72px)]">
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pt-12 pb-10">
          <div className="grid lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-7">
              <div className="kicker mb-2">Paket Try Out</div>
              <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
                Pilih paket belajar<br/>
                sesuai kebutuhan kamu.
              </h1>
              {isAdmin && (
                <button
                  onClick={() => setEditPkg({ ...BLANK_PKG, sort_order: packages.length + 1 })}
                  className="mt-4 admin-btn-primary flex items-center gap-2"
                  type="button"
                >
                  + Tambah Paket
                </button>
              )}
            </div>
            <div className="lg:col-span-5 flex lg:justify-end">
              <SlidingSegmented
                value={tab}
                onChange={setTab}
                options={[
                  { id: "beli", label: "Semua Paket" },
                  { id: "milikku", label: "Paket Saya" },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      {tab === "beli" && (
        <section>
          <div className="max-w-6xl mx-auto px-6 md:px-8 pb-10">
            {loading ? (
              <div className="grid md:grid-cols-3 gap-5">
                {[1,2,3].map(i => <Skeleton key={i} className="h-96 rounded-3xl" />)}
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-5">
                {packages.map(pkg => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    hasAccess={hasAccess(pkg)}
                    setRoute={setRoute}
                    isAdmin={isAdmin}
                    isLoggedIn={isLoggedIn}
                    onStartPackage={startTryoutPackage}
                    adminEdit={{ inlineEdit, saving, startInlineEdit, setInlineEdit, saveInlineEdit }}
                    onDelete={() => deletePkg(pkg.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "milikku" && (
        <section className="animate-fade-in">
          <div className="max-w-6xl mx-auto px-6 md:px-8 pb-10">
            {packages.filter(hasAccess).length > 0 ? (
              <div className="grid md:grid-cols-3 gap-5">
                {packages.filter(hasAccess).map((pkg) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    hasAccess={true}
                    setRoute={setRoute}
                    isAdmin={isAdmin}
                    isLoggedIn={isLoggedIn}
                    onStartPackage={startTryoutPackage}
                    adminEdit={{ inlineEdit, saving, startInlineEdit, setInlineEdit, saveInlineEdit }}
                    onDelete={() => deletePkg(pkg.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 rounded-2xl border hairline bg-white">
                <Icon.Trophy className="w-8 h-8 mx-auto opacity-30" />
                <p className="text-ink/60 mt-3">Belum ada paket yang aktif.</p>
                <button onClick={() => setTab("beli")} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold hover:gap-2.5 transition-all">Lihat semua paket <Icon.Arrow /></button>
              </div>
            )}
          </div>
        </section>
      )}

      {editPkg && (
        <TryoutEditModal
          pkg={editPkg}
          saving={saving}
          onChange={patch => setEditPkg(prev => ({ ...prev, ...patch }))}
          onSave={savePkg}
          onClose={() => setEditPkg(null)}
        />
      )}
    </div>
  );
};

const TryoutStartConfirmation = ({ setRoute, context, isLoggedIn = false, isAdmin = false }) => {
  const totalQuestions = Number(context?.total || context?.problemLimit || 15);
  const timeLimitSeconds = Number(context?.timeLimitSeconds || 15 * 60);
  const detailItems = [
    { label: "Durasi", value: context?.est || formatTryoutMinutes(timeLimitSeconds), icon: Icon.Clock },
    { label: "Jumlah soal", value: `${totalQuestions} soal`, icon: Icon.Target },
    { label: "Mapel", value: context?.mapel || "Matematika", icon: Icon.Integral },
    { label: "Status", value: context?.freeTryout ? "Gratis" : "Paket aktif", icon: Icon.CheckCircle },
  ];

  function startExam() {
    if (!isLoggedIn && !isAdmin) {
      setRoute({
        route: "lobby",
        authMode: "login",
        authRedirect: { route: "tryout", tryout: context },
      });
      return;
    }
    setRoute({
      route: "tryout",
      tryout: {
        ...context,
        mode: "free-math",
      },
    });
  }

  return (
    <div className="app-page-bg app-page-bg--paket min-h-[calc(100vh-72px)]">
      <section className="max-w-5xl mx-auto px-6 md:px-8 py-12 md:py-16">
        <button
          className="inline-flex items-center gap-2 text-sm font-bold text-ink/60 hover:text-ink transition-colors mb-6"
          onClick={() => setRoute({ route: "belajar", section: "Try Out" })}
          type="button"
        >
          <Icon.ChevL className="w-4 h-4" />
          Kembali ke Try Out
        </button>

        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6 items-stretch">
          <section className="bg-ink text-white rounded-[var(--card-radius)] p-7 md:p-10 relative overflow-hidden">
            <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-yel/20 blur-3xl" />
            <div className="absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
            <div className="relative z-10">
              <h1 className="font-display text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.05]">
                {context?.packageTitle || context?.title || "Tryout pre-test TPB"}
              </h1>
              <p className="mt-4 max-w-xl text-sm md:text-base leading-7 text-white/65">
                Setelah dimulai, timer berjalan otomatis. Pastikan koneksi stabil dan siapkan waktu kosong sampai sesi selesai.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={startExam} className="btn-yel !px-6 !py-3 text-sm" type="button">
                  Mulai Tryout
                  <Icon.Arrow className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRoute({ route: "belajar", section: "Try Out" })}
                  className="btn-ghost !border-white/15 !text-white hover:!bg-white/10"
                  type="button"
                >
                  Batal
                </button>
              </div>
            </div>
          </section>

          <aside className="bg-white border hairline rounded-[var(--card-radius)] p-6 md:p-7">
            <h2 className="font-display text-xl font-bold tracking-tight">Detail sesi</h2>
            <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              {detailItems.map((item) => {
                const DetailIcon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 px-1 py-1">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center text-ink">
                      <DetailIcon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-mono font-bold uppercase tracking-widest text-ink/40">{item.label}</span>
                      <span className="block text-sm font-bold text-ink">{item.value}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 rounded-xl bg-yel/35 border border-yel/70 px-4 py-3 text-xs font-semibold leading-5 text-ink/70">
              Jawaban tersimpan selama sesi berjalan.
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
};

// ─── Inline admin editor ─────────────────────────────────────────────────────
const AdminEditablePackageField = ({ pkg, field, rows, isAdmin, adminEdit, children, className }) => {
  if (!isAdmin || !adminEdit) return children;
  const editing = adminEdit.inlineEdit && adminEdit.inlineEdit.id === pkg.id && adminEdit.inlineEdit.field === field;
  if (editing) {
    const setValue = (value) => adminEdit.setInlineEdit(prev => Object.assign({}, prev, { value }));
    return (
      <div className="admin-inline-edit">
        {rows && rows > 1 ? (
          <textarea
            className="admin-inline-textarea"
            rows={rows}
            value={adminEdit.inlineEdit.value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') adminEdit.setInlineEdit(null); }}
            autoFocus
          />
        ) : (
          <input
            className="admin-inline-input"
            value={adminEdit.inlineEdit.value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') adminEdit.setInlineEdit(null);
              if (e.key === 'Enter') adminEdit.saveInlineEdit();
            }}
            autoFocus
          />
        )}
        <div className="admin-inline-actions">
          <button onClick={() => adminEdit.setInlineEdit(null)} className="admin-btn-ghost" type="button">Batal</button>
          <button onClick={adminEdit.saveInlineEdit} disabled={adminEdit.saving} className="admin-btn-primary" type="button">
            {adminEdit.saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`admin-question-editable${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        adminEdit.startInlineEdit(pkg, field, rows || 1);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') adminEdit.startInlineEdit(pkg, field, rows || 1);
      }}
      role="button"
      tabIndex={0}
    >
      {children}
      <span className="admin-question-edit-hint">Klik untuk edit</span>
    </div>
  );
};

// ─── Package card ─────────────────────────────────────────────────────────────
const PackageCard = ({ pkg, setRoute, isAdmin, isLoggedIn, adminEdit, onDelete, hasAccess, onStartPackage }) => {
  const feature = pkg.tone === "feature";
  const featureList = Array.isArray(pkg.features)
    ? pkg.features
    : (typeof pkg.features === 'string' ? pkg.features.split('\n').filter(Boolean) : []);
  const cardClass = feature
    ? "bg-ink border border-ink text-white shadow-sm"
    : "bg-white border hairline";
  const mutedTextClass = feature ? "text-white/62" : "text-ink/60";
  const subtleTextClass = feature ? "text-white/50" : "text-ink/50";
  const dividerClass = feature ? "border-white/12" : "hairline";

  return (
    <article className={`rounded-3xl p-7 flex flex-col ${cardClass}`}>
      <div className="flex items-center justify-between mb-5">
        <AdminEditablePackageField pkg={pkg} field="badge" isAdmin={isAdmin} adminEdit={adminEdit}>
          <span className={feature ? "tag-yel tag" : "tag"}>{pkg.badge}</span>
        </AdminEditablePackageField>
        <Icon.Trophy className={`w-5 h-5 ${feature ? "text-yel" : "text-ink/40"}`} />
      </div>
      <AdminEditablePackageField pkg={pkg} field="title" isAdmin={isAdmin} adminEdit={adminEdit}>
        <h3 className="font-display font-bold text-2xl leading-tight tracking-[-0.02em]">{pkg.title}</h3>
      </AdminEditablePackageField>
      <AdminEditablePackageField pkg={pkg} field="description" rows={3} isAdmin={isAdmin} adminEdit={adminEdit}>
        <p className={`text-sm leading-relaxed mt-2 ${mutedTextClass}`}>{pkg.description}</p>
      </AdminEditablePackageField>

      <div className={`grid grid-cols-2 gap-4 mt-6 pt-5 border-t ${dividerClass}`}>
        <AdminEditablePackageField pkg={pkg} field="duration" isAdmin={isAdmin} adminEdit={adminEdit}>
          <div><div className={`text-xs ${subtleTextClass}`}>Durasi</div><div className="font-display font-bold text-xl">{pkg.duration}</div></div>
        </AdminEditablePackageField>
        <AdminEditablePackageField pkg={pkg} field="questions" isAdmin={isAdmin} adminEdit={adminEdit}>
          <div><div className={`text-xs ${subtleTextClass}`}>Soal</div><div className="font-display font-bold text-xl tnum">{pkg.questions}</div></div>
        </AdminEditablePackageField>
      </div>

      <AdminEditablePackageField pkg={pkg} field="features" rows={4} isAdmin={isAdmin} adminEdit={adminEdit}>
        <ul className="space-y-2.5 mt-5 mb-7 flex-1">
          {featureList.map((f, i) => (
            <li key={i} className={`flex items-start gap-2 text-sm ${feature ? "text-white/78" : "text-ink/75"}`}>
              <Icon.Check className={`w-4 h-4 mt-0.5 shrink-0 ${feature ? "text-yel" : ""}`} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </AdminEditablePackageField>

      <div className={`pt-5 border-t ${dividerClass} flex items-end justify-between gap-3`}>
        <div>
          {pkg.original_price && (
            <AdminEditablePackageField pkg={pkg} field="original_price" isAdmin={isAdmin} adminEdit={adminEdit}>
              <div className={`text-xs line-through ${feature ? "text-white/38" : "text-ink/40"}`}>{pkg.original_price}</div>
            </AdminEditablePackageField>
          )}
          <AdminEditablePackageField pkg={pkg} field="price" isAdmin={isAdmin} adminEdit={adminEdit}>
            <div className="font-display font-bold text-3xl tracking-[-0.02em]">{pkg.price}</div>
          </AdminEditablePackageField>
        </div>
        <button
          onClick={() => {
            if (hasAccess) {
              onStartPackage(pkg);
            } else if (!isLoggedIn) {
              setRoute({
                route: "lobby",
                authMode: "login",
                authRedirect: { route: "payment", payment: { type: "tryout", package: pkg } },
              });
            } else {
              setRoute({ route: "payment", payment: { type: "tryout", package: pkg } });
            }
          }}
          className={feature ? "btn-yel !py-3 !px-5 text-sm" : "btn-ink !py-3 !px-5 text-sm"}
        >
          {hasAccess ? "Mulai" : "Beli"} <Icon.Arrow className="w-3.5 h-3.5" />
        </button>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: feature ? '1px solid rgba(255,255,255,0.12)' : '1px solid #e5e7eb' }}>
          <button onClick={onDelete} className="admin-btn-ghost" style={{ fontSize: 12, color: '#ef4444', flex: 1 }} type="button">Hapus</button>
        </div>
      )}
    </article>
  );
};

function buildTryoutPracticeContext(pkg) {
  const isFree = String(pkg?.price || "").toLowerCase() === "gratis" || String(pkg?.title || "").toLowerCase().includes("gratis");
  return {
    id: 1,
    num: 1,
    title: "Teknik Integrasi",
    mapel: "Matematika",
    semester: 1,
    est: pkg?.duration || "45 mnt",
    total: Number(pkg?.questions || 23),
    progress: 0,
    topics: [pkg?.title || "Try Out", "Integral", isFree ? "Pembahasan setelah login" : "Paket aktif"],
    freeTryout: isFree,
    packageTitle: pkg?.title || "Try Out",
  };
}

function buildFreeMathTryoutPracticeContext(context) {
  return {
    id: context?.id || "free-math-tryout-15",
    num: "TO-01",
    title: context?.title || "Try Out Matematika",
    mapel: "Matematika",
    semester: Number(context?.semester || 1),
    est: context?.est || "15 mnt",
    total: Number(context?.total || context?.problemLimit || 15),
    progress: 0,
    topics: context?.topics || ["Try Out Gratis", "Matematika"],
    freeTryout: true,
    isTryoutSession: true,
    tryoutMode: "math",
    problemLimit: Number(context?.problemLimit || 15),
    timeLimitSeconds: Number(context?.timeLimitSeconds || 15 * 60),
    disableCanvasIntro: true,
    disableCanvasMode: true,
    backRoute: { route: "belajar", section: "Try Out" },
  };
}

const FreeMathTryoutExam = ({ setRoute, context }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState([]);
  const [problemIndex, setProblemIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [doubtful, setDoubtful] = useState({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(Number(context?.timeLimitSeconds || 15 * 60));
  const [finishing, setFinishing] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const timeExpired = timeLeft <= 0;
  const totalProblems = problems.length || Number(context?.problemLimit || 15);
  const activeProblem = problems[problemIndex];
  const selectedChoiceIndex = activeProblem ? answers[activeProblem.id] : null;

  useEffect(() => { loadTryoutProblems(); }, [context?.id]);

  useEffect(() => {
    const expiresAtMs = Date.parse(sessionInfo?.expiresAt || "");
    if (Number.isFinite(expiresAtMs)) {
      setTimeLeft(Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)));
      return;
    }
    setTimeLeft(Number(sessionInfo?.timeLimitSeconds || context?.timeLimitSeconds || 15 * 60));
  }, [context?.id, context?.timeLimitSeconds, sessionInfo?.expiresAt, sessionInfo?.timeLimitSeconds]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const expiresAtMs = Date.parse(sessionInfo?.expiresAt || "");
      if (Number.isFinite(expiresAtMs)) {
        setTimeLeft(Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)));
      } else {
        setTimeLeft((current) => Math.max(0, current - 1));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [context?.id, sessionInfo?.expiresAt]);

  useEffect(() => {
    if (timeLeft === 0 && problems.length && !finishing) finishTryout();
  }, [timeLeft, problems.length, finishing]);

  async function loadTryoutProblems() {
    setLoading(true);
    setError("");
    try {
      const session = await MafikingAPI.get(`/api/quiz/tryout/free-math-session?limit=${Number(context?.problemLimit || 15)}`);
      const nextProblems = Array.isArray(session.problems) ? session.problems : [];
      setSessionInfo(session);
      setProblems(nextProblems);
      setProblemIndex(0);
      setAnswers({});
      setDoubtful({});
      setMobileNavOpen(false);
      setFinishing(false);
    } catch (caught) {
      setError(caught.message || "Gagal memuat soal tryout.");
    } finally {
      setLoading(false);
    }
  }

  function getChoices(problem) {
    if (!problem) return [];
    try {
      if (Array.isArray(problem.mc_options) && problem.mc_options.length) return problem.mc_options;
      if (typeof problem.mc_options === "string" && problem.mc_options.trim()) {
        const parsed = JSON.parse(problem.mc_options);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (_) {}
    return buildTryoutGeneratedChoices(problem, problems);
  }

  function selectChoice(choiceIndex) {
    if (!activeProblem || timeExpired) return;
    setAnswers((current) => ({ ...current, [activeProblem.id]: choiceIndex }));
  }

  function moveProblem(delta) {
    setProblemIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(problems.length - 1, 0)));
    setMobileNavOpen(false);
  }

  async function finishTryout() {
    if (finishing || !problems.length) return;
    setFinishing(true);
    try {
      const timeLimitSeconds = Number(sessionInfo?.timeLimitSeconds || context?.timeLimitSeconds || 15 * 60);
      const durationSeconds = Math.max(0, timeLimitSeconds - Math.max(0, Number(timeLeft || 0)));
      const payloadAnswers = {};
      for (const problem of problems) {
        if (answers[problem.id] != null) payloadAnswers[problem.id] = answers[problem.id];
      }
      const result = await MafikingAPI.post("/api/progress/tryout-attempts", {
        tryoutId: sessionInfo?.id || context?.id || "free-math-tryout-15",
        tryoutTitle: sessionInfo?.title || context?.packageTitle || context?.title || "Try Out Matematika",
        sessionToken: sessionInfo?.sessionToken || "",
        problemIds: problems.map((problem) => problem.id),
        answers: payloadAnswers,
        durationSeconds,
      });
      const score = result?.attempt?.score;
      showToast(score == null ? "Tryout selesai. Hasil tersimpan." : `Tryout selesai. Skor kamu ${score}.`, "success");
      setRoute({ route: "belajar", section: "Try Out" });
    } catch (caught) {
      showToast(caught.message || "Gagal menyimpan hasil tryout.", "error");
      setFinishing(false);
    }
  }

  if (loading) {
    return (
      <div className="tryout-exam-shell" aria-busy="true">
        <div className="tryout-exam-topbar">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
        <main className="tryout-exam-main">
          <section className="tryout-question-card">
            <Skeleton className="h-4 w-5/6 mb-8" />
            {[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-14 w-full rounded-2xl mb-4" />)}
          </section>
        </main>
      </div>
    );
  }

  if (error || !activeProblem) {
    return (
      <div className="tryout-exam-shell">
        <div className="tryout-exam-topbar">
          <button className="tryout-back-btn" onClick={() => setRoute({ route: "belajar", section: "Try Out" })} type="button">
            <Icon.ChevL className="w-4 h-4" />
          </button>
          <div>
            <h1>Tryout Matematika</h1>
            <p>SOAL BELUM TERSEDIA</p>
          </div>
        </div>
        <main className="tryout-exam-main">
          <section className="tryout-question-card">
            <div className="mafiking-answer-heading">{error || "Soal tryout belum tersedia."}</div>
            <button className="mafiking-primary-button mt-6" onClick={loadTryoutProblems} type="button">Muat ulang</button>
          </section>
        </main>
      </div>
    );
  }

  const choices = getChoices(activeProblem);
  const answeredCount = problems.filter((problem) => answers[problem.id] != null).length;
  const doubtfulCount = problems.filter((problem) => doubtful[problem.id]).length;
  const isLastProblem = problemIndex >= problems.length - 1;

  return (
    <div className="tryout-exam-shell">
      <header className="tryout-exam-topbar">
        <div className="tryout-title-group">
          <button className="tryout-back-btn" onClick={() => setRoute({ route: "belajar", section: "Try Out" })} type="button" aria-label="Kembali">
            <Icon.ChevL className="w-4 h-4" />
          </button>
          <div>
            <h1>{context?.packageTitle || "Tryout Bundling: Semester 1"}</h1>
            <p>SOAL {problemIndex + 1} DARI {totalProblems}</p>
          </div>
        </div>
        <div className={`tryout-timer${timeExpired ? " is-expired" : ""}`}>
          <Icon.Clock className="w-4 h-4" />
          {formatTryoutClock(timeLeft)}
        </div>
      </header>

      <div className="tryout-exam-grid">
        <main className="tryout-exam-main">
          <section className="tryout-question-card">
            {timeExpired && <div className="tryout-expired-note">Waktu tryout sudah habis.</div>}
            <div className="tryout-question-text">
              <Eq value={activeProblem.question_display || activeProblem.question_text || "Soal belum memiliki teks."} />
            </div>
            <div className="tryout-choice-list">
              {choices.map((choice, choiceIndex) => (
                <button
                  key={`${activeProblem.id}-${choiceIndex}`}
                  className={`tryout-choice${selectedChoiceIndex === choiceIndex ? " is-selected" : ""}`}
                  disabled={timeExpired}
                  onClick={() => selectChoice(choiceIndex)}
                  type="button"
                >
                  <span className="tryout-choice-letter">{String.fromCharCode(65 + choiceIndex)}</span>
                  <span className="tryout-choice-value"><Eq value={choice} /></span>
                </button>
              ))}
            </div>
          </section>
        </main>

        <aside className="tryout-side-panel" aria-label="Navigasi soal">
          <h2>Navigasi Soal</h2>
          <div className="tryout-legend">
            <span><i className="is-answered" /> Terjawab</span>
            <span><i /> Belum</span>
          </div>
          <div className="tryout-number-grid">
            {problems.map((problem, index) => {
              const isAnswered = answers[problem.id] != null;
              const isDoubtful = doubtful[problem.id];
              return (
                <button
                  key={problem.id}
                  className={[
                    "tryout-number",
                    index === problemIndex ? "is-current" : "",
                    isAnswered ? "is-answered" : "",
                    isDoubtful ? "is-doubtful" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => setProblemIndex(index)}
                  type="button"
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
          <div className="tryout-side-summary">
            <span>{answeredCount} terjawab</span>
            <span>{doubtfulCount} ragu-ragu</span>
          </div>
        </aside>
      </div>

      {mobileNavOpen && (
        <div className="tryout-mobile-question-sheet" role="dialog" aria-label="Daftar soal tryout">
          <div className="tryout-mobile-question-sheet-head">
            <div>
              <h2>Daftar Soal</h2>
              <p>{answeredCount} terjawab · {doubtfulCount} ragu-ragu</p>
            </div>
            <button className="tryout-mobile-question-close" onClick={() => setMobileNavOpen(false)} type="button" aria-label="Tutup daftar soal">
              <Icon.X className="w-4 h-4" />
            </button>
          </div>
          <div className="tryout-mobile-question-list">
            {problems.map((problem, index) => {
              const isAnswered = answers[problem.id] != null;
              const isDoubtful = doubtful[problem.id];
              return (
                <button
                  key={`mobile-${problem.id}`}
                  className={[
                    "tryout-mobile-question-item",
                    index === problemIndex ? "is-current" : "",
                    isAnswered ? "is-answered" : "",
                    isDoubtful ? "is-doubtful" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => { setProblemIndex(index); setMobileNavOpen(false); }}
                  type="button"
                >
                  <span className="tryout-mobile-question-number">{index + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <footer className="tryout-bottom-bar">
        <button className="tryout-secondary-action" disabled={problemIndex === 0} onClick={() => moveProblem(-1)} type="button">
          <Icon.ChevL className="w-4 h-4" />
          Sebelumnya
        </button>
        <button
          className={`tryout-mobile-list-action${mobileNavOpen ? " is-active" : ""}`}
          onClick={() => setMobileNavOpen((current) => !current)}
          type="button"
          aria-expanded={mobileNavOpen}
        >
          <Icon.Menu className="w-4 h-4" />
          Soal
        </button>
        <button
          className={`tryout-doubt-action${doubtful[activeProblem.id] ? " is-active" : ""}`}
          onClick={() => setDoubtful((current) => ({ ...current, [activeProblem.id]: !current[activeProblem.id] }))}
          type="button"
        >
          <TryoutFlagIcon className="w-4 h-4" />
          Ragu-ragu
        </button>
        {isLastProblem ? (
          <button className="tryout-finish-action" disabled={finishing} onClick={finishTryout} type="button">
            {finishing ? "Menyimpan" : "Selesai"}
            <Icon.Check className="w-4 h-4" />
          </button>
        ) : (
          <button className="tryout-finish-action" onClick={() => moveProblem(1)} type="button">
            Next
            <Icon.ChevR className="w-4 h-4" />
          </button>
        )}
      </footer>
    </div>
  );
};

const TryoutFlagIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 21V5" />
    <path d="M6 5h10l-1.5 4L16 13H6" />
  </svg>
);

function normalizeTryoutText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeTryoutAnswer(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^0-9a-z+\-*/=().,]/g, "");
}

function buildTryoutGeneratedChoices(problem, problems) {
  const correct = problem?.answer_display || problem?.answer_text || "";
  if (!correct) return [];
  const seen = new Set([normalizeTryoutAnswer(correct)]);
  const distractors = [];
  for (const candidate of problems || []) {
    if (!candidate || candidate.id === problem.id) continue;
    const answer = candidate.answer_display || candidate.answer_text || "";
    const normalized = normalizeTryoutAnswer(answer);
    if (!answer || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    distractors.push(answer);
  }
  const choices = [correct, ...shuffleTryoutChoices(distractors, hashTryoutValue(`${problem.id}:${correct}`)).slice(0, 4)];
  return shuffleTryoutChoices(choices.slice(0, 5), hashTryoutValue(`choice:${problem.id}:${correct}`));
}

function hashTryoutValue(value) {
  return String(value || "").split("").reduce((hash, char) => {
    return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }, 0);
}

function shuffleTryoutChoices(items, seed) {
  const shuffled = [...items];
  let state = Math.abs(seed) || 1;
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function formatTryoutClock(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatTryoutMinutes(seconds) {
  const minutes = Math.max(1, Math.round(Number(seconds || 0) / 60));
  return `${minutes} mnt`;
}

// ─── Tryout edit modal ────────────────────────────────────────────────────────
const TryoutEditModal = ({ pkg, saving, onChange, onSave, onClose }) => (
  <div className="canvas-intro-backdrop" onClick={onClose}>
    <div className="canvas-intro-dialog" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
      <button className="canvas-intro-close" onClick={onClose} type="button">×</button>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>{pkg.id ? 'Edit Paket Tryout' : 'Tambah Paket Tryout'}</h2>
      <form onSubmit={onSave} style={{ display: 'grid', gap: 10 }}>
        <label style={{ fontSize: 12 }}>Judul
          <input className="admin-inline-input" value={pkg.title} onChange={e => onChange({ title: e.target.value })} required />
        </label>
        <label style={{ fontSize: 12 }}>Deskripsi
          <textarea className="admin-inline-input" rows={2} value={pkg.description} onChange={e => onChange({ description: e.target.value })} style={{ resize: 'vertical' }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ fontSize: 12 }}>Harga
            <input className="admin-inline-input" value={pkg.price} onChange={e => onChange({ price: e.target.value })} required />
          </label>
          <label style={{ fontSize: 12 }}>Harga coret (optional)
            <input className="admin-inline-input" value={pkg.original_price || ''} onChange={e => onChange({ original_price: e.target.value })} placeholder="kosong = tidak ada" />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <label style={{ fontSize: 12 }}>Badge
            <input className="admin-inline-input" value={pkg.badge} onChange={e => onChange({ badge: e.target.value })} />
          </label>
          <label style={{ fontSize: 12 }}>Durasi
            <input className="admin-inline-input" value={pkg.duration} onChange={e => onChange({ duration: e.target.value })} />
          </label>
          <label style={{ fontSize: 12 }}>Jumlah soal
            <input className="admin-inline-input" type="number" min="0" value={pkg.questions} onChange={e => onChange({ questions: e.target.value })} />
          </label>
        </div>
        <label style={{ fontSize: 12 }}>Gaya kartu
          <select className="admin-inline-input" value={pkg.tone} onChange={e => onChange({ tone: e.target.value })}>
            <option value="default">Default (putih)</option>
            <option value="feature">Feature (gelap)</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>Fitur (satu per baris)
          <textarea className="admin-inline-input" rows={4} value={pkg.features} onChange={e => onChange({ features: e.target.value })} style={{ resize: 'vertical' }} placeholder="Fitur 1&#10;Fitur 2&#10;Fitur 3" />
        </label>
        <div className="canvas-intro-actions" style={{ marginTop: 4 }}>
          <button type="submit" disabled={saving} className="canvas-intro-primary">{saving ? 'Menyimpan…' : 'Simpan'}</button>
          <button type="button" onClick={onClose} className="canvas-intro-secondary">Batal</button>
        </div>
      </form>
    </div>
  </div>
);

window.Tryout = Tryout;
