import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api";
import { getEmployeeStatusMeta } from "../../utils/employeeStatus";
import KpiCard from "./KpiCard";

export default function WorkforceKpis() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    apiRequest("/api/analytics/workforce")
      .then((result) => {
        if (active) setData(result?.data || null);
      })
      .catch((error) => console.error("Dashboard workforce KPI error:", error));
    return () => { active = false; };
  }, []);

  const headcount = data?.headcount || {};
  const byStatus = Array.isArray(headcount.byStatus) ? headcount.byStatus : [];
  const status = Object.fromEntries(
    byStatus
      .filter((row) => row && row.key)
      .map((row) => [row.key, Number(row.count || 0)])
  );
  const value = (number) => data ? String(number ?? 0) : "...";

  return (
    <div
      aria-label="Workforce status KPIs"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "16px",
        marginTop: "24px",
      }}
    >
      <KpiCard title="Total Employees" value={value(headcount.historicalIdentities)} subtitle="Permanent employee identities" icon="👥" color="#D4AF37" />
      <KpiCard title="Active" value={value(status.ACTIVE)} subtitle="Current workforce" icon="●" color={getEmployeeStatusMeta("ACTIVE").color} />
      <KpiCard title="Probation" value={value(status.PROBATION)} subtitle="Current workforce" icon="●" color={getEmployeeStatusMeta("PROBATION").color} />
      <KpiCard title="On Leave" value={value(status.LEAVE)} subtitle="Current workforce" icon="●" color={getEmployeeStatusMeta("LEAVE").color} />
      <KpiCard title="Suspended" value={value(status.SUSPENDED)} subtitle="Current workforce" icon="●" color={getEmployeeStatusMeta("SUSPENDED").color} />
      <KpiCard title="Exited" value={value(headcount.exited)} subtitle="Current non-workforce status" icon="●" color={getEmployeeStatusMeta("TERMINATED").color} />
    </div>
  );
}
