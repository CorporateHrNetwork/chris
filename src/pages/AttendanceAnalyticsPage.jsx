import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

const MODE_CONFIG = {
  "worked-hours": {
    title: "Worked Hours",
    description: "Analyse recorded employee working hours from clock-in and clock-out activity.",
  },
  "worked-days": {
    title: "Worked Days",
    description: "Review attendance days and employee presence across the selected reporting period.",
  },
  "off-days": {
    title: "Off Days",
    description: "Review records explicitly captured as off days or non-working days.",
  },
  overtime: {
    title: "Overtime",
    description: "Review overtime minutes calculated against assigned shift end times.",
  },
  "lateness-absence": {
    title: "Lateness & Absence",
    description: "Review lateness, absence and attendance exceptions across the workforce.",
  },
};

function AttendanceAnalyticsPage({ mode }) {
  const navigate = useNavigate();
  const config = MODE_CONFIG[mode] || MODE_CONFIG["worked-hours"];
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    employeeNumber: "",
  });
  const [report, setReport] = useState({ totals: {}, records: [] });
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.employeeNumber.trim()) {
        params.set("employeeNumber", filters.employeeNumber.trim());
      }

      const suffix = params.toString() ? `?${params.toString()}` : "";
      const result = await apiRequest(`/api/attendance/report${suffix}`);
      setReport(result.data || { totals: {}, records: [] });
    } catch (err) {
      setError(err.message || "Unable to load attendance analytics.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const records = report.records || [];
    if (mode === "overtime") {
      return records.filter((item) => Number(item.overtimeMinutes || 0) > 0);
    }
    if (mode === "lateness-absence") {
      return records.filter(
        (item) =>
          Number(item.lateMinutes || 0) > 0 ||
          ["ABSENT", "LATE"].includes(String(item.status || "").toUpperCase())
      );
    }
    if (mode === "off-days") {
      return records.filter((item) =>
        ["OFF_DAY", "OFF", "REST_DAY"].includes(
          String(item.status || "").toUpperCase()
        )
      );
    }
    return records;
  }, [report, mode]);

  const summary = useMemo(() => {
    let workedMinutes = 0;
    let presentDays = 0;
    let lateMinutes = 0;
    let overtimeMinutes = 0;
    let absences = 0;

    for (const item of report.records || []) {
      const clockIn = item.clockIn ? new Date(item.clockIn) : null;
      const clockOut = item.clockOut ? new Date(item.clockOut) : null;

      if (
        clockIn &&
        clockOut &&
        !Number.isNaN(clockIn.getTime()) &&
        !Number.isNaN(clockOut.getTime()) &&
        clockOut > clockIn
      ) {
        workedMinutes += Math.floor((clockOut - clockIn) / 60000);
      }

      const status = String(item.status || "").toUpperCase();
      if (["PRESENT", "LATE"].includes(status)) presentDays += 1;
      if (status === "ABSENT") absences += 1;
      lateMinutes += Number(item.lateMinutes || 0);
      overtimeMinutes += Number(item.overtimeMinutes || 0);
    }

    return {
      workedHours: (workedMinutes / 60).toFixed(1),
      presentDays,
      lateMinutes,
      overtimeMinutes,
      absences,
    };
  }, [report]);

  return (
    <div style={{ color: "var(--chris-text-main)" }}>
      <button type="button" onClick={() => navigate("/attendance")} style={backStyle}>
        {"\u2190"} Back to Time & Attendance Dashboard
      </button>

      <div style={{ marginBottom: 22 }}>
        <div style={eyebrowStyle}>TIME & ATTENDANCE</div>
        <h1 style={titleStyle}>{config.title}</h1>
        <p style={descriptionStyle}>{config.description}</p>
      </div>

      {error && <div style={{ ...panelStyle, marginBottom: 18, color: "var(--chris-warning)" }}>{error}</div>}

      <div style={metricGridStyle}>
        <Metric label="Records" value={(report.records || []).length} />
        <Metric label="Worked Hours" value={summary.workedHours} />
        <Metric label="Late Minutes" value={summary.lateMinutes} />
        <Metric label="Overtime Minutes" value={summary.overtimeMinutes} />
      </div>

      <section style={panelStyle}>
        <h2 style={{ margin: 0 }}>Report Filters</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            load();
          }}
          style={filterGridStyle}
        >
          <Field label="From">
            <input type="date" style={inputStyle} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          </Field>
          <Field label="To">
            <input type="date" style={inputStyle} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          </Field>
          <Field label="Employee Number">
            <input style={inputStyle} value={filters.employeeNumber} onChange={(event) => setFilters({ ...filters, employeeNumber: event.target.value })} placeholder="Optional" />
          </Field>
          <button type="submit" style={primaryButtonStyle}>Apply Filters</button>
        </form>
      </section>

      <section style={{ ...panelStyle, marginTop: 18 }}>
        <h2 style={{ margin: 0 }}>{config.title} Records</h2>
        <p style={sectionSubStyle}>
          {mode === "off-days" && rows.length === 0
            ? "No explicit off-day attendance records are currently available."
            : `${rows.length} matching records`}
        </p>

        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Status</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Worked</th>
                <th>Late</th>
                <th>Overtime</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.attendanceDate)}</td>
                  <td>
                    <strong>{item.employee?.employeeNumber || "—"}</strong>
                    <div style={mutedStyle}>
                      {[item.employee?.firstName,item.employee?.middleName,item.employee?.lastName].filter(Boolean).join(" ")}
                    </div>
                  </td>
                  <td>{item.status || "—"}</td>
                  <td>{formatTime(item.clockIn)}</td>
                  <td>{formatTime(item.clockOut)}</td>
                  <td>{workedHours(item.clockIn, item.clockOut)}</td>
                  <td>{Number(item.lateMinutes || 0)} min</td>
                  <td>{Number(item.overtimeMinutes || 0)} min</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" style={emptyCellStyle}>No matching records.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function workedHours(clockIn, clockOut) {
  if (!clockIn || !clockOut) return "—";
  const start = new Date(clockIn);
  const end = new Date(clockOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return "—";
  return `${((end - start) / 3600000).toFixed(2)} h`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Metric({ label, value }) {
  return (
    <div style={panelStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
      <div style={mutedStyle}>Live attendance data</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label>
      <div style={fieldLabelStyle}>{label}</div>
      {children}
    </label>
  );
}

const panelStyle={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)"};
const metricGridStyle={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:16,marginBottom:18};
const metricLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700};
const metricValueStyle={fontSize:28,fontWeight:800,marginTop:10};
const filterGridStyle={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,alignItems:"end",marginTop:16};
const inputStyle={width:"100%",boxSizing:"border-box",padding:"11px 12px",borderRadius:"var(--chris-radius-md)",border:"1px solid var(--chris-border-soft)",background:"var(--chris-input-bg)",color:"var(--chris-text-main)",fontFamily:"var(--chris-font-family)"};
const primaryButtonStyle={border:0,borderRadius:"var(--chris-radius-md)",padding:"12px 16px",background:"linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep))",color:"#07110C",fontWeight:800};
const backStyle={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,cursor:"pointer"};
const eyebrowStyle={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const descriptionStyle={margin:0,maxWidth:900,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.55};
const sectionSubStyle={margin:"6px 0 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
const fieldLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700,marginBottom:7};
const mutedStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-xs)",marginTop:4};
const emptyCellStyle={padding:"24px 12px",color:"var(--chris-text-secondary)",textAlign:"center"};

export default AttendanceAnalyticsPage;
