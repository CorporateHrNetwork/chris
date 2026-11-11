import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest, getStoredOrganization, IS_SALES_DEMO_HOST } from "../services/api";
import { LeavePage, Panel, Notice, styles } from "../components/leave/LeaveUi";
import EmployeeLeaveProfileSelector from "../components/leave/EmployeeLeaveProfileSelector";
import ZermattAnnualCarryoverPanel from "../components/leave/ZermattAnnualCarryoverPanel";

const metrics = [
  ["pendingRequests", "Pending Requests", "/leave/requests?status=PENDING"],
  ["approvedRequests", "Approved Leave", "/leave/requests?status=APPROVED"],
  ["employeesOnLeave", "Employees Marked On Leave", "/leave/exceptions"],
  ["activeLeaveRequests", "Active Leave Requests", "/leave/active"],
  ["returnsDue", "Returns Due", "/leave/returns"],
  ["completedReturns", "Confirmed Returns", "/leave/returns#return-history"],
  ["leaveExceptions", "Leave Exceptions", "/leave/exceptions"],
];
const links = [
  ["requests", "Leave Requests"], ["active", "Active Leave"], ["returns", "Return to Work"],
  ["calendar", "Leave Calendar"], ["balances", "Leave Balances"], ["entitlements", "Leave Entitlements"],
  ["policies", "Leave Policies"], ["exceptions", "Leave Exceptions"],
];

export default function LeaveDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const isZermatt = getStoredOrganization()?.slug === "zermatt-liquor-limited";

  useEffect(() => {
    let active = true;
    apiRequest("/api/leave/overview").then((response) => {
      if (active) setData(response.data);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    });
    return () => { active = false; };
  }, []);

  return <LeavePage title="Leave Overview" description="Review approved requests, confirmed active leave, returns and status exceptions.">
    {error && <Notice error>{error}</Notice>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 18 }}>
      {metrics.map(([key, label, path]) => <Panel key={key} style={{ margin: 0 }}>
        <Link to={path} style={{ color: "inherit", display: "block", textDecoration: "none" }}>
          <div style={styles.muted}>{label}</div>
          <strong style={{ fontSize: 30, color: "var(--chris-gold)" }}>{data?.[key] ?? "—"}</strong>
        </Link>
      </Panel>)}
    </div>
    {data?.leaveExceptions > 0 && <Notice>Employee status and leave requests differ. Open <Link to="/leave/exceptions">Leave Exceptions</Link> to review the discrepancy.</Notice>}
    <Panel title="Leave Operations">
      <nav aria-label="Leave operations" style={styles.actions}>
        {links.map(([path, label]) => <Link key={path} to={`/leave/${path}`} style={styles.button}>{label}</Link>)}
      </nav>
    </Panel>
    {!IS_SALES_DEMO_HOST && <EmployeeLeaveProfileSelector />}
    {isZermatt && <ZermattAnnualCarryoverPanel />}
  </LeavePage>;
}
