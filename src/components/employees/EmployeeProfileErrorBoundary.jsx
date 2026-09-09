import { Component, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import EmployeeEmploymentGovernancePanel from "./EmployeeEmploymentGovernancePanel";

class EmployeeProfileRenderBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Employee profile render error:", error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section role="alert" style={panelStyle}>
        <p style={eyebrowStyle}>EMPLOYEE PROFILE</p>
        <h1 style={titleStyle}>Unable to display employee profile</h1>
        <p style={messageStyle}>
          CHRIS encountered an unexpected display error. The employee record
          was not changed.
        </p>
        <div style={actionsStyle}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={primaryButtonStyle}
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            style={secondaryButtonStyle}
          >
            Go Back
          </button>
        </div>
      </section>
    );
  }
}

/*
The employee profile route already renders this boundary. Keeping the
Employment Governance panel here lets CHRIS add controlled Designation and
employee-specific Employment Level controls without duplicating or rewriting
the large, accepted EmployeeProfile component.

When governance changes, profileVersion remounts EmployeeProfile so the header
and information cards immediately reload the effective Employment Level and
current reporting data from the governed profile API.
*/
function EmployeeProfileErrorBoundary({ children }) {
  const { employeeNumber } = useParams();
  const navigate = useNavigate();
  const [profileVersion, setProfileVersion] = useState(0);

  return (
    <EmployeeProfileRenderBoundary>
      <div key={profileVersion}>{children}</div>
      {employeeNumber ? (
        <div style={governanceWrapStyle}>
          <EmployeeEmploymentGovernancePanel
            employeeNumber={employeeNumber}
            onChanged={() => setProfileVersion((current) => current + 1)}
          />
          <div style={managerActionWrapStyle}>
            <div>
              <div style={managerActionEyebrowStyle}>REPORTING RELATIONSHIP</div>
              <strong style={managerActionTitleStyle}>Line Manager Assignment</strong>
              <p style={managerActionTextStyle}>
                CHRIS will resolve eligible managers from the employee's designation hierarchy,
                location and department. Where several valid candidates remain, HR must select
                the actual manager rather than letting CHRIS guess.
              </p>
            </div>
            <button
              type="button"
              style={managerActionButtonStyle}
              onClick={() =>
                navigate(
                  `/employees/line-managers?employeeNumber=${encodeURIComponent(employeeNumber)}`
                )
              }
            >
              Manage Line Manager
            </button>
          </div>
        </div>
      ) : null}
    </EmployeeProfileRenderBoundary>
  );
}

const governanceWrapStyle = {
  width: "100%",
  maxWidth: "1200px",
  margin: "22px auto 0",
};
const managerActionWrapStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 18,
  flexWrap: "wrap",
  marginTop: 14,
  padding: 18,
  border: "1px solid rgba(212,175,55,.30)",
  borderRadius: "var(--chris-radius-card)",
  background: "linear-gradient(145deg,rgba(12,38,26,.96),rgba(7,18,13,.98))",
  color: "var(--chris-text-main)",
};
const managerActionEyebrowStyle = {
  color: "var(--chris-gold)",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: ".12em",
};
const managerActionTitleStyle = {
  display: "block",
  marginTop: 5,
  fontSize: 16,
};
const managerActionTextStyle = {
  maxWidth: 720,
  margin: "7px 0 0",
  color: "var(--chris-text-secondary)",
  fontSize: 12,
  lineHeight: 1.55,
};
const managerActionButtonStyle = {
  minHeight: 42,
  padding: "0 16px",
  border: "1px solid var(--chris-gold)",
  borderRadius: "var(--chris-radius-md)",
  background: "var(--chris-gold)",
  color: "#07110c",
  fontWeight: 900,
  cursor: "pointer",
};
const panelStyle = {
  padding: 24,
  border: "1px solid rgba(251,113,133,.35)",
  borderRadius: "var(--chris-radius-card)",
  background: "linear-gradient(145deg,rgba(35,18,18,.96),rgba(7,18,13,.98))",
  color: "var(--chris-text-main)",
};
const eyebrowStyle = { margin: 0, color: "var(--chris-danger)", fontWeight: 900 };
const titleStyle = { margin: "8px 0", color: "var(--chris-text-main)" };
const messageStyle = { margin: 0, color: "var(--chris-text-secondary)" };
const actionsStyle = { display: "flex", gap: 10, marginTop: 18 };
const primaryButtonStyle = {
  padding: "10px 14px",
  border: "1px solid var(--chris-border-gold)",
  borderRadius: "var(--chris-radius-md)",
  background: "var(--chris-gold)",
  color: "#07110c",
  fontWeight: 800,
  cursor: "pointer",
};
const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "transparent",
  color: "var(--chris-gold)",
};

export default EmployeeProfileErrorBoundary;
