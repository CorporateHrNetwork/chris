import { useNavigate } from "react-router-dom";
import chrisLogo from "../assets/images/chris-logo.png";

const PATHS = [
  {
    key: "RECOMMENDED",
    title: "Use Recommended Configuration",
    description:
      "Start with CHRiS recommended HR, payroll, compliance, leave, security and workflow defaults. You can configure your organisation later without creating a new tenant.",
    destination: "/organization/profile?setup=recommended",
  },
  {
    key: "ORGANISATION_CONFIGURED",
    title: "Configure for My Organisation",
    description:
      "Configure CHRiS around your organisation structure, policies, payroll, approvals, terminology, branding and operating model.",
    destination: "/organization/profile?setup=organisation",
  },
];

export default function OrganizationSetupChoice() {
  const navigate = useNavigate();

  const choose = (path) => {
    /*
      This screen is intentionally non-destructive.
      Persisting the tenant deployment mode belongs to the backend
      provisioning service/migration. Until that is wired, the choice
      only routes an authorised administrator into the selected setup
      workspace and cannot overwrite tenant configuration or data.
    */
    sessionStorage.setItem("chris_setup_path", path.key);
    navigate(path.destination);
  };

  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <img src={chrisLogo} alt="CHRiS" style={logoStyle} />
        <p style={eyebrowStyle}>Organisation Setup</p>
        <h1 style={titleStyle}>Choose your CHRiS experience</h1>
        <p style={introStyle}>
          Start with CHRiS recommended configuration or configure the platform
          for your organisation. This choice does not create a separate CHRiS
          codebase and does not change existing organisation data.
        </p>

        <div style={gridStyle}>
          {PATHS.map((path) => (
            <article key={path.key} style={cardStyle}>
              <h2 style={cardTitleStyle}>{path.title}</h2>
              <p style={cardTextStyle}>{path.description}</p>
              <button type="button" onClick={() => choose(path)} style={buttonStyle}>
                {path.title}
              </button>
            </article>
          ))}
        </div>

        <p style={footnoteStyle}>
          Existing configured tenants are not sent through this setup screen
          during normal sign-in. Organisation administrators can manage
          configuration later from Settings.
        </p>
      </section>
    </main>
  );
}

const pageStyle = { minHeight: "100vh", display: "grid", placeItems: "center", padding: "32px", background: "#F5F8F6", boxSizing: "border-box" };
const panelStyle = { width: "100%", maxWidth: "980px", background: "#FFFFFF", border: "1px solid #DCE7E0", borderRadius: "24px", padding: "40px", boxShadow: "0 24px 70px rgba(15, 55, 35, 0.10)" };
const logoStyle = { width: "210px", maxWidth: "70%", height: "auto", display: "block", margin: "0 auto 20px" };
const eyebrowStyle = { textAlign: "center", color: "#D4AF37", fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "12px", margin: 0 };
const titleStyle = { textAlign: "center", color: "#075F36", fontSize: "30px", margin: "8px 0 10px" };
const introStyle = { maxWidth: "720px", margin: "0 auto 28px", textAlign: "center", color: "#52635A", lineHeight: 1.65 };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" };
const cardStyle = { border: "1px solid #D8E6DE", borderRadius: "18px", padding: "26px", background: "#FBFDFC", display: "flex", flexDirection: "column" };
const cardTitleStyle = { color: "#075F36", fontSize: "20px", margin: "0 0 12px" };
const cardTextStyle = { color: "#5B6B62", lineHeight: 1.65, margin: "0 0 24px", flex: 1 };
const buttonStyle = { width: "100%", border: "none", borderRadius: "11px", padding: "14px 16px", background: "#087A43", color: "#FFFFFF", fontSize: "14px", fontWeight: 800, cursor: "pointer" };
const footnoteStyle = { margin: "26px 0 0", color: "#6B7B72", fontSize: "12px", textAlign: "center", lineHeight: 1.6 };
