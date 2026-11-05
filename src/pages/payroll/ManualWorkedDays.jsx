import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ManualWorkedDaysPanel from "../../components/payroll/ManualWorkedDaysPanel";
import useAuthorization from "../../hooks/useAuthorization";
import { apiRequest } from "../../services/api";

export default function ManualWorkedDays() {
  const navigate = useNavigate();
  const { hasPermission, loading: authorizing } = useAuthorization();
  const [periods, setPeriods] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const canView = hasPermission("attendance.view");
  const canEdit = hasPermission("attendance.manage") || hasPermission("payroll.manage");

  useEffect(() => {
    if (authorizing || !canView) return undefined;
    let active = true;
    setPeriods(null);
    setError("");
    apiRequest("/api/payroll/periods").then(result => {
      if (!Array.isArray(result.data)) throw new Error("Unable to read payroll periods.");
      if (active) setPeriods(result.data);
    }).catch(err => { if (active) setError(err.message || "Unable to load payroll periods."); });
    return () => { active = false; };
  }, [authorizing, canView, revision]);

  const sorted = [...(periods || [])].sort((a,b) => String(b.periodStart).localeCompare(String(a.periodStart)));
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const selected = sorted.find(p => p.status !== "CLOSED" && String(p.periodStart).slice(0,10) <= today && String(p.periodEnd).slice(0,10) >= today)
    || sorted.find(p => p.status !== "CLOSED") || sorted[0];

  return <section style={{padding:24,color:"#F7FAF8"}}>
    <button type="button" onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
    <h1>Manual Worked Days</h1>
    <p>Select a payroll period to view recorded days, hours, notes and recording history. Use Load for Correction to edit an open period, then Save Worked Days. Closed periods are view-only.</p>
    {authorizing ? <p role="status">Checking access…</p> : !canView ? <p role="alert">Attendance view access is required.</p> : <>
      {error && <div role="alert">{error} <button onClick={() => setRevision(v => v + 1)}>Retry</button></div>}
      {!periods && !error && <p role="status">Loading payroll periods…</p>}
      {periods && <ManualWorkedDaysPanel periods={sorted} initialPeriodId={selected?.id || ""} includeClosedPeriods canEdit={canEdit} />}
    </>}
  </section>;
}
