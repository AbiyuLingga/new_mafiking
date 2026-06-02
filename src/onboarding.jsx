const ONBOARDING_FACULTIES = ['FMIPA', 'FITB', 'FTMD', 'FTTM', 'FTSL', 'FTI', 'SF', 'SAPPK', 'SITH-S', 'SITH-R', 'STEI-R', 'STEI-K'];
const ONBOARDING_SUBJECTS = ['Matematika', 'Fisika', 'Kimia'];
const ONBOARDING_MAJORS_BY_FACULTY = {
  FMIPA: ['Matematika', 'Fisika', 'Astronomi', 'Kimia', 'Aktuaria'],
  'SITH-R': ['Rekayasa Hayati', 'Rekayasa Pertanian', 'Rekayasa Kehutanan', 'Teknologi Pasca Panen'],
  'SITH-S': ['Biologi', 'Mikrobiologi'],
  SF: ['Sains dan Teknologi Farmasi', 'Farmasi Klinik dan Komunitas'],
  FITB: ['Teknik Geologi', 'Teknik Geodesi dan Geomatika', 'Meteorologi', 'Oseanografi'],
  FTSL: ['Teknik Sipil', 'Teknik Lingkungan', 'Teknik Kelautan', 'Rekayasa Infrastruktur Lingkungan', 'Teknik dan Pengelolaan Sumber Daya Air'],
  FTI: ['Teknik Kimia', 'Teknik Fisika', 'Teknik Industri', 'Manajemen Rekayasa Industri', 'Teknik Bioenergi dan Kemurgi', 'Teknik Pangan'],
  FTMD: ['Teknik Mesin', 'Teknik Dirgantara', 'Teknik Material'],
  FTTM: ['Teknik Pertambangan', 'Teknik Perminyakan', 'Teknik Geofisika', 'Teknik Metalurgi'],
  'STEI-K': ['Teknik Informatika', 'Sistem dan Teknologi Informasi'],
  'STEI-R': ['Teknik Elektro', 'Teknik Tenaga Listrik', 'Teknik Telekomunikasi', 'Teknik Biomedis'],
  SAPPK: ['Arsitektur', 'Perencanaan Wilayah dan Kota'],
};

const ONBOARDING_REFERRAL_OTHER = 'Lainnya';
const ONBOARDING_REFERRAL_OPTIONS = ['Instagram', 'WhatsApp/Line', 'Teman', 'Orang Tua', ONBOARDING_REFERRAL_OTHER];

const emptyOnboardingDraft = (user) => {
  const currentName = String(user?.display_name || '').startsWith('Tamu_') ? '' : (user?.display_name || user?.suggested_display_name || '');
  const rawSubjects = Array.isArray(user?.mapel_prioritas) ? user.mapel_prioritas : [];
  return {
    display_name: currentName,
    semester: user?.semester ? String(user.semester) : '',
    fakultas: user?.fakultas || '',
    jurusan: user?.jurusan || '',
    mapel_prioritas: rawSubjects.filter((subject) => ONBOARDING_SUBJECTS.includes(subject)),
    referral: String(user?.referral_source || user?.referral || '').startsWith(`${ONBOARDING_REFERRAL_OTHER}: `)
      ? ONBOARDING_REFERRAL_OTHER
      : user?.referral_source || user?.referral || '',
    referral_other: String(user?.referral_source || user?.referral || '').startsWith(`${ONBOARDING_REFERRAL_OTHER}: `)
      ? String(user?.referral_source || user?.referral || '').slice(`${ONBOARDING_REFERRAL_OTHER}: `.length)
      : '',
  };
};

const ProfileOnboardingModal = ({ user, onComplete, onRequestLogout = null }) => {
  const [step, setStep] = React.useState(1);
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
        mapel_prioritas: base.mapel_prioritas,
      });
    } catch (_) {
      setDraft(base);
    }
    setStep(1);
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
      if (patch.semester && patch.semester !== current.semester) {
        next.fakultas = '';
        next.jurusan = '';
      }
      if (patch.fakultas && patch.fakultas !== current.fakultas) next.jurusan = '';
      return next;
    });
  }

  function selectedSemester() {
    return Number(draft.semester || 0);
  }

  function selectedMajorOptions() {
    return ONBOARDING_MAJORS_BY_FACULTY[draft.fakultas] || [];
  }

  function needsMajorStep() {
    return selectedSemester() === 2;
  }

  function priorityStep() {
    return needsMajorStep() ? 4 : 3;
  }

  function finishStep() {
    return needsMajorStep() ? 5 : 4;
  }

  function validateStep(targetStep = step) {
    if (targetStep === 1) {
      if (!draft.display_name.trim()) return 'Nama lengkap wajib diisi.';
      if (!selectedSemester()) return 'Semester wajib dipilih.';
      if (!ONBOARDING_REFERRAL_OPTIONS.includes(draft.referral)) return 'Pilih sumber kamu mengenal Mafiking.';
      if (draft.referral === ONBOARDING_REFERRAL_OTHER && !draft.referral_other.trim()) return 'Tulis sumber kamu mengenal Mafiking.';
      if (draft.referral === ONBOARDING_REFERRAL_OTHER && draft.referral_other.trim().length > 80) return 'Sumber lainnya maksimal 80 karakter.';
    }
    if (targetStep === 2) {
      if (!draft.fakultas) return 'Fakultas wajib dipilih.';
    }
    if (targetStep === 3 && needsMajorStep()) {
      if (!draft.jurusan.trim()) return 'Jurusan wajib dipilih.';
      if (!selectedMajorOptions().includes(draft.jurusan)) return 'Jurusan tidak sesuai dengan fakultas yang dipilih.';
    }
    if (targetStep === priorityStep() && draft.mapel_prioritas.length < 1) return 'Pilih minimal satu mapel prioritas.';
    return '';
  }

  function goNext() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setStep((current) => Math.min(current + 1, finishStep()));
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

  function selectedReferralSource() {
    if (draft.referral === ONBOARDING_REFERRAL_OTHER) return `${ONBOARDING_REFERRAL_OTHER}: ${draft.referral_other.trim()}`;
    return draft.referral;
  }

  async function submitProfile() {
    const validationSteps = needsMajorStep() ? [1, 2, 3, 4] : [1, 2, 3];
    for (const targetStep of validationSteps) {
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
        semester: selectedSemester(),
        fakultas: draft.fakultas,
        jurusan: needsMajorStep() ? draft.jurusan.trim() : '',
        mapel_prioritas: draft.mapel_prioritas,
        referral: selectedReferralSource(),
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

  const semesters = ['1', '2'];
  const renderSubjectStep = () => (
    <div className="onboarding-step">
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
  );
  const renderFinishStep = () => (
    <div className="onboarding-step onboarding-step-center">
      <div className="onboarding-kicker">Selesai</div>
      <h2 id="profile-onboarding-title">Terimakasih Telah Mengisi</h2>
      <p>Profil belajarmu siap dipakai untuk menyesuaikan pengalaman Mafiking.</p>
      <button className="onboarding-primary" disabled={saving} onClick={submitProfile} type="button">
        {saving ? 'Menyimpan...' : 'Selesai'}
      </button>
    </div>
  );

  return ReactDOM.createPortal((
    <div className="onboarding-overlay" role="presentation">
      <div className="onboarding-shell">
        {step > 1 && (
          <button
            aria-label="Kembali ke langkah sebelumnya"
            className="onboarding-floating-back"
            disabled={saving}
            onClick={() => { setError(''); setStep((current) => Math.max(1, current - 1)); }}
            type="button"
          >
            <svg className="onboarding-back-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 6 9 12l6 6" />
            </svg>
          </button>
        )}
        {typeof onRequestLogout === 'function' && (
          <button
            aria-label="Logout"
            className="onboarding-logout-button"
            disabled={saving}
            onClick={onRequestLogout}
            title="Logout"
            type="button"
          >
            <svg className="onboarding-logout-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M21 4v16" />
            </svg>
          </button>
        )}
        <section className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="profile-onboarding-title">
        {step === 1 && (
          <div className="onboarding-step">
            <h2 id="profile-onboarding-title">Ceritakan sedikit tentang kamu.</h2>
            <label>Nama Lengkap</label>
            <input value={draft.display_name} onChange={(event) => patchDraft({ display_name: event.target.value })} placeholder="Nama lengkap" autoFocus />
            <label>Tau Mafiking dari mana?</label>
            <div className="onboarding-select-wrap">
              <select
                aria-label="Tau Mafiking dari mana?"
                className="onboarding-select"
                value={draft.referral}
                onChange={(event) => patchDraft({ referral: event.target.value })}
              >
                <option value="" disabled>Pilih salah satu</option>
                {ONBOARDING_REFERRAL_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <svg className="onboarding-select-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 10 5 5 5-5" />
              </svg>
            </div>
            {draft.referral === ONBOARDING_REFERRAL_OTHER && (
              <input
                aria-label="Sumber lainnya"
                className="onboarding-other-input"
                value={draft.referral_other}
                onChange={(event) => patchDraft({ referral_other: event.target.value })}
                placeholder="Tulis sumber lainnya"
                maxLength={80}
              />
            )}
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
            <h2 id="profile-onboarding-title">Fakultas apa?</h2>
            <div className="onboarding-pill-grid">
              {ONBOARDING_FACULTIES.map((faculty) => (
                <button key={faculty} className={`onboarding-pill ${draft.fakultas === faculty ? 'is-selected' : ''}`} onClick={() => patchDraft({ fakultas: faculty })} type="button">
                  {faculty}
                </button>
              ))}
            </div>
            <button className="onboarding-primary" onClick={goNext} type="button">Lanjut</button>
          </div>
        )}

        {step === 3 && needsMajorStep() && (
          <div className="onboarding-step">
            <h2 id="profile-onboarding-title">Jurusan apa?</h2>
            <div className="onboarding-pill-grid onboarding-pill-grid-large">
              {selectedMajorOptions().map((major) => (
                <button key={major} className={`onboarding-pill ${draft.jurusan === major ? 'is-selected' : ''}`} onClick={() => patchDraft({ jurusan: major })} type="button">
                  {major}
                </button>
              ))}
            </div>
            <button className="onboarding-primary" onClick={goNext} type="button">Lanjut</button>
          </div>
        )}

        {step === 3 && !needsMajorStep() && renderSubjectStep()}

        {step === 4 && needsMajorStep() && renderSubjectStep()}

        {step === 4 && !needsMajorStep() && renderFinishStep()}

        {step === 5 && needsMajorStep() && renderFinishStep()}

        {error && <div className="onboarding-error" role="alert">{error}</div>}
      </section>
      </div>
    </div>
  ), document.body);
};

window.ProfileOnboardingModal = ProfileOnboardingModal;
