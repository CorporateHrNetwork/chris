import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FaChartBar,
  FaUsers,
  FaBuilding,
  FaDownload,
  FaPrint,
  FaSyncAlt,
  FaUserCheck,
  FaUserClock,
  FaUmbrellaBeach,
  FaUserSlash,
} from "react-icons/fa";

import {
  apiDownload,
  apiRequest,
  saveDownloadedBlob,
} from "../services/api";

const VIEWS = [
  { key: "overview", label: "Reports Dashboard" },
  { key: "workforce", label: "Workforce Analytics" },
  { key: "employees", label: "Employee Reports" },
  { key: "headcount", label: "Headcount Reports" },
  { key: "branches", label: "Branch Reports" },
];

function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = String(searchParams.get("view") || "overview").toLowerCase();
  const activeView = VIEWS.some((view) => view.key === requestedView)
    ? requestedView
    : "overview";

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");

  const loadReport = async () => {
    try {
      setLoading(true);
      setError("");
      const result = await apiRequest("/api/reports/release1");
      setReport(result?.data || null);
    } catch (err) {
      setError(err?.message || "Unable to load Reports & Analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const filteredEmployees = useMemo(() => {
    const rows = report?.employees || [];
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((employee) =>
      [
        employee.employeeNumber,
        employee.employeeName,
        employee.department,
        employee.designation,
        employee.branch,
        employee.branchCode,
        employee.employmentType,
        employee.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [report, employeeSearch]);

  const selectView = (key) => {
    if (key === "overview") setSearchParams({});
    else setSearchParams({ view: key });
  };

  const exportExcel = async () => {
    try {
      setExporting(true);
      const file = await apiDownload(
        `/api/reports/release1/export.xlsx?view=${encodeURIComponent(activeView)}`
      );
      saveDownloadedBlob(file);
    } catch (err) {
      window.alert(err?.message || "Unable to export the report.");
    } finally {
      setExporting(false);
    }
  };

  const scopeLabel = report?.scope?.mode === "HEAD_OFFICE_CONSOLIDATED"
    ? "HEAD OFFICE · CONSOLIDATED"
    : `${report?.scope?.locationName || "BRANCH"}${
        report?.scope?.locationCode ? ` · ${report.scope.locationCode}` : ""
      }`;

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>REPORTING & INSIGHTS</div>
          <h1 style={titleStyle}>Reports & Analytics</h1>
          <p style={subtitleStyle}>
            Release 1 management reporting from authoritative CHRiS employee and organization data.
          </p>
        </div>

        <div style={headerActionsStyle}>
          <span style={scopePillStyle}>{scopeLabel}</span>
          <button type="button" style={secondaryButtonStyle} onClick={loadReport} disabled={loading}>
            <FaSyncAlt /> {loading ? "Refreshing" : "Refresh"}
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={() => window.print()}>
            <FaPrint /> Print / Save PDF
          </button>
          <button type="button" style={primaryButtonStyle} onClick={exportExcel} disabled={exporting || loading || !report}>
            <FaDownload /> {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      <div style={tabBarStyle}>
        {VIEWS.map((view) => (
          <button
            key={view.key}
            type="button"
            onClick={() => selectView(view.key)}
            style={activeView === view.key ? activeTabStyle : tabStyle}
          >
            {view.label}
          </button>
        ))}
      </div>

      {loading && <StatusPanel text="Loading authoritative report data..." />}
      {!loading && error && <StatusPanel text={error} error />}
      {!loading && !error && report && (
        <>
          <KpiGrid summary={report.summary} />

          {activeView === "overview" && <Overview report={report} />}
          {activeView === "workforce" && <Workforce report={report} />}
          {activeView === "employees" && (
            <EmployeeReport
              rows={filteredEmployees}
              totalRows={report.employees?.length || 0}
              search={employeeSearch}
              onSearch={setEmployeeSearch}
            />
          )}
          {activeView === "headcount" && <HeadcountReport report={report} />}
          {activeView === "branches" && <BranchReport rows={report.branches || []} />}

          <div style={footerNoteStyle}>
            Generated {formatDateTime(report.generatedAt)} · Employee tables contain current workforce only.
            {report?.controls?.branchScoped
              ? " Branch access is enforced by the active CHRiS operating context."
              : " Head Office shows the consolidated organization."}
          </div>
        </>
      )}
    </div>
  );
}

function KpiGrid({ summary }) {
  const cards = [
    { title: "Current Workforce", value: summary.currentWorkforce, icon: <FaUsers />, tone: "gold" },
    { title: "Active", value: summary.active, icon: <FaUserCheck />, tone: "green" },
    { title: "Probation", value: summary.probation, icon: <FaUserClock />, tone: "gold" },
    { title: "On Leave", value: summary.onLeave, icon: <FaUmbrellaBeach />, tone: "green" },
    { title: "Suspended", value: summary.suspended, icon: <FaUserSlash />, tone: "gold" },
    { title: "Exited Records", value: summary.exited, icon: <FaChartBar />, tone: "green" },
  ];

  return (
    <div style={kpiGridStyle}>
      {cards.map((card) => (
        <div key={card.title} style={kpiCardStyle}>
          <div style={kpiTopStyle}>
            <span style={kpiLabelStyle}>{card.title}</span>
            <span style={card.tone === "gold" ? iconGoldStyle : iconGreenStyle}>{card.icon}</span>
          </div>
          <div style={card.tone === "gold" ? kpiValueGoldStyle : kpiValueGreenStyle}>
            {Number(card.value || 0).toLocaleString("en-NG")}
          </div>
        </div>
      ))}
    </div>
  );
}

function Overview({ report }) {
  return (
    <div style={twoColumnStyle}>
      <Panel title="Branch Headcount" subtitle="Current workforce by active operating branch.">
        <BranchTable rows={report.branches || []} compact />
      </Panel>
      <Panel title="Largest Departments" subtitle="Current workforce concentration by department.">
        <BreakdownBars rows={(report.headcount?.byDepartment || []).slice(0, 10)} total={report.headcount?.total || 0} />
      </Panel>
      <Panel title="Employment Type Mix" subtitle="Current workforce by authoritative Employment Type.">
        <BreakdownBars rows={report.headcount?.byEmploymentType || []} total={report.headcount?.total || 0} />
      </Panel>
      <Panel title="Gender Distribution" subtitle="Current workforce demographic coverage.">
        <BreakdownBars rows={report.headcount?.byGender || []} total={report.headcount?.total || 0} />
      </Panel>
    </div>
  );
}

function Workforce({ report }) {
  return (
    <div style={twoColumnStyle}>
      <Panel title="Workforce Status" subtitle="Current workforce status distribution.">
        <BreakdownBars rows={report.headcount?.byStatus || []} total={report.headcount?.total || 0} />
      </Panel>
      <Panel title="Gender" subtitle="Current workforce demographic distribution.">
        <BreakdownBars rows={report.headcount?.byGender || []} total={report.headcount?.total || 0} />
      </Panel>
      <Panel title="Employment Types" subtitle="Current workforce by employment arrangement.">
        <BreakdownBars rows={report.headcount?.byEmploymentType || []} total={report.headcount?.total || 0} />
      </Panel>
      <Panel title="Department Distribution" subtitle="Headcount by department.">
        <BreakdownBars rows={report.headcount?.byDepartment || []} total={report.headcount?.total || 0} maxRows={15} />
      </Panel>
    </div>
  );
}

function EmployeeReport({ rows, totalRows, search, onSearch }) {
  return (
    <Panel
      title="Employee Report"
      subtitle={`${rows.length.toLocaleString("en-NG")} of ${totalRows.toLocaleString("en-NG")} current employees shown.`}
      actions={
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search employee, branch, department..."
          style={searchStyle}
        />
      }
    >
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {[
                "Employee No.",
                "Employee",
                "Status",
                "Employment Type",
                "Department",
                "Designation",
                "Branch",
                "Hire Date",
              ].map((heading) => <th key={heading} style={thStyle}>{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((employee) => (
              <tr key={employee.employeeNumber}>
                <td style={tdStrongStyle}>{employee.employeeNumber}</td>
                <td style={tdStyle}>{employee.employeeName}</td>
                <td style={tdStyle}><StatusBadge value={employee.status} /></td>
                <td style={tdStyle}>{employee.employmentType || "—"}</td>
                <td style={tdStyle}>{employee.department || "—"}</td>
                <td style={tdStyle}>{employee.designation || "—"}</td>
                <td style={tdStyle}>{employee.branchCode || employee.branch || "—"}</td>
                <td style={tdStyle}>{employee.hireDate || "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={8} style={emptyCellStyle}>No employees match the current search.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function HeadcountReport({ report }) {
  return (
    <div style={twoColumnStyle}>
      <Panel title="By Status" subtitle="Current workforce status headcount.">
        <SimpleBreakdownTable rows={report.headcount?.byStatus || []} />
      </Panel>
      <Panel title="By Employment Type" subtitle="Current workforce by employment arrangement.">
        <SimpleBreakdownTable rows={report.headcount?.byEmploymentType || []} />
      </Panel>
      <Panel title="By Department" subtitle="Current workforce by department.">
        <SimpleBreakdownTable rows={report.headcount?.byDepartment || []} />
      </Panel>
      <Panel title="By Designation" subtitle="Current workforce by designation.">
        <SimpleBreakdownTable rows={report.headcount?.byDesignation || []} />
      </Panel>
    </div>
  );
}

function BranchReport({ rows }) {
  return (
    <Panel title="Branch Report" subtitle="Current workforce distribution within the permitted operating context.">
      <BranchTable rows={rows} />
    </Panel>
  );
}

function BranchTable({ rows, compact = false }) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {["Branch", "Code", "Current", "Active", "Probation", "On Leave", "Suspended", "Male", "Female"].map((heading) => (
              <th key={heading} style={thStyle}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.locationId || row.code}>
              <td style={tdStrongStyle}>{row.branch}</td>
              <td style={tdStyle}>{row.code}</td>
              <td style={tdStrongStyle}>{row.currentWorkforce}</td>
              <td style={tdStyle}>{row.active}</td>
              <td style={tdStyle}>{row.probation}</td>
              <td style={tdStyle}>{row.onLeave}</td>
              <td style={tdStyle}>{row.suspended}</td>
              <td style={tdStyle}>{row.male}</td>
              <td style={tdStyle}>{row.female}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={9} style={emptyCellStyle}>No active branch records are available.</td></tr>
          )}
        </tbody>
      </table>
      {!compact && <div style={tableNoteStyle}>Head Office shows all active branches. Branch HR users see only their assigned branch.</div>}
    </div>
  );
}

function BreakdownBars({ rows, total, maxRows = 12 }) {
  const visible = rows.slice(0, maxRows);
  const maximum = Math.max(1, ...visible.map((row) => Number(row.count || 0)));
  return (
    <div style={{ display: "grid", gap: 11 }}>
      {visible.map((row) => {
        const count = Number(row.count || 0);
        const percentage = total ? Math.round((count / total) * 1000) / 10 : 0;
        return (
          <div key={row.name}>
            <div style={barLabelRowStyle}>
              <span>{friendlyLabel(row.name)}</span>
              <strong>{count.toLocaleString("en-NG")} · {percentage}%</strong>
            </div>
            <div style={barTrackStyle}>
              <div style={{ ...barFillStyle, width: `${Math.max(2, (count / maximum) * 100)}%` }} />
            </div>
          </div>
        );
      })}
      {!visible.length && <div style={emptyTextStyle}>No report data available.</div>}
    </div>
  );
}

function SimpleBreakdownTable({ rows }) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead><tr><th style={thStyle}>Category</th><th style={thRightStyle}>Headcount</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td style={tdStyle}>{friendlyLabel(row.name)}</td>
              <td style={tdRightStrongStyle}>{Number(row.count || 0).toLocaleString("en-NG")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ title, subtitle, actions, children }) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={panelTitleStyle}>{title}</h2>
          {subtitle && <div style={panelSubtitleStyle}>{subtitle}</div>}
        </div>
        {actions}
      </div>
      <div style={{ marginTop: 18 }}>{children}</div>
    </section>
  );
}

function StatusBadge({ value }) {
  return <span style={statusBadgeStyle}>{friendlyLabel(value)}</span>;
}

function StatusPanel({ text, error = false }) {
  return (
    <div style={{ ...statusPanelStyle, ...(error ? { borderColor: "rgba(239,68,68,.45)", color: "#FCA5A5" } : {}) }}>
      {text}
    </div>
  );
}

function friendlyLabel(value) {
  const text = String(value || "Unassigned").replace(/_/g, " ").toLowerCase();
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

const pageStyle = { padding: "4px 0 32px", color: "#EAF5EF" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" };
const eyebrowStyle = { color: "var(--chris-gold, #D4AF37)", fontSize: 11, fontWeight: 900, letterSpacing: ".12em" };
const titleStyle = { margin: "7px 0 0", fontSize: 30, color: "#F7FAF8" };
const subtitleStyle = { margin: "7px 0 0", color: "#AFC5B9", fontSize: 13, maxWidth: 720, lineHeight: 1.55 };
const headerActionsStyle = { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" };
const scopePillStyle = { border: "1px solid rgba(212,175,55,.48)", color: "#F6D35D", padding: "9px 12px", borderRadius: 999, fontSize: 10, fontWeight: 900, letterSpacing: ".05em", background: "rgba(212,175,55,.07)" };
const buttonBaseStyle = { borderRadius: 10, padding: "9px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 };
const secondaryButtonStyle = { ...buttonBaseStyle, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.055)", color: "#DCEBE3" };
const primaryButtonStyle = { ...buttonBaseStyle, border: "1px solid rgba(212,175,55,.50)", background: "linear-gradient(135deg,#087A43,#075F36)", color: "#FFFFFF" };
const tabBarStyle = { marginTop: 22, display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid rgba(212,175,55,.16)", paddingBottom: 12 };
const tabStyle = { ...buttonBaseStyle, border: "1px solid rgba(255,255,255,.10)", background: "rgba(5,44,28,.72)", color: "#AFC5B9" };
const activeTabStyle = { ...tabStyle, color: "#FFFFFF", borderColor: "rgba(212,175,55,.55)", background: "linear-gradient(135deg,rgba(8,122,67,.45),rgba(212,175,55,.10))" };
const kpiGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 13, marginTop: 20 };
const kpiCardStyle = { border: "1px solid rgba(212,175,55,.28)", background: "linear-gradient(145deg,#063722,#02170f)", borderRadius: 15, padding: 16, boxShadow: "0 10px 28px rgba(0,0,0,.17)" };
const kpiTopStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
const kpiLabelStyle = { fontSize: 10, fontWeight: 900, color: "#DDECE4", textTransform: "uppercase", letterSpacing: ".035em" };
const iconGreenStyle = { color: "#2EE98B", fontSize: 17 };
const iconGoldStyle = { color: "#F6D35D", fontSize: 17 };
const kpiValueBaseStyle = { marginTop: 12, fontSize: 29, fontWeight: 900 };
const kpiValueGreenStyle = { ...kpiValueBaseStyle, color: "#2EE98B" };
const kpiValueGoldStyle = { ...kpiValueBaseStyle, color: "#F6D35D" };
const twoColumnStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(390px,1fr))", gap: 18, marginTop: 20 };
const panelStyle = { marginTop: 20, border: "1px solid rgba(212,175,55,.20)", borderRadius: 17, padding: 20, background: "linear-gradient(145deg,rgba(6,55,34,.93),rgba(2,23,15,.95))", boxShadow: "0 12px 30px rgba(0,0,0,.18)", overflow: "hidden" };
const panelHeaderStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" };
const panelTitleStyle = { margin: 0, color: "#F7FAF8", fontSize: 17 };
const panelSubtitleStyle = { color: "#9EB7A9", marginTop: 4, fontSize: 11, lineHeight: 1.45 };
const tableWrapStyle = { width: "100%", overflowX: "auto" };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 620, fontSize: 11 };
const thStyle = { textAlign: "left", color: "#F6D35D", padding: "10px 11px", borderBottom: "1px solid rgba(212,175,55,.22)", whiteSpace: "nowrap", fontSize: 9, textTransform: "uppercase", letterSpacing: ".045em" };
const thRightStyle = { ...thStyle, textAlign: "right" };
const tdStyle = { padding: "10px 11px", borderBottom: "1px solid rgba(255,255,255,.055)", color: "#C9DCD2", verticalAlign: "top" };
const tdStrongStyle = { ...tdStyle, fontWeight: 800, color: "#F1F8F4" };
const tdRightStrongStyle = { ...tdStrongStyle, textAlign: "right", color: "#2EE98B" };
const emptyCellStyle = { ...tdStyle, textAlign: "center", padding: 24, color: "#91A99C" };
const searchStyle = { minWidth: 280, padding: "9px 11px", borderRadius: 9, border: "1px solid rgba(212,175,55,.28)", background: "rgba(0,0,0,.22)", color: "#F7FAF8", outline: "none" };
const barLabelRowStyle = { display: "flex", justifyContent: "space-between", gap: 12, color: "#C9DCD2", fontSize: 11, marginBottom: 5 };
const barTrackStyle = { height: 7, borderRadius: 999, background: "rgba(255,255,255,.07)", overflow: "hidden" };
const barFillStyle = { height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#087A43,#D4AF37)" };
const emptyTextStyle = { color: "#91A99C", fontSize: 12 };
const statusBadgeStyle = { display: "inline-flex", padding: "4px 8px", borderRadius: 999, background: "rgba(46,233,139,.10)", color: "#76F3B2", fontSize: 9, fontWeight: 900 };
const tableNoteStyle = { marginTop: 12, color: "#91A99C", fontSize: 10 };
const footerNoteStyle = { marginTop: 18, color: "#829A8D", fontSize: 10, lineHeight: 1.5 };
const statusPanelStyle = { marginTop: 22, padding: 18, border: "1px solid rgba(212,175,55,.25)", borderRadius: 14, color: "#C9DCD2", background: "rgba(6,55,34,.62)" };

export default Reports;
