import { useEffect, useMemo, useState } from "react";
import WorkedDaysBulkUpload from "./WorkedDaysBulkUpload";
import EmployeeSearchSelect from "../EmployeeSearchSelect";
import { apiRequest } from "../../services/api";

export default function ManualWorkedDaysPanel({ periods = [], onSaved }) {
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [workedDays, setWorkedDays] = useState("");
  const [workedHours, setWorkedHours] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savedRows, setSavedRows] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastSaved, setLastSaved] = useState(null);

  const selectedPeriod = useMemo(
    () => (periods || []).find((period) => period.id === periodId) || null,
    [periods, periodId]
  );


  const selectedPeriodStart = selectedPeriod?.periodStart;
  const selectedPeriodEnd = selectedPeriod?.periodEnd;
  useEffect(() => {
    if (!selectedPeriodStart || !selectedPeriodEnd) {
      setSavedRows([]);
      setSavedError("");
      setSavedLoading(false);
      return undefined;
    }
    let active = true;
    setSavedLoading(true);
    setSavedError("");
    const qs = new URLSearchParams({
      from: String(selectedPeriodStart).slice(0, 10),
      to: String(selectedPeriodEnd).slice(0, 10),
    });
    apiRequest(`/api/attendance/manual-payroll-inputs?${qs.toString()}`)
      .then((result) => {
        if (!active) return;
        // The API accepts an inclusive interval. Show only the exact selected
        // payroll period so overlapping records cannot appear in this register.
        const rows = Array.isArray(result?.data) ? result.data : [];
        setSavedRows(rows.filter((row) =>
          String(row.periodStart || "").slice(0, 10) === String(selectedPeriodStart).slice(0, 10)
          && String(row.periodEnd || "").slice(0, 10) === String(selectedPeriodEnd).slice(0, 10)
        ));
      })
      .catch((loadError) => {
        if (!active) return;
        setSavedRows([]);
        setSavedError(loadError?.message || "Unable to load saved worked days.");
      })
      .finally(() => { if (active) setSavedLoading(false); });
    return () => { active = false; };
  }, [selectedPeriodStart, selectedPeriodEnd, refreshKey]);

  const refreshSavedEntries = async (data) => {
    setRefreshKey((key) => key + 1);
    if (onSaved) await onSaved(data);
  };

  const loadSavedForCorrection = (row) => {
    setEmployeeNumber(row.employeeNumber);
    setWorkedDays(row.workedDays == null ? "" : String(row.workedDays));
    setWorkedHours(row.workedHours == null ? "" : String(row.workedHours));
    setNotes(row.notes || "");
    setMessage(`Loaded saved worked days for ${row.employeeName || row.employeeNumber}. Review and save to update this payroll period.`);
    setError("");
    setLastSaved(null);
  };

  const changePeriod = (nextPeriodId) => {
    setPeriodId(nextPeriodId);
    // Manual attendance is a payroll-period exception, never an employee master value.
    // Changing payroll period must immediately clear the previous period's entered
    // days/hours so they cannot be visually or accidentally carried forward.
    setWorkedDays("");
    setWorkedHours("");
    setNotes("");
    setError("");
    setMessage("");
    setLastSaved(null);
    setSavedRows([]);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!employeeNumber || !selectedPeriod || workedDays === "") {
      setError("Select an employee and payroll period, then enter Worked Days.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      setMessage("");
      const result = await apiRequest("/api/attendance/manual-payroll-inputs", {
        method: "POST",
        body: {
          employeeNumber,
          periodStart: selectedPeriod.periodStart,
          periodEnd: selectedPeriod.periodEnd,
          workedDays: Number(workedDays),
          ...(workedHours !== "" ? { workedHours: Number(workedHours) } : {}),
          notes: notes || "Manual worked days entered because clocking is not configured/complete.",
        },
      });
      const saved = result?.data?.attendancePayrollInput;
      setLastSaved({
        employeeNumber,
        workedDays: saved?.workedDays ?? Number(workedDays),
        workedHours: saved?.workedHours ?? (workedHours === "" ? null : Number(workedHours)),
        periodName: selectedPeriod.code || selectedPeriod.name,
      });
      setMessage(result?.message || "Worked days saved. Any affected draft payroll is marked for recalculation.");
      // Keep entered values visible so HR sees what was saved and can correct
      // an exception without retyping. The period change still clears them.
      await refreshSavedEntries(result?.data || null);
    } catch (requestError) {
      setError(requestError?.message || "Unable to save manual worked days.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={panelStyle}>
      <div style={headingStyle}>AUTHORIZED HR · MANUAL WORKED DAYS</div>
      <p style={helpStyle}>
        Use this where attendance clocking is not configured or an approved absence/attendance exception must be reflected in payroll. Branch HR & Admin Officers may maintain employees in their assigned branch; Head HR may work organization-wide. Full-time new hires are automatically prorated from their employment effective date, allowing one off day per complete seven calendar days and up to 26 normal payable days. Manual Worked Days override this calculation for verified exceptions and apply only to the selected payroll period. When you move to the next period, the entry fields reset and CHRiS returns the employee to the applicable automatic days unless a new exception is entered. Historical entries remain available for audit.
      </p>
      {error && <div role="alert" style={errorStyle}>{error}</div>}
      {message && <div role="status" aria-live="polite" style={messageStyle}>{message}</div>}
      {lastSaved && (
        <div role="status" aria-live="polite" style={savedConfirmationStyle}>
          <strong>Saved successfully · {lastSaved.employeeNumber}</strong>
          <span>{lastSaved.periodName} · Worked Days: <strong>{lastSaved.workedDays}</strong>
            {lastSaved.workedHours != null ? ` · Worked Hours: ${lastSaved.workedHours}` : ""}
          </span>
          <small>Saved to the employee's selected payroll period. Recalculate any affected draft payroll before approval.</small>
        </div>
      )}
      <form onSubmit={save} style={gridStyle}>
        <EmployeeSearchSelect
          label="Employee"
          value={employeeNumber}
          onChange={(value) => { setEmployeeNumber(value); setError(""); setMessage(""); setLastSaved(null); }}
          required
          placeholder="Search employee number or name"
        />
        <label style={fieldStyle}>
          <span>Payroll Period</span>
          <select style={inputStyle} value={periodId} onChange={(event) => changePeriod(event.target.value)} required>
            <option value="">Select payroll period</option>
            {(periods || []).filter((period) => period.status !== "CLOSED").map((period) => (
              <option key={period.id} value={period.id}>{period.code} — {period.name}</option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span>Worked Days</span>
          <input style={inputStyle} type="number" min="0" step="0.5" value={workedDays} onChange={(event) => setWorkedDays(event.target.value)} required />
        </label>
        <label style={fieldStyle}>
          <span>Worked Hours (optional)</span>
          <input style={inputStyle} type="number" min="0" step="0.25" value={workedHours} onChange={(event) => setWorkedHours(event.target.value)} />
        </label>
        <label style={{ ...fieldStyle, gridColumn: "span 2" }}>
          <span>Reason / Notes</span>
          <input style={inputStyle} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. 3 absent days confirmed by Branch HR" />
        </label>
        <div style={{ display: "flex", alignItems: "end" }}>
          <button style={buttonStyle} disabled={busy || !employeeNumber || !periodId || workedDays === ""}>
            {busy ? "Saving…" : "Save Worked Days"}
          </button>
        </div>
      </form>

      <div style={registerStyle}>
        <div style={registerHeadingStyle}>
          <div>
            <strong>Saved Worked Days · Current Payroll Period</strong>
            <p style={{ ...helpStyle, margin: "4px 0 0" }}>
              Entries already recorded in CHRiS. Select an employee below to load saved values for correction.
            </p>
          </div>
          <button
            type="button"
            style={{ ...buttonStyle, width: "auto" }}
            disabled={!selectedPeriod || savedLoading}
            onClick={() => setRefreshKey((key) => key + 1)}
          >{savedLoading ? "Refreshing…" : "Refresh Saved Entries"}</button>
        </div>
        {!selectedPeriod && <p style={helpStyle}>Select a payroll period to view its saved worked-days entries.</p>}
        {selectedPeriod && savedError && <div role="alert" style={errorStyle}>Unable to load saved entries: {savedError}</div>}
        {selectedPeriod && !savedError && savedLoading && <p style={helpStyle}>Loading saved worked-days entries…</p>}
        {selectedPeriod && !savedError && !savedLoading && savedRows.length === 0 && (
          <p style={helpStyle}>No manual worked-days entries saved for this payroll period.</p>
        )}
        {selectedPeriod && !savedError && !savedLoading && savedRows.length > 0 && (
          <>
            <p style={helpStyle}>{savedRows.length} saved employee record{savedRows.length === 1 ? "" : "s"} in this payroll period.</p>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead><tr>{["Employee", "Worked Days", "Worked Hours", "Notes", "Recorded By", "Last Saved", "Action"].map((label) => (
                  <th key={label} style={tableHeaderStyle}>{label}</th>
                ))}</tr></thead>
                <tbody>{savedRows.map((row) => (
                  <tr key={row.id}>
                    <td style={tableCellStyle}><strong>{row.employeeName || row.employeeNumber}</strong><small style={{ display: "block" }}>{row.employeeNumber}</small></td>
                    <td style={tableCellStyle}><strong>{row.workedDays ?? "—"}</strong></td>
                    <td style={tableCellStyle}>{row.workedHours ?? "—"}</td>
                    <td style={tableCellStyle}>{row.notes || "—"}</td>
                    <td style={tableCellStyle}>{row.recordedByName || "—"}</td>
                    <td style={tableCellStyle}>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}</td>
                    <td style={tableCellStyle}><button type="button" style={rowButtonStyle}
                      onClick={() => loadSavedForCorrection(row)}>Load for Correction</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <WorkedDaysBulkUpload key={periodId} periodId={periodId} onSaved={refreshSavedEntries} />
      {selectedPeriod && <div style={periodStyle}>Attendance period: {selectedPeriod.periodStart} → {selectedPeriod.periodEnd}</div>}
    </section>
  );
}

const panelStyle = { marginTop: 16, padding: 16, border: "var(--chris-ui-panel-border, 1px solid rgba(212,175,55,.35))", borderRadius: "var(--chris-ui-panel-radius, 12px)", background: "var(--chris-ui-panel-background, rgba(3,28,18,.62))" };
const headingStyle = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".1em" };
const helpStyle = { margin: "7px 0 13px", color: "#A9BDB2", fontSize: 12, lineHeight: 1.55 };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, alignItems: "end" };
const fieldStyle = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8" };
const buttonStyle = { width: "100%", border: 0, borderRadius: 9, padding: "11px 14px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const periodStyle = { marginTop: 10, color: "#9FB7AA", fontSize: 11 };
const errorStyle = { marginBottom: 10, padding: 9, borderRadius: 8, border: "1px solid rgba(248,113,113,.45)", color: "#FCA5A5" };
const messageStyle = { marginBottom: 10, padding: 9, borderRadius: 8, border: "1px solid rgba(212,175,55,.4)", color: "#F7FAF8" };

const savedConfirmationStyle = { display: "grid", gap: 5, marginBottom: 12, padding: "12px 14px", borderRadius: 9, border: "1px solid rgba(74,222,128,.5)", background: "rgba(20,83,45,.22)", color: "#DCFCE7" };
const registerStyle = { marginTop: 20, padding: 14, border: "1px solid rgba(212,175,55,.25)", borderRadius: 10, background: "rgba(0,0,0,.12)" };
const registerHeadingStyle = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" };
const tableWrapStyle = { overflowX: "auto", maxHeight: 380, overflowY: "auto", marginTop: 9 };
const tableStyle = { borderCollapse: "collapse", width: "100%", minWidth: 780, color: "#F7FAF8", fontSize: 12 };
const tableHeaderStyle = { textAlign: "left", padding: 10, borderBottom: "1px solid rgba(212,175,55,.4)", color: "#D4AF37", position: "sticky", top: 0, background: "#0B241A" };
const tableCellStyle = { padding: "9px 10px", borderBottom: "1px solid rgba(255,255,255,.11)", verticalAlign: "top" };
const rowButtonStyle = { border: "1px solid rgba(212,175,55,.55)", background: "transparent", color: "#F7E6A0", borderRadius: 7, padding: "7px 8px", cursor: "pointer" };
