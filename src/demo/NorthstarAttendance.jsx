import { useEffect, useState } from "react";
import { apiRequest } from "../services/api";
import "./NorthstarAttendance.css";

const storageKey = "northstar-attendance-exercise-v1";
const shiftStart = 9 * 60;
const shiftLength = 8 * 60;
const duration = (minutes) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

function readExercise() {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

function statusFor(punch) {
  if (!punch) return "Awaiting clock-in";
  return punch.out == null ? "On shift" : "Clocked out";
}

export default function NorthstarAttendance() {
  const [employees, setEmployees] = useState([]);
  const [punches, setPunches] = useState(readExercise);
  const [employeeId, setEmployeeId] = useState("");
  const [clock, setClock] = useState("09:05");
  const [filter, setFilter] = useState("All");
  const [feedback, setFeedback] = useState("");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest("/api/employees").then(({ data }) => {
      if (active) setEmployees((data || []).filter((employee) => ["ACTIVE", "PROBATION"].includes(employee.status)));
    }).catch(() => {
      if (active) setLoadError("Could not load the fictional employee roster.");
    });
    return () => { active = false; };
  }, [attempt]);

  const roster = employees.map((employee) => ({
    ...employee,
    punch: punches[employee.id],
    name: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
  }));
  const selected = roster.find((employee) => employee.id === employeeId);
  const attended = roster.filter(({ punch }) => punch);
  const counts = {
    "Awaiting clock-in": roster.length - attended.length,
    "On shift": attended.filter(({ punch }) => punch.out == null).length,
    "Clocked out": attended.filter(({ punch }) => punch.out != null).length,
  };
  const late = attended.reduce((total, { punch }) => total + Math.max(0, punch.in - shiftStart), 0);
  const worked = attended.reduce((total, { punch }) => total + (punch.out == null ? 0 : punch.out - punch.in), 0);
  const overtime = attended.reduce((total, { punch }) => total + (punch.out == null ? 0 : Math.max(0, punch.out - punch.in - shiftLength)), 0);
  const rate = roster.length ? Math.round(attended.length / roster.length * 100) : 0;

  function save(next) {
    setPunches(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* The exercise remains usable in memory. */ }
  }

  function recordPunch(event) {
    event.preventDefault();
    if (!selected || !clock || selected.punch?.out != null) return;
    const [hours, minutes] = clock.split(":").map(Number);
    const time = hours * 60 + minutes;
    if (selected.punch && time <= selected.punch.in) {
      setFeedback("Choose a clock-out time later than clock-in.");
      return;
    }
    const punch = selected.punch ? { ...selected.punch, out: time, outLabel: clock } : { in: time, inLabel: clock };
    save({ ...punches, [selected.id]: punch });
    setFeedback(`${selected.name} clocked ${selected.punch ? "out" : "in"} at ${clock}.`);
  }

  return (
    <main className="northstar-attendance">
      <header>
        <h1>Time &amp; Attendance Dashboard</h1>
        <p>Northstar fictional clock exercise · 09:00–17:00 shift · Lagos time</p>
      </header>

      <div className="northstar-attendance__metrics" aria-label="Attendance summary">
        {[
          ["Roster", roster.length, "All"],
          ["Present", `${attended.length} · ${rate}%`, "Present"],
          ["On shift", counts["On shift"], "On shift"],
          ["Clocked out", counts["Clocked out"], "Clocked out"],
        ].map(([label, value, key]) => (
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}<strong>{value}</strong>
          </button>
        ))}
      </div>

      <div className="northstar-attendance__workbench">
        <section className="northstar-attendance__terminal" aria-labelledby="northstar-clock-title">
          <h2 id="northstar-clock-title">Clock terminal</h2>
          <div className="northstar-attendance__display" aria-hidden="true">{clock || "––:––"}</div>
          <form onSubmit={recordPunch}>
            <label>Employee
              <select required value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setFeedback(""); }}>
                <option value="">Select a fictional employee</option>
                {roster.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNumber} · {employee.name}</option>)}
              </select>
            </label>
            <label>Simulated time<input required type="time" value={clock} onChange={(event) => setClock(event.target.value)} /></label>
            <button className="northstar-attendance__primary" disabled={!selected || selected.punch?.out != null}>
              {selected?.punch?.out != null ? "Shift complete" : selected?.punch ? "Clock out" : "Clock in"}
            </button>
          </form>
          {loadError && <p role="alert">{loadError} <button type="button" onClick={() => { setLoadError(""); setAttempt(attempt + 1); }}>Retry</button></p>}
          <p role="status">{feedback}</p>
          {confirmReset ? (
            <div className="northstar-attendance__reset">
              <button type="button" onClick={() => { save({}); setFeedback("Exercise reset."); setFilter("All"); setConfirmReset(false); }}>Clear exercise punches</button>
              <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          ) : <button type="button" disabled={!attended.length} onClick={() => setConfirmReset(true)}>Reset exercise</button>}
        </section>

        <section className="northstar-attendance__analytics" aria-labelledby="northstar-distribution">
          <h2 id="northstar-distribution">Attendance distribution</h2>
          {Object.entries(counts).map(([label, count]) => (
            <button type="button" className="northstar-attendance__bar" key={label} onClick={() => setFilter(label)} aria-pressed={filter === label}>
              <span>{label}</span><strong>{count}</strong>
              <span className="northstar-attendance__track" aria-hidden="true"><span style={{ width: `${roster.length ? count / roster.length * 100 : 0}%` }} /></span>
            </button>
          ))}
          <dl className="northstar-attendance__times">
            <div><dt>Late minutes</dt><dd>{late}</dd></div>
            <div><dt>Completed work</dt><dd>{duration(worked)}</dd></div>
            <div><dt>Overtime beyond 8h</dt><dd>{duration(overtime)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="northstar-attendance__analytics">
        <h2>Exercise register · {filter}</h2>
        <div className="northstar-attendance__table">
          <table>
            <thead><tr>{["Employee", "Branch", "Status", "Clock in", "Clock out", "Worked"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>
              {roster.filter(({ punch }) => filter === "All" || (filter === "Present" ? Boolean(punch) : statusFor(punch) === filter)).map(({ id, name, employeeNumber, location, punch }) => (
                <tr key={id}><td>{name} · {employeeNumber}</td><td>{location?.name || "—"}</td><td>{statusFor(punch)}</td><td>{punch?.inLabel || "—"}</td><td>{punch?.outLabel || "—"}</td><td>{punch?.out == null ? "—" : duration(punch.out - punch.in)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
