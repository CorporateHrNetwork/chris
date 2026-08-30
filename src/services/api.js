const API_BASE_URL =
  "http://localhost:5000";

/*
============================================================
AUTH STORAGE
============================================================
*/

export function getAuthToken() {
  const localToken =
    localStorage.getItem(
      "chris_token"
    );

  const sessionToken =
    sessionStorage.getItem(
      "chris_token"
    );

  return (
    localToken ||
    sessionToken ||
    null
  );
}

export function getStoredUser() {
  const value =
    localStorage.getItem(
      "chris_user"
    ) ||
    sessionStorage.getItem(
      "chris_user"
    );

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(
      value
    );
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
    return JSON.parse(
      value
    );
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  localStorage.removeItem(
    "chris_token"
  );

  localStorage.removeItem(
    "chris_user"
  );

  localStorage.removeItem(
    "chris_organization"
  );

  sessionStorage.removeItem(
    "chris_token"
  );

  sessionStorage.removeItem(
    "chris_user"
  );

  sessionStorage.removeItem(
    "chris_organization"
  );
}

/*
============================================================
VERIFY STORED SESSION AGAINST BACKEND
============================================================

A token existing in browser storage does NOT itself prove
that the user is authenticated.

ProtectedRoute calls this before rendering CHRIS.
============================================================
*/

export async function verifyAuthSession() {
  const token =
    getAuthToken();

  if (!token) {
    const error =
      new Error(
        "Authentication required."
      );

    error.code =
      "AUTH_INVALID";

    throw error;
  }

  let response;

  try {
    response =
      await fetch(
        `${API_BASE_URL}/api/auth/me`,
        {
          method:
            "GET",

          headers: {
            Authorization:
              `Bearer ${token}`,

            "Cache-Control":
              "no-cache",
          },

          cache:
            "no-store",
        }
      );
  } catch {
    const error =
      new Error(
        "Unable to connect to the CHRIS server."
      );

    error.code =
      "NETWORK_UNAVAILABLE";

    throw error;
  }

  let result;

  try {
    result =
      await response.json();
  } catch {
    result = {
      status:
        "error",

      message:
        "Invalid server response.",
    };
  }

  if (
    response.status ===
      401 ||
    response.status ===
      403
  ) {
    const error =
      new Error(
        result.message ||
          "Your CHRIS session is no longer valid."
      );

    error.code =
      "AUTH_INVALID";

    throw error;
  }

  if (!response.ok) {
    const error =
      new Error(
        result.message ||
          "Unable to verify CHRIS session."
      );

    error.code =
      "SERVER_UNAVAILABLE";

    throw error;
  }

  return result;
}

/*
============================================================
STANDARD API REQUEST
============================================================
*/

export async function apiRequest(
  endpoint,
  options = {}
) {
  const token =
    getAuthToken();

  const rawBody =
    options.body;

  const isFormData =
    typeof FormData !== "undefined" &&
    rawBody instanceof FormData;

  const isBlob =
    typeof Blob !== "undefined" &&
    rawBody instanceof Blob;

  const isUrlSearchParams =
    typeof URLSearchParams !== "undefined" &&
    rawBody instanceof URLSearchParams;

  const shouldSerializeJson =
    rawBody !== undefined &&
    rawBody !== null &&
    typeof rawBody === "object" &&
    !isFormData &&
    !isBlob &&
    !isUrlSearchParams;

  const requestBody =
    shouldSerializeJson
      ? JSON.stringify(rawBody)
      : rawBody;
  const headers = {
    ...(shouldSerializeJson ||
    typeof rawBody === "string"
      ? {
          "Content-Type":
            "application/json",
        }
      : {}),

    ...(token
      ? {
          Authorization:
            `Bearer ${token}`,
        }
      : {}),

    "Cache-Control":
      "no-cache",

    ...(options.headers ||
      {}),
  };

  let response;

  try {
    response =
      await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
          ...options,

          body:
            requestBody,

          headers,

          /*
          Protected HR information
          should always come from the
          backend, not browser HTTP cache.
          */
          cache:
            "no-store",
        }
      );
  } catch {
    const error =
      new Error(
        "CHRIS cannot connect to the server. Check your connection and try again."
      );

    error.code =
      "NETWORK_UNAVAILABLE";

    throw error;
  }

  let result;

  try {
    result =
      await response.json();
  } catch {
    result = {
      status:
        "error",

      message:
        "Invalid server response.",
    };
  }

  if (
    response.status ===
    401
  ) {
    clearAuthSession();

    if (
      window.location.pathname !==
      "/login"
    ) {
      window.location.replace(
        "/login"
      );
    }

    const error =
      new Error(
        result.message ||
          "Your session has expired. Please sign in again."
      );

    error.code =
      "AUTH_INVALID";

    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      result.message ||
        "Unable to complete request."
    );
    error.code = result.code || "REQUEST_FAILED";
    error.details = result.details || null;
    error.fieldErrors = result.details?.fields || result.fieldErrors || [];
    throw error;
  }

  return result;
}
