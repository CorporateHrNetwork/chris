import {useEffect,useState} from "react";
import {essRequest} from "../../services/essApi";
const field={display:"block",width:"100%",padding:10,boxSizing:"border-box",font:"inherit",marginTop:5};
export default function EssLoanApplications(){
 const [data,setData]=useState(null),[form,setForm]=useState({purpose:"",principalAmount:"",installmentAmount:"",suretyEmployeeNumber:"",notes:""}),[files,setFiles]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;essRequest("/api/ess/loans/applications").then(r=>{if(active)setData(r.data)}).catch(e=>{if(active&&!["ESS_LOAN_NOT_AVAILABLE","ESS_LOAN_TENANT_NOT_ENABLED"].includes(e.code))setError(e.message)});return()=>{active=false}},[revision]);
 async function run(fn){setBusy(true);setError("");setNotice("");try{await fn();setRevision(v=>v+1)}catch(e){setError(e.message)}finally{setBusy(false)}}
 if(!data&&!error)return null;
 return <section className="card" aria-label="Loan applications"><h3>Apply for a loan</h3>
  <p>Branch Operations Manager → Head HR → General Manager → Chief Accountant. Payment is recorded after Accounts pays; payroll recovery starts from the confirmed recovery month.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {data&&<><form onSubmit={e=>{e.preventDefault();run(async()=>{await essRequest("/api/ess/loans/applications",{method:"POST",body:form});setNotice("Draft created. Attach your completed application form below and submit for branch manager approval.")})}}>
   <label>Loan purpose<select required style={field} value={form.purpose} disabled={busy} onChange={e=>setForm({...form,purpose:e.target.value})}><option value="">Select purpose</option>{data.policies.map(p=><option key={p.code} value={p.name}>{p.name}</option>)}</select></label>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,margin:"12px 0"}}>{[["principalAmount","Amount requested (₦)"],["installmentAmount","Monthly installment (₦)"]].map(([key,label])=><label key={key}>{label}<input style={field} type="number" min="0.01" step="0.01" required disabled={busy} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}</div>
   <label>Surety employee number, where required<input style={field} disabled={busy} value={form.suretyEmployeeNumber} onChange={e=>setForm({...form,suretyEmployeeNumber:e.target.value})}/></label>
   <label>Reason / notes<textarea style={field} maxLength={1500} disabled={busy} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
   <button type="submit" disabled={busy} style={{marginTop:12}}>Create draft</button>
  </form><h4>My applications</h4>{data.applications.length===0?<p>No applications yet.</p>:data.applications.map(a=><article key={a.id} style={{borderTop:"1px solid #ddd",padding:"12px 0"}}><strong>{a.loanNumber} · {a.purpose}</strong><p>{a.status.replaceAll("_"," ")} · ₦{Number(a.principalAmount).toLocaleString("en-NG")}</p>
   {a.status==="DRAFT"&&<><label>Completed application form (PDF, image or Word; up to 10 MB)<input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" disabled={busy} onChange={e=>setFiles({...files,[a.id]:e.target.files?.[0]})}/></label><button disabled={busy||!files[a.id]} onClick={()=>run(async()=>{const body=new FormData();body.append("file",files[a.id]);await essRequest("/api/ess/loans/"+encodeURIComponent(a.id)+"/application-form",{method:"POST",body});await essRequest("/api/ess/loans/"+encodeURIComponent(a.id)+"/submit",{method:"POST"});setNotice("Application submitted to your branch manager. Track it in Applications & Approvals.")})}>Attach and submit</button></>}
   {a.status==="RETURNED_FOR_CORRECTION"&&<p>Your request was returned. Contact HR before creating a corrected application.</p>}
  </article>)}</>}
 </section>;
}
