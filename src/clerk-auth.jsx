// Clerk bridge for the static Babel runtime.

const MafikingClerk = (() => {
  let readyPromise = null;
  let configPromise = null;
  const OAUTH_CALLBACK_PATH = "/sso-callback";
  const PENDING_OAUTH_KEY = "mafiking.clerk.pendingOAuth";
  const POPUP_POSTMESSAGE_TYPE = "mafiking:clerk-popup-result";
  const POPUP_RESULT_STORAGE_KEY = "mafiking.clerk.popupResult";
  const POPUP_RESULT_TTL_MS = 10 * 60 * 1000;

  function buildPopupFeatures(overrides) {
    const width = 480;
    const height = 620;
    let left = 0;
    let top = 0;
    try {
      const screenW = window.screen && window.screen.width ? window.screen.width : width;
      const screenH = window.screen && window.screen.height ? window.screen.height : height;
      const availLeft = (window.screen && Number.isFinite(window.screen.availLeft)) ? window.screen.availLeft : 0;
      const availTop = (window.screen && Number.isFinite(window.screen.availTop)) ? window.screen.availTop : 0;
      const availW = (window.screen && window.screen.availWidth) ? window.screen.availWidth : screenW;
      const availH = (window.screen && window.screen.availHeight) ? window.screen.availHeight : screenH;
      left = availLeft + Math.max(0, Math.round((availW - width) / 2));
      top = availTop + Math.max(0, Math.round((availH - height) / 2));
    } catch (_) {
      left = 0;
      top = 0;
    }
    const base = `width=${width},height=${height},top=${top},left=${left},menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes`;
    return overrides ? `${overrides},${base}` : base;
  }

  function loadScript(src, attrs = {}) {
    const existing = Array.from(document.scripts).find((script) => script.src === src);
    if (existing) {
      return existing.dataset.loaded === "true"
        ? Promise.resolve()
        : new Promise((resolve, reject) => {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
        });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      Object.entries(attrs).forEach(([key, value]) => {
        if (value !== undefined && value !== null) script.setAttribute(key, value);
      });
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };
      script.onerror = () => reject(new Error("Gagal memuat Clerk."));
      document.head.appendChild(script);
    });
  }

  async function readConfig() {
    if (configPromise) return configPromise;
    configPromise = (async () => {
      const response = await fetch("/api/config/clerk", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      return response.json().catch(() => ({}));
    })();
    return configPromise;
  }

  function frontendApiFromPublishableKey(publishableKey) {
    try {
      const encoded = String(publishableKey || "").split("_")[2];
      if (!encoded) return "";
      return atob(encoded).replace(/\$$/, "");
    } catch (_) {
      return "";
    }
  }

  async function isEnabled() {
    const config = await readConfig();
    return Boolean(config.enabled && config.publishableKey);
  }

  async function load() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      const config = await readConfig();
      if (!config.enabled || !config.publishableKey) {
        throw new Error("Clerk belum dikonfigurasi.");
      }

      const frontendApi = frontendApiFromPublishableKey(config.publishableKey);
      if (!frontendApi) throw new Error("Publishable key Clerk tidak valid.");

      await loadScript(`https://${frontendApi}/npm/@clerk/ui@1/dist/ui.browser.js`);
      await loadScript(`https://${frontendApi}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, {
        "data-clerk-publishable-key": config.publishableKey,
      });

      if (!window.Clerk) throw new Error("Clerk gagal dimuat.");
      if (!window.__internal_ClerkUICtor) throw new Error("UI Clerk gagal dimuat.");
      await window.Clerk.load({
        ui: { ClerkUI: window.__internal_ClerkUICtor },
        appearance: {
          variables: {
            colorPrimary: "#0b1326",
            colorText: "#0b1326",
            borderRadius: "14px",
          },
        },
      });
      window.dispatchEvent(new Event("clerk-ready"));
      return window.Clerk;
    })();
    return readyPromise;
  }

  async function getToken() {
    try {
      const clerk = await load();
      if (!clerk.session || typeof clerk.session.getToken !== "function") return "";
      return await clerk.session.getToken();
    } catch (_) {
      return "";
    }
  }

  async function syncSession() {
    const token = await getToken();
    if (!token) throw new Error("Sesi Clerk belum aktif.");
    const response = await fetch("/api/auth/me", {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    return window.parseApiResponse(response);
  }

  function readPendingOAuth() {
    try {
      const raw = window.sessionStorage.getItem(PENDING_OAUTH_KEY);
      if (!raw) return null;
      const pending = JSON.parse(raw);
      const age = Date.now() - Number(pending.createdAt || 0);
      if (age > 10 * 60 * 1000) {
        window.sessionStorage.removeItem(PENDING_OAUTH_KEY);
        return null;
      }
      return pending;
    } catch (_) {
      return null;
    }
  }

  function writePendingOAuth(mode, redirect) {
    try {
      window.sessionStorage.setItem(PENDING_OAUTH_KEY, JSON.stringify({
        mode,
        redirect: redirect || null,
        createdAt: Date.now(),
      }));
    } catch (_) {}
  }

  function clearPendingOAuth() {
    try {
      window.sessionStorage.removeItem(PENDING_OAUTH_KEY);
    } catch (_) {}
  }

  function isRedirectCallback() {
    return window.location.pathname === OAUTH_CALLBACK_PATH;
  }

  function isPopupCallback() {
    try {
      const search = window.location.search || "";
      return /[?&]popup=1(?:&|$)/.test(search);
    } catch (_) {
      return false;
    }
  }

  function popupResultStorage() {
    try {
      return window.localStorage;
    } catch (_) {
      return null;
    }
  }

  function persistPopupResult(payload) {
    const storage = popupResultStorage();
    if (!storage) return;
    try {
      storage.setItem(POPUP_RESULT_STORAGE_KEY, JSON.stringify({
        at: Date.now(),
        payload,
      }));
    } catch (_) {}
  }

  function clearPopupResultStorage() {
    const storage = popupResultStorage();
    if (!storage) return;
    try {
      storage.removeItem(POPUP_RESULT_STORAGE_KEY);
    } catch (_) {}
  }

  function postPopupResult(payload) {
    persistPopupResult(payload);
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          Object.assign({ type: POPUP_POSTMESSAGE_TYPE }, payload),
          window.location.origin,
        );
      }
    } catch (_) {}
  }

  function closePopupSoon() {
    window.setTimeout(() => {
      try { window.close(); } catch (_) {}
    }, 50);
  }

  function withTimeout(promise, timeoutMs, message) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
  }

  async function waitForSignedIn(timeoutMs = 180000) {
    const clerk = await load();
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (clerk.isSignedIn && clerk.session) return clerk;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Login Clerk belum selesai.");
  }

  async function startGoogleRedirect(mode = "login", options = {}) {
    const clerk = await load();
    const pendingRedirect = options && options.redirect ? options.redirect : null;
    const callbackUrl = `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
    const target = mode === "signup"
      ? (clerk.signUp || clerk.client?.signUp)
      : (clerk.signIn || clerk.client?.signIn);

    writePendingOAuth(mode, pendingRedirect);

    if (target && typeof target.sso === "function") {
      await target.sso({
        strategy: "oauth_google",
        redirectCallbackUrl: callbackUrl,
        redirectUrl: callbackUrl,
      });
      return null;
    }

    if (target && typeof target.authenticateWithRedirect === "function") {
      await target.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: callbackUrl,
        redirectUrlComplete: callbackUrl,
      });
      return null;
    }

    clearPendingOAuth();
    throw new Error("Login Google langsung belum didukung oleh Clerk saat ini.");
  }

  async function completeRedirectAuth() {
    const popupMode = isPopupCallback();
    if (!isRedirectCallback() && !popupMode) return null;
    const pending = readPendingOAuth();
    const clerk = await load();

    if (typeof clerk.handleRedirectCallback === "function") {
      try {
        await withTimeout(clerk.handleRedirectCallback({
          continueSignUpUrl: "/",
          signInUrl: "/",
          signUpUrl: "/",
          signInForceRedirectUrl: "/",
          signUpForceRedirectUrl: "/",
          signInFallbackRedirectUrl: "/",
          signUpFallbackRedirectUrl: "/",
        }, async () => {}), 8000, "Callback Google terlalu lama.");
      } catch (error) {
        console.warn("[clerk-callback] continuing after callback timeout", error && error.message);
      }
    }

    let user = null;
    try {
      await waitForSignedIn(15000);
      user = await syncSession();
    } catch (error) {
      if (popupMode) {
        postPopupResult({ ok: false, error: (error && error.message) || "Login Google gagal." });
        closePopupSoon();
        return null;
      }
      throw error;
    }

    const result = {
      user,
      redirect: pending && pending.redirect ? pending.redirect : null,
      mode: pending && pending.mode ? pending.mode : "login",
    };

    if (popupMode) {
      postPopupResult({ ok: true, result });
      closePopupSoon();
      return result;
    }

    clearPendingOAuth();
    if (window.location.pathname === OAUTH_CALLBACK_PATH) {
      window.history.replaceState({}, document.title, "/");
    }
    return result;
  }

  async function openAuth(mode = "login", options = {}) {
    if (options && options.provider === "google") {
      return startGoogleRedirect(mode, options);
    }

    const clerk = await load();
    if (mode === "signup" && typeof clerk.openSignUp === "function") {
      clerk.openSignUp();
    } else if (typeof clerk.openSignIn === "function") {
      clerk.openSignIn();
    } else {
      throw new Error("Kontrol login Clerk tidak tersedia.");
    }
    await waitForSignedIn();
    return syncSession();
  }

  function readPopupResultFromStorage() {
    const storage = popupResultStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(POPUP_RESULT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const age = Date.now() - Number(parsed.at || 0);
      if (age > POPUP_RESULT_TTL_MS) {
        storage.removeItem(POPUP_RESULT_STORAGE_KEY);
        return null;
      }
      storage.removeItem(POPUP_RESULT_STORAGE_KEY);
      return parsed.payload || null;
    } catch (_) {
      return null;
    }
  }

  function openGooglePopup(mode = "login", options = {}) {
    return new Promise((resolve, reject) => {
      const features = buildPopupFeatures(options.features);
      const windowName = options.windowName || "mafiking-google-auth";
      const redirect = options && options.redirect ? options.redirect : null;
      const params = new URLSearchParams();
      params.set("mode", mode === "signup" ? "signup" : "login");
      if (redirect) {
        const serialized = typeof redirect === "string" ? redirect : JSON.stringify(redirect);
        params.set("redirect", serialized);
      }
      const popupUrl = `/auth-popup?${params.toString()}`;

      let popup = null;
      try {
        popup = window.open(popupUrl, windowName, features);
      } catch (_) {
        popup = null;
      }
      if (!popup) {
        reject(new Error("Popup login Google diblokir oleh browser."));
        return;
      }
      clearPopupResultStorage();

      const origin = window.location.origin;
      let settled = false;
      let closedRecoveryStarted = false;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        if (intervalId) window.clearInterval(intervalId);
        if (storageIntervalId) window.clearInterval(storageIntervalId);
        try { if (popup && !popup.closed) popup.close(); } catch (_) {}
      };
      const settle = (payload) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (payload && payload.ok) resolve(payload.result || null);
        else reject(new Error((payload && payload.error) || "Login Google gagal."));
      };

      const onMessage = (event) => {
        if (event.origin !== origin) return;
        const data = event.data;
        if (!data || data.type !== POPUP_POSTMESSAGE_TYPE) return;
        settle(data);
      };

      const checkStorage = () => {
        const stored = readPopupResultFromStorage();
        if (stored) settle(stored);
      };

      const readRegisteredServerUser = async () => {
        try {
          const response = await fetch("/api/auth/me", {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          });
          if (!response.ok) return null;
          const user = await response.json().catch(() => null);
          if (!user || String(user.display_name || "").startsWith("Tamu_")) return null;
          return user;
        } catch (_) {
          return null;
        }
      };

      const recoverClosedPopupSession = async () => {
        if (closedRecoveryStarted || settled) return;
        closedRecoveryStarted = true;
        const startedAt = Date.now();
        while (!settled && Date.now() - startedAt < 10000) {
          const stored = readPopupResultFromStorage();
          if (stored) {
            settle(stored);
            return;
          }

          let user = await readRegisteredServerUser();
          if (!user) {
            try {
              const clerk = await load();
              if (clerk.isSignedIn && clerk.session) user = await syncSession();
            } catch (_) {}
          }

          if (user) {
            settle({
              ok: true,
              result: {
                user,
                redirect,
                mode: mode === "signup" ? "signup" : "login",
              },
            });
            return;
          }
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
        }
        settle({ ok: false, error: "Login Google berhasil, tetapi sesi Mafiking belum tersinkron. Silakan coba lagi." });
      };

      const intervalId = window.setInterval(() => {
        if (!popup || popup.closed) {
          const stored = readPopupResultFromStorage();
          if (stored) { settle(stored); return; }
          recoverClosedPopupSession();
        }
      }, 800);
      const storageIntervalId = window.setInterval(checkStorage, 400);

      window.addEventListener("message", onMessage);
    });
  }

  async function signOut() {
    try {
      const clerk = await load();
      if (clerk.isSignedIn && typeof clerk.signOut === "function") {
        await clerk.signOut();
      }
    } catch (_) {}
  }

  return { completeRedirectAuth, getToken, isEnabled, isRedirectCallback, load, openAuth, openGooglePopup, signOut, syncSession };
})();

window.MafikingClerk = MafikingClerk;
