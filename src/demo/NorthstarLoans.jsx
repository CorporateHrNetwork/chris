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
  const [register, setRegister] = useState("current");
  const [search, setSearch] = useState("");
  const registerRef = useRef(null);
  const portfolio = loans.filter((row) => ["ACTIVE", "PAUSED", "COMPLETED"].includes(row.status));
  const completed = portfolio.filter((row) => row.status === "COMPLETED");
  const total = portfolio.reduce((sum, row) => sum + Number(row.principalAmount || 0), 0);
  const outstanding = portfolio.reduce((sum, row) => sum + Number(row.outstandingAmount || 0), 0);
  const recovered = Math.max(0, total - outstanding);
  const completedAmount = completed.reduce((sum, row) => sum + Number(row.principalAmount || 0), 0);
  const borrowers = new Set(portfolio.map((row) => row.employeeId || row.employeeNumber).filter(Boolean)).size;
  const percentage = (value) => total ? value / total * 100 : 0;
  const visibleLoans = (register === "completed" ? completed : register === "recovery"
    ? portfolio.filter((row) => Number(row.principalAmount) > Number(row.outstandingAmount))
    : register === "outstanding" ? portfolio.filter((row) => Number(row.outstandingAmount) > 0)
    : register === "all" ? portfolio : loans.filter((row) => row.status !== "COMPLETED"))
    .filter((row) => [row.loanNumber, row.employeeName, row.employeeNumber, row.purpose].some(
      (value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase())
    ));
  const [openMenu, setOpenMenu] = useState(null);
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState(null);
  const dialog = useRef(null);

  useEffect(() => {
    if (selected && !dialog.current.open) dialog.current.showModal();
  }, [selected]);

  async function openAction(action, loan) {
    setOpenMenu(null);
    setError("");
    setProfile(null);
    setSelected({ action, loan });
    if (action !== "Profile") return;
    try {
      const { data } = await apiRequest(`/api/loans/${encodeURIComponent(loan.id)}/profile`);
      setProfile(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveAction(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const { action, loan } = selected;
    const input = Object.fromEntries(new FormData(event.currentTarget));
    const topUp = action === "Top-up";
    const commands = { Complete: "COMPLETE_EXTERNAL", Edit: "EDIT", Pause: "PAUSE", Resume: "RESUME" };
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const { data } = await apiRequest(topUp ? "/api/loans/demo-record" : `/api/loans/${encodeURIComponent(loan.id)}/demo-action`, {
        method: "POST",
        body: JSON.stringify(topUp
          ? { ...input, parentLoanId: loan.id, employeeNumber: loan.employeeNumber }
          : { ...input, action: commands[action] }),
      });
      setLoans((rows) => topUp
        ? [{ ...data, employeeName: loan.employeeName, employeeNumber: loan.employeeNumber }, ...rows]
        : rows.map((row) => row.id === loan.id ? { ...row, ...data, employeeName: row.employeeName, employeeNumber: row.employeeNumber } : row));
      setMessage(topUp ? `Top-up ${data.loanNumber} recorded.` : `${loan.loanNumber} updated.`);
      dialog.current.close();
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

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
    <header><h1>Loans Dashboard</h1><p>Northstar fictional loan portfolio</p></header>
    <section className="northstar-attendance__metrics" aria-label="Loan portfolio metrics">
      {[
        ["Total loan", total, "all", `${borrowers} unique borrower${borrowers === 1 ? "" : "s"}`],
        ["Total recovery", recovered, "recovery", "Payroll and external settlements"],
        ["Total outstanding", outstanding, "outstanding", "Remaining principal"],
        ["Completed loans", completedAmount, "completed", `${completed.length} completed loan${completed.length === 1 ? "" : "s"}`],
      ].map(([label, amount, view, detail]) => (
        <button key={view} type="button" aria-pressed={register === view} onClick={() => {
          setRegister(view);
          setSearch("");
          registerRef.current?.scrollIntoView({ block: "start" });
        }}>
          {label}<strong>{money.format(amount)}</strong>
          <span>{percentage(amount).toFixed(1)}% of total principal · {detail}</span>
          <progress aria-label={`${label} share of total principal`} max={100} value={percentage(amount)} style={{ width: "100%" }} />
        </button>
      ))}
    </section>
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
      {error && !selected && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
    </section>
    <section ref={registerRef} className="northstar-attendance__analytics" style={{ scrollMarginTop: "5rem" }}>
      <div role="group" aria-label="Loan registers" style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <button type="button" aria-pressed={register === "current"} onClick={() => { setRegister("current"); setSearch(""); }}>Loan Register</button>
        <button type="button" aria-pressed={register === "completed"} onClick={() => { setRegister("completed"); setSearch(""); }}>Completed Loan Register</button>
      </div>
      <h2>{({ completed: "Completed Loan Register", recovery: "Loans with recoveries", outstanding: "Outstanding Loans", all: "Loan Portfolio" })[register] || "Loan Register"}</h2>
      <label>Search register<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Employee, reference or purpose" /></label>
      <div className="northstar-attendance__table"><table>
        <thead><tr>{["Reference", "Employee", "Purpose", "Principal", "Installment", "Outstanding", "Recovery starts", "Status", "Action"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{visibleLoans.map((row) => <tr key={row.id}>
          <td>{row.loanNumber}</td><td>{row.employeeName || row.employeeNumber}</td><td>{row.purpose}</td>
          <td>{money.format(row.principalAmount)}</td><td>{money.format(row.installmentAmount)}</td><td>{money.format(row.outstandingAmount)}</td>
          <td>{String(row.recoveryStartDate || "—").slice(0, 10)}</td><td>{row.status}{row.status === "PAUSED" && row.pauseResumeMonth ? <div>Resumes {String(row.pauseResumeMonth).slice(0, 7)}</div> : null}</td>
          <td>
            <button type="button" aria-label={`Actions for ${row.loanNumber}`} aria-expanded={openMenu === row.id}
              onClick={() => setOpenMenu(openMenu === row.id ? null : row.id)}>…</button>
            {openMenu === row.id && <div role="group" aria-label="Loan actions" style={{ display: "grid", gap: ".3rem", marginTop: ".3rem" }}
              onKeyDown={(event) => { if (event.key === "Escape") { setOpenMenu(null); event.currentTarget.previousElementSibling.focus(); } }}>
              {["Complete", "Edit", row.status === "PAUSED" ? "Resume" : "Pause", "Top-up", "Profile"].map((action) =>
                <button key={action} type="button" disabled={action !== "Profile" && !["ACTIVE", "PAUSED"].includes(row.status)}
                  onClick={() => openAction(action, row)}>{action}</button>)}
            </div>}
          </td>
        </tr>)}</tbody>
      </table></div>
      {!visibleLoans.length && <p>No loans match this register view.</p>}
    </section>
    <dialog ref={dialog} className="northstar-attendance__analytics" style={{ width: "min(560px, 92vw)", maxHeight: "85vh" }}
      aria-labelledby="loan-action-heading" onClose={() => { setSelected(null); setError(""); }} onCancel={(event) => { if (saving) event.preventDefault(); }}>
      {selected && <>
        <h2 id="loan-action-heading">{selected.action} · {selected.loan.loanNumber}</h2>
        <p>{selected.loan.employeeName || selected.loan.employeeNumber}</p>
        {selected.action === "Profile" ? (
          profile?.loan.id === selected.loan.id ? <>
            <dl>
              <dt>Status</dt><dd>{selected.loan.status}</dd>
              {selected.loan.pauseResumeMonth && <><dt>Recovery resumes</dt><dd>{String(selected.loan.pauseResumeMonth).slice(0, 7)}</dd></>}
              <dt>Principal</dt><dd>{money.format(profile.loan.principalAmount)}</dd>
              <dt>Outstanding</dt><dd>{money.format(profile.loan.outstandingAmount)}</dd>
              <dt>Recovered</dt><dd>{money.format(profile.loan.recoveredAmount)}</dd>
              <dt>Monthly installment</dt><dd>{money.format(profile.loan.installmentAmount)}</dd>
              <dt>Next recovery due</dt><dd>{profile.loan.nextPaymentDue || "—"}</dd>
            </dl>
            <h3>Repayment schedule</h3>
            <div className="northstar-attendance__table"><table>
              <thead><tr><th>Due date</th><th>Installment</th><th>Status</th></tr></thead>
              <tbody>{profile.amortizationSchedule.map((item, index) => <tr key={index}>
                <td>{item.dueDate}</td><td>{money.format(item.totalDeduction)}</td><td>{item.status}</td>
              </tr>)}</tbody>
            </table></div>
          </> : !error && <p role="status">Loading loan profile…</p>
        ) : <form onSubmit={saveAction}>
          {selected.action === "Complete" && <p>Record a simulated external settlement of {money.format(selected.loan.outstandingAmount)} and close this loan.</p>}
          {selected.action === "Pause" && <label>Pause duration (months)<input name="pauseMonths" type="number" min="1" max="120" step="1" defaultValue="1" required /></label>}
          {selected.action === "Pause" && <p>The current payroll month counts as the first paused month.</p>}
          {["Complete", "Pause", "Resume"].includes(selected.action) && <label>Reason or reference<input name="reason" required maxLength={240} /></label>}
          {["Edit", "Top-up"].includes(selected.action) && <>
            <label>Purpose<input name="purpose" required maxLength={160} defaultValue={selected.action === "Edit" ? selected.loan.purpose : ""} /></label>
            {selected.action === "Top-up" && <label>Additional amount (₦)<input name="principalAmount" type="number" min="0.01" step="0.01" required /></label>}
            <label>Monthly installment (₦)<input name="installmentAmount" type="number" min="0.01" step="0.01" required defaultValue={selected.action === "Edit" ? selected.loan.installmentAmount : ""} /></label>
            {selected.action === "Top-up" && <label>Recovery start month<input name="recoveryMonth" type="month" min={currentMonth()} defaultValue={currentMonth()} required /></label>}
            {selected.action === "Top-up" && <p>The top-up is recorded as a separate loan linked to this account.</p>}
          </>}
          <button className="northstar-attendance__primary" disabled={saving}>{saving ? "Saving…" : selected.action}</button>
        </form>}
        {error && <p role="alert">{error}</p>}
        <button type="button" disabled={saving} onClick={() => dialog.current.close()}>Close</button>
      </>}
    </dialog>
  </main>;
}
