import { Navigate } from "react-router-dom";

import useAuthorization from "../../hooks/useAuthorization";

function PermissionRoute({
  permission,
  children,
}) {
  const {
    hasPermission,
    loading,
  } = useAuthorization();

  if (loading) {
    return null;
  }

  if (!hasPermission(permission)) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return children;
}

export default PermissionRoute;