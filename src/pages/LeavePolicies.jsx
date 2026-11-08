import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest, getStoredOrganization } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";
import { fallbackPolicyNameOptions, fallbackRecommendedDefaults, leaveTypeKey, readablePolicyCode } from "../data/leavePolicyOptions";

import "./LeavePolicies.css";

const today=()=>new Date().toISOString().slice(0,10);
const sections=[
 ["Policy Details",null],["Eligibility","eligibilityRules"],["Entitlement","entitlementRules"],
 ["Accrual & Carryover","balanceRules"],["Request Rules","requestRules"],
 ["Approval Workflow","approvalWorkflow"],["Commencement & Return","lifecycleRules"],
 ["Payroll Treatment","payrollRules"],["Attendance Treatment","attendanceRules"],
 ["Review & Activate",null]
];
const jurisdictionName=value=>({NG:"Nigeria",NIGERIA:"Nigeria",GH:"Ghana",GHANA:"Ghana",GB:"United Kingdom",UK:"United Kingdom"}[String(value||"").trim().toUpperCase()]||String(value||"").trim());
const blank=(jurisdiction="")=>({name:"",code:"",leaveTypeId:"",description:"",category:"ORGANIZATION_BENEFIT",jurisdiction,effectiveFrom:today(),effectiveTo:"",status:"DRAFT",changeReason:"",
 eligibilityRules:{scope:"ALL_EMPLOYEES",minimumServiceDays:0},entitlementRules:{value:20,unit:"WORKING_DAYS",frequency:"ANNUAL",accrual:"MONTHLY",proration:"BOTH"},serviceBands:[],
 balanceRules:{carryoverAllowed:false,negativeBalanceAllowed:false,cashOutAllowed:false},requestRules:{minimumNotice:0,minimumDuration:.5,halfDayAllowed:true,backdatedRequestsAllowed:false,attachmentRequired:false,reasonRequired:true},
 approvalWorkflow:{type:"MANAGER_HR",steps:["LINE_MANAGER","HR"]},lifecycleRules:{explicitCommencementRequired:true,commencementActor:"HR",allowEarlyCommencement:false,returnToWorkRequired:true,returnConfirmedBy:"HR",allowEarlyReturn:true,fitnessCertificateRequired:false,returnDocumentationRequired:false},
 payrollRules:{treatment:"FULLY_PAID",payPercentage:100},attendanceRules:{excusedAbsence:true,suppressExpectedAttendance:true,clockInRequired:false},calendarRules:{countWeekends:false,countPublicHolidays:false,useEmployeeWorkSchedule:true},
 documentationRules:{},overlapRules:{action:"BLOCK"},coverageRules:{}});
function LeavePolicies(){
 const nav=useNavigate(),{hasPermission}=useAuthorization(),canManage=hasPermission("leave.manage"),[data,setData]=useState({templates:[],policies:[]}),[types,setTypes]=useState([]),[error,setError]=useState(""),[message,setMessage]=useState(""),[view,setView]=useState(null),[builder,setBuilder]=useState(null),[step,setStep]=useState(1),[saving,setSaving]=useState(false);
 async function load(){try{const [w,t]=await Promise.all([apiRequest("/api/leave/policy-workspace"),apiRequest("/api/leave/types")]);setData(w.data||{templates:[],policies:[]});setTypes(t.data||[])}catch(e){setError(e.message||"Unable to load policies.")}}
 useEffect(()=>{let active=true;(async()=>{try{const [w,t]=await Promise.all([apiRequest("/api/leave/policy-workspace"),apiRequest("/api/leave/types")]);if(active){setData(w.data||{templates:[],policies:[]});setTypes(t.data||[])}}catch(e){if(active)setError(e.message||"Unable to load policies.")}})();return()=>{active=false}},[]);
 function start(mode,source){setError("");setMessage("");const defaultJurisdiction=data.defaultJurisdiction||jurisdictionName(data.organization?.country);let policy=blank(defaultJurisdiction);if(mode==="CLONE")policy={...policy,...source.configuration,name:source.name+" - Custom",code:source.code+"_CUSTOM",description:source.description||"",category:source.category||"",jurisdiction:source.jurisdiction||defaultJurisdiction};if(mode==="VERSION"){for(const k of Object.keys(policy))policy[k]=source[k]??policy[k];policy={...policy,effectiveFrom:today(),effectiveTo:"",status:"DRAFT",changeReason:""}}setBuilder({mode,source,policy});setStep(1)}
 async function call(path,body){setError("");setMessage("");try{await apiRequest(path,{method:"POST",body:JSON.stringify(body)});setError("");setMessage("Policy operation completed.");setBuilder(null);await load();window.setTimeout(()=>setMessage(""),4500)}catch(e){const text=e.message||"Policy operation failed.";setError(text);window.setTimeout(()=>setError(current=>current===text?"":current),4500)}}
 async function save(status){const p={...builder.policy,status};delete p.policyNameChoice;if(!p.name||!p.effectiveFrom||(builder.mode==="CREATE"&&!p.leaveTypeId)){setError("Policy name, leave type and effective date are required.");setStep(1);return}setSaving(true);if(builder.mode==="CLONE")await call(`/api/leave/policy-templates/${builder.source.code}/clone`,p);else if(builder.mode==="VERSION")await call(`/api/leave/policies/${builder.source.id}/versions`,p);else await call("/api/leave/policies",p);setSaving(false)}
 async function status(p,next){const reason=window.prompt("Reason for status change:");if(reason)await call(`/api/leave/policies/${p.id}/status`,{status:next,reason})}
 const organization = getStoredOrganization();
 const zermatt = organization?.slug === "zermatt-liquor-limited";
 const effectiveToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: zermatt ? "Africa/Lagos" : "UTC", year: "numeric", month: "2-digit", day: "2-digit",
 }).format(new Date());
 const currentPolicies = data.policies.filter(policy => isCurrentPolicy(policy, effectiveToday));
 const currentIds = new Set(currentPolicies.map(policy => policy.id));
 const otherPolicies = data.policies.filter(policy => !currentIds.has(policy.id));

 function policyCards(policies) {
  return <div className="leave-policy-grid">{policies.map(policy => (
   <Card key={policy.id} title={policy.name} tag={words(policy.status)} text={policy.description}>
    <small style={muted}>{policy.code} · Version {policy.versionNumber}</small>
    <div style={actions}>
     <button style={button} onClick={() => setView(policy)}>View Policy</button>
     {canManage && <>
      {["DRAFT", "SUSPENDED"].includes(policy.status) && <button style={primary} onClick={() => status(policy, "ACTIVE")}>{policy.status === "DRAFT" ? "Activate" : "Reactivate"}</button>}
      {policy.status === "ACTIVE" && <button style={button} onClick={() => status(policy, "SUSPENDED")}>Suspend</button>}
      {policy.status !== "RETIRED" && <>
       <button style={button} onClick={() => start("VERSION", policy)}>New Version</button>
       <button style={danger} onClick={() => status(policy, "RETIRED")}>Retire</button>
      </>}
     </>}
    </div>
   </Card>
  ))}</div>;
 }

 return <div className="leave-policy-page" style={{color:"var(--chris-text-main)"}}>
  <button style={back} onClick={()=>nav("/leave")}>{"\u2190"} Back to Leave Dashboard</button>
  <header style={{...head, flexWrap:"wrap"}}><div><b style={eye}>POLICY ENGINE</b><h1>Leave Policies</h1><p style={muted}>Current organization policies, previous versions and CHRiS templates.</p></div><button disabled={!canManage} style={{...primary,opacity:canManage?1:.5}} onClick={()=>start("CREATE")}>+ Create Leave Policy</button></header>
  {!canManage&&<Notice>Read-only access. Policy changes require leave management permission.</Notice>}{message&&<Notice ok>{message}</Notice>}{error&&<Notice>{error}</Notice>}
  <Disclosure title={zermatt ? "Zermatt Organization Policies" : "Organization Policies"} count={currentPolicies.length} note="Active policies in effect today.">
   {currentPolicies.length ? policyCards(currentPolicies) : <p style={muted}>No policies are currently in effect.</p>}
   {otherPolicies.length > 0 && <Disclosure title="Other policy versions" count={otherPolicies.length} note="Drafts, scheduled policies, suspended policies and historical versions.">
    {policyCards(otherPolicies)}
   </Disclosure>}
  </Disclosure>
  <Disclosure title="CHRIS Recommended Policies" count={data.templates.length} note="Read-only system templates. Compliance controls are not legal advice.">
   <div className="leave-policy-grid">{data.templates.map(t=><Card key={t.code} title={t.name} tag="CHRiS template" text={t.description || t.previewText}>
    <div style={actions}><button style={button} onClick={()=>setView(t)}>View Policy</button><button disabled={!canManage} style={{...primary,opacity:canManage?1:.5}} onClick={()=>call(`/api/leave/policy-templates/${t.code}/use`,{effectiveFrom:today()})}>Use Policy</button><button disabled={!canManage} style={button} onClick={()=>start("CLONE",t)}>Clone & Customize</button></div>
   </Card>)}</div>
  </Disclosure>
  {view&&<Modal title={view.name} close={()=>setView(null)}><PolicyDetails policy={view}/></Modal>}
  {builder&&<Modal wide title={builder.mode==="CLONE"?"Clone & Customize":builder.mode==="VERSION"?"Create Policy Version":"Create Leave Policy"} close={()=>setBuilder(null)}>
   <div style={steps}>{sections.map((s,i)=><button key={s[0]} style={pill(step===i+1)} onClick={()=>setStep(i+1)}>{i+1}</button>)}</div>
   <h3>{step}. {sections[step-1][0]}</h3><BuilderStep step={step} policy={builder.policy} types={types} workspace={data} change={policy=>setBuilder({...builder,policy})}/>
   <footer style={foot}><button style={button} disabled={step===1} onClick={()=>setStep(step-1)}>Previous</button><span><button style={button} disabled={saving} onClick={()=>save("DRAFT")}>Save Draft</button> {step<10?<button style={primary} onClick={()=>setStep(step+1)}>Next</button>:<button style={primary} disabled={saving} onClick={()=>save("ACTIVE")}>Preview & Activate</button>}</span></footer>
  </Modal>}
 </div>
}
function BuilderStep({step,policy,types,workspace,change}){const set=(k,v)=>change({...policy,[k]:v});if(step===1){const selectedType=types.find(t=>t.id===policy.leaveTypeId);const typeKey=leaveTypeKey(selectedType);const options=(workspace.policyNameOptions||fallbackPolicyNameOptions)[typeKey]||(workspace.policyNameOptions||fallbackPolicyNameOptions).DEFAULT;const recommendation=(workspace.recommendedDefaults||fallbackRecommendedDefaults)[typeKey];const selectedChoice=policy.policyNameChoice||(options.includes(policy.name)?policy.name:(policy.name?"Custom Policy":""));function chooseType(id){const type=types.find(item=>item.id===id);const key=leaveTypeKey(type);const names=(workspace.policyNameOptions||fallbackPolicyNameOptions)[key]||(workspace.policyNameOptions||fallbackPolicyNameOptions).DEFAULT;const defaults=(workspace.recommendedDefaults||fallbackRecommendedDefaults)[key];change({...policy,leaveTypeId:id,policyNameChoice:names[0]||"",name:names[0]||"",code:"",entitlementRules:{...policy.entitlementRules,...(defaults?{value:defaults.value,unit:defaults.unit}: {})}})}return <div style={form}><label>Leave Type *<select style={input} value={policy.leaveTypeId} onChange={e=>chooseType(e.target.value)}><option value="">Select broad leave category</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Policy Name *<select style={input} value={selectedChoice} disabled={!selectedType} onChange={e=>{const value=e.target.value;change({...policy,policyNameChoice:value,name:value==="Custom Policy"?"":value,code:""})}}><option value="">Select policy option</option>{options.map(name=><option key={name} value={name}>{name}</option>)}</select></label>{selectedChoice==="Custom Policy"&&<Field label="Custom Policy Name *" value={policy.name} set={v=>change({...policy,name:v,code:""})}/>}<label>Policy Code<input style={{...input,opacity:.75}} value={policy.code||readablePolicyCode(selectedType,policy.name)} readOnly/><small style={muted}>Generated automatically and made collision-safe when saved.</small></label><Field label="Category" value={policy.category} set={v=>set("category",v)}/><label>Jurisdiction{workspace.jurisdictionOptions?.length?<select style={input} value={policy.jurisdiction} onChange={e=>set("jurisdiction",e.target.value)}><option value="">Select jurisdiction</option>{workspace.jurisdictionOptions.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>:<input style={input} value={policy.jurisdiction} onChange={e=>set("jurisdiction",e.target.value)} placeholder={workspace.organization?.country||"Organization jurisdiction"}/>}<small style={muted}>Defaults from the organization country where available.</small></label>{recommendation&&<div style={{...recommendationBox,gridColumn:"1/-1"}}><strong>CHRIS recommended default: {recommendation.value} {recommendation.unit.toLowerCase().replaceAll("_"," ")}</strong><div>Configurable starting point—not a universal statutory entitlement. You can override it under Entitlement.</div></div>}<Field type="date" label="Effective From *" value={policy.effectiveFrom} set={v=>set("effectiveFrom",v)}/><Field type="date" label="Effective To" value={policy.effectiveTo} set={v=>set("effectiveTo",v)}/><Field label="Change Reason" value={policy.changeReason} set={v=>set("changeReason",v)}/><label style={{gridColumn:"1/-1"}}>Description<textarea style={area} value={policy.description} onChange={e=>set("description",e.target.value)}/></label></div>}
 const key=sections[step-1][1];if(step===10)return <><Json label="Attendance Treatment" value={policy.attendanceRules} set={v=>set("attendanceRules",v)}/><Json label="Weekend & Holiday Rules" value={policy.calendarRules} set={v=>set("calendarRules",v)}/><Json label="Documentation Rules" value={policy.documentationRules} set={v=>set("documentationRules",v)}/><Json label="Overlap Controls" value={policy.overlapRules} set={v=>set("overlapRules",v)}/><Json label="Workforce Coverage Controls" value={policy.coverageRules} set={v=>set("coverageRules",v)}/><p style={warn}>Review the human-readable preview before activation. Compliance status is a control, not legal advice.</p></>;
 return <Json label={sections[step-1][0]+" Configuration"} value={policy[key]} set={v=>set(key,v)}/>}
function Json({label,value,set}){const [text,setText]=useState(JSON.stringify(value,null,2)),[bad,setBad]=useState(false);function apply(){try{set(JSON.parse(text));setBad(false)}catch{setBad(true)}}return <label>{label}<textarea style={{...area,borderColor:bad?"#F87171":undefined}} value={text} onChange={e=>setText(e.target.value)} onBlur={apply}/>{bad&&<small style={{color:"#F87171"}}>Enter valid JSON.</small>}</label>}
function Field({label,value,set,type="text"}){return <label>{label}<input style={input} type={type} value={value||""} onChange={e=>set(e.target.value)}/></label>}
function isCurrentPolicy(policy, date) {
 return policy.status === "ACTIVE" && policy.isActive === true &&
  policy.effectiveFrom?.slice(0, 10) <= date &&
  (!policy.effectiveTo || policy.effectiveTo.slice(0, 10) >= date);
}

const ruleSections = [
 ...sections.filter(([, key]) => key),
 ["Service Bands", "serviceBands"],
 ["Weekend & Holiday Rules", "calendarRules"],
 ["Documentation", "documentationRules"],
 ["Overlap Controls", "overlapRules"],
 ["Workforce Coverage", "coverageRules"],
];

function words(value) {
 const text = String(value).replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
 return text.charAt(0).toUpperCase() + text.slice(1).replace(/[A-Z]{2,}/g, word => word.toLowerCase());
}

function policyDate(value) {
 return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function ruleValue(value) {
 if (typeof value === "boolean") return value ? "Yes" : "No";
 if (Array.isArray(value)) {
  return value.length ? <ul>{value.map((item, index) => <li key={index}>{ruleValue(item)}</li>)}</ul> : "None";
 }
 if (value && typeof value === "object") return <RuleList rules={value}/>;
 if (value == null || value === "") return "—";
 return typeof value === "string" && /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(value) ? words(value) : String(value);
}

function RuleList({rules}) {
 return <dl className="leave-policy-facts">{Object.entries(rules).map(([key, value]) => (
  <div key={key}><dt>{words(key)}</dt><dd>{ruleValue(value)}</dd></div>
 ))}</dl>;
}

function PolicyDetails({policy}) {
 const configuration = policy.configuration || policy;
 const details = {
  "Policy code": policy.code,
  "Leave type": policy.leaveType?.name,
  Status: policy.status ? words(policy.status) : null,
  Version: policy.versionNumber,
  Jurisdiction: policy.jurisdiction,
  "Effective from": policy.effectiveFrom ? policyDate(policy.effectiveFrom) : null,
  "Effective to": policy.effectiveTo ? policyDate(policy.effectiveTo) : null,
  "Compliance assessment": policy.complianceStatus === "CUSTOM_NOT_ASSESSED" ? "Custom policy, assessment pending" : policy.complianceStatus,
 };
 return <div className="leave-policy-detail">
  {(policy.description || policy.previewText) && <p>{policy.description || policy.previewText}</p>}
  <RuleList rules={Object.fromEntries(Object.entries(details).filter(([, value]) => value != null))}/>
  <div className="leave-policy-grid">
   {ruleSections.map(([title, key]) => {
    const rules = configuration[key];
    return rules && Object.keys(rules).length > 0
     ? <section key={key} style={card}><h3>{title}</h3><RuleList rules={rules}/></section>
     : null;
   })}
  </div>
  {policy.complianceNotes && <p style={warn}>{policy.complianceNotes}</p>}
 </div>;
}

function Disclosure({title,count,note,children}) {
 return <details className="leave-policy-disclosure" style={panel}>
  <summary><span>{title}</span><small>{count}</small></summary>
  <p style={muted}>{note}</p>
  {children}
 </details>;
}

function Card({title,tag,text,children}){return <article className="leave-policy-card" style={card}><b style={eye}>{tag}</b><h3>{title}</h3>{text&&<p style={muted}>{text}</p>}<div className="leave-policy-card-actions">{children}</div></article>}
function Notice({children,ok}){return <div style={{...panel,color:ok?"var(--chris-success)":"var(--chris-warning)"}}>{children}</div>}

function Modal({title,close,children,wide}) {
 const dialog = useRef(null);
 useEffect(() => {
  const element = dialog.current;
  element.showModal();
  return () => element.close();
 }, []);
 return <dialog ref={dialog} className={wide ? "leave-policy-modal leave-policy-modal-wide" : "leave-policy-modal"} aria-labelledby="leave-policy-modal-title" onCancel={event => { event.preventDefault(); close(); }}>
  <header className="leave-policy-modal-header"><h2 id="leave-policy-modal-title">{title}</h2><button type="button" style={button} onClick={close}>Close</button></header>
  <div className="leave-policy-modal-body">{children}</div>
 </dialog>;
}
const panel={marginBottom:18,padding:20,border:"var(--chris-ui-panel-border, 1px solid var(--chris-border-gold))",borderRadius:"var(--chris-ui-panel-radius, 16px)",background:"var(--chris-ui-panel-background, rgba(7,24,15,.95))"},head={display:"flex",justifyContent:"space-between",gap:15,alignItems:"center"},card={padding:15,border:"var(--chris-ui-panel-border, 1px solid var(--chris-border-soft))",borderRadius:"var(--chris-ui-panel-radius, 12px)",background:"var(--chris-ui-panel-background, rgba(255,255,255,.035))"},actions={display:"flex",gap:7,flexWrap:"wrap"},form={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:"10px 14px"},input={display:"block",width:"100%",boxSizing:"border-box",padding:"8px 10px",marginTop:4,borderRadius:8,border:"1px solid var(--chris-border-soft)",background:"var(--chris-input-bg)",color:"var(--chris-text-main)"},area={...input,minHeight:120,fontFamily:"ui-monospace,monospace"},primary={padding:"9px 12px",border:0,borderRadius:8,background:"var(--chris-gold)",color:"#07110C",fontWeight:800},button={padding:"9px 12px",border:"1px solid var(--chris-border-soft)",borderRadius:8,background:"transparent",color:"var(--chris-text-main)"},danger={...button,color:"#FCA5A5"},eye={color:"var(--chris-gold)",fontSize:11,letterSpacing:".1em"},muted={color:"var(--chris-text-secondary)",lineHeight:1.5},back={...button,border:0,color:"var(--chris-gold)"},steps={display:"flex",gap:6,flexWrap:"wrap",marginBottom:10},pill=active=>({width:30,height:30,borderRadius:"50%",border:"1px solid var(--chris-gold)",background:active?"var(--chris-gold)":"transparent",color:active?"#07110C":"white"}),foot={display:"flex",justifyContent:"space-between",position:"sticky",bottom:0,marginTop:12,paddingTop:10,background:"#07150E"},warn={padding:12,background:"rgba(212,175,55,.08)",color:"var(--chris-warning)",borderRadius:8},recommendationBox={padding:10,borderRadius:8,border:"1px solid rgba(212,175,55,.35)",background:"rgba(212,175,55,.08)",color:"var(--chris-warning)",lineHeight:1.45};
export default LeavePolicies;
