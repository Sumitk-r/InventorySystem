const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000/api";

export function getToken() {
  return localStorage.getItem("inventory_token");
}

export function setToken(token) {
  if (token) {
    localStorage.setItem("inventory_token", token);
  } else {
    localStorage.removeItem("inventory_token");
  }
}

export async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;
    const text = await response.text();
    try {
      const error = JSON.parse(text);
      detail = error.detail || detail;
    } catch {
      detail = text || detail;
    }
    throw new Error(detail);
  }
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export function downloadUrl(path) {
  const token = getToken();
  const url = new URL(`${API_BASE}${path}`);
  if (token) {
    url.searchParams.set("token_note", "Use the app download buttons for authenticated exports");
  }
  return url.toString();
}

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
