// MAFIKING — App router + Tweaks integration

class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, retryCount: 0 };
    this.retryTimer = null;
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error('[ScreenErrorBoundary]', error);
    if (window.reportMafikingClientError) {
      window.reportMafikingClientError('react.error-boundary', error, {
        componentStack: info && info.componentStack ? info.componentStack : '',
      });
    }
    if (!this.retryTimer && this.state.retryCount < 1) {
      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = null;
        this.setState((state) => ({ error: null, retryCount: state.retryCount + 1 }));
      }, 350);
    }
  }
  componentWillUnmount() {
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
  }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, fontFamily: 'monospace', fontSize: 13, background: '#ffffff', border: '1px solid rgba(11, 19, 38, 0.12)', borderRadius: 12, margin: 24, color: '#0b1326' }}>
        <strong>Memuat ulang tampilan:</strong> {this.state.error.message}
        <br /><br />
        <button onClick={() => this.setState((state) => ({ error: null, retryCount: state.retryCount + 1 }))} style={{ padding: '6px 16px', background: '#0b1326', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace' }}>Coba lagi</button>
      </div>
    );
    return this.props.children;
  }
}

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

const AdminChunkFallback = ({ status }) => (
  <section className="app-page-bg app-page-bg--admin min-h-[calc(100vh-72px)] px-6 md:px-8 py-10 md:py-12">
    <div className="admin-page-shell">
      <div className="admin-step-edit">
        <div className="font-display font-bold text-xl">
          {status === "error" ? "Panel admin gagal dimuat." : "Memuat panel admin..."}
        </div>
        <p className="text-sm text-ink/55 mt-2">
          {status === "error"
            ? "Muat ulang halaman atau kembali ke Belajar lalu buka admin lagi."
            : "Modul admin dipisah dari bundle utama agar halaman awal lebih ringan."}
        </p>
      </div>
    </div>
  </section>
);

const AUTH_BACK_ROUTE_STORAGE_KEY = "mafiking:last-non-auth-route";
const AUTH_BACK_PATH_STORAGE_KEY = "mafiking:last-non-auth-path";
const CLERK_OAUTH_CALLBACK_PATH = "/sso-callback";

function isClerkOAuthCallbackPath() {
  return normalizeAppPath(window.location.pathname) === CLERK_OAUTH_CALLBACK_PATH;
}

function readStoredAuthBackRoute() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(AUTH_BACK_ROUTE_STORAGE_KEY) || "null");
    return parsed && isSafeAuthBackRoute(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function isSafeAuthBackRoute(routeState) {
  if (!routeState || !routeState.route) return false;
  if (routeState.authMode) return false;
  if (routeState.route === "profile") return false;
  return true;
}

function writeStoredAuthBackRoute(routeState) {
  if (!isSafeAuthBackRoute(routeState)) return;
  try {
    window.sessionStorage.setItem(AUTH_BACK_ROUTE_STORAGE_KEY, JSON.stringify(routeState));
    window.sessionStorage.setItem(AUTH_BACK_PATH_STORAGE_KEY, appStateToPath(routeState));
  } catch (_) {}
}

const App = () => {
  const initialLocationRef = React.useRef(null);
  if (!initialLocationRef.current) initialLocationRef.current = parseAppLocation();
  const [route, setRoute] = React.useState(() => {
    return initialLocationRef.current.route;
  });
  const [practiceContext, setPracticeContext] = React.useState(null);
  const [paymentContext, setPaymentContext] = React.useState(null);
  const [tryoutContext, setTryoutContext] = React.useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [authMode, setAuthMode] = React.useState(() => initialLocationRef.current.authMode || null);
  const [authRedirect, setAuthRedirect] = React.useState(null);
  const [authBackRoute, setAuthBackRoute] = React.useState(null);
  const [authState, setAuthState] = React.useState(() => initialLocationRef.current.authState || null);
  const [pendingClerkUser, setPendingClerkUser] = React.useState(null);
  const [authReady, setAuthReady] = React.useState(false);
  const [authCallbackLoading, setAuthCallbackLoading] = React.useState(() => {
    return isClerkOAuthCallbackPath();
  });
  const [clerkCallbackReadyTick, setClerkCallbackReadyTick] = React.useState(0);
  const [belajarSection, setBelajarSection] = React.useState(null);
  const [activePackages, setActivePackages] = React.useState([]);
  const [confirmAction, setConfirmAction] = React.useState(null);
  const [adminChunkStatus, setAdminChunkStatus] = React.useState(() => window.AdminPage ? "ready" : "idle");
  const isGuest = currentUser && currentUser.display_name?.startsWith("Tamu_");
  const isLoggedIn = currentUser && !isGuest;
  const isAdminAccount = currentUser?.role === "admin";
  const canEditInlineAsAdmin = isAdmin || isAdminAccount;
  const hasPremiumAccess = isAdminAccount || activePackages.length > 0;

  const refreshCurrentUser = React.useCallback(async () => {
    const user = await MafikingAPI.get("/api/auth/me");
    setCurrentUser(user);
    try {
      const packages = await MafikingAPI.get("/api/payment/active-packages");
      setActivePackages(Array.isArray(packages) ? packages : []);
    } catch (_) {
      setActivePackages([]);
    }
    return user;
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasOrder = params.has("merchantOrderId");

    refreshCurrentUser()
      .then(() => {
        if (hasOrder) setRoute("payment");
      })
      .catch(() => {
        setCurrentUser(null);
        setActivePackages([]);
        if (hasOrder) setRoute("payment");
      })
      .finally(() => setAuthReady(true));
  }, [refreshCurrentUser]);

  const navigate = React.useCallback((next) => {
    let nextRoute = "lobby";
    let stateObj = {};
    if (next && typeof next === "object") {
      if (next.practice) setPracticeContext(next.practice);
      if (next.tryout) setTryoutContext(next.tryout);
      else setTryoutContext(null);
      if (next.payment) setPaymentContext(next.payment);
      else setPaymentContext(null);
      if (next.section || next.belajarSection) setBelajarSection(next.section || next.belajarSection);
      if (next.authMode) {
        const fallbackBackRoute = (authMode && authBackRoute) ? authBackRoute : {
          route,
          practice: practiceContext,
          tryout: tryoutContext,
          payment: paymentContext,
          belajarSection,
        };
        const resolvedBackRoute = next.authBackRoute
          || (isSafeAuthBackRoute(fallbackBackRoute) ? fallbackBackRoute : null)
          || readStoredAuthBackRoute()
          || { route: "lobby" };
        writeStoredAuthBackRoute(resolvedBackRoute);
        setAuthMode(next.authMode);
        setAuthRedirect(next.authRedirect || null);
        setAuthState(next.authState || null);
        setAuthBackRoute(resolvedBackRoute);
      } else {
        setAuthMode(null);
        setAuthRedirect(null);
        setAuthState(null);
        setAuthBackRoute(null);
      }
      nextRoute = next.route || "lobby";
      setRoute(nextRoute);
      stateObj = {
        route: nextRoute,
        practice: next.practice,
        tryout: next.tryout,
        payment: next.payment,
        belajarSection: next.section || next.belajarSection,
        authMode: next.authMode,
        authRedirect: next.authRedirect,
        authState: next.authState,
        authBackRoute: next.authMode
          ? (next.authBackRoute || (isSafeAuthBackRoute((authMode && authBackRoute) ? authBackRoute : {
            route,
            practice: practiceContext,
            tryout: tryoutContext,
            payment: paymentContext,
            belajarSection,
          }) ? ((authMode && authBackRoute) ? authBackRoute : {
            route,
            practice: practiceContext,
            tryout: tryoutContext,
            payment: paymentContext,
            belajarSection,
          }) : null) || readStoredAuthBackRoute() || { route: "lobby" })
          : null
      };
    } else {
      setPaymentContext(null);
      setTryoutContext(null);
      setAuthMode(null);
      setAuthRedirect(null);
      setAuthState(null);
      setAuthBackRoute(null);
      if (next !== "belajar") setBelajarSection(null);
      nextRoute = next;
      setRoute(nextRoute);
      stateObj = { route: nextRoute };
    }
    
    const nextPath = appStateToPath(stateObj);
    if (normalizeAppPath(window.location.pathname) !== normalizeAppPath(nextPath) || window.location.hash) {
      window.history.pushState(stateObj, "", nextPath);
    } else {
      window.history.replaceState(stateObj, "", nextPath);
    }
  }, [route, practiceContext, tryoutContext, paymentContext, belajarSection, authMode, authBackRoute]);

  React.useEffect(() => {
    if (isClerkOAuthCallbackPath()) return undefined;

    const handlePopState = (event) => {
      if (event.state) {
        const state = event.state;
        setRoute(state.route || "lobby");
        setPracticeContext(state.practice || null);
        setTryoutContext(state.tryout || null);
        setPaymentContext(state.payment || null);
        setBelajarSection(state.belajarSection || null);
        setAuthMode(state.authMode || null);
        setAuthRedirect(state.authRedirect || null);
        setAuthState(state.authState || null);
        setAuthBackRoute(state.authBackRoute || null);
      } else {
        const parsed = parseAppLocation();
        setRoute(parsed.route);
        setBelajarSection(parsed.belajarSection || null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    
    const parsed = parseAppLocation();
    const initialState = window.history.state || { route: parsed.route, belajarSection: parsed.belajarSection, authMode: parsed.authMode };
    setBelajarSection(parsed.belajarSection || null);
    setAuthMode(parsed.authMode || null);
    setAuthRedirect(initialState.authRedirect || null);
    setAuthState(initialState.authState || parsed.authState || null);
    const initialAuthBackRoute = initialState.authBackRoute || (parsed.authMode ? readStoredAuthBackRoute() : null);
    setAuthBackRoute(initialAuthBackRoute);
    if (initialAuthBackRoute && parsed.authMode && !initialState.authBackRoute) {
      initialState.authBackRoute = initialAuthBackRoute;
    }
    window.history.replaceState(initialState, "", appStateToPath(initialState));
    
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  React.useEffect(() => {
    if (authMode) return;
    if (route === "profile" && !isLoggedIn) return;
    writeStoredAuthBackRoute({
      route,
      practice: practiceContext,
      tryout: tryoutContext,
      payment: paymentContext,
      belajarSection,
    });
  }, [authMode, route, isLoggedIn, practiceContext, tryoutContext, paymentContext, belajarSection]);

  const requestConfirm = React.useCallback((config) => {
    setConfirmAction({
      title: config.title || "Konfirmasi",
      message: config.message || "",
      confirmLabel: config.confirmLabel || "Lanjut",
      cancelLabel: config.cancelLabel || "Batal",
      tone: config.tone || "default",
      onConfirm: config.onConfirm,
    });
  }, []);

  const confirmLandingReturn = React.useCallback(() => {
    navigate({ route: "lobby", publicLanding: true });
  }, [navigate]);

  const confirmLogout = React.useCallback(() => {
    requestConfirm({
      title: "Apakah ingin keluar?",
      confirmLabel: "Ya, logout",
      tone: "danger",
      onConfirm: async () => {
        try {
          await MafikingAPI.post("/api/auth/logout", {});
        } catch (_) {}
        if (window.MafikingClerk && typeof window.MafikingClerk.signOut === "function") {
          await window.MafikingClerk.signOut();
        }
        window.location.assign("/");
      },
    });
  }, [requestConfirm]);

  async function runConfirmedAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (action && typeof action.onConfirm === "function") {
      await action.onConfirm();
    }
  }

  const handleAuthSuccess = React.useCallback((user, redirect) => {
    setAuthReady(true);
    setCurrentUser(user);
    setPendingClerkUser(null);
    MafikingAPI.get("/api/payment/active-packages")
      .then((packages) => setActivePackages(Array.isArray(packages) ? packages : []))
      .catch(() => setActivePackages([]));
    setAuthMode(null);
    setAuthRedirect(null);
    if (redirect) {
      navigate(redirect);
      return;
    }
    navigate({ route: "belajar", section: "Try Out" });
  }, [navigate]);

  React.useEffect(() => { window.__mafikingNavigate = navigate; }, [navigate]);

  React.useEffect(() => {
    if (!isClerkOAuthCallbackPath()) {
      if (authCallbackLoading) setAuthCallbackLoading(false);
      return undefined;
    }
    if (!window.MafikingClerk || typeof window.MafikingClerk.completeRedirectAuth !== "function") {
      setAuthCallbackLoading(true);
      const retry = () => setClerkCallbackReadyTick((tick) => tick + 1);
      window.addEventListener("clerk-ready", retry);
      const retryTimer = window.setTimeout(retry, 250);
      const hardStopTimer = window.setTimeout(() => {
        if (!isClerkOAuthCallbackPath()) {
          setAuthCallbackLoading(false);
          return;
        }
        console.warn("[clerk-callback] bridge unavailable, leaving callback page");
        window.history.replaceState({ route: "lobby" }, document.title, "/");
        setAuthCallbackLoading(false);
        refreshCurrentUser()
          .then((user) => handleAuthSuccess(user, null))
          .catch(() => navigate({ route: "lobby", publicLanding: true }));
      }, 9000);
      return () => {
        window.removeEventListener("clerk-ready", retry);
        window.clearTimeout(retryTimer);
        window.clearTimeout(hardStopTimer);
      };
    }
    if (typeof window.MafikingClerk.isRedirectCallback === "function" && !window.MafikingClerk.isRedirectCallback()) {
      setAuthCallbackLoading(false);
      return undefined;
    }

    let cancelled = false;
    let completed = false;
    setAuthCallbackLoading(true);
    const clearCallbackUrl = () => {
      if (isClerkOAuthCallbackPath()) {
        window.history.replaceState({ route: "lobby" }, document.title, "/");
      }
    };
    const finishAuthSuccess = (user, redirect) => {
      if (cancelled || completed || !user) return;
      completed = true;
      clearCallbackUrl();
      setAuthCallbackLoading(false);
      handleAuthSuccess(user, redirect);
    };
    const leaveCallback = () => {
      if (cancelled || completed) return;
      completed = true;
      clearCallbackUrl();
      setAuthCallbackLoading(false);
      refreshCurrentUser()
        .then((user) => {
          if (cancelled) return;
          handleAuthSuccess(user, null);
        })
        .catch(() => {
          if (cancelled) return;
          navigate({ route: "lobby", publicLanding: true });
        });
    };
    const fallbackTimer = window.setTimeout(() => {
      if (cancelled || completed) return;
      window.MafikingClerk.syncSession()
        .then((user) => {
          finishAuthSuccess(user, null);
        })
        .catch((err) => {
          console.error("[clerk-callback:fallback]", err);
          leaveCallback();
        })
        .finally(() => {
          if (!cancelled) setAuthCallbackLoading(false);
        });
    }, 5000);

    const hardStopTimer = window.setTimeout(() => {
      if (cancelled || completed) return;
      console.warn("[clerk-callback] hard stop, leaving callback page");
      leaveCallback();
    }, 9000);

    window.MafikingClerk.completeRedirectAuth()
      .then((result) => {
        if (!result || !result.user) return;
        finishAuthSuccess(result.user, result.redirect);
      })
      .catch((err) => {
        console.error("[clerk-callback]", err);
        if (!cancelled && !completed) {
          leaveCallback();
        }
      })
      .finally(() => {
        window.clearTimeout(fallbackTimer);
        window.clearTimeout(hardStopTimer);
        if (!cancelled) setAuthCallbackLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(hardStopTimer);
    };
  }, [authCallbackLoading, clerkCallbackReadyTick, handleAuthSuccess, navigate, refreshCurrentUser]);

  React.useEffect(() => {
    if (!isAdminAccount) {
      setIsAdmin(false);
      if (route === "admin") {
        navigate({ route: "lobby", publicLanding: true });
      }
    }
  }, [isAdminAccount, navigate, route]);

  React.useEffect(() => {
    if (isLoggedIn && route === "lobby" && !authMode) {
      navigate("belajar");
    }
  }, [authMode, isLoggedIn, navigate, route]);

  React.useEffect(() => {
    if (route !== "admin" || !isAdminAccount || !isAdmin || window.AdminPage) return undefined;
    let cancelled = false;
    setAdminChunkStatus("loading");
    const adminChunkPromise = window.__mafikingAdminChunkPromise || import("./generated-admin.jsx");
    window.__mafikingAdminChunkPromise = adminChunkPromise;
    adminChunkPromise
      .then(() => {
        if (!cancelled) setAdminChunkStatus(window.AdminPage ? "ready" : "error");
      })
      .catch((error) => {
        console.error("[admin-chunk]", error);
        if (!cancelled) setAdminChunkStatus("error");
      });
    return () => { cancelled = true; };
  }, [isAdmin, isAdminAccount, route]);

  const handleLogoClick = React.useCallback(() => {
    confirmLandingReturn();
  }, [confirmLandingReturn]);

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

  if (authCallbackLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper text-ink">
        <div className="rounded-2xl border border-ink/10 bg-white px-8 py-6 text-center shadow-sm">
          <div className="font-display text-2xl font-bold">Menyelesaikan login Google...</div>
          <div className="mt-2 text-sm font-semibold text-ink/55">Mohon tunggu sebentar.</div>
        </div>
      </div>
    );
  }

  const tryoutMode = String(tryoutContext?.mode || "");
  const isTryoutFullscreenRoute = route === "tryout" && (
    tryoutMode === "free-math" ||
    tryoutMode === "tryout-exam" ||
    tryoutMode === "tryout-review" ||
    tryoutMode === "tryout-preview"
  );
  const navRoute = route === "tryout" && (tryoutMode.startsWith("free-math") || tryoutMode.startsWith("tryout-"))
    ? "belajar"
    : route;

  const LoginRedirect = React.useCallback(({ setRoute: sr }) => {
    React.useEffect(() => {
      sr({
        route: "lobby",
        authMode: "login",
        authRedirect: { route: "profile" },
        authBackRoute: readStoredAuthBackRoute() || { route: "lobby" },
      });
    }, [sr]);
    return null;
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <OfflineBanner />
      {route !== "practice" && route !== "lobby" && !isTryoutFullscreenRoute && (
        <Nav
          route={navRoute}
          setRoute={navigate}
          navStyle={tweaks.navStyle}
          gamified={route === "belajar" || route === "misi" || route === "profile" || route === "tryout" || route === "leaderboard" || route === "admin"}
          isLoggedIn={isLoggedIn}
          isAdminMode={isAdmin}
          onLogoClick={handleLogoClick}
          onAdminPanelOpen={() => navigate("admin")}
        />
      )}

      <main className="flex-1">
        <div
          key={`${route}:${authMode || ""}:${tryoutContext?.id || ""}`}
          data-screen-label={routeLabel(route)}
          className={route === "practice" || route === "lobby" || isTryoutFullscreenRoute ? "" : "app-route-transition"}
        >
          {route === "lobby" && <Lobby setRoute={navigate} tweaks={tweaks} currentUser={currentUser} isAdmin={canEditInlineAsAdmin} authMode={authMode} authRedirect={authRedirect} authBackRoute={authBackRoute} authState={authState} onAuthSuccess={handleAuthSuccess} pendingClerkUser={pendingClerkUser} />}
          {route === "belajar" && <Belajar setRoute={navigate} tweaks={tweaks} isAdmin={canEditInlineAsAdmin} isLoggedIn={isLoggedIn} currentUser={currentUser} authReady={authReady} hasPremiumAccess={hasPremiumAccess} initialSection={belajarSection} onSectionChange={setBelajarSection} />}
          {route === "misi" && (
            <ScreenErrorBoundary>
              {hasPremiumAccess
                ? <Misi setRoute={navigate} tweaks={tweaks} isAdmin={isAdmin} />
                : <AccessGate setRoute={navigate} title="Akses Paket" message="Beli paket untuk mendapat akses ke misi harian dan latihan terarah setiap hari" variant="misi" showFreeTryout={false} hideKicker />}
            </ScreenErrorBoundary>
          )}
          {route === "tryout" && <Tryout setRoute={navigate} tweaks={tweaks} isAdmin={canEditInlineAsAdmin} isAdminMode={isAdmin} isLoggedIn={isLoggedIn} context={tryoutContext} />}
          {route === "leaderboard" && window.Leaderboard && React.createElement(window.Leaderboard)}
          {route === "admin" && isAdminAccount && isAdmin && (
            window.AdminPage
              ? React.createElement(window.AdminPage, { setRoute: navigate })
              : <AdminChunkFallback status={adminChunkStatus} />
          )}
          {route === "profile" && (isLoggedIn
            ? <Profile setRoute={navigate} isAdmin={canEditInlineAsAdmin} onRequestLanding={confirmLandingReturn} onRequestLogout={confirmLogout} />
            : <LoginRedirect setRoute={navigate} />
          )}
          {route === "payment" && <Payment setRoute={navigate} currentUser={currentUser} context={paymentContext} />}
          {route === "practice" && (
            <ScreenErrorBoundary>
              <Practice setRoute={navigate} context={practiceContext} isAdmin={canEditInlineAsAdmin} isLoggedIn={isLoggedIn} isAuthenticated={Boolean(currentUser)} hasPremiumAccess={hasPremiumAccess} />
            </ScreenErrorBoundary>
          )}
        </div>
      </main>

      <ToastContainer />

      {isLoggedIn && !isAdminAccount && currentUser?.profile_needs_completion && window.ProfileOnboardingModal && React.createElement(window.ProfileOnboardingModal, {
        user: currentUser,
        onRequestLogout: confirmLogout,
        onComplete: (updatedUser) => {
          setCurrentUser(updatedUser);
          setPendingClerkUser(null);
        },
      })}

      {confirmAction && ReactDOM.createPortal((
        <div
          className="mafiking-confirm-overlay"
          role="presentation"
          onClick={(event) => { if (event.target === event.currentTarget) setConfirmAction(null); }}
        >
          <div
            className="mafiking-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mafiking-confirm-title"
            data-tone={confirmAction.tone}
          >
            <button
              className="mafiking-confirm-close"
              aria-label="Tutup dialog"
              onClick={() => setConfirmAction(null)}
              type="button"
            >
              <Icon.X className="w-4 h-4" />
            </button>
            <div className="mafiking-confirm-brand">
              <Logo size={28} />
            </div>
            <div className="mafiking-confirm-body">
              <div className="mafiking-confirm-icon" aria-hidden="true">
                <Icon.LogOut className="w-5 h-5" />
              </div>
              <div>
                <h2 id="mafiking-confirm-title">{confirmAction.title}</h2>
                {confirmAction.message && <p>{confirmAction.message}</p>}
              </div>
            </div>
            <div className="mafiking-confirm-actions">
              <button
                className="mafiking-confirm-secondary"
                onClick={() => setConfirmAction(null)}
                type="button"
              >
                {confirmAction.cancelLabel}
              </button>
              <button
                className="mafiking-confirm-primary"
                onClick={runConfirmedAction}
                type="button"
              >
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {route !== "payment" && isAdminAccount && (
        <button
          aria-label={isAdmin ? "Keluar mode admin" : "Masuk mode admin"}
          title={isAdmin ? "Keluar mode admin" : "Masuk mode admin"}
          onClick={() => setIsAdmin((v) => {
            const next = !v;
            if (!next && route === "admin") navigate("belajar");
            return next;
          })}
          type="button"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 8000,
            width: 44, height: 44, borderRadius: "50%",
            background: isAdmin ? "var(--yel)" : "#0b1326",
            color: isAdmin ? "#0b1326" : "#fff",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "none",
            transition: "background .2s, transform .15s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </button>
      )}

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
                onClick={() => navigate(id)}
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

const AccessGate = ({ setRoute, title, message, requireLogin = false, variant = "misi", showFreeTryout = true, hideKicker = false }) => {
  const variantClass = {
    misi: "app-page-bg--misi",
    profil: "app-page-bg--profil",
  }[variant] || "app-page-bg--misi";

  return (
  <div className={`app-page-bg ${variantClass} min-h-[calc(100vh-72px)] flex items-center justify-center px-6 py-16`}>
    <div className="max-w-xl w-full bg-white border hairline rounded-[var(--card-radius)] p-8 md:p-10 text-center">
      <div className="w-12 h-12 rounded-2xl bg-yel/70 flex items-center justify-center mx-auto mb-5">
        <Icon.Lock className="w-5 h-5" />
      </div>
      {!hideKicker && (
        <p className="kicker mb-2">{requireLogin ? "Akun diperlukan" : "Akses paket"}</p>
      )}
      <h1 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.03em] leading-tight">
        {title}
      </h1>
      {message && (
        <p className="text-xs font-semibold text-ink/55 mt-3 leading-relaxed">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-7">
        {requireLogin ? (
          <React.Fragment>
            <button
              onClick={() => setRoute({ route: "lobby", authMode: "login", authRedirect: { route: "profile" } })}
              className="btn-ink"
              type="button"
            >
              Masuk <Icon.Arrow />
            </button>
            <button
              onClick={() => setRoute({ route: "lobby", authMode: "signup", authRedirect: { route: "profile" } })}
              className="btn-ghost"
              type="button"
            >
              Sign Up
            </button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <button onClick={() => setRoute("tryout")} className="btn-ink" type="button">
              Lihat Paket <Icon.Arrow />
            </button>
            {showFreeTryout && (
              <button onClick={() => setRoute({ route: "belajar", section: "Try Out" })} className="btn-ghost" type="button">
                Try Out Gratis
              </button>
            )}
          </React.Fragment>
        )}
      </div>
    </div>
  </div>
  );
};

const APP_ROUTE_NAMES = ["lobby", "belajar", "misi", "tryout", "leaderboard", "admin", "profile", "payment", "practice"];

function normalizeAppPath(pathname) {
  return String(pathname || "/").replace(/\/+$/, "") || "/";
}

function parseAppLocation() {
  const legacyHash = window.location.hash.replace(/^#\/?/, "");
  if (legacyHash.startsWith("verify-email")) {
    const queryString = legacyHash.split("?")[1] || "";
    const params = new URLSearchParams(queryString);
    return { route: "lobby", authMode: "verify-email-token", authState: { token: params.get("token") || "" } };
  }
  if (APP_ROUTE_NAMES.includes(legacyHash)) return { route: legacyHash };

  const path = normalizeAppPath(window.location.pathname);
  if (path === "/" || path === "/index.html" || path === "/MAFIKING.html") return { route: "lobby" };
  if (path === "/login" || path === "/masuk") return { route: "lobby", authMode: "login" };
  if (path === "/signup" || path === "/daftar") return { route: "lobby", authMode: "signup" };
  if (path === "/verify-email") {
    const params = new URLSearchParams(window.location.search || "");
    return { route: "lobby", authMode: "verify-email-token", authState: { token: params.get("token") || "" } };
  }
  if (path === "/belajar") return { route: "belajar" };
  if (path === "/belajar/tryout") return { route: "belajar", belajarSection: "Try Out" };
  if (path === "/belajar/practice" || path === "/practice") return { route: "practice" };
  if (path === "/misi") return { route: "misi" };
  if (path === "/tryout") return { route: "tryout" };
  if (path === "/peringkat" || path === "/leaderboard") return { route: "leaderboard" };
  if (path === "/profil" || path === "/profile") return { route: "profile" };
  if (path === "/admin") return { route: "admin" };
  if (path === "/payment" || path === "/tryout/payment") return { route: "payment" };
  return { route: "lobby" };
}

function appStateToPath(state) {
  const route = state?.route || "lobby";
  if (state?.authMode === "verify-email-token") {
    const token = String(state?.authState?.token || "").trim();
    return token ? `/verify-email?token=${encodeURIComponent(token)}` : "/signup";
  }
  if (state?.authMode === "verify-email") return "/signup";
  if (state?.authMode === "login") return "/login";
  if (state?.authMode === "signup") return "/signup";
  if (route === "lobby") return "/";
  if (route === "belajar") {
    const section = String(state?.belajarSection || state?.section || "").trim().toLowerCase();
    return section === "try out" || section === "tryout" ? "/belajar/tryout" : "/belajar";
  }
  if (route === "practice") return "/belajar/practice";
  if (route === "leaderboard") return "/peringkat";
  if (route === "profile") return "/profil";
  if (route === "payment") return "/payment";
  return `/${route}`;
}

function routeLabel(r) {
  return ({
    lobby: "01 Beranda",
    belajar: "02 Beranda",
    misi: "03 Misi Harian",
    tryout: "04 Paket",
    leaderboard: "05 Peringkat",
    admin: "06 Admin Panel",
    profile: "07 Profil",
    payment: "08 Pembayaran",
    practice: "09 Latihan",
  })[r] || r;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ScreenErrorBoundary>
    <App />
  </ScreenErrorBoundary>
);
