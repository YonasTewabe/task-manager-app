const TOKEN_KEY = "task_manager_token";
const STATUS_LABELS = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  422: "Validation failed",
  429: "Too many requests",
  500: "Server error",
  502: "Bad gateway",
  503: "Service unavailable",
  504: "Gateway timeout",
};

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setStoredToken(token) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

function toReadableErrorMessage(data, status) {
  const direct = String(data?.error || data?.message || "").trim();
  if (direct) return direct;
  const label = STATUS_LABELS[status] || "Request failed";
  return `${label} (${status})`;
}

function apiBase() {
  const base = import.meta.env.VITE_BACKEND_URL || "/api";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export async function apiRequest(path, options = {}) {
  const token = getStoredToken();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Could not reach the server. Check your connection and try again.",
    );
  }

  if (response.status === 204) return null;

  const contentType = String(response.headers.get("content-type") || "");
  const isJson = contentType.toLowerCase().includes("application/json");
  const data = isJson
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  if (!response.ok) {
    if (!isJson) {
      const textMessage = String(data || "").trim();
      if (textMessage) throw new Error(textMessage);
    }
    throw new Error(toReadableErrorMessage(data, response.status));
  }
  return data;
}

export function buildApiUrl(path) {
  return `${apiBase()}${path}`;
}

export function getAuthToken() {
  return getStoredToken();
}
