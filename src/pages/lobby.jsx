// MAFIKING Lobby — minimalist with 3 hero variants

const Lobby = ({ setRoute, tweaks, currentUser, isAdmin = false, showTryoutLink = true, authMode = null, authRedirect = null, authBackRoute = null, authState = null, onAuthSuccess, pendingClerkUser = null }) => {
  if (authMode) {
    return (
      <AuthScreen
        mode={authMode}
        redirect={authRedirect}
        backRoute={authBackRoute}
        authState={authState}
        setRoute={setRoute}
        onSuccess={onAuthSuccess}
        currentUser={currentUser}
        initialClerkUser={pendingClerkUser}
      />
    );
  }

  return (
    <div>
      <Landing setRoute={setRoute} tweaks={tweaks} isAdmin={isAdmin} currentUser={currentUser} showTryoutLink={showTryoutLink} />
    </div>
  );
};

const DevScreen = ({ unlockCount, onUnlockAttempt }) => {
  const dotsLeft = Math.max(0, 4 - unlockCount);
  return (
    <div onClick={onUnlockAttempt} style={{
      backgroundColor: '#ffffff',
      backgroundImage:
        'linear-gradient(rgba(11,19,38,0.045) 1px, transparent 1px),' +
        'linear-gradient(90deg, rgba(11,19,38,0.045) 1px, transparent 1px)',
      backgroundSize: '40px 40px',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      userSelect: 'none',
      cursor: 'pointer',
    }}>
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 24px' }}>
        <img src="/assets/logo.png" alt="Mafiking" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 24, opacity: 0.9 }} />
        <h1 style={{
          color: '#0b1326',
          fontSize: 'clamp(28px, 6vw, 52px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '0 0 12px',
          lineHeight: 1.1,
        }}>
          Under development
        </h1>
        <p style={{ color: 'rgba(11,19,38,0.4)', fontSize: 14, margin: 0 }}>
          {'· '.repeat(dotsLeft).trim() || ''}
        </p>
      </div>
    </div>
  );
};

const GoogleLogoIcon = ({ size = 18 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 18 18">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.72H.94v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.96 10.7A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.16.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.34 2.82.94 4.03l3.02-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.59-2.59C13.46.88 11.43 0 9 0A9 9 0 0 0 .94 4.97L3.96 7.3C4.67 5.16 6.66 3.58 9 3.58z" />
  </svg>
);

const BackArrowIcon = ({ size = 14 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none">
    <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.75 10H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const EnvelopeIcon = ({ size = 24 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
    <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EyeIcon = ({ size = 18, hidden = false }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
    {hidden && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
  </svg>
);

const EMAIL_VERIFIED_EVENT_KEY = "mafiking:email-verified";
const AUTH_SCREEN_BACK_PATH_STORAGE_KEY = "mafiking:last-non-auth-path";

const AuthScreen = ({ mode = "login", redirect = null, backRoute = null, authState = null, setRoute, onSuccess, currentUser = null, initialClerkUser = null }) => {
  const { useState } = React;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState(initialClerkUser?.suggested_display_name || initialClerkUser?.display_name || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clerkLoading, setClerkLoading] = useState(false);
  const [clerkEnabled, setClerkEnabled] = useState(false);
  const [pendingClerkUser, setPendingClerkUser] = useState(initialClerkUser || null);
  const [verifyState, setVerifyState] = useState(() => authState || {});
  const [verifyStatus, setVerifyStatus] = useState("idle");
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(Number(authState?.cooldownSeconds || 0));
  const isSignup = mode === "signup";
  const isVerifyEmail = mode === "verify-email";
  const isVerifyToken = mode === "verify-email-token";
  const isGuestUser = currentUser && currentUser.display_name?.startsWith('Tamu_');
  const verificationSyncRef = React.useRef(false);
  const verifyTokenSubmitRef = React.useRef(false);
  const isSafeBackPath = (path) => {
    const clean = String(path || '').split('?')[0].replace(/\/+$/, '') || '/';
    return Boolean(path && path.startsWith('/') && clean !== '/login' && clean !== '/signup' && clean !== '/profil' && clean !== '/profile');
  };
  const readBackPath = () => {
    try {
      const path = String(window.sessionStorage.getItem(AUTH_SCREEN_BACK_PATH_STORAGE_KEY) || '').trim();
      if (isSafeBackPath(path)) return path;
    } catch (_) {}
    try {
      if (!document.referrer) return '';
      const referrerUrl = new URL(document.referrer);
      if (referrerUrl.origin !== window.location.origin) return '';
      const path = `${referrerUrl.pathname}${referrerUrl.search}${referrerUrl.hash}`;
      if (isSafeBackPath(path)) return path;
    } catch (_) {}
    return '';
  };
  const goBack = () => {
    const backPath = readBackPath();
    if (backPath) {
      window.location.assign(backPath);
      return;
    }
    if (backRoute) {
      setRoute(backRoute);
      return;
    }
    window.location.assign("/");
  };

  React.useEffect(() => {
    let alive = true;
    if (!window.MafikingClerk || typeof window.MafikingClerk.isEnabled !== 'function') return undefined;
    window.MafikingClerk.isEnabled()
      .then((enabled) => {
        if (alive) setClerkEnabled(Boolean(enabled));
      })
      .catch(() => {
        if (alive) setClerkEnabled(false);
      });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    if (!initialClerkUser) return;
    setPendingClerkUser(initialClerkUser);
    setDisplayName(initialClerkUser.suggested_display_name || initialClerkUser.display_name || '');
  }, [initialClerkUser]);

  React.useEffect(() => {
    if (!authState) return;
    setVerifyState(authState);
    setCooldown(Number(authState.cooldownSeconds || 0));
  }, [authState]);

  const confirmEmailVerification = React.useCallback(async () => {
    const token = String(authState?.token || verifyState?.token || '').trim();
    if (!token) {
      setVerifyStatus("failed");
      setError("Token verifikasi tidak ditemukan.");
      return;
    }
    setVerifyStatus("verifying");
    setError("");
    try {
      const verified = await MafikingAPI.post('/api/auth/verify-email', { token });
      setVerifyStatus("success");
      try {
        window.localStorage.setItem(EMAIL_VERIFIED_EVENT_KEY, JSON.stringify({
          at: Date.now(),
          email: verified && verified.email ? String(verified.email).toLowerCase() : "",
        }));
      } catch (_) {}
      const user = await MafikingAPI.get('/api/auth/me').catch(() => null);
      if (user && typeof onSuccess === 'function') {
        window.setTimeout(() => onSuccess(user, redirect), 650);
      }
    } catch (err) {
      setVerifyStatus("failed");
      setError(err.message || "Link verifikasi tidak valid atau sudah kadaluarsa.");
    }
  }, [authState?.token, verifyState?.token, onSuccess, redirect]);

  React.useEffect(() => {
    if (!isVerifyToken || verifyTokenSubmitRef.current) return;
    verifyTokenSubmitRef.current = true;
    confirmEmailVerification();
  }, [isVerifyToken, confirmEmailVerification]);

  React.useEffect(() => {
    if (!isVerifyEmail) return undefined;

    const handleStorage = (event) => {
      if (event.key !== EMAIL_VERIFIED_EVENT_KEY || verificationSyncRef.current) return;
      let payload = {};
      try {
        payload = JSON.parse(event.newValue || "{}");
      } catch (_) {
        payload = {};
      }
      const verifiedEmail = String(payload.email || "").trim().toLowerCase();
      const waitingEmail = String(verifyState?.email || authState?.email || "").trim().toLowerCase();
      if (waitingEmail && verifiedEmail && waitingEmail !== verifiedEmail) return;
      verificationSyncRef.current = true;
      setVerifyStatus("success");
      setError("");
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [isVerifyEmail, verifyState?.email, authState?.email]);

  React.useEffect(() => {
    if (!isVerifyEmail || cooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, Number(current || 0) - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isVerifyEmail, cooldown]);

  const openVerifyScreen = (state) => {
    const nextState = {
      email: state.email || username.trim(),
      displayName: state.displayName || '',
      cooldownSeconds: Number(state.cooldownSeconds || 60),
      sentAt: new Date().toISOString(),
    };
    setVerifyState(nextState);
    setCooldown(nextState.cooldownSeconds);
    setRoute({ route: "lobby", authMode: "verify-email", authState: nextState, authRedirect: redirect, authBackRoute: backRoute });
  };

  const resendVerification = async () => {
    const email = String(verifyState?.email || username || '').trim();
    if (!email) {
      setError("Masukkan email terlebih dahulu.");
      return;
    }
    setResendLoading(true);
    setError("");
    try {
      const result = await MafikingAPI.post('/api/auth/resend-verification', { email });
      setVerifyState((current) => ({
        ...current,
        email,
        cooldownSeconds: Number(result.cooldownSeconds || 60),
        sentAt: new Date().toISOString(),
      }));
      setCooldown(Number(result.cooldownSeconds || 60));
    } catch (err) {
      setError(err.message || "Gagal mengirim ulang email verifikasi.");
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isSignup) {
        const email = username.trim();
        const result = await MafikingAPI.post('/api/auth/register', {
          username: email,
          password,
          display_name: email.split("@")[0] || email,
          fakultas: '',
        });
        if (result.requiresVerification) {
          openVerifyScreen(result);
          return;
        }
      } else {
        const result = await MafikingAPI.post('/api/auth/login', { username, password });
        if (result.requiresVerification) {
          openVerifyScreen(result);
          return;
        }
      }
      const user = await MafikingAPI.get('/api/auth/me');
      if (typeof onSuccess === 'function') onSuccess(user, redirect);
      else setRoute(redirect || { route: "belajar", section: "Try Out" });
    } catch (err) {
      setError(err.message || (isSignup ? 'Sign up gagal.' : 'Email atau password salah.'));
    } finally {
      setLoading(false);
    }
  };

  const normalizeRedirectValue = (value) => {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (trimmed[0] === '{' || trimmed[0] === '[') {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) {}
      }
      return trimmed;
    }
    return null;
  };

  const prefersFullPageGoogleAuth = () => {
    try {
      if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
    } catch (_) {}
    try {
      const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
      if (coarsePointer && !canHover) return true;
    } catch (_) {}
    try {
      return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    } catch (_) {
      return false;
    }
  };

  const handleClerkAuth = async () => {
    setClerkLoading(true);
    setError('');
    try {
      if (!window.MafikingClerk) {
        throw new Error('Login Google belum siap dimuat.');
      }

      if (
        prefersFullPageGoogleAuth()
        && typeof window.MafikingClerk.openAuth === 'function'
      ) {
        await window.MafikingClerk.openAuth(isSignup ? 'signup' : 'login', {
          provider: 'google',
          redirect,
        });
        return;
      }

      if (typeof window.MafikingClerk.openGooglePopup !== 'function') {
        if (typeof window.MafikingClerk.openAuth === 'function') {
          await window.MafikingClerk.openAuth(isSignup ? 'signup' : 'login', {
            provider: 'google',
            redirect,
          });
          return;
        }
        throw new Error('Login Google belum siap dimuat.');
      }

      const result = await window.MafikingClerk.openGooglePopup(isSignup ? 'signup' : 'login', {
        redirect,
      });
      const user = result && result.user ? result.user : null;
      if (!user) throw new Error('Login Google belum selesai.');
      const resolvedRedirect = normalizeRedirectValue(result.redirect) || normalizeRedirectValue(redirect);
      if (typeof onSuccess === 'function') onSuccess(user, resolvedRedirect);
      else setRoute(resolvedRedirect || { route: "belajar", section: "Try Out" });
    } catch (err) {
      setError(err.message || 'Login Google gagal.');
    } finally {
      setClerkLoading(false);
    }
  };

  const submitClerkDisplayName = async (e) => {
    e.preventDefault();
    setClerkLoading(true);
    setError('');
    try {
      const user = await MafikingAPI.post('/api/auth/clerk-onboard', {
        display_name: displayName,
        guest_user_id: isGuestUser ? currentUser.id : null,
      });
      setPendingClerkUser(null);
      if (typeof onSuccess === 'function') onSuccess(user, redirect);
      else setRoute(redirect || { route: "belajar", section: "Try Out" });
    } catch (err) {
      setError(err.message || 'Gagal menyimpan nama tampilan.');
    } finally {
      setClerkLoading(false);
    }
  };

  if (pendingClerkUser) {
    return (
      <div style={{
        backgroundColor: '#ffffff',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}>
        <form onSubmit={submitClerkDisplayName} style={{
          background: '#ffffff',
          border: '1px solid rgba(11,19,38,0.1)',
          borderRadius: 24,
          boxShadow: '0 8px 40px rgba(11,19,38,0.08)',
          margin: '0 16px',
          maxWidth: 420,
          padding: 40,
          width: '100%',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <img src="/assets/logo.png" alt="Mafiking" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 10 }} />
            <h1 style={{ color: '#0b1326', fontSize: 26, fontWeight: 800, margin: 0 }}>Pilih nama tampilan</h1>
            <p style={{ color: 'rgba(11,19,38,0.55)', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
              Nama ini yang akan muncul di akun Mafiking kamu.
            </p>
          </div>
          <label style={{ display: 'block', fontSize: 13, color: 'rgba(11,19,38,0.65)', fontWeight: 700, marginBottom: 8 }}>Nama tampilan</label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Nama kamu"
            required
            autoFocus
            style={{
              width: '100%', padding: '13px 16px', boxSizing: 'border-box',
              background: '#f8f8f8', border: '1px solid rgba(11,19,38,0.12)',
              borderRadius: 12, color: '#0b1326', fontSize: 15, outline: 'none',
            }}
          />
          {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{error}</p>}
          <button
            type="submit"
            disabled={clerkLoading}
            style={{
              width: '100%', padding: 14, marginTop: 22,
              background: clerkLoading ? 'rgba(11,19,38,0.4)' : '#0b1326',
              color: '#FFF44F', border: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 800, cursor: clerkLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {clerkLoading ? 'Menyimpan...' : 'Lanjut'}
          </button>
        </form>
      </div>
    );
  }

  if (isVerifyEmail || isVerifyToken) {
    const email = String(verifyState?.email || '').trim();
    const isSuccess = verifyStatus === "success";
    const isFailed = verifyStatus === "failed";
    const isVerifying = isVerifyToken && verifyStatus === "verifying";
    return (
      <div style={{
        backgroundColor: '#ffffff',
        backgroundImage:
          'linear-gradient(rgba(11,19,38,0.045) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(11,19,38,0.045) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid rgba(11,19,38,0.1)',
          borderRadius: 24,
          padding: 40,
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 8px 40px rgba(11,19,38,0.08)',
          margin: '0 16px',
          textAlign: 'center',
        }}>
          <div style={{
            alignItems: 'center',
            background: isSuccess ? '#dcfce7' : isFailed ? '#fee2e2' : '#FFF44F',
            borderRadius: 999,
            color: isSuccess ? '#166534' : isFailed ? '#991b1b' : '#0b1326',
            display: 'inline-flex',
            height: 58,
            justifyContent: 'center',
            marginBottom: 18,
            width: 58,
          }}>
            <EnvelopeIcon size={26} />
          </div>
          <h1 style={{ fontSize: 28, color: '#0b1326', letterSpacing: '-0.01em', fontWeight: 800, margin: 0 }}>
            {isSuccess ? 'Email terverifikasi' : isFailed ? 'Link tidak valid' : isVerifyToken ? 'Memverifikasi email...' : 'Cek email kamu'}
          </h1>
          <p style={{ color: 'rgba(11,19,38,0.55)', fontSize: 14, lineHeight: 1.65, margin: '12px 0 0' }}>
            {isSuccess
              ? isVerifyEmail
                ? 'Akun kamu sudah aktif. Lanjutkan di tab Mafiking yang baru terbuka.'
                : 'Akun kamu sudah aktif. Kamu akan diarahkan ke Mafiking.'
              : isFailed
                ? 'Link verifikasi tidak valid atau sudah kadaluarsa. Kamu bisa meminta link baru.'
                : email
                  ? `Kami sudah mengirim link konfirmasi ke ${email}. Klik link di email untuk mengaktifkan akun.`
                  : 'Kami sudah mengirim link konfirmasi ke email kamu. Klik link di email untuk mengaktifkan akun.'}
          </p>
          {error && (
            <p style={{ color: '#ef4444', fontSize: 13, marginTop: 12 }}>{error}</p>
          )}
          {!isSuccess && !isVerifyToken && (
            <div style={{ display: 'grid', gap: 10, marginTop: 26 }}>
              <a
                href="https://mail.google.com/mail/u/0/#inbox"
                target="_blank"
                rel="noreferrer"
                style={{
                  background: '#0b1326',
                  borderRadius: 12,
                  color: '#FFF44F',
                  display: 'block',
                  fontSize: 15,
                  fontWeight: 800,
                  padding: 14,
                  textDecoration: 'none',
                }}
              >
                Buka Gmail
              </a>
              <button
                type="button"
                disabled={resendLoading || cooldown > 0 || isVerifying}
                onClick={resendVerification}
                style={{
                  background: '#ffffff',
                  border: '1px solid rgba(11,19,38,0.14)',
                  borderRadius: 12,
                  color: 'rgba(11,19,38,0.8)',
                  cursor: (resendLoading || cooldown > 0 || isVerifying) ? 'not-allowed' : 'pointer',
                  fontSize: 15,
                  fontWeight: 800,
                  opacity: (resendLoading || cooldown > 0 || isVerifying) ? 0.55 : 1,
                  padding: 14,
                }}
              >
                {resendLoading ? 'Mengirim...' : cooldown > 0 ? `Kirim ulang (${cooldown} detik)` : 'Kirim Ulang'}
              </button>
              <button
                type="button"
                onClick={() => setRoute({ route: "lobby", authMode: "signup", authRedirect: redirect, authBackRoute: backRoute })}
                style={{ color: 'rgba(11,19,38,0.55)', fontSize: 13, fontWeight: 800, padding: 8 }}
              >
                Pakai email lain
              </button>
            </div>
          )}
          {isSuccess && isVerifyToken && (
            <button
              type="button"
              onClick={() => setRoute(redirect || { route: "belajar", section: "Try Out" })}
              style={{
                background: '#0b1326',
                border: 'none',
                borderRadius: 12,
                color: '#FFF44F',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 800,
                marginTop: 26,
                padding: 14,
                width: '100%',
              }}
            >
              Lanjut ke Mafiking
            </button>
          )}
          {!isSuccess && !isVerifyToken && (
            <p style={{ color: 'rgba(11,19,38,0.42)', fontSize: 12, lineHeight: 1.55, margin: '18px 0 0' }}>
              Tidak dapat email? Cek folder spam, lalu klik Kirim Ulang setelah cooldown selesai.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#ffffff',
      backgroundImage:
        'linear-gradient(rgba(11,19,38,0.045) 1px, transparent 1px),' +
        'linear-gradient(90deg, rgba(11,19,38,0.045) 1px, transparent 1px)',
      backgroundSize: '40px 40px',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      fontFamily: 'inherit',
    }}>
      {/* Card */}
      <div style={{
        background: '#ffffff',
        border: '1px solid rgba(11,19,38,0.1)',
        borderRadius: 24,
        padding: 40,
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 8px 40px rgba(11,19,38,0.08)',
        position: 'relative',
        zIndex: 10,
        margin: '0 16px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/assets/logo.png" alt="Mafiking" style={{ width: 60, height: 60, objectFit: 'contain', marginBottom: 10 }} />
          <h1 style={{ fontSize: 28, color: '#0b1326', letterSpacing: '-0.01em', fontWeight: 700, margin: 0 }}>
            {isSignup ? 'Sign Up Mafiking' : 'Masuk Mafiking'}
          </h1>
          {!isSignup && (
            <p style={{ color: 'rgba(11,19,38,0.45)', fontSize: 13, marginTop: 6 }}>
              Lanjutkan progres belajarmu.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'rgba(11,19,38,0.65)', fontWeight: 500, marginBottom: 8 }}>
              Email
            </label>
            <input
              type={isSignup ? 'email' : 'text'}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="nama@email.com"
              required
              autoFocus
              autoComplete={isSignup ? 'email' : 'username'}
              style={{
                width: '100%', padding: '13px 16px', boxSizing: 'border-box',
                background: '#f8f8f8', border: '1px solid rgba(11,19,38,0.12)',
                borderRadius: 12, color: '#0b1326', fontSize: 15, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#0b1326'}
              onBlur={e => e.target.style.borderColor = 'rgba(11,19,38,0.12)'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'rgba(11,19,38,0.65)', fontWeight: 500, marginBottom: 8 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                style={{
                  width: '100%', padding: '13px 48px 13px 16px', boxSizing: 'border-box',
                  background: '#f8f8f8', border: '1px solid rgba(11,19,38,0.12)',
                  borderRadius: 12, color: '#0b1326', fontSize: 15, outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = '#0b1326'}
                onBlur={e => e.target.style.borderColor = 'rgba(11,19,38,0.12)'}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                onClick={() => setShowPassword(value => !value)}
                style={{
                  alignItems: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(11,19,38,0.55)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  height: 40,
                  justifyContent: 'center',
                  padding: 0,
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 40,
                }}
              >
                <EyeIcon hidden={!showPassword} />
              </button>
            </div>
            {error && (
              <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8, marginLeft: 4 }}>{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: 14,
              background: loading ? 'rgba(11,19,38,0.4)' : '#0b1326',
              color: '#FFF44F', border: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.01em',
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? (isSignup ? 'Membuat akun...' : 'Masuk...') : (isSignup ? 'Sign Up' : 'Masuk')}
          </button>
        </form>

        {clerkEnabled && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 18px' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(11,19,38,0.1)' }} />
              <span style={{ color: 'rgba(11,19,38,0.45)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>atau</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(11,19,38,0.1)' }} />
            </div>

            <button
              type="button"
              disabled={clerkLoading}
              onClick={handleClerkAuth}
              style={{
                alignItems: 'center',
                background: '#ffffff',
                border: '1px solid rgba(11,19,38,0.14)',
                borderRadius: 12,
                color: '#0b1326',
                cursor: clerkLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                fontSize: 15,
                fontWeight: 800,
                gap: 10,
                justifyContent: 'center',
                opacity: clerkLoading ? 0.65 : 1,
                padding: 14,
                width: '100%',
              }}
            >
              <span style={{ alignItems: 'center', border: '1px solid rgba(11,19,38,.08)', borderRadius: 999, display: 'inline-flex', height: 24, justifyContent: 'center', width: 24 }}>
                <GoogleLogoIcon size={18} />
              </span>
              {clerkLoading ? 'Menunggu Google...' : (isSignup ? 'Daftar dengan Google' : 'Masuk dengan Google')}
            </button>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 18, fontSize: 13 }}>
          <button
            onClick={goBack}
            type="button"
            style={{
              alignItems: 'center',
              color: 'rgba(11,19,38,0.62)',
              cursor: 'pointer',
              display: 'inline-flex',
              fontWeight: 800,
              gap: 6,
              padding: '4px 0',
            }}
          >
            <BackArrowIcon />
            kembali
          </button>
          <button
            onClick={() => setRoute({ route: "lobby", authMode: isSignup ? "login" : "signup", authRedirect: redirect, authBackRoute: backRoute })}
            type="button"
            style={{ color: '#0b1326', fontWeight: 700 }}
          >
            {isSignup ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Landing (marketing, untuk anonymous/guest) ───────────────────────────
const LandingLegacy = ({ setRoute, tweaks, isAdmin = false, currentUser = null, showTryoutLink = true }) => {
  const isRegistered = currentUser && !currentUser.display_name?.startsWith("Tamu_");
  const startFree = () => setRoute({ route: "belajar", section: "Try Out" });
  const authRedirect = { route: "belajar", section: "Try Out" };
  const openLogin = () => setRoute({ route: "lobby", authMode: "login", authRedirect });
  const openSignup = () => setRoute({ route: "lobby", authMode: "signup", authRedirect });

  const subjectCards = [
    { title: "Matematika", desc: "Kalkulus, limit, integral, dan aljabar dengan jalur latihan yang rapi.", icon: Icon.Integral, tone: "bg-amber-50 text-amber-700 border-amber-100" },
    { title: "Fisika", desc: "Bangun intuisi mekanika dan konsep dasar tanpa loncat rumus.", icon: Icon.Atom, tone: "bg-blue-50 text-blue-700 border-blue-100" },
    { title: "Kimia", desc: "Stoikiometri, struktur atom, dan reaksi dibuat lebih terstruktur.", icon: Icon.Flask, tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  ];
  const featureCards = [
    { title: "Rekomendasi latihan", desc: "Sistem membaca pola kesalahan lalu mengarahkan latihan berikutnya.", icon: Icon.Target },
    { title: "History kesalahan canvas", desc: "Jawaban yang pernah keliru tersimpan supaya bisa diulang dengan fokus.", icon: Icon.Bulb },
    { title: "Simulasi Try Out CBT", desc: "Paket gratis tersedia lebih dulu sebelum kamu memilih paket penuh.", icon: Icon.Trophy },
  ];
  const testimonials = [
    { quote: "Materinya jadi lebih kebaca. Aku tahu harus mulai dari bab mana dulu.", name: "Alya", meta: "TPB ITB" },
    { quote: "Try out gratisnya ngebantu buat ngetes ritme sebelum beli paket.", name: "Rafi", meta: "STEI" },
    { quote: "Bagian koreksi canvas bikin kesalahan kecil jadi kelihatan jelas.", name: "Nadya", meta: "FTMD" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <div className="flex h-16 items-center justify-between gap-3 md:h-20">
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center" type="button">
              <Logo size={34} />
            </button>
            <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-500 md:flex">
              {["belajar", "fitur", "testimoni"].map((id) => (
                <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="hover:text-slate-950" type="button">
                  {id === "fitur" ? "Fitur" : id === "testimoni" ? "Testimoni" : "Belajar"}
                </button>
              ))}
            </nav>
            <div className="hidden items-center gap-3 md:flex">
              <button onClick={startFree} className="btn-ink !py-2.5 !px-5 text-sm" type="button">
                Coba Gratis <Icon.Arrow className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="pb-3 md:hidden">
            <button onClick={startFree} className="btn-ink w-full justify-center !py-3 text-sm" type="button">
              Coba Gratis <Icon.Arrow className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main id="beranda" className="pt-32 md:pt-20">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-[0.55]" style={{
            backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,244,79,.35), transparent 28%), radial-gradient(circle at 80% 10%, rgba(59,130,246,.12), transparent 30%)"
          }} />
          <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-7xl items-center gap-12 px-6 py-16 md:px-10 lg:grid-cols-12">
            <div className="relative z-10 lg:col-span-7">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
                <Icon.Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Bimbel TPB ITB dengan struktur belajar adaptif
              </div>
              <h1 className="max-w-4xl text-[2.1rem] font-black leading-[0.95] text-slate-950 min-[390px]:text-[2.25rem] sm:text-[3.55rem] md:text-6xl lg:text-[5rem]">
                Taklukkan TPB<br />
                <span className="whitespace-nowrap" style={{ color: "rgb(11 19 38 / 0.4)" }}>tanpa harus</span><br />
                <span className="whitespace-nowrap" style={{ color: "rgb(11 19 38 / 0.4)" }}>panik,</span><br />
                <span className="hi-yel whitespace-nowrap text-slate-950">mulai dari fondasi</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
                Bimbingan Matematika, Fisika, dan Kimia dasar untuk mahasiswa TPB. Mulai dari Try Out gratis, lanjut ke latihan yang lebih personal saat kamu siap.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <button onClick={startFree} className="btn-ink !py-4 !px-7" type="button">
                  Coba Gratis <Icon.Arrow />
                </button>
                {showTryoutLink && (
                  <button onClick={() => setRoute("tryout")} className="btn-ghost !py-4 !px-7" type="button">
                    Lihat Paket
                  </button>
                )}
              </div>
              <div className="mt-9 grid max-w-2xl grid-cols-2 gap-4 text-sm text-slate-500 md:grid-cols-4">
                {[
                  ["250+", "Pengguna Aktif"],
                  ["120+", "Soal Latihan"],
                  ["98%", "lebih terarah"],
                  ["24/7", "akses belajar"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="font-display text-2xl font-black text-slate-950">{value}</div>
                    <div className="mt-1 text-xs font-semibold uppercase text-slate-400">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 lg:col-span-5">
              <div className="relative rounded-[2rem] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-200/70">
                <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase text-white/45">Try Out Gratis</div>
                      <div className="mt-1 text-2xl font-black">Bab 1-2 Preview</div>
                    </div>
                    <span className="rounded-full bg-yel px-3 py-1 text-xs font-black text-ink">FREE</span>
                  </div>
                  <div className="grid gap-3">
                    {["Limit dan turunan dasar", "Integral pengantar", "Pembahasan setelah login"].map((item, index) => (
                      <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/8 p-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-black text-slate-950">{index + 1}</span>
                        <span className="text-sm font-semibold text-white/80">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs font-bold uppercase text-slate-400">Fokus hari ini</div>
                    <div className="mt-2 text-lg font-black">Integral</div>
                    <div className="mt-3 h-2 rounded-full bg-slate-200"><div className="h-full w-3/5 rounded-full bg-slate-950" /></div>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <div className="text-xs font-bold uppercase text-amber-700/60">Target</div>
                    <div className="mt-2 text-lg font-black text-slate-950">45 menit</div>
                    <div className="mt-2 text-xs text-slate-500">latihan terarah</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="belajar" className="border-y border-slate-200 bg-white py-20">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <div className="mb-10 max-w-3xl">
              <p className="kicker mb-3">Area belajar</p>
              <h2 className="text-4xl font-black leading-tight md:text-5xl">Mulai dari Try Out gratis, lalu pilih fondasi yang ingin diperkuat.</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-4">
              <button onClick={startFree} className="group rounded-[1.5rem] border border-slate-900 bg-slate-950 p-6 text-left text-white transition hover:-translate-y-1" type="button">
                <Icon.Trophy className="mb-8 h-7 w-7 text-yel" />
                <h3 className="text-2xl font-black">Try Out</h3>
                <p className="mt-3 text-sm leading-6 text-white/65">Paket gratis untuk masuk ke alur latihan tanpa bayar.</p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-yel">Mulai gratis <Icon.Arrow className="w-3.5 h-3.5" /></span>
              </button>
              {subjectCards.map((item) => {
                const SubjectIcon = item.icon;
                return (
                  <button key={item.title} onClick={openLogin} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-6 text-left transition hover:-translate-y-1 hover:bg-white" type="button">
                    <div className={`mb-8 inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${item.tone}`}>
                      <SubjectIcon className="h-5 w-5" />
                    </div>
                    <h3 className="text-2xl font-black">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{item.desc}</p>
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-slate-950">Masuk untuk buka <Icon.Lock className="w-3.5 h-3.5" /></span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section id="fitur" className="py-20">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="kicker mb-3">Fitur inti</p>
                <h2 className="text-4xl font-black leading-tight md:text-5xl">Belajar lebih tenang karena langkah berikutnya jelas.</h2>
                <p className="mt-5 text-lg leading-8 text-slate-600">Fokus Mafiking bukan membuat halaman ramai, tapi membuat progres akademikmu terbaca dan bisa ditindaklanjuti.</p>
              </div>
              <div className="grid gap-4 lg:col-span-7">
                {featureCards.map((item) => {
                  const FeatureIcon = item.icon;
                  return (
                    <div key={item.title} className="rounded-[1.5rem] border border-slate-200 bg-white p-6">
                      <div className="flex gap-5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yel/70 text-ink">
                          <FeatureIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black">{item.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{item.desc}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-slate-950 py-20 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 md:px-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="kicker mb-3 text-white/45">Demo simulasi</p>
              <h2 className="text-4xl font-black leading-tight md:text-5xl">Coba alur latihan sebelum memilih paket.</h2>
              <p className="mt-5 text-lg leading-8 text-white/60">Preview demo memakai aset ringan agar halaman awal tetap cepat. Media video bisa diaktifkan lagi dari Admin Panel saat aset baru siap.</p>
            </div>
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5">
              <img src="/assets/landing/simulasi-tryout.jpg?v=202606011620" alt="Preview demo simulasi tryout" className="aspect-video h-full w-full object-cover" loading="lazy" decoding="async" />
            </div>
          </div>
        </section>

        <section id="testimoni" className="py-20">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="kicker mb-3">Testimoni</p>
                <h2 className="text-4xl font-black leading-tight md:text-5xl">Dipakai untuk belajar lebih terarah.</h2>
              </div>
              <button onClick={startFree} className="btn-ink self-start md:self-auto" type="button">Coba Gratis <Icon.Arrow /></button>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {testimonials.map((item) => (
                <div key={item.name} className="rounded-[1.5rem] border border-slate-200 bg-white p-6">
                  <div className="mb-5 flex gap-1 text-amber-400">{[0,1,2,3,4].map(i => <Icon.Star key={i} className="w-4 h-4" />)}</div>
                  <p className="text-slate-700 leading-7">"{item.quote}"</p>
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <div className="font-black">{item.name}</div>
                    <div className="text-sm text-slate-500">{item.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-20 md:px-10">
          <div className="mx-auto max-w-7xl rounded-[2rem] bg-yel p-8 text-center md:p-14">
            <h2 className="mx-auto max-w-3xl text-4xl font-black leading-tight md:text-6xl">Mulai gratis, lanjutkan saat kamu siap.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-slate-700">Try Out gratis tetap bisa dibuka. Pembahasan dan progres lengkap akan tersimpan setelah kamu masuk atau sign up.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button onClick={startFree} className="btn-ink !py-4 !px-7" type="button">Coba Gratis <Icon.Arrow /></button>
              {!isRegistered && <button onClick={openSignup} className="btn-ghost !border-ink/20 !bg-white/50 !py-4 !px-7" type="button">Sign Up</button>}
            </div>
          </div>
        </section>
      </main>

      <Footer setRoute={setRoute} showTryoutLink={showTryoutLink} />

    </div>
  );
};

// ─── Dashboard (untuk registered user yang sudah login) ───────────────────
const LandingFade = ({ children, delay = 0, className = "" }) => {
  const ref = React.useRef(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`landing-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

const LandingPlayIcon = ({ className = "w-10 h-10" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.4v13.2c0 .7.8 1.1 1.4.7l9.7-6.6c.5-.3.5-1.1 0-1.4L9.4 4.7C8.8 4.3 8 4.7 8 5.4z" />
  </svg>
);

const LandingUploadIcon = ({ className = "h-4 w-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V4" />
    <path d="M7 9l5-5 5 5" />
    <path d="M4 20h16" />
  </svg>
);

const LandingMediaImage = ({ src, alt, fit = "contain", objectPosition = "50% 50%", imageClassName = "" }) => {
  const [transformOrigin, setTransformOrigin] = React.useState("50% 50%");

  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setTransformOrigin(`${Math.max(0, Math.min(100, x)).toFixed(1)}% ${Math.max(0, Math.min(100, y)).toFixed(1)}%`);
  };

  return (
    <img
      src={src}
      alt={alt}
      decoding="async"
      loading="lazy"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setTransformOrigin("50% 50%")}
      className={`absolute inset-0 h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} opacity-90 transition-transform duration-500 ease-out hover:scale-[1.28] ${imageClassName}`}
      style={{ objectPosition, transformOrigin }}
    />
  );
};

const LandingEditableMedia = ({ enabled, slot, mediaType = "image", label, onEdit, children }) => (
  <React.Fragment>
    {children}
    {enabled && (
      <button
        className="landing-edit-hotspot is-visible"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (onEdit) onEdit({ slot, mediaType, label });
        }}
        type="button"
      >
        <span className="landing-edit-pill">
          <LandingUploadIcon className="h-4 w-4" /> Ganti {mediaType === "video" ? "video" : "gambar"}
        </span>
      </button>
    )}
  </React.Fragment>
);

const LANDING_DEMO_VIDEO_OPTIMIZED = {
  mp4: "/assets/saas_demo_video.mp4",
  webm: "",
  poster: "/assets/landing/simulasi-tryout.jpg?v=202606011620",
};

const LANDING_DEMO_VIDEO_ALIASES = {
  "/assets/landing/demo_video-1780075618470.mp4": LANDING_DEMO_VIDEO_OPTIMIZED,
  "/assets/landing/demo-video-848w-20260602.mp4": LANDING_DEMO_VIDEO_OPTIMIZED,
  "/assets/saas_demo_video.mp4": LANDING_DEMO_VIDEO_OPTIMIZED,
};

function normalizeLandingAssetPath(url) {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch (_) {
    return String(url || "").split("?")[0];
  }
}

function resolveLandingDemoVideo(url) {
  const assetPath = normalizeLandingAssetPath(url);
  return LANDING_DEMO_VIDEO_ALIASES[assetPath] || { mp4: url, webm: "", poster: "" };
}

const LandingMediaUploadModal = ({ target, onClose, onUploaded }) => {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  if (!target) return null;

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("slot", target.slot);
      body.append("media", file);
      const response = await fetch("/api/admin/landing-media", {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Upload media gagal.");
      if (typeof showToast === "function") showToast("Media landing page diperbarui.", "success");
      if (onUploaded) onUploaded(target.slot, data);
      onClose();
    } catch (caught) {
      setError(caught.message || "Upload media gagal.");
    } finally {
      setBusy(false);
    }
  }

  return ReactDOM.createPortal((
    <div className="landing-media-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="landing-media-modal" role="dialog" aria-modal="true">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-amber-500">Landing CMS</p>
            <h2 className="text-2xl font-extrabold text-white">Upload {target.label}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              File ini langsung mengganti media landing untuk semua user.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" type="button" aria-label="Tutup upload media">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>
        <label className="landing-media-dropzone">
          <LandingUploadIcon className="h-8 w-8 text-amber-300" />
          <span className="font-bold text-white">{busy ? "Mengunggah..." : "Pilih file untuk upload"}</span>
          <span className="text-sm text-white/50">{target.mediaType === "video" ? "MP4 atau WEBM" : "JPG, PNG, WEBP, atau GIF"}</span>
          <input
            accept={target.mediaType === "video" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp,image/gif"}
            disabled={busy}
            onChange={(event) => upload(event.target.files && event.target.files[0])}
            type="file"
          />
        </label>
        {error && <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">{error}</p>}
      </div>
    </div>
  ), document.body);
};

// Landing page adapted from the Google AI Studio design in the provided zip.
const Landing = ({ setRoute, tweaks, isAdmin = false, currentUser = null, showTryoutLink = true }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [landingMedia, setLandingMedia] = React.useState({});
  const [tryoutPackages, setTryoutPackages] = React.useState([]);
  const [mediaEditTarget, setMediaEditTarget] = React.useState(null);
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const [demoVideoShouldLoad, setDemoVideoShouldLoad] = React.useState(false);
  const [isTeacherMobileMode, setIsTeacherMobileMode] = React.useState(() => window.matchMedia("(max-width: 639px)").matches);
  const demoVideoRef = React.useRef(null);
  const demoVideoFrameRef = React.useRef(null);
  const soundEnabledRef = React.useRef(true);
  const landingMediaEditEnabled = Boolean(isAdmin);
  const authRedirect = { route: "belajar", section: "Try Out" };
  const openLogin = () => setRoute({ route: "lobby", authMode: "login", authRedirect });
  const startFree = () => {
    try { window.sessionStorage.setItem("mafiking:tryout-pop", "1"); } catch (_) {}
    setRoute({ route: "belajar", section: "Try Out" });
  };
  const isRegisteredUser = currentUser && !currentUser.display_name?.startsWith("Tamu_");
  const buyLandingPackage = (pkg) => {
    if (isLandingPackageFree(pkg)) {
      startFree();
      return;
    }
    if (!pkg || !pkg.id) {
      setRoute(showTryoutLink ? "tryout" : "belajar");
      return;
    }
    const paymentRoute = { route: "payment", payment: { type: "tryout", package: pkg } };
    if (!isRegisteredUser) {
      setRoute({
        route: "lobby",
        authMode: "login",
        authRedirect: paymentRoute,
      });
      return;
    }
    setRoute(paymentRoute);
  };
  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        el.classList.remove("landing-section-pop");
        void el.offsetWidth;
        el.classList.add("landing-section-pop");
      }, 360);
    }
    setMenuOpen(false);
  };
  const mediaUrl = (slot, fallback) => (landingMedia && landingMedia[slot] && landingMedia[slot].url) || fallback;
  const updateLandingMedia = (slot, row) => setLandingMedia((prev) => ({ ...prev, [slot]: row }));
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/landing-media", { credentials: "same-origin" })
      .then((res) => res.ok ? res.json() : {})
      .then((data) => { if (!cancelled) setLandingMedia(data || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/tryout-packages", { credentials: "same-origin" })
      .then((res) => res.ok ? res.json() : [])
      .then((rows) => { if (!cancelled) setTryoutPackages(Array.isArray(rows) ? rows : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const featureOne = mediaUrl("feature_image_1", "/assets/landing/rekomendasi-latihan.jpg?v=202606011620");
  const featureTwo = mediaUrl("feature_image_2", "/assets/landing/history-kesalahan.jpg?v=202606011635");
  const featureThree = mediaUrl("feature_image_3", "/assets/landing/simulasi-tryout.jpg?v=202606011620");
  const demoVideoAsset = resolveLandingDemoVideo(mediaUrl("demo_video", LANDING_DEMO_VIDEO_OPTIMIZED.mp4));
  const demoVideo = demoVideoAsset.mp4;

  React.useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const updateMode = () => setIsTeacherMobileMode(media.matches);
    updateMode();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateMode);
      return () => media.removeEventListener("change", updateMode);
    }
    media.addListener(updateMode);
    return () => media.removeListener(updateMode);
  }, []);

  React.useEffect(() => {
    setDemoVideoShouldLoad(false);
    if (!demoVideo) return undefined;

    const frame = demoVideoFrameRef.current;
    if (!frame || typeof IntersectionObserver !== "function") {
      setDemoVideoShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry || !entry.isIntersecting) return;
      setDemoVideoShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: "720px 0px", threshold: 0 });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [demoVideo]);

  React.useEffect(() => {
    const video = demoVideoRef.current;
    if (!video || !demoVideoShouldLoad) return undefined;
    const sourceKey = `${demoVideoAsset.webm || ""}|${demoVideo || ""}`;
    if (video.dataset.sourceKey !== sourceKey) {
      video.load();
      video.dataset.sourceKey = sourceKey;
    }
    video.playbackRate = 1;

    let cleanedUp = false;
    let isVideoVisible = false;
    let observer = null;
    let removeInteractionListeners = () => {};

    const playMuted = async () => {
      if (cleanedUp) return;
      video.muted = true;
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      video.playbackRate = 1;
      try {
        await video.play();
      } catch (_) {}
    };

    const playVisibleVideo = async () => {
      if (cleanedUp || !isVideoVisible) return;
      video.muted = !soundEnabledRef.current;
      video.volume = 1;
      video.playbackRate = 1;
      try {
        await video.play();
        setSoundEnabled(!video.muted);
      } catch (_) {
        await playMuted();
      }
    };

    const enableSound = async () => {
      if (cleanedUp) return;
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      video.muted = false;
      video.volume = 1;
      video.playbackRate = 1;
      try {
        if (isVideoVisible) await video.play();
      } catch (_) {
        await playMuted();
      }
      removeInteractionListeners();
    };

    const interactionEvents = ["pointerdown", "keydown", "touchstart"];
    interactionEvents.forEach((eventName) => {
      window.addEventListener(eventName, enableSound, { passive: true, once: true });
    });
    removeInteractionListeners = () => {
      interactionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, enableSound);
      });
    };

    video.pause();
    video.muted = !soundEnabledRef.current;
    video.volume = 1;
    video.playbackRate = 1;

    const frame = demoVideoFrameRef.current || video;
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        isVideoVisible = Boolean(entry && entry.isIntersecting);
        if (isVideoVisible) playVisibleVideo();
        else video.pause();
      }, { threshold: 0.35 });
      observer.observe(frame);
    } else {
      isVideoVisible = true;
      playVisibleVideo();
    }

    return () => {
      cleanedUp = true;
      if (observer) observer.disconnect();
      removeInteractionListeners();
    };
  }, [demoVideo, demoVideoAsset.webm, demoVideoShouldLoad]);

  const toggleDemoSound = async () => {
    const video = demoVideoRef.current;
    if (!video) return;
    if (!demoVideoShouldLoad) {
      setDemoVideoShouldLoad(true);
      return;
    }
    const nextEnabled = !soundEnabled;
    soundEnabledRef.current = nextEnabled;
    video.muted = !nextEnabled;
    video.volume = nextEnabled ? 1 : video.volume;
    try {
      await video.play();
      setSoundEnabled(nextEnabled);
    } catch (_) {
      video.muted = true;
      soundEnabledRef.current = false;
      setSoundEnabled(false);
    }
  };

  const recenterTeacherScroll = React.useCallback(() => {}, []);

  const subjectCards = [
    { title: "Matematika", IconC: Icon.Integral, section: "Matematika" },
    { title: "Fisika", IconC: Icon.Atom, section: "Fisika" },
    { title: "Kimia", IconC: Icon.Flask, section: "Kimia" },
  ];
  const teacherProfiles = [
    {
      name: "Dakita Arfa",
      initial: "DA",
      major: "Teknik Mesin",
      awards: [
        { text: "Juara Olimpiade Internasional Fisika", tone: "brand" },
        { text: "IP 3.8+", tone: "amber" },
        { text: "Nilai UTS & UAS Fisika 1A 100", tone: "slate" },
      ],
    },
    {
      name: "Abiyu Lingga",
      initial: "AL",
      major: "Teknik Elektro",
      awards: [
        { text: "Juara Olimpiade Fisika", tone: "brand" },
        { text: "IP 3.9+", tone: "amber" },
        { text: "Tutor Sebaya Fisika 1A", tone: "slate" },
      ],
    },
    {
      name: "Jordan Hervianto.",
      initial: "JH",
      major: "Teknik Metalurgi",
      awards: [
        { text: "IP 4.0", tone: "brand" },
        { text: "2+ tahun mengajar", tone: "amber" },
        { text: "Nilai 99.4 MaFiKi", tone: "slate" },
      ],
    },
    {
      name: "M. Elginito",
      initial: "ME",
      major: "Teknik Sipil",
      awards: [
        { text: "IP 3.8+", tone: "brand" },
        { text: "2+ tahun Mengajar", tone: "amber" },
        { text: "Nilai UTS Matematika 96.5", tone: "slate" },
        { text: "Nilai UAS Fisika 99", tone: "blue" },
      ],
    },
    {
      name: "Gusti Ammar",
      initial: "GA",
      major: "Teknik Kimia",
      awards: [
        { text: "IP 3.7", tone: "brand" },
        { text: "Indeks A Kimia", tone: "amber" },
        { text: "1+ tahun Mengajar", tone: "slate" },
      ],
    },
  ];
  const testimonials = [
    ["Jujur baru pertama ikut dan aku langsung ngerti sama penjelasannya. Tutornya keren-keren dan websitenya juga membantu aku belajar. Sukses selalu MAFIKING!", "Aya", "FTTM 25", "A"],
    ["Keren, tutornya berkualitas. Dari orang sampai mentornya mantab", "Rafi", "FTTM 25", "R"],
    ["KEREN ANEETTT HUWUW >///< aku jadi paham materi materi yang aku lupa kyaaa >///< seru juga belajar sama my tomodachi", "Alfiqi", "FTMD 25", "A"],
    ["Jujur jelas banget dan mudah dimengerti, tapi mungkin tulisan di papannya bisa diperbesar dan diperjelas", "Ragam", "FTMD 25", "R"],
    ["Jujur nyesel ga ikut dari awal! ngajarnya jelas pake bangettt. Harus lanjut plss MY SAVIOURS", "Marafen", "FTMD 25", "M"],
    ["Tutornya jangan ganteng ganteng dongg aku gak fokus belajarnya :(", "Anonymus", "-", "A"],
    ["Seru banget tutornya sangat friendly. materinya gampang dimengerti. We love MAFIKING", "Anonymus", "-", "A"],
    ["Terimakasih mafiking. jujur sangat membantu memahami materi. tutor juga sangat GACOR debest lah. Buat juga untuk UAS MAT 2D yakk wkwkwkkwkw", "Anonymus", "-", "A"],
    ["Tutornya gacor gacor dan helpful banget :D (sayang otak sayanya aja yang gak nyampe)", "Anonymus", "-", "A"]
  ];
  const landingOffers = buildLandingOffers(tryoutPackages);
  const teacherLoopProfiles = [...teacherProfiles, ...teacherProfiles, ...teacherProfiles];
  const awardToneClasses = {
    brand: "border-slate-200 bg-slate-50 text-slate-950",
    slate: "border-slate-200 bg-white text-slate-950",
    amber: "border-amber-200 bg-amber-50 text-slate-950",
    blue: "border-blue-100 bg-blue-50 text-slate-950",
  };
  const awardIconClasses = {
    brand: "border-slate-200 bg-[#0B1326] text-[#FFF44F]",
    slate: "border-slate-200 text-slate-500",
    amber: "border-amber-100 text-amber-500",
    blue: "border-blue-100 text-blue-600",
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-900 font-sans">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(to right, rgba(15, 23, 42, 0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(15, 23, 42, 0.035) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute -right-[14%] top-0 h-[760px] w-[760px] rounded-full bg-yellow-100/45 opacity-70 blur-[150px]" />
        <div className="absolute left-1/2 top-[28rem] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-white/80 blur-[170px]" />
        <div className="absolute -left-[16%] top-[56rem] h-[560px] w-[560px] rounded-full bg-sky-50/55 opacity-60 blur-[160px]" />
      </div>

      <nav className="fixed top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md transition-all">
        <div className="mx-auto w-full max-w-[1800px] px-4 sm:px-6 md:px-12 lg:px-20">
          <div className="flex h-14 sm:h-20 items-center justify-between">
            <button onClick={() => scrollToId("beranda")} className="flex items-center gap-2" type="button">
              <Logo size={28} />
            </button>
            <div className="hidden items-center space-x-8 md:flex">
              <button onClick={() => scrollToId("pengajar")} className="font-medium text-slate-500 transition-colors hover:text-slate-900" type="button">Pengajar</button>
              <button onClick={() => scrollToId("fitur")} className="font-medium text-slate-500 transition-colors hover:text-slate-900" type="button">Fitur</button>
              <button onClick={() => scrollToId("testimoni")} className="font-medium text-slate-500 transition-colors hover:text-slate-900" type="button">Testimoni</button>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <button onClick={startFree} className="btn-ink" type="button">
                Coba Gratis <Icon.Arrow className="w-4 h-4" />
              </button>
            </div>
            <button onClick={startFree} className="btn-ink !py-2 !px-4 text-sm md:hidden" type="button">
              Coba Gratis <Icon.Arrow className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="landing-mobile-menu space-y-1 border-b border-slate-100 bg-white px-4 pb-4 pt-2 md:hidden">
            {[["pengajar", "Pengajar"], ["fitur", "Fitur"], ["testimoni", "Testimoni"]].map(([id, label]) => (
              <button key={id} onClick={() => scrollToId(id)} className="block w-full rounded-md px-3 py-2.5 text-left font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900" type="button">{label}</button>
            ))}
            <button onClick={startFree} className="btn-ink mt-3 w-full justify-center !py-3 text-sm" type="button">
              Coba Gratis <Icon.Arrow className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </nav>

      <main className="relative z-10 pb-8 sm:pb-16 pt-10 sm:pt-12">
        <section id="beranda" className="relative mx-auto w-full max-w-[1800px] scroll-mt-32 overflow-hidden px-4 pt-20 sm:px-6 sm:pt-8 md:px-12 md:pt-12 lg:px-20 lg:pb-20 lg:pt-24">
          <LandingFade className="relative z-10">
            <div className="grid items-center gap-6 sm:gap-12 lg:grid-cols-2 lg:gap-8">
              <div className="landing-hero-copy relative z-10 w-full min-w-0">
                <div className="mb-4 sm:mb-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-bold text-slate-800 shadow-sm">
                  <Icon.Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" /> Bimbel #1 untuk TPB ITB
                </div>
                <h1 className="mb-4 sm:mb-6 flex max-w-full flex-col items-start gap-0.5 sm:gap-1 text-[1.65rem] font-extrabold leading-[1.04] tracking-tight min-[390px]:text-[1.85rem] sm:text-[3.55rem] md:mb-8 md:text-6xl lg:text-[5rem]">
                  <span className="text-slate-900 sm:whitespace-nowrap">Taklukkan TPB</span>
                  <span className="sm:whitespace-nowrap" style={{ color: "rgb(11 19 38 / 0.4)" }}>tanpa harus</span>
                  <span className="sm:whitespace-nowrap" style={{ color: "rgb(11 19 38 / 0.4)" }}>panik,</span>
                  <span className="hi-yel mt-1 sm:mt-2 max-w-full text-slate-900 sm:whitespace-nowrap">mulai dari fondasi</span>
                </h1>
                <p className="mb-4 sm:mb-7 max-w-full text-sm leading-relaxed text-slate-600 sm:mb-10 sm:max-w-xl sm:text-lg">Bimbingan Matematika, Fisika, dan Kimia dasar khusus mahasiswa ITB. Belajar dengan terstruktur, latihan adaptif, dan mentor berpengalaman.</p>
                <div className="mb-4 sm:mb-6 flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
                  <button onClick={startFree} className="btn-ink landing-hero-cta justify-center sm:w-auto !py-3 !px-5 sm:!py-4 sm:!px-7 text-sm sm:text-base" type="button">Coba Gratis <Icon.Arrow className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                </div>
              </div>
              <div className="relative flex items-center justify-center lg:h-[600px]">
                <div className="relative mx-auto hidden aspect-[4/3] w-full max-w-[280px] sm:block sm:aspect-square sm:max-w-md lg:aspect-auto lg:h-full">
                  <div className="absolute left-1/2 top-1/2 z-0 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-50 opacity-50 blur-3xl" />
                  <div className="absolute right-0 top-4 sm:top-10 z-20 w-32 sm:w-48 rounded-xl sm:rounded-2xl border border-slate-100 bg-white p-3 sm:p-5 shadow-xl transition-transform duration-300 hover:-translate-y-2 lg:right-10">
                    <div className="mb-1 sm:mb-2 flex items-start justify-between"><div className="text-lg sm:text-2xl font-extrabold text-slate-900">IP 4.00</div><Icon.Star className="h-4 w-4 sm:h-6 sm:w-6 text-yellow-400" /></div>
                    <div className="text-xs sm:text-sm font-medium text-slate-500">Mentor ITB</div>
                  </div>
                  <div className="absolute bottom-3 sm:bottom-6 -left-2 sm:-left-4 z-20 w-48 sm:w-72 rounded-2xl sm:rounded-3xl border border-slate-100 bg-white px-3 py-2.5 sm:px-6 sm:py-4 shadow-2xl transition-transform duration-300 hover:-translate-y-2 lg:left-0">
                    <div className="mb-1.5 sm:mb-2.5 flex items-center gap-2 sm:gap-4"><div className="flex h-8 w-8 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-amber-50"><Icon.Trophy className="h-4 w-4 sm:h-7 sm:w-7 text-amber-500" /></div><div><div className="text-xs sm:text-base font-bold text-slate-900">Juara Internasional</div><div className="text-[10px] sm:text-xs font-medium text-slate-500">Olimpiade Fisika</div></div></div>
                  </div>
                  <div className="absolute inset-x-0 sm:inset-x-2 bottom-4 sm:bottom-10 top-10 sm:top-20 z-10 flex flex-col overflow-hidden rounded-[1.5rem] sm:rounded-[2.5rem] bg-white shadow-sm">
                    <div className="flex h-10 sm:h-14 items-center gap-1.5 sm:gap-2 border-b border-slate-100 bg-slate-50/50 px-3 sm:px-6"><div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-slate-200" /><div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-slate-200" /><div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-slate-200" /></div>
                    <div className="relative flex-grow overflow-hidden bg-slate-50">
                      <picture>
                        <source
                          type="image/avif"
                          srcSet="/assets/landing_mentors_20260607-mobile.avif 640w, /assets/landing_mentors_20260607-tablet.avif 960w, /assets/landing_mentors_20260607-desktop.avif 1280w"
                          sizes="(max-width: 768px) 640px, (max-width: 1280px) 50vw, 1280px"
                        />
                        <source
                          type="image/webp"
                          srcSet="/assets/landing_mentors_20260607-mobile.webp 640w, /assets/landing_mentors_20260607-tablet.webp 960w, /assets/landing_mentors_20260607-desktop.webp 1280w"
                          sizes="(max-width: 768px) 640px, (max-width: 1280px) 50vw, 1280px"
                        />
                        <img
                          alt="Preview landing page Mafiking"
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          src="/assets/landing_mentors_20260607.png"
                        />
                      </picture>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </LandingFade>
        </section>

        <section className="relative mt-4 sm:mt-8 overflow-hidden border-y border-slate-100 bg-white py-6 sm:py-12 lg:py-16">
          <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: "linear-gradient(to right, rgba(15, 23, 42, 0.028) 1px, transparent 1px), linear-gradient(to bottom, rgba(15, 23, 42, 0.028) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
                WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.28) 26%, transparent 46%, transparent 54%, rgba(0,0,0,0.28) 74%, rgba(0,0,0,0.85) 100%)",
                maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.28) 26%, transparent 46%, transparent 54%, rgba(0,0,0,0.28) 74%, rgba(0,0,0,0.85) 100%)",
              }}
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" aria-hidden="true" />
          <LandingFade delay={80} className="relative z-10">
            <div className="mx-auto w-full max-w-[1800px] px-4 sm:px-6 md:px-12 lg:px-20">
              <div className="grid grid-cols-2 gap-4 sm:gap-8 md:grid-cols-4 md:gap-4 md:divide-x md:divide-slate-100">
                {[["250+", "Pengguna Aktif"], ["120+", "Soal Latihan"], ["98%", "Rating"], ["24/7", "Belajar Kapan Saja"]].map(([value, label]) => (
                  <div key={label} className="px-2 sm:px-4 text-left md:text-center"><div className="mb-1 sm:mb-2 text-xl sm:text-3xl font-extrabold text-slate-900 md:text-4xl">{value}</div><div className="text-xs sm:text-sm font-medium text-slate-500">{label}</div></div>
                ))}
              </div>
            </div>
          </LandingFade>
        </section>

        <section id="belajar" className="relative mx-auto w-full max-w-[1800px] scroll-mt-24 overflow-hidden px-4 py-10 sm:px-6 sm:py-24 md:px-12 lg:px-20">
          <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
            <div
              className="absolute inset-0 opacity-55"
              style={{
            backgroundImage: "linear-gradient(to right, rgba(15, 23, 42, 0.024) 1px, transparent 1px), linear-gradient(to bottom, rgba(15, 23, 42, 0.024) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 22%, rgba(0,0,0,0.75) 100%)",
            maskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 22%, rgba(0,0,0,0.75) 100%)",
          }}
        />
            <div className="absolute -left-[12%] top-[18%] h-[540px] w-[540px] rounded-full bg-sky-50/60 opacity-55 blur-[150px]" />
            <div className="absolute -right-[10%] -top-[16%] h-[600px] w-[600px] rounded-full bg-yellow-50/70 opacity-65 blur-[160px]" />
          </div>
          <LandingFade delay={120} className="relative z-10">
            <div className="mb-6 sm:mb-16 flex flex-col items-start justify-between gap-4 sm:gap-6 sm:flex-row sm:items-end">
              <div><div className="mb-2 sm:mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">Mata Pelajaran</div><h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">Tiga fondasi utama ITB</h2></div>
              <button onClick={() => setRoute({ route: "belajar", section: "Try Out" })} className="group flex items-center rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base font-bold text-slate-900 transition-colors hover:bg-slate-50" type="button">Buka semua <Icon.ChevR className="ml-1 h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:translate-x-1" /></button>
            </div>
            <div className="landing-mapel-carousel flex flex-col gap-4 sm:grid sm:grid-cols-3 sm:gap-6 hide-scrollbar lg:grid-cols-3">
              {subjectCards.map((item) => (
                <button key={item.title} onClick={() => setRoute({ route: "belajar", section: item.section })} className="group flex sm:min-w-0 sm:shrink h-full flex-col items-center rounded-2xl sm:rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-8 text-center transition-all hover:border-slate-300 hover:shadow-2xl hover:shadow-slate-200/50" type="button">
                  <div className="mb-3 sm:mb-4 flex items-center justify-center"><div className="flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-xl sm:rounded-2xl border border-slate-100 bg-slate-50 text-slate-900"><item.IconC className="h-5 w-5 sm:h-6 sm:w-6" /></div></div>
                  <h3 className="mb-2 sm:mb-4 text-xl sm:text-3xl font-extrabold text-slate-900">{item.title}</h3>
                </button>
              ))}
            </div>
          </LandingFade>
        </section>

        <section id="paket" className="relative overflow-hidden bg-[#0B1326] py-12 text-white sm:py-20 lg:py-24">
          <div className="pointer-events-none absolute inset-0 z-0 opacity-20" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)",
                backgroundSize: "34px 34px",
              }}
            />
          </div>
          <LandingFade delay={140} className="relative z-10">
            <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 md:px-12 lg:px-20">
              <div className="mx-auto mb-8 max-w-3xl text-center sm:mb-12">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#FFF44F]/12 px-4 py-2 text-xs font-bold text-[#FFF44F] ring-1 ring-[#FFF44F]/25">
                  <Icon.Trophy className="h-4 w-4" />
                  Paket Belajar Mafiking
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Penawaran Spesial</h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-300 sm:text-lg">
                  Pilih tryout sesuai kebutuhan belajarmu.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                {landingOffers.map((pkg, index) => {
                  const isFree = isLandingPackageFree(pkg);
                  const featured = index === 1;
                  const features = parseLandingPackageFeatures(pkg).slice(0, 3);
                  return (
                    <article key={`${pkg.title}-${index}`} className={`relative flex min-h-[430px] flex-col overflow-hidden rounded-[1.5rem] border bg-white p-6 text-slate-950 shadow-2xl shadow-slate-950/20 ${featured ? "border-[#FFF44F] ring-4 ring-[#FFF44F]/20" : "border-white/70"}`}>
                      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#FFF44F]/20" aria-hidden="true" />
                      <div className="relative z-10 mb-6 flex items-start justify-between gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1326] text-[#FFF44F]">
                          {isFree ? <Icon.Sparkles className="h-6 w-6" /> : <Icon.Trophy className="h-6 w-6" />}
                        </div>
                        <span className="rounded-full bg-[#FFF44F] px-3 py-1.5 text-xs font-extrabold text-[#0B1326] shadow-sm">
                          {pkg.badge || (isFree ? "Gratis" : "Promo")}
                        </span>
                      </div>
                      <div className="relative z-10">
                        <h3 className="text-xl font-extrabold leading-tight text-slate-950">{pkg.title}</h3>
                        <p className="mt-3 min-h-[72px] text-sm font-medium leading-6 text-slate-600">{pkg.description}</p>
                        <div className="mt-5 flex items-end gap-3">
                          <div className="text-3xl font-black tracking-tight text-[#0B1326] sm:text-4xl">{formatLandingPackagePrice(pkg.price)}</div>
                          {pkg.original_price ? <div className="pb-1 text-sm font-bold text-slate-400 line-through">{pkg.original_price}</div> : null}
                        </div>
                      </div>
                      <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 border-y border-slate-100 py-4 text-sm">
                        <div>
                          <div className="text-xs font-bold uppercase text-slate-400">Durasi</div>
                          <div className="mt-1 font-extrabold text-slate-900">{pkg.duration || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold uppercase text-slate-400">Soal</div>
                          <div className="mt-1 font-extrabold text-slate-900">{Number(pkg.questions) || 0} soal</div>
                        </div>
                      </div>
                      <ul className="relative z-10 mt-5 space-y-2.5 text-sm font-semibold text-slate-600">
                        {features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2">
                            <Icon.Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        className="relative z-10 mt-auto inline-flex w-fit items-center justify-center gap-2 rounded-full bg-[#0B1326] px-5 py-3 text-sm font-extrabold text-[#FFF44F] shadow-lg shadow-slate-950/15 transition-colors hover:bg-slate-900"
                        onClick={() => buyLandingPackage(pkg)}
                        type="button"
                      >
                        {isFree ? "Coba Gratis" : "Beli Paket"} <Icon.Arrow className="h-4 w-4" />
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          </LandingFade>
        </section>

        <section id="fitur" className="relative scroll-mt-24 overflow-hidden border-y border-slate-200 bg-slate-50 py-10 sm:py-24">
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <div
              className="absolute inset-0 opacity-70"
              style={{
                backgroundImage: "linear-gradient(to right, rgba(15, 23, 42, 0.022) 1px, transparent 1px), linear-gradient(to bottom, rgba(15, 23, 42, 0.022) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div className="absolute -top-[18%] -right-[12%] h-[560px] w-[560px] rounded-full bg-yellow-100/45 opacity-55 blur-[155px] mix-blend-multiply" />
            <div className="absolute -bottom-[16%] -left-[12%] h-[540px] w-[540px] rounded-full bg-sky-50/60 opacity-55 blur-[155px] mix-blend-multiply" />
          </div>
          <LandingFade delay={150} className="relative z-10">
            <div className="mx-auto w-full max-w-[1800px] px-4 sm:px-6 md:px-12 lg:px-20">
              <div className="mx-auto mb-6 sm:mb-8 max-w-3xl text-center md:mb-12">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
                  Mengapa <span className="hi-yel">MAFIKING</span>?
                </h2>
              </div>
              <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                <div className="landing-card-motion group flex flex-col rounded-2xl sm:rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-8 shadow-sm transition-shadow hover:shadow-md"><h3 className="mb-2 sm:mb-3 text-lg sm:text-2xl font-bold text-slate-900">Rekomendasi Latihan</h3><p className="mb-4 sm:mb-8 text-sm sm:text-base font-medium text-slate-500">AI mendeteksi kelemahanmu dan merekomendasikan latihan soal untukmu.</p><div className="relative mt-auto aspect-[16/10] sm:aspect-[623/477] w-full overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-slate-50"><LandingEditableMedia enabled={landingMediaEditEnabled} slot="feature_image_1" label="gambar fitur 1" mediaType="image" onEdit={setMediaEditTarget}><LandingMediaImage src={featureOne} alt="Fitur rekomendasi latihan" /></LandingEditableMedia></div></div>
                <div className="landing-card-motion group flex flex-col rounded-2xl sm:rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-8 shadow-sm transition-shadow hover:shadow-md"><div className="mb-2 sm:mb-3 flex items-center gap-2"><h3 className="text-lg sm:text-2xl font-bold text-slate-900">History Kesalahan Canvas</h3><span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-amber-700">New</span></div><p className="mb-4 sm:mb-8 text-sm sm:text-base font-medium text-slate-500">Semua hitungan terekam otomatis. Ulangi di mana kamu salah, tanpa perlu mengulang dari awal.</p><div className="relative mt-auto min-h-[200px] sm:min-h-[460px] w-full overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-slate-50 md:min-h-[540px]"><LandingEditableMedia enabled={landingMediaEditEnabled} slot="feature_image_2" label="gambar fitur 2" mediaType="image" onEdit={setMediaEditTarget}><LandingMediaImage src={featureTwo} alt="Fitur history kesalahan canvas" fit="cover" objectPosition="0% 50%" /></LandingEditableMedia></div></div>
                <div className="landing-card-motion group flex flex-col items-center gap-4 sm:gap-8 rounded-2xl sm:rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-8 shadow-sm transition-shadow hover:shadow-md md:flex-row lg:col-span-2"><div className="flex w-full flex-col items-center justify-center text-center md:w-1/3"><h3 className="mb-3 sm:mb-5 text-lg sm:text-2xl font-bold text-slate-900">Simulasi Tryout CBT</h3><button onClick={startFree} className="rounded-xl border border-slate-200 bg-white px-4 py-2 sm:px-6 sm:py-3 text-xs sm:text-sm font-bold text-slate-900 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50" type="button">Coba Tryout Gratis</button></div><div className="relative aspect-video sm:aspect-[800/441] w-full overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-slate-50 md:w-2/3"><LandingEditableMedia enabled={landingMediaEditEnabled} slot="feature_image_3" label="gambar fitur tryout" mediaType="image" onEdit={setMediaEditTarget}><LandingMediaImage src={featureThree} alt="Fitur simulasi tryout CBT" /></LandingEditableMedia></div></div>
              </div>
            </div>
          </LandingFade>
        </section>

        <section id="pengajar" className="relative overflow-hidden bg-[#FBF8F1] py-10 sm:py-20 lg:py-24">
          <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
            <div
              className="absolute inset-0 opacity-80"
              style={{
                backgroundImage: "linear-gradient(to right, rgba(11, 19, 38, 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(11, 19, 38, 0.045) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
            <div className="absolute -right-[14%] top-[8%] h-[520px] w-[520px] rounded-full bg-[#FFF44F]/25 blur-[150px]" />
          </div>
          <LandingFade delay={165} className="relative z-10">
            <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 md:px-12 lg:px-20">
              <div className="mx-auto mb-8 max-w-3xl text-center sm:mb-12">
                <div className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Profil Pengajar</div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl md:text-5xl">
                  Pengajar Mafiking
                </h2>
              </div>
              <div className="landing-teacher-mobile-scroll hide-scrollbar landing-teacher-mask relative -mx-4 sm:-mx-6 md:-mx-12 lg:hidden">
                <div className="landing-teacher-track landing-teacher-mobile-track gap-3 px-3 sm:gap-5 sm:px-5 md:px-10 lg:gap-8 lg:px-20">
                  {teacherLoopProfiles.map((teacher, index) => (
                    <article key={`${teacher.name}-${index}`} className="landing-card-motion landing-teacher-card flex min-h-[400px] w-[64vw] shrink-0 flex-col rounded-2xl border border-slate-200 bg-white/92 px-5 py-6 text-center shadow-sm transition-shadow hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/70 sm:w-[min(60vw,300px)] sm:rounded-[1.75rem] sm:px-6 sm:py-7 lg:w-[430px]">
                      <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-[5px] border-[#FBF8F1] bg-[#0B1326] shadow-inner ring-1 ring-slate-200">
                        {teacher.photo ? (
                          <img src={teacher.photo} alt={teacher.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <span className="text-2xl font-black text-[#FFF44F]">{teacher.initial}</span>
                        )}
                      </div>
                      <h3 className="mx-auto mt-5 max-w-sm text-base font-extrabold leading-tight text-slate-900 sm:text-lg">
                        {teacher.name}
                      </h3>
                      <p className="mt-1 text-xs font-bold text-slate-500 sm:text-sm">{teacher.major}</p>
                      <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[#FFF44F] shadow-sm shadow-yellow-200" />
                      <div className="mt-5 text-left">
                        <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Prestasi</div>
                        <ol className="grid gap-2">
                        {teacher.awards.map((award, awardIndex) => {
                          return (
                            <li key={`${award.text}-${awardIndex}`} className={`flex min-h-[52px] items-center gap-3 rounded-xl border px-3 py-2 ${awardToneClasses[award.tone] || awardToneClasses.slate}`}>
                              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm ${awardIconClasses[award.tone] || awardIconClasses.slate}`}>
                                <span className="text-[10px] font-black">{awardIndex + 1}</span>
                              </span>
                              <span className="text-xs font-extrabold leading-snug">{award.text}</span>
                            </li>
                          );
                        })}
                        </ol>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-10 bg-gradient-to-l from-[#FBF8F1] to-transparent sm:w-16" />
              </div>
              <div className="mt-4 flex items-center justify-center gap-3 lg:hidden">
                <div className="landing-teacher-progress w-40 sm:w-56" aria-hidden="true">
                  <div className="landing-teacher-progress__bar" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Auto-scroll
                </span>
              </div>
              <div className="hidden lg:block landing-teacher-mask relative -mx-4 overflow-hidden sm:-mx-6 md:-mx-12 lg:-mx-20">
                <div className="landing-teacher-track flex w-max gap-4 px-4 sm:gap-6 sm:px-6 md:px-12 lg:gap-8 lg:px-20">
                  {[...teacherProfiles, ...teacherProfiles].map((teacher, index) => (
                    <article key={`${teacher.name}-${index}`} className="landing-card-motion landing-teacher-card flex min-h-[520px] w-[82vw] shrink-0 flex-col rounded-2xl border border-slate-200 bg-white/92 px-6 py-8 text-center shadow-sm transition-shadow hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/70 sm:w-[min(86vw,420px)] sm:rounded-[1.75rem] sm:px-8 sm:py-9 lg:w-[430px]">
                      <div className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-[6px] border-[#FBF8F1] bg-[#0B1326] shadow-inner ring-1 ring-slate-200">
                        {teacher.photo ? (
                          <img src={teacher.photo} alt={teacher.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <span className="text-3xl font-black text-[#FFF44F]">{teacher.initial}</span>
                        )}
                      </div>
                      <h3 className="mx-auto mt-8 max-w-sm text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
                        {teacher.name}
                      </h3>
                      <p className="mt-2 text-sm font-bold text-slate-500 sm:text-base">{teacher.major}</p>
                      <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-[#FFF44F] shadow-sm shadow-yellow-200" />
                      <div className="mt-7 text-left">
                        <div className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Prestasi</div>
                        <ol className="grid gap-3">
                        {teacher.awards.map((award, awardIndex) => {
                          return (
                            <li key={`${award.text}-${awardIndex}`} className={`flex min-h-[70px] items-center gap-4 rounded-xl border px-4 py-3 ${awardToneClasses[award.tone] || awardToneClasses.slate}`}>
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm ${awardIconClasses[award.tone] || awardIconClasses.slate}`}>
                                <span className="text-xs font-black">{awardIndex + 1}</span>
                              </span>
                              <span className="text-sm font-extrabold leading-snug">{award.text}</span>
                            </li>
                          );
                        })}
                        </ol>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-10 bg-gradient-to-l from-[#FBF8F1] to-transparent sm:w-16" />
              </div>
            </div>
          </LandingFade>
        </section>

        <section className="relative overflow-hidden bg-[#0B1221] py-10 sm:py-24 text-white md:py-32">
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-20"
            style={{
              backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <LandingFade delay={170}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
            <div className="relative z-10 mx-auto w-full max-w-[1800px] px-6 md:px-12 lg:px-20">
              <div className="mb-6 sm:mb-10 text-center md:mb-12">
                <h2 className="flex flex-col items-center gap-2 sm:gap-3 md:gap-4 text-center text-2xl sm:text-3xl font-extrabold tracking-tight text-white md:text-5xl lg:text-6xl">
                  <span>New</span>
                  <span>Canvas Mode</span>
                </h2>
              </div>
              <div ref={demoVideoFrameRef} className="relative mx-auto mb-6 sm:mb-16 flex aspect-video sm:aspect-[848/478] w-full max-w-5xl items-center justify-center overflow-hidden rounded-2xl sm:rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl">
                {demoVideo ? (
                  <video
			                    ref={demoVideoRef}
			                    data-src={demoVideo}
			                    muted={!soundEnabled}
			                    loop
			                    poster={demoVideoAsset.poster || undefined}
			                    preload="none"
			                    loading="lazy"
			                    playsInline
			                    className="h-full w-full scale-[1.06] object-contain"
		                  >
		                    {demoVideoShouldLoad && demoVideoAsset.webm && <source src={demoVideoAsset.webm} type="video/webm" />}
		                    {demoVideoShouldLoad && demoVideo && <source src={demoVideo} type="video/mp4" />}
		                  </video>
	                ) : (
                  <div className="flex h-full w-full flex-col bg-[#0F172A] p-8 opacity-50"><div className="mb-6 flex w-full max-w-sm items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/80 px-4 py-3"><div className="flex gap-2"><div className="h-3 w-3 rounded-full bg-rose-500" /><div className="h-3 w-3 rounded-full bg-amber-500" /><div className="h-3 w-3 rounded-full bg-emerald-500" /></div><div className="font-mono text-xs text-slate-400">canvas_evaluation_ai.js</div></div><div className="flex-grow space-y-6"><div className="h-4 w-1/3 rounded-md bg-slate-800" /><div className="h-4 w-1/2 rounded-md bg-slate-800" /><div className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border border-rose-500/30 bg-slate-800/50 shadow-inner"><div className="absolute bottom-0 left-0 top-0 w-1 bg-rose-500" /><span className="font-mono text-sm text-rose-400">Error Detected: Calculation logic drift in Step 3.</span></div></div></div>
	                )}
	                <LandingEditableMedia enabled={landingMediaEditEnabled} slot="demo_video" label="video demo canvas" mediaType="video" onEdit={setMediaEditTarget} />
	                {demoVideo && (
	                  <button
	                    onClick={toggleDemoSound}
	                    className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/75 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-md transition-colors hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-white/60"
	                    type="button"
	                    aria-label={soundEnabled ? "Matikan suara video demo" : "Nyalakan suara video demo"}
	                  >
	                    {soundEnabled ? (
	                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
	                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
	                        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
	                        <path d="M19 5a10 10 0 0 1 0 14" />
	                      </svg>
	                    ) : (
	                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
	                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
	                        <path d="M22 9l-6 6" />
	                        <path d="M16 9l6 6" />
	                      </svg>
	                    )}
	                    <span>{soundEnabled ? "SOUND ON" : "SOUND OFF"}</span>
	                  </button>
	                )}
	              </div>
              <div className="mx-auto grid w-full grid-cols-3 gap-4 sm:gap-8 md:gap-16">
                {[["1", "Tulis langsung di tab kamu"], ["2", "Koreksi langsung otomatis"], ["3", "Dapatkan rekomendasi materi"]].map(([num, title]) => (
                  <div key={num} className="text-center"><div className="mx-auto mb-3 sm:mb-6 flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-lg sm:rounded-xl border border-slate-700 bg-slate-800"><span className="text-sm sm:text-xl font-bold">{num}</span></div><h4 className="text-xs sm:text-lg font-bold text-white leading-tight">{title}</h4></div>
                ))}
              </div>
            </div>
          </LandingFade>
        </section>

        <section id="testimoni" className="relative mx-auto w-full max-w-[1800px] scroll-mt-24 overflow-hidden px-4 py-10 sm:px-6 sm:py-24 md:px-12 lg:px-20 lg:py-32">
          <LandingFade delay={190}>
            <h2 className="mb-6 sm:mb-16 text-2xl sm:text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 md:text-5xl lg:mb-24 lg:text-center lg:text-7xl">Apa kata mereka yang ikut<br className="hidden lg:block" /> <span className="font-serif font-medium italic text-slate-500">SiapUTS semester 2?</span></h2>
            <div className="landing-testimonial-mask relative -mx-4 sm:-mx-6 md:-mx-12 lg:-mx-20 overflow-hidden">
              <div className="landing-testimonial-track flex w-max gap-4 sm:gap-6 px-4 sm:px-6 md:px-12 lg:gap-8 lg:px-20">
                {[...testimonials, ...testimonials].map(([quote, name, meta, initial], index) => (
                  <div key={`${name}-${index}`} className="landing-testimonial-card flex w-[78vw] sm:w-[min(86vw,440px)] shrink-0 flex-col rounded-2xl sm:rounded-[2rem] border border-slate-200 bg-slate-50/95 p-5 sm:p-8 lg:w-[520px] lg:p-10">
                    <div className="mb-3 sm:mb-6 flex gap-1 text-amber-400">{[0,1,2,3,4].map(i => <Icon.Star key={i} className="h-4 w-4 sm:h-5 sm:w-5" />)}</div>
                    <p className="mb-6 sm:mb-10 min-h-[80px] sm:min-h-[112px] text-sm sm:text-lg font-medium leading-relaxed text-slate-700">"{quote}"</p>
                    <div className="mt-auto flex items-center gap-3 sm:gap-4">
                      <div className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-slate-300 bg-slate-200 text-sm sm:text-base font-bold text-slate-700">{initial}</div>
                      <div>
                        <div className="text-sm sm:text-base font-bold text-slate-900">{name}</div>
                        <div className="text-xs sm:text-sm font-medium text-slate-500">{meta}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 sm:w-16 bg-gradient-to-l from-white to-transparent z-10" />
            </div>
          </LandingFade>
        </section>
      </main>

      <footer className="relative z-10 w-full overflow-hidden border-t border-slate-800 bg-[#0B1221] pb-8 sm:pb-12 pt-10 sm:pt-24">
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
          <div className="absolute left-1/2 top-[-10%] h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-slate-400/10 blur-[130px]" />
          <div className="absolute left-[18%] top-[12%] h-[560px] w-[560px] rounded-full bg-blue-500/10 blur-[150px]" />
          <div className="absolute right-[18%] top-[4%] h-[520px] w-[520px] rounded-full bg-yellow-300/8 blur-[150px]" />
        </div>
        <LandingFade delay={210} className="relative z-10">
          <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center px-4 sm:px-6 text-center md:px-12 lg:px-20">
            <h2 className="mb-4 sm:mb-8 text-2xl sm:text-4xl font-extrabold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-7xl">Siap Mengamankan <br className="hidden md:block" /> <span className="text-[#FFF44F]">Nilai A Pertamamu?</span></h2>
            <button onClick={startFree} className="mb-6 sm:mb-8 flex items-center justify-center gap-2 rounded-full bg-[#FFF44F] px-6 py-3 sm:px-8 sm:py-4 text-sm sm:text-lg font-bold text-slate-900 transition-all hover:bg-[#FFF44F]/90 active:scale-95" type="button">Coba Gratis <Icon.Arrow className="ml-1 h-4 w-4 sm:h-5 sm:w-5" /></button>
            <div className="mb-6 sm:mb-10 mt-8 sm:mt-16 h-px w-full bg-slate-800/80" />
            <div className="grid w-full items-center gap-8 text-sm font-medium text-slate-500 lg:grid-cols-[1fr_auto_1fr]">
              <div className="flex items-center justify-center gap-3 lg:justify-start"><img src="/assets/logo.png" alt="MAFIKING" className="h-8 w-auto brightness-0 invert" /><span className="text-xl font-extrabold tracking-tight text-white">MAFIKING</span></div>
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center justify-center gap-3">
                  <a className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-white/[0.03] text-slate-300 transition-colors hover:border-emerald-400 hover:bg-emerald-400/10 hover:text-emerald-300" href="https://wa.me/6281246049951" target="_blank" rel="noreferrer" aria-label="WhatsApp Mafiking">
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12.04 3.5A8.45 8.45 0 0 0 4.7 16.14L3.5 20.5l4.47-1.17A8.46 8.46 0 1 0 12.04 3.5Zm0 1.67a6.78 6.78 0 1 1-3.44 12.62l-.25-.15-2.65.69.71-2.58-.17-.27a6.78 6.78 0 0 1 5.8-10.31Zm-2.7 3.49c-.15 0-.39.06-.6.29-.2.23-.78.76-.78 1.85s.8 2.15.91 2.3c.12.15 1.55 2.47 3.83 3.36 1.9.75 2.29.6 2.7.56.42-.04 1.34-.55 1.53-1.08.19-.53.19-.98.13-1.08-.06-.09-.21-.15-.45-.27-.24-.12-1.39-.69-1.61-.76-.22-.08-.38-.12-.54.12-.16.24-.62.76-.76.92-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.02-.37.1-.49.11-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.53-1.28-.73-1.75-.19-.46-.39-.39-.54-.4Z" />
                    </svg>
                  </a>
                  <a className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-white/[0.03] text-slate-300 transition-colors hover:border-pink-400 hover:bg-pink-400/10 hover:text-pink-300" href="https://www.instagram.com/mafiking._" target="_blank" rel="noreferrer" aria-label="Instagram Mafiking">
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="4" y="4" width="16" height="16" rx="5" />
                      <circle cx="12" cy="12" r="3.4" />
                      <path d="M16.9 7.1h.01" />
                    </svg>
                  </a>
                  <a className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-white/[0.03] text-slate-300 transition-colors hover:border-blue-400 hover:bg-blue-400/10 hover:text-blue-300" href="mailto:mafikingsolusitpb@gmail.com" target="_blank" rel="noreferrer" aria-label="Email Mafiking">
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="3" />
                      <path d="M2 4l10 7 10-7" />
                    </svg>
                  </a>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
                  <button className="transition-colors hover:text-white" type="button">Kebijakan Privasi</button>
                  <a className="transition-colors hover:text-white" href="/syarat-ketentuan.html">Syarat &amp; Ketentuan</a>
                </div>
              </div>
              <div className="text-center lg:text-right">&copy; 2026 Mafiking.</div>
            </div>
          </div>
        </LandingFade>
      </footer>
      <LandingMediaUploadModal
        target={mediaEditTarget}
        onClose={() => setMediaEditTarget(null)}
        onUploaded={updateLandingMedia}
      />
    </div>
  );
};

function buildLandingOffers(packages) {
  const fallback = [
    {
      title: "Tryout Bundling: Semester 1",
      description: "Evaluasi lengkap Matematika, Fisika, dan Kimia untuk persiapan UAS.",
      price: "Rp 50.000",
      original_price: null,
      badge: "Populer",
      duration: "180 mnt",
      questions: 90,
      features: JSON.stringify(["3 mata pelajaran dasar", "Sistem CBT seperti UAS", "Analisis butir soal AI"]),
      tone: "default",
    },
    {
      title: "Tryout Premium: The Trinity TPB",
      description: "Simulasi pre-test TPB ITB berisi Matematika, Fisika, dan Kimia.",
      price: "Rp 100.000",
      original_price: "Rp 150.000",
      badge: "Terlengkap",
      duration: "90 mnt",
      questions: 30,
      features: JSON.stringify(["30 soal campuran TPB", "Urutan soal dan opsi diacak", "Pembahasan step-by-step"]),
      tone: "feature",
    },
    {
      title: "Tryout Gratis: Bab 1-2",
      description: "Coba sistem CBT Mafiking secara gratis untuk Kalkulus Dasar.",
      price: "Gratis",
      original_price: null,
      badge: "Gratis",
      duration: "30 mnt",
      questions: 15,
      features: JSON.stringify(["1 mata pelajaran", "Hasil keluar instan", "Pembahasan teks dasar"]),
      tone: "default",
    },
  ];

  const rows = Array.isArray(packages) && packages.length ? packages : fallback;
  const ordered = rows.slice().sort((a, b) => {
    const aFree = isLandingPackageFree(a) ? 1 : 0;
    const bFree = isLandingPackageFree(b) ? 1 : 0;
    if (aFree !== bFree) return aFree - bFree;
    return Number(a.sort_order || 0) - Number(b.sort_order || 0);
  });
  return ordered.slice(0, 3);
}

function parseLandingPackageFeatures(pkg) {
  const value = pkg && pkg.features;
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (_) {}
    return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function isLandingPackageFree(pkg) {
  const price = String(pkg && pkg.price || "").trim().toLowerCase();
  return !price || price === "gratis" || price === "rp 0" || price === "0";
}

function formatLandingPackagePrice(price) {
  if (typeof price === "number") return `Rp ${Math.round(price).toLocaleString("id-ID")}`;
  const raw = String(price || "").trim();
  if (!raw || raw.toLowerCase() === "gratis") return "Gratis";
  const amount = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
  if (!amount) return raw;
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

const Dashboard = ({ user, setRoute, tweaks }) => {
  const { useState, useEffect } = React;
  const [stats, setStats] = useState(null);
  const [correctionAttempts, setCorrectionAttempts] = useState([]);
  const [profileSummary, setProfileSummary] = useState(null);

  useEffect(() => {
    MafikingAPI.get("/api/progress/stats").then(setStats).catch(() => null);
    MafikingAPI.get("/api/correction/attempts")
      .then((attempts) => {
        const normalizedAttempts = Array.isArray(attempts) ? attempts : [];
        setCorrectionAttempts(normalizedAttempts);
        return MafikingAPI.post("/api/correction/profile-summary", { attempts: normalizedAttempts });
      })
      .then((data) => setProfileSummary(data?.summary || null))
      .catch(() => null);
  }, []);

  const hour = new Date().getHours();
  const salam = hour < 10 ? "pagi" : hour < 15 ? "siang" : hour < 18 ? "sore" : "malam";
  const firstName = (user.display_name || "Kawan").split(" ")[0];
  const progress = normalizeProgressStats(stats || user);
  const level = progress.level;
  const xp = progress.xp;
  const levelProgress = progress.levelProgress;

  const allChapters = (() => {
    const cd = window.chapterData;
    if (!cd) return [];
    return Object.entries(cd).flatMap(([mapel, chs]) => chs.map((ch) => ({ ...ch, mapel })));
  })();
  const continueChapter = allChapters.find((ch) => ch.progress > 0) || allChapters[0];

  return (
    <div className="bg-paper">
      <section className="pt-12 pb-6">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b hairline">
            <div>
              <p className="kicker mb-1.5">Dashboard</p>
              <h1 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-none mb-3">
                Selamat {salam}, {firstName}.
              </h1>
              <p className="text-ink/65 text-sm md:text-base">Siap melanjutkan perjalanan akademismu di TPB ITB?</p>
            </div>
            {stats && (
              <div className="flex flex-wrap items-center gap-3">
                <button className="chip-streak" onClick={() => setRoute("lobby")} type="button" title={`Streak ${progress.streakDays} hari`}>
                  <StreakFlame />
                  <span className="tnum">{progress.streakDays}</span>
                </button>
                <div className="chip-level" title={`Level ${level} · ${xp} XP`}>
                  <span className="lvl-badge">L{level}</span>
                  <div className="lvl-bar"><div style={{ width: `${levelProgress}%` }}></div></div>
                  <span className="text-[10px] font-mono text-ink/45 tnum">{xp} XP</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {continueChapter ? (
        <section className="pb-8">
          <div className="max-w-6xl mx-auto px-6 md:px-8">
            <div 
              className="relative overflow-hidden rounded-[var(--card-radius)] p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
              style={{
                background: "linear-gradient(135deg, #0b1326 0%, #15223e 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 40px -15px rgba(11, 19, 38, 0.3)"
              }}
            >
              {/* Subtle background glow */}
              <div 
                className="absolute w-[200px] h-[200px] rounded-full blur-[80px] pointer-events-none opacity-20"
                style={{
                  top: "-50px",
                  right: "-20px",
                  background: "var(--yel)"
                }}
              />
              
              <div className="relative z-10 flex-1 min-w-0">
                <p className="text-xs uppercase tracking-widest font-semibold text-white/50 mb-2">Lanjutkan Belajar</p>
                <h2 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.025em] text-white">
                  Bab {continueChapter.num}: {continueChapter.title}
                </h2>
                <p className="text-white/70 text-sm md:text-base mt-2 flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-white/10 text-xs font-semibold uppercase">{continueChapter.mapel}</span>
                  <span>Estimasi waktu: {continueChapter.est}</span>
                </p>
                {continueChapter.progress > 0 ? (
                  <div className="flex items-center gap-3 mt-4">
                    <div className="bar flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full" 
                        style={{ 
                          width: `${Math.round((continueChapter.progress / continueChapter.total) * 100)}%`,
                          background: "var(--yel)"
                        }} 
                      />
                    </div>
                    <span className="text-xs font-mono text-white/60 shrink-0 tnum">
                      {continueChapter.progress} / {continueChapter.total} Soal Selesai ({Math.round((continueChapter.progress / continueChapter.total) * 100)}%)
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-white/50 mt-3">Kamu belum memulai bab ini. Mari raih nilai A!</p>
                )}
              </div>
              <button
                className="btn-yel shrink-0 relative z-10 !py-3 !px-6 text-sm flex items-center gap-1.5"
                onClick={() => setRoute({ route: "practice", practice: continueChapter })}
                type="button"
              >
                {continueChapter.progress > 0 ? "Lanjutkan" : "Mulai"} <Icon.Arrow className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <StudyRecap
        attempts={correctionAttempts}
        stats={stats}
        summary={profileSummary}
        user={user}
        setRoute={setRoute}
      />
    </div>
  );
};

// ─── HERO 1 · SPLIT (asymmetric, minimal photo right) ─────────────────────
const HeroSplit = ({ setRoute, showTryoutLink = true }) => (
  <section className="bg-paper">
    <div className="max-w-6xl mx-auto px-6 md:px-8 pt-12 md:pt-20 pb-16 md:pb-24">
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 tag mb-7">
            <Icon.Sparkles className="w-3.5 h-3.5" />
            Bimbel #1 untuk TPB ITB
          </div>
          <h1 className="font-display text-[2.1rem] font-bold leading-[1.02] tracking-[-0.03em] min-[390px]:text-[2.25rem] sm:text-[3.55rem] md:text-6xl lg:text-[5rem]">
            Taklukkan TPB<br/>
            <span className="whitespace-nowrap" style={{ color: "rgb(11 19 38 / 0.4)" }}>tanpa harus</span><br/>
            <span className="whitespace-nowrap" style={{ color: "rgb(11 19 38 / 0.4)" }}>panik,</span><br/>
            <span className="hi-yel whitespace-nowrap">mulai dari fondasi</span>
          </h1>
          <p className="text-ink/65 text-lg md:text-xl leading-relaxed mt-6 max-w-xl">
            Bimbingan Matematika, Fisika, dan Kimia dasar khusus mahasiswa ITB. Belajar dengan modul terstruktur, latihan adaptif, dan mentor IP&nbsp;4,00.
          </p>
          <div className="flex flex-wrap items-center gap-5 mt-9">
            <button onClick={() => setRoute("belajar")} className="btn-ink">
              Coba Gratis <Icon.Arrow />
            </button>
            {showTryoutLink && (
              <button onClick={() => setRoute("tryout")} className="text-ink/70 font-semibold text-sm hover:text-ink inline-flex items-center gap-1.5">
                atau lihat tryout <Icon.Arrow className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-6 mt-10 text-sm text-ink/55">
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="relative">
            <div className="photo-frame aspect-[4/5] w-full" data-label="FOTO · sesi mentor"></div>
            <div className="absolute -bottom-4 -left-4 card pad-d !p-4 flex items-center gap-3 bg-white">
              <div className="w-10 h-10 rounded-xl bg-yel/40 flex items-center justify-center">
                <Icon.Star className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold">Juara Internasional</div>
                <div className="text-xs text-ink/55">Olimpiade Fisika</div>
              </div>
            </div>
            <div className="absolute -top-4 -right-4 card !p-4 flex items-center gap-3 bg-white">
              <div className="w-10 h-10 rounded-xl bg-ink text-yel flex items-center justify-center">
                <Icon.Trophy className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold">IP 4,00</div>
                <div className="text-xs text-ink/55">Mentor ITB</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── HERO 2 · EDITORIAL (full-width tipografi besar, tanpa foto) ─────────
const HeroEditorial = ({ setRoute }) => (
  <section className="bg-paper border-b hairline">
    <div className="max-w-6xl mx-auto px-6 md:px-8 pt-16 md:pt-24 pb-14 md:pb-20">
      <div className="flex items-center gap-4 mb-10">
        <div className="h-px bg-ink w-10"></div>
        <div className="kicker">Bimbel #1 TPB ITB</div>
        <div className="h-px bg-ink/10 flex-1"></div>
        <div className="kicker text-ink/35">Est. 2023</div>
      </div>
      <h1 className="font-display max-w-5xl text-[2.1rem] font-bold leading-[0.93] tracking-[-0.04em] min-[390px]:text-[2.25rem] sm:text-[3.55rem] md:text-6xl lg:text-[5.2rem]">
        Taklukkan TPB<br/>
        <span className="whitespace-nowrap" style={{ color: "rgb(11 19 38 / 0.4)" }}>tanpa harus</span><br/>
        <span className="whitespace-nowrap" style={{ color: "rgb(11 19 38 / 0.4)" }}>panik,</span><br/>
        <span className="hi-yel whitespace-nowrap text-ink">mulai dari fondasi</span>
      </h1>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mt-12 pt-10 border-t hairline">
        <p className="text-ink/65 text-xl leading-relaxed max-w-lg">
          Matematika, Fisika, Kimia — modul terstruktur, latihan adaptif, mentor IP 4,00.
        </p>
        <div className="flex items-center gap-4 shrink-0">
          <button onClick={() => setRoute("belajar")} className="btn-ink !py-4 !px-7">
            Coba Gratis <Icon.Arrow />
          </button>
          <button onClick={() => setRoute("misi")} className="text-ink/60 font-semibold text-sm hover:text-ink inline-flex items-center gap-1.5">
            atau misi harian <Icon.Arrow className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </section>
);

// ─── HERO 3 · MARQUEE (judul besar + stat ticker horizontal) ─────────────
const HeroMarquee = ({ setRoute }) => (
  <section className="bg-paper">
    <div className="max-w-6xl mx-auto px-6 md:px-8 pt-14 md:pt-20 pb-10">
      <div className="inline-flex items-center gap-2 tag mb-8">
        <span className="dot-active"></span> Pendaftaran semester baru terbuka
      </div>
      <div className="grid lg:grid-cols-12 gap-8 items-end">
        <div className="lg:col-span-8">
          <h1 className="font-display font-bold text-[clamp(2.8rem,8vw,6.5rem)] leading-[0.96] tracking-[-0.04em]">
            Bimbel TPB ITB<br/>
            yang <span className="hi-yel">terbukti.</span>
          </h1>
        </div>
        <div className="lg:col-span-4 flex flex-col gap-3 pb-2">
          <p className="text-ink/65 leading-relaxed">Modul mingguan, latihan adaptif, dan mentor IP 4,00. Tanpa hafalan, lebih banyak intuisi.</p>
          <button onClick={() => setRoute("belajar")} className="btn-ink self-start">
            Coba Gratis <Icon.Arrow />
          </button>
        </div>
      </div>
    </div>
    <div className="border-y hairline bg-white overflow-hidden">
      <div className="flex items-center py-4 overflow-x-auto hide-scrollbar">
        <div className="flex gap-10 px-8 shrink-0">
          {[
            ["250+", "User Aktif"],
            ["98%", "Kepuasan"],
            ["15.000+", "Soal selesai"],
            ["3×", "Lebih cepat paham"],
            ["IP 4,00", "Mentor kami"],
            ["24/7", "Support"],
          ].map(([v, l]) => (
            <div key={l} className="shrink-0 flex items-center gap-3">
              <span className="font-display font-bold text-2xl tnum">{v}</span>
              <span className="text-sm text-ink/50">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// ─── Stats strip ──────────────────────────────────────────────────────────
const Stats = ({ tweaks = {} }) => {
  const style = tweaks.statsStyle || "strip";
  const items = [
    ["2.500+", "Mahasiswa aktif"],
    ["15.000+", "Soal diselesaikan"],
    ["98%", "Rating"],
    ["24/7", "Support mentor"],
  ];

  if (style === "cards") {
    return (
      <section className="sec-y-sm">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {items.map(([v, l]) => (
              <div key={l} className="card pad-d text-center">
                <div className="font-display font-bold text-3xl md:text-4xl tnum">{v}</div>
                <div className="text-sm text-ink/55 mt-1.5">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (style === "bold") {
    return (
      <section className="sec-y">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {items.map(([v, l]) => (
              <div key={l}>
                <div className="font-display font-bold text-5xl md:text-6xl tnum">{v}</div>
                <div className="text-sm text-ink/55 mt-2 font-medium uppercase tracking-widest" style={{fontSize:"10px",letterSpacing:"0.12em"}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-y hairline bg-white">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-2 text-center md:text-left">
        {items.map(([v, l]) => (
          <div key={l} className="md:px-4">
            <div className="font-display font-bold text-3xl md:text-4xl tnum">{v}</div>
            <div className="text-sm text-ink/55 mt-1">{l}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

// ─── Logged-in recap section ───────────────────────────────────────────────
const StudyRecap = ({ attempts = [], stats, summary, user, setRoute }) => {
  const hasCorrectionHistory = attempts.length > 0;
  const weaknesses = dashboardCollectTags(attempts, "weaknessTags", summary?.weaknesses).slice(0, 5);
  const recommendations = hasCorrectionHistory ? (summary?.recommendedQuestions || []).slice(0, 3) : [];
  const wrongAttempts = attempts
    .filter((attempt) => attempt && (attempt.isCorrect === false || attempt.evaluation?.isCorrect === false))
    .slice(0, 3);
  const mistakeItems = wrongAttempts.length
    ? wrongAttempts.map((attempt) => ({
        title: attempt.questionText || "Jawaban canvas",
        detail: dashboardCollectTags([attempt], "weaknessTags").join(", ") || "Perlu cek ulang langkah dan alasan jawaban.",
      }))
    : weaknesses.slice(0, 3).map((tag) => ({
        title: tag,
        detail: "Muncul sebagai pola yang perlu dikurangi di koreksi terakhir.",
      }));
  const visibleMistakes = mistakeItems.length ? mistakeItems : [
    { title: "Belum ada kesalahan tercatat", detail: "Kirim satu jawaban canvas agar sistem bisa membaca pola salahmu." },
  ];
  const visibleRecommendations = recommendations;
  const patternItems = weaknesses.length ? weaknesses : ["Konsistensi langkah", "Justifikasi rumus", "Kerapian substitusi"];

  const metrics = [
    { label: "Soal selesai", value: `${stats?.solvedProblems || 0}/${stats?.totalProblems || 0}`, icon: Icon.Target },
    { label: "Koreksi canvas", value: attempts.length, icon: Icon.CheckCircle },
    { label: "XP", value: user?.xp || stats?.xp || 0, icon: Icon.Bolt },
    { label: "Mastery", value: `${stats?.mastery || 0}%`, icon: Icon.Trophy },
  ];

  return (
    <section className="sec-y">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-8 gap-5">
          <div>
            <div className="kicker mb-2">Ringkasan Belajar</div>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.025em]">
              Fokus berikutnya dari hasil latihanmu.
            </h2>
          </div>
          <button onClick={() => setRoute("profile")} className="hidden md:inline-flex text-sm font-semibold items-center gap-1 hover:gap-2 transition-all">
            Lihat raport lengkap <Icon.Arrow />
          </button>
        </div>

        <div className="grid lg:grid-cols-12 gap-5">
          <article className="lg:col-span-5 card pad-d bg-white">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <div className="kicker mb-1">Recap Kesalahan</div>
                <h3 className="font-display font-bold text-2xl tracking-[-0.02em]">Yang perlu dibereskan.</h3>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center shrink-0">
                <Icon.Target className="w-5 h-5" />
              </div>
            </div>
            <div className="grid gap-3">
              {visibleMistakes.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-2xl bg-ink/[0.025] border hairline p-4">
                  <div className="text-xs font-mono text-ink/40 mb-1">0{index + 1}</div>
                  <div className="font-semibold leading-snug line-clamp-2">{item.title}</div>
                  <div className="text-sm text-ink/55 mt-1 leading-relaxed">{item.detail}</div>
                </div>
              ))}
            </div>
          </article>

          <article className="lg:col-span-4 card pad-d bg-white">
            <div className="kicker mb-1">Rekomendasi Soal</div>
            <h3 className="font-display font-bold text-2xl tracking-[-0.02em] mb-5">Latihan berikutnya.</h3>
            {visibleRecommendations.length ? (
              <>
                <ol className="grid gap-3">
                  {visibleRecommendations.map((question, index) => (
                    <li key={`${question}-${index}`} className="flex gap-3 rounded-2xl border hairline p-4">
                      <span className="w-7 h-7 rounded-full bg-ink text-white text-xs font-mono flex items-center justify-center shrink-0">{index + 1}</span>
                      <span className="text-sm text-ink/70 leading-relaxed">{question}</span>
                    </li>
                  ))}
                </ol>
                <button onClick={() => setRoute("belajar")} className="btn-ink mt-5 w-full justify-center">
                  Mulai dari rekomendasi <Icon.Arrow />
                </button>
              </>
            ) : (
              <p className="text-sm text-ink/55 leading-relaxed">
                Rekomendasi akan muncul setelah kamu mengirim jawaban canvas pertama.
              </p>
            )}
          </article>

          <article className="lg:col-span-3 card pad-d bg-ink text-white overflow-hidden relative">
            <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl opacity-30" style={{ background: "var(--yel)" }} />
            <div className="relative">
              <div className="kicker mb-1 !text-white/45">Pola Diperbaiki</div>
              <h3 className="font-display font-bold text-2xl tracking-[-0.02em] mb-5">Prioritas minggu ini.</h3>
              <div className="flex flex-wrap gap-2">
                {patternItems.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80">{tag}</span>
                ))}
              </div>
              <p className="text-sm text-white/60 leading-relaxed mt-6">
                {summary?.overallSummary || "Belum ada ringkasan koreksi. Kerjakan latihan canvas untuk membuat pola belajar yang lebih presisi."}
              </p>
            </div>
          </article>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border hairline bg-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-ink/[0.035] flex items-center justify-center shrink-0">
                <metric.icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-2xl tnum truncate">{metric.value}</div>
                <div className="text-[11px] text-ink/55 truncate">{metric.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

function dashboardCollectTags(attempts, key, fallback = []) {
  const counts = new Map();
  attempts.forEach((attempt) => {
    const tags = attempt?.[key] || attempt?.evaluation?.[key] || [];
    tags.forEach((tag) => {
      const normalized = formatDashboardLearningLabel(tag);
      if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });
  });
  const collected = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  return collected.length ? collected : (Array.isArray(fallback) ? fallback.map(formatDashboardLearningLabel) : []);
}

function formatDashboardLearningLabel(label) {
  const text = String(label || '').trim();
  const key = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const labels = {
    turunan: 'Menghitung turunan',
    'aturan turunan dasar': 'Menghitung turunan dasar',
    'chain rule': 'Menerapkan aturan rantai',
    'aturan rantai': 'Menerapkan aturan rantai',
    'isolasi variabel': 'Mengisolasi variabel dalam persamaan',
    'dy dx isolation': 'Mengisolasi dy/dx',
    'konsep konstanta integrasi': 'Menentukan konstanta integrasi',
    'constant of integration': 'Menentukan konstanta integrasi',
    'anti turunan dasar': 'Menentukan anti-turunan',
    'integral tentu': 'Menghitung integral tentu',
    'substitusi u': 'Melakukan substitusi u',
    'u substitution': 'Melakukan substitusi u',
  };
  return labels[key] || text;
}

// ─── Mapel section ────────────────────────────────────────────────────────
const Mapel = ({ setRoute }) => {
  const items = [
    { mapel: "Matematika", desc: "Kalkulus, aljabar, limit, deret tak terhingga, dll.", chapters: 14 },
    { mapel: "Fisika", desc: "Kinematika, dinamika, vektor, pengukuran, dll.", chapters: 12 },
    { mapel: "Kimia", desc: "Atom, reaksi, stoikiometri, asam-basa, dll.", chapters: 10 },
  ];
  return (
    <section className="sec-y">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="flex items-end justify-between mb-10 gap-6">
          <div>
            <div className="kicker mb-2">Mata Pelajaran</div>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.025em]">Tiga fondasi, ratusan bab.</h2>
          </div>
          <button onClick={() => setRoute("belajar")} className="hidden md:inline-flex text-sm font-semibold items-center gap-1 hover:gap-2 transition-all">
            Buka semua <Icon.Arrow />
          </button>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {items.map(it => {
            const M = MAPEL_META[it.mapel];
            return (
              <button
                key={it.mapel}
                onClick={() => setRoute("belajar")}
                className="card card-hover pad-d text-left group flex flex-col"
              >
                <div className="w-12 h-12 rounded-2xl bg-ink/5 flex items-center justify-center mb-5">
                  <M.icon className="w-5 h-5" />
                </div>
                <h3 className="font-display font-bold text-2xl mb-2">{it.mapel}</h3>
                <p className="text-center text-ink/65 text-sm leading-relaxed flex-1">{it.desc}</p>
                <div className="flex items-center justify-between mt-6 pt-4 border-t hairline">
                  <span className="text-xs font-mono text-ink/50">{it.chapters} bab</span>
                  <Icon.Arrow className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// ─── Method ───────────────────────────────────────────────────────────────
const Method = () => (
  <section className="sec-y bg-white border-y hairline">
    <div className="max-w-6xl mx-auto px-6 md:px-8">
      <div className="grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5">
          <div className="kicker mb-2">Metode</div>
          <h2 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
            Membentuk kebiasaan,<br/>
            <span className="text-ink/55">bukan sekadar hafalan.</span>
          </h2>
          <p className="text-ink/65 text-lg mt-6 max-w-md">
            Platform kami didesain untuk membangun intuisi matematis dan analitis yang bertahan lama — bukan hanya menyelesaikan PR.
          </p>
        </div>
        <div className="lg:col-span-7">
          {[
            { n: "01", t: "Materi terstruktur", d: "Topik rumit dipecah menjadi unit kecil yang mudah dicerna." },
            { n: "02", t: "Latihan adaptif", d: "Sistem pintar menyesuaikan kesulitan soal dengan pemahamanmu secara real-time." },
            { n: "03", t: "Komunitas & mentor", d: "Diskusi, tanya PR, dan dapatkan bimbingan langsung dari mentor ITB." },
          ].map((f, i) => (
            <div key={f.n} className={`flex gap-6 py-6 ${i > 0 ? "border-t hairline" : ""}`}>
              <div className="font-mono text-sm text-ink/55 shrink-0 w-8">{f.n}</div>
              <div className="flex-1">
                <h3 className="font-display font-semibold text-xl mb-1">{f.t}</h3>
                <p className="text-ink/60 leading-relaxed">{f.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// ─── Progress feature ────────────────────────────────────────────────────
const ProgressFeature = () => (
  <section className="sec-y">
    <div className="max-w-6xl mx-auto px-6 md:px-8">
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="kicker mb-2">Progres</div>
          <h2 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.03em] leading-[1.05]">
            IP yang bisa<br/>kamu <span className="hi-yel">ukur sendiri.</span>
          </h2>
          <p className="text-ink/65 text-lg mt-6 max-w-md">
            Setiap bab, setiap soal, setiap menit baca — terekam. Lihat sendiri sejauh mana fondasi akademikmu sudah terbangun.
          </p>
          <div className="flex items-center gap-6 mt-8">
            <div>
              <div className="font-display font-bold text-3xl tnum">3,84</div>
              <div className="text-xs text-ink/55">IP prediksi</div>
            </div>
            <div>
              <div className="font-display font-bold text-3xl tnum">12</div>
              <div className="text-xs text-ink/55">Hari berturut</div>
            </div>
            <div>
              <div className="font-display font-bold text-3xl tnum">8,4h</div>
              <div className="text-xs text-ink/55">Total baca</div>
            </div>
          </div>
        </div>
        <div className="card-soft p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="kicker text-xs">Laporan Pekan ini</div>
              <div className="font-semibold text-lg mt-0.5">Abiyyu L. · Sem. 1</div>
            </div>
            <span className="tag tag-emerald">
              <span className="dot-active"></span> On track
            </span>
          </div>
          <div className="space-y-5">
            {[
              ["Kalkulus 2A", 85],
              ["Fisika Dasar", 60],
              ["Kimia Dasar", 92],
            ].map(([t, v]) => (
              <div key={t}>
                <div className="flex justify-between mb-1.5 text-sm">
                  <span className="font-medium">{t}</span>
                  <span className="font-mono tnum text-ink/60">{v}%</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${v}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── Testimonials ─────────────────────────────────────────────────────────
const Testimonials = () => {
  const list = [
    { t: "Dulu paling takut sama Kalkulus karena nggak ngerti konsep dasar limit. Di sini semua jadi visual dan nyambung. UTS dapet A.", n: "Budi P.", r: "STEI-K '25" },
    { t: "Bedanya sama bimbel lain, tutornya beneran ngajak mikir bukan ngasih jalan pintas. Latihannya seru kayak main game.", n: "Sarah M.", r: "FTMD '25" },
    { t: "Fitur tracker progresnya ngebantu banget buat maintain semangat. Lihat streak harian langsung terpacu buka modul.", n: "Rizky D.", r: "SAPPK '25" },
  ];
  return (
    <section className="sec-y bg-white border-y hairline">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className="mb-12">
          <div className="kicker mb-2">Kata mereka</div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.025em]">Mahasiswa yang sudah berlangganan.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {list.map((q, i) => (
            <div key={q.n} className="card pad-d">
              <div className="flex gap-0.5 mb-4">
                {[0,1,2,3,4].map(k => <Icon.Star key={k} className="w-4 h-4 text-yel" />)}
              </div>
              <p className="text-ink/80 leading-relaxed mb-6">"{q.t}"</p>
              <div className="flex items-center gap-3 pt-4 border-t hairline">
                <div className="w-9 h-9 rounded-full bg-ink/5 flex items-center justify-center font-semibold">
                  {q.n.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-sm">{q.n}</div>
                  <div className="text-xs text-ink/55">{q.r}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── CTA ─────────────────────────────────────────────────────────────────
const CTA = ({ setRoute, tweaks = {} }) => {
  const style = tweaks.ctaStyle || "dark";
  const isInk = style === "dark";
  const isYel = style === "yellow";

  const wrapCls = isInk
    ? "bg-ink text-white rounded-[2rem] md:rounded-[2.5rem] px-8 md:px-14 py-14 md:py-20 text-center relative overflow-hidden"
    : isYel
    ? "rounded-[2rem] md:rounded-[2.5rem] px-8 md:px-14 py-14 md:py-20 text-center relative overflow-hidden text-ink"
    : "border-2 border-ink/12 rounded-[2rem] md:rounded-[2.5rem] px-8 md:px-14 py-14 md:py-20 text-center relative overflow-hidden text-ink";

  const wrapStyle = isYel ? { background: "var(--yel)" } : {};

  return (
    <section className="sec-y">
      <div className="max-w-6xl mx-auto px-6 md:px-8">
        <div className={wrapCls} style={wrapStyle}>
          <h2 className="font-display font-bold text-4xl md:text-6xl tracking-[-0.03em] leading-[1.0] max-w-3xl mx-auto">
            Siap mengamankan<br/>
            {isInk
              ? <span style={{color:"var(--yel)"}}>nilai A</span>
              : isYel
              ? <span className="underline decoration-2 underline-offset-4">nilai A</span>
              : <span>nilai A</span>
            } pertamamu?
          </h2>
          <p className={`text-lg mt-6 max-w-xl mx-auto ${isInk ? "text-white/65" : "text-ink/65"}`}>
            Jangan tunggu sampai tertinggal materi. Bangun fondasi akademik terkuatmu mulai hari ini.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
            <button onClick={() => setRoute("belajar")} className={isInk ? "btn-yel !py-4 !px-7" : "btn-ink !py-4 !px-7"}>
              Coba Gratis <Icon.Arrow />
            </button>
          </div>
          <div className={`flex items-center justify-center gap-6 mt-7 text-sm ${isInk ? "text-white/60" : "text-ink/55"}`}>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── Fitur Unggulan (compact grid) ────────────────────────────────────────

const FeatureCard = ({ title, desc, children, span = 1 }) => (
  <div
    className={`bg-white rounded-2xl border hairline overflow-hidden flex flex-col ${span === 2 ? 'md:col-span-2' : ''}`}
    style={{ boxShadow: '0 4px 24px -6px rgba(11,19,38,0.06)' }}
  >
    {/* Visual area */}
    <div className="relative overflow-hidden bg-paper border-b hairline" style={{ minHeight: 200 }}>
      {children}
    </div>
    {/* Text */}
    <div className="p-5">
      <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-ink mb-1.5">{title}</h3>
      <p className="text-ink/55 text-sm leading-relaxed">{desc}</p>
    </div>
  </div>
);

const UniqueFeatures = ({ setRoute, isAdmin = false }) => (
  <section className="sec-y bg-paper border-t border-b hairline">
    <div className="max-w-6xl mx-auto px-6 md:px-8">
      {/* Section Header */}
      <div className="text-center mb-12 max-w-3xl mx-auto">
        <h2 className="font-display font-bold text-3xl md:text-5xl tracking-[-0.03em] leading-tight text-ink mb-4">
          Fitur terlengkap & terintegrasi AI
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Rekomendasi */}
        <FeatureCard
          title="Rekomendasi Belajar"
          desc="AI memetakan kelemahanmu dan merekomendasikan porsi latihan yang sesuai."
        >
          <div className="p-4 h-full">
            <div className="card bg-white p-4 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
                  <Icon.Bolt className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-display font-bold text-base tracking-[-0.015em] text-ink">Rekomendasi Soal Latihan</h4>
                  <p className="text-xs text-ink/50">Berdasarkan kelemahan utama</p>
                </div>
              </div>
              {isAdmin ? (
                <div className="grid grid-cols-2 gap-2.5 flex-1">
                  {[
                    {
                      skill: "dy/dx dari x² + y² = 25",
                      action: "Turunan implisit",
                      tone: "bg-rose-50/60 border-rose-900/10"
                    },
                    {
                      skill: "∫ x eˣ dx",
                      action: "Integrasi parsial",
                      tone: "bg-amber-50/60 border-amber-900/10"
                    }
                  ].map((item, index) => (
                    <div key={item.skill} className={`rounded-xl border ${item.tone} p-3 flex flex-col justify-between min-w-0`}>
                      <div>
                        <span className="text-xs font-mono font-bold text-ink/35">#{index + 1}</span>
                        <p className="font-display font-bold text-sm text-ink leading-tight mt-1">{item.skill}</p>
                        <p className="text-xs text-ink/55 leading-snug mt-1">{item.action}</p>
                      </div>
                      <button className="btn-ink !py-1.5 !px-2.5 text-[10px] mt-3 w-full justify-center flex items-center gap-1" type="button">
                        Mulai <Icon.Arrow className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-ink/15 bg-ink/[0.02] p-4 flex-1 flex flex-col justify-center">
                  <p className="font-display font-bold text-sm text-ink">Rekomendasi muncul setelah latihan.</p>
                  <p className="text-xs text-ink/55 leading-snug mt-1">Data contoh hanya ditampilkan di mode admin.</p>
                </div>
              )}
            </div>
          </div>
        </FeatureCard>

        {/* Riwayat Kesalahan */}
        <FeatureCard
          title="Riwayat Kesalahan"
          desc="Semua soal salah terarsip otomatis. Ulangi kapan saja sampai benar."
        >
          <div className="p-4 h-full">
            <div className="card bg-white overflow-hidden h-full">
              <div className="px-4 py-3 border-b hairline flex items-center justify-between">
                <h4 className="font-display font-bold text-base text-ink">History Kesalahan Canvas</h4>
                <span className="text-xs font-semibold text-ink/45">Prioritas</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 p-3">
                {[
                  {
                    status: "Perlu Perbaikan",
                    title: "Integral Substitusi",
                    issue: "Ulangi konsep",
                    score: "45/100",
                    tone: "text-rose-600"
                  },
                  {
                    status: "Perlu Perbaikan",
                    title: "Turunan Komposisi",
                    issue: "Perkuat aturan rantai",
                    score: "60/100",
                    tone: "text-amber-600"
                  }
                ].map((item) => (
                  <div key={item.title} className="rounded-xl border border-ink/5 bg-ink/[0.02] p-3 min-w-0">
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border bg-rose-50/60 text-ink/65 border-rose-900/10">
                      {item.status}
                    </span>
                    <h5 className="font-display font-bold text-sm mt-2 text-ink leading-tight">{item.title}</h5>
                    <p className="text-xs text-ink/55 leading-snug mt-1">{item.issue}</p>
                    <div className="flex items-end justify-between gap-2 mt-3">
                      <div>
                        <span className="text-[9px] text-ink/40 block uppercase font-bold">Skor</span>
                        <span className={`font-display font-bold text-base ${item.tone}`}>{item.score}</span>
                      </div>
                      <button className="btn-ghost !py-1.5 !px-2.5 text-[10px]" type="button">Ulangi</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FeatureCard>

        {/* Tryout */}
        <FeatureCard
          title="Simulasi Tryout CBT"
          desc="Tryout berwaktu yang menyimulasikan UTS/UAS TPB ITB dengan evaluasi instan."
        >
          <div className="flex flex-col h-full">
            <div className="bg-ink text-white px-3 py-1.5 flex items-center justify-between text-[9px] font-mono">
              <span>Tryout UTS Kalkulus 1A</span>
              <span className="text-yel font-bold flex items-center gap-1">
                <Icon.Clock className="w-3 h-3"/>
                01:24:12
              </span>
            </div>
            <div className="flex-1 grid grid-cols-12 gap-0">
              <div className="col-span-8 p-3 flex flex-col justify-between border-r border-ink/5">
                <div className="space-y-1.5">
                  <div className="text-[8px] font-mono font-bold text-ink/35">SOAL 6 / 15</div>
                  <div className="text-[11px] font-semibold text-ink">Tentukan nilai dari limit:</div>
                  <div className="font-serif italic text-[11px] text-center bg-white py-1.5 rounded border border-ink/5">
                    lim (x → 0) [ sin(2x) / x ]
                  </div>
                  <div className="space-y-1">
                    <div className="border border-ink/10 rounded p-1 text-[9px] flex items-center gap-1"><span className="w-3 h-3 rounded-full border border-ink/15 flex items-center justify-center text-[7px]">A</span>0</div>
                    <div className="border border-ink/10 rounded p-1 text-[9px] flex items-center gap-1"><span className="w-3 h-3 rounded-full border border-ink/15 flex items-center justify-center text-[7px]">B</span>1</div>
                    <div className="border border-ink bg-yel/10 rounded p-1 text-[9px] font-bold flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-ink text-yel flex items-center justify-center text-[7px]">C</span>2</div>
                  </div>
                </div>
              </div>
              <div className="col-span-4 p-2 bg-paper flex flex-col justify-between">
                <div>
                  <div className="text-[7px] font-bold text-ink/35 uppercase font-mono mb-1">CBT</div>
                  <div className="grid grid-cols-3 gap-0.5">
                    {[
                      {n:1,c:'bg-emerald-600 text-white'},{n:2,c:'bg-emerald-600 text-white'},{n:3,c:'bg-emerald-600 text-white'},
                      {n:4,c:'bg-amber-400 text-ink'},{n:5,c:'bg-emerald-600 text-white'},{n:6,c:'bg-ink text-white'},
                      {n:7,c:'bg-white border hairline text-ink/40'},{n:8,c:'bg-white border hairline text-ink/40'},{n:9,c:'bg-white border hairline text-ink/40'},
                    ].map(i=><div key={i.n} className={`aspect-square rounded text-[7px] font-semibold flex items-center justify-center ${i.c}`}>{i.n}</div>)}
                  </div>
                </div>
                <button className="w-full bg-emerald-600 text-white text-[7px] font-bold py-0.5 rounded mt-1">Selesai</button>
              </div>
            </div>
          </div>
        </FeatureCard>
      </div>
    </div>
  </section>
);

const VideoDemo = () => (
    <section className="sec-y text-white" style={{ backgroundColor: '#0b1326' }}>
      <div className="max-w-4xl mx-auto px-6 md:px-8 text-center">
        {/* Header */}
        <div className="mb-10">
          <span className="kicker mb-3 block text-white/45">Tonton Dulu, Baru Yakin!</span>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.025em] leading-tight text-white mb-4">
            Lihat langsung demo fitur canvas & koreksi AI
          </h2>
          <p className="text-white/60 text-sm md:text-base max-w-xl mx-auto">
            Pelajari bagaimana coretan tanganmu dianalisis, dievaluasi baris demi baris, dan diberi skor secara instan oleh kecerdasan buatan.
          </p>
        </div>

        {/* Video Player Frame */}
        <div 
          className="relative rounded-[1.25rem] overflow-hidden border border-white/5 bg-slate-950 aspect-[16/9] shadow-2xl max-w-3xl mx-auto"
        >
          <img
            src="/assets/landing/simulasi-tryout.jpg?v=202606011620"
            alt="Preview fitur canvas dan koreksi AI"
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>

        {/* Quick process layout below the video */}
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 mt-12 text-sm text-white/50">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-yel">1</span>
            <span>Tulis penyelesaian bebas</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-yel">2</span>
            <span>AI koreksi per baris secara instan</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-yel">3</span>
            <span>Rekomendasi materi otomatis</span>
          </div>
        </div>
      </div>
    </section>
);

window.Lobby = Lobby;
