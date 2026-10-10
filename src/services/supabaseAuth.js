const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "");

const TOKEN_KEY = "chris_token";
const REFRESH_KEY = "chris_refresh_token";
const EXPIRY_KEY = "chris_token_expires_at";
const RECOVERY_KEY = "chris_password_recovery";
let refreshPromise = null;

function configured() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the frontend environment.");
  }
}

function sessionStorageForToken() {
  if (localStorage.getItem(TOKEN_KEY) || localStorage.getItem(REFRESH_KEY)) return localStorage;
  if (sessionStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(REFRESH_KEY)) return sessionStorage;
  return null;
}

function clearTokens() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(REFRESH_KEY);
    storage.removeItem(EXPIRY_KEY);
  }
}

function persistSession(session, rememberMe = false) {
  const target = rememberMe ? localStorage : sessionStorage;
  const other = rememberMe ? sessionStorage : localStorage;
  clearTokens();
  other.removeItem(RECOVERY_KEY);
  target.setItem(TOKEN_KEY, session.access_token);
  if (session.refresh_token) target.setItem(REFRESH_KEY, session.refresh_token);
  const expiresAt = session.expires_at
    ? Number(session.expires_at) * 1000
    : Date.now() + Number(session.expires_in || 3600) * 1000;
  target.setItem(EXPIRY_KEY, String(expiresAt));
}

async function authFetch(path, options = {}) {
  configured();
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const message = payload.msg || payload.message || payload.error_description || payload.error || "Supabase Auth request failed.";
    throw new Error(message);
  }
  return payload;
}

export async function signInWithPassword(email, password, rememberMe = false) {
  const session = await authFetch("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (!session.access_token || !session.refresh_token || !session.user?.email) {
    throw new Error("Supabase did not return a complete sign-in session.");
  }
  persistSession(session, rememberMe);
  return session;
}

export async function getValidAccessToken() {
  const storage = sessionStorageForToken();
  if (!storage) return null;
  const token = storage.getItem(TOKEN_KEY);
  const refreshToken = storage.getItem(REFRESH_KEY);
  const expiresAt = Number(storage.getItem(EXPIRY_KEY) || 0);
  if (token && expiresAt > Date.now() + 60_000) return token;
  if (!refreshToken) return token || null;

  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const refreshed = await authFetch("token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      persistSession(refreshed, storage === localStorage);
      return refreshed.access_token || null;
    } catch (error) {
      clearTokens();
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function requestPasswordRecovery(email, redirectTo) {
  await authFetch(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
}

export function restorePasswordRecoveryFromUrl() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const type = params.get("type");
  if (!accessToken || !refreshToken || type !== "recovery") return false;

  persistSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: params.get("expires_in") || 3600,
  }, false);
  sessionStorage.setItem(RECOVERY_KEY, "true");
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  return true;
}

export function hasPasswordRecoverySession() {
  return sessionStorage.getItem(RECOVERY_KEY) === "true";
}

export async function updateRecoveredPassword(password) {
  if (!hasPasswordRecoverySession()) {
    throw new Error("Your password reset link is missing or has expired. Please request a new reset email.");
  }
  const token = await getValidAccessToken();
  if (!token) throw new Error("Your password reset session has expired. Please request a new reset email.");
  await authFetch("user", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
  });
  clearTokens();
  sessionStorage.removeItem(RECOVERY_KEY);
}

export async function signOutSupabase() {
  const token = await getValidAccessToken().catch(() => null);
  if (token) {
    try {
      await authFetch("logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // Local session is still cleared if the Auth endpoint is unavailable.
    }
  }
  clearTokens();
  sessionStorage.removeItem(RECOVERY_KEY);
}
