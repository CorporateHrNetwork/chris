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
  async function load() {
    const response=await apiRequest(endpoint);
    setRecords(response.data||[]); setEnabled(response.preparationEnabled===true);
  }
  useEffect(()=>{load().catch(e=>setError(e.message||'Unable to open salary preparation.'));},[]);
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
    {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
    {message&&<p role="status">{message}</p>}
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
      <button disabled={busy} onClick={()=>act(async()=>saveDownloadedBlob(await apiDownload(`${endpoint}/template`)))}>Download full salary template</button>
      <label>Completed template <input type="file" accept=".xlsx,.xls" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null);setError('');setMessage('');}}/></label>
      <button disabled={busy||!file} onClick={()=>act(async()=>{setPreview(null);const r=await send('preview');setPreview(r.data);})}>Preview salary allocations</button>
      <button disabled={busy||!enabled||!preview||preview.invalidRows>0} onClick={()=>act(async()=>{const r=await send('import');setMessage(r.message);setPreview(null);await load();})}>Import for review</button>
    </div>
    {!enabled&&<p>Import activation is awaiting deployment verification. You can generate the template and preview allocations.</p>}
    {preview&&<>
      <h2>Allocation preview</h2><p>{preview.validRows} valid · {preview.invalidRows} requiring correction. Unworked days before a new hire’s resumption are not unpaid arrears.</p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}>
        <thead><tr>{['Employee No','Employment Type','Full Salary','Mid-month %','Normal Mid-month','Eligible Days / 15','Mid-month Payable','End-month Gross','Loan Recovery','Validation'].map(h=><th key={h} style={{padding:8}}>{h}</th>)}</tr></thead>
        <tbody>{preview.rows.map(row=><tr key={row.rowNumber}>
          {[row.employeeNumber,row.employmentType,money(row.amount),row.allocation?.midMonthPercentage??'—',money(row.allocation?.normalMidMonth),row.allocation?.eligibleDays??'—',money(row.allocation?.midMonthPayable),money(row.allocation?.endMonthGross),money(0),row.valid?'Ready':row.errors.join('; ')].map((v,i)=><td key={i} style={{padding:8,borderBottom:'1px solid #ddd'}}>{v}</td>)}
        </tr>)}</tbody>
      </table></div>
    </>}
    <h2>Imported full salaries awaiting activation</h2>
    {!records.length?<p>No prepared salary records.</p>:<div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}>
      <thead><tr>{['Employee No','Full Salary','Mid-month','End-month','Effective From','Status'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{records.map(r=><tr key={r.id}><td>{r.employeeNumber}</td><td>{money(r.fullMonthlyGross)}</td><td>{money(r.allocationPreview?.normalMidMonth)}</td><td>{money(r.allocationPreview?.endMonthGross)}</td><td>{String(r.effectiveFrom).slice(0,10)}</td><td>{r.activatedAt?'Activated':'Pending activation'}</td></tr>)}</tbody>
    </table></div>}
    <p>Previous unpaid amounts will be added on the following month’s 15th; previous overpaid amounts will be deducted in a separate column. They are reconciliations, not changes to the agreed full salary.</p>
  </section>;
}
