export const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
).replace(/\/+$/, "");

export function getAuthToken() {
  return localStorage.getItem("chris_token") || sessionStorage.getItem("chris_token") || null;
}

function readStoredJson(key) {
  const value = localStorage.getItem(key) || sessionStorage.getItem(key);
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export function getStoredUser() { return readStoredJson("chris_user"); }
export function getStoredOrganization() { return readStoredJson("chris_organization"); }

export function getActiveLocationId() {
  return localStorage.getItem("chris_active_location_id") || sessionStorage.getItem("chris_active_location_id") || null;
}

export function setActiveLocationId(locationId, { sessionOnly = false } = {}) {
  const storage = sessionOnly ? sessionStorage : localStorage;
  const other = sessionOnly ? localStorage : sessionStorage;
  other.removeItem("chris_active_location_id");
  if (locationId) storage.setItem("chris_active_location_id", String(locationId));
  else storage.removeItem("chris_active_location_id");
  window.dispatchEvent(new CustomEvent("chris:location-context-changed", { detail: { locationId: locationId || null } }));
}

export function clearAuthSession() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem("chris_token");
    storage.removeItem("chris_user");
    storage.removeItem("chris_organization");
    storage.removeItem("chris_active_location_id");
  }
}

function authHeaders(extra = {}) {
  const token = getAuthToken();
  const activeLocationId = getActiveLocationId();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeLocationId ? { "X-CHRiS-Location-Id": activeLocationId } : {}),
    "Cache-Control": "no-cache",
    ...extra,
  };
}

export async function verifyAuthSession() {
  const token = getAuthToken();
  if (!token) {
    const error = new Error("Authentication required.");
    error.code = "AUTH_INVALID";
    throw error;
  }
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    });
  } catch {
    const error = new Error("Unable to connect to the CHRIS server.");
    error.code = "NETWORK_UNAVAILABLE";
    throw error;
  }
  let result;
  try { result = await response.json(); } catch { result = { status: "error", message: "Invalid server response." }; }
  if (response.status === 401 || response.status === 403) {
    const error = new Error(result.message || "Your CHRIS session is no longer valid.");
    error.code = response.status === 403 ? (result.code || "ACCESS_FORBIDDEN") : "AUTH_INVALID";
    throw error;
  }
  if (!response.ok) {
    const error = new Error(result.message || "Unable to verify CHRIS session.");
    error.code = "SERVER_UNAVAILABLE";
    throw error;
  }
  return result;
}

export async function apiRequest(endpoint, options = {}) {
  const rawBody = options.body;
  const isFormData = typeof FormData !== "undefined" && rawBody instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && rawBody instanceof Blob;
  const isUrlSearchParams = typeof URLSearchParams !== "undefined" && rawBody instanceof URLSearchParams;
  const shouldSerializeJson = rawBody !== undefined && rawBody !== null && typeof rawBody === "object" && !isFormData && !isBlob && !isUrlSearchParams;
  const requestBody = shouldSerializeJson ? JSON.stringify(rawBody) : rawBody;
  const headers = authHeaders({
    ...((shouldSerializeJson || typeof rawBody === "string") ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  });

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, body: requestBody, headers, cache: "no-store" });
  } catch {
    const error = new Error("CHRIS cannot connect to the server. Check your connection and try again.");
    error.code = "NETWORK_UNAVAILABLE";
    throw error;
  }

  let result;
  try { result = await response.json(); } catch { result = { status: "error", message: "Invalid server response." }; }
  if (response.status === 401) {
    clearAuthSession();
    if (window.location.pathname !== "/login") window.location.replace("/login");
    const error = new Error(result.message || "Your session has expired. Please sign in again.");
    error.code = "AUTH_INVALID";
    throw error;
  }
  if (!response.ok) {
    const error = new Error(result.message || "Unable to complete request.");
    error.code = result.code || "REQUEST_FAILED";
    error.details = result.details || null;
    error.fieldErrors = result.details?.fields || result.fieldErrors || [];
    throw error;
  }
  return result;
}

export async function apiDownload(endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: authHeaders(options.headers || {}),
      cache: "no-store",
    });
  } catch {
    throw new Error("CHRIS cannot connect to the server. Check your connection and try again.");
  }
  if (response.status === 401) {
    clearAuthSession();
    if (window.location.pathname !== "/login") window.location.replace("/login");
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!response.ok) {
    let message = "Unable to download the requested file.";
    try { const result = await response.json(); message = result.message || message; } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return { blob, fileName: match?.[1] || "download.xlsx" };
}

export function saveDownloadedBlob({ blob, fileName }) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "download";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
