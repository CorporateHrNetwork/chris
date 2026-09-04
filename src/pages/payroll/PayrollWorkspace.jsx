import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../../services/api";

const money = (value, currency = "NGN") => {
  const number = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${currency || "NGN"} ${number.toLocaleString()}`;
  }
};

const today = () => new Date().toISOString().slice(0, 10);

const WORKSPACE_META = {
  execute: {
    title: "Execute Payroll",
    description: "Calculate a controlled draft payroll run from effective salary rates, configured earnings/deductions and salary-advance recoveries. No payment instruction is posted from this workspace.",
  },
  periods: {
    title: "Payroll Periods",
    description: "Create, lock and close payroll periods with overlap protection and an auditable lifecycle.",
  },
  rates: {
    title: "Salary Rates",
    description: "Maintain effective-dated authoritative monthly gross salary rates individually or through controlled Excel bulk import.",
  },
  allowances: {
    title: "Allowances",
    description: "Configure employee-specific or organization-wide fixed/percentage earnings with effective dates and optional one-time payroll periods.",
  },
  deductions: {
    title: "Deductions",
    description: "Configure employee-specific or organization-wide deductions. Manual statutory deductions may be recorded here until automated statutory engines are enabled.",
  },
  payslips: {
    title: "Payslips",
    description: "Review employee payroll run records and net-pay previews. Release-1 payslips remain subject to payroll approval and manual statutory review controls.",
  },
  "salary-advances": {
    title: "Salary Advances",
    description: "Record advances and controlled installment recoveries. Outstanding balances are reduced only when an approved payroll run contains the recovery.",
  },
  "paid-leave": {
    title: "Paid Leave",
    description: "View paid leave that overlaps a payroll period. The source remains Leave Management; Payroll does not duplicate leave records.",
  },
  approvals: {
    title: "Payroll Approvals",
    description: "Review submitted payroll runs, confirm manual statutory review, approve or reject, and retain the approval trail. Approval does not transmit payment instructions.",
  },
};

export default function PayrollWorkspace({ mode }) {
  const navigate = useNavigate();
  const meta = WORKSPACE_META[mode] || WORKSPACE_META.execute;

  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>PAYROLL OPERATIONS</div>
      <h1 style={titleStyle}>{meta.title}</h1>
      <p style={leadStyle}>{meta.description}</p>
      {mode === "periods" && <PeriodsWorkspace />}
      {mode === "rates" && <RatesWorkspace />}
      {mode === "allowances" && <ComponentsWorkspace kind="ALLOWANCE" />}
      {mode === "deductions" && <ComponentsWorkspace kind="DEDUCTION" />}
      {mode === "salary-advances" && <SalaryAdvancesWorkspace />}
      {mode === "paid-leave" && <PaidLeaveWorkspace />}
      {mode === "execute" && <ExecuteWorkspace />}
      {mode === "payslips" && <PayslipsWorkspace />}
      {mode === "approvals" && <ApprovalsWorkspace />}
    </section>
  );
}

function useLoad(path, initial = []) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await apiRequest(path);
      setData(result?.data ?? initial);
    } catch (err) {
      setError(err.message || "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, setData, loading, error, setError, load };
}

function PeriodsWorkspace() {
  const { data: periods, loading, error, setError, load } = useLoad("/api/payroll/periods");
  const [form, setForm] = useState({ code: "", name: "", periodStart: "", periodEnd: "", payDate: "" });
  const [busy, setBusy] = useState("");

  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy("save"); setError("");
      await apiRequest("/api/payroll/periods", { method: "POST", body: JSON.stringify(form) });
      setForm({ code: "", name: "", periodStart: "", periodEnd: "", payDate: "" });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  const changeStatus = async (period, status) => {
    try {
      setBusy(period.id); setError("");
      await apiRequest(`/api/payroll/periods/${period.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason: `Payroll period moved to ${status}` }),
      });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  return (
    <>
      <Panel title="Create Payroll Period">
        <form style={formGrid} onSubmit={save}>
          <Input label="Period Code" value={form.code} onChange={(value) => setForm((p) => ({ ...p, code: value }))} placeholder="SEP-2026" required />
          <Input label="Period Name" value={form.name} onChange={(value) => setForm((p) => ({ ...p, name: value }))} placeholder="September 2026 Payroll" required />
          <Input type="date" label="Period Start" value={form.periodStart} onChange={(value) => setForm((p) => ({ ...p, periodStart: value }))} required />
          <Input type="date" label="Period End" value={form.periodEnd} onChange={(value) => setForm((p) => ({ ...p, periodEnd: value }))} required />
          <Input type="date" label="Pay Date" value={form.payDate} onChange={(value) => setForm((p) => ({ ...p, payDate: value }))} />
          <div style={buttonCell}><button style={primaryButton} disabled={busy}>{busy === "save" ? "Saving…" : "Create Period"}</button></div>
        </form>
      </Panel>
      <Feedback error={error} />
      <Panel title="Payroll Period Register">
        <DataTable loading={loading} columns={["Code", "Name", "Start", "End", "Pay Date", "Status", "Action"]}>
          {periods.map((period) => (
            <tr key={period.id}>
              <Td strong>{period.code}</Td><Td>{period.name}</Td><Td>{period.periodStart}</Td><Td>{period.periodEnd}</Td><Td>{period.payDate || "—"}</Td><Td><Badge>{period.status}</Badge></Td>
              <Td>
                <div style={inlineActions}>
                  {period.status === "OPEN" && <button style={smallButton} disabled={busy === period.id} onClick={() => changeStatus(period, "LOCKED")}>Lock</button>}
                  {period.status === "LOCKED" && <button style={smallButton} disabled={busy === period.id} onClick={() => changeStatus(period, "OPEN")}>Reopen</button>}
                  {period.status === "LOCKED" && <button style={smallButton} disabled={busy === period.id} onClick={() => changeStatus(period, "CLOSED")}>Close</button>}
                  {period.status === "CLOSED" && "Final"}
                </div>
              </Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}

function RatesWorkspace() {
  const { data: rates, loading, error, setError, load } = useLoad("/api/payroll/salary-rates");
  const [form, setForm] = useState({ employeeNumber: "", amount: "", currency: "NGN", effectiveFrom: today(), effectiveTo: "", reason: "" });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState("");

  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy("save"); setError("");
      await apiRequest("/api/payroll/salary-rates", { method: "POST", body: JSON.stringify(form) });
      setForm({ employeeNumber: "", amount: "", currency: "NGN", effectiveFrom: today(), effectiveTo: "", reason: "" });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  const downloadTemplate = async () => {
    try { setBusy("template"); saveDownloadedBlob(await apiDownload("/api/payroll/salary-rates/template")); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  const sendWorkbook = async (endpoint) => {
    if (!file) throw new Error("Select a completed salary-rate workbook first.");
    const body = new FormData(); body.append("file", file);
    return apiRequest(endpoint, { method: "POST", body });
  };

  const validate = async () => {
    try { setBusy("preview"); setError(""); setImportResult(null); setPreview((await sendWorkbook("/api/payroll/salary-rates/bulk/preview")).data); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  };
  const importWorkbook = async () => {
    try { setBusy("import"); setError(""); setImportResult((await sendWorkbook("/api/payroll/salary-rates/bulk/import")).data); setPreview(null); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  return (
    <>
      <Panel title="Individual Salary Rate">
        <form style={formGrid} onSubmit={save}>
          <Input label="Employee Number" value={form.employeeNumber} onChange={(value) => setForm((p) => ({ ...p, employeeNumber: value }))} placeholder="ZLL000001" required />
          <Input type="number" label="Monthly Gross Salary" value={form.amount} onChange={(value) => setForm((p) => ({ ...p, amount: value }))} min="0" step="0.01" required />
          <Input label="Currency" value={form.currency} onChange={(value) => setForm((p) => ({ ...p, currency: value }))} required />
          <Input type="date" label="Effective From" value={form.effectiveFrom} onChange={(value) => setForm((p) => ({ ...p, effectiveFrom: value }))} required />
          <Input type="date" label="Effective To (optional)" value={form.effectiveTo} onChange={(value) => setForm((p) => ({ ...p, effectiveTo: value }))} />
          <Input label="Reason" value={form.reason} onChange={(value) => setForm((p) => ({ ...p, reason: value }))} placeholder="Opening salary authority" />
          <div style={buttonCell}><button style={primaryButton} disabled={busy}>{busy === "save" ? "Saving…" : "Save Salary Rate"}</button></div>
        </form>
      </Panel>

      <Panel title="Bulk Salary Rates">
        <div style={bulkGrid}>
          <button type="button" style={secondaryButton} onClick={downloadTemplate} disabled={busy}>{busy === "template" ? "Preparing…" : "Download Excel Template"}</button>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setImportResult(null); }} />
          <button type="button" style={secondaryButton} onClick={validate} disabled={!file || busy}>{busy === "preview" ? "Validating…" : "Validate Workbook"}</button>
        </div>
        {preview && <div style={summaryStrip}><strong>{preview.validRows} valid</strong><span>{preview.invalidRows} invalid · {preview.totalRows} total</span><button type="button" style={primaryButton} onClick={importWorkbook} disabled={!preview.validRows || busy}>{busy === "import" ? "Importing…" : `Import ${preview.validRows} Valid Rate${preview.validRows === 1 ? "" : "s"}`}</button></div>}
        {preview && <ImportRows rows={preview.rows} />}
        {importResult && <div style={summaryStrip}><strong>{importResult.created} created</strong><span>{importResult.failed} failed · {importResult.total} total</span></div>}
      </Panel>

      <Feedback error={error} />
      <Panel title="Effective Salary Rate Register">
        <DataTable loading={loading} columns={["Employee", "Name", "Monthly Gross", "Effective From", "Effective To", "Status"]}>
          {rates.map((rate) => <tr key={rate.id}><Td strong>{rate.employeeNumber}</Td><Td>{rate.employeeName}</Td><Td>{money(rate.amount, rate.currency)}</Td><Td>{rate.effectiveFrom}</Td><Td>{rate.effectiveTo || "Open-ended"}</Td><Td><Badge>{rate.status}</Badge></Td></tr>)}
        </DataTable>
      </Panel>
    </>
  );
}

function ComponentsWorkspace({ kind }) {
  const path = kind === "ALLOWANCE" ? "allowances" : "deductions";
  const { data: rows, loading, error, setError, load } = useLoad(`/api/payroll/${path}`);
  const { data: periods } = useLoad("/api/payroll/periods");
  const [form, setForm] = useState({ employeeNumber: "", code: "", name: "", calculationType: "FIXED", amount: "", percentage: "", effectiveFrom: today(), effectiveTo: "", oneTimePeriodId: "", taxable: false, notes: "" });
  const [busy, setBusy] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy(true); setError("");
      await apiRequest(`/api/payroll/${path}`, { method: "POST", body: JSON.stringify(form) });
      setForm({ employeeNumber: "", code: "", name: "", calculationType: "FIXED", amount: "", percentage: "", effectiveFrom: today(), effectiveTo: "", oneTimePeriodId: "", taxable: false, notes: "" });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <>
      <Panel title={`Create ${kind === "ALLOWANCE" ? "Allowance" : "Deduction"}`}>
        <form style={formGrid} onSubmit={save}>
          <Input label="Employee Number (blank = all employees)" value={form.employeeNumber} onChange={(value) => setForm((p) => ({ ...p, employeeNumber: value }))} placeholder="ZLL000001 or blank" />
          <Input label="Code" value={form.code} onChange={(value) => setForm((p) => ({ ...p, code: value }))} placeholder={kind === "ALLOWANCE" ? "TRANSPORT" : "PAYE-MANUAL"} required />
          <Input label="Name" value={form.name} onChange={(value) => setForm((p) => ({ ...p, name: value }))} required />
          <Select label="Calculation Type" value={form.calculationType} onChange={(value) => setForm((p) => ({ ...p, calculationType: value }))} options={[['FIXED','Fixed Amount'],['PERCENT_GROSS','% of Gross']]} />
          {form.calculationType === "FIXED" ? <Input type="number" label="Amount" value={form.amount} onChange={(value) => setForm((p) => ({ ...p, amount: value }))} min="0" step="0.01" required /> : <Input type="number" label="Percentage" value={form.percentage} onChange={(value) => setForm((p) => ({ ...p, percentage: value }))} min="0" step="0.01" required />}
          <Input type="date" label="Effective From" value={form.effectiveFrom} onChange={(value) => setForm((p) => ({ ...p, effectiveFrom: value }))} required />
          <Input type="date" label="Effective To" value={form.effectiveTo} onChange={(value) => setForm((p) => ({ ...p, effectiveTo: value }))} />
          <Select label="One-Time Period (optional)" value={form.oneTimePeriodId} onChange={(value) => setForm((p) => ({ ...p, oneTimePeriodId: value }))} options={[["", "Recurring / effective-dated"], ...periods.map((p) => [p.id, `${p.code} — ${p.name}`])]} />
          {kind === "ALLOWANCE" && <label style={checkboxLabel}><input type="checkbox" checked={form.taxable} onChange={(e) => setForm((p) => ({ ...p, taxable: e.target.checked }))} /> Taxable allowance</label>}
          <Input label="Notes" value={form.notes} onChange={(value) => setForm((p) => ({ ...p, notes: value }))} />
          <div style={buttonCell}><button style={primaryButton} disabled={busy}>{busy ? "Saving…" : `Save ${kind === "ALLOWANCE" ? "Allowance" : "Deduction"}`}</button></div>
        </form>
      </Panel>
      <Feedback error={error} />
      <Panel title={`${kind === "ALLOWANCE" ? "Allowance" : "Deduction"} Register`}>
        <DataTable loading={loading} columns={["Scope", "Code", "Name", "Value", "Effective", "One-Time", "Status"]}>
          {rows.map((row) => (
            <tr key={row.id}><Td strong>{row.employeeNumber || "ALL"}</Td><Td>{row.code}</Td><Td>{row.name}</Td><Td>{row.calculationType === "FIXED" ? money(row.amount) : `${row.percentage}% Gross`}</Td><Td>{row.effectiveFrom}{row.effectiveTo ? ` → ${row.effectiveTo}` : " → open"}</Td><Td>{row.oneTimePeriodCode || "—"}</Td><Td><Badge>{row.status}</Badge></Td></tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}

function SalaryAdvancesWorkspace() {
  const { data: rows, loading, error, setError, load } = useLoad("/api/payroll/salary-advances");
  const [form, setForm] = useState({ employeeNumber: "", amount: "", installmentAmount: "", issuedDate: today(), recoveryStartDate: today(), reason: "" });
  const [busy, setBusy] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    try { setBusy(true); setError(""); await apiRequest("/api/payroll/salary-advances", { method: "POST", body: JSON.stringify(form) }); setForm({ employeeNumber: "", amount: "", installmentAmount: "", issuedDate: today(), recoveryStartDate: today(), reason: "" }); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <>
      <Panel title="Record Salary Advance">
        <form style={formGrid} onSubmit={save}>
          <Input label="Employee Number" value={form.employeeNumber} onChange={(value) => setForm((p) => ({ ...p, employeeNumber: value }))} placeholder="ZLL000001" required />
          <Input type="number" label="Advance Amount" value={form.amount} onChange={(value) => setForm((p) => ({ ...p, amount: value }))} min="0" step="0.01" required />
          <Input type="number" label="Installment Amount" value={form.installmentAmount} onChange={(value) => setForm((p) => ({ ...p, installmentAmount: value }))} min="0" step="0.01" required />
          <Input type="date" label="Issued Date" value={form.issuedDate} onChange={(value) => setForm((p) => ({ ...p, issuedDate: value }))} required />
          <Input type="date" label="Recovery Start" value={form.recoveryStartDate} onChange={(value) => setForm((p) => ({ ...p, recoveryStartDate: value }))} required />
          <Input label="Reason" value={form.reason} onChange={(value) => setForm((p) => ({ ...p, reason: value }))} />
          <div style={buttonCell}><button style={primaryButton} disabled={busy}>{busy ? "Saving…" : "Record Advance"}</button></div>
        </form>
      </Panel>
      <Feedback error={error} />
      <Panel title="Salary Advance Register">
        <DataTable loading={loading} columns={["Employee", "Name", "Advance", "Outstanding", "Installment", "Recovery Start", "Status"]}>
          {rows.map((row) => <tr key={row.id}><Td strong>{row.employeeNumber}</Td><Td>{row.employeeName}</Td><Td>{money(row.amount)}</Td><Td>{money(row.outstandingAmount)}</Td><Td>{money(row.installmentAmount)}</Td><Td>{row.recoveryStartDate}</Td><Td><Badge>{row.status}</Badge></Td></tr>)}
        </DataTable>
      </Panel>
    </>
  );
}

function PaidLeaveWorkspace() {
  const { data: periods } = useLoad("/api/payroll/periods");
  const [periodId, setPeriodId] = useState("");
  const path = periodId ? `/api/payroll/paid-leave?periodId=${encodeURIComponent(periodId)}` : "/api/payroll/paid-leave";
  const { data: rows, loading, error } = useLoad(path);
  return (
    <>
      <Panel title="Paid Leave Payroll Input">
        <Select label="Payroll Period" value={periodId} onChange={setPeriodId} options={[["", "All paid leave"], ...periods.map((p) => [p.id, `${p.code} — ${p.name}`])]} />
        <p style={controlNote}>Paid leave records are read directly from Leave Management where Leave Type is marked paid and the request is Approved, Active or Completed.</p>
      </Panel>
      <Feedback error={error} />
      <Panel title="Paid Leave Register">
        <DataTable loading={loading} columns={["Employee", "Name", "Leave Type", "Units", "Start", "End", "Status"]}>
          {rows.map((row) => <tr key={row.id}><Td strong>{row.employeeNumber}</Td><Td>{row.employeeName}</Td><Td>{row.leaveType}</Td><Td>{row.requestedUnits} {String(row.unit || "").toLowerCase()}</Td><Td>{row.startDate}</Td><Td>{row.endDate}</Td><Td><Badge>{row.status}</Badge></Td></tr>)}
        </DataTable>
      </Panel>
    </>
  );
}

function ExecuteWorkspace() {
  const { data: periods, error: periodsError } = useLoad("/api/payroll/periods");
  const { data: runs, loading, error, setError, load } = useLoad("/api/payroll/runs");
  const [periodId, setPeriodId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState("");

  const selectablePeriods = periods.filter((period) => period.status !== "CLOSED");
  const calculate = async () => {
    try {
      setBusy("calculate"); setError("");
      const response = await apiRequest("/api/payroll/runs/draft", { method: "POST", body: JSON.stringify({ periodId }) });
      setSelectedRunId(response.data?.run?.id || "");
      setLines(response.data?.lines || []);
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };
  const viewLines = async (runId) => {
    try { setBusy(runId); setError(""); setSelectedRunId(runId); setLines((await apiRequest(`/api/payroll/runs/${runId}/lines`)).data || []); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  };
  const submit = async (runId) => {
    try { setBusy(`submit-${runId}`); setError(""); await apiRequest(`/api/payroll/runs/${runId}/submit`, { method: "POST", body: JSON.stringify({ notes: "Submitted from Execute Payroll workspace" }) }); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  return (
    <>
      <Panel title="Draft Payroll Calculation">
        <div style={bulkGrid}>
          <Select label="Payroll Period" value={periodId} onChange={setPeriodId} options={[["", "Select payroll period"], ...selectablePeriods.map((p) => [p.id, `${p.code} — ${p.name}`])]} />
          <button type="button" style={primaryButton} disabled={!periodId || busy} onClick={calculate}>{busy === "calculate" ? "Calculating…" : "Calculate Draft Payroll"}</button>
        </div>
        <p style={controlNote}>Control: this produces a payroll draft and net-pay preview only. It does not transmit bank instructions. PAYE/pension automation is not yet enabled.</p>
      </Panel>
      <Feedback error={periodsError || error} />
      <Panel title="Payroll Runs">
        <DataTable loading={loading} columns={["Period", "Status", "Employees", "Gross", "Deductions", "Net Preview", "Action"]}>
          {runs.map((run) => <tr key={run.id}><Td strong>{run.periodCode}</Td><Td><Badge>{run.status}</Badge></Td><Td>{run.employeeCount}</Td><Td>{money(run.grossTotal)}</Td><Td>{money(run.deductionTotal)}</Td><Td>{money(run.netPreviewTotal)}</Td><Td><div style={inlineActions}><button style={smallButton} onClick={() => viewLines(run.id)} disabled={busy === run.id}>View</button>{(run.status === "DRAFT" || run.status === "REJECTED") && <button style={smallButton} onClick={() => submit(run.id)} disabled={busy === `submit-${run.id}`}>Submit</button>}</div></Td></tr>)}
        </DataTable>
      </Panel>
      {selectedRunId && <Panel title="Payroll Run Lines"><RunLines rows={lines} /></Panel>}
    </>
  );
}

function PayslipsWorkspace() {
  const { data: runs } = useLoad("/api/payroll/runs");
  const [runId, setRunId] = useState("");
  const path = runId ? `/api/payroll/payslips?runId=${encodeURIComponent(runId)}` : "/api/payroll/payslips";
  const { data: lines, loading, error } = useLoad(path);
  return (
    <>
      <Panel title="Payslip / Pay Advice Register">
        <Select label="Payroll Run" value={runId} onChange={setRunId} options={[["", "All payroll run lines"], ...runs.map((run) => [run.id, `${run.periodCode} — ${run.status}`])]} />
        <p style={controlNote}>These are payroll-calculation records. A future PDF publication layer can consume the same approved run lines without changing payroll calculation history.</p>
      </Panel>
      <Feedback error={error} />
      <Panel title="Employee Pay Records"><RunLines rows={lines} loading={loading} /></Panel>
    </>
  );
}

function ApprovalsWorkspace() {
  const { data: runs, loading, error, setError, load } = useLoad("/api/payroll/runs");
  const { data: history, load: loadHistory } = useLoad("/api/payroll/approvals");
  const [notes, setNotes] = useState("");
  const [statutoryReviewed, setStatutoryReviewed] = useState(false);
  const [busy, setBusy] = useState("");
  const pending = runs.filter((run) => run.status === "PENDING_APPROVAL");

  const decide = async (runId, decision) => {
    try {
      setBusy(`${decision}-${runId}`); setError("");
      await apiRequest(`/api/payroll/runs/${runId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, statutoryReviewed: decision === "APPROVE" ? statutoryReviewed : false, notes }),
      });
      setNotes(""); setStatutoryReviewed(false); await Promise.all([load(), loadHistory()]);
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  return (
    <>
      <Panel title="Pending Payroll Approval">
        <div style={{ display: "grid", gap: 12 }}>
          <label style={checkboxLabel}><input type="checkbox" checked={statutoryReviewed} onChange={(e) => setStatutoryReviewed(e.target.checked)} /> I confirm PAYE, pension and other required statutory deductions have been manually reviewed for the run I approve.</label>
          <Input label="Approval / Rejection Notes" value={notes} onChange={setNotes} placeholder="Record the approval basis or rejection reason" />
        </div>
        <DataTable loading={loading} columns={["Period", "Employees", "Gross", "Deductions", "Net Preview", "Action"]}>
          {pending.map((run) => <tr key={run.id}><Td strong>{run.periodCode}</Td><Td>{run.employeeCount}</Td><Td>{money(run.grossTotal)}</Td><Td>{money(run.deductionTotal)}</Td><Td>{money(run.netPreviewTotal)}</Td><Td><div style={inlineActions}><button style={smallButton} disabled={!statutoryReviewed || busy} onClick={() => decide(run.id, "APPROVE")}>Approve</button><button style={dangerButton} disabled={busy} onClick={() => decide(run.id, "REJECT")}>Reject</button></div></Td></tr>)}
        </DataTable>
      </Panel>
      <Feedback error={error} />
      <Panel title="Approval History">
        <DataTable columns={["Period", "Action", "Actor", "Notes", "Date"]}>
          {history.map((row) => <tr key={row.id}><Td strong>{row.periodCode}</Td><Td><Badge>{row.action}</Badge></Td><Td>{row.actorName || row.actorEmail || "System"}</Td><Td>{row.notes || "—"}</Td><Td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</Td></tr>)}
        </DataTable>
      </Panel>
    </>
  );
}

function RunLines({ rows = [], loading = false }) {
  return (
    <DataTable loading={loading} columns={["Employee", "Name", "Base", "Allowances", "Deductions", "Advance", "Gross", "Net Preview", "Statutory"]}>
      {rows.map((row) => <tr key={row.id}><Td strong>{row.employeeNumber}</Td><Td>{row.employeeName}</Td><Td>{money(row.baseSalary, row.currency)}</Td><Td>{money(row.allowances, row.currency)}</Td><Td>{money(row.deductions, row.currency)}</Td><Td>{money(row.advanceRecovery, row.currency)}</Td><Td>{money(row.grossPay, row.currency)}</Td><Td>{money(row.netPreview, row.currency)}</Td><Td><Badge>{row.statutoryStatus}</Badge></Td></tr>)}
    </DataTable>
  );
}

function ImportRows({ rows }) {
  return (
    <DataTable columns={["Row", "Employee", "Name", "Amount", "Effective", "Status / Error"]}>
      {(rows || []).map((row) => <tr key={row.rowNumber}><Td>{row.rowNumber}</Td><Td strong>{row.display?.employeeNumber || "—"}</Td><Td>{row.display?.employeeName || "—"}</Td><Td>{row.display?.amount || "—"}</Td><Td>{row.display?.effectiveFrom || "—"}</Td><Td>{row.valid ? <Badge>VALID</Badge> : (row.errors || []).join(" · ")}</Td></tr>)}
    </DataTable>
  );
}

function Panel({ title, children }) {
  return <section style={panelStyle}><h2 style={panelTitle}>{title}</h2>{children}</section>;
}

function Feedback({ error }) {
  return error ? <div role="alert" style={errorStyle}>{error}</div> : null;
}

function Input({ label, value, onChange, type = "text", ...props }) {
  return <label style={fieldLabel}><span>{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} {...props} /></label>;
}

function Select({ label, value, onChange, options }) {
  return <label style={fieldLabel}><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>{options.map(([key, name]) => <option key={key || "blank"} value={key}>{name}</option>)}</select></label>;
}

function DataTable({ columns, children, loading = false }) {
  return <div style={tableWrap}>{loading ? <div style={loadingStyle}>Loading…</div> : <table style={tableStyle}><thead><tr>{columns.map((column) => <th key={column} style={thStyle}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table>}</div>;
}

function Td({ children, strong = false }) {
  return <td style={{ ...tdStyle, ...(strong ? { fontWeight: 900, color: "#F7FAF8" } : {}) }}>{children}</td>;
}

function Badge({ children }) {
  return <span style={badgeStyle}>{children}</span>;
}

const pageStyle = { maxWidth: 1500, margin: "0 auto", color: "#F7FAF8" };
const backButton = { border: 0, background: "transparent", color: "#D4AF37", fontWeight: 900, cursor: "pointer", padding: "0 0 14px" };
const eyebrow = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle = { margin: "6px 0", fontSize: 32 };
const leadStyle = { color: "#C7D3CC", lineHeight: 1.65, maxWidth: 1000, marginBottom: 22 };
const panelStyle = { marginTop: 18, padding: 20, border: "1px solid rgba(212,175,55,.45)", borderRadius: 15, background: "linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96))", boxShadow: "0 15px 38px rgba(0,0,0,.24)" };
const panelTitle = { margin: "0 0 15px", fontSize: 18, color: "#D4AF37" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, alignItems: "end" };
const bulkGrid = { display: "flex", gap: 14, alignItems: "end", flexWrap: "wrap" };
const fieldLabel = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800, minWidth: 200 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8", outline: "none" };
const buttonCell = { display: "flex", alignItems: "end" };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)" };
const smallButton = { ...secondaryButton, padding: "6px 10px", fontSize: 11 };
const dangerButton = { ...smallButton, color: "#FCA5A5", borderColor: "rgba(248,113,113,.55)" };
const inlineActions = { display: "flex", gap: 7, flexWrap: "wrap" };
const tableWrap = { overflowX: "auto", minHeight: 50 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 820 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#D4AF37", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.09)" };
const tdStyle = { padding: "10px 9px", color: "#C7D3CC", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top" };
const badgeStyle = { display: "inline-block", borderRadius: 999, padding: "4px 8px", border: "1px solid rgba(212,175,55,.4)", color: "#D4AF37", background: "rgba(212,175,55,.08)", fontSize: 10, fontWeight: 900 };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(248,113,113,.45)", background: "rgba(185,28,28,.14)", color: "#FCA5A5" };
const controlNote = { margin: "13px 0 0", color: "#C7D3CC", lineHeight: 1.55, fontSize: 12 };
const checkboxLabel = { display: "flex", alignItems: "center", gap: 8, color: "#F7FAF8", fontSize: 12, fontWeight: 800 };
const summaryStrip = { marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(212,175,55,.08)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" };
const loadingStyle = { padding: 14, color: "#C7D3CC" };
