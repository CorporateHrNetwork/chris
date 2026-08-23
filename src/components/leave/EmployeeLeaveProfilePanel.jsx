/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api";
import { Notice, StatusBadge, formatDate, styles } from "./LeaveUi";

export default function EmployeeLeaveProfilePanel({ employeeNumber, open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    apiRequest(`/api/leave/employees/${encodeURIComponent(employeeNumber)}/profile`)
      .then((response) => { if (active) setData(response.data); })
      .catch((requestError) => { if (active) setError(requestError.message || "Unable to load employee Leave Profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [employeeNumber, open]);

  if (!open) return null;
  return <div style={overlay} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section style={modal} role="dialog" aria-modal="true" aria-label="Employee Leave Profile">
      <header style={header}><div><b style={{ color: "var(--chris-gold)" }}>EMPLOYEE LEAVE PROFILE</b><h2 style={{ margin: "6px 0" }}>{data ? [data.employee.firstName, data.employee.middleName, data.employee.lastName].filter(Boolean).join(" ") : employeeNumber}</h2></div><button type="button" style={styles.button} onClick={onClose}>Close</button></header>
      {loading && <div style={styles.empty}>Loading Leave Profile...</div>}{error && <Notice error>{error}</Notice>}
      {data && <>
        {data.exceptionWarnings?.length > 0 && <Notice error>{data.exceptionWarnings.map((warning) => <div key={warning}>{warning}</div>)}</Notice>}
        <div style={definitionGrid}>{Object.entries(data.balanceDefinitions || {}).map(([key, value]) => <div key={key}><strong style={{ textTransform: "capitalize", color: "var(--chris-gold)" }}>{key}</strong><div style={styles.muted}>{value}</div></div>)}</div>
        <ProfileSection title="Assigned Policies & Balances">{data.balances?.length ? <div style={cardGrid}>{data.balances.map((row) => <article key={row.policyId} style={card}><strong>{row.policyName}</strong><small style={styles.muted}>{row.leaveYear} · {row.unit}</small><div style={metrics}><Metric label="Entitlement" value={row.entitlement}/><Metric label="Used" value={row.used}/><Metric label="Committed" value={row.committed}/><Metric label="Available" value={row.available}/><Metric label="Adjustment" value={row.adjustment}/></div></article>)}</div> : <div style={styles.empty}>No active assigned policies.</div>}</ProfileSection>
        <div style={twoColumns}><ProfileSection title="Active Leave">{data.activeLeave ? <LeaveSummary request={data.activeLeave}/> : <div style={styles.empty}>No active leave.</div>}</ProfileSection><ProfileSection title="Next Upcoming Approved Leave">{data.nextUpcomingApprovedLeave ? <LeaveSummary request={data.nextUpcomingApprovedLeave}/> : <div style={styles.empty}>No upcoming approved leave.</div>}</ProfileSection></div>
        <ProfileSection title="Utilization History">{data.utilizationHistory?.length ? data.utilizationHistory.map((request) => <div key={request.id} style={historyRow}><span>{request.leavePolicy?.name || request.leaveType?.name}</span><span>{formatDate(request.startDate)} – {formatDate(request.endDate)}</span><StatusBadge status={request.status}/><strong>{Number(request.requestedUnits)} units</strong></div>) : <div style={styles.empty}>No utilization history.</div>}</ProfileSection>
      </>}
    </section>
  </div>;
}

function ProfileSection({ title, children }) { return <section style={section}><h3 style={{ marginTop: 0 }}>{title}</h3>{children}</section>; }
function Metric({ label, value }) { return <div><small style={styles.muted}>{label}</small><strong style={{ display: "block", fontSize: 18 }}>{Number(value || 0)}</strong></div>; }
function LeaveSummary({ request }) { return <div><StatusBadge status={request.status}/><p>{request.leavePolicy?.name || request.leaveType?.name}</p><strong>{formatDate(request.startDate)} – {formatDate(request.endDate)}</strong></div>; }

const overlay={position:"fixed",inset:0,zIndex:1400,display:"grid",placeItems:"center",padding:16,background:"rgba(0,0,0,.78)"};
const modal={width:"min(1100px,100%)",maxHeight:"calc(100dvh - 28px)",overflowY:"auto",padding:20,borderRadius:18,border:"1px solid var(--chris-border-gold)",background:"#07150E",color:"var(--chris-text-main)"};
const header={display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,position:"sticky",top:-20,padding:"16px 0",zIndex:2,background:"#07150E"};
const section={padding:15,marginTop:14,border:"1px solid var(--chris-border-soft)",borderRadius:12,background:"rgba(255,255,255,.025)"};
const definitionGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,padding:12,borderRadius:10,background:"rgba(212,175,55,.07)"};
const cardGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:10};
const card={display:"grid",gap:7,padding:13,borderRadius:10,border:"1px solid var(--chris-border-soft)"};
const metrics={display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8};
const twoColumns={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14};
const historyRow={display:"grid",gridTemplateColumns:"minmax(160px,1fr) minmax(190px,1fr) auto auto",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.06)"};
