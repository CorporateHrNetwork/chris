import {useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {apiRequest} from '../services/api';
const outcomes=[['CONFIRM_EMPLOYMENT','Confirm Employment'],['TERMINATE_EMPLOYMENT','Terminate Employment'],['EXTEND_PROBATION','Extend Probation']];
const label=v=>outcomes.find(x=>x[0]===v)?.[1]||v;
export default function ZermattProbation({essRequest=null}){
  const request=essRequest||apiRequest;
  const base=essRequest?'/api/ess/probation':'/api/zermatt/probation';
  const [rows,setRows]=useState([]),[notices,setNotices]=useState([]),[selected,setSelected]=useState(null),[form,setForm]=useState({}),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState('');
  const load=useCallback(async()=>{const [r,n]=await Promise.all([request(base),request(base+'/notices')]);setRows(r.data||[]);setNotices(n.data||[]);},[base,request]);
  useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
  const choose=r=>{setSelected(r);setForm({recommendation:r.assessment?.recommendation||'CONFIRM_EMPLOYMENT',performance:r.assessment?.performance||'',conduct:r.assessment?.conduct||'',attendance:r.assessment?.attendance||'',evidence:r.assessment?.evidence||'',reason:'',outcome:r.assessment?.recommendation||'CONFIRM_EMPLOYMENT',effectiveDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())});setError('');setMessage('');};
  async function act(action){
    if(!selected)return;
    if(action==='decide'&&!window.confirm(`Record ${label(form.outcome)} for ${selected.employeeName}, effective ${form.effectiveDate}? This changes the employment record. Termination also closes the service episode and disables linked access.`))return;
    setBusy(true);setError('');setMessage('');
    try{await request(`${base}/${selected.id}/${action}`,{method:'POST',body:{...form,version:selected.version}});await load();setSelected(null);setMessage('Workflow saved and audit trail updated.');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function sync(){setBusy(true);setError('');try{await request(base+'/synchronize',{method:'POST',body:{}});await load();setMessage('Probation register refreshed. Due notices are available to assigned recipients.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  const input=(key,title,type='textarea')=><label style={{display:'grid',gap:6,margin:'10px 0'}}>{title}{type==='textarea'?<textarea rows={3} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/>:<input type={type} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/>}</label>;
  return <div className="chris-module-page chris-probation-workspace" style={{padding:24,color:'#F7F8FA'}}>
    <style>{`.chris-probation-workspace button{border:1px solid rgba(200,155,44,.6);border-radius:8px;background:#0b3726;color:#f7f8fa;padding:9px 14px;cursor:pointer;margin:5px 6px 5px 0;font:inherit}.chris-probation-workspace button:disabled{opacity:.5;cursor:wait}.chris-probation-workspace input,.chris-probation-workspace textarea,.chris-probation-workspace select{background:#0b2118;color:#f7f8fa;border:1px solid #7c6a30;border-radius:8px;padding:10px;font:inherit;max-width:100%;box-sizing:border-box}.chris-probation-workspace textarea{width:100%}.chris-probation-workspace fieldset{border:1px solid #7c6a30;border-radius:8px;padding:16px;margin:16px 0}.chris-probation-workspace article{padding:10px 0}.chris-probation-workspace h2{margin-top:20px}.chris-probation-workspace table{width:100%;margin-top:14px}.chris-probation-workspace p{line-height:1.6}`}</style>
    <h1>Probation Assessment & Confirmation</h1>
    <p>Zermatt Liquor Limited · ZLL-PROB-1.0</p>
    <p>Three calendar months from employment date. In-app notices open seven days before the end date for the assigned Line Manager, Branch HR and Head HR. Overdue reviews stay pending; only Head HR records the final decision.</p>
    {!essRequest&&<button disabled={busy} onClick={sync}>Refresh probation register · Head HR</button>}
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <section aria-label="Probation notices"><h2>My notices ({notices.length})</h2>{notices.map(n=><article key={n.id}><p>{n.message}</p><button onClick={async()=>{try{await request(`${base}/notices/${n.id}/read`,{method:'POST',body:{}});await load();}catch(e){setError(e.message);}}}>Mark read</button></article>)}</section>
    <label>Search probation reviews <input value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <div style={{overflowX:'auto'}}><table><thead><tr>{['Employee','Branch','Probation end','Notice date','Status','Action'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.filter(r=>`${r.employeeName} ${r.employeeNumber} ${r.branch}`.toLowerCase().includes(query.toLowerCase())).map(r=><tr key={r.id}><td>{r.employeeName}<br/>{r.employeeNumber} · cycle {r.cycle}</td><td>{r.branch}</td><td>{r.endDate}</td><td>{r.noticeDate}</td><td>{r.status}{r.overdue?' · OVERDUE':''}{r.routingIssues?.map(issue=><p key={issue} style={{color:'#E7C86C'}}>{issue}</p>)}</td><td><button onClick={()=>choose(r)}>Open review</button></td></tr>)}</tbody></table></div>
    {!rows.length&&<p>No probation reviews within your access. Head HR can refresh the register. Employees must have Probation status and an open employment episode.</p>}
    {selected&&<section aria-label="Probation review" style={{border:'1px solid #C89B2C',padding:20,marginTop:20}}>
      <h2>{selected.employeeName} · {selected.employeeNumber}</h2><p>{selected.role} · {selected.startDate} to {selected.endDate}</p>
      {!essRequest&&<Link to={`/employees/${selected.employeeNumber}`}>Employee profile and employment history</Link>}
      {selected.assessment&&<article><h3>Manager assessment</h3>{selected.assessment.improvementGoals&&<p>Extension goals: {selected.assessment.improvementGoals}</p>}{['performance','conduct','attendance','evidence','reason'].map(k=><p key={k}><strong>{k}: </strong>{selected.assessment[k]}</p>)}<p>Recommendation: {label(selected.assessment.recommendation)}</p>{selected.assessment.branchVerification&&<p>Branch HR verified: {selected.assessment.branchVerification.reason}</p>}{selected.assessment.returnReason&&<p>Clarification requested: {selected.assessment.returnReason}</p>}</article>}
      {selected.decision&&<article><h3>Head HR decision</h3><p>{label(selected.decision.outcome)} · {selected.decision.effectiveDate}</p><p>{selected.decision.reason}</p>{selected.decision.newEndDate&&<p>Extended to {selected.decision.newEndDate}: {selected.decision.improvementGoals}</p>}</article>}
      {selected.canAssess&&['AWAITING_ASSESSMENT','RETURNED'].includes(selected.status)&&<fieldset disabled={busy}><legend>Line Manager assessment</legend>{input('performance','Performance against agreed role goals')}{input('conduct','Conduct')}{input('attendance','Attendance')}{input('evidence','Evidence references and employee comments')}{input('reason','Recommendation reason')}<label>Recommendation <select value={form.recommendation} onChange={e=>setForm({...form,recommendation:e.target.value})}>{outcomes.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button onClick={()=>act('submit')}>Submit to Head HR</button></fieldset>}
      {selected.status==='SUBMITTED'&&(selected.canDecide||selected.canVerify)&&<fieldset disabled={busy}><legend>{selected.canDecide?'Head HR review':'Branch HR verification'}</legend>{input('reason','Decision / verification / clarification reason')}{selected.canVerify&&<button onClick={()=>act('verify')}>Verify evidence</button>}{selected.canDecide&&<><label>Final outcome <select value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value})}>{outcomes.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>{input('effectiveDate','Effective date','date')}{form.outcome==='EXTEND_PROBATION'&&<>{input('newEndDate','New probation end date','date')}{input('improvementGoals','Improvement goals and support')}</>}<p>Final decisions change the employment record. Future effective dates are not supported. Termination requires the normal exit clearance and final-pay process afterwards.</p><button onClick={()=>act('return')}>Return to Line Manager</button><button onClick={()=>act('decide')}>Record final decision</button></>}</fieldset>}
      <button onClick={()=>setSelected(null)}>Close review</button>
    </section>}
  </div>;
}
