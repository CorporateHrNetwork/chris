import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

function LeaveBalances(){
  const navigate=useNavigate();
  const [employeeNumber,setEmployeeNumber]=useState("");
  const [balances,setBalances]=useState(null);
  const [error,setError]=useState("");

  async function load(e){e.preventDefault();setError("");setBalances(null);try{const r=await apiRequest(`/api/leave/balances/${encodeURIComponent(employeeNumber.trim())}`);setBalances(r.data)}catch(err){setError(err.message||"Unable to load leave balances.");}}

  return <div style={{color:"var(--chris-text-main)"}}>
    <button type="button" onClick={()=>navigate("/leave")} style={back}>{"\u2190"} Back to Leave Dashboard</button>
    <div style={{marginBottom:22}}><div style={eyebrow}>PEOPLE OPERATIONS</div><h1 style={titleStyle}>Leave Balances</h1><p style={desc}>Review employee leave balances and available entitlements.</p></div>
    {error&&<div style={{...panel,padding:"12px 16px",marginBottom:18,color:"var(--chris-warning)"}}>{error}</div>}
    <section style={{...panel,maxWidth:980}}>
      <form onSubmit={load} style={{display:"flex",gap:10,marginBottom:18}}>
        <input style={input} value={employeeNumber} onChange={e=>setEmployeeNumber(e.target.value)} placeholder="Employee number e.g. CHR000006" required />
        <button style={button}>Load Balances</button>
      </form>
      {!balances?<div style={empty}>Enter an employee number to view leave balances.</div>:balances.balances?.length?<div style={{display:"grid",gap:12}}>{balances.balances.map(b=><div key={b.id} style={row}><div><strong>{b.leaveType?.name||"Leave"}</strong><div style={muted}>{b.leaveYear}</div></div><div style={{textAlign:"right"}}><strong style={{color:"var(--chris-gold)",fontSize:20}}>{b.available}</strong><div style={muted}>available</div></div></div>)}</div>:<div style={empty}>No leave balance records found for this employee.</div>}
    </section>
  </div>;
}
const panel={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)"};
const input={flex:1,padding:"11px 12px",borderRadius:"var(--chris-radius-md)",border:"1px solid var(--chris-border-soft)",background:"var(--chris-input-bg)",color:"var(--chris-text-main)",fontFamily:"var(--chris-font-family)"};
const button={border:0,borderRadius:"var(--chris-radius-md)",padding:"11px 16px",background:"linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep))",color:"#07110C",fontWeight:800};
const back={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800};
const eyebrow={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const desc={margin:0,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)"};
const row={display:"flex",justifyContent:"space-between",gap:14,padding:14,borderRadius:"var(--chris-radius-md)",background:"rgba(255,255,255,.035)",border:"1px solid var(--chris-border-soft)"};
const muted={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",marginTop:4};
const empty={color:"var(--chris-text-secondary)",padding:"18px 0"};
export default LeaveBalances;
