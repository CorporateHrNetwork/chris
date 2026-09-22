import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmployeeSearchSelect from "../../components/EmployeeSearchSelect";
import { apiRequest } from "../../services/api";

const MAX_REPAYMENT_MONTHS = 600;
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const money = (value) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const emptyForm = () => ({
  employeeNumber: "",
  amount: "",
  installmentAmount: "",
  gmApprovalDate: today(),
  issuedDate: today(),
  recoveryStartMonth: currentMonth(),
  gmApprovalReference: "",
  accountsPaymentReference: "",
  reason: "",
});

function addMonths(month, offset) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return "";
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= MAX_REPAYMENT_MONTHS) return "";
  const [year, monthNumber] = month.split("-").map(Number);
  const timestamp = Date.UTC(year, monthNumber - 1 + offset, 1);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toISOString().slice(0, 7);
  } catch {
    return "";
  }
}

function repaymentPlan(balanceValue, installmentValue, startMonth) {
  const balance = Number(balanceValue);
  const installment = Number(installmentValue);
  if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(installment) || installment <= 0 || !/^\d{4}-\d{2}$/.test(startMonth || "")) return null;
  const installmentCount = Math.ceil(balance / installment);
  if (!Number.isSafeInteger(installmentCount) || installmentCount < 1 || installmentCount > MAX_REPAYMENT_MONTHS) {
    return { invalidReason: `The installment is too small for this balance. Increase it so recovery completes within ${MAX_REPAYMENT_MONTHS} months.` };
  }
  const endMonth = addMonths(startMonth, installmentCount - 1);
  if (!endMonth) return { invalidReason: "CHRiS could not calculate a safe repayment end month. Review the installment and recovery start month." };
  const finalInstallment = Math.round((balance - installment * Math.max(0, installmentCount - 1)) * 100) / 100;
  return {
    installmentCount,
    startMonth,
    endMonth,
    finalInstallment: finalInstallment || installment,
  };
}

export default function SalaryAdvancesManaged() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [capabilities, setCapabilities] = useState({ canEdit: false, canCancelDelete: false, isBranchHr: false, isHeadHr: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [result, capabilityResult] = await Promise.all([
        apiRequest("/api/payroll/salary-advances"),
        apiRequest("/api/payroll/salary-advances/control-capabilities").catch(() => ({ data: { canEdit: false, canCancelDelete: false } })),
      ]);
      setRows(result?.data || []);
      setCapabilities(capabilityResult?.data || { canEdit: false, canCancelDelete: false });
      setError("");
    } catch (requestError) {
      setError(requestError?.message || "Unable to load salary advances.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const recoveredAmount = useMemo(
    () => editing ? Math.max(0, Number(editing.amount || 0) - Number(editing.outstandingAmount || 0)) : 0,
    [editing]
  );
  const historyLocked = Boolean(editing && (recoveredAmount > 0 || editing.status === "COMPLETED"));
  const scheduleBalance = editing ? Math.max(0, Number(editing.outstandingAmount || 0)) : Math.max(0, Number(form.amount || 0));
  const plan = repaymentPlan(scheduleBalance, form.installmentAmount, form.recoveryStartMonth);
  const validPlan = Boolean(plan && !plan.invalidReason);

  const setField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setError("");
    setMessage("");
  };

  const setEmployee = (employeeNumber) => {
    setForm((current) => ({ ...current, employeeNumber }));
    setError("");
    setMessage("");
  };

  const reset = () => {
    setEditing(null);
    setForm(emptyForm());
    setError("");
    setMessage("");
  };

  const startEdit = (row) => {
    setEditing(row);
    setForm({
      employeeNumber: row.employeeNumber,
      amount: String(row.amount ?? ""),
      installmentAmount: String(row.installmentAmount ?? ""),
      gmApprovalDate: row.issuedDate || today(),
      issuedDate: row.issuedDate || today(),
      recoveryStartMonth: String(row.recoveryStartDate || today()).slice(0, 7),
      gmApprovalReference: "",
      accountsPaymentReference: "",
      reason: row.reason || "",
    });
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (event) => {
    event.preventDefault();
    if (!validPlan) {
      setError(plan?.invalidReason || "Enter a valid amount, installment and payroll recovery month.");
      return;
    }
    try {
      setBusy(editing ? `edit-${editing.id}` : "create");
      setError("");
      setMessage("");
      const payload = {
        employeeNumber: form.employeeNumber,
        amount: form.amount,
        approvedAmount: form.amount,
        installmentAmount: form.installmentAmount,
        gmApprovalDate: form.gmApprovalDate,
        issuedDate: form.issuedDate,
        recoveryStartDate: `${form.recoveryStartMonth}-01`,
        gmApprovalReference: form.gmApprovalReference,
        accountsPaymentReference: form.accountsPaymentReference,
        reason: form.reason,
      };
      if (editing) {
        await apiRequest(`/api/payroll/salary-advances/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            employeeNumber: payload.employeeNumber,
            amount: payload.amount,
            installmentAmount: payload.installmentAmount,
            issuedDate: payload.issuedDate,
            recoveryStartDate: payload.recoveryStartDate,
            reason: payload.reason,
          }),
        });
        setMessage("Salary advance changes saved. Existing posted payroll recovery history was preserved.");
      } else {
        await apiRequest("/api/payroll/salary-advances", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("GM-approved salary advance recorded as already paid outside CHRiS and activated for payroll recovery.");
      }
      setEditing(null);
      setForm(emptyForm());
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to save salary advance.");
    } finally {
      setBusy("");
    }
  };

  const cancelAdvance = async (row) => {
    const reason = window.prompt(`Reason for cancelling the salary advance for ${row.employeeNumber} — ${row.employeeName}:`);
    if (!reason) return;
    if (!window.confirm("Cancel this salary advance? Existing financial history will be preserved and no future recovery should be scheduled.")) return;
    try {
      setBusy(`cancel-${row.id}`);
      setError("");
      await apiRequest(`/api/payroll/salary-advances/${row.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setMessage("Salary advance cancelled. Historical recoveries, if any, were preserved and draft payrolls were marked for recalculation.");
      if (editing?.id === row.id) reset();
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to cancel salary advance.");
    } finally {
      setBusy("");
    }
  };

  const deleteAdvance = async (row) => {
    const recovered = Math.max(0, Number(row.amount || 0) - Number(row.outstandingAmount || 0));
    if (recovered > 0 || row.status === "COMPLETED") {
      setError("This advance has financial history and cannot be deleted. Use Cancel instead so the audit and recovery history remain intact.");
      return;
    }
    const reason = window.prompt(`Reason for permanently deleting the unused salary advance for ${row.employeeNumber} — ${row.employeeName}:`);
    if (!reason) return;
    if (!window.confirm("Permanently delete this unused salary advance? This action removes the operational record but keeps an audit entry.")) return;
    try {
      setBusy(`delete-${row.id}`);
      setError("");
      await apiRequest(`/api/payroll/salary-advances/${row.id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      });
      setMessage("Unused salary advance deleted. The deletion remains auditable and draft payrolls were marked for recalculation.");
      if (editing?.id === row.id) reset();
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to delete salary advance.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>PAYROLL OPERATIONS</div>
      <h1 style={titleStyle}>Salary Advances</h1>
      <p style={leadStyle}>ZERMATT salary advances are approved manually by the GM and paid outside CHRiS by Accounts. Branch HR & Admin Officers record and edit employees in their assigned branch; Head HR manages the organization-wide register. CHRiS then recovers the recorded advance through payroll.</p>
      <div style={policyNotice}><strong>Control:</strong> CHRiS does not approve or pay the salary advance. Recording confirms that external GM approval and Accounts payment have already occurred. Branch entries use the same authoritative records displayed at HEAD OFFICE.</div>
      {capabilities.canCancelDelete && <div style={headHrNotice}>Head HR correction/delete control is available for unused records and future recovery cancellation. Financial history remains immutable and every change is audited.</div>}

      <Panel title={editing ? `Edit Salary Advance · ${editing.employeeNumber}` : "Record Approved & Paid Salary Advance"}>
        {editing && <p style={controlNote}>{historyLocked ? `This advance has ${money(recoveredAmount)} in posted payroll recovery. Employee, original amount and payment date are locked; future installment and recovery start may be adjusted without rewriting history.` : "No posted payroll recovery exists. Permitted record details may still be corrected."}</p>}
        <form style={formGrid} onSubmit={save}>
          <EmployeeSearchSelect label="Employee" value={form.employeeNumber} onChange={setEmployee} disabled={historyLocked || Boolean(editing)} required placeholder="Search employee number or name" />
          <Input type="number" label="Amount Approved by GM" value={form.amount} onChange={setField("amount")} min="0.01" step="0.01" disabled={historyLocked} required />
          <Input type="number" label="Monthly Installment" value={form.installmentAmount} onChange={setField("installmentAmount")} min="0.01" step="0.01" required />
          {!editing && <Input type="date" label="GM Approval Date" value={form.gmApprovalDate} onChange={setField("gmApprovalDate")} required />}
          <Input type="date" label="External Accounts Payment Date" value={form.issuedDate} onChange={setField("issuedDate")} disabled={historyLocked} required />
          <Input type="month" label="Payroll Recovery Start Month" value={form.recoveryStartMonth} onChange={setField("recoveryStartMonth")} required />
          {!editing && <Input label="GM Approval Reference" value={form.gmApprovalReference} onChange={setField("gmApprovalReference")} placeholder="Optional approval/minute reference" />}
          {!editing && <Input label="Accounts Payment Reference" value={form.accountsPaymentReference} onChange={setField("accountsPaymentReference")} placeholder="Optional transfer/payment reference" />}
          <Input label="Reason / Notes" value={form.reason} onChange={setField("reason")} />

          {plan?.invalidReason && <div role="alert" style={{ ...scheduleCard, gridColumn: "1 / -1", borderColor: "rgba(248,113,113,.6)", color: "#FCA5A5" }}><strong>{plan.invalidReason}</strong></div>}
          {validPlan && <div style={{ ...scheduleCard, gridColumn: "1 / -1" }}>
            <strong>Payroll Recovery Schedule</strong>
            <div style={scheduleGrid}>
              <span>Balance: <strong>{money(scheduleBalance)}</strong></span>
              <span>Installment: <strong>{money(form.installmentAmount)}</strong></span>
              <span>Installments: <strong>{plan.installmentCount}</strong></span>
              <span>From: <strong>{plan.startMonth}</strong></span>
              <span>To: <strong>{plan.endMonth}</strong></span>
              <span>Final installment: <strong>{money(plan.finalInstallment)}</strong></span>
            </div>
          </div>}

          <div style={buttonRow}>
            <button style={primaryButton} disabled={Boolean(busy) || !form.employeeNumber || !validPlan}>{busy ? "Saving…" : editing ? "Save Changes" : "Record Approved & Paid Advance"}</button>
            {editing && <button type="button" style={secondaryButton} onClick={reset} disabled={Boolean(busy)}>Cancel Edit</button>}
          </div>
        </form>
      </Panel>

      {error && <Feedback>{error}</Feedback>}
      {message && <div style={successStyle}>{message}</div>}

      <Panel title="Salary Advance Register">
        <div style={tableWrap}>
          <table style={tableStyle}>
            <thead><tr>{["Employee", "Name", "Approved/Paid Advance", "Recovered", "Outstanding", "Installment", "Recovery Start", "Status", "Action"].map((head) => <th key={head} style={thStyle}>{head}</th>)}</tr></thead>
            <tbody>
              {!loading && rows.length === 0 && <tr><td colSpan="9" style={tdStyle}>No salary advances have been recorded.</td></tr>}
              {rows.map((row) => {
                const recovered = Math.max(0, Number(row.amount || 0) - Number(row.outstandingAmount || 0));
                const editable = capabilities.canEdit && !["COMPLETED", "CANCELLED"].includes(row.status);
                const cancellable = capabilities.canCancelDelete && ["ACTIVE", "PAUSED"].includes(row.status);
                const deletable = capabilities.canCancelDelete && recovered <= 0 && row.status !== "COMPLETED";
                return <tr key={row.id}>
                  <Td strong>{row.employeeNumber}</Td><Td>{row.employeeName}</Td><Td>{money(row.amount)}</Td><Td>{money(recovered)}</Td><Td>{money(row.outstandingAmount)}</Td><Td>{money(row.installmentAmount)}</Td><Td>{row.recoveryStartDate}</Td><Td><Badge>{row.status}</Badge></Td>
                  <Td><div style={actionRow}>{editable ? <button type="button" style={smallButton} onClick={() => startEdit(row)}>Edit</button> : <span style={mutedStyle}>Historical</span>}{cancellable && <button type="button" style={warningButton} disabled={Boolean(busy)} onClick={() => cancelAdvance(row)}>{busy === `cancel-${row.id}` ? "Cancelling…" : "Cancel"}</button>}{deletable && <button type="button" style={dangerButton} disabled={Boolean(busy)} onClick={() => deleteAdvance(row)}>{busy === `delete-${row.id}` ? "Deleting…" : "Delete"}</button>}</div></Td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

function Panel({ title, children }) { return <section style={panelStyle}><h2 style={panelTitle}>{title}</h2>{children}</section>; }
function Feedback({ children }) { return <div role="alert" style={errorStyle}>{children}</div>; }
function Input({ label, value, onChange, type = "text", ...props }) { return <label style={fieldLabel}><span>{label}</span><input type={type} value={value} onChange={onChange} style={{ ...inputStyle, ...(props.disabled ? disabledStyle : {}) }} {...props} /></label>; }
function Td({ children, strong = false }) { return <td style={{ ...tdStyle, ...(strong ? { fontWeight: 900, color: "#F7FAF8" } : {}) }}>{children}</td>; }
function Badge({ children }) { return <span style={badgeStyle}>{children || "—"}</span>; }

const pageStyle = { maxWidth: 1500, margin: "0 auto", color: "#F7FAF8" };
const backButton = { border: 0, background: "transparent", color: "#D4AF37", fontWeight: 900, cursor: "pointer", padding: "0 0 14px" };
const eyebrow = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle = { margin: "6px 0", fontSize: 32 };
const leadStyle = { color: "#C7D3CC", lineHeight: 1.65, maxWidth: 1050, marginBottom: 14 };
const policyNotice = { padding: 13, marginBottom: 12, borderRadius: 10, border: "1px solid rgba(212,175,55,.5)", background: "rgba(212,175,55,.08)", color: "#F7FAF8", lineHeight: 1.55 };
const headHrNotice = { padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid rgba(134,239,172,.35)", color: "#BBF7D0" };
const controlNote = { color: "#C7D3CC", lineHeight: 1.55, marginTop: 0 };
const panelStyle = { marginTop: 18, padding: 20, border: "1px solid rgba(212,175,55,.45)", borderRadius: 15, background: "linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96))", boxShadow: "0 15px 38px rgba(0,0,0,.24)" };
const panelTitle = { margin: "0 0 15px", fontSize: 18, color: "#D4AF37" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, alignItems: "end" };
const fieldLabel = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800, minWidth: 200 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8", outline: "none" };
const disabledStyle = { opacity: .68, cursor: "not-allowed" };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)" };
const smallButton = { ...secondaryButton, padding: "6px 10px", fontSize: 11 };
const warningButton = { ...smallButton, color: "#F8D56B", border: "1px solid rgba(248,213,107,.65)" };
const dangerButton = { ...smallButton, color: "#FCA5A5", border: "1px solid rgba(248,113,113,.6)" };
const buttonRow = { display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" };
const actionRow = { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" };
const tableWrap = { overflowX: "auto", minHeight: 50 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 1050 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#D4AF37", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.09)", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 9px", color: "#C7D3CC", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top", whiteSpace: "nowrap" };
const badgeStyle = { display: "inline-flex", padding: "4px 8px", borderRadius: 999, border: "1px solid rgba(212,175,55,.45)", color: "#D4AF37", fontWeight: 900, fontSize: 10 };
const mutedStyle = { color: "#789082", fontSize: 11 };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(248,113,113,.6)", color: "#FCA5A5" };
const successStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(134,239,172,.35)", color: "#BBF7D0" };
const scheduleCard = { padding: 13, borderRadius: 10, border: "1px solid rgba(212,175,55,.35)", background: "rgba(212,175,55,.06)", display: "grid", gap: 8, color: "#F7FAF8" };
const scheduleGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, color: "#C7D3CC", fontSize: 12 };
