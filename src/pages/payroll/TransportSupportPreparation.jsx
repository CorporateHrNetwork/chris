import { useEffect, useState } from 'react';
import { apiDownload, apiRequest, saveDownloadedBlob } from '../../services/api';
import { useNavigate } from 'react-router-dom';
const endpoint='/api/payroll/full-salary-preparation';
const money=v=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(v||0));
export default function TransportSupportPreparation() {
  const navigate=useNavigate();
  const [file,setFile]=useState(null),[preview,setPreview]=useState(null),[records,setRecords]=useState([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [enabled,setEnabled]=useState(false);
  const [staff,setStaff]=useState([]),[individual,setIndividual]=useState(null),[individualPreview,setIndividualPreview]=useState(null);
  const emptyIndividual={employeeNumber:'',amount:'',effectiveFrom:'',reason:'',preparationId:null};
  async function load() {
    const response=await apiRequest(endpoint);
    setRecords(response.data||[]); setEnabled(response.preparationEnabled===true);
  }
  useEffect(()=>{Promise.all([load(),apiRequest(`${endpoint}/employees`).then(r=>setStaff(r.data||[]))]).catch(e=>setError(e.message||'Unable to open salary preparation.'));},[]);
  function editIndividual(row) {
    setIndividual({employeeNumber:row.employeeNumber,amount:row.fullMonthlyGross??row.amount??'',effectiveFrom:row.effectiveFrom?String(row.effectiveFrom).slice(0,10):'',reason:row.reason||'',preparationId:row.id||null});
    setIndividualPreview(null);setError('');setMessage('');
  }
  function updateIndividual(key,value){setIndividual(s=>({...s,[key]:value}));setIndividualPreview(null);}
  async function act(fn) {
    setBusy(true);setError('');setMessage('');
    try {await fn();} catch(e){setError(e.message||'Unable to complete this operation.');} finally{setBusy(false);}
  }
  async function send(path) {
    if(!file) throw new Error('Select your completed full-salary template.');
    const body=new FormData();body.append('file',file);
    if(preview?.previewToken) body.append('previewToken',preview.previewToken);
    return apiRequest(`${endpoint}/${path}`,{method:'POST',body});
  }
  return <section style={{padding:24,maxWidth:1400,margin:'0 auto'}}>
    <h1>Transport Support Pay · Full Salary Preparation</h1>
    <button onClick={()=>navigate('/payroll/transport-support')}>Open Transport Support Pay portal</button>
    <p>Upload the full agreed monthly salary once. CHRiS previews the mid-month and end-of-month allocations using each employee’s recorded employment type and hire date.</p>
    <p><strong>Preparation only:</strong> importing records does not activate payroll or change approved salaries. Mid-month loan recovery is always zero.</p>
    <p>1. Download template → 2. Enter full salaries and effective month → 3. Preview allocations → 4. Import for review.</p>
    <p>For an individual correction, select an employee below or use <strong>Correct salary</strong> beside their preview or prepared record. Activated salaries use <button type="button" onClick={()=>navigate('/payroll?workspace=rates')}>Salary Rates</button> for effective-dated reviews.</p>
    {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
    {message&&<p role="status">{message}</p>}
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
      <button disabled={busy} onClick={()=>act(async()=>saveDownloadedBlob(await apiDownload(`${endpoint}/template`)))}>Download full salary template</button>
      <label>Completed template <input type="file" accept=".xlsx,.xls" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null);setError('');setMessage('');}}/></label>
      <button disabled={busy||!file} onClick={()=>act(async()=>{setPreview(null);const r=await send('preview');setPreview(r.data);})}>Preview salary allocations</button>
      <button disabled={busy||!enabled||!preview||preview.invalidRows>0} onClick={()=>act(async()=>{const r=await send('import');setMessage(r.message);setPreview(null);await load();})}>Import for review</button>
    </div>
    {!enabled&&<p>Import activation is awaiting deployment verification. You can generate the template and preview allocations.</p>}
    <h2>Individual full salary</h2>
    {!individual?<button type="button" disabled={busy} onClick={()=>{setIndividual({...emptyIndividual});setIndividualPreview(null);}}>Add / correct individual salary</button>:<div style={{border:'1px solid #65776b',padding:16,marginBlock:12}}>
      <label>Employee <select aria-label="Individual salary employee" disabled={busy||!!individual.preparationId} value={individual.employeeNumber} onChange={e=>updateIndividual('employeeNumber',e.target.value)}><option value="">Choose employee</option>{staff.map(e=><option key={e.employeeNumber} value={e.employeeNumber}>{e.employeeNumber} · {e.employeeName} · {e.branch}</option>)}</select></label>
      <label> Full agreed monthly salary (NGN) <input aria-label="Individual full monthly salary" type="number" min="0.01" step="0.01" disabled={busy} value={individual.amount} onChange={e=>updateIndividual('amount',e.target.value)}/></label>
      <label> Effective payroll month <input aria-label="Individual salary effective month" type="month" disabled={busy||!!individual.preparationId} value={individual.effectiveFrom.slice(0,7)} onChange={e=>updateIndividual('effectiveFrom',e.target.value?`${e.target.value}-01`:'')}/></label>
      <label style={{display:'block',marginBlock:12}}>Correction / preparation reason <textarea aria-label="Individual salary correction reason" disabled={busy} maxLength={1000} value={individual.reason} onChange={e=>updateIndividual('reason',e.target.value)}/></label>
      <button type="button" disabled={busy||!individual.employeeNumber||!individual.amount||!individual.effectiveFrom||!individual.reason.trim()} onClick={()=>act(async()=>{setIndividualPreview(null);const r=await apiRequest(`${endpoint}/individual/preview`,{method:'POST',body:individual});setIndividualPreview(r.data);})}>Preview individual allocation</button>
      <button type="button" disabled={busy||!enabled||!individualPreview} onClick={()=>act(async()=>{const r=await apiRequest(`${endpoint}/individual`,{method:'POST',body:{...individual,previewToken:individualPreview.previewToken}});setMessage(r.message);setIndividual(null);setIndividualPreview(null);setPreview(null);await load();})}>Save individual salary for review</button>
      <button type="button" disabled={busy} onClick={()=>{setIndividual(null);setIndividualPreview(null);}}>Cancel correction</button>
      {individualPreview&&<p role="status">{individualPreview.row.employeeNumber} · {individualPreview.row.employeeName} · {individualPreview.row.branch} — Full salary {money(individualPreview.row.amount)}; normal mid-month {money(individualPreview.row.allocation.normalMidMonth)}; eligible mid-month {money(individualPreview.row.allocation.midMonthPayable)}; end-month gross {money(individualPreview.row.allocation.endMonthGross)}. Saving prepares this record only.</p>}
    </div>}
    {preview&&<>
      <h2>Allocation preview</h2><p>{preview.validRows} valid · {preview.invalidRows} requiring correction. Unworked days before a new hire’s resumption are not unpaid arrears.</p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}>
        <thead><tr>{['Employee No','Employee Name','Branch','Employment Type','Full Salary','Mid-month %','Normal Mid-month','Eligible Days / 15','Mid-month Payable','End-month Gross','Loan Recovery','Validation','Correction'].map(h=><th key={h} style={{padding:8}}>{h}</th>)}</tr></thead>
        <tbody>{preview.rows.map(row=><tr key={row.rowNumber}>
          {[row.employeeNumber,row.employeeName,row.branch||'Unassigned',row.employmentType,row.amount==null?'—':money(row.amount),row.allocation?.midMonthPercentage??'—',row.allocation?money(row.allocation.normalMidMonth):'—',row.allocation?.eligibleDays??'—',row.allocation?money(row.allocation.midMonthPayable):'—',row.allocation?money(row.allocation.endMonthGross):'—',money(0),row.valid?'Ready':row.errors.join('; ')].map((v,i)=><td key={i} style={{padding:8,borderBottom:'1px solid #ddd'}}>{v}</td>)}
          <td><button type="button" disabled={busy||!row.employeeId} onClick={()=>editIndividual(row)}>Correct salary</button></td>
        </tr>)}</tbody>
      </table></div>
    </>}
    <h2>Imported full salaries awaiting activation</h2>
    {!records.length?<p>No prepared salary records.</p>:<div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}>
      <thead><tr>{['Employee No','Employee Name','Branch','Full Salary','Mid-month','End-month','Effective From','Status','Action'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{records.map(r=><tr key={r.id}><td>{r.employeeNumber}</td><td>{r.employeeName}</td><td>{r.branch||'Unassigned'}</td><td>{money(r.fullMonthlyGross)}</td><td>{money(r.allocationPreview?.normalMidMonth)}</td><td>{money(r.allocationPreview?.endMonthGross)}</td><td>{String(r.effectiveFrom).slice(0,10)}</td><td>{r.activatedAt?'Activated':'Pending activation'}</td><td>{r.activatedAt?<button onClick={()=>navigate('/payroll?workspace=rates')}>Manage in Salary Rates</button>:<button disabled={busy} onClick={()=>editIndividual(r)}>Correct salary</button>}</td></tr>)}</tbody>
    </table></div>}
    <p>Previous unpaid amounts will be added on the following month’s 15th; previous overpaid amounts will be deducted in a separate column. They are reconciliations, not changes to the agreed full salary.</p>
  </section>;
}

