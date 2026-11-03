import {useEffect,useState} from "react";
const title=v=>String(v||"").replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
export default function WorkflowApprovalInbox({request,base}){
 const [rows,setRows]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[selected,setSelected]=useState(null),[reason,setReason]=useState(""),[payment,setPayment]=useState({disbursedDate:"",recoveryStartDate:"",disbursementReference:""}),[notice,setNotice]=useState("");
 useEffect(()=>{let active=true;request(base).then(r=>{if(active){setRows(r.data);setError("")}}).catch(e=>{if(active&&!["WORKFLOW_NOT_AVAILABLE","ESS_WORKFLOW_TENANT_FORBIDDEN"].includes(e.code))setError(e.message)});return()=>{active=false}},[request,base,revision]);
 async function decide(decision){
  if(!selected)return;
  if(["REJECT","RETURN"].includes(decision)&&!reason.trim()){setError("Enter a reason for this decision.");return;}
  setBusy(true);setError("");setNotice("");
  try{const path=base.endsWith("/inbox")?base.slice(0,-6):base;await request(path+"/"+selected.requestType.toLowerCase()+"/"+encodeURIComponent(selected.requestId)+"/decisions",{method:"POST",body:{decision,expectedVersion:selected.version,reason,...payment}});setSelected(null);setNotice("Decision recorded.");setRevision(v=>v+1)}catch(e){setError(e.message);setSelected(null);setRevision(v=>v+1)}finally{setBusy(false)}
 }
 async function downloadForm(row){
  setBusy(true);setError("");
  try{const path=base.endsWith("/inbox")?base.slice(0,-6):base;const r=await request(path+"/loan/"+encodeURIComponent(row.requestId)+"/application-form");const file=r.data;const bytes=Uint8Array.from(atob(file.contentBase64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType||"application/octet-stream"}));const link=document.createElement("a");link.href=url;link.download=file.fileName||"Loan-Application";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 if(rows===null&&!error)return null;
 const isPayment=selected?.currentStage==="LOAN_CHIEF_ACCOUNTANT_DISBURSEMENT";
 const approve=selected?.currentStage==="LEAVE_HR_CONFIRMATION"?"CONFIRM":isPayment?"DISBURSE":"APPROVE";
 return <section className="card" aria-label="Applications and approvals"><h3>Applications &amp; Approvals</h3><p>View your application history and requests assigned to you. Audit access is read-only.</p><button disabled={busy} onClick={()=>{setSelected(null);setRevision(v=>v+1)}}>Refresh</button>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {rows?.length===0&&<p>No applications are assigned to this account.</p>}
 {rows?.map(row=><article key={row.requestType+row.requestId} style={{padding:"12px 0",borderTop:"1px solid #ddd"}}><strong>{title(row.requestType)} · {row.employeeName} ({row.employeeNumber})</strong><p>{title(row.status)}{row.currentRole?" · Awaiting "+title(row.currentRole):""}</p>{row.details&&(row.requestType==="LOAN"?<p>{row.details.purpose} · Amount: ₦{Number(row.details.principalAmount).toLocaleString("en-NG")} · Monthly installment: ₦{Number(row.details.installmentAmount).toLocaleString("en-NG")}<br/>{row.details.notes}</p>:<p>{String(row.details.startDate||"").slice(0,10)} to {String(row.details.endDate||"").slice(0,10)} · {Number(row.details.requestedUnits)} days<br/>{row.details.reason}</p>)}{row.requestType==="LOAN"&&row.details&&<button disabled={busy} onClick={()=>downloadForm(row)}>Download application form</button>}<details><summary>Approval history</summary><ol>{row.stages.map((s,i)=><li key={i}>{title(s.role)} — {title(s.status)}{s.actedAt?" · "+new Date(s.actedAt).toLocaleString("en-NG"):""}</li>)}</ol>{row.history.filter(h=>h.reason).map((h,i)=><p key={i}>{title(h.decision)}: {h.reason}</p>)}</details>{row.canAct&&<button disabled={busy} onClick={()=>{setSelected(row);setReason("");setPayment({disbursedDate:"",recoveryStartDate:"",disbursementReference:""});setError("")}}>Review request</button>}</article>)}
 {selected&&<form onSubmit={e=>{e.preventDefault();decide(approve)}} style={{padding:16,border:"1px solid #b8992e",borderRadius:8}}><h4>{title(selected.currentStage)} · {selected.employeeName}</h4>
  {isPayment&&<><p>Confirm only after the actual payment has been made. This records payment and activates recovery.</p>{[["disbursedDate","Payment date","date"],["recoveryStartDate","Recovery start month","month"],["disbursementReference","Payment reference","text"]].map(([key,label,type])=><label key={key} style={{display:"block",margin:"10px 0"}}>{label}<input required type={type} value={type==="month"?payment[key].slice(0,7):payment[key]} disabled={busy} onChange={e=>setPayment({...payment,[key]:type==="month"?e.target.value+"-01":e.target.value})}/></label>)}</>}
  <label>Decision notes<textarea value={reason} maxLength={4000} disabled={busy} onChange={e=>setReason(e.target.value)} style={{display:"block",width:"100%",boxSizing:"border-box"}}/></label>
  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12}}><button type="submit" disabled={busy}>{isPayment?"Confirm payment":title(approve)}</button>{!isPayment&&<button type="button" disabled={busy} onClick={()=>decide("REJECT")}>Reject</button>}{!isPayment&&selected.requestType==="LOAN"&&<button type="button" disabled={busy} onClick={()=>decide("RETURN")}>Return for correction</button>}<button type="button" disabled={busy} onClick={()=>setSelected(null)}>Close</button></div>
 </form>}
 </section>;
}
