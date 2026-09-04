import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../services/api";

export default function BulkEmployeeImport() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const downloadTemplate = async () => {
    try {
      setBusy("template");
      saveDownloadedBlob(await apiDownload("/api/employee-data/bulk/template"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const sendFile = async (endpoint) => {
    if (!file) throw new Error("Select the completed CHRiS Excel template first.");
    const body = new FormData();
    body.append("file", file);
    return apiRequest(endpoint, { method: "POST", body });
  };

  const validate = async () => {
    try {
      setBusy("preview");
      setError("");
      setResult(null);
      const response = await sendFile("/api/employee-data/bulk/preview");
      setPreview(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const importRows = async () => {
    try {
      setBusy("import");
      setError("");
      const response = await sendFile("/api/employee-data/bulk/import");
      setResult(response.data);
      setPreview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <section style={pageStyle}>
      <button type="button" style={backStyle} onClick={() => navigate("/employees/directory")}>← Employee Directory</button>
      <div style={eyebrow}>EMPLOYEE DATA OPERATIONS</div>
      <h1 style={title}>Bulk Upload Employees</h1>
      <p style={lead}>
        Download the controlled CHRiS template, complete one employee per row, validate the workbook, then import. Every successful row uses the same authoritative employee creation transaction as manual creation.
      </p>

      <div style={stepsGrid}>
        <Card number="1" title="Download template">
          <p style={muted}>Use the CHRiS workbook so department, designation and employee fields can be validated consistently.</p>
          <button type="button" style={secondaryButton} onClick={downloadTemplate} disabled={busy}>
            {busy === "template" ? "Preparing…" : "Download Excel Template"}
          </button>
        </Card>

        <Card number="2" title="Select completed workbook">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
              setResult(null);
              setError("");
            }}
          />
          <p style={muted}>{file ? file.name : "No workbook selected."}</p>
          <button type="button" style={primaryButton} onClick={validate} disabled={!file || busy}>
            {busy === "preview" ? "Validating…" : "Validate Workbook"}
          </button>
        </Card>
      </div>

      {error && <div role="alert" style={errorStyle}>{error}</div>}

      {preview && (
        <section style={panelStyle}>
          <div style={summaryBar}>
            <strong>Validation result</strong>
            <span>{preview.validRows} valid · {preview.invalidRows} invalid · {preview.totalRows} total</span>
          </div>
          <ResultTable rows={preview.rows} validation />
          <div style={actionRow}>
            <button type="button" style={primaryButton} onClick={importRows} disabled={busy || preview.validRows === 0}>
              {busy === "import" ? "Importing…" : `Import ${preview.validRows} Valid Employee${preview.validRows === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      )}

      {result && (
        <section style={panelStyle}>
          <div style={summaryBar}>
            <strong>Import completed</strong>
            <span>{result.created} created · {result.failed} failed · {result.total} total</span>
          </div>
          <ResultTable rows={result.results} />
          <div style={actionRow}>
            <button type="button" style={primaryButton} onClick={() => navigate("/employees/directory")}>Return to Employee Directory</button>
          </div>
        </section>
      )}
    </section>
  );
}

function Card({ number, title, children }) {
  return <section style={cardStyle}><div style={stepLabel}>STEP {number}</div><h2 style={cardTitle}>{title}</h2>{children}</section>;
}

function ResultTable({ rows, validation = false }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead><tr><th>Row</th><th>Employee</th><th>Email</th><th>Status</th><th>Details</th></tr></thead>
        <tbody>
          {(rows || []).map((row) => {
            const ok = validation ? row.valid : row.success;
            const employee = validation ? row.display : row.employee;
            const errors = row.errors || [];
            return (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                <td>{employee?.name || employee?.employeeNumber || "-"}</td>
                <td>{employee?.email || "-"}</td>
                <td><span style={ok ? okBadge : badBadge}>{ok ? (validation ? "Valid" : "Created") : "Needs attention"}</span></td>
                <td>{errors.length ? errors.join(" · ") : (employee?.employeeNumber || "Ready")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const pageStyle = { maxWidth: 1180, margin: "0 auto", color: "var(--chris-text-main)" };
const backStyle = { border: 0, background: "transparent", color: "#D4AF37", fontWeight: 800, cursor: "pointer", padding: "0 0 16px" };
const eyebrow = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const title = { margin: "7px 0", fontSize: 32 };
const lead = { color: "var(--chris-text-secondary)", lineHeight: 1.65, maxWidth: 900 };
const stepsGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 18, marginTop: 24 };
const cardStyle = { padding: 22, border: "1px solid var(--chris-border-gold)", borderRadius: 16, background: "linear-gradient(145deg,rgba(8,50,33,.96),rgba(3,20,13,.98))", boxShadow: "var(--chris-shadow-card)" };
const stepLabel = { color: "#D4AF37", fontSize: 10, fontWeight: 900, letterSpacing: ".12em" };
const cardTitle = { margin: "7px 0 10px" };
const muted = { color: "var(--chris-text-secondary)", lineHeight: 1.55 };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)" };
const panelStyle = { marginTop: 22, border: "1px solid rgba(212,175,55,.55)", borderRadius: 14, overflow: "hidden", background: "rgba(2,22,14,.65)" };
const summaryBar = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: 15, borderBottom: "1px solid rgba(255,255,255,.08)" };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 760 };
const actionRow = { display: "flex", justifyContent: "flex-end", padding: 15 };
const errorStyle = { marginTop: 18, padding: 13, borderRadius: 10, color: "#FCA5A5", border: "1px solid rgba(248,113,113,.5)", background: "rgba(185,28,28,.14)" };
const okBadge = { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(46,233,139,.15)", color: "#2EE98B", fontWeight: 800, fontSize: 11 };
const badBadge = { ...okBadge, background: "rgba(248,113,113,.14)", color: "#FCA5A5" };
