import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import EmployeeSearchSelect from "../../components/EmployeeSearchSelect";
import { PAYROLL_CURRENCY_OPTIONS } from "../../constants/payrollCurrencies";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../../services/api";

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = () => ({
  employeeNumber: "",
  amount: "",
  currency: "NGN",
  effectiveFrom: today(),
  effectiveTo: "",
  reason: "",
});

const money = (value, currency = "NGN") => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString()}`;
  }
};

export default function SalaryRatesManaged() {
  const navigate = useNavigate();
  const [rates, setRates] = useState([]);
  const [capabilities, setCapabilities] = useState({
    canManageEmployeeFinancialInputs: false,
    canDeleteEmployeeFinancialInputs: false,
    canBulkPayrollInputs: false,
    isBranchHr: false,
    isHeadHr: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(blankForm);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [editingRate, setEditingRate] = useState(null);
  const [revisionMode,setRevisionMode] = useState(false);
  const [action, setAction] = useState(null);
  const dialogRef = useRef(null);
  const actionTrigger = useRef(null);
  const [actionReason,setActionReason] = useState("");
  const [actionDate,setActionDate] = useState(today);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [response, capabilityResponse] = await Promise.all([
        apiRequest("/api/payroll/salary-rates"),
        apiRequest("/api/payroll/hr-input-capabilities").catch(() => ({ data: {} })),
      ]);
      setRates(response?.data || []);
      setCapabilities((current) => ({ ...current, ...(capabilityResponse?.data || {}) }));
      setError("");
    } catch (requestError) {
      setError(requestError?.message || "Unable to load salary rates.");
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

  const selectEmployee = (employeeNumber, employee) => {
    setSelectedEmployee(employee || null);
    const currentRate = employee?.currentSalaryRate || null;
    setForm((current) => ({
      ...current,
      employeeNumber,
      amount: currentRate ? String(currentRate.amount ?? "") : "",
      currency: currentRate?.currency || "NGN",
    }));
    setError("");
    setMessage("");
  };

  const setField = (field) => (value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setMessage("");
  };

  const reset = () => {
    setSelectedEmployee(null);
    setEditingRate(null);
    setRevisionMode(false);
    setForm(blankForm());
  };

  useEffect(() => {
    if (!action) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); actionTrigger.current?.focus(); };
  }, [action]);

  const closeAction = () => { if (busy) return; setAction(null); reset(); setError(""); };
  const openAction = (kind, rate, event) => {
    actionTrigger.current = event.currentTarget;
    setError(""); setMessage(""); setActionReason(""); setActionDate(today());
    if (kind === "edit") startEdit(rate);
    else reset();
    setAction({kind,rate});
  };

  const startEdit = (rate) => {
    setEditingRate(rate);
    setRevisionMode(false);
    setSelectedEmployee({
      employeeNumber: rate.employeeNumber,
      employeeName: rate.employeeName,
      currentSalaryRate: {
        amount: rate.amount,
        currency: rate.currency,
        effectiveFrom: rate.effectiveFrom,
        effectiveTo: rate.effectiveTo,
      },
    });
    setForm({
      employeeNumber: rate.employeeNumber,
      amount: String(rate.amount ?? ""),
      currency: rate.currency || "NGN",
      effectiveFrom: rate.effectiveFrom || today(),
      effectiveTo: rate.effectiveTo || "",
      reason: rate.reason || "",
    });
    setError("");
    setMessage("");

  };

  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy("save");
      setError("");
      setMessage("");
      if (editingRate && revisionMode) {
        if (!form.effectiveFrom.endsWith("-01") || form.effectiveFrom <= editingRate.effectiveFrom) throw new Error("Choose the first day of the approved salary month, after the original rate began. Select the historical rate covering that month.");
        if (form.currency!==editingRate.currency || (form.effectiveTo||"")!==(editingRate.effectiveTo||"")) throw new Error("A salary revision preserves the source currency and end date.");
        if (!window.confirm("Create a new effective-dated salary allocation? Paid TSP history remains unchanged; eligible shortfalls carry forward.")) return;
        const response=await apiRequest("/api/onboarding/salary-revision",{method:"POST",body:JSON.stringify({rateId:editingRate.id,amount:form.amount,effectiveFrom:form.effectiveFrom,reason:form.reason})});
        setMessage("Salary revision saved. Regenerate affected drafts."+ (Number(response.data?.carryForward)>0 ? " Next-month short payment: "+money(response.data.carryForward,form.currency):""));
      } else if (editingRate) {
        await apiRequest(`/api/payroll/salary-rates/${editingRate.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            amount: form.amount,
            currency: form.currency,
            effectiveFrom: form.effectiveFrom,
            effectiveTo: form.effectiveTo || null,
            reason: form.reason,
          }),
        });
        setMessage("Salary rate changes saved with audit history. Approved payroll periods remain protected.");
      } else {
        await apiRequest("/api/payroll/salary-rates", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setMessage("Salary rate saved. The effective-dated salary authority has been refreshed.");
      }
      setAction(null);
      reset();
      await load();
    } catch (requestError) {
      if (editingRate && !revisionMode && /submitted, approved or paid TSP run/.test(requestError?.message || "")) { setRevisionMode(true); setError("This rate has protected TSP history. Revision mode is now selected. Confirm the approved effective month (first day), amount and reason, then save again. If the selected rate starts later than the approved month, select the rate covering that month instead."); } else setError(requestError?.message || "Unable to save salary rate.");
    } finally {
      setBusy("");
    }
  };

  const retireRate = async (rate) => {
    const effectiveTo = actionDate;
    const reason = actionReason.trim();
    if (!effectiveTo || !reason) { setError("Enter an effective end date and reason."); return; }
    try {
      setBusy(`retire-${rate.id}`);
      setError("");
      await apiRequest(`/api/payroll/salary-rates/${rate.id}/retire`, {
        method: "PATCH",
        body: JSON.stringify({ effectiveTo, reason }),
      });
      setAction(null);
      reset();
      setMessage("Salary rate ended/retired. The historical authority remains preserved for audit and payroll history.");
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to end salary rate.");
    } finally {
      setBusy("");
    }
  };

  const deleteRate = async (rate) => {
    const reason = actionReason.trim();
    if (!reason) { setError("Enter a reason for deletion."); return; }
    try {
      setBusy(`delete-${rate.id}`);
      setError("");
      await apiRequest(`/api/payroll/salary-rates/${rate.id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      });
      setAction(null);
      reset();
      setMessage("Unused salary rate deleted. The deletion remains available in the audit trail.");
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to delete salary rate.");
    } finally {
      setBusy("");
    }
  };

  const downloadTemplate = async () => {
    try {
      setBusy("template");
      setError("");
      saveDownloadedBlob(await apiDownload("/api/payroll/salary-rates/template"));
    } catch (requestError) {
      setError(requestError?.message || "Unable to prepare salary-rate template.");
    } finally {
      setBusy("");
    }
  };

  const sendWorkbook = async (endpoint) => {
    if (!file) throw new Error("Select a completed salary-rate workbook first.");
    const body = new FormData();
    body.append("file", file);
    return apiRequest(endpoint, { method: "POST", body });
  };

  const validate = async () => {
    try {
      setBusy("preview");
      setError("");
      setImportResult(null);
      const response = await sendWorkbook("/api/payroll/salary-rates/bulk/preview");
      setPreview(response?.data || null);
    } catch (requestError) {
      setError(requestError?.message || "Unable to validate salary-rate workbook.");
    } finally {
      setBusy("");
    }
  };

  const importWorkbook = async () => {
    try {
      setBusy("import");
      setError("");
      const response = await sendWorkbook("/api/payroll/salary-rates/bulk/import");
      setImportResult(response?.data || null);
      setPreview(null);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to import salary rates.");
    } finally {
      setBusy("");
    }
  };

  const scopeText = capabilities.isBranchHr
    ? "You are working in branch scope. Salary rates entered here are authoritative employee records and automatically appear in the consolidated HEAD OFFICE view."
    : "HEAD OFFICE uses the consolidated organization view. Head HR can maintain salary rates across branches, while approved payroll history remains immutable.";

  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>PAYROLL OPERATIONS</div>
      <h1 style={titleStyle}>Salary Rates</h1>
      <p style={leadStyle}>Maintain effective-dated authoritative monthly gross salary rates. Branch HR & Admin Officers can enter and edit employees in their assigned branch; Head HR can manage the organization-wide register. {scopeText}</p>

      <Panel title={editingRate ? `Edit Salary Rate · ${editingRate.employeeNumber}` : "Individual Salary Rate"}>
        {!action && <form style={formGrid} onSubmit={save}>
          <EmployeeSearchSelect
            label="Employee"
            value={form.employeeNumber}
            onChange={selectEmployee}
            disabled={Boolean(editingRate)}
            required
            placeholder="Search employee number or name"
          />
          <Input type="number" label="Monthly Gross Salary" value={form.amount} onChange={setField("amount")} min="0.01" step="0.01" required />
          <Select label="Currency" value={form.currency} onChange={setField("currency")} options={PAYROLL_CURRENCY_OPTIONS} />
          <Input type="date" label="Effective From" value={form.effectiveFrom} onChange={setField("effectiveFrom")} required />
          <Input type="date" label="Effective To (optional)" value={form.effectiveTo} onChange={setField("effectiveTo")} />
          <Input label="Reason" value={form.reason} onChange={setField("reason")} placeholder="Salary review, promotion, correction or opening authority" />
          <div style={buttonCell}>
            <button style={primaryButton} disabled={Boolean(busy) || !form.employeeNumber}>{busy === "save" ? "Saving…" : editingRate ? "Save Salary Rate Changes" : "Save Salary Rate"}</button>
            {editingRate && <button type="button" style={secondaryButton} onClick={reset} disabled={Boolean(busy)}>Cancel Edit</button>}
          </div>
        </form>}


        {selectedEmployee && !action && (
          <div style={authorityNote}>
            {editingRate ? (
              <><strong>Controlled correction:</strong> changes are audited. If this salary rate has already supported approved payroll, CHRiS will preserve the historical rate and require a new effective-dated salary rate instead of rewriting payroll history.</>
            ) : selectedEmployee.currentSalaryRate ? (
              <>
                <strong>Current system salary authority:</strong>{" "}
                {money(selectedEmployee.currentSalaryRate.amount, selectedEmployee.currentSalaryRate.currency)} · effective from {selectedEmployee.currentSalaryRate.effectiveFrom}
                {selectedEmployee.currentSalaryRate.effectiveTo ? ` to ${selectedEmployee.currentSalaryRate.effectiveTo}` : " · open-ended"}.
                {" "}Gross and currency were populated from this record. <strong>Effective From above is intentionally the effective date of the new decision.</strong>
              </>
            ) : (
              <>No current effective salary rate was found for this employee. Enter the opening monthly gross salary and effective date.</>
            )}
          </div>
        )}
      </Panel>

      {capabilities.canBulkPayrollInputs && <Panel title="Bulk Salary Rates">
        <div style={bulkGrid}>
          <button type="button" style={secondaryButton} onClick={downloadTemplate} disabled={Boolean(busy)}>{busy === "template" ? "Preparing…" : "Download Excel Template"}</button>
          <input type="file" accept=".xlsx,.xls" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setImportResult(null); }} />
          <button type="button" style={secondaryButton} onClick={validate} disabled={!file || Boolean(busy)}>{busy === "preview" ? "Validating…" : "Validate Workbook"}</button>
        </div>
        {preview && <div style={summaryStrip}><strong>{preview.validRows} valid</strong><span>{preview.invalidRows} invalid · {preview.totalRows} total</span><button type="button" style={primaryButton} onClick={importWorkbook} disabled={!preview.validRows || Boolean(busy)}>{busy === "import" ? "Importing…" : `Import ${preview.validRows} Valid Rate${preview.validRows === 1 ? "" : "s"}`}</button></div>}
        {preview?.rows?.length > 0 && <PreviewRows rows={preview.rows} />}
        {importResult && <div style={summaryStrip}><strong>{importResult.created} created</strong><span>{importResult.failed} failed · {importResult.total} total</span></div>}
      </Panel>}

      {error && <Feedback>{error}</Feedback>}
      {message && <div style={successStyle}>{message}</div>}

      <Panel title="Effective Salary Rate Register">
        <DataTable loading={loading} columns={["Employee", "Name", "Monthly Gross", "Effective From", "Effective To", "Status", "Action"]}>
          {(rates || []).map((rate) => (
            <tr key={rate.id}>
              <Td strong>{rate.employeeNumber}</Td><Td>{rate.employeeName}</Td><Td>{money(rate.amount, rate.currency)}</Td>
              <Td>{rate.effectiveFrom}</Td><Td>{rate.effectiveTo || "Open-ended"}</Td><Td><Badge>{rate.status}</Badge></Td>
              <Td><div style={actionRow}>
                {capabilities.canManageEmployeeFinancialInputs && rate.status !== "RETIRED" && <button type="button" style={smallButton} disabled={Boolean(busy)} onClick={(event) => openAction("edit",rate,event)}>Edit</button>}
                {capabilities.canManageEmployeeFinancialInputs && rate.status === "ACTIVE" && <button type="button" style={smallButton} onClick={(event) => openAction("retire",rate,event)} disabled={Boolean(busy)}>End / Retire</button>}
                {capabilities.canDeleteEmployeeFinancialInputs && <button type="button" style={dangerButton} onClick={(event) => openAction("delete",rate,event)} disabled={Boolean(busy)}>Delete</button>}
              </div></Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      {action && createPortal(
        <dialog ref={dialogRef} aria-labelledby="salary-action-title" onCancel={(event)=>{event.preventDefault();closeAction();}}
          style={{...panelStyle,position:"fixed",margin:"auto",width:"min(760px, calc(100% - 32px))",maxHeight:"calc(100dvh - 32px)",overflowY:"auto",boxSizing:"border-box",color:"#F7FAF8",background:"var(--chris-ui-panel-background, #09271b)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:12}}>
            <h2 id="salary-action-title" style={{...panelTitle,margin:0}}>{action.kind==="edit"?"Edit Salary Rate":action.kind==="retire"?"End / Retire Salary Rate":"Delete Unused Salary Rate"}</h2>
            <button type="button" aria-label="Close salary action" style={secondaryButton} disabled={Boolean(busy)} onClick={closeAction}>×</button>
          </div>
          <p style={authorityNote}>{action.rate.employeeNumber} · {action.rate.employeeName} · {money(action.rate.amount,action.rate.currency)} · {action.rate.effectiveFrom}</p>
          {error && <Feedback>{error}</Feedback>}
          {action.kind==="edit" ? <>
            <label style={authorityNote}><input type="checkbox" checked={revisionMode} onChange={event=>{setRevisionMode(event.target.checked);setError("");}}/> Create effective-dated salary revision (including eligible paid mid-month TSP)</label>
            {revisionMode && <p style={authorityNote}>Select the first day of the approved salary month. Use the rate covering that month as the source. Paid TSP is preserved and eligible shortfalls carry forward. Approved main payroll cannot be rewritten.</p>}
        <form style={{...formGrid,gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))"}} onSubmit={save}>
          <EmployeeSearchSelect
            label="Employee"
            value={form.employeeNumber}
            onChange={selectEmployee}
            disabled={Boolean(editingRate)}
            required
            placeholder="Search employee number or name"
          />
          <Input type="number" label="Monthly Gross Salary" value={form.amount} onChange={setField("amount")} min="0.01" step="0.01" required />
          <Select label="Currency" value={form.currency} onChange={setField("currency")} options={PAYROLL_CURRENCY_OPTIONS} />
          <Input type="date" label="Effective From" value={form.effectiveFrom} onChange={setField("effectiveFrom")} required />
          <Input type="date" label="Effective To (optional)" value={form.effectiveTo} onChange={setField("effectiveTo")} />
          <Input label="Reason" value={form.reason} onChange={setField("reason")} placeholder="Salary review, promotion, correction or opening authority" />
          <div style={buttonCell}>
            <button style={primaryButton} disabled={Boolean(busy) || !form.employeeNumber}>{busy === "save" ? "Saving…" : editingRate ? "Save Salary Rate Changes" : "Save Salary Rate"}</button>
            {editingRate && <button type="button" style={secondaryButton} onClick={closeAction} disabled={Boolean(busy)}>Cancel Edit</button>}
          </div>
        </form>
            <p style={authorityNote}>Approved payroll history remains protected. A qualifying effective-dated salary increase preserves paid TSP and carries eligible shortfalls forward.</p>
          </> : <form style={{display:"grid",gap:14}} onSubmit={event=>{event.preventDefault();if(action.kind==="retire") retireRate(action.rate);else deleteRate(action.rate);}}>
            {action.kind==="retire" ? <Input type="date" label="Effective end date" value={actionDate} onChange={setActionDate} required/> : <p>Only unused salary rates may be deleted. Financial history protections and audit records remain in place.</p>}
            <Input label="Reason" value={actionReason} onChange={setActionReason} required/>
            <div style={buttonCell}><button type="submit" style={action.kind==="delete"?dangerButton:primaryButton} disabled={Boolean(busy)}>{busy?"Saving…":action.kind==="retire"?"Confirm End / Retire":"Confirm Delete"}</button><button type="button" style={secondaryButton} disabled={Boolean(busy)} onClick={closeAction}>Cancel</button></div>
          </form>}
        </dialog>,document.body)}
    </section>
  );
}

function PreviewRows({ rows }) {
  return (
    <div style={{ ...tableWrap, marginTop: 12 }}>
      <table style={{ ...tableStyle, minWidth: 850 }}>
        <thead><tr>{["Row", "Employee", "Name", "Gross", "Currency", "Effective From", "Result"].map((column) => <th key={column} style={thStyle}>{column}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 100).map((row) => (
          <tr key={row.rowNumber}>
            <Td>{row.rowNumber}</Td><Td strong>{row.display?.employeeNumber || "—"}</Td><Td>{row.display?.employeeName || "—"}</Td>
            <Td>{row.display?.amount ?? "—"}</Td><Td>{row.display?.currency || "—"}</Td><Td>{row.display?.effectiveFrom || "—"}</Td>
            <Td>{row.valid ? "Valid" : (row.errors || []).join("; ")}</Td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Panel({ title, children }) { return <section style={panelStyle}><h2 style={panelTitle}>{title}</h2>{children}</section>; }
function Feedback({ children }) { return <div role="alert" style={errorStyle}>{children}</div>; }
function Input({ label, value, onChange, type = "text", ...props }) { return <label style={fieldLabel}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} {...props} /></label>; }
function Select({ label, value, onChange, options }) { return <label style={fieldLabel}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>; }
function DataTable({ columns, children, loading = false }) { return <div style={tableWrap}>{loading ? <div style={loadingStyle}>Loading…</div> : <table style={tableStyle}><thead><tr>{columns.map((column) => <th key={column} style={thStyle}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table>}</div>; }
function Td({ children, strong = false }) { return <td style={{ ...tdStyle, ...(strong ? { fontWeight: 900, color: "#F7FAF8" } : {}) }}>{children}</td>; }
function Badge({ children }) { return <span style={badgeStyle}>{children || "—"}</span>; }

const pageStyle = { maxWidth: 1500, margin: "0 auto", color: "#F7FAF8" };
const backButton = { border: 0, background: "transparent", color: "#D4AF37", fontWeight: 900, cursor: "pointer", padding: "0 0 14px" };
const eyebrow = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle = { margin: "6px 0", fontSize: 32 };
const leadStyle = { color: "#C7D3CC", lineHeight: 1.65, maxWidth: 1150, marginBottom: 22 };
const panelStyle = { marginTop: 18, padding: 20, border: "var(--chris-ui-panel-border, 1px solid rgba(212,175,55,.45))", borderRadius: "var(--chris-ui-panel-radius, 15px)", background: "var(--chris-ui-panel-background, linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96)))", boxShadow: "var(--chris-ui-panel-shadow, 0 15px 38px rgba(0,0,0,.24))" };
const panelTitle = { margin: "0 0 15px", fontSize: 18, color: "#D4AF37" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, alignItems: "end" };
const fieldLabel = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800, minWidth: 200 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8", outline: "none" };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)" };
const smallButton = { ...secondaryButton, padding: "6px 10px", fontSize: 11 };
const dangerButton = { ...smallButton, color: "#FCA5A5", border: "1px solid rgba(248,113,113,.6)" };
const buttonCell = { display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap" };
const actionRow = { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" };
const bulkGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,max-content))", gap: 14, alignItems: "center" };
const summaryStrip = { marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", color: "#C7D3CC" };
const authorityNote = { marginTop: 14, padding: 12, borderRadius: 10, border: "1px solid rgba(212,175,55,.35)", background: "rgba(212,175,55,.07)", color: "#C7D3CC", lineHeight: 1.55, fontSize: 12 };
const tableWrap = { overflowX: "auto", minHeight: 50 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 1000 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#D4AF37", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.09)", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 9px", color: "#C7D3CC", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top", whiteSpace: "nowrap" };
const badgeStyle = { display: "inline-block", borderRadius: 999, padding: "4px 8px", border: "1px solid rgba(212,175,55,.4)", color: "#D4AF37", background: "rgba(212,175,55,.08)", fontSize: 10, fontWeight: 900 };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(248,113,113,.45)", background: "rgba(185,28,28,.14)", color: "#FCA5A5" };
const successStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(212,175,55,.45)", background: "rgba(212,175,55,.08)", color: "#F7FAF8" };
const loadingStyle = { padding: 14, color: "#C7D3CC" };

