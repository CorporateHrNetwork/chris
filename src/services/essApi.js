export const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/+$/, "");

export function getEssAuthToken() {
  return localStorage.getItem("chris_ess_token") || sessionStorage.getItem("chris_ess_token") || null;
}

export function getStoredEssEmployee() {
  const value = localStorage.getItem("chris_ess_employee") || sessionStorage.getItem("chris_ess_employee");
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export function clearEssAuthSession() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem("chris_ess_token");
    storage.removeItem("chris_ess_employee");
    storage.removeItem("chris_ess_organization");
  }
}

function essAuthHeaders(extra = {}) {
  const token = getEssAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Cache-Control": "no-cache",
    ...extra,
  };
}

export async function essRequest(endpoint, options = {}) {
  const rawBody = options.body;
  const isFormData = typeof FormData !== "undefined" && rawBody instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && rawBody instanceof Blob;
  const isUrlSearchParams = typeof URLSearchParams !== "undefined" && rawBody instanceof URLSearchParams;
  const shouldSerializeJson =
    rawBody !== undefined &&
    rawBody !== null &&
    typeof rawBody === "object" &&
    !isFormData &&
    !isBlob &&
    !isUrlSearchParams;
  const requestBody = shouldSerializeJson ? JSON.stringify(rawBody) : rawBody;
  const headers = essAuthHeaders({
    ...((shouldSerializeJson || typeof rawBody === "string")
      ? { "Content-Type": "application/json" }
      : {}),
    ...(options.headers || {}),
  });

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      body: requestBody,
      headers,
      cache: "no-store",
    });
  } catch {
    const error = new Error(
      "The employee portal cannot connect to the CHRiS server. Check your internet connection and try again."
    );
    error.code = "NETWORK_UNAVAILABLE";
    throw error;
  }

  let result;
  try {
    result = await response.json();
  } catch {
    result = { status: "error", message: "Invalid server response." };
  }

  if (response.status === 401) {
    clearEssAuthSession();
    if (window.location.pathname !== "/ess") window.location.replace("/ess");
    const error = new Error(
      result.message || "Your employee portal session has expired. Please sign in again."
    );
    error.code = "ESS_AUTH_INVALID";
    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      result.message || "Unable to complete employee portal request."
    );
    error.code = result.code || "ESS_REQUEST_FAILED";
    error.details = result.details || null;
    throw error;
  }

  return result;
}
