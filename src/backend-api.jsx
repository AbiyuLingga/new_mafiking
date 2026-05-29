// Backend helpers for the static Mafiking UI.

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
