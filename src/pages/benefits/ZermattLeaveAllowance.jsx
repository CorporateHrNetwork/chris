import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../services/api";

const money = (value, currency = "NGN") => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString()}`;
  }
};

const monthName = (monthKey) => {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return "—";
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
};

export default function ZermattLeaveAllowance() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/api/benefits/leave-allowance")
      .then((response) => {
        if (!active) return;
        setData(response?.data || null);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || "Unable to load Leave Allowance register.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => {
    const source = data?.rows || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((row) => [row.employeeNumber, row.employeeName, row.locationName, row.status, row.nextDueMonth]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle));
  }, [data, query]);

  const policy = data?.policy || {};
  const summary = data?.summary || {};

  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/benefits")}>← Benefits Dashboard</button>
      <div style={eyebrow}>ZERMATT BENEFITS</div>
      <h1 style={titleStyle}>Leave Allowance</h1>
      <p style={leadStyle}>
        Annual Zermatt Leave Allowance is paid through payroll in the employee&apos;s original entry month after the first completed year of service, then in that same month each year. The approved payroll payslip carries Leave Allowance as a distinct earning.
      </p>

      <div style={cards}>
        <Metric label="Formula" value="Basic × 12 × 10%" />
        <Metric label="Visible Employees" value={loading ? "—" : summary.visibleEmployees ?? rows.length} />
        <Metric label="Approved Payments" value={loading ? "—" : summary.visibleApprovedPayments ?? 0} />
        <Metric label="Approved Amount" value={loading ? "—" : money(summary.visibleApprovedAmount || 0)} />
      </div>

      <section style={panelStyle}>
        <h2 style={panelTitle}>Zermatt Leave Allowance Policy</h2>
        <div style={policyGrid}>
          <Policy label="Eligibility" value={policy.eligibility || "First payment after one completed year of service in the employee entry month; annual recurrence thereafter."} />
          <Policy label="Calculation" value={policy.formula || "Basic Monthly Salary × 12 × 10%"} />
          <Policy label="Payroll treatment" value={policy.payrollTreatment || "Paid with salary in the eligible payroll period and separately identified on the approved payslip."} />
          <Policy label="Control" value="An approved entitlement year cannot be paid twice. Reopened payroll is recalculated before replacement approval." />
        </div>
      </section>

      <section style={panelStyle}>
        <div style={toolbar}>
          <div>
            <h2 style={{ ...panelTitle, marginBottom: 4 }}>Employee Leave Allowance Register</h2>
            <div style={subtle}>Projected amount uses the current contractual monthly Basic from Zermatt&apos;s effective payroll salary structure. Actual approved payment history remains attached to the payroll period.</div>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search employee, branch, status or due month"
            style={searchInput}
          />
        </div>

        {error && <div style={errorStyle}>{error}</div>}
        {loading ? <div style={loadingStyle}>Loading Leave Allowance register…</div> : (
          <div style={tableWrap}>
            <table style={tableStyle}>
              <thead><tr>
                {['Employee','Branch','Hire Date','First Due','Next Due','Monthly Basic','Projected Allowance','Last Approved Payment','Status'].map((heading) => <th key={heading} style={thStyle}>{heading}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employeeId}>
                    <td style={tdStrong}>{row.employeeNumber} — {row.employeeName}</td>
                    <td style={tdStyle}>{row.locationName || "—"}</td>
                    <td style={tdStyle}>{row.hireDate || "—"}</td>
                    <td style={tdStyle}>{monthName(row.firstDueMonth)}</td>
                    <td style={tdStyle}>{monthName(row.nextDueMonth)}</td>
                    <td style={tdStyle}>{money(row.monthlyBasicSalary, row.currency)}</td>
                    <td style={tdStrong}>{money(row.projectedLeaveAllowance, row.currency)}</td>
                    <td style={tdStyle}>{row.lastPayment ? `${row.lastPayment.periodCode} · ${money(row.lastPayment.amount, row.currency)}` : "Not yet paid"}</td>
                    <td style={tdStyle}><span style={badge}>{String(row.status || "—").replaceAll("_", " ")}</span></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={9} style={emptyStyle}>No employees match the current filter.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }) {
  return <div style={metricCard}><div style={metricLabel}>{label}</div><strong style={metricValue}>{value}</strong></div>;
}
function Policy({ label, value }) {
  return <div style={policyCard}><div style={metricLabel}>{label}</div><div style={{ lineHeight: 1.6 }}>{value}</div></div>;
}

const pageStyle = { maxWidth: 1500, margin: "0 auto", color: "#F7FAF8" };
const backButton = { border: 0, background: "transparent", color: "#D4AF37", fontWeight: 900, cursor: "pointer", padding: "0 0 14px" };
const eyebrow = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle = { margin: "6px 0", fontSize: 32 };
const leadStyle = { color: "#C7D3CC", lineHeight: 1.65, maxWidth: 1100, marginBottom: 22 };
const cards = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 };
const metricCard = { padding: 16, borderRadius: 14, border: "1px solid rgba(212,175,55,.35)", background: "rgba(7,49,32,.75)" };
const metricLabel = { color: "#9FB7AA", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 };
const metricValue = { color: "#F7D66A", fontSize: 20 };
const panelStyle = { marginTop: 18, padding: 20, border: "1px solid rgba(212,175,55,.4)", borderRadius: 15, background: "linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96))" };
const panelTitle = { margin: "0 0 14px", fontSize: 18, color: "#D4AF37" };
const policyGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 };
const policyCard = { padding: 14, border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#C7D3CC", background: "rgba(255,255,255,.03)" };
const toolbar = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap", marginBottom: 14 };
const subtle = { color: "#9FB7AA", fontSize: 12, lineHeight: 1.5, maxWidth: 850 };
const searchInput = { minWidth: 300, padding: "10px 12px", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", background: "rgba(255,255,255,.06)", color: "#F7FAF8" };
const tableWrap = { width: "100%", overflowX: "auto" };
const tableStyle = { width: "100%", minWidth: 1200, borderCollapse: "collapse" };
const thStyle = { padding: 10, textAlign: "left", borderBottom: "1px solid rgba(212,175,55,.35)", color: "#D4AF37", fontSize: 11, whiteSpace: "nowrap" };
const tdStyle = { padding: 10, borderBottom: "1px solid rgba(255,255,255,.08)", color: "#C7D3CC", fontSize: 12, verticalAlign: "top" };
const tdStrong = { ...tdStyle, fontWeight: 900, color: "#F7FAF8" };
const badge = { display: "inline-block", padding: "4px 7px", borderRadius: 999, border: "1px solid rgba(212,175,55,.35)", color: "#F7D66A", fontSize: 10, fontWeight: 900 };
const emptyStyle = { ...tdStyle, textAlign: "center", padding: 24 };
const errorStyle = { padding: 12, borderRadius: 10, background: "rgba(127,29,29,.35)", border: "1px solid rgba(248,113,113,.45)", color: "#FCA5A5" };
const loadingStyle = { padding: 18, color: "#C7D3CC" };