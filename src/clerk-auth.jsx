// Clerk bridge for the static Babel runtime.

const MafikingClerk = (() => {
  let readyPromise = null;
  let configPromise = null;

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

  function hasVisibleClerkDialog() {
    const selectors = [
      ".cl-modalBackdrop",
      ".cl-modalContent",
      ".cl-card",
      ".cl-rootBox [role='dialog']",
      "[class*='cl-modal']",
    ];
    return selectors.some((selector) => Array.from(document.querySelectorAll(selector)).some((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }));
  }

  async function waitForSignedInOrClosed(timeoutMs = 180000) {
    const clerk = await load();
    const startedAt = Date.now();
    let sawDialog = hasVisibleClerkDialog();
    while (Date.now() - startedAt < timeoutMs) {
      if (clerk.isSignedIn && clerk.session) return clerk;
      sawDialog = sawDialog || hasVisibleClerkDialog();
      if (sawDialog && !hasVisibleClerkDialog()) {
        throw new Error("Login Google dibatalkan.");
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error("Login Clerk belum selesai.");
  }

  async function openAuth(mode = "login") {
    const clerk = await load();
    if (mode === "signup" && typeof clerk.openSignUp === "function") {
      clerk.openSignUp();
    } else if (typeof clerk.openSignIn === "function") {
      clerk.openSignIn();
    } else {
      throw new Error("Kontrol login Clerk tidak tersedia.");
    }
    await waitForSignedInOrClosed();
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

  return { getToken, isEnabled, load, openAuth, signOut, syncSession };
})();

window.MafikingClerk = MafikingClerk;
