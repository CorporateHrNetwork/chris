import {useEffect,useState} from 'react';
import {essRequest} from '../../services/essApi';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const initial=()=>({leavePolicyId:'',startDate:today(),endDate:today(),reason:'',attachmentUrl:''});
const label={display:'block',margin:'12px 0'};
const field={display:'block',width:'100%',boxSizing:'border-box',padding:10,marginTop:5,font:'inherit'};
export default function EssLeaveApplications(){
 const [form,setForm]=useState(initial),[data,setData]=useState(null),[quote,setQuote]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setData(null);setQuote(null);setError('');essRequest('/api/ess/leave/applications?asOfDate='+encodeURIComponent(form.startDate||today())).then(r=>{if(active)setData(r.data)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[form.startDate,revision]);
 function change(key,value){setForm(s=>({...s,[key]:value}));setQuote(null);setNotice('');setError('');}
 const selected=data?.policies?.find(p=>p.id===form.leavePolicyId);
 async function act(fn){setBusy(true);setError('');try{await fn()}catch(e){setError(e.message);setQuote(null)}finally{setBusy(false)}}
 async function preview(){await act(async()=>{const r=await essRequest('/api/ess/leave/preview',{method:'POST',body:form});setQuote(r.data)})}
 async function submit(){await act(async()=>{await essRequest('/api/ess/leave/applications',{method:'POST',body:form});setNotice('Leave application submitted for HR review. Your pending days are reserved in the available balance.');setQuote(null);setForm(initial());setRevision(v=>v+1)})}
 return <section className="card" aria-label="Leave applications">
  <div className="cardhead"><h3>Apply for leave</h3><button className="link" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Refresh balances</button></div>
  <p className="muted">Select a policy and dates, then preview the chargeable days. Available balance already excludes pending applications. Requests cannot exceed this balance, including policies that otherwise permit negative balances. Applications follow the existing HR approval process.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:14}}>
   <label style={label}>Start date<input aria-label="Leave start date" type="date" style={field} value={form.startDate} disabled={busy} onChange={e=>change('startDate',e.target.value)}/></label>
   <label style={label}>End date (inclusive)<input aria-label="Leave end date" type="date" style={field} value={form.endDate} disabled={busy} onChange={e=>change('endDate',e.target.value)}/></label>
   <label style={label}>Leave policy<select aria-label="Leave policy" style={field} value={form.leavePolicyId} disabled={busy||!data} onChange={e=>change('leavePolicyId',e.target.value)}><option value="">Select a policy</option>{(data?.policies||[]).map(p=><option key={p.id} value={p.id} disabled={!p.eligible}>{p.name} · {p.available} available {p.unit.toLowerCase().replaceAll('_',' ')}{!p.eligible?' · Not eligible':''}</option>)}</select></label>
  </div>
  {selected&&<p>Available: <strong>{selected.available}</strong> · Pending: {selected.pending} · Used: {selected.used} · Maximum for this request: {selected.maximumRequestable}. {!selected.hasEntitlement&&'No allocated balance is recorded for this year. Contact HR.'}</p>}
  <label style={label}>Reason<textarea aria-label="Leave reason" style={field} value={form.reason} maxLength={4000} disabled={busy} onChange={e=>change('reason',e.target.value)}/></label>
  {selected?.requiresAttachment&&<label style={label}>Supporting document reference / link<input aria-label="Leave supporting document reference" style={field} value={form.attachmentUrl} maxLength={2000} disabled={busy} onChange={e=>change('attachmentUrl',e.target.value)}/></label>}
  <button className="tablebtn" disabled={busy||!selected||!form.startDate||!form.endDate||!form.reason.trim()} onClick={preview}>Preview leave days</button>{' '}
  <button className="tablebtn" disabled={busy||!quote?.canSubmit||!form.reason.trim()||(selected?.requiresAttachment&&!form.attachmentUrl.trim())} onClick={submit}>Submit leave application</button>
  {quote&&<div role="status"><p>Requested: <strong>{quote.requestedUnits}</strong> {quote.unit.toLowerCase().replaceAll('_',' ')} · Available: {quote.available} · Remaining after request: {Math.max(0,quote.remaining)}.</p>{!quote.canSubmit&&<p>These dates cannot be submitted against your current available balance or policy limit. Shorten the request or contact HR.</p>}<p className="muted">{quote.scheduleNote} Public holidays and the selected policy’s calendar rules are applied. Requests spanning two leave years must be submitted separately.</p></div>}
  <h3>My leave applications</h3>
  {!data?<p>Loading your policies and balances…</p>:!data.requests.length?<p>No leave applications recorded.</p>:<div className="tablewrap"><table><thead><tr>{['Policy','Start','End','Days / Units','Status'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.requests.map(r=><tr key={r.id}><td>{r.leavePolicy?.name||'Leave'}</td><td>{String(r.startDate).slice(0,10)}</td><td>{String(r.endDate).slice(0,10)}</td><td>{Number(r.requestedUnits)}</td><td>{r.status.replaceAll('_',' ')}</td></tr>)}</tbody></table></div>}
 </section>;
}
