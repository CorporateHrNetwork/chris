import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../services/api";

import { RoleProfileCards } from "./RoleProfileCards";

const base="/api/performance-evaluation";
const panel={padding:18,margin:"16px 0",border:"1px solid currentColor",borderRadius:10};
const field={display:"block",boxSizing:"border-box",width:"100%",padding:10,margin:"6px 0 12px",font:"inherit"};
const button={padding:"10px 14px",margin:"6px 8px 6px 0",font:"inherit",cursor:"pointer"};
const titles={"self-draft":"Save / update self-assessment draft",self:"Submit self-review",manager:"Submit manager assessment",finalise:"Validate and release",return:"Return to manager",acknowledge:"Acknowledge receipt",dispute:"Dispute result","assign-appeal":"Assign appeal reviewer",appeal:"Record appeal decision",reassign:"Apply updated reporting line","follow-up":"Record development follow-up"};
export default function PerformanceEvaluationWorkspace({essRequest,children=null}) {
  const [data,setData]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [editing,setEditing]=useState(null),[goals,setGoals]=useState([]),[reason,setReason]=useState("");
  const [selected,setSelected]=useState(null),[form,setForm]=useState({});
  const [showCompleted,setShowCompleted]=useState(false);
  const completedStatuses=new Set(["ACKNOWLEDGED","CLOSED"]);
  const completedCount=(data?.reviews||[]).filter(r=>completedStatuses.has(r.status)).length;
  const priority=r=>r.actions.includes("manager")?0:r.actions.some(a=>["self","finalise","appeal","assign-appeal","acknowledge","dispute"].includes(a))?1:completedStatuses.has(r.status)?3:2;
  const reviews=(data?.reviews||[]).filter(r=>showCompleted||!completedStatuses.has(r.status)).sort((a,b)=>priority(a)-priority(b)||String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const request=essRequest||apiRequest;
  const load=useCallback(async()=>{
    try{const result=await request(base+(essRequest?"/ess":"/workspace"));setData(result.data);setError("");}
    catch(e){setError(e.message||"Unable to load performance evaluation.");}
  },[request,essRequest]);
  useEffect(()=>{load();},[load]);
  async function perform(path,body={},method="POST"){
    setBusy(true);setError("");
    try{await request(base+path,{method,body});setSelected(null);setEditing(null);setReason("");await load();}
    catch(e){setError(e.message||"Unable to complete this action.");}
    finally{setBusy(false);}
  }
  if(data?.enabled===false)return children;
  if(!data&&!error)return <p role="status">Loading performance evaluation…</p>;
  function start(r,action){
    setSelected({review:r,action});
    setForm({comments:r.selfAssessmentDraft?.comments||"",evidence:r.selfAssessmentDraft?.evidence||"",discussion:"",development:"",reviewerUserId:"",reviseRating:false,followUpStatus:"OPEN",followUpDate:"",ratings:r.goals.map(g=>({goalId:g.id,rating:r.selfAssessmentDraft?.ratings?.find(v=>v.goalId===g.id)?.rating||"",evidence:r.selfAssessmentDraft?.ratings?.find(v=>v.goalId===g.id)?.evidence||""}))});
  }
  function goalChange(i,k,v){setGoals(old=>old.map((g,j)=>j===i?{...g,[k]:v}:g));}
  return <section aria-label="Quarterly performance evaluation" style={{margin:"18px 0"}}>
    <h2>Quarterly performance evaluation</h2>
    {error&&<p role="alert">{error}</p>}
    {data?.enabled&&<>
      <RoleProfileCards profiles={data.profiles||[]}/>
      <details style={panel} open={!data.policy}>
        <summary>Performance evaluation rules and HR policy · {data.policy?.version||"Awaiting publication"}</summary>
        {data.policy?<><p>{data.policy.title}</p><ol>{data.policy.rules.map(rule=><li key={rule} style={{marginBottom:8}}>{rule}</li>)}</ol>
          <p>Weights: role results 60%; quality and service 20%; teamwork and conduct 20%.</p>
          <ul>{data.policy.bands.map(b=><li key={b.label}>{b.minimum}–{b.maximumExclusive===5.01?"5 inclusive":"below "+b.maximumExclusive}: {b.label}</li>)}</ul>
          <p>Published: {data.policy.publishedAt}. Your scorecard retains its applicable policy version.</p>
        </>:<p>The policy must be published before a cycle can open.</p>}
      </details>
      {data.canManage&&<section style={panel}>
        <h3>HR AI Performance Evaluation Agent</h3>
        <p>Generate role standards from registered job descriptions, validate and publish them, then open the cycle. Automatic quarterly opening follows the configured server schedule.</p>
        {!data.policy&&<><ol>{data.draftPolicy.rules.map(rule=><li key={rule}>{rule}</li>)}</ol><button style={button} disabled={busy} onClick={()=>perform("/policy/publish")}>Publish evaluation policy</button></>}
        <button style={button} disabled={busy} onClick={()=>perform("/standards/generate")}>Generate missing role standards</button>
        <button style={button} disabled={busy||!data.policy} onClick={()=>{if(window.confirm("Open this quarter from today? Earlier work will not be assessed. Published role standards will be assigned; missing mappings become exceptions."))perform("/agent/open");}}>Open / reconcile prospective cycle</button>
        {data.templates.map(t=><div key={t.id} style={{marginTop:12}}>
          <strong>{t.roleName}</strong> · version {t.version} · {t.status} · {t.source}
          {!t.description&&<p>Missing job description: update the role register, then create a draft revision.</p>}
          <button style={button} disabled={busy} onClick={()=>{setEditing(t);setGoals(structuredClone(t.goals));setReason("");}}>View {t.status==="DRAFT"?"and edit":""} standard</button>
          <button style={button} disabled={busy} onClick={()=>perform("/standards/"+encodeURIComponent(t.id)+"/revise")}>Create draft revision</button>
        </div>)}
        {data.cycles.map(c=><details key={c.id}><summary>{c.key} · {c.partial?"Partial quarter":"Full quarter"} · {c.exceptions.length} exceptions</summary>
          <p>Assessment period: {c.effectiveFrom} to {c.end}. Self-review due {c.deadlines.self}; manager {c.deadlines.manager}; HR {c.deadlines.hr}.</p>
          <ul>{c.exceptions.map(e=><li key={e.employeeId}>{e.employeeNumber}: {e.reason}</li>)}</ul>
        </details>)}
      </section>}
      {editing&&<form style={panel} onSubmit={e=>{e.preventDefault();perform("/standards/"+encodeURIComponent(editing.id),{goals,reason,publish:true},"PUT");}}>
        <h3>{editing.roleName} · role scorecard</h3>
        <p>{editing.description||"Job description not yet registered."}</p>
        {goals.map((g,i)=><fieldset key={g.id} disabled={editing.status!=="DRAFT"||busy} style={{margin:"12px 0",minWidth:0}}>
          <legend>{g.category} · {g.weight}%</legend>
          {["title","target","measurement","evidence"].map(k=><label key={k}>{k}<input required style={field} value={g[k]} onChange={e=>goalChange(i,k,e.target.value)}/></label>)}
          <label>Weight (%)<input required type="number" min="0.01" max="100" step="0.01" style={field} value={g.weight} onChange={e=>goalChange(i,"weight",Number(e.target.value))}/></label>
          {g.anchors.map((a,j)=><label key={j}>Rating {j+1}<input required style={field} value={a} onChange={e=>goalChange(i,"anchors",g.anchors.map((v,n)=>n===j?e.target.value:v))}/></label>)}
        </fieldset>)}
        {editing.status==="DRAFT"&&<>
          <label>Reason for change<input required style={field} value={reason} onChange={e=>setReason(e.target.value)}/></label>
          <button type="button" style={button} disabled={busy||!reason.trim()} onClick={()=>perform("/standards/"+encodeURIComponent(editing.id),{goals,reason,publish:false},"PUT")}>Save draft</button>
          <button style={button} disabled={busy||!editing.description}>Publish validated standard</button>
        </>}
        <button type="button" style={button} onClick={()=>setEditing(null)}>Close standard</button>
      </form>}
      <details style={panel}><summary>My performance notifications ({data.notifications.length})</summary>
        <ul>{data.notifications.slice(-30).reverse().map(n=><li key={n.id}>{n.message} · {n.createdAt}</li>)}</ul>
      </details>
      {!data.reviews.length&&<p>No performance scorecard is assigned to you yet. HR can check role and reporting-line exceptions.</p>}
      {completedCount>0&&<label style={{display:"flex",alignItems:"center",gap:8,margin:"16px 0"}}><input type="checkbox" checked={showCompleted} onChange={e=>setShowCompleted(e.target.checked)}/> Show completed reviews ({completedCount})</label>}
      {reviews.map(r=><article key={r.id} style={panel}>
        <h3>{r.employeeName} · {r.employeeNumber}</h3>
        {r.synthetic&&<p><strong>Fictional demonstration case</strong></p>}
        <p>{r.roleName} · {r.cycleId.replace("cycle:","")} · {r.status.replaceAll("_"," ")} · policy {r.policyVersion}</p>
        <p>Period: {r.effectiveFrom}–{r.endDate}. Self-review due {r.deadlines.self}; manager {r.deadlines.manager}; HR {r.deadlines.hr}.</p>
        <details><summary>Applicable policy · {r.policyVersion}</summary><ol>{r.policy.rules.map(rule=><li key={rule} style={{marginBottom:8}}>{rule}</li>)}</ol></details>
        <details><summary>Goals, weights and scoring evidence</summary>{r.goals.map(g=><div key={g.id}>
          <h4>{g.title} · {g.weight}%</h4><p>Target: {g.target}. Measure: {g.measurement}. Evidence: {g.evidence}.</p>
          <ol>{g.anchors.map((a,i)=><li key={i}>{a}</li>)}</ol>
        </div>)}</details>
        {r.description&&<details><summary>Job description for this assessment period</summary><p style={{whiteSpace:'pre-wrap'}}>{r.description}</p></details>}
        {r.selfAssessmentDraft&&<p>Self-assessment draft saved {r.selfAssessmentDraft.updatedAt}. It has not been submitted to your manager.</p>}
        {r.selfAssessment&&<section aria-label="Employee self-assessment">
          <h4>Employee self-assessment</h4>
          <p><strong>Achievements, challenges and development needs</strong></p>
          <p style={{whiteSpace:"pre-wrap"}}>{r.selfAssessment.comments}</p>
          <p><strong>Supporting evidence</strong></p>
          <p style={{whiteSpace:"pre-wrap"}}>{r.selfAssessment.evidence}</p>
          {r.selfAssessment.ratings&&<ul>{r.selfAssessment.ratings.map(v=><li key={v.goalId}>{r.goals.find(g=>g.id===v.goalId)?.title}: {v.rating}/5 · {v.evidence}</li>)}</ul>}
          {r.selfAssessment.submittedAt&&<p>Submitted: {new Intl.DateTimeFormat("en-NG",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Lagos"}).format(new Date(r.selfAssessment.submittedAt))}</p>}
        </section>}
        {r.managerAssessment&&<><p>Manager discussion: {r.managerAssessment.discussion}</p><p>Follow-up: {r.managerAssessment.development}</p>
          <ul>{r.managerAssessment.ratings.map(v=><li key={v.goalId}>{r.goals.find(g=>g.id===v.goalId)?.title}: {v.rating}/5 · {v.evidence}</li>)}</ul></>}
        {r.finalScore&&<p><strong>{r.finalScore.score.toFixed(4)} / 5 · {r.finalScore.band}</strong></p>}
        {r.hrComment&&<p>HR feedback: {r.hrComment}</p>}
        {r.employeeResponse&&<p>Employee response: {r.employeeResponse.comments||r.employeeResponse.action}</p>}
        {r.appeal&&<p>Appeal decision: {r.appeal.decision}</p>}
        {r.followUp&&<p>Development follow-up: {r.followUp.status} · {r.followUp.date} · {r.followUp.notes}</p>}
        {r.appealDeadline&&<p>Dispute deadline: {r.appealDeadline}. Acknowledgment confirms receipt, not agreement.</p>}
        {r.actions.map(action=><button type="button" style={button} key={action} disabled={busy} onClick={()=>start(r,action)}>{titles[action]}</button>)}
      </article>)}
      {selected&&<form style={panel} onSubmit={e=>{e.preventDefault();perform((essRequest?"/ess":"")+"/reviews/"+encodeURIComponent(selected.review.id)+"/"+selected.action,selected.action==="self-draft"?{...form,ratings:form.ratings.filter(v=>v.rating!=="")}:selected.action==="appeal"?{comments:form.comments,...(form.reviseRating?{ratings:form.ratings}:{})}:form);}}>
        <h3>{titles[selected.action]} · {selected.review.employeeNumber}</h3>
        {selected.action==="appeal"&&<label><input type="checkbox" checked={form.reviseRating} onChange={e=>setForm({...form,reviseRating:e.target.checked})}/> Revise ratings after independent evidence review</label>}
        {["manager","self","self-draft"].includes(selected.action)||(selected.action==="appeal"&&form.reviseRating)?<>
          {selected.review.goals.map((g,i)=><fieldset key={g.id} style={{minWidth:0}}>
            <legend>{g.title} · {g.weight}%</legend>
            <label>Rating<select required={selected.action!=="self-draft"} style={field} value={form.ratings[i].rating} onChange={e=>setForm({...form,ratings:form.ratings.map((v,j)=>j===i?{...v,rating:e.target.value===""?"":Number(e.target.value)}:v)})}>
              <option value="">Choose a rating</option>{g.anchors.map((a,j)=><option key={j} value={j+1}>{j+1} — {a}</option>)}
            </select></label>
            <label>Evidence<textarea required={selected.action!=="self-draft"} style={field} value={form.ratings[i].evidence} onChange={e=>setForm({...form,ratings:form.ratings.map((v,j)=>j===i?{...v,evidence:e.target.value}:v)})}/></label>
          </fieldset>)}
          {selected.action==="manager"?<>
          <label>Feedback discussion record<textarea required style={field} value={form.discussion} onChange={e=>setForm({...form,discussion:e.target.value})}/></label>
          <label>Development and follow-up plan<textarea required style={field} value={form.development} onChange={e=>setForm({...form,development:e.target.value})}/></label>
          </>:['self','self-draft'].includes(selected.action)?<>
            <label>Achievements and challenges<textarea required={selected.action==='self'} style={field} value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})}/></label>
            <label>Supporting evidence<textarea required={selected.action==='self'} style={field} value={form.evidence} onChange={e=>setForm({...form,evidence:e.target.value})}/></label>
          </>:<label>Appeal decision and reasons<textarea required style={field} value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})}/></label>}
        </>:selected.action==="assign-appeal"?<label>Independent appeal reviewer<select required style={field} value={form.reviewerUserId} onChange={e=>setForm({...form,reviewerUserId:e.target.value})}><option value="">Choose an independent reviewer</option>{data.reviewerCandidates.filter(u=>![selected.review.managerUserId,selected.review.hrUserId].includes(u.id)&&![selected.review.employeeId,selected.review.managerEmployeeId].includes(u.employeeId)).map(u=><option key={u.id} value={u.id}>{u.label}</option>)}</select></label>:<>
          <label>{selected.action==="self"?"Achievements and challenges":"Comments / reasons"}<textarea required={selected.action!=="acknowledge"} style={field} value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})}/></label>
          {selected.action==="follow-up"&&<>
            <label>Follow-up status<select required style={field} value={form.followUpStatus} onChange={e=>setForm({...form,followUpStatus:e.target.value})}>{["OPEN","IN_PROGRESS","COMPLETED"].map(v=><option key={v}>{v}</option>)}</select></label>
            <label>Follow-up date<input required type="date" style={field} value={form.followUpDate} onChange={e=>setForm({...form,followUpDate:e.target.value})}/></label>
          </>}
          {selected.action==="self"&&<label>Supporting evidence<textarea required style={field} value={form.evidence} onChange={e=>setForm({...form,evidence:e.target.value})}/></label>}
        </>}
        <button style={button} disabled={busy}>{selected.action==="self-draft"?"Save draft":"Submit"}</button><button type="button" style={button} disabled={busy} onClick={()=>setSelected(null)}>Cancel</button>
      </form>}
    </>}
  </section>;
}

