import { useEffect, useMemo, useState } from "react";
import { apiRequest, getActiveLocationId, API_BASE_URL, getAuthToken } from "../../services/api";
import useAuthorization from "../../hooks/useAuthorization";

const money = (v) => v == null ? "—" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(v));
export default function YearEndBonus() {
  const { hasPermission } = useAuthorization();
  const [year, setYear] = useState(new Date().getFullYear());
  const [locationId, setLocationId] = useState(() => getActiveLocationId());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const update = () => setLocationId(getActiveLocationId());
    window.addEventListener("chris:location-context-changed", update);
    return () => window.removeEventListener("chris:location-context-changed", update);
  }, []);
  useEffect(() => {
    let alive = true;
    setData(null); setError(""); setLoading(true);
    apiRequest(`/api/benefits/year-end-bonus?year=${year}`)
      .then(result => { if (alive) setData(result.data); })
      .catch(err => { if (alive) setError(err.message || "Unable to load bonus register."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [year, locationId]);
  const rows = useMemo(() => (data?.rows || []).filter(row => [
    row.employeeName, row.employeeNumber, row.location, row.designation, row.department,
  ].some(value => String(value || "").toLowerCase().includes(search.toLowerCase()))), [data, search]);
  async function exportCsv() {
    try {
      setExporting(true); setError("");
      const headers = { Authorization: `Bearer ${getAuthToken()}` };
      if (locationId) headers["x-chris-location-id"] = locationId;
      const response = await fetch(`${API_BASE_URL}/api/benefits/year-end-bonus/export.csv?year=${year}`, { headers });
      if (!response.ok) throw new Error("Year-End Bonus export was denied or unavailable.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `Zermatt-Year-End-Bonus-${year}.csv`; link.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); } finally { setExporting(false); }
  }
  if (!hasPermission("benefits.year_end_bonus.view") && !hasPermission("payroll.manage")) {
    return <section role="alert" style={{ padding: 24 }}>Year-End Bonus access has not been granted to your account.</section>;
  }
  return <section style={{ padding: 24, color: "var(--chris-text-main, inherit)" }}>
    <h1>Year-End Bonus</h1>
    <p>Basic Salary + 50% of End-of-Month Gross; January–December service prorated by engaged months ÷ 12. Expatriates are excluded. This register is a projection only, not a payment authorization.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 18 }}>
      <label htmlFor="year-end-bonus-year">Bonus year</label>
      <input id="year-end-bonus-year" type="number" min="2020" max="2100" value={year} onChange={e => { const n = Number(e.target.value); if (n >= 2020 && n <= 2100) setYear(n); }} />
      <input aria-label="Find employee" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee, branch or designation" />
      <button type="button" onClick={exportCsv} disabled={loading || exporting || !data}>{exporting ? "Preparing..." : "Export CSV"}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Loading bonus register…</p> : data && <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 20 }}>
        <strong>Employees: {data.summary.employees}</strong>
        <strong>Eligible: {data.summary.eligible}</strong>
        <strong>Expatriates excluded: {data.summary.expatriatesExcluded}</strong>
        <strong>Missing salary or service data: {data.summary.incomplete}</strong>
        <strong>Projected total: {money(data.summary.projectedTotal)}</strong>
      </div>
      <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", minWidth: 960 }}>
        <thead><tr>{["Employee No", "Name", "Branch", "Designation", "Employment Type", "Basic", "End-Month Gross", "Months Worked", "Full Bonus", "Prorated Bonus", "Status"].map(x => <th key={x} scope="col" style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #aaa" }}>{x}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.employeeNumber}>
          <td>{row.employeeNumber}</td><td>{row.employeeName}</td><td>{row.location}</td><td>{row.designation}</td>
          <td>{row.employmentType}</td><td>{money(row.basicSalary)}</td><td>{money(row.endMonthGross)}</td>
          <td>{row.months}</td><td>{money(row.fullBonus)}</td><td>{money(row.bonus)}</td><td>{row.status}</td>
        </tr>)}</tbody>
      </table></div>
      {!rows.length && <p>No employee records match the selected branch and search.</p>}
    </>}
  </section>;
}
