import { useEffect, useState } from 'react';
import { essRequest } from '../../services/api';

export function RoleProfileCards({profiles=[]}) {
 return <section aria-label="Job descriptions and role goals">
  <h2>Job descriptions and performance expectations</h2>
  {!profiles.length&&<p>No published role profile is available for your current assignment.</p>}
  {profiles.map(p=><details key={p.employeeId} style={{margin:'14px 0',padding:16,border:'1px solid rgba(212,175,55,.4)',borderRadius:10}} open={p.own||undefined}>
   <summary><strong>{p.own?'My role':p.employeeName}</strong> · {p.employeeNumber} · {p.roleName}</summary>
   <p>{p.department} · {p.branch}</p>
   <p>Assigned line manager: {p.managerName||'HR reporting-line mapping required'}</p>
   {!p.standard?<p>A published job description and goal standard is awaiting HR setup.</p>:<>
    <p>Role standard version {p.standard.version}. Published {p.standard.publishedAt?.slice(0,10)}.</p>
    {p.standard.jobDescription?<>
     <h3>Role purpose</h3><p>{p.standard.jobDescription.purpose}</p>
     <p>Reporting position: {p.standard.jobDescription.reportsTo}</p>
     <h3>Responsibilities</h3><ul>{p.standard.jobDescription.responsibilities.map(v=><li key={v}>{v}</li>)}</ul>
     <h3>Skills and knowledge</h3><ul>{p.standard.jobDescription.skills.map(v=><li key={v}>{v}</li>)}</ul>
     <p>{p.standard.jobDescription.authority}</p><p>{p.standard.jobDescription.scope}</p>
    </>:<p style={{whiteSpace:'pre-wrap'}}>{p.standard.description}</p>}
    <h3>Goals and expected results</h3>
    {p.standard.goals.map(g=><article key={g.id} style={{padding:'8px 0'}}>
     <strong>{g.title} · {g.weight}%</strong><p>{g.target}</p>
     <p>Measure: {g.measurement}</p><p>Evidence: {g.evidence}</p>
     <details><summary>Rating expectations, 1–5</summary><ol>{g.anchors.map((a,i)=><li key={i}>{a}</li>)}</ol></details>
    </article>)}
    <p>Open Performance Evaluation for your assigned quarterly scorecard. You can save a self-assessment draft during the period; final submission opens after the period ends. The scorecard retains its published goals and effective dates.</p>
   </>}
  </details>)}
 </section>;
}
export default function MyRoleProfile() {
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;essRequest('/api/performance-evaluation/ess/role-profiles')
  .then(r=>{if(active)setData(r.data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 if(error)return <p role="alert">Unable to load your role profile: {error}</p>;
 if(!data)return <p role="status">Loading your job description and goals…</p>;
 if(!data.enabled)return null;
 return <RoleProfileCards profiles={(data.profiles||[]).filter(p=>p.own)}/>;
}
