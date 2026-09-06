import { useMemo, useState } from "react";
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

  const selectedPeriod = useMemo(
    () => (periods || []).find((period) => period.id === periodId) || null,
    [periods, periodId]
  );

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
      const result = await apiRequest("/api/zermatt/attendance/worked-days", {
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
      setMessage(result?.message || "Worked days saved. Recalculate payroll before submission.");
      setWorkedDays("");
      setWorkedHours("");
      setNotes("");
      if (onSaved) await onSaved(result?.data || null);
    } catch (requestError) {
      setError(requestError?.message || "Unable to save manual worked days.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={panelStyle}>
      <div style={headingStyle}>SUPER USER · MANUAL WORKED DAYS</div>
      <p style={helpStyle}>
        Use this only where attendance clocking is not configured or an approved attendance exception must be reflected in payroll. The entry becomes the exact-period attendance basis for the selected employee; CHRiS marks existing draft payroll for recalculation.
      </p>
      {error && <div role="alert" style={errorStyle}>{error}</div>}
      {message && <div style={messageStyle}>{message}</div>}
      <form onSubmit={save} style={gridStyle}>
        <EmployeeSearchSelect
          label="Employee"
          value={employeeNumber}
          onChange={(value) => { setEmployeeNumber(value); setError(""); setMessage(""); }}
          required
          placeholder="Search employee number or name"
        />
        <label style={fieldStyle}>
          <span>Payroll Period</span>
          <select style={inputStyle} value={periodId} onChange={(event) => setPeriodId(event.target.value)} required>
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
      {selectedPeriod && <div style={periodStyle}>Attendance period: {selectedPeriod.periodStart} → {selectedPeriod.periodEnd}</div>}
    </section>
  );
}

const panelStyle = { marginTop: 16, padding: 16, border: "1px solid rgba(212,175,55,.35)", borderRadius: 12, background: "rgba(3,28,18,.62)" };
const headingStyle = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".1em" };
const helpStyle = { margin: "7px 0 13px", color: "#A9BDB2", fontSize: 12, lineHeight: 1.55 };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, alignItems: "end" };
const fieldStyle = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8" };
const buttonStyle = { width: "100%", border: 0, borderRadius: 9, padding: "11px 14px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const periodStyle = { marginTop: 10, color: "#9FB7AA", fontSize: 11 };
const errorStyle = { marginBottom: 10, padding: 9, borderRadius: 8, border: "1px solid rgba(248,113,113,.45)", color: "#FCA5A5" };
const messageStyle = { marginBottom: 10, padding: 9, borderRadius: 8, border: "1px solid rgba(212,175,55,.4)", color: "#F7FAF8" };
