import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";
import { getEmployeeStatusMeta } from "../utils/employeeStatus";
import "./EmployeeAnalytics.css";

const title = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const isoDate = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
function presetRange(preset) {
  const today = new Date(); const year = today.getFullYear(); const month = today.getMonth();
  if (preset === "PREVIOUS_MONTH") return { from: isoDate(new Date(year, month - 1, 1)), to: isoDate(new Date(year, month, 0)) };
  if (preset === "CURRENT_QUARTER") return { from: isoDate(new Date(year, Math.floor(month / 3) * 3, 1)), to: isoDate(today) };
  if (preset === "CURRENT_YEAR") return { from: year + "-01-01", to: isoDate(today) };
  return { from: isoDate(new Date(year, month, 1)), to: isoDate(today) };
}
const metricReasons = {
  INSUFFICIENT_OPENING_SNAPSHOT: "Requires a workforce snapshot before the selected period.",
  INSUFFICIENT_CLOSING_SNAPSHOT: "No snapshot exists within the selected period.",
  ZERO_OPENING_HEADCOUNT: "Growth cannot be calculated from zero opening headcount.",
  INSUFFICIENT_AVERAGE_HEADCOUNT: "Average headcount is unavailable or zero.",
};
const closingWorkforceFields = Object.freeze([
  { status: "ACTIVE", field: "active" },
  { status: "PROBATION", field: "probation" },
  { status: "LEAVE", field: "leave" },
  { status: "SUSPENDED", field: "suspended" },
  { status: "TERMINATED", field: "exited", label: "Exited" },
]);
function MetricCard({ label, value, availability, format = "number", note }) {
  const available = availability?.available !== false && value !== null && value !== undefined;
  const shown = format === "percent" && available ? value + "%" : value;
  return <article className={"wa-kpi wa-metric " + (available ? "" : "wa-metric-unavailable")}><span>{label}</span><strong>{available ? shown : "Not yet available"}</strong><small>{available ? note : metricReasons[availability?.reason] || "More workforce history is required."}</small></article>;
}

function ClosingWorkforce({ workforce, snapshotDate }) {
  return <div className="wa-closing-workforce">
    <div className="wa-composition-heading"><h3>Workforce Status at Period Close</h3><p>{snapshotDate ? "Closing snapshot: " + snapshotDate : "No closing snapshot exists in this period."}</p></div>
    <div className="wa-status-grid">{closingWorkforceFields.map((row) => {
      const meta = getEmployeeStatusMeta(row.status);
      const value = workforce?.[row.field];
      const available = typeof value === "number" && Number.isFinite(value);
      return <article className={"wa-status-card " + (available ? "" : "wa-status-unavailable")} key={row.field} style={{ borderColor: meta.border, background: meta.background }}><span style={{ color: meta.color }}>{row.label || meta.label}</span><strong style={{ color: meta.color }}>{available ? value : "Not available"}</strong></article>;
    })}</div>
  </div>;
}

function Kpi({ label, value, note }) {
  return <article className="wa-kpi"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function Bars({ rows, empty = "No data available" }) {
  const visible = rows || [];
  if (!visible.length) return <div className="wa-empty">{empty}</div>;
  return <div className="wa-bars">{visible.map((row) => <div className="wa-bar" key={row.key || row.label || row.month} title={`${row.count} (${row.percentage ?? 0}%)`}><div><span>{row.label || title(row.key) || row.month}</span><b>{row.count}</b></div><i><em style={{ width: `${Math.max(row.percentage ?? 0, row.count ? 3 : 0)}%`, background: row.color }} /></i><small>{row.percentage !== undefined ? `${row.percentage}%` : ""}</small></div>)}</div>;
}

function Trend({ hires, exits }) {
  const max = Math.max(1, ...hires.map((row) => row.count), ...exits.map((row) => row.count));
  return <div className="wa-trend" aria-label="Monthly hires and completed exits"><div className="wa-legend"><span>● Hires</span><span>● Completed exits</span></div><div className="wa-trend-grid">{hires.map((row, index) => <div key={row.month}><div className="wa-columns"><i style={{ height: `${hires[index].count / max * 100}%` }} title={`${hires[index].count} hires`} /><em style={{ height: `${exits[index].count / max * 100}%` }} title={`${exits[index].count} exits`} /></div><small>{row.month}</small></div>)}</div></div>;
}

function SnapshotTrend({ snapshots }) {
  if (snapshots.length < 2) {
    return <div className="wa-empty">Historical workforce trend will appear as daily snapshots accumulate.</div>;
  }
  const values = snapshots.map((row) => row.totalCurrent);
  const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(1, max - min);
  const points = snapshots.map((row, index) => {
    const x = snapshots.length === 1 ? 50 : index / (snapshots.length - 1) * 96 + 2;
    const y = 32 - ((row.totalCurrent - min) / range * 26);
    return `${x},${y}`;
  }).join(" ");
  return <div className="wa-snapshot-trend" role="img" aria-label={`Current workforce trend from ${snapshots[0].snapshotDate} to ${snapshots.at(-1).snapshotDate}`}>
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg>
    <div>{snapshots.map((row) => <span key={row.snapshotDate}><small>{row.snapshotDate}</small><strong>{row.totalCurrent}</strong></span>)}</div>
  </div>;
}
export default function EmployeeAnalytics() {
  const [data, setData] = useState(null); const [history, setHistory] = useState([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null); const [metricsError, setMetricsError] = useState("");
  const [period, setPeriod] = useState(() => ({ preset: "CURRENT_MONTH", ...presetRange("CURRENT_MONTH") }));
  const [filters, setFilters] = useState({ departmentId: "", locationId: "", status: "", gender: "", year: String(new Date().getFullYear()) });
  const query = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString(), [filters]);
  useEffect(() => { let active = true; Promise.all([apiRequest(`/api/analytics/workforce?${query}`), apiRequest(`/api/analytics/workforce/history?from=${filters.year}-01-01&to=${filters.year}-12-31`)]).then(([result, historyResult]) => { if (active) { setError(""); setData(result.data); setHistory(historyResult.data?.snapshots || []); } }).catch((err) => active && setError(err.message)).finally(() => active && setLoading(false)); return () => { active = false; }; }, [query, filters.year]);
  useEffect(() => { let active = true; apiRequest("/api/analytics/workforce/metrics?from=" + period.from + "&to=" + period.to).then((result) => { if (active) { setMetricsError(""); setMetrics(result.data); } }).catch((err) => active && setMetricsError(err.message)); return () => { active = false; }; }, [period.from, period.to]);
  const choosePeriod = (event) => { const preset = event.target.value; setPeriod((current) => preset === "CUSTOM" ? { ...current, preset } : { preset, ...presetRange(preset) }); };
  const set = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  if (loading && !data) return <div className="wa-state">Loading workforce analytics…</div>;
  if (error && !data) return <div className="wa-state wa-error">{error}</div>;
  const h = data.headcount; const moves = data.movements;
  return <main className="wa-page">
    <header className="wa-header"><div><span>PEOPLE INTELLIGENCE</span><h1>Employee Analytics</h1><p>Current workforce, movements and operational people signals from CHRIS source records.</p></div><div className="wa-fresh">As at {new Date(data.meta.generatedAt).toLocaleString()}</div></header>
    <section className="wa-filters" aria-label="Analytics filters">
      <label>Department<select value={filters.departmentId} onChange={set("departmentId")}><option value="">All departments</option>{data.organization.departments.filter((row) => row.key !== "UNASSIGNED").map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
      <label>Location<select value={filters.locationId} onChange={set("locationId")}><option value="">All locations</option>{data.organization.locations.filter((row) => row.key !== "UNASSIGNED").map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
      <label>Status<select value={filters.status} onChange={set("status")}><option value="">All current statuses</option>{data.meta.currentStatuses.map((row) => <option key={row}>{title(row)}</option>)}</select></label>
      <label>Gender<select value={filters.gender} onChange={set("gender")}><option value="">All genders</option>{["MALE", "FEMALE", "OTHER", "UNSPECIFIED"].map((row) => <option key={row}>{title(row)}</option>)}</select></label>
      <label>Movement year<input type="number" min="2000" max="2100" value={filters.year} onChange={set("year")} /></label>
    </section>
    {error && <div className="wa-inline-error">Showing the last result. Refresh failed: {error}</div>}
    <section className="wa-kpis"><Kpi label="Current headcount" value={h.current} note="Active employment statuses only" /><Kpi label="Historical identities" value={h.historicalIdentities} note="Unique permanent employee records" /><Kpi label="New hires this month" value={moves.hiringActivity.thisMonth} note={`${moves.hiringActivity.rehiresThisYear} rehire episodes this year`} /><Kpi label="Completed exits this month" value={moves.exits.thisMonth} note="Cancelled or incomplete exits excluded" /><Kpi label="Manager coverage" value={`${h.current ? Math.round(data.managers.assigned / h.current * 100) : 0}%`} note={`${data.managers.unassigned} without line manager`} /><Kpi label="On leave today" value={data.leave.employeesOnLeaveToday} note={`${data.leave.pendingRequests} pending requests`} /></section>
    <section className="wa-grid"><article className="wa-card"><h2>Employment status</h2><p>Historical identity distribution; current headcount is shown separately.</p><Bars rows={h.byStatus.map((row) => ({ ...row, label: getEmployeeStatusMeta(row.key).label, color: getEmployeeStatusMeta(row.key).color }))} /></article><article className="wa-card"><h2>Gender</h2><p>Current workforce denominator: {data.demographics.denominator}</p><Bars rows={data.demographics.gender} /></article><article className="wa-card"><h2>Department</h2><p>Includes active departments with zero employees.</p><Bars rows={data.organization.departments} /></article><article className="wa-card"><h2>Work location</h2><p>Current employees only.</p><Bars rows={data.organization.locations} /></article><article className="wa-card"><h2>Designation</h2><p>Highest populated roles and unassigned records.</p><Bars rows={data.organization.designations.slice(0, 10)} /></article><article className="wa-card"><h2>Line managers</h2><p>{data.managers.managersWithReports} active managers · {data.managers.averageDirectReports} average reports</p><Bars rows={data.managers.largestTeams.map((row) => ({ ...row, key: row.managerEmployeeId, label: row.managerName, percentage: h.current ? Math.round(row.count / h.current * 1000) / 10 : 0 }))} empty="No current reporting assignments" /></article></section>
    <section className="wa-card wa-advanced"><div className="wa-section-heading"><div><h2>Advanced Workforce Metrics</h2><p>Snapshot-boundary measures and source-record movements for the selected period.</p></div><div className="wa-period"><label>Period<select value={period.preset} onChange={choosePeriod}><option value="CURRENT_MONTH">Current month</option><option value="PREVIOUS_MONTH">Previous month</option><option value="CURRENT_QUARTER">Current quarter</option><option value="CURRENT_YEAR">Current year</option><option value="CUSTOM">Custom</option></select></label>{period.preset === "CUSTOM" && <><label>From<input type="date" value={period.from} max={period.to} onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value }))} /></label><label>To<input type="date" value={period.to} min={period.from} onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))} /></label></>}</div></div>
      {metricsError ? <div className="wa-inline-error">Unable to load advanced metrics: {metricsError}</div> : metrics ? <><div className="wa-metric-range">{metrics.period.from} to {metrics.period.to}</div><div className="wa-advanced-grid"><MetricCard label="Opening headcount" value={metrics.metrics.openingHeadcount} availability={metrics.availability.openingHeadcount} note={metrics.sources.openingSnapshotDate ? "Snapshot: " + metrics.sources.openingSnapshotDate : ""} /><MetricCard label="Closing headcount" value={metrics.metrics.closingHeadcount} availability={metrics.availability.closingHeadcount} note={metrics.sources.closingSnapshotDate ? "Snapshot: " + metrics.sources.closingSnapshotDate : ""} /><MetricCard label="Headcount change" value={metrics.metrics.headcountChange} availability={metrics.availability.headcountChange} note="Closing minus opening headcount" /><MetricCard label="Growth rate" value={metrics.metrics.headcountGrowthRate} availability={metrics.availability.growth} format="percent" note="Headcount change divided by opening headcount" /><MetricCard label="Hires" value={metrics.metrics.hires} availability={{ available: true }} note="Employment episodes started" /><MetricCard label="Completed exits" value={metrics.metrics.completedExits} availability={{ available: true }} note="Completed, non-cancelled exits" /><MetricCard label="Net movement" value={metrics.metrics.netMovement} availability={{ available: true }} note="Hires minus completed exits" /><MetricCard label="Average headcount" value={metrics.metrics.averageHeadcount} availability={metrics.availability.averageHeadcount} note="Mean of opening and closing" /><MetricCard label="Turnover rate" value={metrics.metrics.turnoverRate} availability={metrics.availability.turnover} format="percent" note="Completed exits divided by average headcount" /></div><ClosingWorkforce workforce={metrics.closingWorkforce} snapshotDate={metrics.sources.closingSnapshotDate} /><p className="wa-retention-note">Retention analytics will be added once a stable cohort definition is adopted.</p></> : <div className="wa-empty">Loading advanced workforce metrics…</div>}
    </section>
    <section className="wa-card wa-movements"><h2>Hiring activity and completed exits · {data.meta.year}</h2><p>Hiring counts employment-episode starts, so rehiring is activity without creating another permanent identity.</p><Trend hires={moves.hiringActivity.trend} exits={moves.exits.trend} /></section>
    <section className="wa-card wa-movements"><h2>Workforce Headcount Trend</h2><p>Daily point-in-time current workforce snapshots. No historical values are inferred.</p><SnapshotTrend snapshots={history} /></section>
    <section className="wa-snapshots"><article><h3>Onboarding</h3><strong>{data.onboarding.averageCompletion}%</strong><span>average completion · {data.onboarding.total} workflows</span></article><article><h3>Approved Leave Requests</h3><strong>{data.leave.approvedCurrentOrUpcoming}</strong><span>Current or upcoming approved requests</span></article><article><h3>Attendance today</h3><strong>{data.attendance.recordsToday}</strong><span>{data.attendance.presentToday} present · {data.attendance.lateToday} late · {data.attendance.absentToday} absent</span></article></section>
  </main>;
}
