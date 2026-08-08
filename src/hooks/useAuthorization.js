import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  apiRequest,
  getAuthToken,
} from "../services/api";

function useAuthorization() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAuthorization = useCallback(async () => {
    const token = getAuthToken();

    if (!token) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await apiRequest(
        "/api/auth/me"
      );

      setProfile(result.data || null);
    } catch (err) {
      console.error(
        "CHRIS authorization profile error:",
        err
      );

      setProfile(null);

      setError(
        err.message ||
          "Unable to load access permissions."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuthorization();
  }, [loadAuthorization]);

  const permissions =
    profile?.permissions || [];

  const roles =
    profile?.roles || [];

  const hasPermission = useCallback(
    (permission) =>
      permissions.includes(permission),
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (...requiredPermissions) =>
      requiredPermissions.some(
        (permission) =>
          permissions.includes(permission)
      ),
    [permissions]
  );

  const hasAllPermissions = useCallback(
    (...requiredPermissions) =>
      requiredPermissions.every(
        (permission) =>
          permissions.includes(permission)
      ),
    [permissions]
  );

  const hasRole = useCallback(
    (role) => roles.includes(role),
    [roles]
  );

  return {
    profile,
    roles,
    permissions,
    loading,
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    refreshAuthorization: loadAuthorization,
  };
}

export default useAuthorization;
