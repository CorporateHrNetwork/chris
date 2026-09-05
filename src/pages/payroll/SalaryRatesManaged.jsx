import { useCallback, useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(blankForm);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest("/api/payroll/salary-rates");
      setRates(response?.data || []);
      setError("");
    } catch (requestError) {
      setError(requestError?.message || "Unable to load salary rates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
    setForm(blankForm());
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy("save");
      setError("");
      setMessage("");
      await apiRequest("/api/payroll/salary-rates", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setMessage("Salary rate saved. The effective-dated salary authority has been refreshed.");
      reset();
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to save salary rate.");
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

  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>PAYROLL OPERATIONS</div>
      <h1 style={titleStyle}>Salary Rates</h1>
      <p style={leadStyle}>Maintain effective-dated authoritative monthly gross salary rates. Select employees from the searchable employee register; CHRiS never requires manual Employee Number entry in this workflow.</p>

      <Panel title="Individual Salary Rate">
        <form style={formGrid} onSubmit={save}>
          <EmployeeSearchSelect
            label="Employee"
            value={form.employeeNumber}
            onChange={selectEmployee}
            required
            placeholder="Search employee number or name"
          />
          <Input type="number" label="Monthly Gross Salary" value={form.amount} onChange={setField("amount")} min="0.01" step="0.01" required />
          <Select label="Currency" value={form.currency} onChange={setField("currency")} options={PAYROLL_CURRENCY_OPTIONS} />
          <Input type="date" label="Effective From" value={form.effectiveFrom} onChange={setField("effectiveFrom")} required />
          <Input type="date" label="Effective To (optional)" value={form.effectiveTo} onChange={setField("effectiveTo")} />
          <Input label="Reason" value={form.reason} onChange={setField("reason")} placeholder="Salary review, promotion, correction or opening authority" />
          <div style={buttonCell}><button style={primaryButton} disabled={Boolean(busy) || !form.employeeNumber}>{busy === "save" ? "Saving…" : "Save Salary Rate"}</button></div>
        </form>

        {selectedEmployee && (
          <div style={authorityNote}>
            {selectedEmployee.currentSalaryRate ? (
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

      <Panel title="Bulk Salary Rates">
        <div style={bulkGrid}>
          <button type="button" style={secondaryButton} onClick={downloadTemplate} disabled={Boolean(busy)}>{busy === "template" ? "Preparing…" : "Download Excel Template"}</button>
          <input type="file" accept=".xlsx,.xls" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setImportResult(null); }} />
          <button type="button" style={secondaryButton} onClick={validate} disabled={!file || Boolean(busy)}>{busy === "preview" ? "Validating…" : "Validate Workbook"}</button>
        </div>
        {preview && <div style={summaryStrip}><strong>{preview.validRows} valid</strong><span>{preview.invalidRows} invalid · {preview.totalRows} total</span><button type="button" style={primaryButton} onClick={importWorkbook} disabled={!preview.validRows || Boolean(busy)}>{busy === "import" ? "Importing…" : `Import ${preview.validRows} Valid Rate${preview.validRows === 1 ? "" : "s"}`}</button></div>}
        {preview?.rows?.length > 0 && <PreviewRows rows={preview.rows} />}
        {importResult && <div style={summaryStrip}><strong>{importResult.created} created</strong><span>{importResult.failed} failed · {importResult.total} total</span></div>}
      </Panel>

      {error && <Feedback>{error}</Feedback>}
      {message && <div style={successStyle}>{message}</div>}

      <Panel title="Effective Salary Rate Register">
        <DataTable loading={loading} columns={["Employee", "Name", "Monthly Gross", "Effective From", "Effective To", "Status"]}>
          {(rates || []).map((rate) => (
            <tr key={rate.id}>
              <Td strong>{rate.employeeNumber}</Td><Td>{rate.employeeName}</Td><Td>{money(rate.amount, rate.currency)}</Td>
              <Td>{rate.effectiveFrom}</Td><Td>{rate.effectiveTo || "Open-ended"}</Td><Td><Badge>{rate.status}</Badge></Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
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
const panelStyle = { marginTop: 18, padding: 20, border: "1px solid rgba(212,175,55,.45)", borderRadius: 15, background: "linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96))", boxShadow: "0 15px 38px rgba(0,0,0,.24)" };
const panelTitle = { margin: "0 0 15px", fontSize: 18, color: "#D4AF37" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, alignItems: "end" };
const fieldLabel = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800, minWidth: 200 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8", outline: "none" };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)" };
const buttonCell = { display: "flex", alignItems: "end" };
const bulkGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,max-content))", gap: 14, alignItems: "center" };
const summaryStrip = { marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", color: "#C7D3CC" };
const authorityNote = { marginTop: 14, padding: 12, borderRadius: 10, border: "1px solid rgba(212,175,55,.35)", background: "rgba(212,175,55,.07)", color: "#C7D3CC", lineHeight: 1.55, fontSize: 12 };
const tableWrap = { overflowX: "auto", minHeight: 50 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#D4AF37", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.09)", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 9px", color: "#C7D3CC", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top", whiteSpace: "nowrap" };
const badgeStyle = { display: "inline-block", borderRadius: 999, padding: "4px 8px", border: "1px solid rgba(212,175,55,.4)", color: "#D4AF37", background: "rgba(212,175,55,.08)", fontSize: 10, fontWeight: 900 };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(248,113,113,.45)", background: "rgba(185,28,28,.14)", color: "#FCA5A5" };
const successStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(212,175,55,.45)", background: "rgba(212,175,55,.08)", color: "#F7FAF8" };
const loadingStyle = { padding: 14, color: "#C7D3CC" };
