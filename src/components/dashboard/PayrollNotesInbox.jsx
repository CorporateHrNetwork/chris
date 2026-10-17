import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { hasPayrollNotesAccess } from '../../utils/payrollNotesAccess';
export default function PayrollNotesInbox({profile}) {
  const [data,setData]=useState(null),[error,setError]=useState('');
  const allowed=hasPayrollNotesAccess(profile);
  useEffect(()=>{
    if (!allowed) return;
    let active=true;
    const load=()=>apiRequest('/api/chris-automation/payroll-notes').then(r=>{if(active){setData(r.data);setError('');}}).catch(e=>{if(active)setError(e.message);});
    load();const timer=setInterval(load,60000);return()=>{active=false;clearInterval(timer);};
  },[allowed]);
  if (!allowed) return null;
  return <section style={{background:'var(--chris-dashboard-surface,#fff)',border:'1px solid #c2d7ca',borderRadius:16,padding:22,marginTop:22,color:'var(--tenant-text,#173b2b)'}}>
    <h2 style={{fontSize:18,marginTop:0}}>{data?.capabilities.canReview ? 'Head HR Payroll Inbox' : data?.capabilities.canAudit ? 'Auditor Payroll Inbox' : 'Branch Payroll Notes'}</h2>
    {error ? <p role="alert">{error}</p> : <p>{data ? `${data.notes.filter(n=>n.unread).length} unread · ${data.notes.filter(n=>!['IMPLEMENTED','REJECTED'].includes(n.status)).length} awaiting action · ${data.notes.filter(n=>n.status==='IMPLEMENTED').length} implemented` : 'Loading payroll updates…'}</p>}
    {(data?.notes || []).slice(0,4).map(n=><div key={n.id} style={{padding:'9px 0',borderTop:'1px solid #e0e9e3'}}><Link to={`/payroll/notes?note=${encodeURIComponent(n.id)}`} style={{color:'#08613a',fontWeight:700}}>{n.unread ? '● ' : ''}{n.employeeNumber} · {n.branchName} · {n.periodCode} — {n.status}</Link></div>)}
    <Link to="/payroll/notes" style={{display:'inline-block',marginTop:14,fontWeight:800,color:'#08613a'}}>Open Payroll Notes Inbox →</Link>
  </section>;
}
