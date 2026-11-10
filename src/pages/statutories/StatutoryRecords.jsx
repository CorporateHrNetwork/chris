import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import useAuthorization from "../../hooks/useAuthorization";
import { apiRequest } from "../../services/api";
import { LeavePage, Panel, styles } from "../../components/leave/LeaveUi";

const components = {
  PAYE: "PAYE / Tax",
  PENSION: "Pension Compliance",
  NHIA: "NHIA",
  NSITF: "NSITF",
  ITF: "ITF",
};
const routes = { PAYE: "paye-tax", PENSION: "pension-compliance", NHIA: "nhia", NSITF: "nsitf", ITF: "itf" };
const amount = (value, currency) => new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(Number(value || 0));

export default function StatutoryRecords({ type, title }) {
  const { profile } = useAuthorization();
  const branchId = profile?.activeLocationId;
  const linkStyle = ({ isActive }) => ({ ...(isActive ? styles.primary : styles.button), textDecoration: "none" });
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("");
  useEffect(() => {
    let active = true;
    setRecords(null);
    setError("");
    const query = new URLSearchParams();
    if (type) query.set("obligationType", type === "NSITF" ? "NSITF_ECS" : type);
    apiRequest(`/api/compliance/obligations?${query}`)
      .then(result => { if (active) setRecords(result.data); })
      .catch(error => { if (active) setError(error.message || "Unable to load statutory records."); });
    return () => { active = false; };
  }, [type, branchId]);

  const monthOf = row => `${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`;
  const periods = [...new Set((records || []).map(monthOf))];
  const selectedPeriod = periods.includes(period) ? period : periods[0];
  const rows = (records || []).filter(row => monthOf(row) === selectedPeriod);
  const totals = new Map();
  for (const row of rows) {
    const currency = row.currency || "NGN";
    const group = totals.get(currency) || { liability: 0, remitted: 0 };
    group.liability += Number(row.totalLiability || 0);
    group.remitted += Number(row.amountRemitted || 0);
    totals.set(currency, group);
  }

  return <LeavePage title={title || components[type] || "Statutory Dashboard"} description="Statutory obligations recorded for approved payroll and their remittance status.">
    <Panel>
      <nav aria-label="Statutory reports" style={styles.actions}>
        <NavLink end to="/statutories" style={linkStyle}>Dashboard</NavLink>
        {Object.entries(routes).map(([key, route]) => <NavLink key={key} to={`/statutories/${route}`} style={linkStyle}>{components[key]}</NavLink>)}
        <NavLink to="/statutories/reports" style={linkStyle}>Statutory Reports</NavLink>
        <NavLink to="/statutories/remittances" style={linkStyle}>Remittances</NavLink>
      </nav>
    </Panel>
    {branchId && <p>Branch reporting uses employees’ current branch.</p>}
    {error ? <Panel><p role="alert">{error}</p></Panel> : !records ? <Panel><p role="status">Loading statutory records…</p></Panel> : !records.length ?
      <Panel>No obligations of this type are recorded for approved payroll.</Panel> : <>
        <Panel title="Period summary">
          <label>Payroll month <select value={selectedPeriod} onChange={event => setPeriod(event.target.value)} style={styles.input}>{periods.map(value => <option key={value}>{value}</option>)}</select></label>
          <div style={{ ...styles.actions, marginBlock: 12 }}>
            {[["Obligations", rows.length], ["Employees", new Set(rows.map(row => row.employeeId)).size], ["Exceptions", rows.filter(row => row.exceptionCode).length]].map(([label, value]) => <div key={label} style={styles.notice}>{label} <strong>{value}</strong></div>)}
          </div>
          {!type && <div style={styles.actions}>{Object.entries(components).map(([key, label]) => <div key={key} style={styles.notice}>{label} <strong>{rows.filter(row => row.obligationType === (key === "NSITF" ? "NSITF_ECS" : key)).length}</strong></div>)}</div>}
          {[...totals].map(([currency, values]) => <p key={currency}>Liability {amount(values.liability, currency)} · Remitted {amount(values.remitted, currency)} · Outstanding {amount(values.liability - values.remitted, currency)}</p>)}
        </Panel>
        <Panel title="Employee obligations">
          <div style={styles.tableWrap}><table style={styles.table}>
            <thead><tr>{["Employee No.", "Employee", "Type", "Employee amount", ...(type === "PAYE" ? [] : ["Employer amount"]), "Total liability", "Remitted", "Status", "Exception"].map(label => <th key={label} style={styles.th}>{label}</th>)}</tr></thead>
            <tbody>{rows.map(row => {
              const currency = row.currency || "NGN";
              const cells = [row.employee?.employeeNumber, [row.employee?.firstName, row.employee?.middleName, row.employee?.lastName].filter(Boolean).join(" "), row.obligationType, amount(row.employeeAmount, currency), ...(type === "PAYE" ? [] : [amount(row.employerAmount, currency)]), amount(row.totalLiability, currency), amount(row.amountRemitted, currency), row.status, row.exceptionReason || row.exceptionCode];
              return <tr key={row.id}>{cells.map((value, index) => <td key={index} style={styles.td}>{value || "—"}</td>)}</tr>;
            })}</tbody>
          </table></div>
        </Panel>
      </>}
  </LeavePage>;
}
