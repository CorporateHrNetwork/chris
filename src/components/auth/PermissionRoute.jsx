import useAuthorization from "../../hooks/useAuthorization";

function PermissionRoute({
  permission,
  children,
}) {
  const {
    hasPermission,
    loading,
    error,
  } = useAuthorization();

  if (loading) {
    return (
      <div role="status" style={stateStyle}>
        Loading access permissions...
      </div>
    );
  }

  if (!hasPermission(permission)) {
    return (
      <div role="alert" style={stateStyle}>
        <h1 style={titleStyle}>Access denied</h1>
        <p style={messageStyle}>
          {error ||
            "You do not have permission to view this CHRIS page."}
        </p>
      </div>
    );
  }

  return children;
}

const stateStyle = {
  padding: 24,
  border: "1px solid var(--chris-border-gold)",
  borderRadius: "var(--chris-radius-card)",
  background: "rgba(7,18,13,.96)",
  color: "var(--chris-text-main)",
};

const titleStyle = {
  margin: "0 0 8px",
  color: "var(--chris-gold)",
  fontSize: "var(--chris-font-xl)",
};

const messageStyle = {
  margin: 0,
  color: "var(--chris-text-secondary)",
};

export default PermissionRoute;
