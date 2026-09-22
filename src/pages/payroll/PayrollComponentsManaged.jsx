import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmployeeSearchSelect from "../../components/EmployeeSearchSelect";
import { apiRequest, apiDownload, saveDownloadedBlob } from "../../services/api";

const money = (value) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value || 0));
const number = (value) => Number(value || 0);
const monthLabel = (year, month) => new Intl.DateTimeFormat("en-NG", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

function addMonths(year, month, offset) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function buildSchedulePreview({ totalAmount, scheduleMethod, installmentCount, installmentAmount, period }) {
  const totalCents = Math.round(number(totalAmount) * 100);
  if (!period || totalCents <= 0) return [];
  const start = new Date(`${String(period.periodStart || "").slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return [];
  let count = 0;
  let nominalCents = 0;
  if (scheduleMethod === "INSTALLMENT_COUNT") {
    count = Math.floor(number(installmentCount));
    if (count < 1) return [];
    nominalCents = Math.floor(totalCents / count);
  } else {
    nominalCents = Math.round(number(installmentAmount) * 100);
    if (nominalCents <= 0) return [];
    nominalCents = Math.min(nominalCents, totalCents);
    count = Math.ceil(totalCents / nominalCents);
  }
  if (count < 1 || count > 120 || nominalCents <= 0) return [];
  let remaining = totalCents;
  return Array.from({ length: count }, (_, index) => {
    const slot = addMonths(start.getUTCFullYear(), start.getUTCMonth() + 1, index);
    const cents = index === count - 1 ? remaining : Math.min(nominalCents, remaining);
    remaining -= cents;
    return {
      installmentNumber: index + 1,
      year: slot.year,
      month: slot.month,
      label: monthLabel(slot.year, slot.month),
      amount: cents / 100,
    };
  });
}

function formulaDescription(component) {
  switch (component?.calculationType) {
    case "GROSS_DIV_26_REGULAR": return "Gross ÷ 26 × regular work days";
    case "GROSS_DIV_26_X2": return "Gross ÷ 26 × public-holiday days × 2";
    case "GROSS_DIV_26_X1_5": return "Gross ÷ 26 × extra days × 1.5";
    case "GROSS_DIV_208_X1_25": return "Gross ÷ 208 × extra hours × 1.25";
    default: return "Entered amount";
  }
}

function quantityLabel(component) {
  switch (component?.calculationType) {
    case "GROSS_DIV_26_REGULAR": return "Regular work days outstanding";
    case "GROSS_DIV_26_X2": return "Public holiday days worked";
    case "GROSS_DIV_26_X1_5": return "Extra days worked";
    case "GROSS_DIV_208_X1_25": return "Extra hours worked";
    default: return "Quantity";
  }
}

export default function PayrollComponentsManaged({ kind }) {
  const navigate = useNavigate();
  const isDeduction = kind === "DEDUCTION";
  const legacyPath = isDeduction ? "deductions" : "allowances";
  const title = isDeduction ? "Other Deductions" : "Other Allowances";

  const blankInput = useCallback(() => ({
    employeeNumber: "",
    componentCode: "",
    frequency: "ONE_TIME",
    payrollPeriodId: "",
    amount: "",
    quantity: "",
    referencePayrollPeriodId: "",
    totalAmount: "",
    scheduleMethod: "INSTALLMENT_COUNT",
    installmentCount: "",
    installmentAmount: "",
    startPayrollPeriodId: "",
    reference: "",
    remarks: "",
  }), []);

  const blankComponent = useCallback(() => ({
    code: "",
    name: "",
    calculationType: "ENTERED_AMOUNT",
    taxable: !isDeduction,
    installmentEligible: isDeduction,
    notes: "",
  }), [isDeduction]);

  const [components, setComponents] = useState([]);
  const [inputs, setInputs] = useState([]);
  const [plans, setPlans] = useState([]);
  const [legacyRows, setLegacyRows] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [form, setForm] = useState(blankInput);
  const [componentForm, setComponentForm] = useState(blankComponent);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const requests = [
        apiRequest(`/api/payroll/variable-components?kind=${kind}`),
        apiRequest(`/api/payroll/variable-inputs?kind=${kind}`),
        apiRequest("/api/payroll/periods"),
        apiRequest(`/api/payroll/${legacyPath}`),
      ];
      if (isDeduction) requests.push(apiRequest("/api/payroll/deduction-plans"));
      const [componentResult, inputResult, periodResult, legacyResult, planResult] = await Promise.all(requests);
      const nextPeriods = periodResult?.data || [];
      setComponents(componentResult?.data || []);
      setInputs(inputResult?.data || []);
      setPeriods(nextPeriods);
      setLegacyRows(legacyResult?.data || []);
      setPlans(isDeduction ? (planResult?.data || []) : []);
      setForm((current) => {
        const openPeriods = nextPeriods.filter((period) => period.status !== "CLOSED");
        const defaultPeriod = openPeriods.find((period) => {
          const today = new Date().toISOString().slice(0, 10);
          return period.periodStart <= today && period.periodEnd >= today;
        }) || openPeriods[0];
        const defaultComponent = (componentResult?.data || [])[0];
        return {
          ...current,
          componentCode: current.componentCode || defaultComponent?.code || "",
          payrollPeriodId: current.payrollPeriodId || defaultPeriod?.id || "",
          startPayrollPeriodId: current.startPayrollPeriodId || defaultPeriod?.id || "",
        };
      });
      setError("");
    } catch (requestError) {
      setError(requestError?.message || `Unable to load ${title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [isDeduction, kind, legacyPath, title]);

  useEffect(() => { load(); }, [load]);

  const selectedComponent = useMemo(
    () => components.find((component) => component.code === form.componentCode) || null,
    [components, form.componentCode]
  );
  const selectedStartPeriod = useMemo(
    () => periods.find((period) => period.id === form.startPayrollPeriodId) || null,
    [periods, form.startPayrollPeriodId]
  );
  const schedulePreview = useMemo(() => buildSchedulePreview({
    totalAmount: form.totalAmount,
    scheduleMethod: form.scheduleMethod,
    installmentCount: form.installmentCount,
    installmentAmount: form.installmentAmount,
    period: selectedStartPeriod,
  }), [form.installmentAmount, form.installmentCount, form.scheduleMethod, form.totalAmount, selectedStartPeriod]);

  const setField = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));
  const setComponentField = (field) => (value) => setComponentForm((current) => ({ ...current, [field]: value }));

  const saveInput = async (event) => {
    event.preventDefault();
    try {
      setBusy("save"); setError(""); setMessage("");
      if (isDeduction && form.frequency === "RECURRING") {
        const response = await apiRequest("/api/payroll/deduction-plans", {
          method: "POST",
          body: {
            employeeNumber: form.employeeNumber,
            componentCode: form.componentCode,
            totalAmount: form.totalAmount,
            scheduleMethod: form.scheduleMethod,
            installmentCount: form.installmentCount,
            installmentAmount: form.installmentAmount,
            startPayrollPeriodId: form.startPayrollPeriodId,
            reference: form.reference,
            remarks: form.remarks,
          },
        });
        setMessage(response?.message || "Recurring deduction schedule created.");
      } else {
        const response = await apiRequest("/api/payroll/variable-inputs", {
          method: "POST",
          body: {
            employeeNumber: form.employeeNumber,
            kind,
            componentCode: form.componentCode,
            payrollPeriodId: form.payrollPeriodId,
            amount: form.amount,
            quantity: form.quantity,
            referencePayrollPeriodId: form.referencePayrollPeriodId || null,
            reference: form.reference,
            remarks: form.remarks,
          },
        });
        setMessage(response?.message || "Payroll input saved.");
      }
      setForm(blankInput());
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to save payroll input.");
    } finally {
      setBusy("");
    }
  };

  const createComponent = async (event) => {
    event.preventDefault();
    try {
      setBusy("component"); setError(""); setMessage("");
      const response = await apiRequest("/api/payroll/variable-components", {
        method: "POST",
        body: { ...componentForm, kind },
      });
      setComponentForm(blankComponent());
      setMessage(`${response?.data?.name || "Payroll component"} created.`);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to create payroll component.");
    } finally {
      setBusy("");
    }
  };

  const downloadTemplate = async () => {
    try {
      setBusy("download"); setError("");
      const file = await apiDownload(`/api/payroll/variable-inputs/template?kind=${kind}`);
      saveDownloadedBlob(file);
    } catch (requestError) {
      setError(requestError?.message || "Unable to download bulk-upload template.");
    } finally {
      setBusy("");
    }
  };

  const previewBulk = async () => {
    if (!bulkFile) return;
    try {
      setBusy("preview"); setError(""); setMessage("");
      const body = new FormData();
      body.append("file", bulkFile);
      const response = await apiRequest(`/api/payroll/variable-inputs/bulk/preview?kind=${kind}`, { method: "POST", body });
      setBulkPreview(response?.data || null);
    } catch (requestError) {
      setBulkPreview(null);
      setError(requestError?.message || "Unable to validate bulk-upload workbook.");
    } finally {
      setBusy("");
    }
  };

  const importBulk = async () => {
    if (!bulkFile) return;
    try {
      setBusy("import"); setError(""); setMessage("");
      const body = new FormData();
      body.append("file", bulkFile);
      const response = await apiRequest(`/api/payroll/variable-inputs/bulk/import?kind=${kind}`, { method: "POST", body });
      setBulkPreview(null);
      setBulkFile(null);
      setMessage(`Bulk import completed: ${response?.data?.created || 0} created, ${response?.data?.failed || 0} failed.`);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to import payroll-input workbook.");
    } finally {
      setBusy("");
    }
  };

  const openPeriods = periods.filter((period) => period.status !== "CLOSED");

  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>ZERMATT PAYROLL INPUT CONTROL</div>
      <h1 style={titleStyle}>{title}</h1>
      <p style={leadStyle}>{isDeduction
        ? "Record one-time deductions or finite recurring installment schedules. Recurring deductions stop automatically after the final mapped payroll month."
        : "Record payroll-period allowances. CHRiS calculates day/hour-based earnings from the employee's authoritative monthly gross salary."}</p>

      <Panel title={isDeduction ? "Record Employee Deduction" : "Record Employee Allowance"}>
        <form style={formGrid} onSubmit={saveInput}>
          <EmployeeSearchSelect label="Employee" value={form.employeeNumber} onChange={setField("employeeNumber")} placeholder="Search employee number or name" />
          <Select label="Component" value={form.componentCode} onChange={setField("componentCode")} options={components.map((component) => [component.code, `${component.code} — ${component.name}`])} />
          {isDeduction && <Select label="Frequency" value={form.frequency} onChange={setField("frequency")} options={[["ONE_TIME", "One-Time"], ["RECURRING", "Recurring / Installments"]]} />}

          {(!isDeduction || form.frequency === "ONE_TIME") && <>
            <Select label="Payroll Period" value={form.payrollPeriodId} onChange={setField("payrollPeriodId")} options={openPeriods.map((period) => [period.id, `${period.code} — ${period.name}`])} />
            {selectedComponent?.calculationType === "ENTERED_AMOUNT"
              ? <Input type="number" label="Amount" value={form.amount} onChange={setField("amount")} min="0.01" step="0.01" required />
              : <Input type="number" label={quantityLabel(selectedComponent)} value={form.quantity} onChange={setField("quantity")} min="0.01" step="0.01" required />}
            <Select label="Reference Payroll Period (optional)" value={form.referencePayrollPeriodId} onChange={setField("referencePayrollPeriodId")} options={[["", "None"], ...periods.map((period) => [period.id, `${period.code} — ${period.name}`])]} />
          </>}

          {isDeduction && form.frequency === "RECURRING" && <>
            <Input type="number" label="Total Amount to Deduct" value={form.totalAmount} onChange={setField("totalAmount")} min="0.01" step="0.01" required />
            <Select label="Schedule By" value={form.scheduleMethod} onChange={setField("scheduleMethod")} options={[["INSTALLMENT_COUNT", "Number of Installments"], ["INSTALLMENT_AMOUNT", "Amount Per Installment"]]} />
            {form.scheduleMethod === "INSTALLMENT_COUNT"
              ? <Input type="number" label="Number of Installments" value={form.installmentCount} onChange={setField("installmentCount")} min="1" max="120" step="1" required />
              : <Input type="number" label="Amount Per Installment" value={form.installmentAmount} onChange={setField("installmentAmount")} min="0.01" step="0.01" required />}
            <Select label="Start Payroll Period" value={form.startPayrollPeriodId} onChange={setField("startPayrollPeriodId")} options={openPeriods.map((period) => [period.id, `${period.code} — ${period.name}`])} />
          </>}

          <Input label="Reference" value={form.reference} onChange={setField("reference")} placeholder="Bill/reference number" />
          <Input label="Remarks" value={form.remarks} onChange={setField("remarks")} placeholder="Reason or approval note" />
          <div><button type="submit" style={primaryButton} disabled={busy === "save" || !form.employeeNumber || !form.componentCode}>{busy === "save" ? "Saving…" : isDeduction && form.frequency === "RECURRING" ? "Create Installment Schedule" : "Save Payroll Input"}</button></div>
        </form>

        {selectedComponent && <div style={formulaNote}>
          <strong>{selectedComponent.code}</strong> · {formulaDescription(selectedComponent)}
          {selectedComponent.calculationType === "GROSS_DIV_208_X1_25" ? " · 8 hours/day; 26 days = 208 hours." : ""}
        </div>}

        {isDeduction && form.frequency === "RECURRING" && schedulePreview.length > 0 && <div style={scheduleBox}>
          <strong>Installment Preview</strong>
          <div style={scheduleGrid}>
            {schedulePreview.map((item) => <span key={item.installmentNumber} style={scheduleChip}>{item.installmentNumber}. {item.label}: {money(item.amount)}</span>)}
          </div>
          <div style={scheduleFooter}>Starts {schedulePreview[0]?.label} · Ends {schedulePreview[schedulePreview.length - 1]?.label} · No deduction continues beyond the final installment.</div>
        </div>}
      </Panel>

      <Panel title="Bulk Upload">
        <p style={controlNote}>Download the controlled Excel template, complete employee/component inputs, validate the workbook, review row-level errors, then import. Formula-based allowances require days/hours, not a manually calculated amount.</p>
        <div style={buttonRow}>
          <button type="button" style={smallButton} disabled={busy === "download"} onClick={downloadTemplate}>{busy === "download" ? "Preparing…" : "Download Template"}</button>
          <input type="file" accept=".xlsx,.xls" onChange={(event) => { setBulkFile(event.target.files?.[0] || null); setBulkPreview(null); }} />
          <button type="button" style={smallButton} disabled={!bulkFile || busy === "preview"} onClick={previewBulk}>{busy === "preview" ? "Validating…" : "Validate / Preview"}</button>
          <button type="button" style={primaryButton} disabled={!bulkFile || !bulkPreview || bulkPreview.invalidRows > 0 || busy === "import"} onClick={importBulk}>{busy === "import" ? "Importing…" : "Confirm Import"}</button>
        </div>
        {bulkPreview && <div style={bulkSummary}>
          <strong>{bulkPreview.totalRows} rows</strong> · {bulkPreview.validRows} valid · {bulkPreview.invalidRows} errors
          {bulkPreview.invalidRows > 0 && <span> · Correct the invalid rows before import.</span>}
        </div>}
        {bulkPreview?.rows?.length > 0 && <DataTable columns={["Row", "Employee", "Component", "Period / Schedule", "Status"]}>
          {bulkPreview.rows.slice(0, 100).map((row) => <tr key={row.rowNumber}>
            <Td>{row.rowNumber}</Td>
            <Td strong>{row.display?.employeeNumber}{row.display?.employeeName ? ` — ${row.display.employeeName}` : ""}</Td>
            <Td>{row.display?.componentCode}{row.display?.componentName ? ` — ${row.display.componentName}` : ""}</Td>
            <Td>{row.frequency === "RECURRING" ? (row.display?.schedule || []).map((item) => `${item.period}: ${money(item.amount)}`).join(" · ") : row.display?.payrollPeriod}</Td>
            <Td>{row.valid ? <Badge>VALID</Badge> : <span style={errorText}>{(row.errors || []).join(" ")}</span>}</Td>
          </tr>)}
        </DataTable>}
      </Panel>

      <Panel title="Create Additional Payroll Component">
        <p style={controlNote}>Use this when ZERMATT needs a new allowance or deduction beyond the standard catalogue. A code is generated automatically when Code is left blank.</p>
        <form style={formGrid} onSubmit={createComponent}>
          <Input label="Code (optional)" value={componentForm.code} onChange={setComponentField("code")} placeholder={isDeduction ? "DED-..." : "ALW-..."} />
          <Input label="Component Name" value={componentForm.name} onChange={setComponentField("name")} required />
          <Select label="Calculation Method" value={componentForm.calculationType} onChange={setComponentField("calculationType")} options={isDeduction
            ? [["ENTERED_AMOUNT", "Entered Amount"]]
            : [
                ["ENTERED_AMOUNT", "Entered Amount"],
                ["GROSS_DIV_26_REGULAR", "Gross ÷ 26 × Regular Days"],
                ["GROSS_DIV_26_X2", "Gross ÷ 26 × Days × 2"],
                ["GROSS_DIV_26_X1_5", "Gross ÷ 26 × Days × 1.5"],
                ["GROSS_DIV_208_X1_25", "Gross ÷ 208 × Hours × 1.25"],
              ]} />
          {!isDeduction && <label style={checkboxLabel}><input type="checkbox" checked={componentForm.taxable} onChange={(event) => setComponentForm((current) => ({ ...current, taxable: event.target.checked }))} /> Taxable earning</label>}
          {isDeduction && <label style={checkboxLabel}><input type="checkbox" checked={componentForm.installmentEligible} onChange={(event) => setComponentForm((current) => ({ ...current, installmentEligible: event.target.checked }))} /> Allow finite installments</label>}
          <Input label="Notes" value={componentForm.notes} onChange={setComponentField("notes")} />
          <div><button type="submit" style={primaryButton} disabled={busy === "component"}>{busy === "component" ? "Creating…" : "Create Component"}</button></div>
        </form>
      </Panel>

      {error && <Feedback>{error}</Feedback>}
      {message && <div style={successStyle}>{message}</div>}

      <Panel title={isDeduction ? "Recurring Deduction Plans" : "Payroll Input Register"}>
        {isDeduction ? <DataTable loading={loading} columns={["Employee", "Component", "Total", "Outstanding", "Installments", "Start", "Finish", "Status"]}>
          {plans.map((row) => <tr key={row.id}>
            <Td strong>{row.employeeNumber} — {row.employeeName}</Td>
            <Td>{row.componentCode} — {row.componentName}</Td>
            <Td>{money(row.totalAmount)}</Td><Td>{money(row.outstandingAmount)}</Td>
            <Td>{row.installmentCount} × {money(row.nominalInstallmentAmount)}</Td>
            <Td>{row.startPeriod}</Td><Td>{row.endPeriod}</Td><Td><Badge>{row.status}</Badge></Td>
          </tr>)}
        </DataTable> : <InputRegister rows={inputs} />}
      </Panel>

      {isDeduction && <Panel title="One-Time Deduction Inputs"><InputRegister rows={inputs} /></Panel>}

      {legacyRows.length > 0 && <Panel title="Existing Effective-Dated Components">
        <p style={controlNote}>These are earlier fixed/percentage payroll components retained for history and audit. For ZERMATT, indefinite legacy Other Allowances/Deductions do not carry into a new payroll period. Only an item explicitly tied to the selected period can participate; new recurring deductions must use the finite installment schedule above.</p>
        <DataTable columns={["Scope", "Code", "Name", "Value", "Effective", "Status"]}>
          {legacyRows.map((row) => <tr key={row.id}>
            <Td strong>{row.employeeNumber || "ALL"}</Td><Td>{row.code}</Td><Td>{row.name}</Td>
            <Td>{row.calculationType === "FIXED" ? money(row.amount) : `${row.percentage}% Gross`}</Td>
            <Td>{row.effectiveFrom}{row.effectiveTo ? ` → ${row.effectiveTo}` : " → open"}</Td><Td><Badge>{row.status}</Badge></Td>
          </tr>)}
        </DataTable>
      </Panel>}
    </section>
  );
}

function InputRegister({ rows }) {
  return <DataTable columns={["Period", "Employee", "Component", "Input", "Reference Period", "Source", "Status"]}>
    {(rows || []).map((row) => <tr key={row.id}>
      <Td>{row.payrollPeriodCode}</Td>
      <Td strong>{row.employeeNumber} — {row.employeeName}</Td>
      <Td>{row.componentCode} — {row.componentName}</Td>
      <Td>{row.calculationType === "ENTERED_AMOUNT" ? money(row.manualAmount) : `${row.quantity} · ${formulaDescription(row)}`}</Td>
      <Td>{row.referencePayrollPeriodCode || "—"}</Td>
      <Td>{String(row.source || "").replaceAll("_", " ")}</Td>
      <Td><Badge>{row.status}</Badge></Td>
    </tr>)}
  </DataTable>;
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
const smallButton = { borderRadius: 9, padding: "9px 12px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(212,175,55,.45)", color: "#F7FAF8", fontWeight: 800, cursor: "pointer" };
const buttonRow = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" };
const checkboxLabel = { display: "flex", alignItems: "center", gap: 8, color: "#C7D3CC", fontSize: 12, fontWeight: 800 };
const controlNote = { margin: "0 0 14px", color: "#C7D3CC", lineHeight: 1.55, fontSize: 12 };
const formulaNote = { marginTop: 14, padding: 12, border: "1px solid rgba(212,175,55,.3)", borderRadius: 10, color: "#C7D3CC", background: "rgba(212,175,55,.06)" };
const scheduleBox = { marginTop: 14, padding: 14, borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(212,175,55,.25)" };
const scheduleGrid = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 };
const scheduleChip = { padding: "7px 9px", borderRadius: 999, background: "rgba(212,175,55,.08)", border: "1px solid rgba(212,175,55,.3)", color: "#F7FAF8", fontSize: 12 };
const scheduleFooter = { marginTop: 10, color: "#D4AF37", fontSize: 12, fontWeight: 800 };
const bulkSummary = { marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(255,255,255,.05)", color: "#C7D3CC" };
const tableWrap = { overflowX: "auto", minHeight: 50, marginTop: 10 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 1000 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#D4AF37", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.09)", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 9px", color: "#C7D3CC", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top" };
const badgeStyle = { display: "inline-block", borderRadius: 999, padding: "4px 8px", border: "1px solid rgba(212,175,55,.4)", color: "#D4AF37", background: "rgba(212,175,55,.08)", fontSize: 10, fontWeight: 900 };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(248,113,113,.45)", background: "rgba(185,28,28,.14)", color: "#FCA5A5" };
const successStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(34,197,94,.35)", background: "rgba(34,197,94,.12)", color: "#BBF7D0" };
const errorText = { color: "#FCA5A5", whiteSpace: "normal" };
const loadingStyle = { padding: 14, color: "#C7D3CC" };
