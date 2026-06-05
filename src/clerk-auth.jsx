// Clerk bridge for the static Babel runtime.

const MafikingClerk = (() => {
  let readyPromise = null;
  let configPromise = null;
  const OAUTH_CALLBACK_PATH = "/sso-callback";
  const PENDING_OAUTH_KEY = "mafiking.clerk.pendingOAuth";

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
    return parseApiResponse(response);
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
    if (!isRedirectCallback()) return null;
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

    await waitForSignedIn(15000);
    const user = await syncSession();
    clearPendingOAuth();
    if (window.location.pathname === OAUTH_CALLBACK_PATH) {
      window.history.replaceState({}, document.title, "/");
    }
    return {
      user,
      redirect: pending && pending.redirect ? pending.redirect : null,
      mode: pending && pending.mode ? pending.mode : "login",
    };
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

  async function signOut() {
    try {
      const clerk = await load();
      if (clerk.isSignedIn && typeof clerk.signOut === "function") {
        await clerk.signOut();
      }
    } catch (_) {}
  }

  return { completeRedirectAuth, getToken, isEnabled, isRedirectCallback, load, openAuth, signOut, syncSession };
})();

window.MafikingClerk = MafikingClerk;
