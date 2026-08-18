import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";
import EmployeeLookup from "../components/shared/EmployeeLookup";

function WorkedHours() {
  const navigate = useNavigate();
  const [basis, setBasis] = useState("SYSTEM");
  const [defaultBasis, setDefaultBasis] = useState("SYSTEM");
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    employeeNumber: "",
  });
  const [summary, setSummary] = useState({
    records: [],
    totals: {},
  });
  const [manualForm, setManualForm] = useState({
    employeeNumber: "",
    periodStart: "",
    periodEnd: "",
    workedHours: "",
    workedDays: "",
    notes: "",
  });
  const [manualEntries, setManualEntries] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");

    try {
      const params = new URLSearchParams();

      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.employeeNumber) {
        params.set("employeeNumber", filters.employeeNumber);
      }

      const suffix = params.toString() ? `?${params}` : "";

      const [systemResult, configResult, manualResult] =
        await Promise.all([
          apiRequest(`/api/attendance/worked-hours${suffix}`),
          apiRequest("/api/attendance/payroll-basis"),
          apiRequest(`/api/attendance/manual-payroll-inputs${suffix}`),
        ]);

      setSummary(systemResult.data || { records: [], totals: {} });
      setDefaultBasis(configResult.data?.basis || "SYSTEM");
      setBasis(configResult.data?.basis || "SYSTEM");
      setManualEntries(manualResult.data || []);
    } catch (err) {
      setError(err.message || "Unable to load worked-hours data.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function saveDefaultBasis(nextBasis) {
    setBusy(true);
    setMessage("");
    setError("");

    try {
      await apiRequest("/api/attendance/payroll-basis", {
        method: "PATCH",
        body: JSON.stringify({ basis: nextBasis }),
      });

      setDefaultBasis(nextBasis);
      setBasis(nextBasis);
      setMessage(
        nextBasis === "SYSTEM"
          ? "Payroll attendance basis set to system-calculated hours and days."
          : "Payroll attendance basis set to administrator-entered hours and days."
      );
    } catch (err) {
      setError(err.message || "Unable to update payroll attendance basis.");
    } finally {
      setBusy(false);
    }
  }

  async function saveManual(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      await apiRequest("/api/attendance/manual-payroll-inputs", {
        method: "POST",
        body: JSON.stringify({
          employeeNumber: manualForm.employeeNumber,
          periodStart: manualForm.periodStart,
          periodEnd: manualForm.periodEnd,
          workedHours: Number(manualForm.workedHours || 0),
          workedDays: Number(manualForm.workedDays || 0),
          notes: manualForm.notes || null,
        }),
      });

      setMessage("Administrator payroll attendance input saved.");
      setManualForm({
        employeeNumber: "",
        periodStart: "",
        periodEnd: "",
        workedHours: "",
        workedDays: "",
        notes: "",
      });

      await load();
    } catch (err) {
      setError(err.message || "Unable to save manual payroll attendance input.");
    } finally {
      setBusy(false);
    }
  }

  const systemTotals = summary.totals || {};

  const selectedManualTotal = useMemo(() => {
    return manualEntries.reduce(
      (acc, item) => {
        acc.hours += Number(item.workedHours || 0);
        acc.days += Number(item.workedDays || 0);
        return acc;
      },
      { hours: 0, days: 0 }
    );
  }, [manualEntries]);

  return (
    <div style={{ color: "var(--chris-text-main)" }}>
      <button type="button" onClick={() => navigate("/attendance")} style={backStyle}>
        {"\u2190"} Back to Time & Attendance Dashboard
      </button>

      <div style={{ marginBottom: 22 }}>
        <div style={eyebrowStyle}>TIME & ATTENDANCE</div>
        <h1 style={titleStyle}>Worked Hours & Payroll Basis</h1>
        <p style={descriptionStyle}>
          Compare system-calculated attendance with administrator-entered payroll hours and days without altering the underlying attendance record.
        </p>
      </div>

      {message && <Notice success>{message}</Notice>}
      {error && <Notice>{error}</Notice>}

      <section style={panelStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={{ margin: 0 }}>Payroll Attendance Source</h2>
            <p style={sectionSubStyle}>
              Choose which attendance source CHRIS should use by default when payroll is computed.
            </p>
          </div>

          <span style={basisBadgeStyle}>
            DEFAULT: {defaultBasis === "SYSTEM" ? "SYSTEM" : "CLIENT / ADMIN"}
          </span>
        </div>

        <div style={sourceGridStyle}>
          <button
            type="button"
            disabled={busy}
            onClick={() => saveDefaultBasis("SYSTEM")}
            style={basis === "SYSTEM" ? selectedSourceStyle : sourceStyle}
          >
            <strong>System Calculated</strong>
            <span style={sourceDescriptionStyle}>
              Uses clock-in/out, assigned shifts, breaks, worked days and attendance rules calculated by CHRIS.
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => saveDefaultBasis("ADMIN_ENTERED")}
            style={basis === "ADMIN_ENTERED" ? selectedSourceStyle : sourceStyle}
          >
            <strong>Client / Administrator Entered</strong>
            <span style={sourceDescriptionStyle}>
              Uses approved hours and/or days manually entered by the client administrator for payroll computation.
            </span>
          </button>
        </div>

        <div style={integrityNoticeStyle}>
          <strong>Data-integrity rule:</strong>
          <span>
            Manual payroll values never overwrite clock-in/out attendance. Both sources are retained so HR can audit system values against client-entered payroll values.
          </span>
        </div>
      </section>

      <div style={metricGridStyle}>
        <Metric label="System Worked Hours" value={formatNumber(systemTotals.workedHours)} />
        <Metric label="System Worked Days" value={formatNumber(systemTotals.workedDays)} />
        <Metric label="Admin Entered Hours" value={formatNumber(selectedManualTotal.hours)} />
        <Metric label="Admin Entered Days" value={formatNumber(selectedManualTotal.days)} />
      </div>

      <section style={panelStyle}>
        <h2 style={{ margin: 0 }}>System Worked Hours</h2>
        <p style={sectionSubStyle}>
          Calculated from live attendance records. Break minutes are deducted when an assigned shift defines a break.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            load();
          }}
          style={filterGridStyle}
        >
          <Field label="From">
            <input type="date" style={inputStyle} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </Field>

          <Field label="To">
            <input type="date" style={inputStyle} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </Field>

          <Field label="Employee">
            <EmployeeLookup
              value={filters.employeeNumber}
              onSelect={({ employeeNumber }) =>
                setFilters({ ...filters, employeeNumber })
              }
            />
          </Field>

          <button type="submit" style={primaryButtonStyle}>Apply Filters</button>
        </form>

        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Shift</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Gross Hours</th>
                <th>Break</th>
                <th>Net Worked Hours</th>
                <th>Worked Day</th>
              </tr>
            </thead>
            <tbody>
              {(summary.records || []).length ? (
                summary.records.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.attendanceDate)}</td>
                    <td>
                      <strong>{row.employee?.employeeNumber || "—"}</strong>
                      <div style={mutedStyle}>{row.employee?.name || ""}</div>
                    </td>
                    <td>{row.shift?.name || "—"}</td>
                    <td>{formatTime(row.clockIn)}</td>
                    <td>{formatTime(row.clockOut)}</td>
                    <td>{formatNumber(row.grossWorkedHours)}</td>
                    <td>{formatNumber(row.breakHours)}</td>
                    <td><strong>{formatNumber(row.netWorkedHours)}</strong></td>
                    <td>{row.workedDay ? "Yes" : "No"}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="9" style={emptyCellStyle}>No system attendance records match the selected period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div style={workspaceGridStyle}>
        <section style={panelStyle}>
          <h2 style={{ margin: 0 }}>Admin Payroll Input</h2>
          <p style={sectionSubStyle}>
            Enter client-approved hours and/or days for a payroll period.
          </p>

          <form onSubmit={saveManual} style={manualFormStyle}>
            <Field label="Employee">
              <EmployeeLookup
                value={manualForm.employeeNumber}
                onSelect={({ employeeNumber }) =>
                  setManualForm({ ...manualForm, employeeNumber })
                }
              />
            </Field>

            <div style={twoColumnStyle}>
              <Field label="Period Start">
                <input required type="date" style={inputStyle} value={manualForm.periodStart} onChange={(e) => setManualForm({ ...manualForm, periodStart: e.target.value })} />
              </Field>

              <Field label="Period End">
                <input required type="date" min={manualForm.periodStart || undefined} style={inputStyle} value={manualForm.periodEnd} onChange={(e) => setManualForm({ ...manualForm, periodEnd: e.target.value })} />
              </Field>
            </div>

            <div style={twoColumnStyle}>
              <Field label="Worked Hours">
                <input type="number" min="0" step="0.01" style={inputStyle} value={manualForm.workedHours} onChange={(e) => setManualForm({ ...manualForm, workedHours: e.target.value })} placeholder="Optional" />
              </Field>

              <Field label="Worked Days">
                <input type="number" min="0" step="0.5" style={inputStyle} value={manualForm.workedDays} onChange={(e) => setManualForm({ ...manualForm, workedDays: e.target.value })} placeholder="Optional" />
              </Field>
            </div>

            <Field label="Reason / Notes">
              <textarea style={{ ...inputStyle, minHeight: 82, resize: "vertical" }} value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} placeholder="Why is the client-entered value being used?" />
            </Field>

            <button type="submit" disabled={busy} style={primaryButtonStyle}>
              Save Payroll Input
            </button>
          </form>
        </section>

        <section style={panelStyle}>
          <h2 style={{ margin: 0 }}>Manual Payroll Inputs</h2>
          <p style={sectionSubStyle}>
            Administrator-entered payroll attendance values retained separately from system attendance.
          </p>

          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Period</th>
                  <th>Hours</th>
                  <th>Days</th>
                  <th>Entered By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {manualEntries.length ? (
                  manualEntries.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.employeeNumber}</strong>
                        <div style={mutedStyle}>{item.employeeName || ""}</div>
                      </td>
                      <td>{formatDate(item.periodStart)} - {formatDate(item.periodEnd)}</td>
                      <td>{formatNumber(item.workedHours)}</td>
                      <td>{formatNumber(item.workedDays)}</td>
                      <td>{item.recordedByName || "Administrator"}</td>
                      <td>{item.notes || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="6" style={emptyCellStyle}>No administrator payroll attendance inputs for this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2).replace(/\.00$/, "") : "0";
}
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { timeZone: "UTC" });
}
function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function Field({ label, children }) {
  return <label><div style={fieldLabelStyle}>{label}</div>{children}</label>;
}
function Metric({ label, value }) {
  return <div style={panelStyle}><div style={metricLabelStyle}>{label}</div><div style={metricValueStyle}>{value}</div><div style={mutedStyle}>Current filtered period</div></div>;
}
function Notice({ children, success = false }) {
  return <div style={{...panelStyle,padding:"12px 16px",marginBottom:18,color:success?"var(--chris-success)":"var(--chris-warning)"}}>{children}</div>;
}

const panelStyle={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)"};
const metricGridStyle={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:16,margin:"18px 0"};
const workspaceGridStyle={display:"grid",gridTemplateColumns:"minmax(350px,.9fr) minmax(600px,1.5fr)",gap:18,alignItems:"start",marginTop:18};
const sourceGridStyle={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12,marginTop:16};
const sourceStyle={display:"grid",gap:8,textAlign:"left",padding:16,border:"1px solid var(--chris-border-soft)",borderRadius:"var(--chris-radius-md)",background:"rgba(255,255,255,.025)",color:"var(--chris-text-main)",cursor:"pointer"};
const selectedSourceStyle={...sourceStyle,border:"1px solid var(--chris-border-gold)",background:"rgba(212,175,55,.08)"};
const sourceDescriptionStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",lineHeight:1.5};
const integrityNoticeStyle={display:"grid",gap:4,marginTop:14,padding:12,border:"1px solid rgba(52,211,153,.20)",borderRadius:"var(--chris-radius-md)",background:"rgba(52,211,153,.05)",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
const basisBadgeStyle={padding:"5px 9px",borderRadius:"var(--chris-radius-pill)",background:"rgba(212,175,55,.10)",color:"var(--chris-gold)",fontSize:"var(--chris-font-xs)",fontWeight:800};
const filterGridStyle={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,alignItems:"end",marginTop:16};
const manualFormStyle={display:"grid",gap:12,marginTop:16};
const twoColumnStyle={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12};
const inputStyle={width:"100%",boxSizing:"border-box",padding:"11px 12px",borderRadius:"var(--chris-radius-md)",border:"1px solid var(--chris-border-soft)",background:"var(--chris-input-bg)",color:"var(--chris-text-main)",fontFamily:"var(--chris-font-family)"};
const primaryButtonStyle={border:0,borderRadius:"var(--chris-radius-md)",padding:"12px 16px",background:"linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep))",color:"#07110C",fontWeight:800,cursor:"pointer"};
const backStyle={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,cursor:"pointer"};
const eyebrowStyle={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const descriptionStyle={margin:0,maxWidth:1000,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.55};
const sectionHeaderStyle={display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16};
const sectionSubStyle={margin:"6px 0 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
const fieldLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700,marginBottom:7};
const metricLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700};
const metricValueStyle={fontSize:28,fontWeight:800,marginTop:10};
const mutedStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-xs)",marginTop:4};
const emptyCellStyle={padding:"24px 12px",color:"var(--chris-text-secondary)",textAlign:"center"};

export default WorkedHours;
