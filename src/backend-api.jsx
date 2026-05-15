// Backend helpers for the static Mafiking UI.

const MafikingAPI = {
  async get(path) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    return parseApiResponse(response);
  },

  async post(path, payload = {}) {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return parseApiResponse(response);
  },
};

async function parseApiResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request gagal (${response.status})`);
  }
  return data;
}

window.MafikingAPI = MafikingAPI;
