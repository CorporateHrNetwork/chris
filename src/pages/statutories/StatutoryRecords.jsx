import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("");
  useEffect(() => {
    let active = true;
    setRecords(null);
    setError("");
    const query = new URLSearchParams();
    if (type) query.set("obligationType", type);
    apiRequest(`/api/compliance/obligations?${query}`)
      .then(result => { if (active) setRecords(result.data); })
      .catch(error => { if (active) setError(error.message || "Unable to load statutory records."); });
    return () => { active = false; };
  }, [type]);

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
        <Link to="/statutories" style={styles.button}>Dashboard</Link>
        {Object.entries(routes).map(([key, route]) => <Link key={key} to={`/statutories/${route}`} style={styles.button}>{components[key]}</Link>)}
        <Link to="/statutories/remittances" style={styles.button}>Remittances</Link>
      </nav>
    </Panel>
    {error ? <Panel><p role="alert">{error}</p></Panel> : !records ? <Panel><p role="status">Loading statutory records…</p></Panel> : !records.length ?
      <Panel>No obligations of this type are recorded for approved payroll.</Panel> : <>
        <Panel title="Period summary">
          <label>Payroll month <select value={selectedPeriod} onChange={event => setPeriod(event.target.value)} style={styles.input}>{periods.map(value => <option key={value}>{value}</option>)}</select></label>
          <p>{rows.length} obligations · {new Set(rows.map(row => row.employeeId)).size} employees · {rows.filter(row => row.exceptionCode).length} exceptions</p>
          {[...totals].map(([currency, values]) => <p key={currency}>Liability {amount(values.liability, currency)} · Remitted {amount(values.remitted, currency)} · Outstanding {amount(values.liability - values.remitted, currency)}</p>)}
        </Panel>
        <Panel title="Employee obligations">
          <div style={styles.tableWrap}><table style={styles.table}>
            <thead><tr>{["Employee No.", "Employee", "Type", "Employee amount", "Employer amount", "Total liability", "Remitted", "Status", "Exception"].map(label => <th key={label} style={styles.th}>{label}</th>)}</tr></thead>
            <tbody>{rows.map(row => {
              const currency = row.currency || "NGN";
              const cells = [row.employee?.employeeNumber, [row.employee?.firstName, row.employee?.middleName, row.employee?.lastName].filter(Boolean).join(" "), row.obligationType, amount(row.employeeAmount, currency), amount(row.employerAmount, currency), amount(row.totalLiability, currency), amount(row.amountRemitted, currency), row.status, row.exceptionReason || row.exceptionCode];
              return <tr key={row.id}>{cells.map((value, index) => <td key={index} style={styles.td}>{value || "—"}</td>)}</tr>;
            })}</tbody>
          </table></div>
        </Panel>
      </>}
  </LeavePage>;
}
