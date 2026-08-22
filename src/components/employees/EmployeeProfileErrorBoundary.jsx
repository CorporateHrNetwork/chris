import { Component } from "react";

class EmployeeProfileErrorBoundary extends Component {
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