import {useEffect,useState} from 'react';
import {essRequest} from '../../services/essApi';

// ESS displays approved leave and historical records; all applications and
// approvals take place outside CHRiS and are recorded by authorized HR.
export default function EssLeaveApplications(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let active=true;
  setData(null);setError('');
  essRequest('/api/ess/leave/applications').then(r=>{if(active)setData(r.data)})
   .catch(e=>{if(active)setError(e.message||'Unable to load leave records.')});
  return ()=>{active=false};
 },[revision]);
 const policies=data?.policies||[];
 const requests=data?.requests||[];
 return <section className="card" aria-label="My leave profile">
  <div className="cardhead"><h3>My leave profile</h3><button className="link" onClick={()=>setRevision(v=>v+1)}>Refresh records</button></div>
  <p className="muted">Leave applications and approvals are handled outside CHRiS. Authorized HR records approved leave in CHRiS. This page displays your recorded leave balances and history only; contact HR about applications or corrections.</p>
  {error&&<p role="alert">{error}</p>}
  {!data?<p role="status">Loading your leave records…</p>:<>
   <h4>Leave balances {data.leaveYear?'('+data.leaveYear+')':''}</h4>
   {!policies.length?<p>No current leave entitlement is recorded. Contact HR for assistance.</p>:
    <div className="tablewrap"><table><thead><tr>{['Leave type / policy','Allocated','Entitlement','Opening','Accrued','Carryover','Adjustments','Used','Committed / Pending','Available','Maximum Requestable','Unit'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
     {policies.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.allocatedEntitlement}</td><td>{p.totalEntitlement}</td><td>{p.baseEntitlement}</td><td>{p.accrued}</td><td>{p.carryover}</td><td>{p.adjustments}</td><td>{p.used}</td><td>{p.pending}</td><td>{p.available}</td><td>{p.maximumRequestable}</td><td>{String(p.unit||'').replaceAll('_',' ')}</td></tr>)}
    </tbody></table></div>}
   <h4>My recorded leave history</h4>
   {!requests.length?<p>No leave records are available.</p>:<div className="tablewrap"><table><thead><tr>{['Policy','Start','End','Days / Units','Status'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
    {requests.map(r=><tr key={r.id}><td>{r.leavePolicy?.name||'Leave'}</td><td>{String(r.startDate||'').slice(0,10)}</td><td>{String(r.endDate||'').slice(0,10)}</td><td>{Number(r.requestedUnits)}</td><td>{String(r.status||'').replaceAll('_',' ')}</td></tr>)}
   </tbody></table></div>}
  </>}
 </section>;
}
