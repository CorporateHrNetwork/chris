import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiRequest, getStoredOrganization } from "../services/api";

export default function ZermattLeaveReturnNotice() {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  const zermatt = getStoredOrganization()?.slug === "zermatt-liquor-limited";

  useEffect(() => {
    if (!zermatt) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const response = await apiRequest("/api/leave/return-reminders");
        if (active) setCount(response.data?.count || 0);
      } catch {
        if (active) setCount(0);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("chris:leave-return-confirmed", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("chris:leave-return-confirmed", refresh);
    };
  }, [pathname, zermatt]);

  if (!zermatt || !count) return null;
  return (
    <aside role="status" aria-label="Leave return reminders" style={{ padding: "8px 24px", borderBottom: "1px solid #C89B2C", background: "#09251a" }}>
      <Link to="/leave/returns" style={{ color: "#E7C86C" }}>
        Return to work · {count} {count === 1 ? "employee is" : "employees are"} due or overdue for HR confirmation
      </Link>
    </aside>
  );
}
