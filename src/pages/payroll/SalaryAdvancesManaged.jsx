import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmployeeSearchSelect from "../../components/EmployeeSearchSelect";
import { apiRequest } from "../../services/api";

const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const emptyForm = () => ({
  employeeNumber: "",
  amount: "",
  installmentAmount: "",
  issuedDate: today(),
  recoveryStartDate: today(),
  reason: "",
});

export default function SalaryAdvancesManaged() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiRequest("/api/payroll/salary-advances");
      setRows(result?.data || []);
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
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const recoveredAmount = useMemo(
    () => editing ? Math.max(0, Number(editing.amount || 0) - Number(editing.outstandingAmount || 0)) : 0,
    [editing]
  );
  const historyLocked = Boolean(editing && (recoveredAmount > 0 || editing.status === "COMPLETED"));

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
      issuedDate: row.issuedDate || today(),
      recoveryStartDate: row.recoveryStartDate || today(),
      reason: row.reason || "",
    });
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy(editing ? `edit-${editing.id}` : "create");
      setError("");
      setMessage("");
      if (editing) {
        await apiRequest(`/api/payroll/salary-advances/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
        setMessage("Salary advance changes saved. Existing posted payroll recovery history was preserved.");
      } else {
        await apiRequest("/api/payroll/salary-advances", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setMessage("Salary advance recorded.");
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

  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>PAYROLL OPERATIONS</div>
      <h1 style={titleStyle}>Salary Advances</h1>
      <p style={leadStyle}>Record advances, edit permitted details and control installment recoveries. Outstanding balances reduce only when an approved payroll run contains the recovery.</p>

      <Panel title={editing ? `Edit Salary Advance · ${editing.employeeNumber}` : "Record Salary Advance"}>
        {editing && <p style={controlNote}>
          {historyLocked
            ? `This advance has ${money(recoveredAmount)} in posted payroll recovery. Employee, original advance amount and issued date are locked; future installment, recovery start and reason may be adjusted without rewriting history.`
            : "No posted payroll recovery exists. The employee, amount, dates, installment and reason may still be corrected."}
        </p>}
        <form style={formGrid} onSubmit={save}>
          <EmployeeSearchSelect
            label="Employee"
            value={form.employeeNumber}
            onChange={setEmployee}
            disabled={historyLocked}
            required
            placeholder="Search employee number or name"
          />
          <Input type="number" label="Advance Amount" value={form.amount} onChange={setField("amount")} min="0.01" step="0.01" disabled={historyLocked} required />
          <Input type="number" label="Installment Amount" value={form.installmentAmount} onChange={setField("installmentAmount")} min="0.01" step="0.01" required />
          <Input type="date" label="Issued Date" value={form.issuedDate} onChange={setField("issuedDate")} disabled={historyLocked} required />
          <Input type="date" label="Recovery Start" value={form.recoveryStartDate} onChange={setField("recoveryStartDate")} required />
          <Input label="Reason" value={form.reason} onChange={setField("reason")} />
          <div style={buttonRow}>
            <button style={primaryButton} disabled={Boolean(busy) || !form.employeeNumber}>{busy ? "Saving…" : editing ? "Save Changes" : "Record Advance"}</button>
            {editing && <button type="button" style={secondaryButton} onClick={reset} disabled={Boolean(busy)}>Cancel Edit</button>}
          </div>
        </form>
      </Panel>

      {error && <Feedback>{error}</Feedback>}
      {message && <div style={successStyle}>{message}</div>}

      <Panel title="Salary Advance Register">
        <div style={tableWrap}>
          <table style={tableStyle}>
            <thead><tr>{["Employee", "Name", "Advance", "Recovered", "Outstanding", "Installment", "Recovery Start", "Status", "Action"].map((head) => <th key={head} style={thStyle}>{head}</th>)}</tr></thead>
            <tbody>
              {!loading && rows.length === 0 && <tr><td colSpan="9" style={tdStyle}>No salary advances have been recorded.</td></tr>}
              {rows.map((row) => {
                const recovered = Math.max(0, Number(row.amount || 0) - Number(row.outstandingAmount || 0));
                const editable = !["COMPLETED"].includes(row.status);
                return <tr key={row.id}>
                  <Td strong>{row.employeeNumber}</Td><Td>{row.employeeName}</Td><Td>{money(row.amount)}</Td><Td>{money(recovered)}</Td><Td>{money(row.outstandingAmount)}</Td><Td>{money(row.installmentAmount)}</Td><Td>{row.recoveryStartDate}</Td><Td><Badge>{row.status}</Badge></Td>
                  <Td>{editable ? <button type="button" style={smallButton} onClick={() => startEdit(row)}>Edit</button> : <span style={mutedStyle}>Historical</span>}</Td>
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
const leadStyle = { color: "#C7D3CC", lineHeight: 1.65, maxWidth: 1050, marginBottom: 22 };
const panelStyle = { marginTop: 18, padding: 20, border: "1px solid rgba(212,175,55,.45)", borderRadius: 15, background: "linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96))", boxShadow: "0 15px 38px rgba(0,0,0,.24)" };
const panelTitle = { margin: "0 0 15px", fontSize: 18, color: "#D4AF37" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, alignItems: "end" };
const fieldLabel = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800, minWidth: 200 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8", outline: "none" };
const disabledStyle = { opacity: .68, cursor: "not-allowed" };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)" };
const smallButton = { ...secondaryButton, padding: "6px 10px", fontSize: 11 };
const buttonRow = { display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" };
const tableWrap = { overflowX: "auto", minHeight: 50 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 1050 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#D4AF37", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.09)", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 9px", color: "#C7D3CC", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top", whiteSpace: "nowrap" };
const badgeStyle = { display: "inline-block", borderRadius: 999, padding: "4px 8px", border: "1px solid rgba(212,175,55,.4)", color: "#D4AF37", background: "rgba(212,175,55,.08)", fontSize: 10, fontWeight: 900 };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(248,113,113,.45)", background: "rgba(185,28,28,.14)", color: "#FCA5A5" };
const successStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(212,175,55,.45)", background: "rgba(212,175,55,.08)", color: "#F7FAF8" };
const controlNote = { margin: "0 0 14px", color: "#C7D3CC", lineHeight: 1.55, fontSize: 12 };
const mutedStyle = { color: "#9FB7AA", fontSize: 11 };
