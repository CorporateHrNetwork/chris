const API_BASE_URL = "http://localhost:5000";

export function getAuthToken() {
  const localToken =
    localStorage.getItem("chris_token");

  const sessionToken =
    sessionStorage.getItem("chris_token");

  return localToken || sessionToken || null;
}

export function getStoredUser() {
  const value =
    localStorage.getItem("chris_user") ||
    sessionStorage.getItem("chris_user");

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getStoredOrganization() {
  const value =
    localStorage.getItem(
      "chris_organization"
    ) ||
    sessionStorage.getItem(
      "chris_organization"
    );

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  localStorage.removeItem("chris_token");
  localStorage.removeItem("chris_user");
  localStorage.removeItem(
    "chris_organization"
  );

  sessionStorage.removeItem("chris_token");
  sessionStorage.removeItem("chris_user");
  sessionStorage.removeItem(
    "chris_organization"
  );
}

export async function apiRequest(
  endpoint,
  options = {}
) {
  const token = getAuthToken();

  const headers = {
    ...(options.body
      ? {
          "Content-Type":
            "application/json",
        }
      : {}),

    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),

    ...(options.headers || {}),
  };

  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      headers,
    }
  );

  let result;

  try {
    result = await response.json();
  } catch {
    result = {
      status: "error",
      message: "Invalid server response.",
    };
  }

  if (response.status === 401) {
    clearAuthSession();

    if (
      window.location.pathname !== "/login"
    ) {
      window.location.replace("/login");
    }

    throw new Error(
      result.message ||
        "Your session has expired. Please sign in again."
    );
  }

  if (!response.ok) {
    throw new Error(
      result.message ||
        "Unable to complete request."
    );
  }

  return result;
}