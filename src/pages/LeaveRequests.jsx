import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

function LeaveRequests() {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [form, setForm] = useState({ leaveTypeId:"", startDate:"", endDate:"", requestedUnits:"", reason:"" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async()=>{try{const r=await apiRequest("/api/leave/types");setTypes(r.data||[])}catch(e){setError(e.message||"Unable to load leave types.")}})();
  },[]);

  async function submit(e){
    e.preventDefault(); setMessage(""); setError("");
    try{
      await apiRequest("/api/leave/requests",{method:"POST",body:JSON.stringify({
        employeeNumber:employeeNumber.trim(),
        leaveTypeId:form.leaveTypeId,
        startDate:form.startDate,
        endDate:form.endDate,
        requestedUnits:Number(form.requestedUnits),
        reason:form.reason
      })});
      setMessage("Leave request submitted successfully.");
      setForm({leaveTypeId:"",startDate:"",endDate:"",requestedUnits:"",reason:""});
    }catch(err){setError(err.message||"Unable to submit leave request.");}
  }

  return <div style={{color:"var(--chris-text-main)"}}>
    <Back onClick={()=>navigate("/leave")} />
    <Header title="Leave Requests" description="Create and manage employee leave requests." />
    {message&&<Notice success>{message}</Notice>}
    {error&&<Notice>{error}</Notice>}
    <section style={panel}>
      <h2 style={sectionTitle}>New Leave Request</h2>
      <p style={sectionSub}>Capture the employee and requested leave period.</p>
      <form onSubmit={submit} style={{display:"grid",gap:14,marginTop:18}}>
        <Field label="Employee Number"><input style={input} value={employeeNumber} onChange={e=>setEmployeeNumber(e.target.value)} placeholder="e.g. CHR000006" required /></Field>
        <Field label="Leave Type"><select style={input} value={form.leaveTypeId} onChange={e=>setForm({...form,leaveTypeId:e.target.value})} required><option value="">Select leave type</option>{types.filter(x=>x.isActive!==false).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="Start Date"><input style={input} type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})} required /></Field>
          <Field label="End Date"><input style={input} type="date" value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})} required /></Field>
        </div>
        <Field label="Requested Days / Units"><input style={input} type="number" min="0.5" step="0.5" value={form.requestedUnits} onChange={e=>setForm({...form,requestedUnits:e.target.value})} required /></Field>
        <Field label="Reason"><textarea style={{...input,minHeight:100}} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></Field>
        <button style={button}>Submit Leave Request</button>
      </form>
    </section>
  </div>;
}
function Header({title,description}){return <div style={{marginBottom:22}}><div style={eyebrow}>PEOPLE OPERATIONS</div><h1 style={titleStyle}>{title}</h1><p style={desc}>{description}</p></div>}
function Back({onClick}){return <button type="button" onClick={onClick} style={back}>{"\u2190"} Back to Leave Dashboard</button>}
function Field({label,children}){return <label><div style={labelStyle}>{label}</div>{children}</label>}
function Notice({children,success}){return <div style={{...panel,padding:"12px 16px",marginBottom:18,color:success?"var(--chris-success)":"var(--chris-warning)"}}>{children}</div>}
const panel={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)",maxWidth:980};
const input={width:"100%",boxSizing:"border-box",padding:"11px 12px",borderRadius:"var(--chris-radius-md)",border:"1px solid var(--chris-border-soft)",background:"var(--chris-input-bg)",color:"var(--chris-text-main)",fontFamily:"var(--chris-font-family)",fontSize:"var(--chris-font-md)"};
const button={border:0,borderRadius:"var(--chris-radius-md)",padding:"12px 16px",background:"linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep))",color:"#07110C",fontWeight:800};
const back={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800};
const eyebrow={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const desc={margin:0,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)"};
const labelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700,marginBottom:7};
const sectionTitle={margin:0,fontSize:"var(--chris-font-xl)",fontWeight:800};
const sectionSub={margin:"6px 0 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
export default LeaveRequests;
