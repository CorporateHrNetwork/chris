import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api";
import { getEmployeeStatusMeta } from "../../utils/employeeStatus";
import KpiCard from "./KpiCard";

export default function WorkforceKpis() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    apiRequest("/api/analytics/workforce")
      .then((result) => active && setData(result.data))
      .catch((error) => console.error("Dashboard workforce KPI error:", error));
    return () => { active = false; };
  }, []);
  const value = (number) => data ? String(number) : "...";
  const status = Object.fromEntries((data?.headcount.byStatus || []).map((row) => [row.key, row.count]));
  return <div aria-label="Workforce status KPIs" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginTop: "24px" }}>
    <KpiCard title="Total Employees" value={value(data?.headcount.historicalIdentities)} subtitle="Permanent employee identities" icon="👥" color="#D4AF37" />
    <KpiCard title="Active" value={value(status.ACTIVE || 0)} subtitle="Current workforce" icon="●" color={getEmployeeStatusMeta("ACTIVE").color} />
    <KpiCard title="Probation" value={value(status.PROBATION || 0)} subtitle="Current workforce" icon="●" color={getEmployeeStatusMeta("PROBATION").color} />
    <KpiCard title="On Leave" value={value(status.LEAVE || 0)} subtitle="Current workforce" icon="●" color={getEmployeeStatusMeta("LEAVE").color} />
    <KpiCard title="Suspended" value={value(status.SUSPENDED || 0)} subtitle="Current workforce" icon="●" color={getEmployeeStatusMeta("SUSPENDED").color} />
    <KpiCard title="Exited" value={value(data?.headcount.exited)} subtitle="Current non-workforce status" icon="●" color={getEmployeeStatusMeta("TERMINATED").color} />
  </div>;
}