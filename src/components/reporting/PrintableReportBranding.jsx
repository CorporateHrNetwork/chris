import { getStoredOrganization } from "../../services/api";
import "./PrintableReportBranding.css";

function safeLogoUrl(organization = {}) {
  const candidate = String(organization?.logoUrl || "").trim();
  if (candidate && !/^javascript:/i.test(candidate)) return candidate;
  const slug = String(organization?.slug || "").trim().toLowerCase();
  if (slug === "zermatt-liquor-limited") return "/zrt-logo.jpeg";
  return "";
}

function cleanOrganizationName(organization = {}) {
  const raw = String(organization?.legalName || organization?.name || "Organisation").trim();
  return raw.replace(/\s*[—-]\s*SYNTHETIC STAGING ACCEPTANCE\s*$/i, "").trim();
}

export default function PrintableReportBranding({
  reportTitle,
  scopeLabel,
  generatedAt,
  organization: organizationProp,
}) {
  const organization = organizationProp || getStoredOrganization() || {};
  const organizationName = cleanOrganizationName(organization);
  const logoUrl = safeLogoUrl(organization);

  return (
    <>
      <header className="chris-print-report-header">
        {logoUrl && (
          <img
            className="chris-print-report-logo"
            src={logoUrl}
            alt={organizationName + " logo"}
          />
        )}
        <div className="chris-print-report-heading">
          <div className="chris-print-report-owner">{organizationName}</div>
          <h1>{reportTitle || "Report"}</h1>
          {scopeLabel && <div className="chris-print-report-scope">{scopeLabel}</div>}
        </div>
      </header>

      <footer className="chris-print-report-footer">
        <span>
          {generatedAt
            ? "Generated " + new Date(generatedAt).toLocaleString("en-NG")
            : "Generated from authoritative organisation data"}
        </span>
        <strong>Powered by CHRiS</strong>
      </footer>
    </>
  );
}
