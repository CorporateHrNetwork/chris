import { useState } from "react";
import { FaArrowLeft, FaDownload, FaFileExcel, FaUpload } from "react-icons/fa";

import { AnalyticsPanel, DashboardCard, ModuleDashboardShell } from "../components/dashboard";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../services/api";

const money = (value) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
}).format(Number(value || 0));

function LoanBulkUpload({ onBack, onImported }) {
  const [operation, setOperation] = useState("new");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const correctionMode = operation === "correction";

  const resetUpload = (nextOperation = operation) => {
    setOperation(nextOperation);
    setFile(null);
    setPreview(null);
    setError("");
    setMessage("");
  };

  const downloadTemplate = async () => {
    try {
      setBusy("template");
      setError("");
      saveDownloadedBlob(await apiDownload("/api/loans/bulk/template"));
    } catch (requestError) {
      setError(requestError?.message || "Unable to download the loan bulk-upload template.");
    } finally {
      setBusy("");
    }
  };

  const uploadFile = async (mode) => {
    if (!file) {
      setError("Select your Excel loan workbook first.");
      return;
    }
    try {
      setBusy(mode);
      setError("");
      setMessage("");
      const body = new FormData();
      body.append("file", file);
      const endpointBase = correctionMode ? "/api/loans/bulk/correction" : "/api/loans/bulk";
      const result = await apiRequest(`${endpointBase}/${mode}`, {
        method: "POST",
        body,
      });
      if (mode === "preview") {
        setPreview(result?.data || null);
        if (result?.data?.importAllowed) {
          setMessage(correctionMode
            ? `Validation passed. ${Number(result?.data?.correctionRows || 0)} correction(s) will be applied; ${Number(result?.data?.unchangedRows || 0)} row(s) already match the imported balances.`
            : "Validation passed. All rows are ready for controlled import.");
        } else {
          setMessage(correctionMode
            ? "Correction preview completed. Resolve every blocked row before applying any opening-balance correction."
            : "Validation completed. Correct the invalid rows in Excel and validate again before importing.");
        }
      } else {
        setMessage(result?.message || (correctionMode ? "Opening loan balances corrected successfully." : "Loan workbook imported successfully."));
        setPreview(null);
        setFile(null);
        if (onImported) await onImported(result?.data || null);
      }
    } catch (requestError) {
      setError(requestError?.message || `Unable to ${mode === "preview" ? "validate" : correctionMode ? "apply corrections from" : "import"} the loan workbook.`);
    } finally {
      setBusy("");
    }
  };

  const rows = preview?.rows || [];

  return (
    <>
      <ModuleDashboardShell
        eyebrow="LOAN DATA OPERATIONS"
        title="Loan Bulk Upload"
        description="Import existing ZERMATT loan balances or safely correct previously imported opening balances without fabricating or rewriting approved-payroll recovery history."
        metrics={correctionMode ? [
          <DashboardCard key="rows" title="Rows" value={preview ? preview.totalRows : "—"} subtitle="Corrected workbook records" icon={<FaFileExcel />} tone="green" />,
          <DashboardCard key="corrections" title="Corrections" value={preview ? preview.correctionRows : "—"} subtitle="Balances that will change" icon={<FaUpload />} tone="gold" />,
          <DashboardCard key="unchanged" title="Unchanged" value={preview ? preview.unchangedRows : "—"} subtitle="Already match CHRiS" icon={<FaFileExcel />} tone="green" />,
          <DashboardCard key="blocked" title="Blocked" value={preview ? preview.blockedRows : "—"} subtitle="Must be resolved first" icon={<FaFileExcel />} tone="gold" />,
        ] : [
          <DashboardCard key="rows" title="Rows" value={preview ? preview.totalRows : "—"} subtitle="Workbook loan records" icon={<FaFileExcel />} tone="green" />,
          <DashboardCard key="valid" title="Valid" value={preview ? preview.validRows : "—"} subtitle="Ready for import" icon={<FaUpload />} tone="gold" />,
          <DashboardCard key="invalid" title="Invalid" value={preview ? preview.invalidRows : "—"} subtitle="Must be corrected first" icon={<FaFileExcel />} tone="green" />,
          <DashboardCard key="warnings" title="Warnings" value={preview ? preview.warningRows : "—"} subtitle="Review before import" icon={<FaFileExcel />} tone="gold" />,
        ]}
        analytics={null}
        recentActivity={null}
        quickActions={[]}
      />

      <main style={pageStyle}>
        <div style={toolbarStyle}>
          <button type="button" style={linkButton} onClick={onBack}><FaArrowLeft /> Back to Loans</button>
          <button type="button" style={secondaryButton} onClick={downloadTemplate} disabled={Boolean(busy)}>
            <FaDownload /> {busy === "template" ? "Preparing…" : "Download CHRiS Template"}
          </button>
        </div>

        {error && <div role="alert" style={errorStyle}>{error}</div>}
        {message && <div style={messageStyle}>{message}</div>}

        <AnalyticsPanel
          title="Choose Loan Data Operation"
          subtitle="Use correction mode only for opening loans that were already imported from Excel. It never creates a second loan."
          icon={<FaFileExcel />}
        >
          <div style={modeGrid}>
            <button
              type="button"
              style={operation === "new" ? primaryButton : secondaryButton}
              onClick={() => resetUpload("new")}
              disabled={Boolean(busy)}
            >
              New Opening Loan Import
            </button>
            <button
              type="button"
              style={correctionMode ? primaryButton : secondaryButton}
              onClick={() => resetUpload("correction")}
              disabled={Boolean(busy)}
            >
              Correct Previously Imported Opening Balances
            </button>
          </div>
          <p style={noteStyle}>
            {correctionMode
              ? "Correction mode matches each loan by Source Reference. Employee, loan type, principal, installment and governing dates must still match the original import. Only the opening recovered/outstanding balance may change. Any changed loan with a posted CHRiS approved-payroll recovery is locked."
              : "New import mode creates opening loan records. Do not use it to replace a workbook that was already imported; duplicate protection will reject those rows."}
          </p>
        </AnalyticsPanel>

        <AnalyticsPanel
          title={correctionMode ? "Upload Corrected Opening-Balance Workbook" : "Upload Existing Loan Workbook"}
          subtitle={correctionMode
            ? "Select the corrected copy of the workbook that was previously imported. Keep each Source Reference unchanged so CHRiS can match the existing loan safely."
            : "Your existing Excel can be used directly if its column names match one of CHRiS's supported aliases. The preview will identify anything that needs adjustment."}
          icon={<FaFileExcel />}
        >
          <div style={uploadGrid}>
            <label style={fieldStyle}>
              <span>Excel Workbook (.xlsx or .xls)</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null);
                  setPreview(null);
                  setError("");
                  setMessage("");
                }}
              />
            </label>
            <button type="button" style={primaryButton} disabled={!file || Boolean(busy)} onClick={() => uploadFile("preview")}>
              <FaUpload /> {busy === "preview" ? "Validating…" : "Validate / Preview"}
            </button>
            <button
              type="button"
              style={secondaryButton}
              disabled={!file || !preview?.importAllowed || Boolean(busy)}
              onClick={() => uploadFile("import")}
            >
              <FaFileExcel /> {busy === "import"
                ? (correctionMode ? "Applying…" : "Importing…")
                : (correctionMode ? "Apply Validated Corrections" : "Import Validated Workbook")}
            </button>
          </div>
          <p style={noteStyle}>
            {correctionMode
              ? "Correction is all-or-nothing. Unchanged rows are ignored, genuine balance changes are audited, and a payroll draft affected by a correction is marked RECALCULATION_REQUIRED."
              : "Import is deliberately blocked when any row is invalid. This prevents a partial financial migration. Existing amounts already repaid before CHRiS are carried as opening recovery balances; they are not inserted as fake payroll recovery transactions."}
          </p>
        </AnalyticsPanel>

        {preview && (
          <AnalyticsPanel
            title={correctionMode ? "Opening-Balance Correction Preview" : "Validation Preview"}
            subtitle={correctionMode
              ? `${preview.correctionRows} correction(s) · ${preview.unchangedRows} unchanged · ${preview.blockedRows} blocked`
              : `${preview.validRows} valid · ${preview.invalidRows} invalid · ${preview.warningRows} warning row(s)`}
            icon={<FaFileExcel />}
          >
            <div style={{ overflowX: "auto" }}>
              {correctionMode ? (
                <table style={tableStyle}>
                  <thead>
                    <tr>{["Row", "Employee", "Loan", "Source Reference", "Old Recovered", "New Recovered", "Old Outstanding", "New Outstanding", "Action / Result"].map((head) => <th key={head} style={thStyle}>{head}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td style={tdStyle}>{row.rowNumber}</td>
                        <td style={tdStyle}><strong>{row.employeeNumber || "—"}</strong><div><small>{row.employeeName || ""}</small></div></td>
                        <td style={tdStyle}>{row.loanNumber || "—"}</td>
                        <td style={tdStyle}>{row.sourceReference || "—"}</td>
                        <td style={tdStyle}>{row.oldRecovered == null ? "—" : money(row.oldRecovered)}</td>
                        <td style={tdStyle}>{row.newRecovered == null ? "—" : money(row.newRecovered)}</td>
                        <td style={tdStyle}>{row.oldOutstanding == null ? "—" : money(row.oldOutstanding)}</td>
                        <td style={tdStyle}>{row.newOutstanding == null ? "—" : money(row.newOutstanding)}</td>
                        <td style={tdStyle}>
                          <strong>{row.action}</strong>
                          {(row.errors || []).map((item) => <div key={item} style={errorText}><small>{item}</small></div>)}
                          {(row.warnings || []).map((item) => <div key={item} style={warningText}><small>{item}</small></div>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>{["Row", "Employee", "Loan Type", "Principal", "Recovered", "Outstanding", "Installment", "Status", "Result"].map((head) => <th key={head} style={thStyle}>{head}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td style={tdStyle}>{row.rowNumber}</td>
                        <td style={tdStyle}><strong>{row.display?.employeeNumber || "—"}</strong><div><small>{row.display?.employeeName || ""}</small></div></td>
                        <td style={tdStyle}>{row.display?.purpose || "—"}</td>
                        <td style={tdStyle}>{row.display?.principalAmount == null ? "—" : money(row.display.principalAmount)}</td>
                        <td style={tdStyle}>{row.display?.recoveredAmount == null ? "—" : money(row.display.recoveredAmount)}</td>
                        <td style={tdStyle}>{row.display?.outstandingAmount == null ? "—" : money(row.display.outstandingAmount)}</td>
                        <td style={tdStyle}>{row.display?.installmentAmount == null ? "—" : money(row.display.installmentAmount)}</td>
                        <td style={tdStyle}>{row.display?.status || "—"}</td>
                        <td style={tdStyle}>
                          <strong>{row.valid ? "VALID" : "INVALID"}</strong>
                          {(row.errors || []).map((item) => <div key={item} style={errorText}><small>{item}</small></div>)}
                          {(row.warnings || []).map((item) => <div key={item} style={warningText}><small>{item}</small></div>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </AnalyticsPanel>
        )}

        <AnalyticsPanel
          title="Supported Existing-Excel Columns"
          subtitle="CHRiS accepts common alternatives, so your workbook does not have to use the template headings exactly."
          icon={<FaFileExcel />}
        >
          <div style={aliasGrid}>
            <Alias title="Employee" text="Employee Number / Employee No / Employee ID / Staff ID / Staff Number" />
            <Alias title="Loan type" text="Loan Type / Loan Policy / Purpose / Loan Purpose / Reason for Loan" />
            <Alias title="Principal" text="Principal Amount / Loan Amount / Amount Granted" />
            <Alias title="Balance" text="Outstanding Balance / Outstanding Amount / Balance / Loan Balance" />
            <Alias title="Recovered" text="Amount Already Recovered / Amount Paid / Recovered Amount / Total Recovered" />
            <Alias title="Installment" text="Monthly Installment / Installment Amount / Monthly Deduction / Monthly Charge" />
            <Alias title="Dates" text="Application, Approval, Disbursement and Recovery/Repayment Start Date" />
            <Alias title="Other" text="Status, Interest Rate %, Source Reference, Notes / Remarks" />
          </div>
        </AnalyticsPanel>
      </main>
    </>
  );
}

function Alias({ title, text }) {
  return <div style={aliasCard}><strong>{title}</strong><span>{text}</span></div>;
}

const pageStyle = { maxWidth: 1240, margin: "0 auto", padding: "0 20px 40px", color: "var(--chris-dashboard-text)" };
const toolbarStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "6px 0 18px" };
const modeGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 };
const uploadGrid = { display: "grid", gridTemplateColumns: "minmax(260px,1fr) auto auto", gap: 12, alignItems: "end" };
const fieldStyle = { display: "grid", gap: 8, fontWeight: 800 };
const buttonBase = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 9, padding: "10px 14px", fontWeight: 900, cursor: "pointer" };
const primaryButton = { ...buttonBase, border: 0, background: "var(--chris-dashboard-gold)", color: "#111" };
const secondaryButton = { ...buttonBase, border: "1px solid var(--chris-dashboard-border)", background: "var(--chris-dashboard-surface)", color: "var(--chris-dashboard-text)" };
const linkButton = { ...buttonBase, paddingLeft: 0, border: 0, background: "transparent", color: "var(--chris-dashboard-gold-bright)" };
const noteStyle = { marginTop: 14, color: "var(--chris-dashboard-muted)", lineHeight: 1.6 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 1100 };
const thStyle = { textAlign: "left", padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)", color: "var(--chris-dashboard-muted)", fontSize: 12 };
const tdStyle = { padding: 10, verticalAlign: "top", borderBottom: "1px solid var(--chris-dashboard-border)" };
const errorStyle = { padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid #b91c1c", color: "#b91c1c" };
const messageStyle = { padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid var(--chris-dashboard-border)" };
const errorText = { color: "#ef4444", marginTop: 4 };
const warningText = { color: "var(--chris-dashboard-gold-bright)", marginTop: 4 };
const aliasGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 };
const aliasCard = { display: "grid", gap: 5, padding: 12, border: "1px solid var(--chris-dashboard-border)", borderRadius: 10, background: "var(--chris-dashboard-surface)" };

export default LoanBulkUpload;