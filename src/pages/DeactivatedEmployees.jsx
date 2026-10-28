import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../services/api";
import EmployeeStatusBadge from "../components/common/StatusBadge";

const nameOf = (employee) => [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
const valueOf = (value) => value?.name || "Not assigned";

export default function DeactivatedEmployees() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await apiRequest("/api/employees");
      setEmployees((result.data || []).filter((employee) => String(employee.status || "").toUpperCase() === "INACTIVE"));
    } catch (requestError) {
      setError(requestError.message || "Unable to load deactivated employees.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);
  const branches = useMemo(() => [...new Set(employees.map((employee) => valueOf(employee.location)))].sort(), [employees]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((employee) => (!branch || valueOf(employee.location) === branch) && [employee.employeeNumber, nameOf(employee), valueOf(employee.department), valueOf(employee.designation), valueOf(employee.location), employee.employmentType].join(" ").toLowerCase().includes(term));
  }, [employees, search, branch]);
  return <main style={pageStyle}>
    <header style={headerStyle}>
      <div><p style={{ margin: "0 0 6px", color: "var(--chris-dashboard-muted, #9aac9f)" }}>PEOPLE MANAGEMENT</p><h1 style={{ margin: 0 }}>Deactivated Employees</h1><p>Inactive employee records with retained profiles and employment history.</p></div>
      <div style={actionsStyle}><Link style={buttonStyle} to="/employees/directory">Employee Directory</Link><Link style={buttonStyle} to="/employees/exits">Exit Register</Link><button style={buttonStyle} onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
    </header>
    {error && <p role="alert">{error}</p>}
    <section style={panelStyle}>
      <div style={headerStyle}><div><strong>{loading ? "…" : employees.length} deactivated employee{employees.length === 1 ? "" : "s"}</strong><p>Deactivated records appear here automatically. Open a profile to review lifecycle details or use authorized HR controls.</p></div></div>
      <div style={actionsStyle}>
        <input aria-label="Search deactivated employees" placeholder="Search employee number, name, department or designation" value={search} onChange={(event) => setSearch(event.target.value)} style={{ ...inputStyle, flex: "1 1 300px" }} />
        <select aria-label="Filter by branch" style={inputStyle} value={branch} onChange={(event) => setBranch(event.target.value)}><option value="">All available branches</option>{branches.map((name) => <option key={name} value={name}>{name}</option>)}</select>
      </div>
      <p aria-live="polite">{loading ? "Loading records…" : `${filtered.length} record(s) shown`}</p>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}><thead><tr>{["Employee No", "Name", "Branch", "Department", "Designation", "Employment Type", "Status", "Profile"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>
        {!loading && !filtered.length && <tr><td colSpan={8} style={cellStyle}>No deactivated employees match this view.</td></tr>}
        {filtered.map((employee) => <tr key={employee.id || employee.employeeNumber}><td style={cellStyle}>{employee.employeeNumber}</td><td style={cellStyle}>{nameOf(employee)}</td><td style={cellStyle}>{valueOf(employee.location)}</td><td style={cellStyle}>{valueOf(employee.department)}</td><td style={cellStyle}>{valueOf(employee.designation)}</td><td style={cellStyle}>{employee.employmentType || "—"}</td><td style={cellStyle}><EmployeeStatusBadge status={employee.status} /></td><td style={cellStyle}><Link style={buttonStyle} to={`/employees/${encodeURIComponent(employee.employeeNumber)}`}>View Profile</Link></td></tr>)}
      </tbody></table></div>
    </section>
  </main>;
}
const pageStyle = { maxWidth: 1400, margin: "0 auto", padding: "24px 20px", color: "var(--chris-dashboard-text, #eef5ef)" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 20 };
const actionsStyle = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };
const panelStyle = { padding: 20, border: "1px solid var(--chris-dashboard-border, #355345)", borderRadius: 14, background: "var(--chris-dashboard-card, #11291e)" };
const inputStyle = { padding: "11px 12px", border: "1px solid var(--chris-dashboard-border, #53654e)", borderRadius: 8, background: "var(--chris-dashboard-background, #10271f)", color: "inherit", maxWidth: "100%" };
const buttonStyle = { ...inputStyle, display: "inline-block", cursor: "pointer", textDecoration: "none", font: "inherit" };
const cellStyle = { padding: "12px 10px", textAlign: "left", borderBottom: "1px solid var(--chris-dashboard-border, #355345)" };
