import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../services/api";

export default function BulkEmployeeImport() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("create");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const [catalog, setCatalog] = useState({ employmentTypes: [], costCentres: [] });
  const [assignment, setAssignment] = useState({
    employeeNumber: "",
    employmentType: "",
    costCentreId: "",
    reason: "",
  });
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const [assignmentFile, setAssignmentFile] = useState(null);
  const [assignmentPreview, setAssignmentPreview] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);

  useEffect(() => {
    if (mode !== "assign") return undefined;
    let cancelled = false;
    apiRequest("/api/employee-assignments/catalog")
      .then((response) => {
        if (!cancelled) setCatalog(response.data || { employmentTypes: [], costCentres: [] });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Unable to load assignment catalogue.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setAssignmentNotice("");
  };

  const downloadTemplate = async () => {
    try {
      setBusy("template");
      setError("");
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

  const saveIndividualAssignment = async () => {
    if (!assignment.employeeNumber.trim()) {
      setError("Enter the employee number to assign.");
      return;
    }
    if (!assignment.employmentType && !assignment.costCentreId) {
      setError("Select Employment Type, Cost Centre / Operating Unit, or both.");
      return;
    }
    try {
      setBusy("individual-assignment");
      setError("");
      setAssignmentNotice("");
      const response = await apiRequest(
        `/api/employee-assignments/${encodeURIComponent(assignment.employeeNumber.trim())}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            employmentType: assignment.employmentType || undefined,
            costCentreId: assignment.costCentreId || undefined,
            reason: assignment.reason || "HR employment assignment",
          }),
        }
      );
      setAssignmentNotice(response.message || "Employee assignment saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const downloadAssignmentTemplate = async () => {
    try {
      setBusy("assignment-template");
      setError("");
      saveDownloadedBlob(await apiDownload("/api/employee-assignments/template"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const sendAssignmentFile = async (endpoint) => {
    if (!assignmentFile) throw new Error("Select the completed existing-employee assignment workbook first.");
    const body = new FormData();
    body.append("file", assignmentFile);
    return apiRequest(endpoint, { method: "POST", body });
  };

  const validateAssignments = async () => {
    try {
      setBusy("assignment-preview");
      setError("");
      setAssignmentResult(null);
      const response = await sendAssignmentFile("/api/employee-assignments/preview");
      setAssignmentPreview(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const applyAssignments = async () => {
    try {
      setBusy("assignment-bulk");
      setError("");
      const response = await sendAssignmentFile("/api/employee-assignments/bulk");
      setAssignmentResult(response.data);
      setAssignmentPreview(null);
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
      <h1 style={title}>Employee Upload & Employment Assignment</h1>
      <p style={lead}>
        Create new employees through the controlled CHRiS import flow, or assign Employment Type and Cost Centre / Operating Unit to existing employees without recreating employee records.
      </p>

      <div style={modeRow}>
        <button type="button" style={mode === "create" ? activeModeButton : modeButton} onClick={() => switchMode("create")}>Create Employees</button>
        <button type="button" style={mode === "assign" ? activeModeButton : modeButton} onClick={() => switchMode("assign")}>Assign Existing Employees</button>
      </div>

      {error && <div role="alert" style={errorStyle}>{error}</div>}

      {mode === "create" ? (
        <CreateEmployeesWorkspace
          file={file}
          setFile={setFile}
          preview={preview}
          setPreview={setPreview}
          result={result}
          setResult={setResult}
          busy={busy}
          setError={setError}
          downloadTemplate={downloadTemplate}
          validate={validate}
          importRows={importRows}
          navigate={navigate}
        />
      ) : (
        <AssignmentWorkspace
          catalog={catalog}
          assignment={assignment}
          setAssignment={setAssignment}
          assignmentNotice={assignmentNotice}
          busy={busy}
          saveIndividualAssignment={saveIndividualAssignment}
          assignmentFile={assignmentFile}
          setAssignmentFile={setAssignmentFile}
          assignmentPreview={assignmentPreview}
          setAssignmentPreview={setAssignmentPreview}
          assignmentResult={assignmentResult}
          setAssignmentResult={setAssignmentResult}
          setError={setError}
          downloadAssignmentTemplate={downloadAssignmentTemplate}
          validateAssignments={validateAssignments}
          applyAssignments={applyAssignments}
        />
      )}
    </section>
  );
}

function CreateEmployeesWorkspace({
  file,
  setFile,
  preview,
  setPreview,
  result,
  setResult,
  busy,
  setError,
  downloadTemplate,
  validate,
  importRows,
  navigate,
}) {
  return (
    <>
      <div style={stepsGrid}>
        <Card number="1" title="Download new-employee template">
          <p style={muted}>Use the CHRiS workbook so department, designation, Employment Type and Cost Centre can be validated consistently.</p>
          <button type="button" style={secondaryButton} onClick={downloadTemplate} disabled={busy}>
            {busy === "template" ? "Preparing…" : "Download Excel Template"}
          </button>
        </Card>

        <Card number="2" title="Validate and create employees">
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

      {preview && (
        <section style={panelStyle}>
          <div style={summaryBar}>
            <strong>Validation result</strong>
            <span>{preview.validRows} valid · {preview.invalidRows} invalid · {preview.totalRows} total</span>
          </div>
          <CreateResultTable rows={preview.rows} validation />
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
          <CreateResultTable rows={result.results} />
          <div style={actionRow}>
            <button type="button" style={primaryButton} onClick={() => navigate("/employees/directory")}>Return to Employee Directory</button>
          </div>
        </section>
      )}
    </>
  );
}

function AssignmentWorkspace({
  catalog,
  assignment,
  setAssignment,
  assignmentNotice,
  busy,
  saveIndividualAssignment,
  assignmentFile,
  setAssignmentFile,
  assignmentPreview,
  setAssignmentPreview,
  assignmentResult,
  setAssignmentResult,
  setError,
  downloadAssignmentTemplate,
  validateAssignments,
  applyAssignments,
}) {
  const employmentTypes = catalog?.employmentTypes || [];
  const costCentres = catalog?.costCentres || [];
  const takeaway = costCentres.filter((row) => String(row.name || "").startsWith("BB Takeaway"));

  return (
    <>
      <section style={catalogPanel}>
        <strong>Authoritative Employment Types</strong>
        <div style={chipRow}>
          {employmentTypes.map((item) => <span key={item} style={chip}>{item}</span>)}
        </div>
        {takeaway.length > 0 && (
          <p style={{ ...muted, marginBottom: 0 }}>
            BB Takeaway Cost Centres: {takeaway.map((row) => `${row.name} (${row.code})`).join(" · ")}
          </p>
        )}
      </section>

      <div style={stepsGrid}>
        <Card number="1" title="Assign one existing employee">
          <p style={muted}>Use the employee number. Only the Employment Type and/or Cost Centre selected below will be updated.</p>
          <div style={formGrid}>
            <Field label="Employee No">
              <input
                style={inputStyle}
                value={assignment.employeeNumber}
                placeholder="ZLL000139"
                onChange={(event) => setAssignment((current) => ({ ...current, employeeNumber: event.target.value }))}
              />
            </Field>
            <Field label="Employment Type">
              <select
                style={inputStyle}
                value={assignment.employmentType}
                onChange={(event) => setAssignment((current) => ({ ...current, employmentType: event.target.value }))}
              >
                <option value="">Keep current Employment Type</option>
                {employmentTypes.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Cost Centre / Operating Unit">
              <select
                style={inputStyle}
                value={assignment.costCentreId}
                onChange={(event) => setAssignment((current) => ({ ...current, costCentreId: event.target.value }))}
              >
                <option value="">Keep current Cost Centre</option>
                {costCentres.map((row) => (
                  <option key={row.id} value={row.id}>{row.code} - {row.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Reason / Notes">
              <input
                style={inputStyle}
                value={assignment.reason}
                placeholder="HR master-data assignment"
                onChange={(event) => setAssignment((current) => ({ ...current, reason: event.target.value }))}
              />
            </Field>
          </div>
          <button type="button" style={primaryButton} onClick={saveIndividualAssignment} disabled={busy}>
            {busy === "individual-assignment" ? "Saving…" : "Save Employee Assignment"}
          </button>
          {assignmentNotice && <div role="status" style={successStyle}>{assignmentNotice}</div>}
        </Card>

        <Card number="2" title="Bulk assign existing employees">
          <p style={muted}>Download the assignment workbook. It uses Employee No as the authoritative identifier and does not create new employee records.</p>
          <button type="button" style={secondaryButton} onClick={downloadAssignmentTemplate} disabled={busy}>
            {busy === "assignment-template" ? "Preparing…" : "Download Assignment Template"}
          </button>
          <div style={{ marginTop: 16 }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                setAssignmentFile(event.target.files?.[0] || null);
                setAssignmentPreview(null);
                setAssignmentResult(null);
                setError("");
              }}
            />
            <p style={muted}>{assignmentFile ? assignmentFile.name : "No assignment workbook selected."}</p>
            <button type="button" style={primaryButton} onClick={validateAssignments} disabled={!assignmentFile || busy}>
              {busy === "assignment-preview" ? "Validating…" : "Validate Assignments"}
            </button>
          </div>
        </Card>
      </div>

      {assignmentPreview && (
        <section style={panelStyle}>
          <div style={summaryBar}>
            <strong>Assignment validation</strong>
            <span>{assignmentPreview.validRows} valid · {assignmentPreview.invalidRows} invalid · {assignmentPreview.totalRows} total</span>
          </div>
          <AssignmentResultTable rows={assignmentPreview.rows} validation />
          <div style={actionRow}>
            <button type="button" style={primaryButton} onClick={applyAssignments} disabled={busy || assignmentPreview.validRows === 0}>
              {busy === "assignment-bulk" ? "Applying…" : `Apply ${assignmentPreview.validRows} Valid Assignment${assignmentPreview.validRows === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      )}

      {assignmentResult && (
        <section style={panelStyle}>
          <div style={summaryBar}>
            <strong>Assignment upload completed</strong>
            <span>{assignmentResult.updated} updated · {assignmentResult.unchanged} unchanged · {assignmentResult.failed} failed · {assignmentResult.total} total</span>
          </div>
          <AssignmentResultTable rows={assignmentResult.results} />
        </section>
      )}
    </>
  );
}

function Card({ number, title, children }) {
  return <section style={cardStyle}><div style={stepLabel}>STEP {number}</div><h2 style={cardTitle}>{title}</h2>{children}</section>;
}

function Field({ label, children }) {
  return <label style={fieldLabel}><span>{label}</span>{children}</label>;
}

function CreateResultTable({ rows, validation = false }) {
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

function AssignmentResultTable({ rows, validation = false }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead><tr><th>Row</th><th>Employee</th><th>Employment Type</th><th>Cost Centre</th><th>Status</th><th>Details</th></tr></thead>
        <tbody>
          {(rows || []).map((row) => {
            const ok = validation ? row.valid : row.success;
            const display = validation ? row.display : row.employee;
            const errors = row.errors || [];
            return (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                <td>{display?.employeeNumber || "-"}{display?.employeeName ? ` — ${display.employeeName}` : ""}</td>
                <td>{display?.newEmploymentType || display?.employmentType || "Keep current"}</td>
                <td>{display?.newCostCentre || display?.costCentre?.name || "Keep current"}</td>
                <td><span style={ok ? okBadge : badBadge}>{ok ? (validation ? "Valid" : display?.changed ? "Updated" : "Unchanged") : "Needs attention"}</span></td>
                <td>{errors.length ? errors.join(" · ") : "Ready"}</td>
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
const modeRow = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 };
const modeButton = { border: "1px solid rgba(212,175,55,.5)", borderRadius: 999, padding: "10px 16px", background: "transparent", color: "#D4AF37", fontWeight: 800, cursor: "pointer" };
const activeModeButton = { ...modeButton, background: "#D4AF37", color: "#07140D" };
const stepsGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18, marginTop: 24 };
const cardStyle = { padding: 22, border: "1px solid var(--chris-border-gold)", borderRadius: 16, background: "linear-gradient(145deg,rgba(8,50,33,.96),rgba(3,20,13,.98))", boxShadow: "var(--chris-shadow-card)" };
const stepLabel = { color: "#D4AF37", fontSize: 10, fontWeight: 900, letterSpacing: ".12em" };
const cardTitle = { margin: "7px 0 10px" };
const muted = { color: "var(--chris-text-secondary)", lineHeight: 1.55 };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)" };
const panelStyle = { marginTop: 22, border: "1px solid rgba(212,175,55,.55)", borderRadius: 14, overflow: "hidden", background: "rgba(2,22,14,.65)" };
const catalogPanel = { ...panelStyle, padding: 16 };
const summaryBar = { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: 15, borderBottom: "1px solid rgba(255,255,255,.08)" };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const actionRow = { display: "flex", justifyContent: "flex-end", padding: 15 };
const errorStyle = { marginTop: 18, padding: 13, borderRadius: 10, color: "#FCA5A5", border: "1px solid rgba(248,113,113,.5)", background: "rgba(185,28,28,.14)" };
const successStyle = { marginTop: 14, padding: 11, borderRadius: 9, color: "#2EE98B", border: "1px solid rgba(46,233,139,.4)", background: "rgba(46,233,139,.08)" };
const okBadge = { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(46,233,139,.15)", color: "#2EE98B", fontWeight: 800, fontSize: 11 };
const badBadge = { ...okBadge, background: "rgba(248,113,113,.14)", color: "#FCA5A5" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, margin: "14px 0" };
const fieldLabel = { display: "grid", gap: 6, color: "#F7FAF8", fontSize: 12, fontWeight: 800 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 8, border: "1px solid rgba(255,255,255,.18)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8" };
const chipRow = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 };
const chip = { padding: "6px 10px", borderRadius: 999, background: "rgba(212,175,55,.13)", border: "1px solid rgba(212,175,55,.45)", color: "#D4AF37", fontSize: 12, fontWeight: 800 };
