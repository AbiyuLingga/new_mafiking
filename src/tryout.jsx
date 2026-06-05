// MAFIKING Tryout — minimalist

const BLANK_PKG = { tryout_id: '', title: '', description: '', price: 'Gratis', original_price: '', badge: '', duration: '60 mnt', questions: 30, features: '', tone: 'default', sort_order: 0 };

const Tryout = ({ setRoute, isAdmin, isLoggedIn, context }) => {
  const mode = String(context?.mode || "");
  const [tab, setTab] = useState("beli");
  const [packages, setPackages] = useState([]);
  const [activePackages, setActivePackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editPkg, setEditPkg] = useState(null);
  const [inlineEdit, setInlineEdit] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isTryoutSessionMode(mode)) loadPackages();
  }, [mode]);

  if (mode === "tryout-review") {
    return (
      <TryoutReviewView
        setRoute={setRoute}
        context={context}
      />
    );
  }

  if (mode === "tryout-preview") {
    return (
      <TryoutPreviewView
        setRoute={setRoute}
        context={context}
      />
    );
  }

  if (mode === "free-math-confirm" || mode === "tryout-confirm") {
    return (
      <TryoutStartConfirmation
        setRoute={setRoute}
        context={buildTryoutSessionContext(context)}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
      />
    );
  }

  if (mode === "free-math" || mode === "tryout-exam") {
    return (
      <FreeMathTryoutExam
        setRoute={setRoute}
        context={buildTryoutSessionContext(context)}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
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
    if (isAdmin) return true;
    if (pkg.price === "Gratis") return true;
    if (activePackages.includes(pkg.tryout_id || pkg.tryoutId)) return true;
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
      tryout_id: source.tryout_id || source.tryoutId || '',
    };
  }

  function startTryoutPackage(pkg) {
    setRoute({
      route: "tryout",
      tryout: buildTryoutSessionContextFromPackage(pkg, "tryout-confirm"),
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
  const tryoutId = getTryoutContextId(context);
  const [historyState, setHistoryState] = useState({ loading: false, attempt: null });
  const totalQuestions = Number(context?.total || context?.problemLimit || 15);
  const timeLimitSeconds = Number(context?.timeLimitSeconds || 30 * 60);
  const mapelValue = String(context?.mapel || "").trim();
  const detailItems = [
    { label: "Durasi", value: context?.est || formatTryoutMinutes(timeLimitSeconds), icon: Icon.Clock },
    { label: "Jumlah soal", value: `${totalQuestions} soal`, icon: Icon.Target },
    ...(mapelValue ? [{ label: "Mapel", value: mapelValue, icon: Icon.Integral }] : []),
    { label: "Status", value: context?.freeTryout ? "Gratis" : "Paket aktif", icon: Icon.CheckCircle },
  ];

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn || isAdmin || !tryoutId) {
      setHistoryState({ loading: false, attempt: null });
      return () => { cancelled = true; };
    }
    setHistoryState({ loading: true, attempt: null });
    fetchLatestTryoutAttempt(tryoutId)
      .then((attempt) => {
        if (!cancelled) setHistoryState({ loading: false, attempt });
      })
      .catch(() => {
        if (!cancelled) setHistoryState({ loading: false, attempt: null });
      });
    return () => { cancelled = true; };
  }, [isLoggedIn, isAdmin, tryoutId]);

  function startExam() {
    setRoute({
      route: "tryout",
      tryout: {
        ...context,
        mode: context?.mode === "free-math-confirm" ? "free-math" : "tryout-exam",
        sessionSeed: context?.sessionSeed || createTryoutSessionSeed(tryoutId),
      },
    });
  }

  if (historyState.loading) {
    return (
      <div className="app-page-bg app-page-bg--paket min-h-[calc(100vh-72px)]">
        <section className="max-w-5xl mx-auto px-6 md:px-8 py-12 md:py-16">
          <Skeleton className="h-5 w-40 mb-6" />
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6 items-stretch">
            <Skeleton className="h-72 rounded-[var(--card-radius)]" />
            <Skeleton className="h-72 rounded-[var(--card-radius)]" />
          </div>
        </section>
      </div>
    );
  }

  if (historyState.attempt) {
    return (
      <TryoutReviewView
        setRoute={setRoute}
        context={{ ...context, mode: "tryout-review", attempt: historyState.attempt }}
      />
    );
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

function buildTryoutSessionContextFromPackage(pkg, mode = "tryout-confirm") {
  const isFree = String(pkg?.price || "").toLowerCase() === "gratis" || String(pkg?.title || "").toLowerCase().includes("gratis");
  const tryoutId = getPackageTryoutId(pkg);
  const total = Number(pkg?.questions || 0);
  const timeLimitSeconds = parseTryoutDurationSeconds(pkg?.duration, isFree ? 30 * 60 : 90 * 60);
  return {
    id: tryoutId,
    tryout_id: tryoutId,
    mode,
    num: pkg?.id || tryoutId,
    title: pkg?.title || "Try Out",
    mapel: isFree ? "Matematika" : "",
    semester: 1,
    est: pkg?.duration || formatTryoutMinutes(timeLimitSeconds),
    total: total > 0 ? total : undefined,
    progress: 0,
    topics: [pkg?.title || "Try Out", "Try Out", isFree ? "Gratis" : "Paket aktif"],
    freeTryout: isFree,
    packageTitle: pkg?.title || "Try Out",
    isTryoutSession: true,
    problemLimit: total > 0 ? total : undefined,
    timeLimitSeconds,
    disableCanvasIntro: true,
    disableCanvasMode: true,
    backRoute: { route: "belajar", section: "Try Out" },
    sessionSeed: pkg?.sessionSeed || null,
  };
}

function buildFreeMathTryoutPracticeContext(context) {
  const tryoutId = context?.tryout_id || context?.tryoutId || context?.id || "free-math-tryout-15";
  return {
    id: tryoutId,
    tryout_id: tryoutId,
    num: "TO-01",
    title: context?.title || "Try Out Matematika",
    mapel: "Matematika",
    semester: Number(context?.semester || 1),
    est: context?.est || "30 mnt",
    total: Number(context?.total || context?.problemLimit || 15),
    progress: 0,
    topics: context?.topics || ["Try Out Gratis", "Matematika"],
    freeTryout: true,
    isTryoutSession: true,
    tryoutMode: "math",
    problemLimit: Number(context?.problemLimit || 15),
    timeLimitSeconds: Number(context?.timeLimitSeconds || 30 * 60),
    disableCanvasIntro: true,
    disableCanvasMode: true,
    backRoute: { route: "belajar", section: "Try Out" },
    packageTitle: context?.packageTitle || context?.title || "Try Out Matematika",
    sessionSeed: context?.sessionSeed || null,
  };
}

function buildTryoutSessionContext(context) {
  if (String(context?.mode || "").startsWith("free-math")) return buildFreeMathTryoutPracticeContext(context);
  const tryoutId = getTryoutContextId(context);
  const total = Number(context?.total || context?.problemLimit || 0);
  const timeLimitSeconds = Number(context?.timeLimitSeconds || parseTryoutDurationSeconds(context?.est || context?.duration, 60 * 60));
  const hasExplicitMapel = Object.prototype.hasOwnProperty.call(context || {}, "mapel");
  return {
    id: tryoutId,
    tryout_id: tryoutId,
    mode: context?.mode || "tryout-confirm",
    title: context?.title || context?.packageTitle || "Try Out",
    mapel: hasExplicitMapel ? String(context?.mapel || "") : "Matematika",
    semester: Number(context?.semester || 1),
    est: context?.est || formatTryoutMinutes(timeLimitSeconds),
    total: total > 0 ? total : undefined,
    progress: 0,
    topics: context?.topics || [context?.packageTitle || context?.title || "Try Out", "Try Out"],
    freeTryout: Boolean(context?.freeTryout),
    isTryoutSession: true,
    packageTitle: context?.packageTitle || context?.title || "Try Out",
    problemLimit: total > 0 ? total : undefined,
    timeLimitSeconds,
    disableCanvasIntro: true,
    disableCanvasMode: true,
    backRoute: context?.backRoute || { route: "belajar", section: "Try Out" },
    attempt: context?.attempt || null,
    sessionSeed: context?.sessionSeed || null,
    pendingSubmitDraft: context?.pendingSubmitDraft || null,
  };
}

function buildTryoutDraftStorageKey(tryoutId) {
  return `mafiking:tryout-submit-draft:${String(tryoutId || "tryout").trim() || "tryout"}`;
}

function readTryoutDraftFromStorage(tryoutId) {
  try {
    const raw = window.sessionStorage.getItem(buildTryoutDraftStorageKey(tryoutId));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || draft.tryoutId !== tryoutId || !draft.answers || !Array.isArray(draft.problemIds)) return null;
    return draft;
  } catch (_) {
    return null;
  }
}

const FreeMathTryoutExam = ({ setRoute, context, isLoggedIn = false, isAdmin = false }) => {
  const tryoutId = getTryoutContextId(context);
  const pendingSubmitDraftRef = useRef(context?.pendingSubmitDraft || readTryoutDraftFromStorage(tryoutId));
  const pendingAutoSubmitRef = useRef(false);
  const sessionSeedRef = useRef({ tryoutId: "", seed: "" });
  if (sessionSeedRef.current.tryoutId !== tryoutId) {
    sessionSeedRef.current = {
      tryoutId,
      seed: context?.sessionSeed || createTryoutSessionSeed(tryoutId),
    };
  }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState([]);
  const [problemIndex, setProblemIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [doubtful, setDoubtful] = useState({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(Number(context?.timeLimitSeconds || 30 * 60));
  const [finishing, setFinishing] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const timeExpired = timeLeft <= 0;
  const totalProblems = problems.length || Number(context?.problemLimit || 15);
  const activeProblem = problems[problemIndex];
  const selectedChoiceIndex = activeProblem ? answers[activeProblem.id] : null;

  useEffect(() => { loadTryoutProblems(); }, [tryoutId]);

  useEffect(() => {
    if (!pendingAutoSubmitRef.current || !isLoggedIn || isAdmin || !sessionInfo || !problems.length || finishing) return;
    pendingAutoSubmitRef.current = false;
    finishTryout({ forceSubmit: true, draft: pendingSubmitDraftRef.current });
  }, [isLoggedIn, isAdmin, sessionInfo, problems.length, finishing]);

  useEffect(() => {
    const expiresAtMs = Date.parse(sessionInfo?.expiresAt || "");
    if (Number.isFinite(expiresAtMs)) {
      setTimeLeft(Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)));
      return;
    }
    setTimeLeft(Number(sessionInfo?.timeLimitSeconds || context?.timeLimitSeconds || 30 * 60));
  }, [tryoutId, context?.timeLimitSeconds, sessionInfo?.expiresAt, sessionInfo?.timeLimitSeconds]);

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
  }, [tryoutId, sessionInfo?.expiresAt]);

  useEffect(() => {
    if (timeLeft === 0 && problems.length && !finishing) finishTryout();
  }, [timeLeft, problems.length, finishing]);

  async function loadTryoutProblems() {
    setLoading(true);
    setError("");
    try {
      const data = await MafikingAPI.get(`/api/tryouts/${encodeURIComponent(tryoutId)}/full`);
      const questions = Array.isArray(data.questions) ? data.questions : [];
      const requestedLimit = Number(context?.problemLimit || context?.total || 0);
      const limit = requestedLimit > 0 ? Math.min(requestedLimit, questions.length) : questions.length;
      const sessionSeed = sessionSeedRef.current.seed;
      const selectedProblems = questions.slice(0, limit);
      const shuffledProblems = shuffleTryoutChoices(
        selectedProblems,
        hashTryoutValue(`questions:${tryoutId}:${sessionSeed}`)
      );
      const nextProblems = shuffledProblems.map((problem, index) => {
        const choices = getBaseTryoutChoices(problem, shuffledProblems);
        return {
          ...problem,
          sessionChoices: shuffleTryoutChoices(
            choices,
            hashTryoutValue(`choices:${tryoutId}:${sessionSeed}:${problem.id}:${index}`)
          ),
        };
      });
      const tryoutMeta = data.tryout || {};
      const session = data.session || {};
      setSessionInfo({
        id: session.id || session.tryoutId || tryoutId,
        title: session.title || session.tryoutTitle || tryoutMeta.title || context?.packageTitle || context?.title || "Try Out",
        timeLimitSeconds: Number(session.timeLimitSeconds || data.timeLimitSeconds || context?.timeLimitSeconds || 30 * 60),
        startedAt: session.startedAt || null,
        expiresAt: session.expiresAt || null,
        sessionToken: session.sessionToken || "",
      });
      setProblems(nextProblems);
      setProblemIndex(0);
      const pendingDraft = pendingSubmitDraftRef.current;
      const restoredAnswers = pendingDraft && pendingDraft.tryoutId === tryoutId && pendingDraft.answers
        ? pendingDraft.answers
        : {};
      setAnswers(restoredAnswers);
      setDoubtful({});
      setMobileNavOpen(false);
      setFinishing(false);
      if (pendingDraft && pendingDraft.tryoutId === tryoutId && pendingDraft.autoSubmit) {
        pendingAutoSubmitRef.current = true;
        showToast("Login berhasil. Jawaban tryout sedang disimpan otomatis.", "info");
      }
    } catch (caught) {
      setError(caught.message || "Gagal memuat soal tryout.");
    } finally {
      setLoading(false);
    }
  }

  function getChoices(problem) {
    return getSessionTryoutChoices(problem, problems);
  }

  function selectChoice(choiceIndex) {
    if (!activeProblem || timeExpired) return;
    setAnswers((current) => ({ ...current, [activeProblem.id]: choiceIndex }));
  }

  function moveProblem(delta) {
    setProblemIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(problems.length - 1, 0)));
    setMobileNavOpen(false);
  }

  function buildTryoutSubmissionPayload({ answersSource = answers, draft = null } = {}) {
    const timeLimitSeconds = Number(sessionInfo?.timeLimitSeconds || context?.timeLimitSeconds || 30 * 60);
    const durationSeconds = Number.isFinite(Number(draft?.durationSeconds))
      ? Math.max(0, Number(draft.durationSeconds))
      : Math.max(0, timeLimitSeconds - Math.max(0, Number(timeLeft || 0)));
    const payloadAnswers = {};
    const choiceMap = {};
    for (const problem of problems) {
      if (answersSource[problem.id] != null) payloadAnswers[problem.id] = answersSource[problem.id];
      choiceMap[problem.id] = draft?.choiceMap?.[problem.id] || getChoices(problem);
    }
    return {
      tryoutId: sessionInfo?.id || context?.id || "free-math-tryout-15",
      tryoutTitle: sessionInfo?.title || context?.packageTitle || context?.title || "Try Out Matematika",
      sessionToken: sessionInfo?.sessionToken || "",
      problemIds: problems.map((problem) => problem.id),
      answers: payloadAnswers,
      choiceMap,
      durationSeconds,
    };
  }

  function redirectGuestToLoginWithDraft() {
    const draftPayload = buildTryoutSubmissionPayload();
    const draft = {
      ...draftPayload,
      tryoutId,
      autoSubmit: true,
      savedAt: Date.now(),
      sessionSeed: sessionSeedRef.current.seed,
    };
    try {
      window.sessionStorage.setItem(buildTryoutDraftStorageKey(tryoutId), JSON.stringify(draft));
    } catch (_) {}
    showToast("Login dulu untuk menyimpan hasil tryout. Jawabanmu sudah diamankan.", "info");
    setRoute({
      route: "lobby",
      authMode: "login",
      authRedirect: {
        route: "tryout",
        tryout: {
          ...context,
          id: tryoutId,
          tryout_id: tryoutId,
          mode: context?.mode === "free-math" ? "free-math" : "tryout-exam",
          sessionSeed: sessionSeedRef.current.seed,
          pendingSubmitDraft: draft,
        },
      },
    });
  }

  async function finishTryout(options = {}) {
    if (finishing || !problems.length) return;
    if (!options.forceSubmit && !isLoggedIn && !isAdmin) {
      redirectGuestToLoginWithDraft();
      return;
    }
    setFinishing(true);
    try {
      const result = await MafikingAPI.post("/api/progress/tryout-attempts", buildTryoutSubmissionPayload({
        answersSource: options.draft?.answers || answers,
        draft: options.draft || null,
      }));
      try { window.sessionStorage.removeItem(buildTryoutDraftStorageKey(tryoutId)); } catch (_) {}
      const score = result?.attempt?.score;
      showToast(score == null ? "Tryout selesai. Hasil tersimpan." : `Tryout selesai. Skor kamu ${score}.`, "success");
      setRoute({
        route: "tryout",
        tryout: {
          ...context,
          id: tryoutId,
          tryout_id: tryoutId,
          mode: "tryout-review",
          attempt: result?.attempt || null,
        },
      });
    } catch (caught) {
      const message = caught.message || "Gagal menyimpan hasil tryout.";
      if (message.toLowerCase().includes("sudah pernah")) {
        const attempt = await fetchLatestTryoutAttempt(tryoutId).catch(() => null);
        if (attempt) {
          setRoute({
            route: "tryout",
            tryout: {
              ...context,
              id: tryoutId,
              tryout_id: tryoutId,
              mode: "tryout-review",
              attempt,
            },
          });
          return;
        }
      }
      if (message.toLowerCase().includes("login") && !isLoggedIn && !isAdmin) {
        redirectGuestToLoginWithDraft();
        return;
      }
      showToast(message, "error");
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
            <TryoutQuestionMedia question={activeProblem} />
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

const TryoutPreviewView = ({ setRoute, context }) => {
  const tryoutId = getTryoutContextId(context);
  const [state, setState] = useState({ loading: true, error: "", snapshot: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: "", snapshot: null });
    MafikingAPI.get(`/api/tryouts/${encodeURIComponent(tryoutId)}/full`)
      .then((data) => {
        if (cancelled) return;
        const questions = Array.isArray(data.questions) ? data.questions : [];
        setState({
          loading: false,
          error: "",
          snapshot: buildTryoutPreviewSnapshot({
            tryoutId,
            tryoutTitle: data?.tryout?.title || context?.packageTitle || context?.title || "Preview Try Out",
            questions,
          }),
        });
      })
      .catch((caught) => {
        if (!cancelled) setState({ loading: false, error: caught.message || "Gagal memuat preview Try Out.", snapshot: null });
      });
    return () => { cancelled = true; };
  }, [tryoutId]);

  if (state.loading) {
    return (
      <div className="tryout-exam-shell tryout-review-shell" aria-busy="true">
        <header className="tryout-exam-topbar">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </header>
        <main className="tryout-review-main">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </main>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="tryout-exam-shell tryout-review-shell">
        <header className="tryout-exam-topbar">
          <button className="tryout-back-btn" onClick={() => setRoute({ route: "admin" })} type="button" aria-label="Kembali">
            <Icon.ChevL className="w-4 h-4" />
          </button>
          <div>
            <h1>Preview Try Out</h1>
            <p>GAGAL MEMUAT</p>
          </div>
        </header>
        <main className="tryout-review-main">
          <section className="tryout-question-card">
            <div className="mafiking-answer-heading">{state.error}</div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <TryoutReviewView
      setRoute={setRoute}
      context={context}
      preview
      snapshot={state.snapshot}
      backRoute={{ route: "admin" }}
    />
  );
};

const TryoutReviewView = ({ setRoute, context, preview = false, snapshot: snapshotOverride = null, backRoute = null }) => {
  const attempt = context?.attempt || {};
  const snapshot = snapshotOverride || attempt.reviewSnapshot || context?.reviewSnapshot || null;
  const stats = snapshot?.stats || attempt || {};
  const questions = Array.isArray(snapshot?.questions) ? snapshot.questions : [];
  const title = snapshot?.tryoutTitle || attempt.tryoutTitle || context?.packageTitle || context?.title || "Try Out";
  const score = Number(stats.score || 0);
  const correctCount = Number(stats.correctCount || stats.correct_count || 0);
  const totalQuestions = Number(stats.totalQuestions || stats.total_questions || questions.length || 0);
  const answeredCount = Number(stats.answeredCount || stats.answered_count || 0);
  const durationSeconds = Number(snapshot?.durationSeconds || attempt.durationSeconds || attempt.duration_seconds || 0);
  const targetBackRoute = backRoute || context?.backRoute || { route: "belajar", section: "Try Out" };

  return (
    <div className="tryout-exam-shell tryout-review-shell">
      <header className="tryout-exam-topbar">
        <div className="tryout-title-group">
          <button className="tryout-back-btn" onClick={() => setRoute(targetBackRoute)} type="button" aria-label="Kembali">
            <Icon.ChevL className="w-4 h-4" />
          </button>
          <div>
            <h1>{title}</h1>
            <p>{preview ? "PREVIEW SOAL" : "RIWAYAT TRY OUT"}</p>
          </div>
        </div>
        <div className="tryout-review-score">
          <span>{preview ? `${totalQuestions} soal` : `Skor ${score}`}</span>
        </div>
      </header>

      <main className="tryout-review-main">
        <section className="tryout-review-summary" aria-label="Ringkasan hasil Try Out">
          <div>
            <span className="tryout-review-summary-label">{preview ? "Mode" : "Nilai"}</span>
            <strong>{preview ? "Preview" : score}</strong>
          </div>
          <div>
            <span className="tryout-review-summary-label">Benar</span>
            <strong>{preview ? "-" : `${correctCount}/${totalQuestions}`}</strong>
          </div>
          <div>
            <span className="tryout-review-summary-label">Terjawab</span>
            <strong>{preview ? "-" : `${answeredCount}/${totalQuestions}`}</strong>
          </div>
          <div>
            <span className="tryout-review-summary-label">Durasi</span>
            <strong>{durationSeconds ? formatTryoutClock(durationSeconds) : "-"}</strong>
          </div>
        </section>

        {questions.length === 0 ? (
          <section className="tryout-question-card">
            <div className="mafiking-answer-heading">Belum ada snapshot soal untuk Try Out ini.</div>
          </section>
        ) : (
          <div className="tryout-review-list">
            {questions.map((question, index) => (
              <TryoutReviewQuestion
                key={question.id || index}
                index={index}
                question={question}
                preview={preview}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

const TryoutReviewQuestion = ({ question, index, preview }) => {
  const choices = Array.isArray(question.choices) ? question.choices : [];
  const selectedChoiceIndex = Number.isInteger(question.selectedChoiceIndex) ? question.selectedChoiceIndex : null;
  const correctChoiceIndex = Number.isInteger(question.correctChoiceIndex) ? question.correctChoiceIndex : -1;
  const hasChoices = choices.length > 0;

  return (
    <article className="tryout-review-card">
      <div className="mafiking-question-meta">
        <span>Soal {index + 1}</span>
        <span className="mafiking-difficulty">{question.difficulty || "Easy"}</span>
        {!preview && (
          <span className={question.isCorrect ? "tryout-review-status is-correct" : "tryout-review-status is-wrong"}>
            {question.isCorrect ? "Benar" : selectedChoiceIndex == null ? "Tidak dijawab" : "Salah"}
          </span>
        )}
      </div>

      <p className="mafiking-question-title">
        <Eq value={question.questionDisplay || question.question_display || question.questionText || question.question_text || "Soal belum memiliki teks."} />
      </p>
      <TryoutQuestionMedia question={question} />

      {hasChoices ? (
        <div className="mafiking-choice-list">
          {choices.map((choice, choiceIndex) => {
            const isSelected = selectedChoiceIndex === choiceIndex;
            const isCorrect = correctChoiceIndex === choiceIndex;
            return (
              <div
                key={`${question.id || index}-${choiceIndex}`}
                className="mafiking-choice-option"
                data-selected={isSelected ? "true" : undefined}
                data-correct={isCorrect ? "true" : undefined}
                data-wrong={isSelected && !isCorrect ? "true" : undefined}
              >
                <span className="mafiking-choice-letter">{String.fromCharCode(65 + choiceIndex)}</span>
                <span className="mafiking-choice-text"><Eq value={choice} /></span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tryout-review-answer-grid">
          {!preview && (
            <div>
              <div className="mafiking-answer-heading">Jawaban Anda</div>
              <p>{question.selectedAnswer ? <Eq value={question.selectedAnswer} /> : "Tidak dijawab"}</p>
            </div>
          )}
          <div>
            <div className="mafiking-answer-heading">Jawaban benar</div>
            <p><Eq value={question.correctAnswer || question.answer_display || "-"} /></p>
          </div>
        </div>
      )}

      <TryoutReviewSteps steps={question.steps || []} />
    </article>
  );
};

const TryoutQuestionMedia = ({ question }) => {
  const imageUrl = String(question?.imageUrl || question?.image_url || "").trim();
  if (!imageUrl) return null;
  const imageAlt = String(question?.imageAlt || question?.image_alt || "Gambar soal").trim() || "Gambar soal";
  return (
    <figure className="tryout-question-media">
      <img src={imageUrl} alt={imageAlt} loading="lazy" />
    </figure>
  );
};

const TryoutReviewSteps = ({ steps }) => {
  const safeSteps = Array.isArray(steps) ? steps.filter((step) => step && (step.title || step.content)) : [];
  if (!safeSteps.length) {
    return <div className="mafiking-locked-steps"><p>Belum ada pembahasan untuk soal ini.</p></div>;
  }
  return (
    <div className="tryout-review-steps">
      <div className="mafiking-solution-header">
        <div className="mafiking-answer-heading">Pembahasan</div>
        <span className="mafiking-step-count">{safeSteps.length} langkah</span>
      </div>
      <div className="mafiking-step-list">
        {safeSteps.map((step, idx) => (
          <div className="mafiking-step-row" key={step.id || idx}>
            <div className="mafiking-step-index">{idx + 1}</div>
            <div className="mafiking-step-content">
              <h3>{step.title || `Langkah ${idx + 1}`}</h3>
              {step.content && <div className="mafiking-formula-box"><Eq value={step.content} /></div>}
              {step.why && (
                <div className="mafiking-step-note note-why">
                  <span className="mafiking-step-note-label">Kenapa langkah ini?</span>
                  <p>{step.why}</p>
                </div>
              )}
              {step.intuition && (
                <div className="mafiking-step-note note-intuition">
                  <span className="mafiking-step-note-label">Cara memahaminya</span>
                  <p>{step.intuition}</p>
                </div>
              )}
              {step.mistakes && (
                <div className="mafiking-step-note note-mistakes">
                  <span className="mafiking-step-note-label">Hati-hati</span>
                  <p>{step.mistakes}</p>
                  {step.mistake_result && <p className="mafiking-step-note-result">{step.mistake_result}</p>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TryoutFlagIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 21V5" />
    <path d="M6 5h10l-1.5 4L16 13H6" />
  </svg>
);

function isTryoutSessionMode(mode) {
  const value = String(mode || "");
  return value === "free-math-confirm"
    || value === "free-math"
    || value === "tryout-confirm"
    || value === "tryout-exam"
    || value === "tryout-review"
    || value === "tryout-preview";
}

function getTryoutContextId(context) {
  return String(context?.tryout_id || context?.tryoutId || context?.id || "free-math-tryout-15").trim() || "free-math-tryout-15";
}

function getPackageTryoutId(pkg) {
  const explicit = String(pkg?.tryout_id || pkg?.tryoutId || "").trim();
  if (explicit) return explicit;
  const source = String(pkg?.title || "tryout").trim().toLowerCase();
  const slug = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug ? `tryout-${slug}` : "tryout-package";
}

function parseTryoutDurationSeconds(value, fallbackSeconds) {
  const text = String(value || "").toLowerCase();
  const number = Number((text.match(/\d+/) || [])[0] || 0);
  if (!number) return Number(fallbackSeconds || 30 * 60);
  if (text.includes("jam")) return number * 60 * 60;
  return number * 60;
}

async function fetchLatestTryoutAttempt(tryoutId) {
  const data = await MafikingAPI.get(`/api/progress/tryout-attempts/latest?tryoutId=${encodeURIComponent(tryoutId)}`);
  return data?.attempt || null;
}

function parseTryoutArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch (_) {
    return String(value || "").split("\n").map((item) => item.trim()).filter(Boolean);
  }
}

function getBaseTryoutChoices(question, allQuestions) {
  const options = parseTryoutArray(question?.mc_options);
  return options.length ? options : buildTryoutGeneratedChoices(question, allQuestions);
}

function getSessionTryoutChoices(question, allQuestions) {
  const sessionChoices = parseTryoutArray(question?.sessionChoices);
  return sessionChoices.length ? sessionChoices : getBaseTryoutChoices(question, allQuestions);
}

function getTryoutChoicesForReview(question, allQuestions) {
  const options = parseTryoutArray(question?.mc_options || question?.choices);
  return options.length ? options : buildTryoutGeneratedChoices(question, allQuestions);
}

function getTryoutCorrectAnswer(question) {
  const acceptable = parseTryoutArray(question?.acceptable_answers);
  return String(question?.answer_display || question?.correctAnswer || acceptable[0] || "").trim();
}

function getTryoutCorrectChoiceIndexForReview(question, choices) {
  const correctAnswer = getTryoutCorrectAnswer(question);
  const normalizedCorrect = normalizeTryoutAnswer(correctAnswer);
  if (!normalizedCorrect) return -1;
  return choices.findIndex((choice) => normalizeTryoutAnswer(choice) === normalizedCorrect);
}

function normalizeTryoutStepsForPreview(steps) {
  return (Array.isArray(steps) ? steps : []).map((step, idx) => ({
    id: step.id || idx,
    title: step.title || `Langkah ${idx + 1}`,
    content: step.content || "",
    why: step.why || "",
    intuition: step.intuition || "",
    mistakes: step.mistakes || "",
    mistake_result: step.mistake_result || "",
  })).filter((step) => step.title || step.content);
}

function buildTryoutPreviewSnapshot({ tryoutId, tryoutTitle, questions }) {
  const safeQuestions = Array.isArray(questions) ? questions : [];
  return {
    tryoutId,
    tryoutTitle,
    durationSeconds: 0,
    stats: {
      score: 0,
      correctCount: 0,
      totalQuestions: safeQuestions.length,
      answeredCount: 0,
    },
    questions: safeQuestions.map((question, index) => {
      const choices = getTryoutChoicesForReview(question, safeQuestions);
      const correctChoiceIndex = getTryoutCorrectChoiceIndexForReview(question, choices);
      return {
        id: question.id,
        sourceIndex: Number(question.sort_order || index + 1),
        questionText: question.question_text || "",
        questionDisplay: question.question_display || "",
        imageUrl: question.image_url || question.imageUrl || "",
        imageAlt: question.image_alt || question.imageAlt || "",
        difficulty: question.difficulty || "Easy",
        questionType: question.question_type || "mc",
        choices,
        selectedChoiceIndex: null,
        selectedAnswer: "",
        correctChoiceIndex,
        correctAnswer: correctChoiceIndex >= 0 ? choices[correctChoiceIndex] : getTryoutCorrectAnswer(question),
        isCorrect: false,
        steps: normalizeTryoutStepsForPreview(question.steps),
      };
    }),
  };
}

function createTryoutSessionSeed(tryoutId) {
  const parts = [String(tryoutId || "tryout"), String(Date.now())];
  try {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(2);
      window.crypto.getRandomValues(values);
      parts.push(String(values[0]), String(values[1]));
      return parts.join(":");
    }
  } catch (_) {}
  parts.push(String(Math.random()).slice(2));
  return parts.join(":");
}

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
        <label style={{ fontSize: 12 }}>ID Try Out
          <input className="admin-inline-input" value={pkg.tryout_id || ''} onChange={e => onChange({ tryout_id: e.target.value })} placeholder="contoh: tryout-gratis-tpb" />
        </label>
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
