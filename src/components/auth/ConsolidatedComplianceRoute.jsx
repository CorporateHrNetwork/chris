import useAuthorization from "../../hooks/useAuthorization";

function ConsolidatedComplianceRoute({ children }) {
  const {
    profile,
    hasAnyPermission,
    loading,
    error,
  } = useAuthorization();

  if (loading) {
    return (
      <div role="status" style={stateStyle}>
        Loading compliance access...
      </div>
    );
  }

  const canViewCompliance = hasAnyPermission(
    "compliance.view",
    "remittances.view",
    "payroll.view",
    "payroll.manage"
  );
  const isConsolidated =
    profile?.consolidatedOrganization === true &&
    !profile?.activeLocationId;

  if (!canViewCompliance || !isConsolidated) {
    return (
      <div role="alert" style={stateStyle}>
        <h1 style={titleStyle}>Consolidated access required</h1>
        <p style={messageStyle}>
          {error ||
            "Compliance rules, statutory liabilities and remittances require organization-wide consolidated authority."}
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
  fontSize: 24,
};

const messageStyle = {
  margin: 0,
  color: "var(--chris-text-muted)",
  lineHeight: 1.6,
};

export default ConsolidatedComplianceRoute;
