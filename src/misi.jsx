// MAFIKING Misi Harian — minimalist with 4 mission card variants

const BLANK_MISSION = { day: 1, date_label: '', short_label: '', release_date: todayInputDate(), status: 'locked', mapel: '?', target: '', question: '', xp: 150, week_label: 'Pekan 1', sort_order: 0 };

function todayInputDate() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
    }).formatToParts(new Date());
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

function getMissionDisplayStatus(mission) {
  return mission?.effective_status || mission?.status || 'locked';
}

function missionReleaseLabel(mission) {
  return mission?.release_date || mission?.short_label || mission?.date_label || 'tanggal rilis';
}

const Misi = ({ setRoute, tweaks, isAdmin }) => {
  const variant = tweaks.missionCard || "mafiking1";
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMission, setEditMission] = useState(null); // { id?, ...fields } null = closed
  const [inlineEdit, setInlineEdit] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadMissions(); }, [isAdmin]);

  async function loadMissions() {
    setLoading(true);
    try {
      const data = await MafikingAPI.get(`/api/missions${isAdmin ? '?admin=1' : ''}`);
      setTimeline(data);
    } catch (_) {}
    setLoading(false);
  }

  async function saveMission(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const id = editMission.id;
      const body = buildMissionBody(editMission);
      if (id) {
        await MafikingAPI.put(`/api/admin/missions/${id}`, body);
      } else {
        await MafikingAPI.post('/api/admin/missions', body);
      }
      setEditMission(null);
      await loadMissions();
      showToast(id ? 'Misi diperbarui.' : 'Misi ditambahkan.', 'success');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan', 'error');
    }
    setSaving(false);
  }

  function buildMissionBody(mission, patch) {
    const source = patch ? Object.assign({}, mission, patch) : mission;
    return {
      day: source.day,
      date_label: source.date_label,
      short_label: source.short_label,
      release_date: source.release_date,
      status: source.status,
      mapel: source.mapel,
      target: source.target,
      question: source.question,
      xp: source.xp,
      week_label: source.week_label,
      sort_order: source.sort_order,
    };
  }

  function startInlineEdit(mission, field, rows) {
    if (!isAdmin || !mission || !mission.id) return;
    setInlineEdit({
      id: mission.id,
      field,
      rows: rows || 1,
      value: String(mission[field] == null ? '' : mission[field]),
    });
  }

  async function saveInlineEdit() {
    if (!inlineEdit) return;
    const mission = timeline.find(item => item.id === inlineEdit.id);
    if (!mission) {
      setInlineEdit(null);
      return;
    }
    setSaving(true);
    try {
      const patch = {};
      patch[inlineEdit.field] = inlineEdit.value;
      await MafikingAPI.put(`/api/admin/missions/${inlineEdit.id}`, buildMissionBody(mission, patch));
      setInlineEdit(null);
      await loadMissions();
      showToast('Misi diperbarui.', 'success');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan', 'error');
    }
    setSaving(false);
  }

  async function saveMissionPatch(mission, patch) {
    if (!mission || !mission.id) return;
    setSaving(true);
    try {
      await MafikingAPI.put(`/api/admin/missions/${mission.id}`, buildMissionBody(mission, patch));
      await loadMissions();
      showToast('Misi diperbarui.', 'success');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan', 'error');
    }
    setSaving(false);
  }

  async function deleteMission(id) {
    if (!window.confirm('Hapus misi ini?')) return;
    try {
      await MafikingAPI.del(`/api/admin/missions/${id}`);
      await loadMissions();
      showToast('Misi dihapus.', 'success');
    } catch (err) {
      showToast(err.message || 'Gagal menghapus', 'error');
    }
  }

  const active = timeline.find(m => getMissionDisplayStatus(m) === "active");
  const completed = timeline.filter(m => getMissionDisplayStatus(m) === "completed").length;
  const total = timeline.length;
  const weekLabel = timeline[0]?.week_label || 'Pekan 1';
  const adminEditState = { inlineEdit, saving, startInlineEdit, setInlineEdit, saveInlineEdit, saveMissionPatch };

  return (
    <div className="app-page-bg app-page-bg--misi min-h-[calc(100vh-72px)]">
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pt-12 pb-10">
          <div>
            <div>
              <div className="kicker mb-2">Misi Harian · {weekLabel}</div>
              <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
                Lima menit hari ini,<br/>
                <span className="text-ink/55">satu langkah lebih dekat.</span>
              </h1>
              <p className="text-ink/65 text-lg mt-3 max-w-xl">
                Selesaikan misi harian untuk menjaga runtunan dan mengumpulkan XP bonus.
              </p>
              {isAdmin && (
                <button
                  onClick={() => setEditMission({ ...BLANK_MISSION, sort_order: total + 1 })}
                  className="mt-4 admin-btn-primary flex items-center gap-2"
                  type="button"
                >
                  + Tambah Misi
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 pb-12">
          {loading ? (
            <div className="flex gap-4 overflow-x-auto py-8">
              {[1,2,3].map(i => <Skeleton key={i} className="shrink-0 w-[300px] h-[380px] rounded-[2rem]" />)}
            </div>
          ) : (
            <>
              {variant === "mafiking1" && <MissionMafikingLatihan timeline={timeline} setRoute={setRoute} isAdmin={isAdmin} adminEdit={adminEditState} onDelete={deleteMission} />}
              {variant === "timeline" && <MissionTimeline timeline={timeline} setRoute={setRoute} isAdmin={isAdmin} adminEdit={adminEditState} onDelete={deleteMission} />}
              {variant === "kanban" && <MissionKanban timeline={timeline} setRoute={setRoute} isAdmin={isAdmin} adminEdit={adminEditState} onDelete={deleteMission} />}
              {variant === "compact" && <MissionCompact timeline={timeline} setRoute={setRoute} isAdmin={isAdmin} adminEdit={adminEditState} onDelete={deleteMission} />}
            </>
          )}
        </div>
      </section>

      {editMission && (
        <MissionEditModal
          mission={editMission}
          saving={saving}
          onChange={patch => setEditMission(prev => ({ ...prev, ...patch }))}
          onSave={saveMission}
          onClose={() => setEditMission(null)}
        />
      )}
    </div>
  );
};

// ─── Edit modal ───────────────────────────────────────────────────────────────
const MissionEditModal = ({ mission, saving, onChange, onSave, onClose }) => (
  <div className="canvas-intro-backdrop" onClick={onClose}>
    <div className="canvas-intro-dialog" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
      <button className="canvas-intro-close" onClick={onClose} type="button">×</button>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>{mission.id ? 'Edit Misi' : 'Tambah Misi'}</h2>
      <form onSubmit={onSave} style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ fontSize: 12 }}>Hari
            <input className="admin-inline-input" type="number" min="1" value={mission.day} onChange={e => onChange({ day: e.target.value })} required />
          </label>
          <label style={{ fontSize: 12 }}>XP
            <input className="admin-inline-input" type="number" min="0" value={mission.xp} onChange={e => onChange({ xp: e.target.value })} required />
          </label>
        </div>
        <label style={{ fontSize: 12 }}>Label tanggal (e.g. Sen · 12 Mei)
          <input className="admin-inline-input" value={mission.date_label} onChange={e => onChange({ date_label: e.target.value })} required />
        </label>
        <label style={{ fontSize: 12 }}>Tanggal terbuka otomatis
          <input className="admin-inline-input" type="date" value={mission.release_date || ''} onChange={e => onChange({ release_date: e.target.value })} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ fontSize: 12 }}>Short (e.g. Sen)
            <input className="admin-inline-input" value={mission.short_label} onChange={e => onChange({ short_label: e.target.value })} required />
          </label>
          <label style={{ fontSize: 12 }}>Status
            <select className="admin-inline-input" value={mission.status} onChange={e => onChange({ status: e.target.value })}>
              <option value="locked">Terkunci</option>
              <option value="active">Aktif</option>
              <option value="completed">Selesai</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ fontSize: 12 }}>Mapel
            <input className="admin-inline-input" value={mission.mapel} onChange={e => onChange({ mapel: e.target.value })} required />
          </label>
          <label style={{ fontSize: 12 }}>Label pekan (e.g. Pekan 19)
            <input className="admin-inline-input" value={mission.week_label} onChange={e => onChange({ week_label: e.target.value })} />
          </label>
        </div>
        <label style={{ fontSize: 12 }}>Target / judul misi
          <input className="admin-inline-input" value={mission.target} onChange={e => onChange({ target: e.target.value })} required />
        </label>
        <label style={{ fontSize: 12 }}>Soal / pertanyaan misi
          <textarea className="admin-inline-input" rows={3} value={mission.question} onChange={e => onChange({ question: e.target.value })} style={{ resize: 'vertical' }} required />
        </label>
        <div className="canvas-intro-actions" style={{ marginTop: 4 }}>
          <button type="submit" disabled={saving} className="canvas-intro-primary">{saving ? 'Menyimpan…' : 'Simpan'}</button>
          <button type="button" onClick={onClose} className="canvas-intro-secondary">Batal</button>
        </div>
      </form>
    </div>
  </div>
);

// ─── Admin inline editor ────────────────────────────────────────────────────
const AdminEditableMissionField = ({ mission, field, rows, isAdmin, adminEdit, children, className }) => {
  if (!isAdmin || !adminEdit) return children;
  const editing = adminEdit.inlineEdit && adminEdit.inlineEdit.id === mission.id && adminEdit.inlineEdit.field === field;
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
        adminEdit.startInlineEdit(mission, field, rows || 1);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') adminEdit.startInlineEdit(mission, field, rows || 1);
      }}
      role="button"
      tabIndex={0}
    >
      {children}
      <span className="admin-question-edit-hint">Klik untuk edit</span>
    </div>
  );
};

// ─── Admin overlay buttons ─────────────────────────────────────────────────
const AdminMissionButtons = ({ mission, onDelete }) => (
  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
    <button
      onClick={() => onDelete(mission.id)}
      className="admin-btn-ghost"
      style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', minHeight: 'unset' }}
      type="button"
    >Hapus</button>
  </div>
);

const AdminMissionControls = ({ mission, adminEdit, compact }) => {
  if (!adminEdit || !adminEdit.saveMissionPatch) return null;
  const disabled = adminEdit.saving;
  const save = (patch) => adminEdit.saveMissionPatch(mission, patch);
  const saveOnBlur = (field, currentValue) => (event) => {
    const nextValue = event.target.value;
    if (String(nextValue) === String(currentValue == null ? '' : currentValue)) return;
    save({ [field]: nextValue });
  };

  return (
    <div
      className={`admin-mission-controls${compact ? ' is-compact' : ''}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <label>
        <span>Terbuka</span>
        <input
          type="date"
          value={mission.release_date || ''}
          disabled={disabled}
          onChange={(event) => save({ release_date: event.target.value })}
        />
      </label>
      <label>
        <span>Status</span>
        <select
          value={mission.status || 'locked'}
          disabled={disabled}
          onChange={(event) => save({ status: event.target.value })}
        >
          <option value="locked">Terkunci</option>
          <option value="active">Aktif</option>
          <option value="completed">Selesai</option>
        </select>
      </label>
      <label>
        <span>XP</span>
        <input
          key={`${mission.id}-xp-${mission.xp}`}
          type="number"
          min="0"
          defaultValue={mission.xp || 0}
          disabled={disabled}
          onBlur={saveOnBlur('xp', mission.xp)}
        />
      </label>
      {!compact && (
        <>
          <label>
            <span>Hari</span>
            <input
              key={`${mission.id}-day-${mission.day}`}
              type="number"
              min="1"
              defaultValue={mission.day || 1}
              disabled={disabled}
              onBlur={saveOnBlur('day', mission.day)}
            />
          </label>
          <label className="is-wide">
            <span>Label tanggal</span>
            <input
              key={`${mission.id}-date-label-${mission.date_label}`}
              defaultValue={mission.date_label || ''}
              disabled={disabled}
              onBlur={saveOnBlur('date_label', mission.date_label)}
            />
          </label>
          <label>
            <span>Singkat</span>
            <input
              key={`${mission.id}-short-label-${mission.short_label}`}
              defaultValue={mission.short_label || ''}
              disabled={disabled}
              onBlur={saveOnBlur('short_label', mission.short_label)}
            />
          </label>
        </>
      )}
    </div>
  );
};

const MissionQuestionText = ({ question, className }) => {
  if (typeof renderMafikingMathHTML === 'function') {
    return (
      <span
        className={`mission-question-text eq-katex${className ? ` ${className}` : ''}`}
        dangerouslySetInnerHTML={{ __html: renderMafikingMathHTML(question || '') }}
      />
    );
  }
  return <span className={`mission-question-text${className ? ` ${className}` : ''}`}>{question}</span>;
};

// ─── VARIANT · MAFIKING-LATIHAN_1 ─────────────────────────────────────────────
const MissionMafikingLatihan = ({ timeline, setRoute, isAdmin, adminEdit, onDelete }) => {
  const [focusedDay, setFocusedDay] = useState(
    timeline.find((m) => getMissionDisplayStatus(m) === "active")?.day || (timeline[0]?.day || 1)
  );
  const scrollRef = useRef(null);
  const activeRef = useRef(null);
  const marqueeTimeline = timeline.length > 1 ? [...timeline, ...timeline] : timeline;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" });
  }, []);

  const getLoopPoint = React.useCallback((container) => {
    if (!container || timeline.length < 2) return Math.max(0, container.scrollWidth - container.clientWidth);
    const first = container.children[0];
    const duplicateFirst = container.children[timeline.length];
    if (!first || !duplicateFirst) return container.scrollWidth / 2;
    return Math.max(0, duplicateFirst.offsetLeft - first.offsetLeft);
  }, [timeline.length]);

  const scrollMissions = React.useCallback((direction) => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollAmount = window.innerWidth > 768 ? 400 : 300;
    const loopPoint = getLoopPoint(container);
    if (loopPoint <= 0) return;

    let nextLeft = container.scrollLeft + (direction === "left" ? -scrollAmount : scrollAmount);
    if (timeline.length > 1) {
      if (nextLeft >= loopPoint) nextLeft -= loopPoint;
      if (nextLeft < 0) nextLeft += loopPoint;
    } else {
      nextLeft = Math.max(0, Math.min(loopPoint, nextLeft));
    }

    container.scrollTo({ left: nextLeft, behavior: "smooth" });
  }, [getLoopPoint, timeline.length]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const centerPosition = container.scrollLeft + container.clientWidth / 2;
    let closestDay = focusedDay;
    let minDistance = Infinity;
    Array.from(container.children).forEach((child) => {
      const day = Number(child.dataset.day);
      if (!day) return;
      const childCenter = child.offsetLeft - container.offsetLeft + child.clientWidth / 2;
      const distance = Math.abs(childCenter - centerPosition);
      if (distance < minDistance) { minDistance = distance; closestDay = day; }
    });
    if (closestDay !== focusedDay) setFocusedDay(closestDay);
  };

  return (
    <div className="relative w-full pb-10 group">
      <button onClick={() => scrollMissions("left")} aria-label="Geser misi ke kiri" className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 bg-white/90 backdrop-blur-sm border border-ink/10 text-ink shadow-xl p-3 md:p-4 rounded-full hover:bg-white focus:outline-none active:scale-95 transition-all flex items-center justify-center">
        <Icon.ChevL className="w-6 h-6 md:w-8 md:h-8" />
      </button>
      <button onClick={() => scrollMissions("right")} aria-label="Geser misi ke kanan" className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 bg-white/90 backdrop-blur-sm border border-ink/10 text-ink shadow-xl p-3 md:p-4 rounded-full hover:bg-white focus:outline-none active:scale-95 transition-all flex items-center justify-center">
        <Icon.ChevR className="w-6 h-6 md:w-8 md:h-8" />
      </button>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 md:gap-8 overflow-x-auto hide-scrollbar py-8 items-center px-[5vw] md:px-[15vw]"
      >
        {marqueeTimeline.map((mission, index) => {
          const isPrimaryCopy = index < timeline.length;
          const status = getMissionDisplayStatus(mission);
          const isActive = status === "active";
          const isCompleted = status === "completed";
          const isLocked = status === "locked";
          const canSeeQuestion = !isLocked || isAdmin;
          const isFocused = focusedDay === mission.day;
          return (
            <article
              key={`${mission.id || mission.day}-${index}`}
              data-day={mission.day}
              ref={isPrimaryCopy && isActive ? activeRef : null}
              className={`shrink-0 flex flex-col justify-between border transition-all duration-300 relative overflow-hidden w-[300px] md:w-[400px] min-h-[380px] rounded-[2rem] p-6 md:p-8 ${isFocused ? "transform scale-100 shadow-2xl z-10 opacity-100" : "transform scale-90 opacity-60 hover:opacity-80 shadow-sm"} ${isActive ? "border-amber-300 bg-gradient-to-br from-amber-50 to-white" : isCompleted ? "bg-emerald-50/30 border-emerald-100" : "bg-gray-50 border-gray-200"}`}
            >
              {isActive && <div className="absolute top-0 right-0 w-64 h-64 bg-amber-200 blur-[80px] rounded-full opacity-40 pointer-events-none" />}
              <div className="flex justify-between items-start mb-4 relative z-10 w-full">
                <div className="flex flex-col gap-2">
                  <span className={`text-[10px] w-fit font-bold px-3 py-1.5 rounded-full uppercase tracking-widest border ${isActive ? "bg-amber-50/70 text-ink/65 border-amber-900/10" : isCompleted ? "bg-emerald-50/60 text-ink/65 border-emerald-900/10" : "bg-ink/[0.04] text-ink/45 border-ink/10"}`}>
                    Hari {mission.day} &bull; {mission.date_label}
                  </span>
                  <AdminEditableMissionField mission={mission} field="target" isAdmin={isAdmin} adminEdit={adminEdit}>
                    <h3 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight leading-tight">{mission.target}</h3>
                  </AdminEditableMissionField>
                </div>
                {!isActive && (
                  <div className={`flex items-center justify-center border-2 shrink-0 rounded-2xl w-14 h-14 ${isCompleted ? "bg-emerald-500 text-white border-emerald-400" : "bg-gray-200 text-gray-400 border-white"}`}>
                    {isCompleted ? <Icon.CheckCircle className="w-6 h-6" /> : <Icon.Lock className="w-6 h-6" />}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4 relative z-10 flex-1">
                {isAdmin && <AdminMissionControls mission={mission} adminEdit={adminEdit} />}
                {canSeeQuestion && (
                  <AdminEditableMissionField mission={mission} field="mapel" isAdmin={isAdmin} adminEdit={adminEdit}>
                    <p className="font-bold text-gray-600 mb-2">{mission.mapel}</p>
                  </AdminEditableMissionField>
                )}
                <div className={`p-5 rounded-2xl flex-1 flex flex-col ${isActive ? "bg-white border border-amber-100 shadow-sm relative" : isLocked ? "bg-gray-200/50 items-center justify-center text-center" : "bg-white/60 border border-emerald-100/50"}`}>
                  {isLocked ? (
                    <>
                      <Icon.Lock className="w-6 h-6 mb-2 opacity-30" />
                      <AdminEditableMissionField mission={mission} field="question" rows={3} isAdmin={isAdmin} adminEdit={adminEdit}>
                        <p className="font-medium text-sm text-gray-500 w-full min-w-0">
                          <MissionQuestionText question={mission.question || `Soal otomatis terbuka pada ${missionReleaseLabel(mission)}.`} />
                        </p>
                      </AdminEditableMissionField>
                      {isAdmin && mission.release_date && (
                        <p className="text-[11px] text-ink/40 mt-2">Stock admin · terbuka {mission.release_date}</p>
                      )}
                    </>
                  ) : (
                    <>
                      {isActive && <span className="absolute -top-3 -left-3 text-6xl text-amber-200 font-serif leading-none opacity-50">"</span>}
                      <AdminEditableMissionField mission={mission} field="question" rows={3} isAdmin={isAdmin} adminEdit={adminEdit}>
                        <p className={`font-medium w-full min-w-0 ${isActive ? "text-gray-900 text-lg leading-relaxed relative z-10" : "text-gray-600 text-sm"}`}>
                          <MissionQuestionText question={mission.question} />
                        </p>
                      </AdminEditableMissionField>
                    </>
                  )}
                </div>
                {isActive && isFocused && (
                  <div className="flex items-center justify-between w-full mt-2 gap-4">
                    <span className="bg-white px-3 py-2 rounded-lg border shadow-sm text-sm font-bold text-gray-800 flex items-center gap-1.5 border-gray-200 shrink-0"><Icon.Bolt className="w-4 h-4 text-amber-500" /> +{mission.xp} XP</span>
                    <button onClick={() => setRoute("belajar")} className="flex-1 flex items-center justify-center gap-2 bg-ink text-white px-5 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-md group border border-gray-700 whitespace-nowrap">Kerjakan<Icon.Arrow className="w-4 h-4 transition-transform group-hover:translate-x-1" /></button>
                  </div>
                )}
                {isActive && !isFocused && (
                  <div className="w-full mt-2"><button onClick={() => setRoute("belajar")} className="w-full flex items-center justify-center gap-2 bg-ink text-white px-4 py-2 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-md">Kerjakan</button></div>
                )}
                {isAdmin && <AdminMissionButtons mission={mission} onDelete={onDelete} />}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

// ─── VARIANT A · TIMELINE ─────────────────────────────────────────────────────
const MissionTimeline = ({ timeline, setRoute, isAdmin, adminEdit, onDelete }) => (
  <div className="max-w-2xl">
    {timeline.map((m, i) => {
      const status = getMissionDisplayStatus(m);
      const isActive = status === "active";
      const isDone = status === "completed";
      const isLocked = status === "locked";
      const canSeeQuestion = !isLocked || isAdmin;
      const isLast = i === timeline.length - 1;
      return (
        <div key={m.id || m.day} className="flex gap-5">
          <div className="flex flex-col items-center shrink-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center z-10 ${isActive ? "bg-ink text-white" : isDone ? "bg-emerald-100 text-emerald-700" : "bg-ink/5 text-ink/30"}`} style={isActive ? { color: "var(--yel)" } : {}}>
              {isDone ? <Icon.Check className="w-4 h-4" /> : isActive ? <Icon.Bolt className="w-4 h-4" /> : <Icon.Lock className="w-3.5 h-3.5" />}
            </div>
            {!isLast && <div className={`w-px flex-1 my-2 ${isDone ? "bg-emerald-200" : "bg-ink/8"}`} />}
          </div>
          <div className="flex-1 min-w-0 pb-5">
            <div className={`rounded-2xl p-5 border transition-all ${isActive ? "border-transparent" : isDone ? "bg-white hairline" : "bg-transparent hairline opacity-60"}`} style={isActive ? { background: "var(--yel)" } : {}}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-mono text-ink/45">{m.date_label}</div>
                <span className="text-xs font-mono inline-flex items-center gap-1 text-ink/50"><Icon.Bolt className="w-3 h-3" /> +{m.xp} XP</span>
              </div>
              {isAdmin && <AdminMissionControls mission={m} adminEdit={adminEdit} />}
              <AdminEditableMissionField mission={m} field="mapel" isAdmin={isAdmin} adminEdit={adminEdit}>
                <div className="kicker mb-0.5">{canSeeQuestion ? m.mapel : "—"}</div>
              </AdminEditableMissionField>
              <AdminEditableMissionField mission={m} field="target" isAdmin={isAdmin} adminEdit={adminEdit}>
                <h3 className="font-display font-bold text-xl mb-1.5 leading-tight">{m.target}</h3>
              </AdminEditableMissionField>
              {canSeeQuestion && (
                <AdminEditableMissionField mission={m} field="question" rows={3} isAdmin={isAdmin} adminEdit={adminEdit}>
                  <p className="text-sm text-ink/70 leading-relaxed w-full min-w-0">
                    <MissionQuestionText question={m.question} />
                  </p>
                </AdminEditableMissionField>
              )}
              {isLocked && <p className="text-xs text-ink/55">Terbuka pada {missionReleaseLabel(m)}.</p>}
              {isActive && <button onClick={() => setRoute("belajar")} className="btn-ink mt-4 !py-2.5 !px-5 text-sm">Kerjakan <Icon.Arrow /></button>}
              {isDone && <div className="mt-2.5 text-xs font-semibold text-emerald-700 flex items-center gap-1"><Icon.CheckCircle className="w-3.5 h-3.5" /> Selesai</div>}
              {isAdmin && <AdminMissionButtons mission={m} onDelete={onDelete} />}
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

// ─── VARIANT B · KANBAN ───────────────────────────────────────────────────────
const MissionKanban = ({ timeline, setRoute, isAdmin, adminEdit, onDelete }) => {
  const done = timeline.filter(m => getMissionDisplayStatus(m) === "completed");
  const today = timeline.filter(m => getMissionDisplayStatus(m) === "active");
  const upcoming = timeline.filter(m => getMissionDisplayStatus(m) === "locked");

  const KanbanCol = ({ label, items, accent }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div className="kicker">{label}</div>
        <span className="text-xs font-mono text-ink/45">{items.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map(m => (
          <div key={m.id || m.day} className={`rounded-2xl p-4 border ${accent === "active" ? "border-transparent" : accent === "done" ? "bg-white hairline" : "bg-transparent hairline opacity-65"}`} style={accent === "active" ? { background: "var(--yel)" } : {}}>
            <div className="text-xs font-mono text-ink/55 mb-1">{m.date_label}</div>
            <AdminEditableMissionField mission={m} field="mapel" isAdmin={isAdmin} adminEdit={adminEdit}>
              <div className="kicker mb-0.5">{accent === "locked" && !isAdmin ? "—" : m.mapel}</div>
            </AdminEditableMissionField>
            <AdminEditableMissionField mission={m} field="target" isAdmin={isAdmin} adminEdit={adminEdit}>
              <div className="font-display font-bold text-lg leading-tight mb-2">{m.target}</div>
            </AdminEditableMissionField>
            {isAdmin && <AdminMissionControls mission={m} adminEdit={adminEdit} compact />}
            {accent === "active" && <button onClick={() => setRoute("belajar")} className="btn-ink w-full justify-center !py-2 text-xs">Kerjakan <Icon.Arrow className="w-3.5 h-3.5" /></button>}
            {accent === "done" && <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1"><Icon.Check className="w-3.5 h-3.5" /> +{m.xp} XP</div>}
            {accent === "locked" && <div className="text-xs text-ink/35 flex items-center gap-1"><Icon.Lock className="w-3 h-3" /> Terbuka {missionReleaseLabel(m)}</div>}
            {isAdmin && <AdminMissionButtons mission={m} onDelete={onDelete} />}
          </div>
        ))}
        {items.length === 0 && <div className="rounded-2xl border-2 border-dashed border-ink/10 p-8 text-center text-xs text-ink/30">—</div>}
      </div>
    </div>
  );

  return (
    <div className="flex gap-4 md:gap-5">
      <KanbanCol label="Selesai" items={done} accent="done" />
      <KanbanCol label="Hari Ini" items={today} accent="active" />
      <KanbanCol label="Akan Datang" items={upcoming} accent="locked" />
    </div>
  );
};

// ─── VARIANT C · COMPACT ─────────────────────────────────────────────────────
const MissionCompact = ({ timeline, setRoute, isAdmin, adminEdit, onDelete }) => (
  <div className="bg-white rounded-2xl border hairline overflow-hidden">
    <div className="grid grid-cols-12 px-5 py-3 border-b hairline bg-ink/[0.025] text-xs font-semibold text-ink/45 uppercase tracking-wide">
      <div className="col-span-1">No</div>
      <div className="col-span-2">Hari</div>
      <div className="col-span-2">Mapel</div>
      <div className="col-span-5">Misi</div>
      <div className="col-span-1 text-right">XP</div>
      <div className="col-span-1" />
    </div>
    {timeline.map((m, i) => {
      const status = getMissionDisplayStatus(m);
      const isActive = status === "active";
      const isDone = status === "completed";
      const isLocked = status === "locked";
      return (
        <React.Fragment key={m.id || m.day}>
          <div className={`grid grid-cols-12 px-5 py-4 items-center gap-2 text-sm ${i > 0 ? "border-t hairline" : ""} ${isActive ? "bg-ink/[0.025]" : ""}`} style={isActive ? { background: "color-mix(in srgb, var(--yel) 18%, transparent)" } : {}}>
            <div className="col-span-1 font-display font-bold text-xl tnum text-ink/12">{String(m.day).padStart(2,'0')}</div>
            <div className="col-span-2 text-xs text-ink/50 font-mono">{m.short_label}</div>
            <div className="col-span-2 text-xs font-semibold text-ink/70">{isLocked && !isAdmin ? "—" : m.mapel.slice(0, 4)}</div>
            <div className="col-span-5 font-semibold truncate flex items-center gap-2">
              {isDone && <Icon.Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
              {isActive && <Icon.Bolt className="w-3.5 h-3.5 shrink-0" />}
              {isLocked && <Icon.Lock className="w-3.5 h-3.5 text-ink/25 shrink-0" />}
              <AdminEditableMissionField mission={m} field="target" isAdmin={isAdmin} adminEdit={adminEdit}>
                <span className={isLocked ? "text-ink/35" : ""}>{m.target}</span>
              </AdminEditableMissionField>
            </div>
            <div className="col-span-1 text-right text-xs font-mono text-ink/45">+{m.xp}</div>
            <div className="col-span-1 flex justify-end gap-1 items-center">
              {isActive && <button onClick={() => setRoute("belajar")} className="text-xs font-semibold inline-flex items-center gap-1 hover:gap-1.5 transition-all whitespace-nowrap">Mulai <Icon.Arrow className="w-3 h-3" /></button>}
              {isDone && <Icon.CheckCircle className="w-4 h-4 text-emerald-500" />}
              {isAdmin && (
                <>
                  <button onClick={() => onDelete(m.id)} className="text-xs text-red-400 font-semibold" type="button">✕</button>
                </>
              )}
            </div>
          </div>
          {isAdmin && (
            <div className={`px-5 pb-4 ${isActive ? "bg-ink/[0.025]" : ""}`} style={isActive ? { background: "color-mix(in srgb, var(--yel) 18%, transparent)" } : {}}>
              <AdminMissionControls mission={m} adminEdit={adminEdit} compact />
            </div>
          )}
        </React.Fragment>
      );
    })}
  </div>
);

window.Misi = Misi;
