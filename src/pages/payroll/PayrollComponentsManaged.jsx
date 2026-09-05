import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmployeeSearchSelect from "../../components/EmployeeSearchSelect";
import { apiRequest } from "../../services/api";

const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value || 0));

export default function PayrollComponentsManaged({ kind }) {
  const navigate = useNavigate();
  const path = kind === "ALLOWANCE" ? "allowances" : "deductions";
  const blank = () => ({
    employeeNumber: "",
    code: "",
    name: "",
    calculationType: "FIXED",
    amount: "",
    percentage: "",
    effectiveFrom: today(),
    effectiveTo: "",
    oneTimePeriodId: "",
    taxable: kind === "ALLOWANCE",
    notes: "",
  });
  const [form, setForm] = useState(blank);
  const [rows, setRows] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [components, payrollPeriods] = await Promise.all([
        apiRequest(`/api/payroll/${path}`),
        apiRequest("/api/payroll/periods"),
      ]);
      setRows(components?.data || []);
      setPeriods(payrollPeriods?.data || []);
      setError("");
    } catch (requestError) {
      setError(requestError?.message || `Unable to load ${path}.`);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);

  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      await apiRequest(`/api/payroll/${path}`, { method: "POST", body: JSON.stringify(form) });
      setForm(blank());
      await load();
    } catch (requestError) {
      setError(requestError?.message || `Unable to save ${kind.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  };

  const setField = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));
  const title = kind === "ALLOWANCE" ? "Other Allowances" : "Other Deductions";

  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>NIGERIA PAYROLL OPERATIONS</div>
      <h1 style={titleStyle}>{title}</h1>
      <p style={leadStyle}>{kind === "ALLOWANCE" ? "Add earnings outside ZERMATT's 100% salary structure." : "Configure authorised non-statutory deductions separately from CHRiS-calculated PAYE and pension."}</p>

      <Panel title={`Create ${kind === "ALLOWANCE" ? "Other Allowance" : "Other Deduction"}`}>
        <p style={controlNote}>{kind === "ALLOWANCE"
          ? "Leave Employee blank for an organization-wide allowance. To target one employee, search and select the employee from CHRiS; do not type an Employee Number."
          : "Leave Employee blank for an organization-wide deduction. To target one employee, search and select the employee from CHRiS; PAYE and pension should not be recreated here."}</p>
        <form style={formGrid} onSubmit={save}>
          <EmployeeSearchSelect label="Employee (optional; blank = all employees)" value={form.employeeNumber} onChange={(employeeNumber) => setForm((current) => ({ ...current, employeeNumber }))} placeholder="Search employee number or name" />
          <Input label="Code" value={form.code} onChange={setField("code")} placeholder={kind === "ALLOWANCE" ? "OVERTIME" : "UNION-DUES"} required />
          <Input label="Name" value={form.name} onChange={setField("name")} required />
          <Select label="Calculation Type" value={form.calculationType} onChange={setField("calculationType")} options={[["FIXED", "Fixed Amount"], ["PERCENT_GROSS", "% of Period Gross"]]} />
          {form.calculationType === "FIXED"
            ? <Input type="number" label="Amount" value={form.amount} onChange={setField("amount")} min="0" step="0.01" required />
            : <Input type="number" label="Percentage" value={form.percentage} onChange={setField("percentage")} min="0" step="0.01" required />}
          <Input type="date" label="Effective From" value={form.effectiveFrom} onChange={setField("effectiveFrom")} required />
          <Input type="date" label="Effective To" value={form.effectiveTo} onChange={setField("effectiveTo")} />
          <Select label="One-Time Period (optional)" value={form.oneTimePeriodId} onChange={setField("oneTimePeriodId")} options={[["", "Recurring / effective-dated"], ...periods.map((period) => [period.id, `${period.code} — ${period.name}`])]} />
          {kind === "ALLOWANCE" && <label style={checkboxLabel}><input type="checkbox" checked={form.taxable} onChange={(event) => setForm((current) => ({ ...current, taxable: event.target.checked }))} /> Taxable earning (default)</label>}
          <Input label="Notes / Authority" value={form.notes} onChange={setField("notes")} placeholder="Reason, approval or source reference" />
          <div><button style={primaryButton} disabled={busy}>{busy ? "Saving…" : `Save ${kind === "ALLOWANCE" ? "Allowance" : "Deduction"}`}</button></div>
        </form>
      </Panel>

      {error && <Feedback>{error}</Feedback>}
      <Panel title={`${kind === "ALLOWANCE" ? "Other Allowance" : "Other Deduction"} Register`}>
        <DataTable loading={loading} columns={["Scope", "Code", "Name", "Value", "Effective", "One-Time", kind === "ALLOWANCE" ? "Tax" : "Treatment", "Status"]}>
          {rows.map((row) => <tr key={row.id}>
            <Td strong>{row.employeeNumber || "ALL"}</Td><Td>{row.code}</Td><Td>{row.name}</Td>
            <Td>{row.calculationType === "FIXED" ? money(row.amount) : `${row.percentage}% Gross`}</Td>
            <Td>{row.effectiveFrom}{row.effectiveTo ? ` → ${row.effectiveTo}` : " → open"}</Td><Td>{row.oneTimePeriodCode || "—"}</Td>
            <Td>{kind === "ALLOWANCE" ? (row.taxable ? "Taxable" : "Non-taxable classification") : "Post-tax / authorised deduction"}</Td><Td><Badge>{row.status}</Badge></Td>
          </tr>)}
        </DataTable>
      </Panel>
    </section>
  );
}

function Panel({ title, children }) { return <section style={panelStyle}><h2 style={panelTitle}>{title}</h2>{children}</section>; }
function Feedback({ children }) { return <div role="alert" style={errorStyle}>{children}</div>; }
function Input({ label, value, onChange, type = "text", ...props }) { return <label style={fieldLabel}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} {...props} /></label>; }
function Select({ label, value, onChange, options }) { return <label style={fieldLabel}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>{options.map(([key, name]) => <option key={key || "blank"} value={key}>{name}</option>)}</select></label>; }
function DataTable({ columns, children, loading = false }) { return <div style={tableWrap}>{loading ? <div style={loadingStyle}>Loading…</div> : <table style={tableStyle}><thead><tr>{columns.map((column) => <th key={column} style={thStyle}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table>}</div>; }
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
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const checkboxLabel = { display: "flex", alignItems: "center", gap: 8, color: "#C7D3CC", fontSize: 12, fontWeight: 800 };
const controlNote = { margin: "0 0 14px", color: "#C7D3CC", lineHeight: 1.55, fontSize: 12 };
const tableWrap = { overflowX: "auto", minHeight: 50 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 1000 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#D4AF37", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.09)", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 9px", color: "#C7D3CC", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top", whiteSpace: "nowrap" };
const badgeStyle = { display: "inline-block", borderRadius: 999, padding: "4px 8px", border: "1px solid rgba(212,175,55,.4)", color: "#D4AF37", background: "rgba(212,175,55,.08)", fontSize: 10, fontWeight: 900 };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(248,113,113,.45)", background: "rgba(185,28,28,.14)", color: "#FCA5A5" };
const loadingStyle = { padding: 14, color: "#C7D3CC" };
