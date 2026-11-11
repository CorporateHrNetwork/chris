import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest, getStoredOrganization } from "../services/api";
import DemoPolicyWorkspace from "./DemoPolicyWorkspace";
import "./NorthstarAttendance.css";

const endpoint = "/api/payroll/salary-advances";
const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
const dateOnly = (value) => String(value || "").slice(0, 10);
const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const recoveredAmount = (row) => Math.max(0, row.amount - row.outstandingAmount);

export default function DemoSalaryAdvances() {
  return getStoredOrganization()?.slug === "chris-demo-company"
    ? <NorthstarSalaryAdvances />
    : <DemoPolicyWorkspace />;
}

function NorthstarSalaryAdvances() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [month, setMonth] = useState("");
  const [view, setView] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const formSection = useRef(null);
  const registerSection = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest(endpoint),
      apiRequest(endpoint + "/control-capabilities"),
      apiRequest("/api/employees"),
    ]).then(([register, permissions, roster]) => {
      if (!active) return;
      setRows(register.data || []);
      setCanEdit(Boolean(permissions.data?.canEdit));
      setEmployees((roster.data || []).filter((row) =>
        ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"].includes(row.status)
      ));
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const monthly = rows.filter((row) => !month || dateOnly(row.issuedDate).slice(0, 7) === month);
  const portfolio = monthly.filter((row) => row.status !== "CANCELLED");
  const recovered = portfolio.filter((row) => recoveredAmount(row) > 0);
  const outstanding = portfolio.filter((row) => row.outstandingAmount > 0);
  const completed = portfolio.filter((row) => row.status === "COMPLETED");
  const total = portfolio.reduce((sum, row) => sum + row.amount, 0);
  const recipients = new Set(portfolio.map((row) => row.employeeId)).size;
  const metrics = [
    ["Total granted", total, "all", `${recipients} employee(s)`],
    ["Total recovered", recovered.reduce((sum, row) => sum + recoveredAmount(row), 0), "recovered", "Posted payroll deductions"],
    ["Total outstanding", outstanding.reduce((sum, row) => sum + row.outstandingAmount, 0), "outstanding", `${outstanding.length} outstanding`],
    ["Completed advances", completed.reduce((sum, row) => sum + row.amount, 0), "completed", `${completed.length} completed`],
  ];
  const registers = { all: monthly, recovered, outstanding, completed };

  async function save(event) {
    event.preventDefault();
    if (saving.current) return;
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data } = await apiRequest(editing ? `${endpoint}/${encodeURIComponent(editing.id)}` : endpoint, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(input),
      });
      setRows((previous) => editing
        ? previous.map((row) => row.id === data.id ? data : row)
        : [data, ...previous]);
      setMonth(dateOnly(data.issuedDate).slice(0, 7));
      setView("all");
      setNotice(`Advance ${editing ? "updated" : "recorded"}. Calculate payroll for ${dateOnly(data.issuedDate).slice(0, 7)} to apply the full deduction.`);
      if (editing) setEditing(null);
      else form.reset();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <main className="northstar-attendance">
    <header>
      <h1>Salary Advances Dashboard</h1>
      <p>Each advance is recovered in one deduction from the payroll for its grant month.</p>
      <Link to="/payroll?workspace=execute">Open Payroll Execution</Link>
    </header>
    <section className="northstar-attendance__analytics" aria-label="Dashboard filters">
      <label>Grant month <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      {month && <button type="button" onClick={() => setMonth("")}>All months</button>}
    </section>
    <section className="northstar-attendance__metrics" aria-label="Salary advance metrics">
      {metrics.map(([label, amount, key, detail]) => (
        <button key={key} type="button" aria-pressed={view === key} onClick={() => {
          setView(key);
          registerSection.current?.scrollIntoView({ block: "start" });
        }}>
          {label}
          <strong>{loading ? "—" : money.format(amount)}</strong>
          <span>{(total ? amount / total * 100 : 0).toFixed(1)}% of grants · {detail}</span>
        </button>
      ))}
    </section>
    {canEdit && <section className="northstar-attendance__analytics" ref={formSection}>
      <h2>{editing ? "Edit Salary Advance" : "Record Salary Advance"}</h2>
      <form key={editing?.id || "new"} onSubmit={save}>
        {editing ? <p>{editing.employeeNumber} · {editing.employeeName}</p> :
          <label>Employee<select name="employeeNumber" required defaultValue="">
            <option value="">Select employee</option>
            {employees.map((row) => <option key={row.id} value={row.employeeNumber}>
              {row.employeeNumber} · {[row.firstName, row.middleName, row.lastName].filter(Boolean).join(" ")}
            </option>)}
          </select></label>}
        <label>Advance amount (₦)<input name="amount" type="number" min="0.01" step="0.01" defaultValue={editing?.amount} required /></label>
        <label>Grant date<input name="issuedDate" type="date" defaultValue={editing ? dateOnly(editing.issuedDate) : today()} required /></label>
        <label>Reason<input name="reason" maxLength="250" defaultValue={editing?.reason || ""} /></label>
        <button className="northstar-attendance__primary" disabled={busy || (!editing && !employees.length)}>
          {busy ? "Saving…" : editing ? "Save Changes" : "Record Salary Advance"}
        </button>
        {editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setError(""); }}>Cancel Edit</button>}
      </form>
    </section>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <section className="northstar-attendance__analytics" ref={registerSection}>
      <h2>{view === "all" ? "Salary Advance Register" : metrics.find((metric) => metric[2] === view)[0]}</h2>
      <div className="northstar-attendance__table">
        <table>
          <thead><tr>{["Employee", "Grant Date", "Payroll Month", "Advance", "Recovered", "Outstanding", "Status", "Reason", "Action"].map((label) =>
            <th key={label} scope="col">{label}</th>
          )}</tr></thead>
          <tbody>
            {registers[view].map((row) => <tr key={row.id}>
              <td>{row.employeeNumber} · {row.employeeName}</td><td>{dateOnly(row.issuedDate)}</td>
              <td>{dateOnly(row.issuedDate).slice(0, 7)}</td><td>{money.format(row.amount)}</td>
              <td>{money.format(recoveredAmount(row))}</td><td>{money.format(row.outstandingAmount)}</td>
              <td>{row.status === "ACTIVE" ? "Scheduled" : row.status}</td><td>{row.reason || "—"}</td>
              <td>{canEdit && row.status === "ACTIVE" && !recoveredAmount(row) ? <button type="button" disabled={busy} onClick={() => {
                setEditing(row);
                setError("");
                setNotice("");
                formSection.current?.scrollIntoView({ block: "start" });
              }}>Edit</button> : "—"}</td>
            </tr>)}
            {!registers[view].length && <tr><td colSpan={9}>{loading ? "Loading salary advances…" : "No salary advances in this view."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </main>;
}
