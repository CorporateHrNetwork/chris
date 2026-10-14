import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../../services/api";

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
  const [selectedRunId, setSelectedRunId] = useState("");
  const [workflow, setWorkflow] = useState(null);
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [workflowLoading, setWorkflowLoading] = useState(false);

  const candidates = (runs || []).filter((run) =>
    ["PENDING_APPROVAL", "APPROVED"].includes(String(run.status || "").toUpperCase())
  );
  const selectedRun = candidates.find((run) => run.id === selectedRunId) || candidates[0] || null;

  const loadWorkflow = useCallback(async (runId) => {
    if (!runId) { setWorkflow(null); setWorkflowHistory([]); return; }
    try {
      setWorkflowLoading(true); setError("");
      const [current, events] = await Promise.all([
        apiRequest(`/api/payroll/runs/${runId}/approval-workflow`),
        apiRequest(`/api/payroll/runs/${runId}/approval-workflow/history`),
      ]);
      setWorkflow(current?.data || null);
      setWorkflowHistory(events?.data || []);
    } catch (err) {
      setWorkflow(null); setWorkflowHistory([]);
      if (!String(err.message || "").toLowerCase().includes("not found")) setError(err.message || "Unable to load approval workflow.");
    } finally { setWorkflowLoading(false); }
  }, [setError]);

  useEffect(() => {
    if (!selectedRunId && selectedRun?.id) setSelectedRunId(selectedRun.id);
  }, [selectedRunId, selectedRun]);

  useEffect(() => {
    loadWorkflow(selectedRun?.id);
  }, [selectedRun?.id, loadWorkflow]);

  const startWorkflow = async () => {
    if (!selectedRun?.id) return;
    try {
      setBusy("start"); setError("");
      await apiRequest(`/api/payroll/runs/${selectedRun.id}/approval-workflow/start`, { method: "POST" });
      await loadWorkflow(selectedRun.id);
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  const act = async (action) => {
    if (!selectedRun?.id) return;
    const auditDecision = ["AUDIT_APPROVE", "AUDIT_DISAPPROVE"].includes(action);
    if (auditDecision && !notes.trim()) {
      setError("Audit observations are required before the Auditor records a decision.");
      return;
    }
    try {
      setBusy(action); setError("");
      if (action === "PAYOUT_EXPORTED") { const downloaded = await apiDownload(`/api/payroll/runs/${selectedRun.id}/approved-payout.xlsx`); saveDownloadedBlob(downloaded); } else await apiRequest(`/api/payroll/runs/${selectedRun.id}/approval-workflow/action`, {
        method: "POST",
        body: JSON.stringify({ action, notes: notes.trim() || undefined }),
      });
      setNotes("");
      await Promise.all([loadWorkflow(selectedRun.id), load(), loadHistory()]);
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  const stage = workflow?.stage || "NOT_STARTED";
  const steps = [
    ["HEAD_HR", "Head HR", ["DRAFT", "PENDING_AUDIT"], "Head HR prepares and sends the payroll to Audit."],
    ["PAYROLL_AUDITOR", "Payroll Auditor", ["AUDIT_PROCESSING", "AUDIT_APPROVED", "AUDIT_DISAPPROVED"], "Audit reviews statutory results, exceptions and payroll evidence."],
    ["GENERAL_MANAGER", "General Manager", ["GM_PROCESSING", "READY_FOR_PAYOUT", "GM_DISAPPROVED"], "GM performs the final management approval."],
    ["CHIEF_ACCOUNTANT", "Chief Accountant", ["PAYOUT_EXPORTED_LOCKED"], "Chief Accountant exports the approved payout; export locks the workflow."],
  ];
  const actionForStage = {
    DRAFT: ["REQUEST_AUDIT", "Send to Audit", primaryButton],
    PENDING_AUDIT: ["AUDIT_OPEN", "Open Audit", primaryButton],
    AUDIT_PROCESSING: ["AUDIT_APPROVE", "Approve Audit", primaryButton, "AUDIT_DISAPPROVE", "Reject Audit", dangerButton],
    AUDIT_APPROVED: ["REQUEST_GM", "Send to GM", primaryButton],
    PENDING_GM: ["GM_OPEN", "Open GM Review", primaryButton],
    GM_PROCESSING: ["GM_APPROVE", "Approve for Payout", primaryButton, "GM_DISAPPROVE", "Reject GM Approval", dangerButton],
    READY_FOR_PAYOUT: ["PAYOUT_EXPORTED", "Export Approved Payout & Lock", primaryButton],
  };
  const actions = actionForStage[stage] || [];
  const noWorkflow = !workflow && !workflowLoading;
  const statusText = stage === "PAYOUT_EXPORTED_LOCKED"
    ? "PAYOUT EXPORTED — LOCKED"
    : stage.replaceAll("_", " ");

  return (
    <>
      <Panel title="Zermatt Sequential Payroll Approval">
        <p style={controlNote}>
          Controlled workflow: <strong>Head HR → Payroll Auditor → General Manager → Chief Accountant</strong>.
          Each stage is assigned to a named user on the backend. Approval history is immutable and the final payout export locks the workflow.
        </p>
        <div style={formGrid}>
          <Select
            label="Payroll Run"
            value={selectedRun?.id || ""}
            onChange={setSelectedRunId}
            options={[
              ["", "Select payroll run"],
              ...candidates.map((run) => [run.id, `${run.periodCode} — ${run.status}`]),
            ]}
          />
          {selectedRun && (
            <div style={runSummary}>
              <span>Gross</span><strong>{money(selectedRun.grossTotal)}</strong>
              <span>Net</span><strong>{money(selectedRun.netPreviewTotal)}</strong>
              <span>Employees</span><strong>{selectedRun.employeeCount}</strong>
            </div>
          )}
          {noWorkflow && selectedRun && (
            <div>
              <button style={primaryButton} disabled={busy === "start"} onClick={startWorkflow}>
                {busy === "start" ? "Starting…" : "Start Approval Workflow"}
              </button>
            </div>
          )}
        </div>
      </Panel>

      <Feedback error={error} />

      {workflowLoading && <Panel title="Approval Workflow"><div style={loadingStyle}>Loading workflow…</div></Panel>}

      {workflow && (
        <>
          <Panel title="Approval Stage">
            <div style={stageBanner}>
              <span>Current Stage</span>
              <strong>{statusText}</strong>
            </div>
            <div style={stepGrid}>
              {steps.map(([responsibility, label, stages, description], index) => {
                const active = stages.includes(stage);
                const completed = (
                  (responsibility === "HEAD_HR" && ["AUDIT_PROCESSING","AUDIT_APPROVED","PENDING_GM","GM_PROCESSING","READY_FOR_PAYOUT","PAYOUT_EXPORTED_LOCKED"].includes(stage)) ||
                  (responsibility === "PAYROLL_AUDITOR" && ["AUDIT_APPROVED","PENDING_GM","GM_PROCESSING","READY_FOR_PAYOUT","PAYOUT_EXPORTED_LOCKED"].includes(stage)) ||
                  (responsibility === "GENERAL_MANAGER" && ["READY_FOR_PAYOUT","PAYOUT_EXPORTED_LOCKED"].includes(stage)) ||
                  (responsibility === "CHIEF_ACCOUNTANT" && stage === "PAYOUT_EXPORTED_LOCKED")
                );
                return <div key={responsibility} style={{ ...stepCard, ...(active ? stepActive : {}), ...(completed ? stepComplete : {}) }}>
                  <div style={stepNumber}>{index + 1}</div>
                  <div><div style={stepTitle}>{label}</div><div style={stepDescription}>{description}</div></div>
                  <Badge>{completed ? "COMPLETED" : active ? "CURRENT" : "PENDING"}</Badge>
                </div>;
              })}
            </div>
          </Panel>

          {!["PAYOUT_EXPORTED_LOCKED", "AUDIT_DISAPPROVED", "GM_DISAPPROVED"].includes(stage) && (
            <Panel title="Stage Action">
              <div style={formGrid}>
                <Input label={["AUDIT_APPROVE","AUDIT_DISAPPROVE"].includes(actions[0]) ? "Audit Observations (required)" : "Notes / Authority"} value={notes} onChange={setNotes} placeholder="Record review basis, exception or authority" />
                <div style={buttonRow}>
                  {actions.length >= 3 && <button style={actions[2]} disabled={Boolean(busy)} onClick={() => act(actions[0])}>{busy === actions[0] ? "Processing…" : actions[1]}</button>}
                  {actions.length >= 6 && <button style={actions[5]} disabled={Boolean(busy)} onClick={() => act(actions[3])}>{busy === actions[3] ? "Processing…" : actions[4]}</button>}
                </div>
              </div>
            </Panel>
          )}

          {stage === "PAYOUT_EXPORTED_LOCKED" && (
            <Panel title="Payout Export Lock">
              <div style={lockBanner}>This payroll is permanently locked at <strong>PAYOUT_EXPORTED_LOCKED</strong>. The final export actor and timestamp are retained in the workflow record.</div>
            </Panel>
          )}

          {["AUDIT_DISAPPROVED", "GM_DISAPPROVED"].includes(stage) && (
            <Panel title="Approval Returned">
              <div style={errorStyle}>This payroll was disapproved at the {stage.startsWith("AUDIT") ? "Audit" : "GM"} stage. Review the recorded observations/history before taking further action.</div>
            </Panel>
          )}

          <Panel title="Workflow History">
            <DataTable columns={["Action", "From", "To", "Actor", "Notes", "Date"]}>
              {workflowHistory.map((row) => <tr key={row.id}>
                <Td strong>{row.action}</Td><Td>{row.fromStage || "—"}</Td><Td>{row.toStage || "—"}</Td>
                <Td>{row.actorUserId || "System"}</Td><Td>{row.notes || "—"}</Td>
                <Td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</Td>
              </tr>)}
            </DataTable>
          </Panel>
        </>
      )}

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


const runSummary = { display: "grid", gridTemplateColumns: "repeat(3,minmax(120px,1fr))", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(212,175,55,.2)", fontSize: 11 };
const stageBanner = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: "14px 16px", borderRadius: 11, background: "rgba(212,175,55,.08)", border: "1px solid rgba(212,175,55,.3)", color: "#C7D3CC" };
const stepGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12, marginTop: 16 };
const stepCard = { display: "grid", gridTemplateColumns: "34px 1fr", gap: 10, alignItems: "start", position: "relative", padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.025)" };
const stepActive = { borderColor: "rgba(212,175,55,.65)", background: "rgba(212,175,55,.08)" };
const stepComplete = { borderColor: "rgba(74,222,128,.35)" };
const stepNumber = { width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(212,175,55,.16)", color: "#D4AF37", fontWeight: 900 };
const stepTitle = { color: "#F7FAF8", fontWeight: 900, marginBottom: 5 };
const stepDescription = { color: "#C7D3CC", fontSize: 11, lineHeight: 1.45, minHeight: 46, marginBottom: 8 };
const lockBanner = { padding: 15, borderRadius: 10, background: "rgba(74,222,128,.08)", border: "1px solid rgba(74,222,128,.35)", color: "#D9FBE5", lineHeight: 1.55 };

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
