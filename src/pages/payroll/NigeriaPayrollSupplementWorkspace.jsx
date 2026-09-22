import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../services/api";

const money = (value, currency = "NGN") => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString()}`;
  }
};
const today = () => new Date().toISOString().slice(0, 10);

function useLoad(path, initial = []) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const result = await apiRequest(path);
      setData(result?.data ?? initial);
    } catch (err) { setError(err.message || "Unable to load data."); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, setError, load };
}

export default function NigeriaPayrollSupplementWorkspace({ mode }) {
  const navigate = useNavigate();
  const meta = {
    allowances: ["Other Allowances", "Add earnings outside ZERMATT's 100% Basic/Housing/Transport/Meal/Medical/Utility gross structure. Taxable is the safe default."],
    deductions: ["Other Deductions", "Configure non-statutory deductions separately from CHRiS-calculated PAYE and pension."],
    payslips: ["Payslips", "Review employee payroll results including Nigeria PAYE, pension, salary structure and net pay."],
    approvals: ["Payroll Approvals", "Approve or reject calculated payroll after reviewing statutory results and exceptions. Approval does not transmit payment instructions."],
  };
  const [title, description] = meta[mode] || meta.allowances;
  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>NIGERIA PAYROLL OPERATIONS</div>
      <h1 style={titleStyle}>{title}</h1>
      <p style={leadStyle}>{description}</p>
      {(mode === "allowances" || mode === "deductions") && <ComponentsWorkspace kind={mode === "allowances" ? "ALLOWANCE" : "DEDUCTION"} />}
      {mode === "payslips" && <PayslipsWorkspace />}
      {mode === "approvals" && <ApprovalsWorkspace />}
    </section>
  );
}

function ComponentsWorkspace({ kind }) {
  const path = kind === "ALLOWANCE" ? "allowances" : "deductions";
  const { data: rows, loading, error, setError, load } = useLoad(`/api/payroll/${path}`);
  const { data: periods } = useLoad("/api/payroll/periods");
  const blank = {
    employeeNumber: "", code: "", name: "", calculationType: "FIXED", amount: "", percentage: "",
    effectiveFrom: today(), effectiveTo: "", oneTimePeriodId: "", taxable: kind === "ALLOWANCE", notes: "",
  };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy(true); setError("");
      await apiRequest(`/api/payroll/${path}`, { method: "POST", body: JSON.stringify(form) });
      setForm({ ...blank, taxable: kind === "ALLOWANCE" });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <>
      <Panel title={`Create ${kind === "ALLOWANCE" ? "Other Allowance" : "Other Deduction"}`}>
        <p style={controlNote}>{kind === "ALLOWANCE"
          ? "ZERMATT Basic/Housing/Transport/Meal/Medical/Utility already total 100% of uploaded gross. Use this workspace only for additional earnings such as bonus, overtime, acting allowance or approved arrears."
          : "PAYE and pension are statutory calculations and should not be recreated here. Use this workspace for loans, union dues, disciplinary recoveries or other authorised non-statutory deductions."}</p>
        <form style={formGrid} onSubmit={save}>
          <Input label="Employee Number (blank = all)" value={form.employeeNumber} onChange={(value) => setForm((p) => ({ ...p, employeeNumber: value }))} placeholder="ZLL000001 or blank" />
          <Input label="Code" value={form.code} onChange={(value) => setForm((p) => ({ ...p, code: value }))} placeholder={kind === "ALLOWANCE" ? "OVERTIME" : "UNION-DUES"} required />
          <Input label="Name" value={form.name} onChange={(value) => setForm((p) => ({ ...p, name: value }))} required />
          <Select label="Calculation Type" value={form.calculationType} onChange={(value) => setForm((p) => ({ ...p, calculationType: value }))} options={[["FIXED","Fixed Amount"],["PERCENT_GROSS","% of Period Gross"]]} />
          {form.calculationType === "FIXED"
            ? <Input type="number" label="Amount" value={form.amount} onChange={(value) => setForm((p) => ({ ...p, amount: value }))} min="0" step="0.01" required />
            : <Input type="number" label="Percentage" value={form.percentage} onChange={(value) => setForm((p) => ({ ...p, percentage: value }))} min="0" step="0.01" required />}
          <Input type="date" label="Effective From" value={form.effectiveFrom} onChange={(value) => setForm((p) => ({ ...p, effectiveFrom: value }))} required />
          <Input type="date" label="Effective To" value={form.effectiveTo} onChange={(value) => setForm((p) => ({ ...p, effectiveTo: value }))} />
          <Select label="One-Time Period (optional)" value={form.oneTimePeriodId} onChange={(value) => setForm((p) => ({ ...p, oneTimePeriodId: value }))} options={[["","Recurring / effective-dated"], ...(periods || []).map((p) => [p.id, `${p.code} — ${p.name}`])]} />
          {kind === "ALLOWANCE" && <label style={checkboxLabel}><input type="checkbox" checked={form.taxable} onChange={(e) => setForm((p) => ({ ...p, taxable: e.target.checked }))} /> Taxable earning (default). Clear only where a lawful non-taxable treatment is supported.</label>}
          <Input label="Notes / Authority" value={form.notes} onChange={(value) => setForm((p) => ({ ...p, notes: value }))} placeholder="Reason, approval or source reference" />
          <div><button style={primaryButton} disabled={busy}>{busy ? "Saving…" : `Save ${kind === "ALLOWANCE" ? "Allowance" : "Deduction"}`}</button></div>
        </form>
      </Panel>
      <Feedback error={error} />
      <Panel title={`${kind === "ALLOWANCE" ? "Other Allowance" : "Other Deduction"} Register`}>
        <DataTable loading={loading} columns={["Scope", "Code", "Name", "Value", "Effective", "One-Time", kind === "ALLOWANCE" ? "Tax" : "Treatment", "Status"]}>
          {(rows || []).map((row) => <tr key={row.id}>
            <Td strong>{row.employeeNumber || "ALL"}</Td><Td>{row.code}</Td><Td>{row.name}</Td>
            <Td>{row.calculationType === "FIXED" ? money(row.amount) : `${row.percentage}% Gross`}</Td>
            <Td>{row.effectiveFrom}{row.effectiveTo ? ` → ${row.effectiveTo}` : " → open"}</Td><Td>{row.oneTimePeriodCode || "—"}</Td>
            <Td>{kind === "ALLOWANCE" ? (row.taxable ? "Taxable" : "Non-taxable classification") : "Post-tax / authorised deduction"}</Td><Td><Badge>{row.status}</Badge></Td>
          </tr>)}
        </DataTable>
      </Panel>
    </>
  );
}

function PayslipsWorkspace() {
  const { data: rows, loading, error } = useLoad("/api/payroll/payslips");
  return (
    <>
      <Feedback error={error} />
      <Panel title="Employee Payroll Records">
        <DataTable loading={loading} columns={["Employee", "Basic", "Structured Allow.", "PAYE", "Pension", "Other Ded.", "Advance", "Gross", "Net", "Statutory"]}>
          {(rows || []).map((row) => {
            const details = row.details || {};
            const statutory = details.statutory || {};
            const customDeductions = (details.customDeductions || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
            const structuredAllowance = Object.entries(details.salaryStructure || {}).filter(([key]) => key !== "basic").reduce((sum, [, value]) => sum + Number(value || 0), 0);
            return <tr key={row.id}>
              <Td strong>{row.employeeNumber}</Td><Td>{money(row.baseSalary, row.currency)}</Td><Td>{money(structuredAllowance, row.currency)}</Td>
              <Td>{money(statutory.payeTax, row.currency)}</Td><Td>{money(statutory.employeePension, row.currency)}</Td><Td>{money(customDeductions, row.currency)}</Td>
              <Td>{money(row.advanceRecovery, row.currency)}</Td><Td>{money(row.grossPay, row.currency)}</Td><Td strong>{money(row.netPreview, row.currency)}</Td><Td><Badge>{row.statutoryStatus}</Badge></Td>
            </tr>;
          })}
        </DataTable>
      </Panel>
    </>
  );
}

function ApprovalsWorkspace() {
  const { data: runs, loading, error, setError, load } = useLoad("/api/payroll/runs");
  const { data: history, load: loadHistory } = useLoad("/api/payroll/approvals");
  const [notes, setNotes] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState("");
  const pending = (runs || []).filter((run) => run.status === "PENDING_APPROVAL");
  const decide = async (runId, decision) => {
    try {
      setBusy(`${decision}-${runId}`); setError("");
      await apiRequest(`/api/payroll/runs/${runId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, statutoryReviewed: decision === "APPROVE" ? reviewed : false, notes }),
      });
      setNotes(""); setReviewed(false); await Promise.all([load(), loadHistory()]);
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };
  return (
    <>
      <Panel title="Pending Payroll Approval">
        <label style={checkboxLabel}><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I confirm I reviewed CHRiS-calculated PAYE/pension, salary structure, attendance exceptions and other payroll deductions for the run being approved.</label>
        <div style={{ marginTop: 12 }}><Input label="Approval / Rejection Notes" value={notes} onChange={setNotes} placeholder="Record review basis, exception or authority" /></div>
        <DataTable loading={loading} columns={["Period", "Statutory", "Employees", "Gross", "Deductions", "Net", "Action"]}>
          {pending.map((run) => <tr key={run.id}><Td strong>{run.periodCode}</Td><Td><Badge>{run.statutoryStatus}</Badge></Td><Td>{run.employeeCount}</Td><Td>{money(run.grossTotal)}</Td><Td>{money(run.deductionTotal)}</Td><Td>{money(run.netPreviewTotal)}</Td><Td><div style={buttonRow}><button style={smallButton} disabled={!reviewed || busy} onClick={() => decide(run.id, "APPROVE")}>Approve</button><button style={dangerButton} disabled={busy} onClick={() => decide(run.id, "REJECT")}>Reject</button></div></Td></tr>)}
        </DataTable>
      </Panel>
      <Feedback error={error} />
      <Panel title="Approval History">
        <DataTable columns={["Period", "Action", "Actor", "Notes", "Date"]}>
          {(history || []).map((row) => <tr key={row.id}><Td strong>{row.periodCode}</Td><Td><Badge>{row.action}</Badge></Td><Td>{row.actorName || row.actorEmail || "System"}</Td><Td>{row.notes || "—"}</Td><Td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</Td></tr>)}
        </DataTable>
      </Panel>
    </>
  );
}

function Panel({ title, children }) { return <section style={panelStyle}><h2 style={panelTitle}>{title}</h2>{children}</section>; }
function Feedback({ error }) { return error ? <div role="alert" style={errorStyle}>{error}</div> : null; }
function Input({ label, value, onChange, type = "text", ...props }) { return <label style={fieldLabel}><span>{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} {...props} /></label>; }
function Select({ label, value, onChange, options }) { return <label style={fieldLabel}><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>{options.map(([key, name]) => <option key={key || "blank"} value={key}>{name}</option>)}</select></label>; }
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
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)" };
const smallButton = { ...secondaryButton, padding: "6px 10px", fontSize: 11 };
const dangerButton = { ...smallButton, color: "#FCA5A5", borderColor: "rgba(248,113,113,.55)" };
const buttonRow = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const tableWrap = { overflowX: "auto", minHeight: 50, marginTop: 14 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#D4AF37", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.09)", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 9px", color: "#C7D3CC", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top", whiteSpace: "nowrap" };
const badgeStyle = { display: "inline-block", borderRadius: 999, padding: "4px 8px", border: "1px solid rgba(212,175,55,.4)", color: "#D4AF37", background: "rgba(212,175,55,.08)", fontSize: 10, fontWeight: 900 };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(248,113,113,.45)", background: "rgba(185,28,28,.14)", color: "#FCA5A5" };
const controlNote = { margin: "0 0 14px", color: "#C7D3CC", lineHeight: 1.55, fontSize: 12 };
const checkboxLabel = { display: "flex", alignItems: "center", gap: 8, color: "#F7FAF8", fontSize: 12, fontWeight: 800 };
const loadingStyle = { padding: 14, color: "#C7D3CC" };
