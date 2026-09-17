import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const STATUSES = ["NEW","QUALIFIED","DEMO_SCHEDULED","DEMO_COMPLETED","PROPOSAL_REQUIRED","PROPOSAL_SENT","NEGOTIATION","WON","LOST","DEFERRED"];

export default function CommercialOperations() {
  const [leads, setLeads] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [activity, setActivity] = useState([]);
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

  async function openLead(lead) {
    setSelected(lead);
    setStatus(lead.status || "QUALIFIED");
    setActivity([]);
    try {
      const [leadResult, activityResult] = await Promise.all([
        apiRequest(`/api/commercial/internal/leads/${lead.leadNumber}`),
        apiRequest(`/api/commercial/internal/leads/${lead.leadNumber}/activity`),
      ]);
      setSelected(leadResult.data || lead);
      setStatus(leadResult.data?.status || lead.status || "QUALIFIED");
      setActivity(activityResult.data || []);
    } catch (err) {
      setError(err.message || "Unable to load commercial opportunity details.");
    }
  }

  async function updateStatus() {
    if (!selected || !reason.trim()) return;
    try {
      setSaving(true);
      const result = await apiRequest(`/api/commercial/internal/leads/${selected.leadNumber}`, {
        method: "PATCH",
        body: JSON.stringify({ patch: { status }, reason: reason.trim() }),
      });
      setReason("");
      setSelected(result.data || selected);
      const activityResult = await apiRequest(`/api/commercial/internal/leads/${selected.leadNumber}/activity`);
      setActivity(activityResult.data || []);
      await load();
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
        <p style={muted}>Website demo requests are captured first, qualified, assigned auditable agent work, progressed through discovery/demo/proposal stages, and handed over for implementation only after controlled commercial approval.</p>
      </div>

      <div style={metricsGrid}>
        <Metric label="Total Leads" value={summary.total || 0}/>
        <Metric label="New" value={summary.new || 0}/>
        <Metric label="Qualified" value={summary.qualified || 0}/>
        <Metric label="Demos Scheduled" value={summary.demosScheduled || 0}/>
        <Metric label="Proposal / Negotiation" value={summary.proposalStage || 0}/>
        <Metric label="Won" value={summary.won || 0}/>
        <Metric label="Implementation Ready" value={summary.implementationReady || 0}/>
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
              <thead><tr>{["Lead","Company / Contact","Status","Priority","Score","Current Agent","Preferred Demo","Internal Alert","Prospect Ack","Action"].map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {leads.map((lead)=><tr key={lead.leadNumber}>
                  <td style={td}><strong>{lead.leadNumber}</strong><div style={small}>{lead.source}</div></td>
                  <td style={td}><strong>{lead.companyName}</strong><div style={small}>{lead.contactName} · {lead.email}</div><div style={small}>{lead.phone}</div></td>
                  <td style={td}>{lead.status}</td>
                  <td style={td}>{lead.commercialPriority || "—"}</td>
                  <td style={td}>{lead.qualificationScore ?? "—"}</td>
                  <td style={td}>{lead.agentWorkflow?.currentAgent || "Legacy / manual"}<div style={small}>{lead.agentWorkflow?.state || "—"}</div></td>
                  <td style={td}>{lead.preferredDemoDate || "Not specified"}{lead.preferredDemoTime ? ` · ${lead.preferredDemoTime}` : ""}</td>
                  <td style={td}>{lead.internalNotification?.status || lead.emailNotification?.status || "—"}<div style={small}>{lead.internalNotification?.to || lead.emailNotification?.to || "chris@crnetwork.com.ng"}</div></td>
                  <td style={td}>{lead.prospectAcknowledgement?.status || "—"}<div style={small}>{lead.prospectAcknowledgement?.to || lead.email || "—"}</div></td>
                  <td style={td}><button type="button" style={button} onClick={()=>openLead(lead)}>Open</button></td>
                </tr>)}
                {!leads.length ? <tr><td style={td} colSpan={10}>No demo requests captured yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? <section style={{ ...panel, marginTop:18 }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:12 }}>
          <div><div style={eyebrow}>OPPORTUNITY</div><h2 style={{ margin:"5px 0" }}>{selected.companyName}</h2><div style={muted}>{selected.leadNumber}</div></div>
          <button type="button" style={button} onClick={()=>{setSelected(null);setActivity([]);}}>Close</button>
        </div>
        <div style={detailGrid}>
          <Detail label="Contact" value={`${selected.contactName} · ${selected.email} · ${selected.phone}`}/>
          <Detail label="Organization Size" value={selected.employeeCount || "Not provided"}/>
          <Detail label="Locations" value={selected.locations || "Not provided"}/>
          <Detail label="Country" value={selected.country || "Not provided"}/>
          <Detail label="Modules of Interest" value={(selected.modulesOfInterest || []).join(", ") || "Not provided"}/>
          <Detail label="Current HR System" value={selected.currentHrSystem || "Not provided"}/>
          <Detail label="Implementation Timeline" value={selected.implementationTimeline || "Not provided"}/>
          <Detail label="Next Action" value={selected.nextAction || "Review and progress"}/>
          <Detail label="Current Agent" value={selected.agentWorkflow?.currentAgent || "Legacy / manual"}/>
          <Detail label="Workflow State" value={selected.agentWorkflow?.state || "Not initialized"}/>
          <Detail label="First Response SLA" value={selected.agentWorkflow?.firstResponseDueAt ? new Date(selected.agentWorkflow.firstResponseDueAt).toLocaleString() : "Not set"}/>
          <Detail label="Internal Notification" value={`${selected.internalNotification?.status || selected.emailNotification?.status || "—"} · ${selected.internalNotification?.to || selected.emailNotification?.to || "chris@crnetwork.com.ng"}`}/>
          <Detail label="Prospect Acknowledgement" value={`${selected.prospectAcknowledgement?.status || "—"} · ${selected.prospectAcknowledgement?.to || selected.email}`}/>
          <Detail label="Human Approval Gates" value={(selected.humanApprovalRequiredFor || []).join(", ") || "Standard controls"}/>
        </div>
        {selected.message ? <div style={{ ...detailCard, marginTop:12 }}><strong>Prospect requirements</strong><div style={{ marginTop:7 }}>{selected.message}</div></div> : null}

        {selected.agentWorkflow ? <div style={{ ...detailCard, marginTop:16 }}>
          <strong>Agent workflow</strong>
          <div style={small}>Workflow v{selected.agentWorkflow.workflowVersion || "1.0"} · Initialized {selected.agentWorkflow.initializedAt ? new Date(selected.agentWorkflow.initializedAt).toLocaleString() : "—"}</div>
          <div style={{ marginTop:10, display:"grid", gap:9 }}>
            {(selected.agentWorkflow.tasks || []).map((task)=><div key={task.id} style={taskRow}>
              <div><div style={{ fontWeight:800 }}>{task.agent}</div><div style={small}>{task.stage}</div></div>
              <div><strong>{task.status}</strong><div style={small}>{task.dueAt ? `Due ${new Date(task.dueAt).toLocaleString()}` : "No due date"}</div></div>
              <div style={{ fontSize:12 }}>{task.instruction || task.output?.classification || "Workflow task"}</div>
            </div>)}
          </div>
          <div style={{ marginTop:14 }}><strong>Human approval gates</strong></div>
          <div style={{ marginTop:8, display:"grid", gap:8 }}>
            {(selected.agentWorkflow.approvalGates || []).map((gate)=><div key={gate.id} style={taskRow}>
              <div><strong>{gate.type}</strong><div style={small}>{gate.owner}</div></div>
              <div><strong>{gate.status}</strong></div>
              <div style={{ fontSize:12 }}>{gate.requirement}</div>
            </div>)}
          </div>
        </div> : <div style={{ ...detailCard, marginTop:16 }}><strong>Agent workflow</strong><div style={muted}>This is a legacy lead created before agent orchestration was enabled.</div></div>}

        {selected.implementationHandoff ? <div style={{ ...detailCard, marginTop:12 }}><strong>Implementation handoff</strong><div style={{ marginTop:7 }}>{selected.implementationHandoff.status} · {selected.implementationHandoff.owner}</div><div style={small}>{(selected.implementationHandoff.assignedAgents || []).join(", ")}</div><div style={{ marginTop:6 }}>{selected.implementationHandoff.note}</div></div> : null}
        <div style={{ display:"grid", gridTemplateColumns:"minmax(220px,320px) 1fr auto", gap:10, marginTop:16, alignItems:"end" }}>
          <label><span style={small}>STATUS</span><select value={status} onChange={(e)=>setStatus(e.target.value)} style={input}>{STATUSES.map((value)=><option key={value}>{value}</option>)}</select></label>
          <label><span style={small}>REASON / COMMERCIAL NOTE</span><input value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Required for audit trail" style={input}/></label>
          <button type="button" style={button} disabled={saving || !reason.trim()} onClick={updateStatus}>{saving ? "Saving…" : "Update"}</button>
        </div>

        <div style={{ ...detailCard, marginTop:16 }}>
          <strong>Commercial activity</strong>
          <div style={{ marginTop:9, display:"grid", gap:8 }}>
            {activity.map((event)=><div key={event.id} style={{ padding:"8px 0", borderBottom:"1px solid var(--chris-border-soft)" }}><div style={{ fontWeight:800 }}>{event.action}</div><div style={small}>{event.createdAt ? new Date(event.createdAt).toLocaleString() : ""}{event.reason ? ` · ${event.reason}` : ""}</div></div>)}
            {!activity.length ? <div style={muted}>No activity recorded yet.</div> : null}
          </div>
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
const taskRow={display:"grid",gridTemplateColumns:"minmax(180px,.8fr) minmax(140px,.5fr) minmax(260px,1.7fr)",gap:12,padding:"10px 0",borderBottom:"1px solid var(--chris-border-soft)",alignItems:"start"};
const table={width:"100%",borderCollapse:"collapse",minWidth:1300};
const th={padding:"10px 8px",textAlign:"left",fontSize:11,color:"var(--chris-gold)",borderBottom:"1px solid var(--chris-border-soft)"};
const td={padding:"11px 8px",verticalAlign:"top",fontSize:12,borderBottom:"1px solid var(--chris-border-soft)"};
const small={fontSize:10,color:"var(--chris-text-secondary)",fontWeight:800,letterSpacing:".04em"};
const muted={color:"var(--chris-text-secondary)",fontSize:13,lineHeight:1.55};
const eyebrow={color:"var(--chris-gold)",fontSize:11,fontWeight:900,letterSpacing:".14em"};
const input={width:"100%",marginTop:5,padding:"10px 11px",borderRadius:8,border:"1px solid var(--chris-border-soft)",background:"rgba(0,0,0,.22)",color:"var(--chris-text-main)",boxSizing:"border-box"};
const button={padding:"10px 14px",borderRadius:8,border:"1px solid var(--chris-border-gold)",background:"rgba(8,122,67,.25)",color:"var(--chris-text-main)",fontWeight:800,cursor:"pointer"};
const errorStyle={padding:12,marginBottom:14,border:"1px solid rgba(220,60,60,.5)",borderRadius:8,color:"#ffd5d5",background:"rgba(120,20,20,.18)"};
