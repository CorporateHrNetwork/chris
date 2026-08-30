import { useNavigate, useSearchParams } from "react-router-dom";

import QuickAddEmployeeWizard from "./QuickAddEmployeeWizard";
import FullOnboardingWizard from "./FullOnboardingWizard";

export default function AddOnboardEmployeeEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = String(searchParams.get("mode") || "").toLowerCase();

  if (mode === "quick") {
    return <QuickAddEmployeeWizard />;
  }

  if (mode === "full") {
    return <FullOnboardingWizard />;
  }

  return (
    <section style={pageStyle}>
      <div style={eyebrowStyle}>EMPLOYEE ENTRY</div>
      <h1 style={titleStyle}>Add / Onboard Employee</h1>
      <p style={descriptionStyle}>
        Choose the appropriate operational path. Both modes preserve the existing authoritative Employee creation transaction.
      </p>
      <div style={modeGridStyle}>
        <button type="button" style={modeCardStyle} onClick={() => navigate("/employees/add?mode=quick")}>
          <span style={modeLabelStyle}>QUICK ADD</span>
          <strong style={modeTitleStyle}>Create employee record</strong>
          <span style={modeDescriptionStyle}>Use a compact four-step flow to create the authoritative employee record, then continue onboarding where required.</span>
        </button>
        <button type="button" style={modeCardStyle} onClick={() => navigate("/employees/add?mode=full")}>
          <span style={modeLabelStyle}>FULL ONBOARDING</span>
          <strong style={modeTitleStyle}>Create and continue onboarding</strong>
          <span style={modeDescriptionStyle}>Use the current safe creation flow, then continue directly into the existing employee-specific onboarding record.</span>
        </button>
      </div>
    </section>
  );
}

const pageStyle = { maxWidth: 1050, margin: "0 auto", color: "var(--chris-text-main)" };
const eyebrowStyle = { color: "var(--chris-gold)", fontSize: 11, fontWeight: 900, letterSpacing: ".15em" };
const titleStyle = { margin: "8px 0", fontSize: 32 };
const descriptionStyle = { margin: "0 0 24px", color: "var(--chris-text-secondary)", lineHeight: 1.6 };
const modeGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18 };
const modeCardStyle = { display: "grid", gap: 12, minHeight: 210, padding: 24, textAlign: "left", border: "1px solid var(--chris-border-gold)", borderRadius: 16, background: "linear-gradient(145deg,rgba(8,50,33,.96),rgba(3,20,13,.98))", color: "var(--chris-text-main)", boxShadow: "var(--chris-shadow-card)", cursor: "pointer" };
const modeLabelStyle = { color: "var(--chris-gold)", fontSize: 11, fontWeight: 900, letterSpacing: ".12em" };
const modeTitleStyle = { fontSize: 21 };
const modeDescriptionStyle = { color: "var(--chris-text-secondary)", lineHeight: 1.6 };
