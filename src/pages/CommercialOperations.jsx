import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const STATUSES = ["NEW","QUALIFIED","DEMO_SCHEDULED","DEMO_COMPLETED","PROPOSAL_REQUIRED","PROPOSAL_SENT","NEGOTIATION","WON","LOST","DEFERRED"];

export default function CommercialOperations() {
  const [leads, setLeads] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("QUALIFIED");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [leadResult, summaryResult] = await Promise.all([
        apiRequest("/api/commercial/internal/leads"),
        apiRequest("/api/commercial/internal/summary"),
      ]);
      setLeads(leadResult.data || []);
      setSummary(summaryResult.data || {});
    } catch (err) {
      setError(err.message || "Unable to load commercial operations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => leads.filter((lead) => !["WON","LOST"].includes(lead.status)), [leads]);

  async function updateStatus() {
    if (!selected || !reason.trim()) return;
    try {
      setSaving(true);
      await apiRequest(`/api/commercial/internal/leads/${selected.leadNumber}`, {
        method: "PATCH",
        body: JSON.stringify({ patch: { status }, reason: reason.trim() }),
      });
      setReason("");
      await load();
      setSelected((current) => current ? { ...current, status } : current);
    } catch (err) {
      setError(err.message || "Unable to update commercial lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ color:"var(--chris-text-main)" }}>
      <div style={{ marginBottom:20 }}>
        <div style={eyebrow}>CHRiS COMMERCIAL OPERATIONS</div>
        <h1 style={{ margin:"6px 0", fontSize:"var(--chris-font-2xl)" }}>Demo Requests & Commercial Pipeline</h1>
        <p style={muted}>Website demo requests are captured here first, qualified, routed to the appropriate internal agents, progressed through demo/proposal stages, and handed over for implementation when won.</p>
      </div>

      <div style={metricsGrid}>
        <Metric label="Total Leads" value={summary.total || 0}/>
        <Metric label="New" value={summary.new || 0}/>
        <Metric label="Qualified" value={summary.qualified || 0}/>
        <Metric label="Demos Scheduled" value={summary.demosScheduled || 0}/>
        <Metric label="Proposal / Negotiation" value={summary.proposalStage || 0}/>
        <Metric label="High Priority" value={summary.highPriority || 0}/>
      </div>

      {error ? <div style={errorStyle}>{error}</div> : null}

      <section style={panel}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", marginBottom:14 }}>
          <div><h2 style={{ margin:0 }}>Commercial Queue</h2><div style={muted}>{active.length} active opportunity records</div></div>
          <button type="button" onClick={load} style={button}>Refresh</button>
        </div>
        {loading ? <div style={muted}>Loading commercial pipeline…</div> : (
          <div style={{ overflowX:"auto" }}>
            <table style={table}>
              <thead><tr>{["Lead","Company / Contact","Status","Priority","Score","Preferred Demo","Agents","Notification","Action"].map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {leads.map((lead)=><tr key={lead.leadNumber}>
                  <td style={td}><strong>{lead.leadNumber}</strong><div style={small}>{lead.source}</div></td>
                  <td style={td}><strong>{lead.companyName}</strong><div style={small}>{lead.contactName} · {lead.email}</div><div style={small}>{lead.phone}</div></td>
                  <td style={td}>{lead.status}</td>
                  <td style={td}>{lead.commercialPriority || "—"}</td>
                  <td style={td}>{lead.qualificationScore ?? "—"}</td>
                  <td style={td}>{lead.preferredDemoDate || "Not specified"}{lead.preferredDemoTime ? ` · ${lead.preferredDemoTime}` : ""}</td>
                  <td style={td}>{(lead.assignedAgents || []).join(", ") || "—"}</td>
                  <td style={td}>{lead.emailNotification?.status || "—"}<div style={small}>{lead.emailNotification?.to || "chris@crnetwork.com.ng"}</div></td>
                  <td style={td}><button type="button" style={button} onClick={()=>{setSelected(lead);setStatus(lead.status || "QUALIFIED");}}>Open</button></td>
                </tr>)}
                {!leads.length ? <tr><td style={td} colSpan={9}>No demo requests captured yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? <section style={{ ...panel, marginTop:18 }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:12 }}>
          <div><div style={eyebrow}>OPPORTUNITY</div><h2 style={{ margin:"5px 0" }}>{selected.companyName}</h2><div style={muted}>{selected.leadNumber}</div></div>
          <button type="button" style={button} onClick={()=>setSelected(null)}>Close</button>
        </div>
        <div style={detailGrid}>
          <Detail label="Contact" value={`${selected.contactName} · ${selected.email} · ${selected.phone}`}/>
          <Detail label="Organization Size" value={selected.employeeCount || "Not provided"}/>
          <Detail label="Locations" value={selected.locations || "Not provided"}/>
          <Detail label="Modules of Interest" value={(selected.modulesOfInterest || []).join(", ") || "Not provided"}/>
          <Detail label="Current HR System" value={selected.currentHrSystem || "Not provided"}/>
          <Detail label="Implementation Timeline" value={selected.implementationTimeline || "Not provided"}/>
          <Detail label="Next Action" value={selected.nextAction || "Review and progress"}/>
          <Detail label="Human Approval Gates" value={(selected.humanApprovalRequiredFor || []).join(", ") || "Standard controls"}/>
        </div>
        {selected.message ? <div style={{ ...detailCard, marginTop:12 }}><strong>Prospect requirements</strong><div style={{ marginTop:7 }}>{selected.message}</div></div> : null}
        <div style={{ display:"grid", gridTemplateColumns:"minmax(220px,320px) 1fr auto", gap:10, marginTop:16, alignItems:"end" }}>
          <label><span style={small}>STATUS</span><select value={status} onChange={(e)=>setStatus(e.target.value)} style={input}>{STATUSES.map((value)=><option key={value}>{value}</option>)}</select></label>
          <label><span style={small}>REASON / COMMERCIAL NOTE</span><input value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Required for audit trail" style={input}/></label>
          <button type="button" style={button} disabled={saving || !reason.trim()} onClick={updateStatus}>{saving ? "Saving…" : "Update"}</button>
        </div>
      </section> : null}
    </div>
  );
}

function Metric({label,value}) { return <div style={panel}><div style={small}>{label.toUpperCase()}</div><div style={{ fontSize:28,fontWeight:900,marginTop:8 }}>{value}</div></div>; }
function Detail({label,value}) { return <div style={detailCard}><div style={small}>{label.toUpperCase()}</div><div style={{ marginTop:6,fontWeight:700 }}>{value}</div></div>; }
const panel={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:18,boxShadow:"var(--chris-shadow-card)"};
const metricsGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:18};
const detailGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,marginTop:14};
const detailCard={padding:12,border:"1px solid var(--chris-border-soft)",borderRadius:10,background:"rgba(255,255,255,.025)"};
const table={width:"100%",borderCollapse:"collapse",minWidth:1150};
const th={padding:"10px 8px",textAlign:"left",fontSize:11,color:"var(--chris-gold)",borderBottom:"1px solid var(--chris-border-soft)"};
const td={padding:"11px 8px",verticalAlign:"top",fontSize:12,borderBottom:"1px solid var(--chris-border-soft)"};
const small={fontSize:10,color:"var(--chris-text-secondary)",fontWeight:800,letterSpacing:".04em"};
const muted={color:"var(--chris-text-secondary)",fontSize:13,lineHeight:1.55};
const eyebrow={color:"var(--chris-gold)",fontSize:11,fontWeight:900,letterSpacing:".14em"};
const input={width:"100%",marginTop:5,padding:"10px 11px",borderRadius:8,border:"1px solid var(--chris-border-soft)",background:"rgba(0,0,0,.22)",color:"var(--chris-text-main)",boxSizing:"border-box"};
const button={padding:"10px 14px",borderRadius:8,border:"1px solid var(--chris-border-gold)",background:"rgba(8,122,67,.25)",color:"var(--chris-text-main)",fontWeight:800,cursor:"pointer"};
const errorStyle={padding:12,marginBottom:14,border:"1px solid rgba(220,60,60,.5)",borderRadius:8,color:"#ffd5d5",background:"rgba(120,20,20,.18)"};
