import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import EmployeeSearchSelect from '../../components/EmployeeSearchSelect';
import { apiDownload, apiRequest, saveDownloadedBlob } from '../../services/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './TransportSupportPreparation.css';
const endpoint='/api/benefits/transport-support/preparation';
const money=v=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(v||0));
export default function TransportSupportPreparation() {
  const navigate=useNavigate();
  const [params]=useSearchParams();
  const requestedEmployee=params.get('employee')||'';
  const requestedMonth=params.get('month')||'';
  const [file,setFile]=useState(null),[preview,setPreview]=useState(null),[records,setRecords]=useState([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [toast,setToast]=useState(null);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),6000);return()=>clearTimeout(timer);},[toast]);
  const [enabled,setEnabled]=useState(false),[preparationStatus,setPreparationStatus]=useState('AWAITING_RELEASE');
  const [staff,setStaff]=useState([]),[individual,setIndividual]=useState(null),[individualPreview,setIndividualPreview]=useState(null);
  const emptyIndividual={employeeNumber:requestedEmployee,amount:'',effectiveFrom:/^\d{4}-\d{2}$/.test(requestedMonth)?`${requestedMonth}-01`:'',reason:'',preparationId:null};
  useEffect(()=>{if(requestedEmployee)setIndividual({...emptyIndividual});},[requestedEmployee,requestedMonth]);
  async function load() {
    const response=await apiRequest(endpoint);
    setRecords(response.data||[]); setEnabled(response.preparationEnabled===true);setPreparationStatus(response.preparationStatus||'READY');
  }
  useEffect(()=>{Promise.all([load(),apiRequest(`${endpoint}/employees`).then(r=>setStaff(r.data||[]))]).catch(e=>setError(e.message||'Unable to open salary preparation.'));},[]);
  function editIndividual(row) {
    setIndividual({employeeNumber:row.employeeNumber,amount:row.fullMonthlyGross??row.amount??'',effectiveFrom:row.effectiveFrom?String(row.effectiveFrom).slice(0,10):'',reason:row.reason||'',preparationId:row.id||null});
    setIndividualPreview(null);setError('');setMessage('');
  }
  function updateIndividual(key,value){setIndividual(s=>({...s,[key]:value}));setIndividualPreview(null);}
  async function act(fn) {
    setBusy(true);setError('');setMessage('');
    try {await fn();} catch(e){setError(e.message||'Unable to complete this operation.');setToast({kind:'error',title:'Operation could not be completed',body:e.message||'Please retry.'});} finally{setBusy(false);}
  }
  async function send(path) {
    if(!file) throw new Error('Select your completed full-salary template.');
    const body=new FormData();body.append('file',file);
    if(preview?.previewToken) body.append('previewToken',preview.previewToken);
    return apiRequest(`${endpoint}/${path}`,{method:'POST',body});
  }
  return <section className="chris-salary-basis" aria-label="Transport Support Pay salary basis setup">
    {toast&&createPortal(<aside role={toast.kind==='error'?'alert':'status'} style={{position:'fixed',top:96,right:16,zIndex:2147483000,width:'min(420px, calc(100vw - 32px))',boxSizing:'border-box',padding:18,borderRadius:12,background:'var(--chris-input-bg, #09251b)',color:'var(--chris-text-main, #fff)',border:`1px solid ${toast.kind==='error'?'#ef9a9a':'#c5a43b'}`,boxShadow:'0 8px 32px #0007'}}><button type="button" aria-label="Dismiss notification" onClick={()=>setToast(null)} style={{float:'right',background:'transparent',color:'inherit',border:0,fontSize:22,cursor:'pointer'}}>×</button><strong style={{display:'block',color:toast.kind==='error'?'#ef9a9a':'#70d89d'}}>{toast.title}</strong><p style={{margin:'8px 0 0'}}>{toast.body}</p></aside>,document.body)}
    <header className="sb-hero">
      <span className="sb-eyebrow">CHRiS · Benefits Management</span>
      <h1>Transport Support Pay</h1>
      <p className="sb-lead">Salary Basis Setup · Manage the full monthly salary references used to prepare Transport Support Pay allocations.</p>
      <button className="sb-primary" type="button" onClick={()=>navigate('/benefits/transport-support')}>Open Monthly Register &amp; Excel Export</button>
    </header>
    <section className="sb-card" aria-labelledby="sb-import-title">
      <div className="sb-card-header">
        <h2 id="sb-import-title">Bulk Salary Basis Preparation</h2>
        <p>Upload the full agreed monthly salary once. CHRiS previews the mid-month and end-of-month allocations using each employee’s employment type and hire date.</p>
      </div>
      <div className="sb-note" role="note">
        <p><strong>Preparation only:</strong> importing records does not activate payroll or change approved salaries. Mid-month loan recovery remains zero.</p>
        <p>Previously activated salaries are protected. Payments are managed separately in the Transport Support Benefits workspace.</p>
      </div>
      <ol className="sb-steps" aria-label="Salary basis import steps">
        <li>1 · Download template</li>
        <li>2 · Enter salary and month</li>
        <li>3 · Preview allocations</li>
        <li>4 · Import for review</li>
      </ol>
      {error&&<p role="alert" className="sb-alert">{error}</p>}
      {message&&<p role="status" className="sb-success">{message}</p>}
      <div className="sb-toolbar" style={{marginTop:16}}>
      <button className="sb-secondary" type="button" disabled={busy} onClick={()=>act(async()=>saveDownloadedBlob(await apiDownload(`${endpoint}/template`)))}>Download Full Salary Template</button>
      <label className="sb-file">Completed Template <input type="file" accept=".xlsx,.xls" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null);setError('');setMessage('');}}/></label>
      <button className="sb-primary" type="button" disabled={busy||!file} onClick={()=>act(async()=>{setPreview(null);const r=await send('preview');setPreview(r.data);})}>Preview Salary Allocations</button>
      <button className="sb-primary" type="button" disabled={busy||!enabled||!preview||preview.invalidRows>0} onClick={()=>act(async()=>{const r=await send('import');setMessage(r.message);setPreview(null);await load();})}>Import for Review</button>
    </div>
      {!enabled&&<p className="sb-status" role="note">{preparationStatus==='STORAGE_NOT_READY'?'Benefit storage needs verification before imports. Contact support; preview remains available.':'Benefit imports are awaiting release verification. Preview remains available.'}</p>}
    </section>
    <section className="sb-card" aria-labelledby="sb-individual-title">
      <div className="sb-card-header">
        <h2 id="sb-individual-title">Individual Full Salary</h2>
        <p>Search for an employee to prepare or correct a benefit salary basis. Existing payroll salary rates are not changed here.</p>
      </div>
    {!individual?<button className="sb-secondary" type="button" disabled={busy} onClick={()=>{setIndividual({...emptyIndividual});setIndividualPreview(null);}}>Add / Correct Individual Salary</button>:<div className="sb-note" style={{marginBlock:12}}><div className="sb-form-grid">
      <EmployeeSearchSelect label="Individual salary employee" options={staff} disabled={busy||!!individual.preparationId} value={individual.employeeNumber} onChange={value=>updateIndividual('employeeNumber',value)} placeholder="Search employee name or number" />
      <label> Full agreed monthly salary (NGN) <input aria-label="Individual full monthly salary" type="number" min="0.01" step="0.01" disabled={busy} value={individual.amount} onChange={e=>updateIndividual('amount',e.target.value)}/></label>
      <label> Effective benefit month <input aria-label="Individual salary effective month" type="month" disabled={busy||!!individual.preparationId} value={individual.effectiveFrom.slice(0,7)} onChange={e=>updateIndividual('effectiveFrom',e.target.value?`${e.target.value}-01`:'')}/></label>
      <label>Correction / preparation reason <textarea aria-label="Individual salary correction reason" disabled={busy} maxLength={1000} value={individual.reason} onChange={e=>updateIndividual('reason',e.target.value)}/></label>
      </div><div className="sb-toolbar">
      <button className="sb-secondary" type="button" disabled={busy||!individual.employeeNumber||!individual.amount||!individual.effectiveFrom||!individual.reason.trim()} onClick={()=>act(async()=>{setIndividualPreview(null);const r=await apiRequest(`${endpoint}/individual/preview`,{method:'POST',body:individual});setIndividualPreview(r.data);})}>Preview individual allocation</button>
      <button className="sb-primary" type="button" disabled={busy||!enabled||!individualPreview} onClick={()=>act(async()=>{const r=await apiRequest(`${endpoint}/individual`,{method:'POST',body:{...individual,previewToken:individualPreview.previewToken}});setMessage(r.message||'Salary basis saved.');setToast({kind:'success',title:'Salary successfully saved',body:`${individual.employeeNumber} — ${staff.find(e=>e.employeeNumber===individual.employeeNumber)?.employeeName||'Employee'} · ${money(individual.amount)}. Regenerate the affected TSP draft to reflect this correction.`});setIndividual(null);setIndividualPreview(null);setPreview(null);await load();})}>Save individual salary for review</button>
      <button className="sb-quiet" type="button" disabled={busy} onClick={()=>{setIndividual(null);setIndividualPreview(null);}}>Cancel correction</button>
      </div>
      {individualPreview&&<p role="status">{individualPreview.row.employeeNumber} · {individualPreview.row.employeeName} · {individualPreview.row.branch} — Reference gross {money(individualPreview.row.amount)}; normal mid-month {money(individualPreview.row.allocation.normalMidMonth)}; eligible mid-month {money(individualPreview.row.allocation.midMonthPayable)}. Saving prepares this record only.</p>}
    </div>}
    </section>
    {preview&&<section className="sb-card" aria-labelledby="sb-preview-title">
      <h2 id="sb-preview-title">Allocation Preview</h2><p>{preview.validRows} valid · {preview.invalidRows} requiring correction. Unworked days before a new hire’s resumption are not unpaid arrears.</p>
      <div className="sb-table-scroll"><table>
        <thead><tr>{['Employee No','Employee Name','Branch','Employment Type','Reference Gross','Mid-month %','Normal Mid-month','Eligible Days / 15','Mid-month Payable','Validation','Correction'].map(h=><th key={h} style={{padding:8}}>{h}</th>)}</tr></thead>
        <tbody>{preview.rows.map(row=><tr key={row.rowNumber}>
          {[row.employeeNumber,row.employeeName,row.branch||'Unassigned',row.employmentType,row.amount==null?'—':money(row.amount),row.allocation?.midMonthPercentage??'—',row.allocation?money(row.allocation.normalMidMonth):'—',row.allocation?.eligibleDays??'—',row.allocation?money(row.allocation.midMonthPayable):'—',row.valid?'Ready':row.errors.join('; ')].map((v,i)=><td key={i} style={{padding:8,borderBottom:'1px solid #ddd'}}>{v}</td>)}
          <td><button type="button" disabled={busy||!row.employeeId} onClick={()=>editIndividual(row)}>Correct benefit basis</button></td>
        </tr>)}</tbody>
      </table></div>
    </section>}
    <section className="sb-card" aria-labelledby="sb-saved-title">
    <div className="sb-card-header"><h2 id="sb-saved-title">Saved Transport Benefit Calculation Bases</h2><p>Prepared records can be reviewed and corrected before activation.</p></div>
    {!records.length?<p>No prepared salary records.</p>:<div className="sb-table-scroll"><table>
      <thead><tr>{['Employee No','Employee Name','Branch','Reference Gross','Mid-month','Effective From','Status','Action'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{records.map(r=><tr key={r.id}><td>{r.employeeNumber}</td><td>{r.employeeName}</td><td>{r.branch||'Unassigned'}</td><td>{money(r.fullMonthlyGross)}</td><td>{money(r.allocationPreview?.normalMidMonth)}</td><td>{String(r.effectiveFrom).slice(0,10)}</td><td>{r.activatedAt?'Legacy salary-linked record':'Benefit basis saved'}</td><td>{r.activatedAt?<button onClick={()=>navigate('/benefits/transport-support')}>Open Benefits register</button>:<button disabled={busy} onClick={()=>editIndividual(r)}>Correct benefit basis</button>}</td></tr>)}</tbody>
    </table></div>}
    <p className="sb-subtle">Previous unpaid amounts will be added on the following month’s 15th; previous overpaid amounts will be deducted in a separate column. They are reconciliations, not changes to the agreed full salary.</p>
    </section>
  </section>;
}



