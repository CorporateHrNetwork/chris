import { getStoredOrganization } from "../../services/api";

const DEMO_SLUG = "chris-demo-company";

export function isDemoEnvironment() {
  const configuredSlug = String(import.meta.env.VITE_CHRIS_DEMO_ORGANIZATION_SLUG || DEMO_SLUG).trim();
  const configuredHost = String(import.meta.env.VITE_CHRIS_DEMO_HOST || "demo.chris.crnetwork.com.ng").trim().toLowerCase();
  const organization = getStoredOrganization();
  const storedSlug = String(organization?.slug || "").trim();
  const currentHost = String(window.location.hostname || "").trim().toLowerCase();

  return currentHost === configuredHost || storedSlug === configuredSlug;
}

export default function DemoEnvironmentBanner() {
  if (!isDemoEnvironment()) return null;

  return (
    <div
      role="status"
      aria-label="CHRiS demo environment"
      style={{
        minHeight: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "7px 16px",
        boxSizing: "border-box",
        background: "linear-gradient(90deg, #8A6A00, #D4AF37, #8A6A00)",
        color: "#07110C",
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        textAlign: "center",
        borderBottom: "1px solid rgba(255,255,255,0.24)",
        flexShrink: 0,
      }}
    >
      <span>CHRiS Demo Environment</span>
      <span aria-hidden="true">•</span>
      <span>Fictional Data Only</span>
      <span aria-hidden="true">•</span>
      <span>Not Production</span>
    </div>
  );
}
