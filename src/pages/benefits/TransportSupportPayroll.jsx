import {useEffect,useMemo,useState} from 'react';
import EmployeeSearchSelect from '../../components/EmployeeSearchSelect';
import {useLocation,useNavigate} from 'react-router-dom';
import {apiRequest,apiDownload,saveDownloadedBlob} from '../../services/api';
const workflowPanel={border:'1px solid #385548',borderRadius:10,padding:16,marginBlock:16};
const api='/api/benefits/transport-support';
const money=v=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(v||0));
const actions={
 DRAFT:[['HEAD_HR_APPROVE','Approve for External Workflow','HEAD_HR']],
 REJECTED:[['HEAD_HR_APPROVE','Approve for External Workflow','HEAD_HR']],
 AUDIT_REVIEW:[['RETURN_TO_DRAFT','Return to Head HR Preparation','HEAD_HR']],
 GM_APPROVAL:[['RETURN_TO_DRAFT','Return to Head HR Preparation','HEAD_HR']],
};
const workspaces=[
 ['transport-run','Monthly Run'],
 ['transport-register','Full Register'],
 ['transport-export','Excel Export Portal'],
];
const moneyColumns=new Set([7,8,9,12,13,14,15,16]);
export default function TransportSupportPayroll() {
 const navigate=useNavigate();
 const {hash}=useLocation();
 const [workspace,setWorkspace]=useState(()=>workspaces.find(([id])=>hash===`#${id}`)?.[0]||'transport-run');
 function showWorkspace(id){
  setWorkspace(id);
  requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({block:'nearest'}));
 }
 const [exportColumns,setExportColumns]=useState([]);
 const [basisReadiness,setBasisReadiness]=useState(null);
 const [state,setState]=useState(null),[detail,setDetail]=useState(null),[periodMonth,setMonth]=useState(''),[notes,setNotes]=useState('');
 const [receipts,setReceipts]=useState({}),[editor,setEditor]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const roles=state?.responsibilities||[],head=roles.includes('HEAD_HR'),ready=state?.releaseReady===true;
 async function load(){const r=await apiRequest(api);setState(r.data);}
 useEffect(()=>{
  act(async()=>{
   const response=await apiRequest(api);
   const latest=[...(response.data.runs||[])].sort((a,b)=>String(b.periodMonth).localeCompare(String(a.periodMonth)))[0];
   setState(response.data);
   if(latest)await open(latest.id);
  });
 },[]);
 async function loadReadiness(){
  if(!periodMonth||!head||state?.settings?.enabled)return;
  const r=await apiRequest(`${api}/readiness?periodMonth=${encodeURIComponent(periodMonth)}`);setBasisReadiness(r.data);
 }
 useEffect(()=>{
  let active=true;setBasisReadiness(null);
  if(periodMonth&&head&&!state?.settings?.enabled){
   apiRequest(`${api}/readiness?periodMonth=${encodeURIComponent(periodMonth)}`).then(r=>{if(active)setBasisReadiness(r.data);}).catch(e=>{if(active)setError(e.message||'Unable to check benefit preparation coverage.');});
  }
  return()=>{active=false;};
 },[periodMonth,head,state?.settings?.enabled]);

 async function open(id){
  const r=await apiRequest(`${api}/runs/${id}`);setDetail(r.data);setMonth(String(r.data.run.periodMonth).slice(0,7));
  setReceipts(Object.fromEntries(r.data.lines.map(l=>[l.id,{actualPaid:l.actualPaid??'',reference:l.paymentReference||''}])));setNotes('');setEditor(null);setExportColumns(r.data.register.headers.map((_,i)=>i));
 }
 async function act(fn){setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e.message||'Unable to complete benefit operation.');}finally{setBusy(false);}}
 async function action(actionName){
  await apiRequest(`${api}/runs/${detail.run.id}/action`,{method:'POST',body:{action:actionName,notes,payments:actionName==='CONFIRM_PAYMENT'?detail.lines.map(l=>({lineId:l.id,...receipts[l.id]})):undefined}});
  await load();await open(detail.run.id);setMessage(actionName==='HEAD_HR_APPROVE'?'Head HR approval recorded. Export the register for external Auditor, GM and Chief Accountant processing.':'Benefit action recorded.');
 }
 function editLine(lineId){
  const line=detail.lines.find(l=>l.id===lineId);const input=line?.snapshot.benefitInputs||{};
  setEditor({lineId,inputs:{extraDays:input.extraDays||0,phDays:input.phDays||0,bonus:input.bonus||0,overtimePhPay:input.overtimePhPay||0,previousShortPayment:input.previousShortPayment??'',previousOverpayment:input.previousOverpayment??''}});
 }
 const employeeOptions=useMemo(()=>(detail?.lines||[]).map(l=>({employeeNumber:l.snapshot.employeeNumber,employeeName:l.snapshot.employeeName,department:l.snapshot.department,designation:l.snapshot.position,location:l.snapshot.location})),[detail]);
 const registerHeaders=detail?.register.headers||state?.registerHeaders||[];
 const canPay=detail?.run.status==='APPROVED'&&roles.includes('CHIEF_ACCOUNTANT');
 const externalReady=detail&&['APPROVED','PAID'].includes(detail.run.status);
 const editable=detail&&['DRAFT','REJECTED'].includes(detail.run.status);
 return <section style={{padding:24,maxWidth:1700,minWidth:0,width:'100%',boxSizing:'border-box',margin:'0 auto'}}>
  <h1>Transport Support Pay · Payroll Execution Workspace</h1>
  <nav aria-label="Transport Support workspace sections" style={{display:'flex',flexWrap:'wrap',gap:16,marginBlock:12}}>
   {workspaces.map(([id,label])=><button key={id} type="button" onClick={()=>showWorkspace(id)} aria-pressed={workspace===id}>{label}</button>)}
  </nav>
  {state&&!head&&<p role="note">Preparation, adjustments and export require the active Head HR payroll assignment for this account.</p>}
  <p><strong>Head HR prepares → approves → exports.</strong> Auditor → General Manager → Chief Accountant review, approval and payment processing take place externally using the exported register.</p>
  <p>Actual payment confirmation remains separate. An export does not confirm external approval or payment.</p>
  <p role="note">Benefit inputs and payments do not update regular salary rates, payroll runs, payslips, statutory deductions or loan recoveries.</p>
  {error&&<p role="alert" style={{color:'#fca5a5'}}>{error}</p>}{message&&<p role="status">{message}</p>}
  {!ready&&<p>Benefit processing is locked pending verified deployment. Existing records remain available for review.</p>}
  <section id="transport-run" aria-label="Monthly Run" hidden={workspace!=='transport-run'}>
  <h2>Monthly Run · Prepare or Open</h2>
  <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
   {head&&<button onClick={()=>navigate('/benefits/transport-support/preparation')}>Salary Basis Setup / Bulk Upload</button>}
   <button disabled={busy} onClick={()=>act(async()=>{await load();await loadReadiness();})}>Refresh</button>
   {head&&<><label>Benefit month <input type="month" value={periodMonth} onChange={e=>setMonth(e.target.value)}/></label>
    {!state?.settings?.enabled&&<button disabled={busy||!ready||!periodMonth||!basisReadiness?.canActivate} onClick={()=>act(async()=>{await apiRequest(`${api}/activate`,{method:'POST',body:{periodMonth}});await load();setMessage('Transport Support Benefits enabled. Regular salary rates and payroll were not changed.');})}>Enable Transport Support Benefits for this month</button>}
    <button disabled={busy||!!editor||!ready||!periodMonth||!state?.settings?.enabled} onClick={()=>act(async()=>{const r=await apiRequest(`${api}/runs`,{method:'POST',body:{periodMonth}});await load();await open(r.data.runId);})}>Prepare Monthly Draft</button>
   </>}
  </div>

  {head&&periodMonth&&!state?.settings?.enabled&&<section aria-label="Benefit activation readiness" style={{padding:14,margin:'14px 0',border:'1px solid #806b23',borderRadius:10}}>
   <h3>Preparation coverage · {periodMonth}</h3>
   {!basisReadiness?<p>Checking eligible employees and saved benefit bases...</p>:<>
    <p><strong>{basisReadiness.completeEmployees} of {basisReadiness.eligibleEmployees}</strong> eligible employees have a current full-gross basis. {basisReadiness.excludedEmployees} current records outside support eligibility do not block activation.</p>
    {!basisReadiness.eligibleEmployees&&<p>No current employees qualify for this month's Transport Support.</p>}
    {basisReadiness.missingEmployeeNumbers.length>0&&<details open><summary>Missing benefit bases: {basisReadiness.missingEmployeeNumbers.length}</summary><p>{basisReadiness.missingEmployeeNumbers.join(', ')}</p></details>}
    {basisReadiness.staleEmployeeNumbers.length>0&&<details open><summary>Employee details changed since preparation: {basisReadiness.staleEmployeeNumbers.length}</summary><p>{basisReadiness.staleEmployeeNumbers.join(', ')}</p></details>}
    {basisReadiness.canActivate?<p role="status">Eligible bases are ready. You can enable Transport Support Benefits for this month.</p>:<p>Open the preparation register, preview and import the missing or changed eligible employee bases for this month, then return here and select Refresh. Existing authoritative full-gross salary references are accepted; reduced salary amounts are never guessed.</p>}
    <button type="button" disabled={busy} onClick={()=>navigate('/benefits/transport-support/preparation')}>Open Preparation Register</button>
   </>}
  </section>}
  <p>Select an existing run to edit adjustments, approve the draft, or export its register.</p>
  {!state?.runs?.length?<p>No transport benefit runs yet.</p>:<div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{state.runs.map(r=><button key={r.id} aria-pressed={detail?.run.id===r.id} disabled={busy||!!editor} onClick={()=>act(()=>open(r.id))}>{String(r.periodMonth).slice(0,7)} · {r.status.replaceAll('_',' ')} · {money(r.netTotal)}</button>)}</div>}
  {detail&&<>
   <h2>{String(detail.run.periodMonth).slice(0,7)} · {detail.run.status.replaceAll('_',' ')}</h2>
   {head&&<section aria-label="Employee adjustments" style={workflowPanel}><h3>1. Employee Adjustments</h3>
   {!editable&&<p>Adjustments are available while this run is in draft preparation.</p>}

   {head&&editable&&<>
    {!editor?<button disabled={busy||!ready||!detail.lines.length} onClick={()=>editLine('')}>Enter Employee Adjustments</button>:<fieldset>
     <legend>Edit Transport Support · Days, Pay and Prior-month Corrections</legend>
     <EmployeeSearchSelect label="Transport benefit employee" options={employeeOptions} value={detail.lines.find(l=>l.id===editor.lineId)?.snapshot.employeeNumber||''} disabled={busy} onChange={number=>{const line=detail.lines.find(l=>l.snapshot.employeeNumber===number);if(line)editLine(line.id);else setEditor(current=>({...current,lineId:''}));}} placeholder="Search employee name or number" />
     {[['extraDays','No Of Extra Day(S)'],['phDays','No Of Ph Day(S)'],['bonus','Bonus'],['overtimePhPay','Approved Overtime/Ph Pay'],['previousShortPayment','Previous Month Short Payment (+)'],['previousOverpayment','Previous Month Overpayment (−)']].map(([key,label])=><label key={key} style={{display:'inline-block',margin:8}}>{label}<input type="number" min="0" step={key.endsWith('Days')?'0.0001':'0.01'} value={editor.inputs[key]} disabled={busy} onChange={e=>setEditor(current=>({...current,inputs:{...current.inputs,[key]:e.target.value}}))}/></label>)}
     <p>Enter the approved overtime/PH amount. Day counts are reference quantities; they do not automatically create a payment. Prior-month amounts default to the transport ledger. Enter a corrected total, including zero, with a reason; leave blank to use the ledger. Saving recalculates Net immediately. Corrections are audited and remaining overpayment carries forward once after actual payment confirmation.</p>
     <label>Adjustment reason (required) <textarea style={{display:'block',width:'100%'}} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
     <button disabled={busy||!ready||!notes.trim()||!editor.lineId} onClick={()=>act(async()=>{await apiRequest(`${api}/runs/${detail.run.id}/lines/${editor.lineId}/benefit-inputs`,{method:'PATCH',body:{inputs:editor.inputs,notes}});await load();await open(detail.run.id);setMessage('Benefit inputs saved and Net updated.');})}>Save Adjustments &amp; Recalculate Net</button>
     <button disabled={busy} onClick={()=>setEditor(null)}>Cancel Input Changes</button>
    </fieldset>}
   </>}
   {editor&&<p role="status">Save or cancel input changes before approving or exporting.</p>}
   </section>}
   {(head||canPay)&&<section aria-label="Approval or payment notes" style={workflowPanel}><h3>2. {canPay?'Payment Confirmation':'Head HR Approval'}</h3>
   <label>{canPay?'Payment batch reference':'Approval / return reason (required)'} <textarea style={{display:'block',width:'100%'}} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   {(actions[detail.run.status]||[]).filter(a=>roles.includes(a[2])).map(a=><button key={a[0]} disabled={busy||!!editor||!ready||!notes.trim()} onClick={()=>act(()=>action(a[0]))}>{a[1]}</button>)}
   </section>}
  </>}
  </section>
   <section hidden={workspace!=='transport-export'} id="transport-export" aria-label="Excel Export Portal" style={workflowPanel}><h2>Excel Export Portal</h2>
   {!state?<p>{error?'The workspace could not load. Use Refresh in Monthly Run to retry.':'Loading export permissions…'}</p>:!head?<p>The assigned Head HR can export the register.</p>:!detail?<p>Prepare or open a run in <button type="button" onClick={()=>showWorkspace("transport-run")}>Monthly Run</button> to select columns and download Excel.</p>:<><fieldset><legend>Choose export columns</legend>
    <button type="button" onClick={()=>setExportColumns(detail.register.headers.map((_,i)=>i))}>Select all</button> <button type="button" onClick={()=>setExportColumns([])}>Clear selection</button>
    <div style={{display:'flex',gap:14,flexWrap:'wrap',margin:12}}>{detail.register.headers.map((label,index)=><label key={label}><input type="checkbox" checked={exportColumns.includes(index)} onChange={e=>setExportColumns(c=>e.target.checked?[...c,index]:c.filter(i=>i!==index))}/>{label}</label>)}</div>
    <p>The master roll is ordered Abuja, Lagos, Port Harcourt. Each branch also has its own sheet. Only checked columns are included in register sheets.</p>
   </fieldset>
   <button disabled={busy||!!editor||!exportColumns.length} onClick={()=>act(async()=>saveDownloadedBlob(await apiDownload(`${api}/runs/${detail.run.id}/export?columns=${encodeURIComponent(JSON.stringify(exportColumns))}`)))}>Export Review Register (Excel)</button>
    <button disabled={!externalReady||busy||!!editor||!exportColumns.length} onClick={()=>act(async()=>saveDownloadedBlob(await apiDownload(`${api}/runs/${detail.run.id}/export?stage=external&columns=${encodeURIComponent(JSON.stringify(exportColumns))}`)))}>Export Approved Register (Excel)</button>
   {!externalReady&&<p>Approve this run to enable the external register export.</p>}</>}
   </section>
   <section id="transport-register" aria-label="Full Register" hidden={workspace!=='transport-register'}>
   <h2>Full Monthly Register{registerHeaders.length>0&&` · ${registerHeaders.length} columns`}</h2>
   {!detail&&<p>Prepare or open a run in <button type="button" onClick={()=>showWorkspace("transport-run")}>Monthly Run</button> to populate employee rows.</p>}
   {registerHeaders.length>0&&<details open><summary>All register columns</summary><ul style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,180px),1fr))',gap:8}}>{registerHeaders.map(label=><li key={label}>{label}</li>)}</ul></details>}
   <p>Scroll horizontally to see all columns. Export selections apply only to the Excel file.</p>
   <div role="region" aria-label="Full monthly Transport Support register" tabIndex={0} style={{overflowX:'auto',maxWidth:'100%'}}><table style={{width:'100%',minWidth:2200,textAlign:'left'}}>
    <thead><tr>{registerHeaders.map(h=><th key={h} style={{padding:8}}>{h}</th>)}</tr></thead>
    <tbody>{detail?.register.rows.map((row,index)=><tr key={detail.lines[index].id}>{row.map((value,col)=><td key={col} style={{padding:8,borderBottom:'1px solid #385548',whiteSpace:col===17?'nowrap':undefined}}>{moneyColumns.has(col)?money(value):value}</td>)}</tr>)}</tbody>
   </table></div>
   </section>
  <section aria-label="Payment confirmation and audit history" hidden={workspace!=='transport-run'}>
  {detail&&<>
   <p>Previous Month Overpayment shows the opening balance. Recovery is capped at available benefits; the remainder carries forward. End of the Month is a salary reference and is excluded from this benefit Net.</p>
   {canPay&&<>
    <h3>Actual payment confirmation</h3>
    <p>After the external approval and payout process, record the actual payment and reference for every employee. Enter zero with a reason for a missed payment.</p>
    <div style={{overflowX:'auto'}}><table><thead><tr><th>Employee</th><th>Actual Paid</th><th>Payment Reference / Nonpayment Reason</th></tr></thead><tbody>
     {detail.lines.map(l=><tr key={l.id}><td>{l.snapshot.employeeNumber} · {l.snapshot.employeeName}</td><td><input aria-label={`Actual paid ${l.snapshot.employeeNumber}`} type="number" min="0" step="0.01" value={receipts[l.id]?.actualPaid??''} onChange={e=>setReceipts(s=>({...s,[l.id]:{...s[l.id],actualPaid:e.target.value}}))}/></td><td><input aria-label={`Payment reference ${l.snapshot.employeeNumber}`} value={receipts[l.id]?.reference||''} onChange={e=>setReceipts(s=>({...s,[l.id]:{...s[l.id],reference:e.target.value}}))}/></td></tr>)}
    </tbody></table></div>
    <button disabled={busy||!notes.trim()} onClick={()=>setReceipts(Object.fromEntries(detail.lines.map(l=>[l.id,{actualPaid:String(l.netPay),reference:notes.trim()}])))}>Enter all approved amounts as paid</button>
    <button disabled={busy||!notes.trim()} onClick={()=>setReceipts(Object.fromEntries(detail.lines.map(l=>[l.id,{actualPaid:'0',reference:notes.trim()}])))}>Enter zero for all payments</button>
    <button disabled={busy||!ready||!notes.trim()} onClick={()=>act(()=>action('CONFIRM_PAYMENT'))}>Confirm actual payments &amp; carry balances forward</button>
   </>}
   <h3>Audit history</h3>{detail.events.map((e,i)=><p key={i}>{e.action.replaceAll('_',' ')} · {e.notes} · {new Date(e.createdAt).toLocaleString('en-NG',{timeZone:'Africa/Lagos'})}</p>)}
  </>}
  </section>
 </section>;
}


