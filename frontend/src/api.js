const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function getTokens() {
  try {
    const raw = localStorage.getItem("gk_tokens");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setTokens(tokens) {
  if (tokens) {
    localStorage.setItem("gk_tokens", JSON.stringify(tokens));
  } else {
    localStorage.removeItem("gk_tokens");
  }
}

async function refreshAccessToken() {
  const tokens = getTokens();
  if (!tokens?.refresh) return null;
  const res = await fetch(`${BASE_URL}/api/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: tokens.refresh }),
  });
  if (!res.ok) {
    setTokens(null);
    return null;
  }
  const data = await res.json();
  const updated = { ...tokens, access: data.access };
  setTokens(updated);
  return updated.access;
}

/**
 * Wraps fetch with the API base URL, a JSON body, a bearer token from
 * storage, and one transparent retry on 401 after refreshing the token.
 */
export async function apiFetch(path, { method = "GET", body, auth = true, headers = {} } = {}) {
  const doFetch = async (accessToken) => {
    const finalHeaders = { ...headers };
    if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
    if (auth && accessToken) finalHeaders["Authorization"] = `Bearer ${accessToken}`;
    return fetch(`${BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let tokens = getTokens();
  let res = await doFetch(tokens?.access);

  if (auth && res.status === 401 && tokens?.refresh) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      res = await doFetch(newAccess);
    }
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const error = new Error(data?.detail || "Request failed");
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const auth = {
  async login(username, password) {
    const res = await fetch(`${BASE_URL}/api/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      const error = new Error(data?.detail || "Login failed");
      error.data = data;
      throw error;
    }
    setTokens({ access: data.access, refresh: data.refresh, username });
    return data;
  },

  async register({ username, password, handle, hostel }) {
    return apiFetch("/auth/api/register/", {
      method: "POST",
      auth: false,
      body: { username, password, handle, hostel },
    });
  },

  logout() {
    setTokens(null);
  },

  currentUsername() {
    return getTokens()?.username || null;
  },

  isLoggedIn() {
    return Boolean(getTokens()?.access);
  },
};

export const api = {
  listHostels: () => apiFetch("/api/hostels/", { auth: false }),
  listLeaderboard: () => apiFetch("/api/leaderboard/", { auth: false }),
  listParticipants: () => apiFetch("/api/participants/"),
  listMissions: (query = "") => apiFetch(`/api/missions/${query}`, { auth: false }),
  getMission: (id) => apiFetch(`/api/missions/${id}/`, { auth: false }),
  claimMission: (id) => apiFetch(`/api/missions/${id}/claim/`, { method: "POST" }),
  dropMission: (id) => apiFetch(`/api/missions/${id}/drop/`, { method: "POST" }),
  completeMission: (id) => apiFetch(`/api/missions/${id}/complete/`, { method: "POST" }),
};
