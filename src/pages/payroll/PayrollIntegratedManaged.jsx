import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmployeeBatchSelector from "../../components/EmployeeBatchSelector";
import ManualWorkedDaysPanel from "../../components/payroll/ManualWorkedDaysPanel";
import { apiRequest } from "../../services/api";

const money = (value, currency = "NGN") => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString()}`;
  }
};

function useLoad(path, initial = []) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await apiRequest(path);
      setData(response?.data ?? initial);
    } catch (err) {
      setError(err.message || "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, setError, load };
}

export default function PayrollIntegratedManaged({ mode }) {
  const navigate = useNavigate();
  const meta = {
    execute: ["Execute Payroll", "Calculate payroll with statutory deductions, Salary Advance recovery and Loan recovery in one auditable payroll line."],
    payslips: ["Payslips", "Payslips are generated directly from approved payroll runs. Draft or rejected payroll does not produce an employee payslip."],
    statutory: ["Nigeria Statutory Review", "Review which payroll statutory items are active, employer-only, or require ZERMATT approval before activation."],
  };
  const [title, description] = meta[mode] || meta.execute;
  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>INTEGRATED PAYROLL CONTROL</div>
      <h1 style={titleStyle}>{title}</h1>
      <p style={leadStyle}>{description}</p>
      {mode === "execute" && <ExecuteIntegrated />}
      {mode === "payslips" && <ApprovedPayslips />}
      {mode === "statutory" && <StatutoryCatalogue />}
    </section>
  );
}

function ExecuteIntegrated() {
  const { data: periods, error: periodsError } = useLoad("/api/payroll/periods");
  const { data: runs, loading, error, setError, load } = useLoad("/api/payroll/runs");
  const { data: policyData } = useLoad("/api/payroll/compliance-policy", {});
  const [periodId, setPeriodId] = useState("");
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const selectablePeriods = (periods || []).filter((period) => period.status !== "CLOSED");

  const fetchIntegratedLines = async (runId) => {
    const response = await apiRequest(`/api/payroll/runs/${runId}/integrated-lines`);
    setLines(response?.data || []);
  };

  const calculate = async () => {
    try {
      setBusy("calculate"); setError(""); setMessage("");
      const response = await apiRequest("/api/payroll/runs/draft", { method: "POST", body: { periodId } });
      const runId = response?.data?.run?.id;
      if (runId) await fetchIntegratedLines(runId);
      setMessage("Payroll recalculated. Review all employee lines before submission.");
      await load();
    } catch (err) {
      setError(err.message || "Unable to calculate payroll.");
    } finally {
      setBusy("");
    }
  };

  const viewLines = async (runId) => {
    try {
      setBusy(runId); setError("");
      await fetchIntegratedLines(runId);
    } catch (err) {
      setError(err.message || "Unable to load payroll lines.");
    } finally {
      setBusy("");
    }
  };

  const submit = async (runId) => {
    try {
      setBusy(`submit-${runId}`); setError(""); setMessage("");
      await apiRequest(`/api/payroll/runs/${runId}/submit`, {
        method: "POST",
        body: { notes: "Submitted after integrated payroll review including statutory, Salary Advance and Loan recoveries." },
      });
      setMessage("Payroll submitted for approval. Loan and Salary Advance balances remain unchanged until approval.");
      await load();
    } catch (err) {
      setError(err.message || "Unable to submit payroll.");
    } finally {
      setBusy("");
    }
  };

  const reopen = async (run) => {
    const reason = window.prompt(`Reason for reopening approved payroll ${run.periodCode}:`);
    if (!reason?.trim()) return;
    try {
      setBusy(`reopen-${run.id}`); setError(""); setMessage("");
      const response = await apiRequest(`/api/payroll/runs/${run.id}/reopen`, { method: "POST", body: { reason: reason.trim() } });
      setPeriodId(run.periodId || "");
      await fetchIntegratedLines(run.id);
      setMessage(response?.message || "Approved payroll reopened to Draft. Recalculate before resubmission.");
      await load();
    } catch (err) {
      setError(err.message || "Unable to reopen approved payroll.");
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <Panel title="Integrated Draft Payroll">
        <div style={buttonRow}>
          <Select label="Payroll Period" value={periodId} onChange={setPeriodId} options={[["", "Select payroll period"], ...selectablePeriods.map((p) => [p.id, `${p.code} — ${p.name}`])]} />
          <button type="button" style={primaryButton} disabled={!periodId || busy || !policyData?.configured} onClick={calculate}>{busy === "calculate" ? "Calculating…" : "Calculate Payroll"}</button>
        </div>
        <p style={controlNote}>Loan installments become eligible in the payroll draft from the beginning of the configured recovery month. Draft and Submitted payroll affect Net Pay preview only; Loan and Salary Advance balances reduce on payroll approval. Manual Worked Days entered for the exact payroll period override standard attendance days for that employee. An approved payroll may be reopened for correction: CHRiS reverses its posted Loan/Salary Advance effects, changes the run to DRAFT + RECALCULATION_REQUIRED, and requires recalculation, resubmission and reapproval.</p>
        <ManualWorkedDaysPanel periods={selectablePeriods} onSaved={async () => { setMessage("Worked days saved. Recalculate the affected payroll before submission."); await load(); }} />
      </Panel>

      <Feedback error={periodsError || error || (!policyData?.configured ? "Nigeria payroll policy is not configured." : "")} />
      {message && <div style={infoStyle}>{message}</div>}

      <Panel title="Payroll Runs">
        <DataTable loading={loading} columns={["Period", "Status", "Statutory", "Employees", "Gross", "Deductions", "Net", "Action"]}>
          {(runs || []).map((run) => (
            <tr key={run.id}>
              <Td strong>{run.periodCode}</Td><Td><Badge>{run.status}</Badge></Td><Td><Badge>{run.statutoryStatus}</Badge></Td><Td>{run.employeeCount}</Td>
              <Td>{money(run.grossTotal)}</Td><Td>{money(run.deductionTotal)}</Td><Td>{money(run.netPreviewTotal)}</Td>
              <Td><div style={buttonRow}>
                <button type="button" style={smallButton} disabled={busy === run.id} onClick={() => viewLines(run.id)}>View</button>
                {(run.status === "DRAFT" || run.status === "REJECTED") && <button type="button" style={smallButton} disabled={busy === `submit-${run.id}`} onClick={() => submit(run.id)}>Submit</button>}
                {run.status === "APPROVED" && <button type="button" style={smallButton} disabled={busy === `reopen-${run.id}`} onClick={() => reopen(run)}>{busy === `reopen-${run.id}` ? "Reopening…" : "Reopen for Correction"}</button>}
              </div></Td>
            </tr>
          ))}
        </DataTable>
      </Panel>

      {lines.length > 0 && <Panel title="Employee Payroll Calculation"><PayrollLines rows={lines} /></Panel>}
    </>
  );
}

function PayrollLines({ rows }) {
  const getSearchText = useCallback((row) => [row.employeeNumber, row.employeeName, row.details?.employmentType, row.details?.costCentre].filter(Boolean).join(" "), []);
  return (
    <EmployeeBatchSelector
      rows={rows || []}
      getId={(row) => row.id}
      getSearchText={getSearchText}
      searchPlaceholder="Search employee number, name, employment type or cost centre"
      selectionLabel="payroll employee(s)"
      renderActions={({ selectedRows }) => selectedRows.length ? (
        <div style={batchSummaryStyle}><strong>Selected batch:</strong> {selectedRows.length} employee(s) · Gross {money(selectedRows.reduce((sum, row) => sum + Number(row.grossPay || 0), 0))} · Net {money(selectedRows.reduce((sum, row) => sum + Number(row.netPreview || 0), 0))}</div>
      ) : null}
    >
      {({ displayRows, isSelected, toggleOne, toggleFiltered, allFilteredSelected, someFilteredSelected }) => (
        <DataTable columns={["Select", "Employee", "Days", "Basic", "Other Earnings", "PAYE", "Pension", "Other Ded.", "Salary Advance", "Loan", "Gross", "Net"]}>
          <tr style={{ display: "none" }}><td>{String(allFilteredSelected)}{String(someFilteredSelected)}<button type="button" onClick={toggleFiltered}>toggle</button></td></tr>
          {displayRows.map((row) => {
            const details = row.details || {};
            const statutory = details.statutory || {};
            const structure = details.salaryStructure || {};
            const customAllowances = (details.customAllowances || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
            const customDeductions = (details.customDeductions || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
            return (
              <tr key={row.id}>
                <Td><input type="checkbox" aria-label={`Select ${row.employeeNumber} ${row.employeeName}`} checked={isSelected(row)} onChange={() => toggleOne(row)} /></Td>
                <Td strong>{row.employeeNumber} — {row.employeeName}</Td>
                <Td>{details.attendance ? `${details.attendance.payableDays}/${details.attendance.standardDays}` : "—"}</Td>
                <Td>{money(structure.basic ?? row.baseSalary, row.currency)}</Td>
                <Td>{money(customAllowances, row.currency)}</Td>
                <Td>{money(statutory.payeTax, row.currency)}</Td>
                <Td>{money(statutory.employeePension, row.currency)}</Td>
                <Td>{money(customDeductions, row.currency)}</Td>
                <Td>{money(row.advanceRecovery, row.currency)}</Td>
                <Td>{money(row.loanRecovery, row.currency)}</Td>
                <Td>{money(row.grossPay, row.currency)}</Td>
                <Td strong>{money(row.netPreview, row.currency)}</Td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </EmployeeBatchSelector>
  );
}

function ApprovedPayslips() {
  const { data: rows, loading, error } = useLoad("/api/payroll/payslips");
  const [selected, setSelected] = useState(null);
  const getSearchText = useCallback((row) => [row.employeeNumber, row.employeeName, row.periodCode, row.periodName].filter(Boolean).join(" "), []);
  return (
    <>
      <Panel title="Approved Payroll Payslips">
        <p style={controlNote}>Only APPROVED payroll runs appear here. If an approved payroll is reopened for correction, its payslips stop appearing until the replacement draft is recalculated, submitted and approved again.</p>
        <EmployeeBatchSelector
          rows={rows || []}
          getId={(row) => row.id}
          getSearchText={getSearchText}
          searchPlaceholder="Search employee number, employee name or payroll period"
          selectionLabel="payslip(s)"
          renderActions={({ selectedRows, setSelectedOnly }) => selectedRows.length ? <button type="button" style={smallButton} onClick={() => setSelectedOnly(true)}>Batch View Selected Payslips</button> : null}
        >
          {({ displayRows, isSelected, toggleOne }) => (
            <DataTable loading={loading} columns={["Select", "Period", "Employee", "Gross", "PAYE", "Pension", "Advance", "Loan", "Net", "Action"]}>
              {displayRows.map((row) => {
                const statutory = row.details?.statutory || {};
                return <tr key={row.id}>
                  <Td><input type="checkbox" aria-label={`Select payslip ${row.employeeNumber} ${row.periodCode}`} checked={isSelected(row)} onChange={() => toggleOne(row)} /></Td>
                  <Td strong>{row.periodCode}</Td><Td>{row.employeeNumber} — {row.employeeName}</Td><Td>{money(row.grossPay, row.currency)}</Td>
                  <Td>{money(statutory.payeTax, row.currency)}</Td><Td>{money(statutory.employeePension, row.currency)}</Td><Td>{money(row.advanceRecovery, row.currency)}</Td><Td>{money(row.loanRecovery, row.currency)}</Td><Td strong>{money(row.netPreview, row.currency)}</Td>
                  <Td><button type="button" style={smallButton} onClick={() => setSelected(row)}>View Payslip</button></Td>
                </tr>;
              })}
            </DataTable>
          )}
        </EmployeeBatchSelector>
      </Panel>
      <Feedback error={error} />
      {selected && <PayslipCard row={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function PayslipCard({ row, onClose }) {
  const details = row.details || {};
  const statutory = details.statutory || {};
  const structure = details.salaryStructure || {};
  const attendance = details.attendance || {};
  const customAllowances = (details.customAllowances || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const customDeductions = (details.customDeductions || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  return (
    <Panel title={`Payslip · ${row.periodCode} · ${row.employeeNumber} — ${row.employeeName}`}>
      <div style={summaryGrid}>
        <Summary label="Employee" value={`${row.employeeNumber} — ${row.employeeName}`} />
        <Summary label="Payroll Period" value={`${row.periodStart} → ${row.periodEnd}`} />
        <Summary label="Pay Date" value={row.payDate || "—"} />
        <Summary label="Worked Days" value={attendance.payableDays != null ? `${attendance.payableDays} / ${attendance.standardDays}` : "—"} />
        <Summary label="Attendance Source" value={attendance.source ? String(attendance.source).replaceAll("_", " ") : "—"} />
        <Summary label="Status" value="Approved Payroll" />
      </div>
      <div style={{ marginTop: 16 }}>
        <DataTable columns={["Earnings / Deductions", "Amount"]}>
          <tr><Td strong>Basic</Td><Td>{money(structure.basic ?? row.baseSalary, row.currency)}</Td></tr>
          {Object.entries(structure).filter(([key]) => key !== "basic").map(([key, value]) => <tr key={key}><Td>{key.charAt(0).toUpperCase() + key.slice(1)}</Td><Td>{money(value, row.currency)}</Td></tr>)}
          <tr><Td>Other Earnings</Td><Td>{money(customAllowances, row.currency)}</Td></tr>
          <tr><Td strong>Gross Pay</Td><Td strong>{money(row.grossPay, row.currency)}</Td></tr>
          <tr><Td>PAYE</Td><Td>{money(statutory.payeTax, row.currency)}</Td></tr>
          <tr><Td>Pension</Td><Td>{money(statutory.employeePension, row.currency)}</Td></tr>
          <tr><Td>Other Deductions</Td><Td>{money(customDeductions, row.currency)}</Td></tr>
          <tr><Td>Salary Advance Recovery</Td><Td>{money(row.advanceRecovery, row.currency)}</Td></tr>
          <tr><Td>Loan Recovery</Td><Td>{money(row.loanRecovery, row.currency)}</Td></tr>
          <tr><Td strong>Net Pay</Td><Td strong>{money(row.netPreview, row.currency)}</Td></tr>
        </DataTable>
      </div>
      <div style={{ ...buttonRow, marginTop: 14 }}><button type="button" style={secondaryButton} onClick={onClose}>Close</button><button type="button" style={primaryButton} onClick={() => window.print()}>Print Payslip</button></div>
    </Panel>
  );
}

function StatutoryCatalogue() {
  const { data, loading, error } = useLoad("/api/payroll/statutory-catalogue", {});
  const items = data?.items || [];
  return (
    <>
      <Panel title={`Statutory Catalogue${data?.policyCode ? ` · ${data.policyCode} v${data.policyVersion}` : ""}`}>
        <p style={controlNote}>CHRiS distinguishes employee deductions from employer-only obligations. Items marked REVIEW BEFORE ACTIVATION are visible for governance but are not deducted until ZERMATT explicitly activates them and required employee/applicability data exists.</p>
        <DataTable loading={loading} columns={["Item", "Category", "Frequency", "Status", "Configured Basis", "Payroll Effect"]}>
          {items.map((item) => <tr key={item.code}><Td strong>{item.name}</Td><Td>{item.category}</Td><Td>{item.payrollFrequency}</Td><Td><Badge>{item.status}</Badge></Td><Td>{item.basis}</Td><Td>{item.employeeEffect}</Td></tr>)}
        </DataTable>
      </Panel>
      <Feedback error={error} />
      {data?.control && <div style={infoStyle}>{data.control}</div>}
    </>
  );
}

function Summary({ label, value }) { return <div style={summaryCard}><div style={summaryLabel}>{label}</div><strong>{value}</strong></div>; }
function Panel({ title, children }) { return <section style={panelStyle}><h2 style={panelTitle}>{title}</h2>{children}</section>; }
function Feedback({ error }) { return error ? <div role="alert" style={errorStyle}>{error}</div> : null; }
function Select({ label, value, onChange, options }) { return <label style={fieldLabel}><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>{options.map(([key, name]) => <option key={key || "blank"} value={key}>{name}</option>)}</select></label>; }
function DataTable({ columns, children, loading = false }) { return <div style={tableWrap}>{loading ? <div style={loadingStyle}>Loading…</div> : <table style={tableStyle}><thead><tr>{columns.map((column) => <th key={column} style={thStyle}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table>}</div>; }
function Td({ children, strong = false }) { return <td style={{ ...tdStyle, ...(strong ? { fontWeight: 900, color: "#F7FAF8" } : {}) }}>{children}</td>; }
function Badge({ children }) { return <span style={badgeStyle}>{String(children || "—").replaceAll("_", " ")}</span>; }

const pageStyle = { maxWidth: 1500, margin: "0 auto", color: "#F7FAF8" };
const backButton = { border: 0, background: "transparent", color: "#D4AF37", fontWeight: 900, cursor: "pointer", padding: "0 0 14px" };
const eyebrow = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle = { margin: "6px 0", fontSize: 32 };
const leadStyle = { color: "#C7D3CC", lineHeight: 1.65, maxWidth: 1050, marginBottom: 22 };
const panelStyle = { marginTop: 18, padding: 20, border: "1px solid rgba(212,175,55,.45)", borderRadius: 15, background: "linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96))", boxShadow: "0 15px 38px rgba(0,0,0,.24)" };
const panelTitle = { margin: "0 0 15px", fontSize: 18, color: "#D4AF37" };
const fieldLabel = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800, minWidth: 220 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8", outline: "none" };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.5)" };
const smallButton = { ...secondaryButton, padding: "7px 10px", fontSize: 12 };
const buttonRow = { display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" };
const controlNote = { color: "#A9BDB2", lineHeight: 1.6, fontSize: 13 };
const tableWrap = { width: "100%", overflowX: "auto" };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle = { padding: "10px", borderBottom: "1px solid rgba(212,175,55,.35)", textAlign: "left", color: "#D4AF37", fontSize: 11, whiteSpace: "nowrap" };
const tdStyle = { padding: "10px", borderBottom: "1px solid rgba(255,255,255,.08)", color: "#C7D3CC", fontSize: 12, verticalAlign: "top" };
const badgeStyle = { display: "inline-block", padding: "4px 7px", borderRadius: 999, border: "1px solid rgba(212,175,55,.35)", color: "#F7D66A", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" };
const errorStyle = { marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(127,29,29,.35)", border: "1px solid rgba(248,113,113,.45)", color: "#FCA5A5" };
const infoStyle = { marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(14,71,48,.42)", border: "1px solid rgba(212,175,55,.35)", color: "#C7D3CC", lineHeight: 1.6 };
const loadingStyle = { padding: 14, color: "#C7D3CC" };
const summaryGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 };
const summaryCard = { padding: 12, border: "1px solid rgba(212,175,55,.25)", borderRadius: 10, background: "rgba(255,255,255,.04)" };
const summaryLabel = { color: "#9FB7AA", fontSize: 11, marginBottom: 5 };
const batchSummaryStyle = { display: "flex", alignItems: "center", minHeight: 36, padding: "0 4px", color: "#C7D3CC", fontSize: 12 };
