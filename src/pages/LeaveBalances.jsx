import { useEffect, useMemo, useState } from "react";
import { apiRequest, getStoredOrganization } from "../services/api";
import { LeavePage, Notice, Panel, Table, employeeName, styles } from "../components/leave/LeaveUi";
import { exportLedgerCsv, exportLedgerPdf, exportLedgerXlsx, printLedgerReport } from "../utils/leaveLedgerExports";
import chrisLogo from "../assets/images/chris-logo.png";
import "./LeaveBalances.css";

const currentYear = new Date().getFullYear();
const employeeLabel = (employee) => `${employee.employeeNumber} · ${employeeName(employee)} · ${employee.department?.name || "No department"} · ${employee.designation?.name || "No designation"}`;

export default function LeaveBalances() {
  const [year, setYear] = useState(currentYear);
  const [employees, setEmployees] = useState([]);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [register, setRegister] = useState([]);
  const [reportOrganization, setReportOrganization] = useState(() => getStoredOrganization() || {});

  useEffect(() => {
    apiRequest("/api/employees")
      .then((response) => setEmployees(Array.isArray(response.data) ? response.data : response.data?.employees || []))
      .catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    apiRequest("/api/organization/profile")
      .then((response) => setReportOrganization(response.data?.organization || response.data || {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPolicyId("");
    setData(null);
    if (!employeeNumber) return;
    setLoading(true);
    setError("");
    apiRequest(`/api/leave/employees/${employeeNumber}/ledger?leaveYear=${year}`)
      .then((response) => setData(response.data))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [employeeNumber, year]);

  useEffect(() => {
    if (!employeeNumber || !policyId) {
      setData((current) => current ? { ...current, ledger: null } : current);
      return;
    }
    setLoading(true);
    setError("");
    apiRequest(`/api/leave/employees/${employeeNumber}/ledger?leaveYear=${year}&leavePolicyId=${policyId}`)
      .then((response) => setData(response.data))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [employeeNumber, policyId, year]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return employees.filter((employee) => query && `${employee.employeeNumber} ${employeeName(employee)} ${employee.firstName || ""} ${employee.lastName || ""}`.toLowerCase().includes(query)).slice(0, 10);
  }, [employees, search]);
  const selectedEmployee = employees.find((employee) => employee.employeeNumber === employeeNumber);
  const selectOptions = search.trim() ? filtered : employees.slice(0, 30);
  const employeeOptions = selectedEmployee && !selectOptions.some((employee) => employee.id === selectedEmployee.id) ? [selectedEmployee, ...selectOptions] : selectOptions;

  function chooseEmployee(employee) {
    setEmployeeNumber(employee.employeeNumber);
    setSearch("");
    setSearchOpen(false);
    setActiveSuggestion(0);
  }

  function searchKeyDown(event) {
    if (!searchOpen || !search.trim()) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveSuggestion((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0))); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveSuggestion((index) => Math.max(index - 1, 0)); }
    else if (event.key === "Enter" && filtered[activeSuggestion]) { event.preventDefault(); chooseEmployee(filtered[activeSuggestion]); }
    else if (event.key === "Escape") setSearchOpen(false);
  }

  async function toggleRegister() {
    if (!showRegister && !register.length) {
      try { const response = await apiRequest(`/api/leave/balance-register?leaveYear=${year}`); setRegister(response.data || []); }
      catch (requestError) { setError(requestError.message); return; }
    }
    setShowRegister((visible) => !visible);
  }

  const ledger = data?.ledger;
  const organization = reportOrganization;
  const report = ledger ? {
    organizationName: organization.legalName || organization.name || "CHRIS",
    logoUrl: organization.logoUrl || "",
    chrisLogo,
    employeeNumber: data.employee.employeeNumber,
    employeeFullName: employeeName(data.employee),
    department: data.employee.department?.name || "—",
    designation: data.employee.designation?.name || "—",
    employmentLevel: data.employmentLevel?.name || "—",
    leaveYear: ledger.leaveYear,
    leaveType: ledger.policy.leaveType?.name || "—",
    policyName: ledger.policy.name,
    policyVersion: ledger.policyVersion,
    unit: String(ledger.unit || "units").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
    entitlement: ledger.totalEntitlement,
    opening: ledger.baseEntitlement,
    accrued: ledger.accrued,
    carryover: ledger.carryover,
    adjustments: ledger.adjustments,
    used: ledger.used,
    pending: ledger.pending,
    available: ledger.available,
    generatedAt: new Date().toLocaleString(),
  } : null;
  const reportRows = report ? [["Organization", report.organizationName], ["Report", "Employee Leave Ledger"], ["Employee Number", report.employeeNumber], ["Employee Name", report.employeeFullName], ["Department", report.department], ["Designation", report.designation], ["Employment Level", report.employmentLevel], ["Leave Year", report.leaveYear], ["Leave Type", report.leaveType], ["Governing Policy", `${report.policyName} v${report.policyVersion}`], ["Unit", report.unit], ["Entitlement", report.entitlement], ["Opening", report.opening], ["Accrued", report.accrued], ["Carryover", report.carryover], ["Adjustments", report.adjustments], ["Used", report.used], ["Committed / Pending", report.pending], ["Available", report.available], ["Generated At", report.generatedAt]] : [];

  const actions = <><button style={styles.button} onClick={toggleRegister}>{showRegister ? "Hide" : "View"} Organization Register</button>{ledger && <><button style={styles.button} onClick={() => printLedgerReport(report)}>Print</button><details className="leave-ledger-export"><summary style={styles.primary}>Export ▾</summary><div className="leave-ledger-export-menu"><button type="button" onClick={() => exportLedgerXlsx(report, reportRows)}>Excel (.xlsx)</button><button type="button" onClick={() => exportLedgerPdf(report)}>PDF</button><button type="button" onClick={() => exportLedgerCsv(report, reportRows)}>CSV</button></div></details></>}</>;

  return <LeavePage title="Employee Leave Ledger" description="Authoritative employee + policy leave projection. Committed means PENDING only." actions={actions}>
    {error && <Notice error>{error}</Notice>}
    <Panel title="Select employee and governing policy"><div className="leave-ledger-selectors">
      <label className="leave-ledger-field">Leave Year<input className="leave-ledger-control" style={styles.input} type="number" value={year} onChange={(event) => setYear(Number(event.target.value))}/></label>
      <label className="leave-ledger-field leave-ledger-search">Search Employee<input className="leave-ledger-control" style={styles.input} value={search} onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); setActiveSuggestion(0); }} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 120)} onKeyDown={searchKeyDown} placeholder="Number, first name, surname or full name" role="combobox" aria-autocomplete="list" aria-expanded={searchOpen && Boolean(search.trim())} aria-controls="leave-ledger-employee-suggestions"/>{searchOpen && search.trim() && <div id="leave-ledger-employee-suggestions" className="leave-ledger-suggestions" role="listbox">{filtered.length ? filtered.map((employee, index) => <button type="button" role="option" aria-selected={index === activeSuggestion} className={`leave-ledger-suggestion${index === activeSuggestion ? " is-active" : ""}`} key={employee.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseEmployee(employee)}><strong>{employee.employeeNumber} — {employeeName(employee)}</strong><span>{employee.designation?.name || "No designation"}{employee.department?.name ? ` · ${employee.department.name}` : ""}</span></button>) : <div className="leave-ledger-no-results">No matching employees found.</div>}</div>}</label>
      <label className="leave-ledger-field">Employee<select className="leave-ledger-control" style={styles.input} value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)}><option value="">Select employee</option>{employeeOptions.map((employee) => <option key={employee.id} value={employee.employeeNumber}>{employeeLabel(employee)}</option>)}</select></label>
      <label className="leave-ledger-field">Leave Policy<select className="leave-ledger-control" style={styles.input} value={policyId} onChange={(event) => setPolicyId(event.target.value)} disabled={!data?.policies?.length}><option value="">Select active policy</option>{(data?.policies || []).map((policy) => <option key={policy.id} value={policy.id}>{policy.leaveType?.name} · {policy.name} v{policy.versionNumber}</option>)}</select></label>
    </div>{data?.employee && <p style={styles.muted}>{employeeLabel(data.employee)} · {data.employmentLevel?.name || "Level not mapped"}</p>}</Panel>
    {loading ? <Panel>Loading authoritative leave ledger...</Panel> : ledger ? <Ledger data={data}/> : <Panel>Select an employee and active tenant policy to view the ledger.</Panel>}
    {showRegister && <Panel title="Organization-wide register" subtitle="Reporting view; the employee ledger above is the primary operational workflow."><Table rows={register} empty="No balances found." columns={[{key:"employee",label:"Employee",render:(row)=>`${row.employee?.employeeNumber} · ${row.employeeName}`},{key:"policy",label:"Policy",render:(row)=>row.policy?.name||row.leaveType?.name},{key:"entitlement",label:"Entitlement"},{key:"used",label:"Used"},{key:"pendingAllocation",label:"Committed"},{key:"available",label:"Available"}]}/></Panel>}
  </LeavePage>;
}
function Ledger({data}){const ledger=data.ledger;const rows=[["Employee",`${data.employee.employeeNumber} · ${employeeName(data.employee)}`],["Leave Year",ledger.leaveYear],["Leave Type",ledger.policy.leaveType?.name],["Policy / Version",`${ledger.policy.name} · v${ledger.policyVersion}`],["Policy Unit",ledger.unit],["Entitlement",ledger.totalEntitlement],["Opening",ledger.baseEntitlement],["Accrued",ledger.accrued],["Carryover",ledger.carryover],["Adjustments",ledger.adjustments],["Used",ledger.used],["Committed / Pending",ledger.pending],["Available",ledger.available],["Maximum Requestable",ledger.maximumRequestable],["Allocation Source",ledger.allocation?.source||"Authoritative policy balance"],["Effective Policy",`${new Date(ledger.policy.effectiveFrom).toLocaleDateString()} — ${ledger.policy.effectiveTo?new Date(ledger.policy.effectiveTo).toLocaleDateString():"Open"}`]];return <Panel title="Read-only Leave Ledger" subtitle="Values come from the same authoritative balance projection used by Leave Requests and Employee Leave Profile."><div style={ledgerGrid}>{rows.map(([key,value])=><div key={key} style={metric}><span style={styles.muted}>{key}</span><strong>{value??"—"}</strong></div>)}</div></Panel>}
const ledgerGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10},metric={display:"grid",gap:5,padding:12,border:"1px solid var(--chris-border-soft)",borderRadius:10,background:"rgba(255,255,255,.025)"};
