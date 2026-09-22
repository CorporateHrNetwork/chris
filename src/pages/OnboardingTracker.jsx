import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import useAuthorization from "../hooks/useAuthorization";
import { apiRequest } from "../services/api";

const PAGE_SIZE = 20;
const employeeName = (employee) =>
  [employee?.firstName, employee?.middleName, employee?.lastName]
    .filter(Boolean).join(" ") || "Unnamed employee";
const date = (value) => value ? new Date(value).toLocaleDateString("en-NG") : "—";
const readable = (value) => String(value || "").replaceAll("_", " ")
  .toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export function outstandingSections(record) {
  return (record.template?.sections || []).filter(
    (section) => section.required !== false &&
      record.sectionProgress?.[section.key]?.completed !== true
  );
}

export default function OnboardingTracker() {
  const navigate = useNavigate();
  const { hasPermission } = useAuthorization();
  const canManageWorkflows = hasPermission("employees.update");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    apiRequest("/api/employees/onboarding/status")
      .then((result) => {
        if (active) { setRecords(result?.data || []); setError(""); }
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message || "Unable to load Onboarding Tracker.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const departments = useMemo(() => Array.from(new Map(
    records.filter((record) => record.employee?.department?.id).map((record) => [
      record.employee.department.id, record.employee.department.name,
    ])
  ).entries()).sort((left, right) => left[1].localeCompare(right[1])), [records]);
  const statuses = useMemo(() => Array.from(new Set(
    records.map((record) => record.status).filter(Boolean)
  )).sort(), [records]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const employee = record.employee || {};
      const searchable = `${employee.employeeNumber || ""} ${employeeName(employee)}`.toLowerCase();
      return (!query || searchable.includes(query)) &&
        (!department || employee.department?.id === department) &&
        (!status || record.status === status);
    });
  }, [records, search, department, status]);

  useEffect(() => { setPage(1); }, [search, department, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const displayed = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return <div style={pageStyle}>
    <header style={headerStyle}>
      <div><div style={eyebrowStyle}>EMPLOYEE ONBOARDING</div><h1 style={titleStyle}>Onboarding Tracker</h1><p style={descriptionStyle}>Track employee onboarding stage, authoritative progress and outstanding template sections.</p></div>
      {canManageWorkflows && <button type="button" style={secondaryButtonStyle} onClick={() => navigate("/employees/onboarding/workflows")}>Manage Onboarding Workflows</button>}
    </header>

    <section style={filterStyle} aria-label="Onboarding Tracker filters">
      <label style={fieldStyle}><span>Search Employee</span><input style={controlStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Employee number or name" /></label>
      <label style={fieldStyle}><span>Department</span><select style={controlStyle} value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label style={fieldStyle}><span>Status</span><select style={controlStyle} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{readable(value)}</option>)}</select></label>
    </section>

    {error && <div role="alert" style={errorStyle}>{error}</div>}
    <div style={tableWrapStyle}><table style={tableStyle}>
      <thead><tr>{["Employee", "Department", "Designation", "Start Date", "Progress", "Current Stage", "Outstanding Items", "Status", "Action"].map((label) => <th key={label} style={thStyle}>{label}</th>)}</tr></thead>
      <tbody>
        {!loading && displayed.map((record) => {
          const number = record.employee?.employeeNumber;
          const outstanding = outstandingSections(record);
          const taskOutstanding = Number(record.taskSummary?.outstanding ?? 0);
          const overdueTasks = Number(record.taskSummary?.overdue ?? 0);
          const progress = Number(record.completionPercent ?? 0);
          return <tr key={record.id}>
            <td style={tdStyle}><strong>{number}</strong><div style={mutedStyle}>{employeeName(record.employee)}</div></td>
            <td style={tdStyle}>{record.employee?.department?.name || "—"}</td>
            <td style={tdStyle}>{record.employee?.designation?.name || "—"}</td>
            <td style={tdStyle}>{date(record.employee?.hireDate || record.startedAt)}</td>
            <td style={tdStyle}><div style={progressTrackStyle}><span style={{ ...progressFillStyle, width: `${Math.min(100, Math.max(0, progress))}%` }} /></div><strong style={progressStyle}>{progress}%</strong></td>
            <td style={tdStyle}>{record.currentStage || "—"}</td>
            <td style={tdStyle}><strong>{record.taskSummary?.total ? taskOutstanding : outstanding.length} outstanding</strong>{overdueTasks > 0 ? <div style={{ ...mutedStyle, color: "#f3c95d" }}>{overdueTasks} overdue task{overdueTasks === 1 ? "" : "s"}</div> : outstanding.length > 0 && !record.taskSummary?.total ? <div style={mutedStyle}>{outstanding.slice(0, 2).map((section) => section.label).join(" · ")}{outstanding.length > 2 ? "…" : ""}</div> : null}</td>
            <td style={tdStyle}><span style={statusStyle}>{overdueTasks > 0 ? "Overdue" : readable(record.status) || "Not Started"}</span></td>
            <td style={tdStyle}><div style={actionsStyle}><button type="button" style={primaryButtonStyle} onClick={() => navigate(`/employees/${encodeURIComponent(number)}/onboarding`)}>{record.status === "COMPLETED" ? "Review Onboarding" : "Continue Onboarding"}</button><button type="button" style={secondaryButtonStyle} onClick={() => navigate(`/employees/${encodeURIComponent(number)}`)}>View Employee</button></div></td>
          </tr>;
        })}
        {!loading && !displayed.length && <tr><td colSpan="9" style={emptyStyle}>{records.length ? "No onboarding records match the selected filters." : "No employee onboarding records are currently available."}</td></tr>}
        {loading && <tr><td colSpan="9" style={emptyStyle}>Loading Onboarding Tracker…</td></tr>}
      </tbody>
    </table></div>

    {!loading && filtered.length > PAGE_SIZE && <footer style={paginationStyle}><span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span><div style={actionsStyle}><button type="button" style={secondaryButtonStyle} disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" style={secondaryButtonStyle} disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></footer>}
  </div>;
}

const pageStyle = { color: "var(--chris-text-main)" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 18, flexWrap: "wrap", marginBottom: 16 };
const eyebrowStyle = { color: "var(--chris-gold)", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle = { margin: "7px 0 5px", fontSize: 30 };
const descriptionStyle = { margin: 0, color: "var(--chris-text-secondary)" };
const filterStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginBottom: 14, padding: 13, border: "1px solid var(--chris-border-soft)", borderRadius: 12, background: "rgba(5,35,23,.78)" };
const fieldStyle = { display: "grid", gap: 6, minWidth: 0, color: "var(--chris-text-secondary)", fontSize: 12, fontWeight: 800 };
const controlStyle = { boxSizing: "border-box", width: "100%", minWidth: 0, minHeight: 40, padding: "0 11px", border: "1px solid var(--chris-border-soft)", borderRadius: 8, background: "#0b2419", color: "var(--chris-text-main)" };
const tableWrapStyle = { overflowX: "auto", border: "1px solid var(--chris-border-gold)", borderRadius: 14, background: "linear-gradient(145deg,rgba(8,43,29,.96),rgba(3,20,13,.98))" };
const tableStyle = { width: "100%", minWidth: 1250, borderCollapse: "collapse" };
const thStyle = { padding: "12px 11px", textAlign: "left", color: "var(--chris-gold)", fontSize: 11, borderBottom: "1px solid var(--chris-border-soft)", whiteSpace: "nowrap" };
const tdStyle = { padding: "13px 11px", verticalAlign: "top", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 13 };
const mutedStyle = { marginTop: 4, color: "var(--chris-text-secondary)", fontSize: 11 };
const progressTrackStyle = { width: 92, height: 6, marginBottom: 5, overflow: "hidden", borderRadius: 99, background: "rgba(255,255,255,.1)" };
const progressFillStyle = { display: "block", height: "100%", borderRadius: 99, background: "var(--chris-green-bright)" };
const progressStyle = { color: "var(--chris-green-bright)" };
const statusStyle = { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "rgba(8,122,67,.18)", color: "#9bf0c5", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" };
const actionsStyle = { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" };
const primaryButtonStyle = { padding: "8px 10px", border: 0, borderRadius: 8, background: "linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep))", color: "#07110c", fontWeight: 900, cursor: "pointer" };
const secondaryButtonStyle = { padding: "8px 10px", border: "1px solid var(--chris-border-soft)", borderRadius: 8, background: "rgba(255,255,255,.04)", color: "var(--chris-text-main)", fontWeight: 800, cursor: "pointer" };
const paginationStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12, color: "var(--chris-text-secondary)", fontSize: 12 };
const emptyStyle = { padding: 30, textAlign: "center", color: "var(--chris-text-secondary)" };
const errorStyle = { marginBottom: 15, padding: 12, border: "1px solid rgba(239,68,68,.45)", borderRadius: 9, color: "#fecaca", background: "rgba(127,29,29,.24)" };
