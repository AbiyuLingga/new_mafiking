// Backend helpers for the static Mafiking UI.

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
let csrfTokenPromise = null;

function methodForFetch(input, init = {}) {
  return String(init.method || input?.method || "GET").toUpperCase();
}

function isSameOriginApiRequest(input) {
  try {
    const rawUrl = typeof input === "string" ? input : input?.url;
    if (!rawUrl) return false;
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin
      && url.pathname.startsWith("/api/")
      && url.pathname !== "/api/csrf-token";
  } catch (_) {
    return false;
  }
}

async function getCsrfToken({ refresh = false } = {}) {
  if (refresh) csrfTokenPromise = null;
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch("/api/csrf-token", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data || !data.csrfToken) throw new Error("CSRF token tidak tersedia.");
        return data.csrfToken;
      })
      .catch((error) => {
        csrfTokenPromise = null;
        throw error;
      });
  }
  return csrfTokenPromise;
}

function installCsrfFetchPatch() {
  if (typeof window === "undefined" || window.__mafikingCsrfFetchInstalled) return;
  const nativeFetch = window.fetch.bind(window);
  window.__mafikingCsrfFetchInstalled = true;

  async function withCsrf(input, init = {}, options = {}) {
    const token = await getCsrfToken({ refresh: options.refresh });
    const headers = new Headers(init.headers || input?.headers || {});
    headers.set("X-CSRF-Token", token);
    return nativeFetch(input, {
      ...init,
      credentials: init.credentials || "same-origin",
      headers,
    });
  }

  window.fetch = async function mafikingFetch(input, init = {}) {
    const method = methodForFetch(input, init);
    if (CSRF_SAFE_METHODS.has(method) || !isSameOriginApiRequest(input)) {
      return nativeFetch(input, init);
    }

    let response = await withCsrf(input, init);
    if (response.status === 403) {
      const data = await response.clone().json().catch(() => ({}));
      if (data && data.code === "EBADCSRFTOKEN") {
        response = await withCsrf(input, init, { refresh: true });
      }
    }
    return response;
  };
}

installCsrfFetchPatch();

const MafikingAPI = {
  async get(path) {
    const authHeaders = await clerkAuthHeaders();
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...authHeaders },
    });
    return parseApiResponse(response);
  },

  async post(path, payload = {}) {
    const authHeaders = await clerkAuthHeaders();
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(payload),
    });
    return parseApiResponse(response);
  },

  async put(path, payload = {}) {
    const authHeaders = await clerkAuthHeaders();
    const response = await fetch(path, {
      method: "PUT",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(payload),
    });
    return parseApiResponse(response);
  },

  async del(path) {
    const authHeaders = await clerkAuthHeaders();
    const response = await fetch(path, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { Accept: "application/json", ...authHeaders },
    });
    return parseApiResponse(response);
  },
};

async function clerkAuthHeaders() {
  if (!window.MafikingClerk || typeof window.MafikingClerk.getToken !== "function") return {};
  const token = await window.MafikingClerk.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseApiResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request gagal (${response.status})`);
  }
  return data;
}

window.MafikingAPI = MafikingAPI;
