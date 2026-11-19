import { useEffect, useState } from "react";
import { apiRequest, getActiveLocationId } from "../../services/api";

const monthKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit",
  }).format(date).replace(/[^0-9]/g, "");
};

const fullName = (employee) =>
  [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ") ||
  employee.fullName || "Unnamed employee";

function RecentEmployees() {
  const [employees, setEmployees] = useState([]);
  const [locationId, setLocationId] = useState(() => getActiveLocationId());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onLocationChange = () => setLocationId(getActiveLocationId());
    window.addEventListener("chris:location-context-changed", onLocationChange);
    return () => window.removeEventListener("chris:location-context-changed", onLocationChange);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    apiRequest("/api/employees")
      .then((response) => {
        if (active) setEmployees(Array.isArray(response?.data) ? response.data : []);
      })
      .catch(() => {
        if (active) { setEmployees([]); setError(true); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locationId]);

  const currentMonth = monthKey(new Date());
  const recent = employees
    .filter((employee) => monthKey(employee.createdAt) === currentMonth)
    .filter((employee) => !locationId || String(employee.locationId) === String(locationId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const monthLabel = new Intl.DateTimeFormat("en-NG", {
    month: "long", year: "numeric", timeZone: "Africa/Lagos",
  }).format(new Date());

  return (
    <section style={cardStyle} aria-label="Recently added employees">
      <h3 style={titleStyle}>Recent Employees</h3>
      <p style={subTitleStyle}>Added in {monthLabel} · {loading ? "Loading…" : error ? "Unavailable" : recent.length + " employee(s)"}</p>
      {loading ? (
        <p style={bodyStyle}>Loading recently added employees…</p>
      ) : error ? (
        <p role="alert" style={bodyStyle}>Employee records could not be loaded. Refresh the page or check your access.</p>
      ) : recent.length === 0 ? (
        <p style={bodyStyle}>No employees were added in {monthLabel} for this branch selection.</p>
      ) : (
        <div style={{ maxHeight: "310px", overflowY: "auto", marginTop: "12px" }} role="region" aria-label="Current month employees">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", color: "inherit" }}>
            <thead>
              <tr>{["Employee", "Position / Department", "Branch", "Date added", "Status"].map((heading) =>
                <th key={heading} scope="col" style={headCellStyle}>{heading}</th>)}</tr>
            </thead>
            <tbody>
              {recent.map((employee) => (
                <tr key={employee.id || employee.employeeNumber}>
                  <td style={cellStyle}><strong>{fullName(employee)}</strong><div style={{ opacity: 0.75 }}>{employee.employeeNumber || "—"}</div></td>
                  <td style={cellStyle}>{employee.designation?.name || employee.designationName || "—"}<div style={{ opacity: 0.75 }}>{employee.department?.name || "—"}</div></td>
                  <td style={cellStyle}>{employee.location?.name || "—"}</td>
                  <td style={cellStyle}>{employee.createdAt ? new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date(employee.createdAt)) : "—"}</td>
                  <td style={cellStyle}>{employee.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const cardStyle = {
  background: "linear-gradient(145deg, #063722, #02170f)",
  border: "1px solid var(--tenant-border, rgba(212,175,55,.7))",
  borderRadius: "18px",
  padding: "24px",
  minHeight: "280px",
  color: "#F7FAF8",
  overflow: "hidden",
};
const titleStyle = { margin: 0, color: "#F7FAF8", fontSize: "17px", fontWeight: 900 };
const subTitleStyle = { margin: "8px 0 0", color: "#B4D6C4", fontSize: "12px" };
const bodyStyle = { margin: "12px 0 0", color: "#B4D6C4", fontSize: "13px" };
const headCellStyle = { padding: "9px 8px", textAlign: "left", borderBottom: "1px solid rgba(212,175,55,.4)", whiteSpace: "nowrap" };
const cellStyle = { padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.12)", verticalAlign: "top" };

export default RecentEmployees;
