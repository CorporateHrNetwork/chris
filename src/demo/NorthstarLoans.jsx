import { useEffect, useRef, useState } from "react";
import { apiRequest, getStoredOrganization } from "../services/api";
import DemoPolicyWorkspace from "./DemoPolicyWorkspace";
import "./NorthstarAttendance.css";

const currentMonth = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos", year: "numeric", month: "2-digit",
}).format(new Date()).slice(0, 7);

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export default function DemoLoans() {
  return getStoredOrganization()?.slug === "chris-demo-company"
    ? <NorthstarLoans />
    : <DemoPolicyWorkspace />;
}

function NorthstarLoans() {
  const [employees, setEmployees] = useState([]);
  const [loans, setLoans] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([apiRequest("/api/employees"), apiRequest("/api/loans")]).then(([roster, register]) => {
      if (!active) return;
      setEmployees((roster.data || []).filter((row) => ["ACTIVE", "PROBATION"].includes(row.status)));
      setLoans(register.data || []);
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  async function record(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    const employee = employees.find((row) => row.employeeNumber === input.employeeNumber);
    inFlight.current = true;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const { data } = await apiRequest("/api/loans/demo-record", {
        method: "POST", body: JSON.stringify(input),
      });
      setLoans((rows) => [{ ...data, employeeNumber: input.employeeNumber,
        employeeName: [employee?.firstName, employee?.middleName, employee?.lastName].filter(Boolean).join(" ") }, ...rows]);
      setMessage(`${data.loanNumber} recorded. Recalculate an eligible draft payroll to include recovery.`);
      form.reset();
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <main className="northstar-attendance">
    <header><h1>Loans</h1><p>Northstar fictional loan register</p></header>
    <section className="northstar-attendance__analytics">
      <h2>Record Loan</h2>
      <p>Record a simulated disbursement and schedule monthly payroll recovery.</p>
      <form onSubmit={record}>
        <label>Employee<select name="employeeNumber" required defaultValue="">
          <option value="">Select employee</option>
          {employees.map((row) => <option key={row.id} value={row.employeeNumber}>
            {row.employeeNumber} · {[row.firstName, row.middleName, row.lastName].filter(Boolean).join(" ")}
          </option>)}
        </select></label>
        <label>Loan purpose<input name="purpose" required maxLength={160} /></label>
        <label>Loan amount (₦)<input name="principalAmount" type="number" min="0.01" step="0.01" required /></label>
        <label>Monthly installment (₦)<input name="installmentAmount" type="number" min="0.01" step="0.01" required /></label>
        <label>Recovery start month<input name="recoveryMonth" type="month" min={currentMonth()} defaultValue={currentMonth()} required /></label>
        <button className="northstar-attendance__primary" disabled={saving || !employees.length}>{saving ? "Recording…" : "Record Loan"}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
    </section>
    <section className="northstar-attendance__analytics">
      <h2>Loan Register</h2>
      <div className="northstar-attendance__table"><table>
        <thead><tr>{["Reference", "Employee", "Purpose", "Principal", "Installment", "Outstanding", "Recovery starts", "Status"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{loans.map((row) => <tr key={row.id}>
          <td>{row.loanNumber}</td><td>{row.employeeName || row.employeeNumber}</td><td>{row.purpose}</td>
          <td>{money.format(row.principalAmount)}</td><td>{money.format(row.installmentAmount)}</td><td>{money.format(row.outstandingAmount)}</td>
          <td>{String(row.recoveryStartDate || "—").slice(0, 10)}</td><td>{row.status}</td>
        </tr>)}</tbody>
      </table></div>
      {!loans.length && <p>No loans recorded.</p>}
    </section>
  </main>;
}
