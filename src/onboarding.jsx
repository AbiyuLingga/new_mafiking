const ONBOARDING_FACULTIES = ['FMIPA', 'SITH-R', 'SITH-S', 'SF', 'FITB', 'FTSL', 'FTI', 'FTMD', 'FTTM', 'STEI-K', 'STEI-R', 'SAPPK'];
const ONBOARDING_SUBJECTS = ['Matematika', 'Fisika', 'Kimia'];

const emptyOnboardingDraft = (user) => {
  const currentName = String(user?.display_name || '').startsWith('Tamu_') ? '' : (user?.display_name || user?.suggested_display_name || '');
  const rawSubjects = Array.isArray(user?.mapel_prioritas) ? user.mapel_prioritas : [];
  return {
    display_name: currentName,
    phone_number: user?.phone_number || '',
    semester: user?.semester ? String(user.semester) : '',
    fakultas: user?.fakultas || '',
    jurusan: user?.jurusan || '',
    mapel_prioritas: rawSubjects.filter((subject) => ONBOARDING_SUBJECTS.includes(subject)),
  };
};

const ProfileOnboardingModal = ({ user, onComplete }) => {
  const [step, setStep] = React.useState(0);
  const [draft, setDraft] = React.useState(() => emptyOnboardingDraft(user));
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const storageKey = user?.id ? `mafiking:onboarding:${user.id}` : '';

  React.useEffect(() => {
    if (!storageKey) return;
    const base = emptyOnboardingDraft(user);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      setDraft({
        ...base,
        ...saved,
        mapel_prioritas: Array.isArray(saved.mapel_prioritas) ? saved.mapel_prioritas.filter((subject) => ONBOARDING_SUBJECTS.includes(subject)) : base.mapel_prioritas,
      });
    } catch (_) {
      setDraft(base);
    }
    setStep(0);
    setError('');
  }, [storageKey]);

  React.useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey]);

  React.useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  function patchDraft(patch) {
    setError('');
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.semester) {
        if (Number(patch.semester) === 1) next.jurusan = '';
        else next.fakultas = '';
      }
      return next;
    });
  }

  function selectedSemester() {
    return Number(draft.semester || 0);
  }

  function validateStep(targetStep = step) {
    if (targetStep === 1) {
      if (!draft.display_name.trim()) return 'Nama lengkap wajib diisi.';
      if (!/^[0-9+\-\s]{8,20}$/.test(draft.phone_number.trim())) return 'No. HP harus 8-20 karakter dan hanya boleh angka, spasi, +, atau -.';
      if (!selectedSemester()) return 'Semester wajib dipilih.';
    }
    if (targetStep === 2) {
      if (selectedSemester() === 1 && !draft.fakultas) return 'Fakultas wajib dipilih.';
      if (selectedSemester() !== 1 && !draft.jurusan.trim()) return 'Jurusan wajib diisi.';
    }
    if (targetStep === 3 && draft.mapel_prioritas.length < 1) return 'Pilih minimal satu mapel prioritas.';
    return '';
  }

  function goNext() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setStep((current) => Math.min(current + 1, 4));
  }

  function toggleSubject(subject) {
    setError('');
    setDraft((current) => {
      const exists = current.mapel_prioritas.includes(subject);
      const nextSubjects = exists
        ? current.mapel_prioritas.filter((item) => item !== subject)
        : [...current.mapel_prioritas, subject].slice(0, 3);
      return { ...current, mapel_prioritas: nextSubjects };
    });
  }

  async function submitProfile() {
    for (const targetStep of [1, 2, 3]) {
      const message = validateStep(targetStep);
      if (message) {
        setStep(targetStep);
        setError(message);
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const updated = await MafikingAPI.post('/api/auth/profile-onboarding', {
        display_name: draft.display_name.trim(),
        phone_number: draft.phone_number.trim(),
        semester: selectedSemester(),
        fakultas: selectedSemester() === 1 ? draft.fakultas : '',
        jurusan: selectedSemester() === 1 ? '' : draft.jurusan.trim(),
        mapel_prioritas: draft.mapel_prioritas,
      });
      if (storageKey) localStorage.removeItem(storageKey);
      if (typeof onComplete === 'function') onComplete(updated);
      showToast('Data profil tersimpan.', 'success');
    } catch (err) {
      setError(err.message || 'Gagal menyimpan data profil.');
    } finally {
      setSaving(false);
    }
  }

  const progress = ((step + 1) / 5) * 100;
  const semesters = Array.from({ length: 8 }, (_, index) => String(index + 1));

  return ReactDOM.createPortal((
    <div className="onboarding-overlay" role="presentation">
      <div className="onboarding-shell">
        {step > 0 && (
          <button
            aria-label="Kembali ke langkah sebelumnya"
            className="onboarding-floating-back"
            disabled={saving}
            onClick={() => { setError(''); setStep((current) => Math.max(0, current - 1)); }}
            type="button"
          >
            <svg className="onboarding-back-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 6 9 12l6 6" />
            </svg>
          </button>
        )}
        <section className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="profile-onboarding-title">
        <div className="onboarding-topbar">
          <div className="onboarding-progress" aria-label={`Langkah ${step + 1} dari 5`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        {step === 0 && (
          <div className="onboarding-step onboarding-step-center">
            <div className="onboarding-kicker">Profil Mafiking</div>
            <h2 id="profile-onboarding-title">Sebelum lanjut lengkapi data kamu terlebih dahulu</h2>
            <button className="onboarding-primary" onClick={goNext} type="button">Lanjut</button>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-step">
            <div className="onboarding-kicker">Data Dasar</div>
            <h2 id="profile-onboarding-title">Ceritakan sedikit tentang kamu.</h2>
            <label>Nama Lengkap</label>
            <input value={draft.display_name} onChange={(event) => patchDraft({ display_name: event.target.value })} placeholder="Nama lengkap" autoFocus />
            <label>No. HP</label>
            <input value={draft.phone_number} onChange={(event) => patchDraft({ phone_number: event.target.value })} placeholder="08xx atau +62" inputMode="tel" />
            <label>Semester berapa?</label>
            <div className="onboarding-pill-grid">
              {semesters.map((semester) => (
                <button key={semester} className={`onboarding-pill ${draft.semester === semester ? 'is-selected' : ''}`} onClick={() => patchDraft({ semester })} type="button">
                  Semester {semester}
                </button>
              ))}
            </div>
            <button className="onboarding-primary" onClick={goNext} type="button">Lanjut</button>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <div className="onboarding-kicker">Akademik</div>
            {selectedSemester() === 1 ? (
              <>
                <h2 id="profile-onboarding-title">Fakultas apa?</h2>
                <div className="onboarding-pill-grid">
                  {ONBOARDING_FACULTIES.map((faculty) => (
                    <button key={faculty} className={`onboarding-pill ${draft.fakultas === faculty ? 'is-selected' : ''}`} onClick={() => patchDraft({ fakultas: faculty })} type="button">
                      {faculty}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 id="profile-onboarding-title">Jurusan apa?</h2>
                <label>Jurusan</label>
                <input value={draft.jurusan} onChange={(event) => patchDraft({ jurusan: event.target.value })} placeholder="Contoh: Teknik Informatika" autoFocus />
              </>
            )}
            <button className="onboarding-primary" onClick={goNext} type="button">Lanjut</button>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-step">
            <div className="onboarding-kicker">Prioritas Belajar</div>
            <h2 id="profile-onboarding-title">Mapel prioritas</h2>
            <p>Pilih satu sampai tiga mapel yang paling ingin kamu kejar dulu.</p>
            <div className="onboarding-pill-grid onboarding-pill-grid-large">
              {ONBOARDING_SUBJECTS.map((subject) => (
                <button key={subject} className={`onboarding-pill ${draft.mapel_prioritas.includes(subject) ? 'is-selected' : ''}`} onClick={() => toggleSubject(subject)} type="button">
                  {subject}
                </button>
              ))}
            </div>
            <button className="onboarding-primary" onClick={goNext} type="button">Lanjut</button>
          </div>
        )}

        {step === 4 && (
          <div className="onboarding-step onboarding-step-center">
            <div className="onboarding-kicker">Selesai</div>
            <h2 id="profile-onboarding-title">Terimakasih Telah Mengisi</h2>
            <p>Profil belajarmu siap dipakai untuk menyesuaikan pengalaman Mafiking.</p>
            <button className="onboarding-primary" disabled={saving} onClick={submitProfile} type="button">
              {saving ? 'Menyimpan...' : 'Selesai'}
            </button>
          </div>
        )}

        {error && <div className="onboarding-error" role="alert">{error}</div>}
      </section>
      </div>
    </div>
  ), document.body);
};

window.ProfileOnboardingModal = ProfileOnboardingModal;
