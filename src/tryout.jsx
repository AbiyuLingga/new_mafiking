// MAFIKING Tryout — minimalist

const BLANK_PKG = { title: '', description: '', price: 'Gratis', original_price: '', badge: '', duration: '60 mnt', questions: 30, features: '', tone: 'default', sort_order: 0 };

const Tryout = ({ setRoute, isAdmin }) => {
  const [tab, setTab] = useState("beli");
  const [packages, setPackages] = useState([]);
  const [activePackages, setActivePackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editPkg, setEditPkg] = useState(null);
  const [inlineEdit, setInlineEdit] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPackages(); }, []);

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
    <div className="bg-paper">
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pt-12 pb-10">
          <div className="grid lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-7">
              <div className="kicker mb-2">Paket Try Out</div>
              <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
                Pilih paket belajar<br/>
                sesuai akses yang kamu butuhkan.
              </h1>
              <p className="text-ink/65 text-lg mt-3 max-w-xl">
                Mulai dari Try Out Gratis, lalu upgrade untuk akses pembahasan dan fitur penuh.
              </p>
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
              <div className="bg-white border hairline rounded-full p-1 flex">
                <button onClick={() => setTab("beli")} className={`px-5 py-2.5 rounded-full text-sm font-semibold ${tab === "beli" ? "bg-ink text-white" : "text-ink/55 hover:text-ink"}`}>Semua Paket</button>
                <button onClick={() => setTab("milikku")} className={`px-5 py-2.5 rounded-full text-sm font-semibold ${tab === "milikku" ? "bg-ink text-white" : "text-ink/55 hover:text-ink"}`}>Paket Saya</button>
              </div>
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
              <div className="space-y-5">
                {packages.filter(hasAccess).map((pkg) => {
                  const isFree = pkg.price === "Gratis";
                  return (
                    <div key={pkg.id} className="bg-ink text-white rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative overflow-hidden transition-all hover:shadow-xl hover:translate-y-[-2px] duration-300">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full flex items-center justify-center pointer-events-none">
                        <Icon.Trophy className="w-8 h-8 text-white/10 translate-x-4 -translate-y-4" />
                      </div>
                      <div className="relative z-10 flex-1">
                        <span className={isFree ? "tag-yel tag mb-3" : "bg-white/8 text-white/68 border border-white/12 px-2.5 py-1 rounded-md text-[10px] font-mono tracking-widest uppercase font-bold mb-3 inline-block"}>
                          {isFree ? "Gratis" : "Premium"}
                        </span>
                        <h3 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.02em] mt-2">{pkg.title}</h3>
                        <p className="text-white/65 mt-1 text-sm max-w-xl">{pkg.description}</p>
                        
                        <div className="grid grid-cols-3 gap-5 mt-6 pt-5 border-t border-white/15 max-w-md">
                          <div>
                            <div className="text-xs text-white/55">Soal</div>
                            <div className="font-display font-bold text-xl md:text-2xl tnum">{pkg.questions}</div>
                          </div>
                          <div>
                            <div className="text-xs text-white/55">Waktu</div>
                            <div className="font-display font-bold text-xl md:text-2xl tnum">{pkg.duration}</div>
                          </div>
                          <div>
                            <div className="text-xs text-white/55">Akses</div>
                            <div className="font-display font-bold text-xl md:text-2xl">{isFree ? "Selamanya" : "Aktif"}</div>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setRoute({ route: "belajar", section: "Try Out" })} className="btn-yel shrink-0 relative z-10 self-end md:self-center group">
                        Mulai <Icon.Arrow className="transition-transform group-hover:translate-x-1" />
                      </button>
                    </div>
                  );
                })}
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
const PackageCard = ({ pkg, setRoute, isAdmin, adminEdit, onDelete, hasAccess }) => {
  const feature = pkg.tone === "feature";
  const featureList = Array.isArray(pkg.features)
    ? pkg.features
    : (typeof pkg.features === 'string' ? pkg.features.split('\n').filter(Boolean) : []);

  return (
    <article className={`rounded-3xl p-7 flex flex-col ${feature ? "bg-ink text-white" : "bg-white border hairline"}`}>
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
        <p className={`text-sm leading-relaxed mt-2 ${feature ? "text-white/65" : "text-ink/60"}`}>{pkg.description}</p>
      </AdminEditablePackageField>

      <div className={`grid grid-cols-2 gap-4 mt-6 pt-5 border-t ${feature ? "border-white/15" : "hairline"}`}>
        <AdminEditablePackageField pkg={pkg} field="duration" isAdmin={isAdmin} adminEdit={adminEdit}>
          <div><div className={`text-xs ${feature ? "text-white/50" : "text-ink/50"}`}>Durasi</div><div className="font-display font-bold text-xl">{pkg.duration}</div></div>
        </AdminEditablePackageField>
        <AdminEditablePackageField pkg={pkg} field="questions" isAdmin={isAdmin} adminEdit={adminEdit}>
          <div><div className={`text-xs ${feature ? "text-white/50" : "text-ink/50"}`}>Soal</div><div className="font-display font-bold text-xl tnum">{pkg.questions}</div></div>
        </AdminEditablePackageField>
      </div>

      <AdminEditablePackageField pkg={pkg} field="features" rows={4} isAdmin={isAdmin} adminEdit={adminEdit}>
        <ul className="space-y-2.5 mt-5 mb-7 flex-1">
          {featureList.map((f, i) => (
            <li key={i} className={`flex items-start gap-2 text-sm ${feature ? "text-white/85" : "text-ink/75"}`}>
              <Icon.Check className={`w-4 h-4 mt-0.5 shrink-0 ${feature ? "text-yel" : ""}`} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </AdminEditablePackageField>

      <div className={`pt-5 border-t ${feature ? "border-white/15" : "hairline"} flex items-end justify-between gap-3`}>
        <div>
          {pkg.original_price && (
            <AdminEditablePackageField pkg={pkg} field="original_price" isAdmin={isAdmin} adminEdit={adminEdit}>
              <div className={`text-xs line-through ${feature ? "text-white/40" : "text-ink/40"}`}>{pkg.original_price}</div>
            </AdminEditablePackageField>
          )}
          <AdminEditablePackageField pkg={pkg} field="price" isAdmin={isAdmin} adminEdit={adminEdit}>
            <div className="font-display font-bold text-3xl tracking-[-0.02em]">{pkg.price}</div>
          </AdminEditablePackageField>
        </div>
        <button
          onClick={() => {
            if (hasAccess) {
              setRoute({ route: "belajar", section: "Try Out" });
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
        <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: feature ? '1px solid rgba(255,255,255,0.15)' : '1px solid #e5e7eb' }}>
          <button onClick={onDelete} className="admin-btn-ghost" style={{ fontSize: 12, color: '#ef4444', flex: 1 }} type="button">Hapus</button>
        </div>
      )}
    </article>
  );
};

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
