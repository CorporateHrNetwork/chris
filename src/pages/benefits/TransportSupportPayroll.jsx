import {useEffect,useMemo,useState} from 'react';
import EmployeeSearchSelect from '../../components/EmployeeSearchSelect';
import {useLocation,useNavigate} from 'react-router-dom';
import {apiRequest,apiDownload,saveDownloadedBlob} from '../../services/api';
const workflowPanel={border:'1px solid #385548',borderRadius:10,padding:16,marginBlock:16};
const api='/api/benefits/transport-support';
const money=v=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(v||0));
const actions={
 APPROVED:[['REOPEN_FOR_CORRECTION','Reopen for Correction','HEAD_HR']],
 DRAFT:[['HEAD_HR_APPROVE','Approve for External Workflow','HEAD_HR']],
 REJECTED:[['HEAD_HR_APPROVE','Approve for External Workflow','HEAD_HR']],
 AUDIT_REVIEW:[['RETURN_TO_DRAFT','Return to Head HR Preparation','HEAD_HR']],
 GM_APPROVAL:[['RETURN_TO_DRAFT','Return to Head HR Preparation','HEAD_HR']],
};
const workspaces=[
 ['transport-register','TSP Register'],
 ['transport-run','Manage Run'],
 ['transport-export','Export Excel'],
];
const moneyColumns=new Set(['Gross Salary','End of the Month','Mid-Month','Bonus','Overtime Pay','Public Holiday Pay','Previous Month Short Payment','Previous Month Outstanding','Previous Month Overpayment','Net']);
export default function TransportSupportPayroll() {
 const navigate=useNavigate();
 const {hash}=useLocation();
 const [workspace,setWorkspace]=useState(()=>workspaces.find(([id])=>hash===`#${id}`)?.[0]||'transport-register');
 function showWorkspace(id){
  setWorkspace(id);
  requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({block:'nearest'}));
 }
 const [workedFile,setWorkedFile]=useState(null);
 const [moreOpen,setMoreOpen]=useState(false);
 const [adjustmentReason,setAdjustmentReason]=useState('');
 const [workedPreview,setWorkedPreview]=useState(null);
 const [workedReason,setWorkedReason]=useState('');
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

 function downloadWorkedTemplate(){
  const rows=detail.lines.map(line=>[line.snapshot.employeeNumber,'',''].join(','));
  const blob=new Blob([['Employee No,Extra Days Worked,Public Holiday Days Worked',...rows].join('\r\n')],{type:'text/csv'});
  saveDownloadedBlob({blob,fileName:`Transport_Support_Worked_Days_${String(detail.run.periodMonth).slice(0,7)}.csv`});
 }
 async function uploadWorkedDays(confirm){
  if(!workedFile||workedFile.size>70000)throw new Error('Choose a worked-day file under 70 KB.');
  const bytes=new Uint8Array(await workedFile.arrayBuffer());
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  const r=await apiRequest(`${api}/runs/${detail.run.id}/worked-days`,{method:'POST',body:{file:btoa(binary),confirmation:confirm?workedPreview.token:undefined,notes:workedReason}});
  if(!confirm){setWorkedPreview(r.data);return;}
  await load();await open(detail.run.id);setMessage(`Worked days imported and Net recalculated for ${r.data.updated} employee(s).`);
 }
 async function open(id){
  setWorkedFile(null);setWorkedPreview(null);setWorkedReason('');
  const r=await apiRequest(`${api}/runs/${id}`);setDetail(r.data);setRegisterFilters({});setMonth(String(r.data.run.periodMonth).slice(0,7));
  setReceipts(Object.fromEntries(r.data.lines.map(l=>[l.id,{actualPaid:l.actualPaid??'',reference:l.paymentReference||''}])));setNotes('');setEditor(null);setExportColumns(r.data.register.headers.map((_,i)=>i));
 }
 async function act(fn){setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e.message||'Unable to complete benefit operation.');}finally{setBusy(false);}}
 async function action(actionName){
  if(actionName==='REOPEN_FOR_CORRECTION'&&!window.confirm('Reopen only if external payment has not started. Withdraw any previously shared approved register and issue a new one after approval.'))return;
  await apiRequest(`${api}/runs/${detail.run.id}/action`,{method:'POST',body:{action:actionName,notes,payments:actionName==='CONFIRM_PAYMENT'?detail.lines.map(l=>({lineId:l.id,...receipts[l.id]})):undefined}});
  await load();await open(detail.run.id);setMessage(actionName==='HEAD_HR_APPROVE'?'Head HR approval recorded. Export the register for external Auditor, GM and Chief Accountant processing.':'Benefit action recorded.');
 }
 function editLine(lineId){
  const line=detail.lines.find(l=>l.id===lineId);const input=line?.snapshot.benefitInputs||{};
  setAdjustmentReason('');
  setEditor({lineId,inputs:{lastPayableDate:input.lastPayableDate??'',extraDays:input.extraDays||0,phDays:input.phDays||0,bonus:input.bonus||0,calculateFromDays:true,previousShortPayment:input.previousShortPayment??'',previousMonthOutstanding:input.previousMonthOutstanding??0,previousOverpayment:input.previousOverpayment??''}});
 }
 const employeeOptions=useMemo(()=>(detail?.lines||[]).map(l=>({employeeNumber:l.snapshot.employeeNumber,employeeName:l.snapshot.employeeName,department:l.snapshot.department,designation:l.snapshot.position,location:l.snapshot.location})),[detail]);
 const [registerFilters,setRegisterFilters]=useState({});
 const [employeeQuery,setEmployeeQuery]=useState('');
 const searchWords=employeeQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const registerRows=detail?.register.rows||[];
 const filterColumns=[[1,'Branch'],[5,'Department'],[4,'Designation']];
 const filteredRows=registerRows.filter(row=>{
  const employee=`${row[2]} ${row[3]}`.toLowerCase();
  return searchWords.every(word=>employee.includes(word))&&filterColumns.every(([index])=>!registerFilters[index]||row[index]===registerFilters[index]);
 });
 const registerHeaders=detail?.register.headers||state?.registerHeaders||[];
 const canPay=detail?.run.status==='APPROVED'&&roles.includes('CHIEF_ACCOUNTANT');
 const externalReady=detail&&['APPROVED','PAID'].includes(detail.run.status);
 const editable=detail&&['DRAFT','REJECTED'].includes(detail.run.status);
 return <section className="chris-transport-payroll" style={{padding:24,maxWidth:1700,minWidth:0,width:'100%',boxSizing:'border-box',margin:'0 auto'}}>
  <style>{`
   .chris-transport-payroll button,
   .chris-transport-payroll input[type="file"]::file-selector-button {
    border:1px solid var(--chris-border-gold);
    border-radius:9px;
    padding:9px 12px;
    background:var(--chris-input-bg);
    color:var(--chris-text-main);
    font:inherit;
    font-weight:700;
    cursor:pointer;
   }
   .chris-transport-payroll button[aria-pressed="true"],
   .chris-transport-payroll button.transport-primary {
    background:linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep));
    color:#07110c;
   }
   .chris-transport-payroll button:disabled,
   .chris-transport-payroll input[type="file"]:disabled::file-selector-button {
    opacity:.55;
    cursor:not-allowed;
   }
   .chris-transport-payroll button:focus-visible,
   .chris-transport-payroll input[type="file"]:focus-visible {
    outline:2px solid var(--chris-gold);
    outline-offset:2px;
   }
   .chris-transport-upload-controls {
    display:flex;
    align-items:center;
    flex-wrap:wrap;
    gap:10px;
   }
   .chris-transport-upload-controls label {
    display:flex;
    align-items:center;
    flex-wrap:wrap;
    gap:8px;
    min-width:0;
   }
   .chris-transport-upload-controls input {max-width:100%;}
   .chris-transport-payroll summary {cursor:pointer;font-weight:700;padding:8px 0;}
   .tsp-kpis {display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:12px 0;}
   .tsp-kpis > div {border:1px solid var(--chris-border-gold);border-radius:9px;padding:12px;}
   .tsp-kpis strong {display:block;font-size:1.25rem;}
   .tsp-register-scroll {max-height:65vh;overflow:auto;}
   .tsp-register-scroll th {position:sticky;top:0;background:var(--chris-input-bg);z-index:1;}
   .tsp-more {position:relative;}
   .tsp-more-menu {position:absolute;right:0;top:100%;z-index:10;min-width:220px;max-width:90vw;display:grid;gap:6px;padding:10px;border:1px solid var(--chris-border-gold);border-radius:9px;background:var(--chris-input-bg);box-shadow:0 6px 20px #0004;}
   .tsp-editor {position:fixed;inset:0 0 0 auto;z-index:1000;width:min(560px,100%);box-sizing:border-box;overflow:auto;padding:20px;background:var(--chris-input-bg);color:var(--chris-text-main);border:1px solid var(--chris-border-gold);box-shadow:-12px 0 40px #0006;}
   .tsp-editor label {display:block!important;margin:10px 0!important;}
   .tsp-editor input,.tsp-editor textarea {max-width:100%;box-sizing:border-box;}
  `}</style>
  <h1>Transport Support Pay</h1>
  {detail&&<div className="tsp-kpis"><div>Payroll period<strong>{String(detail.run.periodMonth).slice(0,7)}</strong></div><div>Status<strong>{detail.run.status.replaceAll('_',' ')}</strong></div><div>Register employees<strong>{registerRows.length}</strong></div><div>Net payable<strong>{money(detail.run.netTotal??detail.lines.reduce((sum,line)=>sum+Number(line.netPay||0),0))}</strong></div></div>}
  {state?.runs?.length>0&&<label>Payroll run <select value={detail?.run.id||''} disabled={busy||!!editor} onChange={e=>act(()=>open(e.target.value))}><option value="" disabled>Select run</option>{state.runs.map(r=><option key={r.id} value={r.id}>{String(r.periodMonth).slice(0,7)} · {r.status.replaceAll('_',' ')}</option>)}</select></label>}
  <nav aria-label="Transport Support workspace sections" style={{display:'flex',flexWrap:'wrap',gap:16,marginBlock:12}}>
   <button type="button" onClick={()=>showWorkspace('transport-register')} aria-pressed={workspace==='transport-register'}>TSP Register</button>
   {head&&<button type="button" disabled={!!editor} onClick={()=>showWorkspace('transport-export')} aria-pressed={workspace==='transport-export'}>Export Excel</button>}
   {detail&&head&&editable&&<button type="button" className="transport-primary" disabled={busy||!!editor||!ready} onClick={()=>showWorkspace('transport-run')}>Review &amp; Approve</button>}
   <div className="tsp-more"><button type="button" aria-expanded={moreOpen} onClick={()=>setMoreOpen(v=>!v)}>⋯ More Actions</button>{moreOpen&&<div className="tsp-more-menu"><button type="button" onClick={()=>{setMoreOpen(false);showWorkspace('transport-run');}}>Manage run / history</button>{head&&<button type="button" disabled={!!editor||busy} onClick={()=>navigate('/benefits/transport-support/preparation')}>Salary basis setup</button>}<button type="button" disabled={busy||!!editor} onClick={()=>{setMoreOpen(false);act(async()=>{await load();if(detail)await open(detail.run.id);await loadReadiness();});}}>Refresh register</button></div>}</div>
  </nav>
  {state&&!head&&<p role="note">Preparation, adjustments and export require the active Head HR payroll assignment for this account.</p>}
  <details><summary>Workflow guidance</summary><p><strong>Head HR prepares → approves → exports.</strong> Auditor → General Manager → Chief Accountant review, approval and payment processing take place externally using the exported register.</p>
  <p>Actual payment confirmation remains separate. An export does not confirm external approval or payment.</p>
  <p role="note">Benefit inputs and payments do not update regular salary rates, payroll runs, payslips, statutory deductions or loan recoveries.</p></details>
  {error&&<p role="alert" style={{color:'#fca5a5'}}>{error}</p>}{message&&<p role="status">{message}</p>}
  {!ready&&<p>Benefit processing is locked pending verified deployment. Existing records remain available for review.</p>}
  {canPay&&<button type="button" className="transport-primary" onClick={()=>{showWorkspace('transport-run');document.getElementById('transport-payment-confirmation')?.scrollIntoView({behavior:'smooth',block:'start'});}}>Mark TSP as Paid · Record Actual Payments</button>}
  <section id="transport-run" aria-label="Monthly Run" hidden={workspace!=='transport-run'}>
  <details><summary>Prepare a monthly run</summary>
  <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
   {head&&<button onClick={()=>navigate('/benefits/transport-support/preparation')}>Salary Basis Setup / Bulk Upload</button>}
   <button disabled={busy} onClick={()=>act(async()=>{await load();await loadReadiness();})}>Refresh</button>
   {head&&<><label>Benefit month <input type="month" value={periodMonth} onChange={e=>setMonth(e.target.value)}/></label>
    {!state?.settings?.enabled&&<button disabled={busy||!ready||!periodMonth||!basisReadiness?.canActivate} onClick={()=>act(async()=>{await apiRequest(`${api}/activate`,{method:'POST',body:{periodMonth}});await load();setMessage('Transport Support Benefits enabled. Regular salary rates and payroll were not changed.');})}>Enable Transport Support Benefits for this month</button>}
    <button className="transport-primary" disabled={busy||!!editor||!ready||!periodMonth||!state?.settings?.enabled} onClick={()=>act(async()=>{const r=await apiRequest(`${api}/runs`,{method:'POST',body:{periodMonth}});await load();await open(r.data.runId);})}>Prepare Monthly Draft</button>
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
  </details>
  {detail&&<>
   <h2>Manage selected run</h2>
   {head&&<section aria-label="Employee adjustments" style={workflowPanel}><h3>1. Employee Adjustments</h3>
   {!editable&&<p>Adjustments are available while this run is in draft preparation.</p>}

   {head&&editable&&<>
    <button disabled={busy||!!editor||!ready||!detail.lines.length} onClick={()=>editLine('')}>Enter Employee Adjustments</button>
   </>}
   {editable&&!editor&&<details key={detail.run.id} style={workflowPanel}>
    <summary>Bulk upload overtime &amp; public holiday days</summary>
    <p>Use the template for this Transport Support draft. Enter each employee's total days worked. Blank cells keep existing day counts. Enter zero to clear a count. Preview recalculates both worked-day amounts and shows the new Net before import.</p>
    <div className="chris-transport-upload-controls">
    <button type="button" disabled={busy} onClick={downloadWorkedTemplate}>Download Worked-Day Template (CSV)</button>
    <label>Worked-day file <input type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e=>{setWorkedFile(e.target.files?.[0]||null);setWorkedPreview(null);}}/></label>
    <button type="button" disabled={busy||!ready||!workedFile} onClick={()=>act(()=>uploadWorkedDays(false))}>Preview Worked Days</button>
    </div>
    {workedPreview&&<>
     <p>{workedPreview.rows.length} employee(s) ready to import.</p>
     <div style={{overflowX:'auto'}}><table><thead><tr>{['Employee No','Employee','Extra days','Public holiday days','Overtime pay','Public holiday pay','Previous Net','New Net'].map(label=><th key={label}>{label}</th>)}</tr></thead>
     <tbody>{workedPreview.rows.map(row=><tr key={row.employeeNumber}>{[row.employeeNumber,row.employeeName,row.extraDays,row.phDays,money(row.overtimePay),money(row.publicHolidayPay),money(row.previousNet),money(row.netPay)].map((value,index)=><td key={index}>{value}</td>)}</tr>)}</tbody></table></div>
     <label>Import reason <textarea value={workedReason} maxLength={1000} disabled={busy} onChange={e=>setWorkedReason(e.target.value)}/></label>
     <button className="transport-primary" type="button" disabled={busy||!ready||!workedReason.trim()} onClick={()=>act(()=>uploadWorkedDays(true))}>Confirm Worked-Day Import</button>
    </>}
   </details>}
   {editor&&<p role="status">Save or cancel input changes before approving or exporting.</p>}
   </section>}
   {(canPay||(actions[detail.run.status]||[]).some(a=>roles.includes(a[2])))&&<section aria-label="Approval or payment notes" style={workflowPanel}><h3>2. {canPay?'Payment Confirmation':'Head HR Approval'}</h3>
   <label>{canPay?'Payment batch reference':'Approval / return reason (required)'} <textarea style={{display:'block',width:'100%'}} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   {(actions[detail.run.status]||[]).filter(a=>roles.includes(a[2])).map(a=><button className="transport-primary" key={a[0]} disabled={busy||!!editor||!ready||!notes.trim()} onClick={()=>act(()=>action(a[0]))}>{a[1]}</button>)}
   </section>}
  </>}
  </section>
   <section hidden={workspace!=='transport-export'} id="transport-export" aria-label="Excel Export Portal" style={workflowPanel}><h2>Excel Export Portal</h2>
   {!state?<p>{error?'The workspace could not load. Use Refresh in Monthly Run to retry.':'Loading export permissions…'}</p>:!head?<p>The assigned Head HR can export the register.</p>:!detail?<p>Prepare or open a run in <button type="button" onClick={()=>showWorkspace("transport-run")}>Monthly Run</button> to select columns and download Excel.</p>:<><details><summary>Choose export columns</summary>
    <button type="button" onClick={()=>setExportColumns(detail.register.headers.map((_,i)=>i))}>Select all</button> <button type="button" onClick={()=>setExportColumns([])}>Clear selection</button>
    <div style={{display:'flex',gap:14,flexWrap:'wrap',margin:12}}>{detail.register.headers.map((label,index)=><label key={label}><input type="checkbox" checked={exportColumns.includes(index)} onChange={e=>setExportColumns(c=>e.target.checked?[...c,index]:c.filter(i=>i!==index))}/>{label}</label>)}</div>
    <p>The master roll is ordered Abuja, Lagos, Port Harcourt. Each branch also has its own sheet. Only checked columns are included in register sheets.</p>
   </details>
   <button disabled={busy||!!editor||!exportColumns.length} onClick={()=>act(async()=>saveDownloadedBlob(await apiDownload(`${api}/runs/${detail.run.id}/export?columns=${encodeURIComponent(JSON.stringify(exportColumns))}`)))}>Export Review Register (Excel)</button>
    <button className="transport-primary" disabled={!externalReady||busy||!!editor||!exportColumns.length} onClick={()=>act(async()=>saveDownloadedBlob(await apiDownload(`${api}/runs/${detail.run.id}/export?stage=external&columns=${encodeURIComponent(JSON.stringify(exportColumns))}`)))}>Export Approved Register (Excel)</button>
   {!externalReady&&<p>Approve this run to enable the external register export.</p>}</>}
   </section>
   <section id="transport-register" aria-label="Full Register" hidden={workspace!=='transport-register'}>
   <h2>Full Monthly Register{registerHeaders.length>0&&` · ${registerHeaders.length} columns`}</h2>
   {!detail&&<p>Prepare or open a run in <button type="button" onClick={()=>showWorkspace("transport-run")}>Monthly Run</button> to populate employee rows.</p>}
   {registerHeaders.length>0&&<details><summary>All register columns</summary><ul style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,180px),1fr))',gap:8}}>{registerHeaders.map(label=><li key={label}>{label}</li>)}</ul></details>}
   {detail&&<div style={{display:'flex',gap:12,flexWrap:'wrap',marginBlock:12}}>
    <label>Employee <input type="search" placeholder="Name or employee number" value={employeeQuery} onChange={event=>setEmployeeQuery(event.target.value)}/></label>
    <details><summary>Filters</summary>{filterColumns.map(([index,label])=><label key={index}>{label} <select value={registerFilters[index]||''} onChange={event=>setRegisterFilters(current=>({...current,[index]:event.target.value}))}>
     <option value="">All</option>
     {[...new Set(registerRows.map(row=>row[index]).filter(Boolean))].sort().map(value=><option key={value}>{value}</option>)}
    </select></label>)}</details>
    <span role="status">{filteredRows.length} of {registerRows.length} employees</span>
   </div>}
   {detail&&!filteredRows.length&&<p>No employees match the current filters.</p>}
   <p>Scroll horizontally to see all columns. Export selections apply only to the Excel file.</p>
   <div role="region" aria-label="Full monthly Transport Support register" tabIndex={0} className="tsp-register-scroll" style={{maxWidth:'100%'}}><table style={{width:'100%',minWidth:2200,textAlign:'left'}}>
    <thead><tr>{registerHeaders.map(h=><th key={h} style={{padding:8}}>{h}</th>)}{head&&editable&&<th>Action</th>}</tr></thead>
    <tbody>{filteredRows.map(row=><tr key={row[2]}>{row.map((value,col)=><td key={col} style={{padding:8,borderBottom:'1px solid #385548',whiteSpace:registerHeaders[col]==='AccountNO'?'nowrap':undefined}}>{moneyColumns.has(registerHeaders[col])&&value!==''?money(value):value}</td>)}{head&&editable&&<td><button type="button" disabled={busy||!ready||!!editor||!detail.lines.some(l=>l.snapshot.employeeNumber===row[2])} onClick={()=>{const line=detail.lines.find(l=>l.snapshot.employeeNumber===row[2]);if(line){editLine(line.id);}}}>Edit</button></td>}</tr>)}</tbody>
   </table></div>
   </section>
  <section aria-label="Payment confirmation and audit history" hidden={workspace!=='transport-run'}>
  {detail&&<>
   <p>Previous Month Outstanding is a separately entered addition to Net and must not duplicate Short Payment or ledger arrears. Previous Month Overpayment shows the opening balance. Recovery is capped at available benefits; the remainder carries forward. End of the Month is a salary reference and is excluded from this benefit Net.</p>
   {canPay&&<>
    <h3 id="transport-payment-confirmation">Mark TSP as Paid Manually · Actual payment confirmation</h3>
    <p>After the external approval and payout process, record the actual payment and reference for every employee. Enter zero with a reason for a missed payment.</p>
    <div style={{overflowX:'auto'}}><table><thead><tr><th>Employee</th><th>Actual Paid</th><th>Payment Reference / Nonpayment Reason</th></tr></thead><tbody>
     {detail.lines.map(l=><tr key={l.id}><td>{l.snapshot.employeeNumber} · {l.snapshot.employeeName}</td><td><input aria-label={`Actual paid ${l.snapshot.employeeNumber}`} type="number" min="0" step="0.01" value={receipts[l.id]?.actualPaid??''} onChange={e=>setReceipts(s=>({...s,[l.id]:{...s[l.id],actualPaid:e.target.value}}))}/></td><td><input aria-label={`Payment reference ${l.snapshot.employeeNumber}`} value={receipts[l.id]?.reference||''} onChange={e=>setReceipts(s=>({...s,[l.id]:{...s[l.id],reference:e.target.value}}))}/></td></tr>)}
    </tbody></table></div>
    <button disabled={busy||!notes.trim()} onClick={()=>setReceipts(Object.fromEntries(detail.lines.map(l=>[l.id,{actualPaid:String(l.netPay),reference:notes.trim()}])))}>Enter all approved amounts as paid</button>
    <button disabled={busy||!notes.trim()} onClick={()=>setReceipts(Object.fromEntries(detail.lines.map(l=>[l.id,{actualPaid:'0',reference:notes.trim()}])))}>Enter zero for all payments</button>
    <button disabled={busy||!ready||!notes.trim()} onClick={()=>act(()=>action('CONFIRM_PAYMENT'))}>Confirm actual payments &amp; carry balances forward</button>
   </>}
   <details><summary>Audit history</summary>{detail.events.map((e,i)=><p key={i}>{e.action.replaceAll('_',' ')} · {e.notes} · {new Date(e.createdAt).toLocaleString('en-NG',{timeZone:'Africa/Lagos'})}</p>)}</details>
  </>}
  </section>
  {head&&editable&&editor&&<fieldset className="tsp-editor" aria-label="Employee adjustments">
     <legend>Edit Transport Support · Days, Pay and Prior-month Corrections</legend>
     <EmployeeSearchSelect label="Transport benefit employee" options={employeeOptions} value={detail.lines.find(l=>l.id===editor.lineId)?.snapshot.employeeNumber||''} disabled={busy} onChange={number=>{const line=detail.lines.find(l=>l.snapshot.employeeNumber===number);if(line)editLine(line.id);else setEditor(current=>({...current,lineId:''}));}} placeholder="Search employee name or number" />
     {[['extraDays','No Of Extra Day(S)'],['phDays','No Of Ph Day(S)'],['bonus','Bonus'],['previousShortPayment','Previous Month Short Payment (+)'],['previousMonthOutstanding','Previous Month Outstanding (+)'],['previousOverpayment','Previous Month Overpayment (−)']].map(([key,label])=><label key={key} style={{display:'inline-block',margin:8}}>{label}<input type="number" min="0" step={key.endsWith('Days')?'0.0001':'0.01'} value={editor.inputs[key]} disabled={busy} onChange={e=>setEditor(current=>({...current,inputs:{...current.inputs,[key]:e.target.value}}))}/></label>)}
     <details><summary>Calculation guidance</summary><p>Extra-day overtime and public holiday pay are calculated from End of the Month gross ÷ 26 × days worked, at 1.5× and 2× respectively. Saving replaces any previously entered combined amount. Previous Month Short Payment and Overpayment default to the transport ledger; enter a corrected total, including zero, with a reason, or leave blank to use the ledger. Previous Month Outstanding is a separate manually entered addition to Net (default zero). Do not enter an amount already included in Short Payment or the ledger; corrections are audited. Saving recalculates Net immediately. Corrections are audited and remaining overpayment carries forward once after actual payment confirmation.</p></details>
     <label>TSP last payable day (inclusive) <input type="date" value={editor.inputs.lastPayableDate} disabled={busy} onChange={e=>setEditor(current=>({...current,inputs:{...current.inputs,lastPayableDate:e.target.value}}))}/></label>
     <label>Adjustment reason (required) <textarea style={{display:'block',width:'100%'}} value={adjustmentReason} onChange={e=>setAdjustmentReason(e.target.value)}/></label>
     <button className="transport-primary" disabled={busy||!ready||!adjustmentReason.trim()||!editor.lineId} onClick={()=>act(async()=>{await apiRequest(`${api}/runs/${detail.run.id}/lines/${editor.lineId}/benefit-inputs`,{method:'PATCH',body:{inputs:editor.inputs,notes:adjustmentReason}});await load();await open(detail.run.id);setMessage('Benefit inputs saved and Net updated.');})}>Save Adjustments &amp; Recalculate Net</button>
     <button disabled={busy} onClick={()=>setEditor(null)}>Cancel Input Changes</button>
    </fieldset>}
 </section>;
}


