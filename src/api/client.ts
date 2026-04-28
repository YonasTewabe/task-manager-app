const TOKEN_KEY = "task_manager_token";
const inFlightRequests = new Map<string, Promise<any>>();
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

export function setStoredToken(token: string) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

function toReadableErrorMessage(data: any, status: number) {
  const direct = String(data?.error || data?.message || "").trim();
  if (direct) return direct;
  const label = STATUS_LABELS[status] || "Request failed";
  return `${label} (${status})`;
}

function apiBase() {
  const base = import.meta.env.VITE_BACKEND_URL || "/api";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export async function apiRequest(path: string, options: RequestInit & AnyRecord = {}) {
  const token = getStoredToken();
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...((options.headers || {}) as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const method = String(options.method || "GET").toUpperCase();
  const canDedupe = method === "GET" && !options.signal;
  const dedupeKey = canDedupe
    ? `${method}:${path}:${JSON.stringify(options.headers || {})}`
    : "";
  if (canDedupe && inFlightRequests.has(dedupeKey)) {
    return inFlightRequests.get(dedupeKey);
  }

  const execute = async () => {
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
  };
  const requestPromise = execute();
  if (canDedupe) inFlightRequests.set(dedupeKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (canDedupe) inFlightRequests.delete(dedupeKey);
  }
}

export function buildApiUrl(path: string) {
  return `${apiBase()}${path}`;
}

export function getAuthToken() {
  return getStoredToken();
}
