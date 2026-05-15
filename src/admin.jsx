// Admin UI — inline editing panel, always visible for testing

const { useState: useAdminState, useEffect: useAdminEffect, useCallback: useAdminCallback } = React;

// ─── Icons ───────────────────────────────────────────────────────────────────
const AdminIcon = {
  Pencil: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>
    </svg>
  ),
  Trash: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
    </svg>
  ),
  Plus: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  Steps: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
    </svg>
  ),
  Shield: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Upload: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4"/>
      <path d="M7 9l5-5 5 5"/>
      <path d="M4 20h16"/>
    </svg>
  ),
  Spark: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
      <path d="M19 14l.7 2.1L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-.9L19 14z" opacity=".55"/>
    </svg>
  ),
  Code: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  AlignLeft: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/>
    </svg>
  ),
  AlignCenter: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="12" x2="7" y2="12"/><line x1="19" y1="18" x2="5" y2="18"/>
    </svg>
  ),
  AlignRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="9" y2="12"/><line x1="21" y1="18" x2="7" y2="18"/>
    </svg>
  ),
};

// ─── Shared form primitives ───────────────────────────────────────────────────
const AdminField = ({ label, required, error, children }) => (
  <div className="admin-field-wrap">
    {label && <label className="admin-field-label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
    {children}
    {error && <p className="admin-field-error">{error}</p>}
  </div>
);

const AdminInput = (props) => <input {...props} className={`admin-input ${props.className || ''}`} />;
const AdminTextarea = (props) => <textarea rows={3} {...props} className={`admin-input resize-y ${props.className || ''}`} />;
const AdminSelect = ({ options, value, onChange, style }) => (
  <select value={value} onChange={onChange} style={style} className="admin-input">
    {(options || []).map((o) => {
      const val = (o && typeof o === 'object') ? o.value : o;
      const lbl = (o && typeof o === 'object') ? o.label : o;
      return <option key={val} value={val}>{lbl}</option>;
    })}
  </select>
);

const ADMIN_ALIGN_RE = /^\{\\(raggedright|centering|raggedleft)\s([\s\S]+)\}$/s;
const ALIGN_LABELS = { left: 'Kiri', center: 'Tengah', right: 'Kanan' };

function getAlign(v) {
  const m = String(v || '').trim().match(ADMIN_ALIGN_RE);
  if (!m) return 'left';
  return m[1] === 'centering' ? 'center' : m[1] === 'raggedleft' ? 'right' : 'left';
}

function applyAlign(v, align) {
  const m = String(v || '').trim().match(ADMIN_ALIGN_RE);
  const inner = m ? m[2] : String(v || '');
  if (align === 'center') return `{\\centering ${inner}}`;
  if (align === 'right') return `{\\raggedleft ${inner}}`;
  return inner;
}

const AlignToggle = ({ value, onChange }) => {
  const current = getAlign(value);
  return (
    <div className="admin-align-toggle">
      {['left', 'center', 'right'].map((a) => {
        const Icon = a === 'left' ? AdminIcon.AlignLeft : a === 'center' ? AdminIcon.AlignCenter : AdminIcon.AlignRight;
        return (
          <button
            key={a}
            type="button"
            title={`Rata ${ALIGN_LABELS[a]}`}
            className={`admin-align-btn${current === a ? ' is-active' : ''}`}
            onClick={() => onChange(applyAlign(value, a))}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
};

// ─── Modal wrapper ────────────────────────────────────────────────────────────
const AdminModal = ({ title, onClose, wide, children }) => (
  <div className="admin-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`admin-modal ${wide ? 'admin-modal-wide' : ''}`} role="dialog" aria-modal="true">
      <div className="admin-modal-header">
        <h2 className="font-display font-bold text-xl">{title}</h2>
        <button aria-label="Tutup" className="admin-close-btn" onClick={onClose} type="button">×</button>
      </div>
      <div className="admin-modal-body">{children}</div>
    </div>
  </div>
);

function adminConfirmDelete(label) {
  return window.confirm('Hapus ' + label + '? Aksi ini tidak bisa dibatalkan.');
}

async function parseAdminApiResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request gagal (${response.status})`);
  return data;
}

// ─── Chapter modal ────────────────────────────────────────────────────────────
const AdminChapterModal = ({ chapter, onDone, onClose }) => {
  const isEdit = Boolean(chapter && chapter.id);
  const [form, setForm] = useAdminState({
    title: (chapter && chapter.title) || '',
    icon: (chapter && chapter.icon) || '',
    sort_order: (chapter && chapter.sort_order != null) ? chapter.sort_order : 0,
  });
  const [saving, setSaving] = useAdminState(false);
  const [err, setErr] = useAdminState('');

  async function save() {
    if (!form.title.trim()) { setErr('Judul wajib diisi.'); return; }
    setSaving(true); setErr('');
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? '/api/admin/chapters/' + chapter.id : '/api/admin/chapters';
      const r = await fetch(url, {
        method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error('Gagal simpan bab');
      showToast(isEdit ? 'Bab diperbarui.' : 'Bab baru ditambahkan.', 'success');
      onDone(); onClose();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <AdminModal title={isEdit ? 'Edit Bab' : 'Tambah Bab'} onClose={onClose}>
      <AdminField label="Judul Bab" required error={err}>
        <AdminInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="contoh: Teknik Integrasi" />
      </AdminField>
      <AdminField label="Icon (emoji)">
        <AdminInput value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="∫" />
      </AdminField>
      <AdminField label="Urutan tampil">
        <AdminInput type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
      </AdminField>
      <div className="admin-form-actions">
        <button className="admin-btn-ghost" onClick={onClose} type="button">Batal</button>
        <button className="admin-btn-primary" disabled={saving} onClick={save} type="button">
          {saving ? 'Menyimpan…' : isEdit ? 'Simpan' : 'Tambah'}
        </button>
      </div>
    </AdminModal>
  );
};

// ─── Subtopic modal ───────────────────────────────────────────────────────────
const AdminSubtopicModal = ({ subtopic, chapters, defaultChapterId, onDone, onClose }) => {
  const isEdit = Boolean(subtopic && subtopic.id);
  const firstChapterId = chapters.length > 0 ? chapters[0].id : '';
  const [form, setForm] = useAdminState({
    chapter_id: (subtopic && subtopic.chapter_id) || defaultChapterId || firstChapterId,
    slug: (subtopic && subtopic.slug) || '',
    title: (subtopic && subtopic.title) || '',
    icon: (subtopic && subtopic.icon) || '',
    description: (subtopic && subtopic.description) || '',
    sort_order: (subtopic && subtopic.sort_order != null) ? subtopic.sort_order : 0,
  });
  const [saving, setSaving] = useAdminState(false);
  const [err, setErr] = useAdminState('');

  async function save() {
    if (!form.title.trim() || !form.slug.trim()) { setErr('Judul dan slug wajib diisi.'); return; }
    setSaving(true); setErr('');
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? '/api/admin/subtopics/' + subtopic.id : '/api/admin/subtopics';
      const r = await fetch(url, {
        method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error('Gagal simpan subtopik');
      showToast(isEdit ? 'Subtopik diperbarui.' : 'Subtopik ditambahkan.', 'success');
      onDone(); onClose();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <AdminModal title={isEdit ? 'Edit Subtopik' : 'Tambah Subtopik'} onClose={onClose}>
      <AdminField label="Bab">
        <AdminSelect
          value={form.chapter_id}
          onChange={(e) => setForm({ ...form, chapter_id: Number(e.target.value) })}
          options={chapters.map((c) => ({ value: c.id, label: c.title }))}
        />
      </AdminField>
      <AdminField label="Judul" required error={err}>
        <AdminInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="contoh: Substitusi U" />
      </AdminField>
      <AdminField label="Slug (URL-safe, unik)" required>
        <AdminInput value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} placeholder="substitusi-u" />
      </AdminField>
      <AdminField label="Deskripsi">
        <AdminTextarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </AdminField>
      <AdminField label="Urutan">
        <AdminInput type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
      </AdminField>
      <div className="admin-form-actions">
        <button className="admin-btn-ghost" onClick={onClose} type="button">Batal</button>
        <button className="admin-btn-primary" disabled={saving} onClick={save} type="button">
          {saving ? 'Menyimpan…' : isEdit ? 'Simpan' : 'Tambah'}
        </button>
      </div>
    </AdminModal>
  );
};

// ─── Problem modal ────────────────────────────────────────────────────────────
const AdminProblemModal = ({ problem, subtopics, defaultSubtopicId, onDone, onClose, onDelete, onEditSteps }) => {
  const isEdit = Boolean(problem && problem.id);
  const firstSubtopicId = subtopics.length > 0 ? subtopics[0].id : '';

  function parseMcOptions(p) {
    try { return (Array.isArray(p.mc_options) ? p.mc_options : JSON.parse(p.mc_options || '[]')).join('\n'); }
    catch (e) { return ''; }
  }
  function parseAnswers(p) {
    try { return (Array.isArray(p.acceptable_answers) ? p.acceptable_answers : JSON.parse(p.acceptable_answers || '[]')).join('\n'); }
    catch (e) { return p.acceptable_answers || ''; }
  }

  const [form, setForm] = useAdminState({
    subtopic_id: (problem && problem.subtopic_id) || defaultSubtopicId || firstSubtopicId,
    question_text: (problem && problem.question_text) || '',
    question_display: (problem && problem.question_display) || '',
    answer_display: (problem && problem.answer_display) || '',
    acceptable_answers: problem ? parseAnswers(problem) : '',
    difficulty: (problem && problem.difficulty) || 'Easy',
    question_type: (problem && problem.question_type) || 'mc',
    mc_options: problem ? parseMcOptions(problem) : '',
    sort_order: (problem && problem.sort_order != null) ? problem.sort_order : 0,
  });
  const [saving, setSaving] = useAdminState(false);
  const [err, setErr] = useAdminState('');

  async function save() {
    if (!form.question_display.trim()) { setErr('Pertanyaan (display) wajib diisi.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        ...form,
        mc_options: form.mc_options.split('\n').map((s) => s.trim()).filter(Boolean),
        acceptable_answers: form.acceptable_answers.split('\n').map((s) => s.trim()).filter(Boolean),
      };
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? '/api/admin/problems/' + problem.id : '/api/admin/problems';
      const r = await fetch(url, {
        method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error('Gagal simpan soal');
      showToast(isEdit ? 'Soal diperbarui.' : 'Soal ditambahkan.', 'success');
      onDone(); onClose();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <AdminModal title={isEdit ? 'Edit Soal' : 'Tambah Soal'} onClose={onClose} wide>
      <div className="admin-two-col">
        <div>
          <AdminField label="Subtopik">
            <AdminSelect
              value={form.subtopic_id}
              onChange={(e) => setForm({ ...form, subtopic_id: Number(e.target.value) })}
              options={subtopics.map((s) => ({ value: s.id, label: (s.chapter_title ? s.chapter_title + ' › ' : '') + s.title }))}
            />
          </AdminField>
          <AdminField label="Tipe">
            <AdminSelect
              value={form.question_type}
              onChange={(e) => setForm({ ...form, question_type: e.target.value })}
              options={[{ value: 'mc', label: 'Pilihan Ganda (mc)' }, { value: 'open', label: 'Uraian (open)' }]}
            />
          </AdminField>
          <AdminField label="Kesulitan">
            <AdminSelect
              value={form.difficulty}
              onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
              options={['Easy', 'Medium', 'Hard']}
            />
          </AdminField>
          <AdminField label="Urutan">
            <AdminInput type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          </AdminField>
        </div>
        <div>
          <AdminField label="Pertanyaan (display — LaTeX/teks)" required error={err}>
            <AlignToggle value={form.question_display} onChange={(v) => setForm({ ...form, question_display: v })} />
            <AdminTextarea rows={4} value={form.question_display} onChange={(e) => setForm({ ...form, question_display: e.target.value })} placeholder="contoh: integral x kuadrat" />
          </AdminField>
          <AdminField label="Pertanyaan (teks polos, untuk AI)">
            <AdminTextarea rows={2} value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} placeholder="integral x kuadrat" />
          </AdminField>
        </div>
      </div>
      <AdminField label="Jawaban (display)">
        <AdminInput value={form.answer_display} onChange={(e) => setForm({ ...form, answer_display: e.target.value })} placeholder="x^3/3 + C" />
      </AdminField>
      <AdminField label="Jawaban yang diterima (satu per baris)">
        <AdminTextarea rows={3} value={form.acceptable_answers} onChange={(e) => setForm({ ...form, acceptable_answers: e.target.value })} placeholder="x^3/3 + C" />
      </AdminField>
      {form.question_type === 'mc' && (
        <AdminField label="Pilihan jawaban (satu per baris, BENAR di baris pertama)">
          <AdminTextarea rows={5} value={form.mc_options} onChange={(e) => setForm({ ...form, mc_options: e.target.value })} placeholder="x^3/3 + C" />
        </AdminField>
      )}
      <div className="admin-form-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
        {onDelete && <button className="admin-btn-ghost" style={{ color: '#ef4444', marginRight: 'auto' }} onClick={onDelete} type="button">Hapus Soal</button>}
        {onEditSteps && <button className="admin-btn-ghost" onClick={onEditSteps} type="button">Edit Langkah</button>}
        <button className="admin-btn-ghost" onClick={onClose} type="button">Batal</button>
        <button className="admin-btn-primary" disabled={saving} onClick={save} type="button">
          {saving ? 'Menyimpan…' : isEdit ? 'Simpan Soal' : 'Tambah Soal'}
        </button>
      </div>
    </AdminModal>
  );
};

// ─── Plug-and-play problem creator ─────────────────────────────────────────────
const AdminFeatureButton = ({ children, onClick }) => (
  <button className="admin-feature-add" onClick={onClick} type="button">
    <AdminIcon.Plus />
    {children}
  </button>
);

const AdminPlugFeature = ({ title, onRemove, children }) => (
  <section className="admin-plug-feature">
    <div className="admin-plug-feature-head">
      <span>{title}</span>
      <button className="admin-icon-btn" onClick={onRemove} title="Hapus fitur" type="button">×</button>
    </div>
    {children}
  </section>
);

const AdminListInput = ({ items, onChange, placeholder }) => {
  const update = (idx, value) => onChange(items.map((item, itemIdx) => itemIdx === idx ? value : item));
  const remove = (idx) => onChange(items.filter((_, itemIdx) => itemIdx !== idx));
  return (
    <div className="admin-list-input">
      {items.map((item, idx) => (
        <div className="admin-list-input-row" key={idx}>
          <AdminInput
            value={item}
            onChange={(e) => update(idx, e.target.value)}
            placeholder={idx === 0 ? placeholder : "Distraktor / variasi jawaban"}
          />
          <button
            className="admin-icon-btn admin-icon-btn-danger"
            disabled={items.length <= 1}
            onClick={() => remove(idx)}
            title="Hapus baris"
            type="button"
          >
            <AdminIcon.Trash />
          </button>
        </div>
      ))}
      <button className="admin-btn-ghost admin-add-row-btn" onClick={() => onChange(items.concat(''))} type="button">
        <AdminIcon.Plus /> Tambah baris
      </button>
    </div>
  );
};

const AdminPlugProblemModal = ({ subtopics, defaultSubtopicId, defaultSortOrder, onDone, onClose }) => {
  const firstSubtopicId = subtopics.length > 0 ? subtopics[0].id : '';
  const [form, setForm] = useAdminState({
    subtopic_id: defaultSubtopicId || firstSubtopicId,
    question_display: '',
    answer_display: '',
    question_text: '',
    difficulty: 'Easy',
    question_type: 'mc',
    sort_order: defaultSortOrder || 0,
  });
  const [enabled, setEnabled] = useAdminState({
    difficulty: false,
    options: false,
    accepted: false,
    type: false,
    aiText: false,
    sort: false,
    steps: false,
  });
  const [options, setOptions] = useAdminState(['']);
  const [acceptedAnswers, setAcceptedAnswers] = useAdminState(['']);
  const [steps, setSteps] = useAdminState([{ title: '', content: '', why: '' }]);
  const [saving, setSaving] = useAdminState(false);
  const [err, setErr] = useAdminState('');

  const features = [
    { id: 'difficulty', label: 'Tingkat Kesulitan' },
    { id: 'options', label: 'Pilihan Jawaban' },
    { id: 'accepted', label: 'Jawaban Diterima' },
    { id: 'type', label: 'Tipe Soal' },
    { id: 'aiText', label: 'Teks untuk AI' },
    { id: 'sort', label: 'Urutan Soal' },
    { id: 'steps', label: 'Langkah Penyelesaian' },
  ];

  const addFeature = (id) => {
    setEnabled((prev) => ({ ...prev, [id]: true }));
    if (id === 'options') setForm((prev) => ({ ...prev, question_type: 'mc' }));
  };
  const removeFeature = (id) => setEnabled((prev) => ({ ...prev, [id]: false }));
  const updateStep = (idx, patch) => setSteps((rows) => rows.map((row, rowIdx) => rowIdx === idx ? { ...row, ...patch } : row));
  const removeStep = (idx) => setSteps((rows) => rows.length <= 1 ? rows : rows.filter((_, rowIdx) => rowIdx !== idx));

  async function save() {
    const cleanOptions = enabled.options ? options.map((s) => s.trim()).filter(Boolean) : [];
    const primaryAnswer = cleanOptions[0] || form.answer_display.trim() || '';
    if (!form.subtopic_id) { setErr('Subtopik wajib dipilih.'); return; }
    if (!form.question_display.trim()) { setErr('Soal wajib diisi.'); return; }
    if (!primaryAnswer) { setErr('Jawaban utama wajib diisi.'); return; }

    setSaving(true); setErr('');
    try {
      const questionType = enabled.type ? form.question_type : (cleanOptions.length ? 'mc' : 'open');
      const payload = {
        subtopic_id: Number(form.subtopic_id),
        question_text: enabled.aiText ? form.question_text : '',
        question_display: form.question_display,
        answer_display: primaryAnswer,
        acceptable_answers: enabled.accepted
          ? acceptedAnswers.map((s) => s.trim()).filter(Boolean)
          : [primaryAnswer],
        difficulty: enabled.difficulty ? form.difficulty : 'Easy',
        question_type: questionType,
        mc_options: questionType === 'mc' ? cleanOptions : [],
        sort_order: Number(form.sort_order || 0),
      };

      const response = await fetch('/api/admin/problems', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Gagal tambah soal');
      const result = await response.json();
      const problemId = result.id;

      if (enabled.steps && problemId) {
        const cleanSteps = steps
          .map((step, idx) => ({ ...step, step_order: idx + 1 }))
          .filter((step) => step.title.trim() && step.content.trim());
        for (const step of cleanSteps) {
          const stepResponse = await fetch('/api/admin/problems/' + problemId + '/steps', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(step),
          });
          if (!stepResponse.ok) throw new Error('Soal tersimpan, tapi langkah gagal ditambahkan.');
        }
      }

      showToast('Soal baru ditambahkan.', 'success');
      if (onDone) onDone();
      onClose();
    } catch (e) {
      setErr(e.message || 'Gagal tambah soal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal title="Tambah Soal Baru" onClose={onClose} wide>
      <div className="admin-plug-layout">
        <div className="admin-plug-main">
          <AdminField label="Subtopik" required>
            <AdminSelect
              value={form.subtopic_id}
              onChange={(e) => setForm({ ...form, subtopic_id: Number(e.target.value) })}
              options={subtopics.map((s) => ({ value: s.id, label: (s.chapter_title ? s.chapter_title + ' › ' : '') + s.title }))}
            />
          </AdminField>
          <AdminField label="Soal" required error={err}>
            <AlignToggle value={form.question_display} onChange={(v) => setForm({ ...form, question_display: v })} />
            <AdminTextarea rows={4} value={form.question_display} onChange={(e) => setForm({ ...form, question_display: e.target.value })} placeholder="contoh: ∫ 2x (x²+1)³ dx" autoFocus />
          </AdminField>
          <AdminField label="Jawaban utama" required>
            <AdminInput value={form.answer_display} onChange={(e) => setForm({ ...form, answer_display: e.target.value })} placeholder="contoh: (x²+1)⁴/4 + C" />
          </AdminField>

          {enabled.difficulty && (
            <AdminPlugFeature title="Tingkat Kesulitan" onRemove={() => removeFeature('difficulty')}>
              <AdminSelect value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} options={['Easy', 'Medium', 'Hard']} />
            </AdminPlugFeature>
          )}

          {enabled.options && (
            <AdminPlugFeature title="Pilihan Jawaban" onRemove={() => removeFeature('options')}>
              <p className="admin-plug-help">Baris pertama dianggap jawaban benar. Tombol + menambah opsi baru.</p>
              <AdminListInput items={options} onChange={setOptions} placeholder="Jawaban benar" />
            </AdminPlugFeature>
          )}

          {enabled.accepted && (
            <AdminPlugFeature title="Jawaban Diterima" onRemove={() => removeFeature('accepted')}>
              <AdminListInput items={acceptedAnswers} onChange={setAcceptedAnswers} placeholder="Variasi jawaban yang diterima" />
            </AdminPlugFeature>
          )}

          {enabled.type && (
            <AdminPlugFeature title="Tipe Soal" onRemove={() => removeFeature('type')}>
              <AdminSelect
                value={form.question_type}
                onChange={(e) => setForm({ ...form, question_type: e.target.value })}
                options={[{ value: 'mc', label: 'Pilihan Ganda' }, { value: 'open', label: 'Uraian / Canvas' }]}
              />
            </AdminPlugFeature>
          )}

          {enabled.aiText && (
            <AdminPlugFeature title="Teks untuk AI" onRemove={() => removeFeature('aiText')}>
              <AdminTextarea rows={2} value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} placeholder="Versi teks polos untuk koreksi AI" />
            </AdminPlugFeature>
          )}

          {enabled.sort && (
            <AdminPlugFeature title="Urutan Soal" onRemove={() => removeFeature('sort')}>
              <AdminInput type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </AdminPlugFeature>
          )}

          {enabled.steps && (
            <AdminPlugFeature title="Langkah Penyelesaian" onRemove={() => removeFeature('steps')}>
              <div className="admin-plug-step-list">
                {steps.map((step, idx) => (
                  <div className="admin-step-edit" key={idx}>
                    <div className="admin-two-col-sm">
                      <AdminField label="Judul"><AdminInput value={step.title} onChange={(e) => updateStep(idx, { title: e.target.value })} placeholder={`Langkah ${idx + 1}`} /></AdminField>
                      <AdminField label="Isi"><AdminInput value={step.content} onChange={(e) => updateStep(idx, { content: e.target.value })} placeholder="u = x² + 1" /></AdminField>
                    </div>
                    <AdminField label="Alasan">
                      <AdminTextarea rows={2} value={step.why} onChange={(e) => updateStep(idx, { why: e.target.value })} />
                    </AdminField>
                    <button className="admin-btn-ghost" disabled={steps.length <= 1} onClick={() => removeStep(idx)} type="button">Hapus langkah</button>
                  </div>
                ))}
                <button className="admin-btn-ghost admin-add-row-btn" onClick={() => setSteps(steps.concat({ title: '', content: '', why: '' }))} type="button">
                  <AdminIcon.Plus /> Tambah langkah
                </button>
              </div>
            </AdminPlugFeature>
          )}
        </div>

        <aside className="admin-plug-sidebar">
          <div className="kicker">Tambah fitur</div>
          {features.filter((feature) => !enabled[feature.id]).map((feature) => (
            <AdminFeatureButton key={feature.id} onClick={() => addFeature(feature.id)}>
              {feature.label}
            </AdminFeatureButton>
          ))}
        </aside>
      </div>

      <div className="admin-form-actions">
        <button className="admin-btn-ghost" onClick={onClose} type="button">Batal</button>
        <button className="admin-btn-primary" disabled={saving} onClick={save} type="button">
          {saving ? 'Menyimpan…' : 'Simpan Soal'}
        </button>
      </div>
    </AdminModal>
  );
};

// ─── Step row ─────────────────────────────────────────────────────────────────
const AdminStepRow = ({ step, onRefresh }) => {
  const [editing, setEditing] = useAdminState(false);
  const [form, setForm] = useAdminState({ ...step });
  const [saving, setSaving] = useAdminState(false);

  async function saveStep() {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/steps/' + step.id, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error('Gagal simpan langkah');
      showToast('Langkah diperbarui.', 'success');
      setEditing(false); onRefresh();
    } catch (e) { showToast(e.message, 'error'); } finally { setSaving(false); }
  }

  async function deleteStep() {
    if (!adminConfirmDelete('Langkah ' + step.step_order)) return;
    await fetch('/api/admin/steps/' + step.id, { method: 'DELETE', credentials: 'same-origin' });
    showToast('Langkah dihapus.', 'success');
    onRefresh();
  }

  if (!editing) {
    return (
      <div className="admin-step-row">
        <div className="admin-step-num">{step.step_order}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{step.title}</div>
          <div className="text-xs text-ink/60 truncate">{step.content}</div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button className="admin-icon-btn" title="Edit" onClick={() => setEditing(true)} type="button"><AdminIcon.Pencil /></button>
          <button className="admin-icon-btn admin-icon-btn-danger" title="Hapus" onClick={deleteStep} type="button"><AdminIcon.Trash /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-step-edit">
      <div className="admin-two-col-sm">
        <AdminField label="Urutan"><AdminInput type="number" value={form.step_order} onChange={(e) => setForm({ ...form, step_order: Number(e.target.value) })} /></AdminField>
        <AdminField label="Judul"><AdminInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></AdminField>
      </div>
      <AdminField label="Isi (LaTeX/teks)"><AdminTextarea rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></AdminField>
      <AdminField label="Alasan (why)"><AdminTextarea rows={2} value={form.why || ''} onChange={(e) => setForm({ ...form, why: e.target.value })} /></AdminField>
      <AdminField label="Intuisi"><AdminTextarea rows={2} value={form.intuition || ''} onChange={(e) => setForm({ ...form, intuition: e.target.value })} /></AdminField>
      <AdminField label="Kesalahan umum"><AdminTextarea rows={2} value={form.mistakes || ''} onChange={(e) => setForm({ ...form, mistakes: e.target.value })} /></AdminField>
      <div className="admin-form-actions">
        <button className="admin-btn-ghost" onClick={() => setEditing(false)} type="button">Batal</button>
        <button className="admin-btn-primary" disabled={saving} onClick={saveStep} type="button">{saving ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </div>
  );
};

// ─── Add step form ────────────────────────────────────────────────────────────
const AdminAddStepForm = ({ problemId, currentCount, onDone }) => {
  const [form, setForm] = useAdminState({ step_order: currentCount + 1, title: '', content: '', why: '', intuition: '', mistakes: '' });
  const [saving, setSaving] = useAdminState(false);

  async function save() {
    if (!form.title.trim() || !form.content.trim()) { showToast('Judul dan isi wajib diisi.', 'error'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/problems/' + problemId + '/steps', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error('Gagal tambah langkah');
      showToast('Langkah ditambahkan.', 'success');
      onDone();
    } catch (e) { showToast(e.message, 'error'); } finally { setSaving(false); }
  }

  return (
    <div className="admin-step-edit" style={{ borderColor: 'var(--yel)', borderWidth: 2 }}>
      <div className="kicker mb-2">Langkah Baru</div>
      <div className="admin-two-col-sm">
        <AdminField label="Urutan"><AdminInput type="number" value={form.step_order} onChange={(e) => setForm({ ...form, step_order: Number(e.target.value) })} /></AdminField>
        <AdminField label="Judul"><AdminInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Substitusi u = …" /></AdminField>
      </div>
      <AdminField label="Isi"><AdminTextarea rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></AdminField>
      <AdminField label="Alasan"><AdminTextarea rows={2} value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} /></AdminField>
      <div className="admin-form-actions">
        <button className="admin-btn-primary" disabled={saving} onClick={save} type="button">{saving ? 'Menyimpan…' : '+ Tambah Langkah'}</button>
      </div>
    </div>
  );
};

// ─── Steps modal ──────────────────────────────────────────────────────────────
const AdminStepsModal = ({ problemId, questionText, onClose }) => {
  const [steps, setSteps] = useAdminState([]);
  const [loading, setLoading] = useAdminState(true);
  const [showAdd, setShowAdd] = useAdminState(false);

  const load = useAdminCallback(() => {
    setLoading(true);
    MafikingAPI.get('/api/admin/problems/' + problemId + '/steps')
      .then(setSteps).catch(() => setSteps([])).finally(() => setLoading(false));
  }, [problemId]);

  useAdminEffect(() => { load(); }, [load]);

  return (
    <AdminModal title="Langkah Penyelesaian" onClose={onClose} wide>
      <p className="text-sm text-ink/60 mb-4">{questionText}</p>
      {loading ? (
        <div className="flex gap-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-14 flex-1" />)}</div>
      ) : steps.length === 0 ? (
        <p className="text-sm text-ink/55">Belum ada langkah untuk soal ini.</p>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {steps.map((s) => <AdminStepRow key={s.id} step={s} onRefresh={load} />)}
        </div>
      )}
      {showAdd ? (
        <AdminAddStepForm problemId={problemId} currentCount={steps.length} onDone={() => { setShowAdd(false); load(); }} />
      ) : (
        <button className="admin-btn-ghost w-full mt-2" onClick={() => setShowAdd(true)} type="button">
          + Tambah Langkah Baru
        </button>
      )}
    </AdminModal>
  );
};

// ─── AI file import ──────────────────────────────────────────────────────────
function normalizeImportQuestionForUi(question, idx) {
  return {
    source_index: question.source_index || idx + 1,
    subtopic_id: question.subtopic_id || null,
    question_text: question.question_text || '',
    question_display: question.question_display || '',
    answer_display: question.answer_display || '',
    acceptable_answers: Array.isArray(question.acceptable_answers) ? question.acceptable_answers : [],
    difficulty: question.difficulty || 'Easy',
    question_type: question.question_type || (Array.isArray(question.mc_options) && question.mc_options.length ? 'mc' : 'open'),
    mc_options: Array.isArray(question.mc_options) && question.mc_options.length ? question.mc_options : [''],
    steps: Array.isArray(question.steps) ? question.steps : [],
    warnings: Array.isArray(question.warnings) ? question.warnings : [],
  };
}

const AdminImportQuestionCard = ({ question, index, onChange, onRemove }) => {
  const patch = (next) => onChange({ ...question, ...next });
  const updateStep = (stepIdx, stepPatch) => {
    patch({
      steps: question.steps.map((step, idx) => idx === stepIdx ? { ...step, ...stepPatch } : step),
    });
  };
  const removeStep = (stepIdx) => {
    patch({ steps: question.steps.filter((_, idx) => idx !== stepIdx) });
  };
  const addStep = () => {
    patch({
      steps: question.steps.concat({
        step_order: question.steps.length + 1,
        title: '',
        content: '',
        why: '',
        intuition: '',
        mistakes: '',
        mistake_result: '',
      }),
    });
  };

  return (
    <section className="admin-import-question-card">
      <div className="admin-import-question-head">
        <div>
          <div className="kicker">Draft Soal {index + 1}</div>
          {question.warnings.length > 0 && <p className="admin-import-warning">{question.warnings.join(' · ')}</p>}
        </div>
        <button className="admin-icon-btn admin-icon-btn-danger" onClick={onRemove} title="Hapus draft soal" type="button">
          <AdminIcon.Trash />
        </button>
      </div>

      <AdminField label="Soal" required>
        <AlignToggle value={question.question_display} onChange={(v) => patch({ question_display: v })} />
        <AdminTextarea rows={3} value={question.question_display} onChange={(e) => patch({ question_display: e.target.value })} />
      </AdminField>
      <div className="admin-two-col-sm admin-import-compact-grid">
        <AdminField label="Kesulitan">
          <AdminSelect value={question.difficulty} onChange={(e) => patch({ difficulty: e.target.value })} options={['Easy', 'Medium', 'Hard']} />
        </AdminField>
        <AdminField label="Tipe">
          <AdminSelect
            value={question.question_type}
            onChange={(e) => patch({ question_type: e.target.value })}
            options={[{ value: 'mc', label: 'Pilihan Ganda' }, { value: 'open', label: 'Uraian / Canvas' }]}
          />
        </AdminField>
      </div>
      <AdminField label="Jawaban utama" required>
        <AdminInput value={question.answer_display} onChange={(e) => patch({ answer_display: e.target.value })} placeholder="contoh: (x²+1)⁴/4 + C" />
      </AdminField>
      <AdminField label="Jawaban diterima (satu per baris)">
        <AdminTextarea
          rows={2}
          value={question.acceptable_answers.join('\n')}
          onChange={(e) => patch({ acceptable_answers: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
        />
      </AdminField>
      {question.question_type === 'mc' && (
        <AdminField label="Pilihan jawaban">
          <AdminListInput
            items={question.mc_options.length ? question.mc_options : ['']}
            onChange={(items) => patch({ mc_options: items })}
            placeholder="Jawaban benar"
          />
        </AdminField>
      )}
      <details className="admin-import-steps">
        <summary>Langkah pembahasan ({question.steps.length})</summary>
        <div className="admin-plug-step-list">
          {question.steps.map((step, stepIdx) => (
            <div className="admin-step-edit" key={stepIdx}>
              <div className="admin-two-col-sm">
                <AdminField label="Judul">
                  <AdminInput value={step.title || ''} onChange={(e) => updateStep(stepIdx, { title: e.target.value })} />
                </AdminField>
                <AdminField label="Isi">
                  <AdminInput value={step.content || ''} onChange={(e) => updateStep(stepIdx, { content: e.target.value })} />
                </AdminField>
              </div>
              <AdminField label="Kenapa langkah ini">
                <AdminTextarea rows={2} value={step.why || ''} onChange={(e) => updateStep(stepIdx, { why: e.target.value })} />
              </AdminField>
              <AdminField label="Cara memahaminya">
                <AdminTextarea rows={2} value={step.intuition || ''} onChange={(e) => updateStep(stepIdx, { intuition: e.target.value })} />
              </AdminField>
              <AdminField label="Kesalahan umum">
                <AdminTextarea rows={2} value={step.mistakes || ''} onChange={(e) => updateStep(stepIdx, { mistakes: e.target.value })} />
              </AdminField>
              <AdminField label="Hasil salah yang mungkin muncul">
                <AdminInput value={step.mistake_result || ''} onChange={(e) => updateStep(stepIdx, { mistake_result: e.target.value })} />
              </AdminField>
              <button className="admin-btn-ghost" onClick={() => removeStep(stepIdx)} type="button">Hapus langkah</button>
            </div>
          ))}
          <button className="admin-btn-ghost admin-add-row-btn" onClick={addStep} type="button">
            <AdminIcon.Plus /> Tambah langkah
          </button>
        </div>
      </details>
    </section>
  );
};

const AdminAiImportPanel = ({ subtopics, selectedSubtopic, onSelectSubtopic, onImported }) => {
  const firstSubtopicId = subtopics.length > 0 ? subtopics[0].id : '';
  const [subtopicId, setSubtopicId] = useAdminState((selectedSubtopic && selectedSubtopic.id) || firstSubtopicId);
  const [inputMode, setInputMode] = useAdminState('file');
  const [file, setFile] = useAdminState(null);
  const [latexText, setLatexText] = useAdminState('');
  const [draft, setDraft] = useAdminState(null);
  const [source, setSource] = useAdminState(null);
  const [loading, setLoading] = useAdminState(false);
  const [importing, setImporting] = useAdminState(false);
  const [err, setErr] = useAdminState('');

  useAdminEffect(() => {
    if (selectedSubtopic && selectedSubtopic.id !== subtopicId) setSubtopicId(selectedSubtopic.id);
  }, [selectedSubtopic]);

  function updateQuestion(idx, nextQuestion) {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((question, questionIdx) => questionIdx === idx ? nextQuestion : question),
    }));
  }

  function removeQuestion(idx) {
    setDraft((prev) => ({ ...prev, questions: prev.questions.filter((_, questionIdx) => questionIdx !== idx) }));
  }

  async function createDraft() {
    if (!subtopicId) { setErr('Pilih subtopik tujuan dulu.'); return; }
    if (inputMode === 'file' && !file) { setErr('Pilih file soal dulu.'); return; }
    if (inputMode === 'latex' && !latexText.trim()) { setErr('Tempel kode LaTeX dulu.'); return; }
    setLoading(true); setErr('');
    try {
      const formData = new FormData();
      if (inputMode === 'file') {
        formData.append('source', file);
      } else {
        formData.append('source_text', latexText);
      }
      formData.append('mode', 'ai_complete');
      formData.append('subtopic_id', String(subtopicId));
      const response = await fetch('/api/admin/import/draft', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      });
      const data = await parseAdminApiResponse(response);
      setSource(data.source || null);
      setDraft({
        ...(data.draft || {}),
        questions: ((data.draft && data.draft.questions) || []).map(normalizeImportQuestionForUi),
      });
      showToast('Draft import dibuat. Review sebelum import.', 'success');
    } catch (e) {
      setErr(e.message || 'Gagal membuat draft.');
    } finally {
      setLoading(false);
    }
  }

  async function commitDraft() {
    if (!draft || !draft.questions.length) { setErr('Tidak ada draft soal.'); return; }
    setImporting(true); setErr('');
    try {
      const response = await fetch('/api/admin/import/commit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtopic_id: Number(subtopicId), questions: draft.questions }),
      });
      const data = await parseAdminApiResponse(response);
      showToast((data.inserted || []).length + ' soal berhasil diimport.', 'success');
      setDraft(null);
      setFile(null);
      setSource(null);
      if (onImported) onImported(Number(subtopicId));
    } catch (e) {
      setErr(e.message || 'Gagal import soal.');
    } finally {
      setImporting(false);
    }
  }

  if (subtopics.length === 0) {
    return <p className="text-sm text-ink/55">Tujuan soal belum tersedia. Buka latihan dari bab yang sudah punya daftar soal dulu.</p>;
  }

  return (
    <div className="admin-import-panel">
      <section className="admin-import-setup">
        <div className="admin-import-title-row">
          <div>
            <div className="kicker">Import Soal</div>
            <h3>Upload file, AI otomatis melengkapi jawaban dan penyelesaian.</h3>
          </div>
          <a className="admin-import-sop-link" href="/SOP-DEEPSEEK-IMPORT-SOAL.md" target="_blank" rel="noreferrer">Lihat SOP</a>
        </div>

        <div className="admin-import-input-toggle">
          <button
            className={`admin-import-toggle-btn${inputMode === 'file' ? ' is-active' : ''}`}
            onClick={() => setInputMode('file')}
            type="button"
          >
            <AdminIcon.Upload /> Upload File
          </button>
          <button
            className={`admin-import-toggle-btn${inputMode === 'latex' ? ' is-active' : ''}`}
            onClick={() => setInputMode('latex')}
            type="button"
          >
            <AdminIcon.Code /> Tempel LaTeX
          </button>
        </div>

        {inputMode === 'file' ? (
          <AdminField label="File soal" required error={err}>
            <label className="admin-import-file-picker">
              <AdminIcon.Upload />
              <span>{file ? file.name : 'Pilih PDF, DOCX, TXT, atau MD'}</span>
              <input
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                onChange={(e) => setFile((e.target.files && e.target.files[0]) || null)}
                type="file"
              />
            </label>
          </AdminField>
        ) : (
          <AdminField label="Kode LaTeX / teks soal" required error={err}>
            <textarea
              className="admin-import-latex-input"
              placeholder={"Contoh:\n\nSoal 1\nTentukan nilai dari \\int 2x(x^2+1)^3 dx\n\nPilihan:\nA. \\frac{(x^2+1)^4}{4} + C  <- BENAR\nB. \\frac{(x^2+1)^3}{3} + C\nC. 2x \\cdot \\frac{(x^2+1)^4}{4} + C\nD. (x^2+1)^4 + C\n\nPembahasan:\nLangkah 1 - Substitusi\nMisalkan u = x^2+1, maka du = 2x dx\nIntegral menjadi \\int u^3 du\n\nLangkah 2 - Integralkan\n\\int u^3 du = \\frac{u^4}{4} + C\n\nLangkah 3 - Substitusi Balik\n= \\frac{(x^2+1)^4}{4} + C\n\n---\n\nSoal 2\nJika f(x) = 3x^2 - 6x + 5, maka f'(x) adalah ...\n\nPilihan:\nA. 6x - 6  <- BENAR\nB. 3x - 6\nC. 6x + 5\nD. x^2 - 6\n\nPembahasan:\nLangkah 1 - Aturan Pangkat\nTurunkan suku per suku: d/dx[ax^n] = n*ax^{n-1}\n\nLangkah 2 - Hitung\nf'(x) = 6x - 6"}
              rows={10}
              value={latexText}
              onChange={(e) => setLatexText(e.target.value)}
            />
          </AdminField>
        )}

        <div className="admin-import-auto-note">
          <AdminIcon.Spark />
          <span>Jika file belum punya kunci jawaban, AI akan membuat jawaban, opsi pilihan ganda, dan langkah penyelesaian otomatis.</span>
        </div>

        <div className="admin-form-actions">
          <button className="admin-btn-primary" disabled={loading} onClick={createDraft} type="button">
            {loading ? 'Membuat draft…' : <React.Fragment><AdminIcon.Spark /> Buat Draft AI</React.Fragment>}
          </button>
        </div>
      </section>

      {source && (
        <div className="admin-import-source">
          <strong>{source.filename}</strong>
          <span>{source.extracted_chars} karakter terbaca</span>
          <p>{source.preview}</p>
        </div>
      )}

      {draft && (
        <section className="admin-import-preview">
          <div className="admin-import-title-row">
            <div>
              <div className="kicker">Preview Draft</div>
              <h3>{draft.questions.length} soal siap direview</h3>
            </div>
            <button className="admin-btn-primary" disabled={importing || draft.questions.length === 0} onClick={commitDraft} type="button">
              {importing ? 'Mengimport…' : 'Import ke List Soal'}
            </button>
          </div>
          {draft.warnings && draft.warnings.length > 0 && (
            <p className="admin-import-warning">{draft.warnings.join(' · ')}</p>
          )}
          <div className="admin-import-question-list">
            {draft.questions.map((question, idx) => (
              <AdminImportQuestionCard
                index={idx}
                key={question.source_index || idx}
                onChange={(nextQuestion) => updateQuestion(idx, nextQuestion)}
                onRemove={() => removeQuestion(idx)}
                question={question}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// ─── Users table ──────────────────────────────────────────────────────────────
const AdminUsersPanel = () => {
  const [users, setUsers] = useAdminState([]);
  const [loading, setLoading] = useAdminState(true);
  const [pwTarget, setPwTarget] = useAdminState(null);
  const [newPw, setNewPw] = useAdminState('');
  const [pwSaving, setPwSaving] = useAdminState(false);

  useAdminEffect(() => {
    MafikingAPI.get('/api/admin/users').then(setUsers).catch(() => setUsers([])).finally(() => setLoading(false));
  }, []);

  async function resetPassword() {
    if (!newPw || newPw.length < 8) { showToast('Password minimal 8 karakter.', 'error'); return; }
    setPwSaving(true);
    try {
      const r = await fetch('/api/admin/users/' + pwTarget.id + '/password', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPw }),
      });
      if (!r.ok) throw new Error('Gagal reset password');
      showToast('Password ' + pwTarget.display_name + ' direset.', 'success');
      setPwTarget(null); setNewPw('');
    } catch (e) { showToast(e.message, 'error'); } finally { setPwSaving(false); }
  }

  if (loading) return <div className="flex flex-col gap-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="admin-table">
          <thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Lv</th><th>XP</th><th>Streak</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.role === 'admin' ? 'admin-row-admin' : ''}>
                <td className="font-semibold">{u.display_name}</td>
                <td className="text-ink/60 text-xs">{u.username}</td>
                <td><span className={'tag' + (u.role === 'admin' ? ' tag-ink' : '')}>{u.role}</span></td>
                <td className="tnum text-center">{u.level}</td>
                <td className="tnum">{u.xp}</td>
                <td className="tnum">{u.streak_days}h</td>
                <td>
                  <button className="admin-btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setPwTarget(u); setNewPw(''); }} type="button">Reset PW</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pwTarget && (
        <div className="admin-step-edit mt-4" style={{ borderColor: '#f87171', borderWidth: 2 }}>
          <div className="font-semibold mb-2">Reset password: {pwTarget.display_name}</div>
          <AdminField label="Password baru (min. 8 karakter)">
            <AdminInput type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="min. 8 karakter" />
          </AdminField>
          <div className="admin-form-actions">
            <button className="admin-btn-ghost" onClick={() => setPwTarget(null)} type="button">Batal</button>
            <button className="admin-btn-danger" disabled={pwSaving} onClick={resetPassword} type="button">{pwSaving ? 'Mereset…' : 'Reset'}</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Full admin panel ─────────────────────────────────────────────────────────
const AdminPanel = ({ onClose }) => {
  const [tab, setTab] = useAdminState('chapters');
  const [chapters, setChapters] = useAdminState([]);
  const [subtopics, setSubtopics] = useAdminState([]);
  const [problems, setProblems] = useAdminState([]);
  const [loading, setLoading] = useAdminState(true);
  const [selectedChapter, setSelectedChapter] = useAdminState(null);
  const [selectedSubtopic, setSelectedSubtopic] = useAdminState(null);
  const [modal, setModal] = useAdminState(null);
  const [dragProblemIndex, setDragProblemIndex] = useAdminState(null);
  const [dragOverProblemIndex, setDragOverProblemIndex] = useAdminState(null);

  const loadAll = useAdminCallback(async () => {
    setLoading(true);
    try {
      const [chs, subs] = await Promise.all([
        MafikingAPI.get('/api/admin/chapters'),
        MafikingAPI.get('/api/admin/subtopics'),
      ]);
      setChapters(chs);
      setSubtopics(subs);
      setSelectedChapter((prev) => prev ? (chs.find((c) => c.id === prev.id) || chs[0] || null) : (chs[0] || null));
    } catch (e) { showToast('Gagal memuat: ' + e.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  const loadProblems = useAdminCallback(async (subtopicId) => {
    if (!subtopicId) { setProblems([]); return; }
    try {
      const rows = await MafikingAPI.get('/api/admin/problems?subtopic_id=' + subtopicId);
      setProblems(rows);
    } catch (e) { setProblems([]); }
  }, []);

  useAdminEffect(() => { loadAll(); }, [loadAll]);
  useAdminEffect(() => { if (selectedSubtopic) loadProblems(selectedSubtopic.id); }, [selectedSubtopic, loadProblems]);

  const filteredSubs = subtopics.filter((s) => selectedChapter && s.chapter_id === selectedChapter.id);

  async function deleteChapter(c) {
    if (!adminConfirmDelete('Bab "' + c.title + '" beserta semua subtopik dan soalnya')) return;
    await fetch('/api/admin/chapters/' + c.id, { method: 'DELETE', credentials: 'same-origin' });
    showToast('Bab dihapus.', 'success');
    loadAll();
  }

  async function deleteSubtopic(s) {
    if (!adminConfirmDelete('Subtopik "' + s.title + '" beserta semua soalnya')) return;
    await fetch('/api/admin/subtopics/' + s.id, { method: 'DELETE', credentials: 'same-origin' });
    showToast('Subtopik dihapus.', 'success');
    loadAll();
  }

  async function deleteProblem(p) {
    const label = (p.question_display || '').slice(0, 40);
    if (!adminConfirmDelete('Soal "' + label + '"')) return;
    await fetch('/api/admin/problems/' + p.id, { method: 'DELETE', credentials: 'same-origin' });
    showToast('Soal dihapus.', 'success');
    if (selectedSubtopic) loadProblems(selectedSubtopic.id);
  }

  function summarizeProblem(p) {
    const raw = String((p && (p.question_display || p.question_text)) || 'Soal tanpa judul').replace(/\s+/g, ' ').trim();
    const text = typeof renderEquation === 'function' ? renderEquation(raw) : raw;
    return text.length > 110 ? text.slice(0, 107) + '…' : text;
  }

  async function moveProblemOrder(idx, nextIdx) {
    if (!selectedSubtopic || idx === nextIdx || nextIdx < 0 || nextIdx >= problems.length) return;
    const nextProblems = problems.slice();
    const current = nextProblems.splice(idx, 1)[0];
    nextProblems.splice(nextIdx, 0, current);
    try {
      await Promise.all(nextProblems.map((p, orderIdx) => fetch('/api/admin/problems/' + p.id + '/sort', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: orderIdx + 1 }),
      }).then((response) => {
        if (!response.ok) throw new Error('Gagal memindahkan urutan soal');
      })));
      showToast('Urutan soal diperbarui.', 'success');
      loadProblems(selectedSubtopic.id);
    } catch (e) {
      showToast(e.message || 'Gagal memindahkan urutan soal', 'error');
    }
  }

  return (
    <AdminModal title="Admin Panel" onClose={onClose} wide>
      <div className="flex gap-1 mb-5 pb-3" style={{ borderBottom: '1px solid rgba(11,19,38,.08)' }}>
        {[['chapters', 'Bab & Subtopik'], ['problems', 'Soal'], ['import', 'Import AI'], ['users', 'Pengguna']].map(function(pair) {
          const id = pair[0]; const label = pair[1];
          return (
            <button
              key={id}
              className={'mode-segment-item' + (tab === id ? ' is-active' : '')}
              style={tab === id ? { background: 'var(--ink)', color: 'white' } : {}}
              onClick={() => setTab(id)}
              type="button"
            >{label}</button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : tab === 'users' ? (
        <AdminUsersPanel />
      ) : tab === 'import' ? (
        <AdminAiImportPanel
          selectedSubtopic={selectedSubtopic}
          subtopics={subtopics}
          onSelectSubtopic={setSelectedSubtopic}
          onImported={(subtopicId) => {
            const nextSubtopic = subtopics.find((s) => s.id === subtopicId) || selectedSubtopic;
            if (nextSubtopic) setSelectedSubtopic(nextSubtopic);
            loadProblems(subtopicId);
            setTab('problems');
          }}
        />
      ) : tab === 'chapters' ? (
        <div className="admin-two-pane">
          <div>
            <div className="admin-pane-header">
              <span className="kicker">Bab</span>
              <button className="admin-btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setModal({ type: 'chapter', target: null })} type="button">+ Bab</button>
            </div>
            {chapters.map((c) => (
              <div key={c.id} className={'admin-tree-row' + (selectedChapter && selectedChapter.id === c.id ? ' is-active' : '')} onClick={() => { setSelectedChapter(c); setSelectedSubtopic(null); }}>
                <span className="admin-tree-label">{c.icon} {c.title}</span>
                <div className="flex gap-1 shrink-0">
                  <button className="admin-icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); setModal({ type: 'chapter', target: c }); }} type="button"><AdminIcon.Pencil /></button>
                  <button className="admin-icon-btn admin-icon-btn-danger" title="Hapus" onClick={(e) => { e.stopPropagation(); deleteChapter(c); }} type="button"><AdminIcon.Trash /></button>
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="admin-pane-header">
              <span className="kicker">{selectedChapter ? 'Subtopik · ' + selectedChapter.title : 'Subtopik'}</span>
              {selectedChapter && (
                <button className="admin-btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setModal({ type: 'subtopic', target: null })} type="button">+ Subtopik</button>
              )}
            </div>
            {!selectedChapter ? (
              <p className="text-sm text-ink/55">Pilih bab di sebelah kiri.</p>
            ) : filteredSubs.length === 0 ? (
              <p className="text-sm text-ink/55">Belum ada subtopik.</p>
            ) : filteredSubs.map((s) => (
              <div key={s.id} className={'admin-tree-row' + (selectedSubtopic && selectedSubtopic.id === s.id ? ' is-active' : '')} onClick={() => { setSelectedSubtopic(s); setTab('problems'); }}>
                <span className="admin-tree-label">{s.title}</span>
                <div className="flex gap-1 shrink-0">
                  <button className="admin-icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); setModal({ type: 'subtopic', target: s }); }} type="button"><AdminIcon.Pencil /></button>
                  <button className="admin-icon-btn admin-icon-btn-danger" title="Hapus" onClick={(e) => { e.stopPropagation(); deleteSubtopic(s); }} type="button"><AdminIcon.Trash /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="admin-pane-header mb-3">
            <AdminSelect
              value={selectedSubtopic ? selectedSubtopic.id : ''}
              onChange={(e) => {
                const s = subtopics.find((x) => x.id === Number(e.target.value));
                setSelectedSubtopic(s || null);
              }}
              options={[{ value: '', label: '— Pilih subtopik —' }].concat(subtopics.map((s) => ({ value: s.id, label: s.chapter_title + ' › ' + s.title })))}
              style={{ minWidth: 240 }}
            />
            {selectedSubtopic && (
              <button className="admin-btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setModal({ type: 'problem-add', target: null })} type="button">+ Soal</button>
            )}
          </div>
          {!selectedSubtopic ? (
            <p className="text-sm text-ink/55">Pilih subtopik untuk melihat soal.</p>
          ) : problems.length === 0 ? (
            <p className="text-sm text-ink/55">Belum ada soal di subtopik ini.</p>
          ) : (
            <div className="admin-problem-card-list">
              {problems.map((p, idx) => (
                <div
                  key={p.id}
                  className={[
                    'admin-problem-order-card',
                    dragProblemIndex === idx ? 'is-dragging' : '',
                    dragOverProblemIndex === idx && dragProblemIndex !== idx ? 'is-drop-target' : '',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onDragEnd={() => { setDragProblemIndex(null); setDragOverProblemIndex(null); }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragProblemIndex !== null && dragProblemIndex !== idx) setDragOverProblemIndex(idx);
                  }}
                  onDragStart={(e) => {
                    setDragProblemIndex(idx);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(idx));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromIdx = Number(e.dataTransfer.getData('text/plain'));
                    setDragProblemIndex(null);
                    setDragOverProblemIndex(null);
                    if (Number.isInteger(fromIdx)) moveProblemOrder(fromIdx, idx);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="admin-step-num shrink-0">{idx + 1}</span>
                      <span className="tag text-xs">{p.difficulty}</span>
                      <span className="tag text-xs">{p.question_type}</span>
                    </div>
                    <p className="admin-problem-order-title">{summarizeProblem(p)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0 mt-1">
                    <button className="admin-icon-btn" title="Edit soal" onClick={() => setModal({ type: 'problem', target: p })} type="button"><AdminIcon.Pencil /></button>
                    <button className="admin-icon-btn" title="Edit langkah" onClick={() => setModal({ type: 'steps', target: p })} type="button"><AdminIcon.Steps /></button>
                    <button className="admin-icon-btn admin-icon-btn-danger" title="Hapus" onClick={() => deleteProblem(p)} type="button"><AdminIcon.Trash /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal && modal.type === 'chapter' && (
        <AdminChapterModal chapter={modal.target} onDone={loadAll} onClose={() => setModal(null)} />
      )}
      {modal && modal.type === 'subtopic' && (
        <AdminSubtopicModal subtopic={modal.target} chapters={chapters} defaultChapterId={selectedChapter && selectedChapter.id} onDone={loadAll} onClose={() => setModal(null)} />
      )}
      {modal && modal.type === 'problem' && (
        <AdminProblemModal problem={modal.target} subtopics={subtopics} defaultSubtopicId={selectedSubtopic && selectedSubtopic.id} onDone={() => { if (selectedSubtopic) loadProblems(selectedSubtopic.id); }} onClose={() => setModal(null)} />
      )}
      {modal && modal.type === 'problem-add' && (
        <AdminPlugProblemModal subtopics={subtopics} defaultSubtopicId={selectedSubtopic && selectedSubtopic.id} defaultSortOrder={problems.length + 1} onDone={() => { if (selectedSubtopic) loadProblems(selectedSubtopic.id); }} onClose={() => setModal(null)} />
      )}
      {modal && modal.type === 'steps' && (
        <AdminStepsModal problemId={modal.target.id} questionText={modal.target.question_display} onClose={() => setModal(null)} />
      )}
    </AdminModal>
  );
};

// ─── Practice inline bar ──────────────────────────────────────────────────────
const AdminPracticeBar = ({ problem, problems, problemIndex, onProblemSelect, onProblemSaved, onProblemDeleted }) => {
  const [modal, setModal] = useAdminState(null);
  const [subtopics, setSubtopics] = useAdminState([]);

  useAdminEffect(() => {
    MafikingAPI.get('/api/admin/subtopics').then(setSubtopics).catch(() => setSubtopics([]));
  }, []);

  async function deleteProblem() {
    if (!adminConfirmDelete('soal ini')) return;
    await fetch('/api/admin/problems/' + problem.id, { method: 'DELETE', credentials: 'same-origin' });
    showToast('Soal dihapus.', 'success');
    if (onProblemDeleted) onProblemDeleted();
  }

  const slideProblems = Array.isArray(problems) && problems.length ? problems : [problem].filter(Boolean);
  const activeIndex = Number.isInteger(problemIndex) ? problemIndex : Math.max(0, slideProblems.findIndex((p) => p && problem && p.id === problem.id));

  return (
    <React.Fragment>
      <div className="admin-practice-slides">
        <div className="admin-practice-slide-head">
          <span className="kicker">Admin · Slide Soal</span>
          <div className="admin-practice-slide-actions">
            <button className="admin-practice-btn" onClick={() => setModal('edit')} type="button"><AdminIcon.Pencil /> Edit</button>
            <button className="admin-practice-btn" onClick={() => setModal('steps')} type="button"><AdminIcon.Steps /> Langkah</button>
            <button className="admin-practice-btn admin-practice-btn-danger" onClick={deleteProblem} type="button"><AdminIcon.Trash /> Hapus</button>
          </div>
        </div>
        <div className="admin-slide-strip" aria-label="Slide soal">
          {slideProblems.map((item, idx) => (
            <button
              aria-current={idx === activeIndex ? 'true' : undefined}
              className={'admin-slide-card' + (idx === activeIndex ? ' is-active' : '')}
              key={item.id || idx}
              onClick={() => { if (onProblemSelect) onProblemSelect(idx); }}
              type="button"
            >
              <span className="admin-slide-number">{idx + 1}</span>
              <span className="admin-slide-title">{item.question_display || 'Soal tanpa judul'}</span>
              <span className="admin-slide-meta">{item.difficulty || 'Easy'} · {item.question_type || 'open'}</span>
            </button>
          ))}
          <button
            className="admin-slide-card admin-slide-add"
            onClick={() => setModal('add')}
            type="button"
          >
            <span className="admin-slide-plus">+</span>
            <span>Tambah Soal</span>
          </button>
        </div>
      </div>
      {modal === 'edit' && (
        <AdminProblemModal problem={problem} subtopics={subtopics} defaultSubtopicId={problem.subtopic_id} onDone={() => { if (onProblemSaved) onProblemSaved(); }} onClose={() => setModal(null)} />
      )}
      {modal === 'steps' && (
        <AdminStepsModal problemId={problem.id} questionText={problem.question_display} onClose={() => setModal(null)} />
      )}
      {modal === 'add' && (
        <AdminPlugProblemModal subtopics={subtopics} defaultSubtopicId={problem.subtopic_id} defaultSortOrder={slideProblems.length + 1} onDone={() => { if (onProblemSaved) onProblemSaved(); }} onClose={() => setModal(null)} />
      )}
    </React.Fragment>
  );
};

// ─── Floating button ──────────────────────────────────────────────────────────
const AdminFloatButton = () => {
  const [open, setOpen] = useAdminState(false);
  return (
    <React.Fragment>
      <button
        aria-label="Buka Admin Panel"
        className="admin-float-btn"
        onClick={() => setOpen(true)}
        title="Admin Panel"
        type="button"
      >
        <AdminIcon.Shield />
      </button>
      {open && <AdminPanel onClose={() => setOpen(false)} />}
    </React.Fragment>
  );
};

// ─── Local chapter form (add / edit — no API, lost on refresh) ───────────────
const AdminLocalChapterForm = ({ chapter, onSave, onClose, defaultMapel }) => {
  const isEdit = Boolean(chapter);
  const existingTopics = chapter && Array.isArray(chapter.topics) ? chapter.topics.join(', ') : '';
  const [title, setTitle] = useAdminState((chapter && chapter.title) || '');
  const [est, setEst] = useAdminState((chapter && chapter.est) || '');
  const [topicsRaw, setTopicsRaw] = useAdminState(existingTopics);
  const [mapel, setMapelField] = useAdminState((chapter && chapter.mapel) || defaultMapel || 'Matematika');
  const [semester, setSemesterField] = useAdminState(chapter ? Number(chapter.semester) || 1 : 1);
  const [err, setErr] = useAdminState('');

  function save() {
    if (!title.trim()) { setErr('Judul wajib diisi.'); return; }
    const topics = topicsRaw.split(',').map(t => t.trim()).filter(Boolean);
    onSave({ title: title.trim(), est: est.trim(), mapel, semester: Number(semester), topics });
  }

  return (
    <AdminModal title={isEdit ? 'Edit Bab' : 'Tambah Bab'} onClose={onClose}>
      <AdminField label="Judul Bab" required error={err}>
        <AdminInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="contoh: Teknik Integrasi"
          autoFocus
        />
      </AdminField>
      <AdminField label="Mata Pelajaran">
        <select className="admin-input" value={mapel} onChange={(e) => setMapelField(e.target.value)}>
          <option>Matematika</option>
          <option>Fisika</option>
          <option>Kimia</option>
        </select>
      </AdminField>
      <AdminField label="Semester">
        <select className="admin-input" value={semester} onChange={(e) => setSemesterField(Number(e.target.value))}>
          <option value={1}>Semester 1</option>
          <option value={2}>Semester 2</option>
        </select>
      </AdminField>
      <AdminField label="Garis besar isi (pisah dengan koma)">
        <AdminInput value={topicsRaw} onChange={(e) => setTopicsRaw(e.target.value)} placeholder="Topik 1, Topik 2, Topik 3" />
      </AdminField>
      <AdminField label="Estimasi waktu (opsional)">
        <AdminInput value={est} onChange={(e) => setEst(e.target.value)} placeholder="45 mnt" />
      </AdminField>
      <div className="admin-form-actions">
        <button className="admin-btn-ghost" onClick={onClose} type="button">Batal</button>
        <button className="admin-btn-primary" onClick={save} type="button">
          {isEdit ? 'Simpan' : 'Tambah'}
        </button>
      </div>
    </AdminModal>
  );
};

// ─── Inline belajar admin view (local-only, resets on refresh) ────────────────
const AdminBelajarView = ({ setRoute, mapel, chapters, onChaptersChanged }) => {
  const [form, setForm] = useAdminState(null);
  const [saving, setSaving] = useAdminState(false);

  async function handleSave(data) {
    if (saving) return;
    setSaving(true);
    try {
      const nextOrder = chapters.length > 0
        ? Math.max(...chapters.map(c => c.num || c.sort_order || 0)) + 1
        : 1;
      if (form.target) {
        const res = await fetch('/api/admin/chapters/' + form.target.id, {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ ...data, sort_order: form.target.num || form.target.sort_order || 0 }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Gagal'); }
      } else {
        await MafikingAPI.post('/api/admin/chapters', { ...data, sort_order: nextOrder });
      }
      onChaptersChanged();
      setForm(null);
      showToast(form.target ? 'Bab diperbarui.' : 'Bab ditambahkan.', 'success');
    } catch (e) {
      showToast('Gagal: ' + (e.message || 'error'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!adminConfirmDelete('bab ini')) return;
    try {
      const res = await fetch('/api/admin/chapters/' + id, {
        method: 'DELETE', credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Gagal'); }
      onChaptersChanged();
      showToast('Bab dihapus.', 'success');
    } catch (e) {
      showToast('Gagal: ' + (e.message || 'error'), 'error');
    }
  }

  return (
    <div className="flex flex-col mapel-stagger">
      {chapters.map((c, idx) => {
        const pct = c.total > 0 ? (c.progress / c.total) * 100 : 0;
        return (
          <div key={c.id} className={idx > 0 ? 'border-t hairline' : ''}>
            {/* Same layout as ChaptersNumbered */}
            <div className="group flex gap-5 md:gap-8 py-7 -mx-2 px-2 rounded-xl transition-all hover:bg-ink/[0.018] items-center">
              <div className="font-display font-bold text-5xl md:text-7xl tnum text-ink/10 shrink-0 w-16 md:w-24 text-right leading-none mt-1">
                {String(c.num || idx + 1).padStart(2, '0')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {c.progress > 0 && <span className="tag-yel tag">Aktif</span>}
                  <span className="text-xs text-ink/55 flex items-center gap-1">
                    <Icon.Clock className="w-3 h-3" /> {c.est || '—'} · {c.total} soal
                  </span>
                </div>
                <h3 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.02em] leading-tight mb-1.5">
                  {c.icon ? c.icon + ' ' : ''}{c.title}
                </h3>
                {pct > 0 && (
                  <div className="flex items-center gap-3 mt-3">
                    <div className="bar w-40"><div style={{ width: pct + '%' }}></div></div>
                    <span className="text-xs font-mono text-ink/45 tnum">{c.progress}/{c.total}</span>
                  </div>
                )}
              </div>
              {/* Admin controls */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className="admin-icon-btn"
                  title="Edit bab"
                  onClick={() => setForm({ target: c })}
                  type="button"
                >
                  <AdminIcon.Pencil />
                </button>
                <button
                  className="admin-icon-btn admin-icon-btn-danger"
                  title="Hapus bab"
                  onClick={() => handleDelete(c.id)}
                  type="button"
                >
                  <AdminIcon.Trash />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add chapter row */}
      <div className={chapters.length > 0 ? 'border-t hairline pt-6' : 'pt-2'}>
        <button
          className="group flex gap-5 md:gap-8 py-5 -mx-2 px-2 rounded-xl transition-all hover:bg-ink/[0.018] items-center w-full text-left"
          onClick={() => setForm({ target: null })}
          type="button"
        >
          <div className="font-display font-bold text-5xl md:text-7xl tnum text-ink/[0.06] shrink-0 w-16 md:w-24 text-right leading-none">
            +
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-display font-bold text-xl md:text-2xl tracking-[-0.02em] text-ink/30 group-hover:text-ink/50 transition-colors">
              Tambah Bab Baru
            </span>
          </div>
        </button>
      </div>

      {form && (
        <AdminLocalChapterForm
          chapter={form.target}
          onSave={handleSave}
          onClose={() => setForm(null)}
          defaultMapel={mapel}
        />
      )}
    </div>
  );
};
