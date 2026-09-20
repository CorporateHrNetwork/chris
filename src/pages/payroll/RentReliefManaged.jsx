import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmployeeSearchSelect from "../../components/EmployeeSearchSelect";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../../services/api";

const money = (value, currency = "NGN") => new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));

export default function RentReliefManaged() {
  const navigate = useNavigate();
  const year = Math.max(2026, new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const [registerMessage, setRegisterMessage] = useState("");
  const [selectedReliefIds, setSelectedReliefIds] = useState([]);
  const [form, setForm] = useState({ employeeNumber: "", taxYear: String(year), annualRentPaid: "", evidenceReference: "", notes: "" });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [reliefs, policyResult] = await Promise.all([
        apiRequest(`/api/payroll/tax-reliefs?taxYear=${year}`),
        apiRequest("/api/payroll/compliance-policy"),
      ]);
      setRows(reliefs?.data || []);
      setSelectedReliefIds([]);
      setPolicy(policyResult?.data?.policy || null);
      setError("");
    } catch (requestError) {
      setError(requestError?.message || "Unable to load rent relief.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      setBusy("save");
      setError("");
      await apiRequest("/api/payroll/tax-reliefs/rent", { method: "POST", body: JSON.stringify(form) });
      setForm((current) => ({ ...current, employeeNumber: "", annualRentPaid: "", evidenceReference: "", notes: "" }));
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to save rent relief.");
    } finally {
      setBusy("");
    }
  };

  const decide = async (id, decision) => {
    try {
      setBusy(`${decision}-${id}`);
      setError("");
      await apiRequest(`/api/payroll/tax-reliefs/${id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision, notes: decision === "VERIFY" ? "Rent relief evidence reviewed for payroll." : "Rent relief rejected during verification." }),
      });
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to decide rent relief.");
    } finally {
      setBusy("");
    }
  };


  const downloadBulkTemplate = async () => {
    try {
      setBusy("bulk-template");
      setError("");
      const download = await apiDownload("/api/payroll/tax-reliefs/rent/template");
      saveDownloadedBlob(download);
      setBulkMessage("Bulk rent-relief template downloaded.");
    } catch (requestError) {
      setError(requestError?.message || "Unable to download rent relief template.");
    } finally {
      setBusy("");
    }
  };

  const previewBulk = async () => {
    if (!bulkFile) {
      setError("Select the completed rent-relief Excel file first.");
      return;
    }
    try {
      setBusy("bulk-preview");
      setError("");
      setBulkMessage("");
      const body = new FormData();
      body.append("file", bulkFile);
      const response = await apiRequest("/api/payroll/tax-reliefs/rent/bulk/preview", {
        method: "POST",
        body,
      });
      setBulkPreview(response?.data || null);
      const data = response?.data || {};
      setBulkMessage(`${data.validRows || 0} valid row(s); ${data.invalidRows || 0} row(s) require correction.`);
    } catch (requestError) {
      setBulkPreview(null);
      setError(requestError?.message || "Unable to validate rent relief workbook.");
    } finally {
      setBusy("");
    }
  };

  const importBulk = async () => {
    if (!bulkFile || !bulkPreview?.validRows) return;
    try {
      setBusy("bulk-import");
      setError("");
      setBulkMessage("");
      const body = new FormData();
      body.append("file", bulkFile);
      const response = await apiRequest("/api/payroll/tax-reliefs/rent/bulk/import", {
        method: "POST",
        body,
      });
      const data = response?.data || {};
      setBulkMessage(response?.message || `${data.imported || 0} rent-relief record(s) imported for verification.`);
      setBulkPreview(null);
      setBulkFile(null);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to import rent relief workbook.");
    } finally {
      setBusy("");
    }
  };


  const pendingReliefIds = rows
    .filter((row) => row.status === "PENDING_VERIFICATION")
    .map((row) => row.id);

  const allPendingSelected =
    pendingReliefIds.length > 0 &&
    pendingReliefIds.every((id) => selectedReliefIds.includes(id));

  const toggleReliefSelection = (id) => {
    setSelectedReliefIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  };

  const toggleAllPending = () => {
    setSelectedReliefIds(allPendingSelected ? [] : pendingReliefIds);
  };

  const verifySelected = async () => {
    if (!selectedReliefIds.length) {
      setError("Select at least one pending rent-relief record.");
      return;
    }

    const confirmed = window.confirm(
      `Verify ${selectedReliefIds.length} selected rent-relief record(s)? Verified reliefs will become eligible for PAYE calculation and any existing draft payroll will require recalculation.`
    );
    if (!confirmed) return;

    try {
      setBusy("bulk-verify");
      setError("");
      setRegisterMessage("");
      const response = await apiRequest("/api/payroll/tax-reliefs/bulk/verify", {
        method: "POST",
        body: {
          reliefIds: selectedReliefIds,
          notes: `Bulk rent-relief verification completed for ${selectedReliefIds.length} selected record(s).`,
        },
      });
      setRegisterMessage(response?.message || `${selectedReliefIds.length} rent-relief record(s) verified successfully.`);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to bulk verify selected rent relief.");
    } finally {
      setBusy("");
    }
  };

  const rate = Number(policy?.payeRules?.rentReliefRate || 20);
  const cap = Number(policy?.payeRules?.rentReliefCap || 500000);

  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>NIGERIA PAYROLL COMPLIANCE</div>
      <h1 style={titleStyle}>Tax Rent Relief</h1>
      <p style={leadStyle}>Record and verify annual rent declarations before CHRiS uses permitted rent relief in PAYE. Employees are selected from the current employee register rather than manually typed.</p>

      <Panel title="Declare Annual Rent">
        <p style={controlNote}>CHRiS calculates eligible rent relief as {rate}% of annual rent paid, capped at {money(cap)}. PAYE uses it only after verification and supporting evidence/reference.</p>
        <form style={formGrid} onSubmit={submit}>
          <EmployeeSearchSelect label="Employee" value={form.employeeNumber} onChange={(employeeNumber) => setForm((current) => ({ ...current, employeeNumber }))} required placeholder="Search employee number or name" />
          <Input type="number" label="Tax Year" value={form.taxYear} onChange={(value) => setForm((current) => ({ ...current, taxYear: value }))} min="2026" required />
          <Input type="number" label="Annual Rent Paid" value={form.annualRentPaid} onChange={(value) => setForm((current) => ({ ...current, annualRentPaid: value }))} min="0" step="0.01" required />
          <Input label="Evidence / Document Reference" value={form.evidenceReference} onChange={(value) => setForm((current) => ({ ...current, evidenceReference: value }))} placeholder="Receipt no., document ID or file reference" />
          <Input label="Notes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
          <div><button style={primaryButton} disabled={Boolean(busy) || !form.employeeNumber}>{busy === "save" ? "Saving…" : "Save for Verification"}</button></div>
        </form>
      </Panel>

      <Panel title="Bulk Rent Relief Upload">
        <p style={controlNote}>
          Use this for Zermatt bulk rent-relief data. Uploading does not approve the relief: every valid row is saved as PENDING_VERIFICATION until HR reviews the supporting evidence and selects Verify or Reject.
        </p>
        <div style={buttonRow}>
          <button type="button" style={smallButton} disabled={Boolean(busy)} onClick={downloadBulkTemplate}>
            {busy === "bulk-template" ? "Preparing…" : "Download Template"}
          </button>
          <label style={filePickerStyle}>
            <span>Select completed Excel</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setBulkFile(file);
                setBulkPreview(null);
                setBulkMessage(file ? `Selected: ${file.name}` : "");
                setError("");
              }}
            />
          </label>
          <button type="button" style={smallButton} disabled={Boolean(busy) || !bulkFile} onClick={previewBulk}>
            {busy === "bulk-preview" ? "Validating…" : "Validate / Preview"}
          </button>
          <button
            type="button"
            style={primaryButton}
            disabled={Boolean(busy) || !bulkFile || !bulkPreview?.validRows}
            onClick={importBulk}
          >
            {busy === "bulk-import" ? "Importing…" : "Confirm Import"}
          </button>
        </div>

        {bulkMessage && <div style={successStyle}>{bulkMessage}</div>}

        {bulkPreview && (
          <>
            <div style={previewSummaryStyle}>
              <strong>{bulkPreview.totalRows || 0}</strong> total · <strong>{bulkPreview.validRows || 0}</strong> valid · <strong>{bulkPreview.invalidRows || 0}</strong> invalid
            </div>
            <DataTable columns={["Row", "Employee", "Year", "Annual Rent", "Eligible Relief", "Evidence", "Result"]}>
              {(bulkPreview.rows || []).map((row) => (
                <tr key={row.rowNumber}>
                  <Td>{row.rowNumber}</Td>
                  <Td strong>{row.display?.employeeNumber || "—"}{row.display?.employeeName ? ` · ${row.display.employeeName}` : ""}</Td>
                  <Td>{row.display?.taxYear || "—"}</Td>
                  <Td>{money(row.display?.annualRentPaid)}</Td>
                  <Td>{money(row.display?.eligibleRelief)}</Td>
                  <Td>{row.display?.evidenceReference || "—"}</Td>
                  <Td>{row.valid ? <Badge>VALID</Badge> : <span style={invalidTextStyle}>{(row.errors || []).join(" ")}</span>}</Td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </Panel>

      {error && <Feedback>{error}</Feedback>}
      <Panel title="Rent Relief Register">
        <div style={registerToolbarStyle}>
          <div style={buttonRow}>
            <button
              type="button"
              style={smallButton}
              disabled={Boolean(busy) || pendingReliefIds.length === 0}
              onClick={toggleAllPending}
            >
              {allPendingSelected ? "Clear Selection" : `Select All Pending (${pendingReliefIds.length})`}
            </button>
            <button
              type="button"
              style={primaryButton}
              disabled={Boolean(busy) || selectedReliefIds.length === 0}
              onClick={verifySelected}
            >
              {busy === "bulk-verify" ? "Verifying…" : `Verify Selected (${selectedReliefIds.length})`}
            </button>
          </div>
          <div style={selectionSummaryStyle}>
            {selectedReliefIds.length} selected · {pendingReliefIds.length} pending
          </div>
        </div>

        {registerMessage && <div style={successStyle}>{registerMessage}</div>}

        <DataTable loading={loading} columns={["Select", "Employee", "Name", "Year", "Annual Rent", "Eligible Relief", "Evidence", "Status", "Action"]}>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td>
                {row.status === "PENDING_VERIFICATION" ? (
                  <input
                    type="checkbox"
                    aria-label={`Select rent relief for ${row.employeeNumber}`}
                    checked={selectedReliefIds.includes(row.id)}
                    disabled={Boolean(busy)}
                    onChange={() => toggleReliefSelection(row.id)}
                  />
                ) : "—"}
              </Td>
              <Td strong>{row.employeeNumber}</Td><Td>{row.employeeName}</Td><Td>{row.taxYear}</Td>
              <Td>{money(row.annualDeclaredAmount)}</Td><Td>{money(row.eligibleReliefAmount)}</Td><Td>{row.evidenceReference || "—"}</Td><Td><Badge>{row.status}</Badge></Td>
              <Td>{row.status === "PENDING_VERIFICATION" ? <div style={buttonRow}><button style={smallButton} disabled={Boolean(busy)} onClick={() => decide(row.id, "VERIFY")}>Verify</button><button style={dangerButton} disabled={Boolean(busy)} onClick={() => decide(row.id, "REJECT")}>Reject</button></div> : "—"}</Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </section>
  );
}

function Panel({ title, children }) { return <section style={panelStyle}><h2 style={panelTitle}>{title}</h2>{children}</section>; }
function Feedback({ children }) { return <div role="alert" style={errorStyle}>{children}</div>; }
function Input({ label, value, onChange, type = "text", ...props }) { return <label style={fieldLabel}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} {...props} /></label>; }
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
const smallButton = { border: "1px solid rgba(212,175,55,.6)", borderRadius: 8, padding: "6px 10px", background: "transparent", color: "#D4AF37", fontWeight: 900, cursor: "pointer" };
const dangerButton = { ...smallButton, borderColor: "rgba(248,113,113,.6)", color: "#FCA5A5" };
const buttonRow = { display: "flex", gap: 8, flexWrap: "wrap" };
const registerToolbarStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 };
const selectionSummaryStyle = { color: "#AFC2B8", fontSize: 12, fontWeight: 800 };
const controlNote = { margin: "0 0 14px", color: "#C7D3CC", lineHeight: 1.55, fontSize: 12 };
const tableWrap = { overflowX: "auto", minHeight: 50 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 1000 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#D4AF37", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.09)", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 9px", color: "#C7D3CC", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top", whiteSpace: "nowrap" };
const badgeStyle = { display: "inline-block", borderRadius: 999, padding: "4px 8px", border: "1px solid rgba(212,175,55,.4)", color: "#D4AF37", background: "rgba(212,175,55,.08)", fontSize: 10, fontWeight: 900 };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(248,113,113,.45)", background: "rgba(185,28,28,.14)", color: "#FCA5A5" };
const successStyle = { marginTop: 14, padding: 11, borderRadius: 10, border: "1px solid rgba(46,233,139,.35)", background: "rgba(46,233,139,.08)", color: "#8FF0BB", fontSize: 12, fontWeight: 800 };
const previewSummaryStyle = { margin: "14px 0 8px", color: "#C7D3CC", fontSize: 12 };
const invalidTextStyle = { color: "#FCA5A5", whiteSpace: "normal", lineHeight: 1.45, maxWidth: 360, display: "inline-block" };
const filePickerStyle = { display: "grid", gap: 6, minWidth: 260, color: "#C7D3CC", fontSize: 12, fontWeight: 800 };
const loadingStyle = { padding: 14, color: "#C7D3CC" };
