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
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
      const result = await apiRequest(`/api/loans/bulk/${mode}`, {
        method: "POST",
        body,
      });
      if (mode === "preview") {
        setPreview(result?.data || null);
        setMessage(result?.data?.importAllowed
          ? "Validation passed. All rows are ready for controlled import."
          : "Validation completed. Correct the invalid rows in Excel and validate again before importing.");
      } else {
        setMessage(result?.message || "Loan workbook imported successfully.");
        setPreview(null);
        setFile(null);
        if (onImported) await onImported(result?.data || null);
      }
    } catch (requestError) {
      setError(requestError?.message || `Unable to ${mode === "preview" ? "validate" : "import"} the loan workbook.`);
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
        description="Validate and migrate existing ZERMATT loan balances from Excel into CHRiS without fabricating payroll recovery history."
        metrics={[
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
          title="Upload Existing Loan Workbook"
          subtitle="Your existing Excel can be used directly if its column names match one of CHRiS's supported aliases. The preview will identify anything that needs adjustment."
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
              <FaFileExcel /> {busy === "import" ? "Importing…" : "Import Validated Workbook"}
            </button>
          </div>
          <p style={noteStyle}>
            Import is deliberately blocked when any row is invalid. This prevents a partial financial migration. Existing amounts already repaid before CHRiS are carried as opening recovery balances; they are not inserted as fake payroll recovery transactions.
          </p>
        </AnalyticsPanel>

        {preview && (
          <AnalyticsPanel
            title="Validation Preview"
            subtitle={`${preview.validRows} valid · ${preview.invalidRows} invalid · ${preview.warningRows} warning row(s)`}
            icon={<FaFileExcel />}
          >
            <div style={{ overflowX: "auto" }}>
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
