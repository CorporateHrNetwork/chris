import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

function LeavePolicies(){
  const navigate=useNavigate();
  const [policies,setPolicies]=useState([]);
  const [error,setError]=useState("");
  useEffect(()=>{(async()=>{try{const r=await apiRequest("/api/leave/policies");setPolicies(r.data||[])}catch(e){setError(e.message||"Unable to load leave policies.")}})()},[]);
  return <div style={{color:"var(--chris-text-main)"}}>
    <button type="button" onClick={()=>navigate("/leave")} style={back}>{"\u2190"} Back to Leave Dashboard</button>
    <div style={{marginBottom:22}}><div style={eyebrow}>PEOPLE OPERATIONS</div><h1 style={titleStyle}>Leave Policies</h1><p style={desc}>Review active leave policies, entitlement rules and eligibility configuration.</p></div>
    {error&&<div style={{...panel,padding:"12px 16px",marginBottom:18,color:"var(--chris-warning)"}}>{error}</div>}
    <section style={panel}>
      {policies.length?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>{policies.map(p=><div key={p.id} style={policy}><div><strong>{p.name}</strong><div style={muted}>{p.leaveType?.name||"Leave policy"}</div></div><div style={{textAlign:"right"}}><strong style={{color:"var(--chris-gold)",fontSize:20}}>{String(p.entitlementDays??"—")}</strong><div style={muted}>days</div></div></div>)}</div>:<div style={empty}>No leave policies are configured yet.</div>}
    </section>
  </div>;
}
const panel={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)"};
const back={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800};
const eyebrow={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const desc={margin:0,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)"};
const policy={display:"flex",justifyContent:"space-between",gap:14,padding:14,borderRadius:"var(--chris-radius-md)",background:"rgba(255,255,255,.035)",border:"1px solid var(--chris-border-soft)"};
const muted={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",marginTop:4};
const empty={color:"var(--chris-text-secondary)",padding:"18px 0"};
export default LeavePolicies;
