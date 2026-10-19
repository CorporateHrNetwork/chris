import { useCallback, useEffect, useState } from "react";
import { FaBriefcase, FaClock, FaDownload, FaPrint, FaSyncAlt, FaUserCheck, FaUsers } from "react-icons/fa";
import { apiRequest } from "../services/api";
import "./Reports.css";
import "../components/settings/UsersRolesSettings.chris.css";

export default function RecruitmentReports() {
  const [summary, setSummary] = useState({});
  const [requisitions, setRequisitions] = useState([]);
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [summaryResult, requisitionResult] = await Promise.all([
        apiRequest("/api/recruitment/summary"),
        apiRequest("/api/recruitment/requisitions"),
      ]);
      setSummary(summaryResult?.data || {});
      setRequisitions(Array.isArray(requisitionResult?.data) ? requisitionResult.data : []);
      setScope(summaryResult?.data?.scope || null);
    } catch (err) {
      setError(err?.message || "Unable to load Recruitment Reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const handleLocationChange = () => load();
    window.addEventListener("chris:location-context-changed", handleLocationChange);
    return () => window.removeEventListener("chris:location-context-changed", handleLocationChange);
  }, [load]);

  const cards = [
    { label: "Total Requisitions", value: summary.totalRequisitions ?? requisitions.length, icon: <FaBriefcase /> },
    { label: "Open Positions", value: summary.openHeadcount ?? 0, icon: <FaUsers /> },
    { label: "Pending Approval", value: summary.pendingApproval ?? 0, icon: <FaClock /> },
    { label: "Returned", value: summary.returned ?? 0, icon: <FaUserCheck /> },
  ];

  const scopeLabel = scope?.mode === "HEAD_OFFICE_CONSOLIDATED"
    ? "HEAD OFFICE · CONSOLIDATED"
    : `${scope?.locationName || "BRANCH"}${scope?.locationCode ? ` · ${scope.locationCode}` : ""}`;

  return (
    <div className="chris-users-roles chris-reports-page" style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>REPORTING & INSIGHTS</div>
          <h1 style={titleStyle}>Recruitment Reports</h1>
          <p style={subtitleStyle}>
            Live recruitment demand and requisition reporting from the authenticated CHRiS operating context.
          </p>
        </div>
        <div className="reports-no-print" style={actionsStyle}>
          <span style={scopeStyle}>{scopeLabel}</span>
          <button type="button" style={secondaryButtonStyle} onClick={load} disabled={loading}>
            <FaSyncAlt /> {loading ? "Refreshing" : "Refresh"}
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={() => window.print()}>
            <FaPrint /> Print / Save PDF
          </button>
        </div>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={cardGridStyle}>
        {cards.map((card) => (
          <div key={card.label} className="chris-role-card" style={cardStyle}>
            <div style={cardTopStyle}><span>{card.label}</span><span style={iconStyle}>{card.icon}</span></div>
            <strong style={valueStyle}>{loading ? "…" : Number(card.value || 0).toLocaleString("en-NG")}</strong>
          </div>
        ))}
      </div>

      <section className="chris-role-card" style={panelStyle}>
        <div style={panelHeaderStyle}>
          <div>
            <h2 style={panelTitleStyle}>Recruitment Requisition Register</h2>
            <p style={panelSubtitleStyle}>Controlled hiring demand and approval status within the permitted operating context.</p>
          </div>
          <button type="button" className="reports-no-print" style={exportButtonStyle} onClick={() => window.print()}>
            <FaDownload /> Export / Save PDF
          </button>
        </div>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead><tr>{["Requisition", "Role", "Branch", "Employment Type", "Headcount", "Target Start", "Status"].map((heading) => <th key={heading} style={thStyle}>{heading}</th>)}</tr></thead>
            <tbody>
              {requisitions.map((row) => (
                <tr key={row.id || row.requisitionNumber}>
                  <td style={strongCellStyle}>{row.requisitionNumber || "—"}</td>
                  <td style={cellStyle}><strong style={{ color: "#F1F8F4" }}>{row.title || "—"}</strong><div style={mutedStyle}>{row.departmentName || "Department not assigned"}</div></td>
                  <td style={cellStyle}>{row.locationCode || row.locationName || "—"}</td>
                  <td style={cellStyle}>{row.employmentType || "—"}</td>
                  <td style={strongCellStyle}>{Number(row.requestedHeadcount || 0).toLocaleString("en-NG")}</td>
                  <td style={cellStyle}>{row.targetStartDate || "—"}</td>
                  <td style={cellStyle}><span style={statusStyle}>{String(row.status || "UNKNOWN").replace(/_/g, " ")}</span></td>
                </tr>
              ))}
              {!loading && !requisitions.length && <tr><td colSpan={7} style={emptyStyle}>No recruitment requisitions are recorded in this operating context yet.</td></tr>}
              {loading && <tr><td colSpan={7} style={emptyStyle}>Loading recruitment report data...</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const pageStyle = { padding: "4px 0 32px", color: "#EAF5EF", fontFamily: 'var(--chris-font-family, "Segoe UI", "Inter", Arial, sans-serif)' };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" };
const eyebrowStyle = { color: "var(--chris-gold, #D4AF37)", fontSize: 11, fontWeight: 900, letterSpacing: ".12em" };
const titleStyle = { margin: "7px 0 0", fontSize: 30, color: "#F7FAF8" };
const subtitleStyle = { margin: "7px 0 0", color: "#AFC5B9", fontSize: 13, maxWidth: 760, lineHeight: 1.55 };
const actionsStyle = { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" };
const scopeStyle = { border: "1px solid rgba(212,175,55,.48)", color: "#F6D35D", padding: "9px 12px", borderRadius: 999, fontSize: 10, fontWeight: 900, letterSpacing: ".05em", background: "rgba(212,175,55,.07)" };
const buttonBaseStyle = { borderRadius: 10, padding: "9px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 };
const secondaryButtonStyle = { ...buttonBaseStyle, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.055)", color: "#DCEBE3" };
const exportButtonStyle = { ...buttonBaseStyle, border: "1px solid rgba(212,175,55,.50)", background: "linear-gradient(135deg,#087A43,#075F36)", color: "#FFFFFF" };
const cardGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 13, marginTop: 20 };
const cardStyle = { border: "var(--chris-ui-panel-border, 1px solid rgba(212,175,55,.28))", background: "var(--chris-ui-panel-background, linear-gradient(145deg,#063722,#02170f))", borderRadius: "var(--chris-ui-panel-radius, 15px)", padding: 16, boxShadow: "var(--chris-ui-panel-shadow, 0 10px 28px rgba(0,0,0,.17))" };
const cardTopStyle = { display: "flex", justifyContent: "space-between", gap: 10, color: "#DDECE4", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".035em" };
const iconStyle = { color: "#F6D35D", fontSize: 17 };
const valueStyle = { display: "block", marginTop: 12, fontSize: 27, color: "#2EE98B" };
const panelStyle = { marginTop: 20, border: "var(--chris-ui-panel-border, 1px solid rgba(212,175,55,.20))", borderRadius: "var(--chris-ui-panel-radius, 17px)", padding: 20, background: "var(--chris-ui-panel-background, linear-gradient(145deg,rgba(6,55,34,.93),rgba(2,23,15,.95)))", boxShadow: "var(--chris-ui-panel-shadow, 0 12px 30px rgba(0,0,0,.18))", overflow: "hidden" };
const panelHeaderStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" };
const panelTitleStyle = { margin: 0, color: "#F7FAF8", fontSize: 17 };
const panelSubtitleStyle = { margin: "4px 0 0", color: "#9EB7A9", fontSize: 11, lineHeight: 1.45 };
const tableWrapStyle = { width: "100%", overflowX: "auto", marginTop: 18 };
const tableStyle = { width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 11 };
const thStyle = { textAlign: "left", color: "#F6D35D", padding: "10px 11px", borderBottom: "1px solid rgba(212,175,55,.22)", whiteSpace: "nowrap", fontSize: 9, textTransform: "uppercase", letterSpacing: ".045em" };
const cellStyle = { padding: "10px 11px", borderBottom: "1px solid rgba(255,255,255,.055)", color: "#C9DCD2", verticalAlign: "top" };
const strongCellStyle = { ...cellStyle, fontWeight: 800, color: "#F1F8F4" };
const mutedStyle = { marginTop: 3, color: "#91A99C", fontSize: 9 };
const statusStyle = { display: "inline-flex", padding: "4px 8px", borderRadius: 999, background: "rgba(46,233,139,.10)", color: "#76F3B2", fontSize: 9, fontWeight: 900, whiteSpace: "nowrap" };
const emptyStyle = { ...cellStyle, textAlign: "center", padding: 24, color: "#91A99C" };
const errorStyle = { marginTop: 18, border: "1px solid rgba(248,113,113,.34)", background: "rgba(248,113,113,.08)", color: "#FCA5A5", padding: "11px 13px", borderRadius: 10, fontSize: 11 };
