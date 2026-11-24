import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";

const panel = {border:"1px solid #d8e1d9",borderRadius:12,background:"#fff",padding:18,marginTop:14};
const field = {padding:9,border:"1px solid #c6d4c9",borderRadius:8,maxWidth:"100%"};

export default function HistoricalReconciliationPanel({batchId,onVerified}) {
  const base="/api/reports/consolidated-statutory";
  const [review,setReview]=useState(null);
  const [sourceId,setSourceId]=useState("");
  const [filter,setFilter]=useState("");
  const [search,setSearch]=useState("");
  const [options,setOptions]=useState({employees:[],locations:[]});
  const [suggestions,setSuggestions]=useState(null);
  const [assessment,setAssessment]=useState(null);
  const [assessmentCategory,setAssessmentCategory]=useState("ALL");
  const [employeeId,setEmployeeId]=useState("");
  const [locationId,setLocationId]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  async function load() {
    const data=await apiRequest(`${base}/historical/batches/${encodeURIComponent(batchId)}/reconciliation`);
    setReview(data.data);
    if(!data.data.unresolved.some(x=>x.sourceId===sourceId)) setSourceId("");
  }
  useEffect(()=>{
    let active=true;
    apiRequest(`${base}/historical/batches/${encodeURIComponent(batchId)}/reconciliation`)
      .then(x=>{if(active) setReview(x.data);})
      .catch(e=>{if(active) setError(e.message);});
    return ()=>{active=false;};
  },[batchId]);
  useEffect(()=>{
    if(search.trim().length<2){setOptions({employees:[],locations:[]});return;}
    let active=true;
    const t=setTimeout(()=>{
      apiRequest(`${base}/historical/match-options?search=${encodeURIComponent(search)}`)
        .then(x=>{if(active) setOptions(x.data||{employees:[],locations:[]});})
        .catch(e=>{if(active) setError(e.message);});
    },300);
    return ()=>{active=false;clearTimeout(t);};
  },[search]);
  const rows=useMemo(()=> (review?.unresolved||[]).filter(x=>(
    [x.employeeNo,x.employeeName,x.period].join(" ").toLowerCase().includes(filter.toLowerCase())
  )).slice(0,25),[review,filter]);
  async function assessAll(){
    setBusy("assessment");setError("");
    try{
      const result=await apiRequest(`${base}/historical/batches/${encodeURIComponent(batchId)}/review-assessment`);
      setAssessment(result.data);
    }catch(e){setError(e.message);}finally{setBusy("");}
  }
  async function suggestCandidates(){
    if(!sourceId){setError("Select a historical source row first.");return;}
    setBusy("suggestions");setError("");
    try {
      const result=await apiRequest(`${base}/historical/batches/${encodeURIComponent(batchId)}/candidates?sourceId=${encodeURIComponent(sourceId)}`);
      setSuggestions(result.data);
    }catch(e){setError(e.message);}finally{setBusy("");}
  }
  async function submit(){
    if(!sourceId||!employeeId||!locationId||note.trim().length<12){
      setError("Choose a source row, verified employee, historical branch, and review note of at least 12 characters.");return;
    }
    setBusy("match");setError("");setMessage("");
    try{
      await apiRequest(`${base}/historical/batches/${encodeURIComponent(batchId)}/matches`,{
        method:"POST",body:{sourceId,employeeId,locationId,reviewNote:note}
      });
      setMessage("Historical employee and branch match saved to the audit trail.");
      setEmployeeId("");setLocationId("");setNote("");setSearch("");setSourceId("");
      await load();
      setAssessment(null);
    }catch(e){setError(e.message);}finally{setBusy("");}
  }
  async function verify(){
    setBusy("verify");setError("");setMessage("");
    try{
      await apiRequest(`${base}/historical/batches/${encodeURIComponent(batchId)}/verify`,{method:"POST",body:{}});
      setMessage("Historical source batch verified for reporting. No payroll or remittance data changed.");
      await load();onVerified?.();
    }catch(e){setError(e.message);}finally{setBusy("");}
  }
  return <section style={panel} aria-label="Historical employee reconciliation">
    <h3 style={{fontSize:18,margin:"0 0 8px"}}>Historical employee & branch reconciliation</h3>
    {!review ? <p>Loading reconciliation…</p> : <>
      <p><strong>{review.reviewed} of {review.total}</strong> source rows reviewed · {review.unresolved.length} pending · Status: {review.status}</p>
      <p style={{color:"#617367"}}>Historical branch must be confirmed from the period of the source record. The employee's current branch is only a suggestion, not evidence.</p>
      {review.status==="PENDING_RECONCILIATION" && <>
        <button type="button" disabled={!!busy} onClick={assessAll}>Assess all historical rows</button>
        {assessment && <section style={{...panel,background:"#fafcf9"}} aria-label="Historical identity assessment">
          <h4>Identity review queue — {assessment.summary.total} rows</h4>
          <p>Already reviewed: {assessment.summary.reviewed} · Exact number and name: {assessment.summary.exactNumberAndName} · Number only: {assessment.summary.numberOnly} · Name only: {assessment.summary.nameOnly} · Conflicts: {assessment.summary.conflict} · Ambiguous: {assessment.summary.ambiguous} · Unmatched: {assessment.summary.unmatched}</p>
          <p>Suggestions never approve identity or historical branch.</p>
          <label style={{display:"grid",gap:6}}>Filter identity findings
            <select value={assessmentCategory} onChange={e=>setAssessmentCategory(e.target.value)} style={field}>
              <option value="ALL">All</option>
              {["EXACT_NUMBER_AND_NAME","NUMBER_ONLY_REVIEW","NAME_ONLY_REVIEW","CONFLICT_REVIEW","AMBIGUOUS_REVIEW","UNMATCHED","ALREADY_REVIEWED"].map(v=>
                <option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}
            </select>
          </label>
          <div style={{maxHeight:320,overflow:"auto"}}>
            {assessment.assessments.filter(x=>assessmentCategory==="ALL" || x.classification===assessmentCategory)
              .slice(0,100).map(x=><div key={x.sourceId} style={{padding:8,borderBottom:"1px solid #d8e1d9"}}>
                <strong>{x.employeeNo||"No number"} · {x.employeeName}</strong> — {x.classification.replaceAll("_"," ")}
                <div><small>{x.sourceSheet} · {x.period} · {x.candidates.length} candidate(s)</small></div>
                {x.classification!=="ALREADY_REVIEWED" && <button type="button" onClick={()=>{
                  setFilter(x.employeeName||x.employeeNo);setSourceId(x.sourceId);setSuggestions(null);setEmployeeId("");
                }}>Review row</button>}
              </div>)}
          </div>
        </section>}
      </>}
      {review.status==="PENDING_RECONCILIATION" && review.unresolved.length>0 && <>
        <label style={{display:"grid",gap:6,marginBottom:12}}>Filter unmatched source rows
          <input style={field} placeholder="Employee name or number" value={filter} onChange={e=>setFilter(e.target.value)} />
        </label>
        <label style={{display:"grid",gap:6,marginBottom:12}}>Select historical source row
          <select value={sourceId} onChange={e=>{setSourceId(e.target.value);setSuggestions(null);setEmployeeId("");}} style={field}>
            <option value="">Choose a source row</option>
            {rows.map(x=><option key={x.sourceId} value={x.sourceId}>
              {x.employeeNo||"No employee number"} · {x.employeeName} · {x.period} · {x.sourceSheet}
            </option>)}
          </select>
        </label>
        <button type="button" disabled={!!busy||!sourceId} onClick={suggestCandidates}>Suggest exact identity matches (review required)</button>
        {suggestions && <section aria-label="Read-only match suggestions"><p>{suggestions.candidates.length} exact candidate(s) found. {suggestions.ambiguous?"Identity is ambiguous or no exact match exists.":"A unique exact candidate is available for HR review."} No candidate is automatically approved.</p><ul>{suggestions.candidates.map(x=><li key={x.employeeId}>{x.employeeNo} — {x.employeeName} ({x.matchReason.replaceAll("_"," ").toLowerCase()})</li>)}</ul></section>}
        <label style={{display:"grid",gap:6,marginBottom:12}}>Search CHRiS employee
          <input style={field} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Type employee name or ID" />
        </label>
        <label style={{display:"grid",gap:6,marginBottom:12}}>Verified employee
          <select style={field} value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
            <option value="">Select matching employee</option>
            {options.employees.map(x=><option key={x.id} value={x.id}>{x.employeeNumber} · {x.name}</option>)}
          </select>
        </label>
        <label style={{display:"grid",gap:6,marginBottom:12}}>Verified historical branch
          <select style={field} value={locationId} onChange={e=>setLocationId(e.target.value)}>
            <option value="">Select branch for historical period</option>
            {options.locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label style={{display:"grid",gap:6,marginBottom:12}}>HR review note / evidence reference
          <textarea rows={3} style={field} value={note} onChange={e=>setNote(e.target.value)}
            placeholder="Explain how employee identity and the historical branch were verified; mention legacy employee ID if different" />
        </label>
        <button type="button" disabled={!!busy} onClick={submit}>Save reviewed match</button>
      </>}
      {review.status==="PENDING_RECONCILIATION" && <>
        <p>{review.canVerify ? "All rows are matched and no blocking source discrepancies remain." :
          "Final verification is disabled until every source row is matched and blocking discrepancies are resolved."}</p>
        <button type="button" disabled={!!busy||!review.canVerify} onClick={verify}>Verify historical batch for reporting</button>
      </>}
      {review.sourceExceptions?.length>0 && <details><summary>Source validation findings ({review.sourceExceptions.length})</summary>
        <div style={{maxHeight:240,overflow:"auto"}}>{review.sourceExceptions.slice(0,100).map((x,i)=>
          <p key={i}>{x.code} — {x.employeeNo||x.employeeName||x.sheet||"Record"} {x.rowNumber? `row ${x.rowNumber}`:""}</p>)}</div></details>}
    </>}
    {error&&<p role="alert" style={{color:"#a33"}}>{error}</p>}
    {message&&<p role="status" style={{color:"#17603f"}}>{message}</p>}
  </section>;
}
