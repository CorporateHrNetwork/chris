import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {apiRequest,apiDownload,saveDownloadedBlob} from '../../services/api';
const api='/api/payroll/transport-support';
const money=v=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(v||0));
const actions={DRAFT:[['SUBMIT','Submit to Payroll Auditor','HEAD_HR']],REJECTED:[['SUBMIT','Resubmit to Payroll Auditor','HEAD_HR']],AUDIT_REVIEW:[['AUDIT_APPROVE','Confirm audit → General Manager','PAYROLL_AUDITOR'],['AUDIT_REJECT','Return to Head HR','PAYROLL_AUDITOR']],GM_APPROVAL:[['GM_APPROVE','Approve for payout','GENERAL_MANAGER'],['GM_REJECT','Return to Head HR','GENERAL_MANAGER']]};
export default function TransportSupportPayroll() {
 const navigate=useNavigate();
 const [state,setState]=useState(null),[detail,setDetail]=useState(null),[periodMonth,setMonth]=useState(''),[notes,setNotes]=useState('');
 const [receipts,setReceipts]=useState({}),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const roles=state?.responsibilities||[],head=roles.includes('HEAD_HR'),ready=state?.releaseReady===true;
 async function load(){const r=await apiRequest(api);setState(r.data);}
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 async function open(id){const r=await apiRequest(`${api}/runs/${id}`);setDetail(r.data);setReceipts(Object.fromEntries(r.data.lines.map(l=>[l.id,{actualPaid:l.actualPaid??'',reference:l.paymentReference||''}])));setNotes('');}
 async function act(fn){setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e.message||'Unable to complete payroll operation.');}finally{setBusy(false);}}
 async function action(actionName){await apiRequest(`${api}/runs/${detail.run.id}/action`,{method:'POST',body:{action:actionName,notes,payments:actionName==='CONFIRM_PAYMENT'?detail.lines.map(l=>({lineId:l.id,...receipts[l.id]})):undefined}});await load();await open(detail.run.id);setMessage('Payroll action recorded.');}
 const canPay=detail?.run.status==='APPROVED'&&roles.includes('CHIEF_ACCOUNTANT');
 return <section style={{padding:24,maxWidth:1500,margin:'0 auto'}}>
  <h1>Transport Support Pay</h1>
  <p>Separate mid-month payroll · payment date: the 15th · loan recovery: <strong>₦0.00</strong></p>
  <p>Uses the assignees configured for regular Zermatt payroll: Head HR → Payroll Auditor → General Manager → Chief Accountant.</p>
  {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{message&&<p role="status">{message}</p>}
  {!ready&&<p>Payroll changes are locked pending verified deployment. Existing records remain available for review.</p>}
  <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
   {head&&<button onClick={()=>navigate('/payroll/full-salary-upload')}>Full salary template &amp; bulk upload</button>}
   <button disabled={busy} onClick={()=>act(load)}>Refresh</button>
   {head&&<><label>Payroll month <input type="month" value={periodMonth} onChange={e=>setMonth(e.target.value)}/></label>
    {!state?.settings?.enabled&&<button disabled={busy||!ready||!periodMonth} onClick={()=>act(async()=>{await apiRequest(`${api}/activate`,{method:'POST',body:{periodMonth}});await load();setMessage('Full salaries activated for the selected month. Historical approved payroll is preserved.');})}>Activate reviewed full salaries for this month</button>}
    <button disabled={busy||!ready||!periodMonth||!state?.settings?.enabled} onClick={()=>act(async()=>{const r=await apiRequest(`${api}/runs`,{method:'POST',body:{periodMonth}});await load();await open(r.data.runId);})}>Generate / recalculate draft</button>
   </>}
  </div>
  <h2>Mid-month payroll runs</h2>
  {!state?.runs?.length?<p>No mid-month runs yet.</p>:<div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{state.runs.map(r=><button key={r.id} disabled={busy} onClick={()=>act(()=>open(r.id))}>{String(r.periodMonth).slice(0,7)} · {r.status.replaceAll('_',' ')} · {money(r.netTotal)}</button>)}</div>}
  {detail&&<>
   <h2>{String(detail.run.periodMonth).slice(0,7)} · {detail.run.status.replaceAll('_',' ')}</h2>
   <button disabled={busy} onClick={()=>act(async()=>saveDownloadedBlob(await apiDownload(`${api}/runs/${detail.run.id}/export`)))}>Download review register</button>{['APPROVED','PAID'].includes(detail.run.status)&&<button disabled={busy} onClick={()=>act(async()=>saveDownloadedBlob(await apiDownload(`${api}/runs/${detail.run.id}/export?stage=payout`)))}>Download approved payout register</button>}
   <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr>{['Employee','Full Salary','Current Support','Previous Unpaid','Previous Overpaid','Deducted Now','Net Pay',...(canPay?['Actual Paid','Payment Reference / Nonpayment Reason']:['Actual Paid'])].map(h=><th key={h} style={{padding:8}}>{h}</th>)}</tr></thead>
    <tbody>{detail.lines.map(l=><tr key={l.id}>{[`${l.snapshot.employeeNumber} · ${l.snapshot.employeeName}`,money(l.snapshot.fullMonthlyGross),money(l.snapshot.currentEntitlement),money(l.snapshot.previousUnpaid),money(l.snapshot.previousOverpaid),money(l.snapshot.overpaidDeduction),money(l.netPay)].map((v,i)=><td key={i} style={{padding:8,borderBottom:'1px solid #ddd'}}>{v}</td>)}
     {canPay?<><td><input aria-label={`Actual paid ${l.snapshot.employeeNumber}`} type="number" min="0" step="0.01" value={receipts[l.id]?.actualPaid??''} onChange={e=>setReceipts(s=>({...s,[l.id]:{...s[l.id],actualPaid:e.target.value}}))}/></td><td><input aria-label={`Payment reference ${l.snapshot.employeeNumber}`} value={receipts[l.id]?.reference||''} onChange={e=>setReceipts(s=>({...s,[l.id]:{...s[l.id],reference:e.target.value}}))}/></td></>:<td>{l.actualPaid==null?'Unconfirmed':money(l.actualPaid)}</td>}
    </tr>)}</tbody></table></div>
   <label>Review notes / payment batch reference <textarea style={{display:'block',width:'100%',minHeight:70}} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   {(actions[detail.run.status]||[]).filter(a=>roles.includes(a[2])).map(a=><button key={a[0]} disabled={busy||!ready||!notes.trim()} onClick={()=>act(()=>action(a[0]))}>{a[1]}</button>)}
   {canPay&&<>
    <p>Record the actual payment for every employee. Use zero and a reason for a missed payment. Confirmation creates previous unpaid/overpaid balances for the following month’s 15th and locks this run.</p>
    <button disabled={busy||!notes.trim()} onClick={()=>setReceipts(Object.fromEntries(detail.lines.map(l=>[l.id,{actualPaid:String(l.netPay),reference:notes.trim()}])))}>Enter all approved amounts as paid</button>
    <button disabled={busy||!notes.trim()} onClick={()=>setReceipts(Object.fromEntries(detail.lines.map(l=>[l.id,{actualPaid:'0',reference:notes.trim()}])))}>Enter zero for all payments</button>
    <button disabled={busy||!ready||!notes.trim()} onClick={()=>act(()=>action('CONFIRM_PAYMENT'))}>Confirm actual payments &amp; carry balances forward</button>
   </>}
   <h3>Audit history</h3>{detail.events.map((e,i)=><p key={i}>{e.action.replaceAll('_',' ')} · {e.notes} · {new Date(e.createdAt).toLocaleString('en-NG',{timeZone:'Africa/Lagos'})}</p>)}
  </>}
 </section>;
}

