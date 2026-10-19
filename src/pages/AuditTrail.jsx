import { useCallback, useEffect, useMemo, useState } from "react";
import { FaDownload, FaSyncAlt } from "react-icons/fa";
import { apiRequest } from "../services/api";
import "../components/settings/UsersRolesSettings.chris.css";

function csvCell(value) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function AuditTrail() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ q: "", action: "", entityType: "", from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
      params.set("limit", "1000");
      const result = await apiRequest(`/api/audit-trail?${params.toString()}`);
      setRows(Array.isArray(result?.data) ? result.data : []);
    } catch (err) {
      setError(err?.message || "Unable to load the CHRiS audit trail.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => ({
    events: rows.length,
    actors: new Set(rows.map((row) => row.actorUserId).filter(Boolean)).size,
    actions: new Set(rows.map((row) => row.action).filter(Boolean)).size,
    entities: new Set(rows.map((row) => row.entityType).filter(Boolean)).size,
  }), [rows]);

  const exportCsv = () => {
    const headings = ["Date/Time","Actor","Actor Email","Action","Entity Type","Entity ID","Reason","Previous Value","New Value"];
    const body = rows.map((row) => [
      row.createdAt,row.actorName,row.actorEmail,row.action,row.entityType,row.entityId,row.reason,row.previousValue,row.newValue
    ].map(csvCell).join(","));
    const blob = new Blob([[headings.map(csvCell).join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CHRiS_Audit_Trail_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="chris-users-roles" style={page}>
    <div style={header}>
      <div><div style={eyebrow}>GOVERNANCE & ASSURANCE</div><h1 style={title}>Audit Trail</h1>
        <p style={subtitle}>Searchable, organization-scoped history of recorded CHRiS control events and changes.</p></div>
      <div style={actions}><button style={secondary} onClick={load} disabled={loading}><FaSyncAlt/> Refresh</button><button style={primary} onClick={exportCsv} disabled={!rows.length}><FaDownload/> Export CSV</button></div>
    </div>
    <div style={metrics}>{[["Recorded Events",summary.events],["Actors",summary.actors],["Actions",summary.actions],["Entity Types",summary.entities]].map(([label,value])=><div className="chris-role-card" key={label} style={card}><div style={metricLabel}>{label}</div><div style={metricValue}>{value.toLocaleString("en-NG")}</div></div>)}</div>
    <div className="chris-role-card" style={card}>
      <div style={filtersStyle}>
        <input placeholder="Search action, entity, reference or reason" value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})} style={input}/>
        <input placeholder="Action" value={filters.action} onChange={e=>setFilters({...filters,action:e.target.value})} style={input}/>
        <input placeholder="Entity type" value={filters.entityType} onChange={e=>setFilters({...filters,entityType:e.target.value})} style={input}/>
        <label style={label}>From<input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})} style={input}/></label>
        <label style={label}>To<input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})} style={input}/></label>
      </div>
    </div>
    {error && <div style={errorStyle}>{error}</div>}
    <div className="chris-role-card" style={{...card,marginTop:14,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}><table style={table}><thead><tr>{["Date / Time","Actor","Action","Entity","Reference","Reason","Change"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(row=><tr key={row.id}><td style={td}>{new Date(row.createdAt).toLocaleString("en-GB")}</td><td style={td}><strong>{row.actorName}</strong><br/><span style={muted}>{row.actorEmail||"System event"}</span></td><td style={td}><strong>{row.action}</strong></td><td style={td}>{row.entityType}</td><td style={td}>{row.entityId||"—"}</td><td style={td}>{row.reason||"—"}</td><td style={td}><details><summary>View</summary><pre style={pre}>{JSON.stringify({before:row.previousValue,after:row.newValue},null,2)}</pre></details></td></tr>)}
      {!loading&&!rows.length&&<tr><td colSpan="7" style={empty}>No audit events match the current filters.</td></tr>}</tbody></table></div>
      {loading&&<div style={empty}>Loading audit trail…</div>}
    </div>
  </div>;
}

const page={padding:24,color:"#ECF4EF"}; const header={display:"flex",justifyContent:"space-between",gap:18,alignItems:"flex-start",flexWrap:"wrap",marginBottom:18};
const eyebrow={color:"#D6B437",fontWeight:900,fontSize:12,letterSpacing:".08em"}; const title={margin:"5px 0",fontSize:30}; const subtitle={margin:0,color:"#AFC0B7"};
const actions={display:"flex",gap:10,flexWrap:"wrap"}; const primary={border:0,borderRadius:9,padding:"11px 15px",background:"#D6B437",color:"#111A15",fontWeight:900,cursor:"pointer"};
const secondary={...primary,background:"#143B2A",color:"#ECF4EF",border:"1px solid #315443"}; const metrics={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:14};
const card={border:"var(--chris-ui-panel-border, 1px solid #315443)",borderRadius:"var(--chris-ui-panel-radius, 12px)",padding:14,background:"var(--chris-ui-panel-background, #09251A)"}; const metricLabel={fontSize:11,fontWeight:900,textTransform:"uppercase",color:"#AFC0B7"}; const metricValue={fontSize:26,fontWeight:900,color:"#D6B437",marginTop:5};
const filtersStyle={display:"grid",gridTemplateColumns:"minmax(220px,2fr) repeat(4,minmax(140px,1fr))",gap:10}; const input={width:"100%",boxSizing:"border-box",border:"1px solid #315443",borderRadius:8,background:"#0B291D",color:"#ECF4EF",padding:"10px 11px",minHeight:42}; const label={fontSize:11,fontWeight:900,color:"#D6B437"};
const table={width:"100%",borderCollapse:"collapse",minWidth:1050}; const th={textAlign:"left",padding:"11px 10px",borderBottom:"1px solid #315443",color:"#D6B437",fontSize:11,textTransform:"uppercase"}; const td={padding:"11px 10px",borderBottom:"1px solid rgba(49,84,67,.55)",verticalAlign:"top",fontSize:12}; const muted={color:"#AFC0B7",fontSize:11}; const pre={whiteSpace:"pre-wrap",maxWidth:420,color:"#DDE8E1",fontSize:10}; const empty={padding:20,textAlign:"center",color:"#AFC0B7"}; const errorStyle={padding:12,border:"1px solid #8A3B3B",background:"#341818",borderRadius:9,color:"#FFD7D7"};
