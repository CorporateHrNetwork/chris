import { useEffect, useState } from "react";
import { FiEye, FiEyeOff, FiLock, FiMail } from "react-icons/fi";
import loginBackground from "../assets/images/login-bg.png";
import chrisLogo from "../assets/images/chris-logo.png";
import { API_BASE_URL, clearEssAuthSession, essRequest, getEssAuthToken } from "../services/essApi";

const ORG_SLUG = "zermatt-liquor-limited";
const NAV = [["overview","Overview"],["profile","My Profile"],["onboarding","Onboarding"],["statutory","Statutory"],["payroll","Payment & Payroll"],["payslips","Payslips"],["leave","Leave & Attendance"],["performance","Performance Evaluation"],["gratuity","Gratuity"],["birthday","Birthday Card"],["documents","Documents"]];
const RATINGS = ["EXCELLENT","SATISFACTORY","ACCEPTABLE","UNSATISFACTORY"];
const money=(v,c="NGN")=>Number.isFinite(Number(v))?new Intl.NumberFormat("en-NG",{style:"currency",currency:c||"NGN",maximumFractionDigits:2}).format(Number(v)): "—";
const date=v=>{if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-NG",{day:"2-digit",month:"short",year:"numeric"}).format(d)};
const title=v=>String(v||"").replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const val=v=>v===null||v===undefined||v===""?"—":String(v);
const initials=e=>[e?.firstName,e?.lastName].filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase()||"CH";
const icon=k=>({overview:"⌂",profile:"👤",onboarding:"✓",statutory:"▣",payroll:"₦",payslips:"▤",leave:"◷",performance:"★",documents:"▤"}[k]||"•");

export default function ESSPortal(){
 const essToken=getEssAuthToken();
 const [auth,setAuth]=useState(Boolean(essToken)),[data,setData]=useState(null),[tab,setTab]=useState("overview"),[loading,setLoading]=useState(Boolean(essToken)),[error,setError]=useState(""),[login,setLogin]=useState({email:"",password:""}),[submitting,setSubmitting]=useState(false);
 useEffect(()=>{
   localStorage.removeItem("chris_ess_token");
   localStorage.removeItem("chris_ess_employee");
   localStorage.removeItem("chris_ess_organization");
   if(window.location.search)window.history.replaceState({},document.title,"/ess");
 },[]);
 const load=async()=>{setLoading(true);setError("");try{const r=await essRequest("/api/ess/dashboard");const d=r?.data||{};setData({profile:d.profile||{},onboarding:{completionPercent:0,currentStage:null,status:"NOT_STARTED",sectionProgress:{},sections:[],data:{},documents:[],...(d.onboarding||{})},statutory:{registered:{},obligations:[],...(d.statutory||{})},payment:d.payment||{},payroll:{payslips:[],latestPayslip:null,...(d.payroll||{})},leaveBalances:Array.isArray(d.leaveBalances)?d.leaveBalances:[],attendance:Array.isArray(d.attendance)?d.attendance:[],performance:Array.isArray(d.performance)?d.performance:[]});setAuth(true)}catch(e){setAuth(false);setData(null);setError(e.message||"Unable to load your employee portal dashboard.")}finally{setLoading(false)}};
 useEffect(()=>{if(getEssAuthToken())load();else setLoading(false)},[]);
 const submit=async e=>{e.preventDefault();setSubmitting(true);setError("");try{const r=await essRequest("/api/ess/login",{method:"POST",body:{...login,organizationSlug:ORG_SLUG}});sessionStorage.setItem("chris_ess_token",r.data.token);sessionStorage.setItem("chris_ess_employee",JSON.stringify(r.data.employee||{}));sessionStorage.setItem("chris_ess_organization",JSON.stringify(r.data.organization||{}));await load()}catch(e){setError(e.message||"Invalid employee login credentials.")}finally{setSubmitting(false)}};
 const signOut=()=>{clearEssAuthSession();setAuth(false);setData(null);setTab("overview");setError("");setLogin({email:"",password:""})};
 if(!auth)return <><style>{CSS}</style><Login login={login} setLogin={setLogin} submit={submit} submitting={submitting} error={error}/></>;
 if(loading&&!data)return <><style>{CSS}</style><div className="essshell"><div className="loading"><Brand/><h2>Opening your employee portal…</h2><p>Securely loading your CHRiS employee information.</p></div></div></>;
 if(!data)return <><style>{CSS}</style><Login login={login} setLogin={setLogin} submit={submit} submitting={submitting} error={error}/></>;
 return <><style>{CSS}</style><div className="essshell"><div className="app"><header><div className="brandrow"><Brand small/><div><strong>CHRiS</strong><small>Employee Self-Service</small></div></div><div className="headuser"><div className="avatar">{initials(data.profile)}</div><div><b>{data.profile.name}</b><small>{data.profile.designation?.name||"Employee"} · {data.profile.employeeNumber}</small></div><button className="ghost" onClick={signOut}>Sign out</button></div></header><div className="body"><aside><span className="caption">MY CHRiS</span>{NAV.map(([k,l])=><button className={tab===k?"nav active":"nav"} key={k} onClick={()=>setTab(k)}><i>{icon(k)}</i><span>{l}</span>{k==="onboarding"&&<b>{data.onboarding.completionPercent}%</b>}</button>)}<div className="sidefoot">Private employee access<br/><small>Only your own CHRiS record is available.</small></div></aside><main>
 {tab==="overview"&&<Overview data={data} go={setTab}/>}
 {tab==="profile"&&<Profile data={data}/>}
 {tab==="onboarding"&&<Onboarding data={data}/>}
 {tab==="statutory"&&<Statutory data={data}/>}
 {tab==="payroll"&&<Payroll data={data}/>}
 {tab==="payslips"&&<Payslips data={data}/>}
 {tab==="leave"&&<LeaveAttendance data={data}/>}
 {tab==="performance"&&<Performance data={data} onSaved={load}/>}
 {tab==="documents"&&<Documents data={data}/>}
 </main></div></div></div></>;
}

function Overview({data,go}){const p=data.profile,o=data.onboarding,latest=data.payroll.latestPayslip,perf=data.performance?.[0];return <Page h="Welcome back" s="Your personal CHRiS workspace for employee information, payroll, leave and performance."><div className="hero"><div className="person"><div className="bigavatar">{initials(p)}</div><div><span className="eyebrow">ZERMATT LIQUOR LIMITED</span><h1>{p.name}</h1><p>{p.designation?.name||"Employee"} · {p.department?.name||"—"} · {p.location?.name||"—"}</p></div></div><span className="pill">{title(p.status)}</span></div><div className="metrics"><Metric l="Onboarding" v={o.completionPercent+"%"} s={o.currentStage||"Profile registration"} go={()=>go("onboarding")}/><Metric l="Payslips" v={data.payroll.payslips.length} s="Approved payroll records" go={()=>go("payslips")}/><Metric l="Leave records" v={data.leaveBalances.length} s="Current balances" go={()=>go("leave")}/><Metric l="Performance" v={perf?.assessment?.finalRating?title(perf.assessment.finalRating):"In progress"} s="Quarterly evaluation" go={()=>go("performance")}/></div><div className="twocol"><Card t="Onboarding registration" a="Open" click={()=>go("onboarding")}><Progress v={o.completionPercent}/><p className="muted">{Object.values(o.sectionProgress||{}).filter(x=>x.completed).length} of {Object.keys(o.sectionProgress||{}).length} sections completed.</p></Card><Card t="Latest payslip" a="View" click={()=>go("payslips")}>{latest?<div className="latest"><div><small>{latest.periodName||latest.periodCode}</small><strong>{money(latest.netPreview,latest.currency)}</strong></div><small>Pay date {date(latest.payDate)}</small></div>:<Empty t="No approved payslip is available yet."/>}</Card></div><Card t="Quick access"><div className="quickgrid">{[["profile","My Profile","Personal and employment information"],["statutory","Statutory","PAYE, pension and statutory registration"],["payroll","Payment & Payroll","Bank/payment and payroll summary"],["performance","Performance Evaluation","Objectives, self-assessment and outcomes"]].map(x=><button className="quick" key={x[0]} onClick={()=>go(x[0])}><span>{icon(x[0])}</span><div><b>{x[1]}</b><small>{x[2]}</small></div>→</button>)}</div></Card></Page>}

function Profile({data}){const p=data.profile||{},x=(data.onboarding?.data||{})["personal-details"]||{};return <Page h="My Profile" s="Your complete employee master record as maintained in CHRiS."><Card t="Identity"><Info items={[["Employee Number",p.employeeNumber],["Full Name",p.name],["Email",p.email],["Phone",p.phone],["Gender",title(p.gender)],["Date of Birth",date(x.dateOfBirth)],["Marital Status",x.maritalStatus],["Nationality",x.nationality],["Residential Address",x.residentialAddress],["State",x.state],["LGA",x.lga],["Identification Type",x.idType],["Identification Number",x.idNumber]]}/></Card><Card t="Employment"><Info items={[["Department",p.department?.name],["Designation",p.designation?.name],["Employment Level",p.employmentLevel?.name||p.designation?.employmentLevel?.name],["Employment Type",p.employmentType],["Location / Branch",p.location?.name],["Cost Centre",p.costCentre?.name],["Date Employed",date(p.hireDate)],["Current Service Start",date(p.employmentEpisodes?.[0]?.startDate||p.hireDate)],["Confirmation Date",date(p.confirmationDate)],["Line Manager",p.lineManager?.name],["Manager Designation",p.lineManager?.designation]]}/></Card></Page>}

function Onboarding({data}){const o=data.onboarding;return <Page h="Onboarding & Registration" s="Track every section of your CHRiS employee registration and see what remains outstanding."><Card><div className="proghead"><div><span className="eyebrow">REGISTRATION COMPLETION</span><strong>{o.completionPercent}%</strong></div><span>{o.status==="COMPLETED"?"Completed":o.currentStage||"In progress"}</span></div><Progress v={o.completionPercent}/></Card><div className="sectiongrid">{(o.sections||[]).map(s=>{const p=o.sectionProgress?.[s.key]||{};return <div className="sectiontile" key={s.key}><div className={p.completed?"check done":"check"}>{p.completed?"✓":"!"}</div><div><b>{s.label||title(s.key)}</b><small>{p.completedItems||0} of {p.totalItems||0} items completed · {p.required?"Required":"Optional"}</small></div><span>{p.completed?"Complete":"Pending"}</span></div>})}</div><Card t="Registration data"><Groups data={o.data}/></Card></Page>}

function Statutory({data}){const s=data.statutory.registered||{};return <Page h="Statutory Information" s="Your statutory registration details and payroll-linked statutory obligations."><Card t="Registration details"><Info items={[["Tax Identification Number",s.taxIdentificationNumber],["PAYE State",s.payeState],["Pension PFA",s.pensionPfa],["Pension PFA Code",s.pensionPfaCode],["Pension PIN",s.pensionPin],["NHIA / Health Status",s.nhiaStatus||s.nhiaRegistrationStatus],["NHIA Number",s.nhiaNumber||s.nhiaId],["Other Statutory Status",s.otherStatutoryStatus],["Other Notes",s.otherStatutoryNotes]]}/></Card><Card t="Payroll statutory obligations"><Table rows={data.statutory.obligations} cols={[["Period",r=>r.periodYear+"-"+String(r.periodMonth).padStart(2,"0")],["Type",r=>title(r.obligationType)],["Employee",r=>money(r.employeeAmount,r.currency)],["Employer",r=>money(r.employerAmount,r.currency)],["Remitted",r=>money(r.amountRemitted,r.currency)],["Status",r=>title(r.status)]]}/></Card></Page>}

function Payroll({data}){const p=data.payment||{};return <Page h="Payment & Payroll" s="Your registered payment instructions and approved payroll summary."><Card t="Payment information"><Info items={[["Bank Name",p.bankName],["Account Name",p.accountName],["Account Number",p.accountNumber],["Bank Code",p.bankCode],["Payment Method",p.paymentMethod],["Payroll Currency",p.payrollCurrency]]}/></Card><Card t="Payroll summary"><Info items={[["Approved Payslips",data.payroll.payslips.length],["Latest Gross Pay",data.payroll.latestPayslip?money(data.payroll.latestPayslip.grossPay,data.payroll.latestPayslip.currency):"—"],["Latest Net Pay",data.payroll.latestPayslip?money(data.payroll.latestPayslip.netPreview,data.payroll.latestPayslip.currency):"—"],["Latest Pay Date",date(data.payroll.latestPayslip?.payDate)]]}/></Card></Page>}

function Payslips({data}){return <Page h="Payslips" s="View approved payroll records and download an employee copy."><Card><Table rows={data.payroll.payslips} empty="No approved payslips are available yet." cols={[["Period",r=>r.periodName||r.periodCode],["Period End",r=>date(r.periodEnd)],["Pay Date",r=>date(r.payDate)],["Gross",r=>money(r.grossPay,r.currency)],["Deductions",r=>money(r.deductions,r.currency)],["Net Pay",r=>money(r.netPreview,r.currency)],["",r=><Download id={r.id}/>]]}/></Card></Page>}

function LeaveAttendance({data}){return <Page h="Leave & Attendance" s="Your leave balances and recent attendance records."><Card t="Leave balances"><Table rows={data.leaveBalances} empty="No leave balance is currently available." cols={[["Leave Type",r=>r.leaveType],["Year",r=>r.leaveYear],["Opening",r=>Number(r.openingBalance||0)],["Accrued",r=>Number(r.accrued||0)],["Used",r=>Number(r.used||0)],["Adjusted",r=>Number(r.adjusted||0)],["Balance",r=>Number(r.openingBalance||0)+Number(r.accrued||0)+Number(r.carriedForward||0)+Number(r.adjusted||0)-Number(r.used||0)]]}/></Card><Card t="Recent attendance"><Table rows={data.attendance} empty="No attendance records are available." cols={[["Date",r=>date(r.attendanceDate)],["Status",r=>title(r.status)],["Clock In",r=>r.clockIn?new Date(r.clockIn).toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"}):"—"],["Clock Out",r=>r.clockOut?new Date(r.clockOut).toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"}):"—"],["Late",r=>r.lateMinutes+" min"],["Overtime",r=>r.overtimeMinutes+" min"]]}/></Card></Page>}

function Performance({data,onSaved}){const current=data.performance?.[0];const [answers,setAnswers]=useState({}),[comments,setComments]=useState(""),[rating,setRating]=useState("SATISFACTORY"),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");if(!current)return <Page h="Performance Evaluation" s="Quarterly performance evaluation, objectives and self-assessment."><Card><Empty t="No performance cycle has been opened for your employee record yet."/></Card></Page>;const submitted=["MANAGER_APPROVAL_PENDING","FINAL"].includes(current.assessment?.status);const submit=async()=>{setBusy(true);setMsg("");try{const assessment={overallRating:rating,comments,improvementAreas:comments,kpis:current.kpis.map(k=>({kpiId:k.id,rating:answers[k.id]?.rating||"SATISFACTORY",comment:answers[k.id]?.comment||""}))};await essRequest("/api/ess/performance/self-assessment",{method:"POST",body:{cycleId:current.cycle.id,assessment}});setMsg("Self-assessment submitted to your line manager.");await onSaved()}catch(e){setMsg(e.message||"Unable to submit self-assessment.")}finally{setBusy(false)}};return <Page h="Performance Evaluation" s={"Quarter "+current.cycle.quarter+" • "+current.cycle.year+" • Quarterly appraisal workflow"}><Card t="Objectives & KPIs"><div className="workflow"><span className="step done">1. Objectives published</span><span className={submitted?"step done":"step active"}>2. Self-assessment</span><span className={current.assessment?.status==="FINAL"?"step done":"step"}>3. Line manager assessment</span><span className="step">4. Final outcome</span></div>{current.kpis.length?current.kpis.map(k=><div className="kpi" key={k.id}><div><span>{k.weight}%</span><b>{k.title}</b></div><p>{k.objective}</p><small>Measure: {k.measurement} · Target: {k.target}</small><div className="kpiinputs"><select disabled={submitted} value={answers[k.id]?.rating||current.assessment?.selfAssessment?.kpis?.find(x=>x.kpiId===k.id)?.rating||"SATISFACTORY"} onChange={e=>setAnswers(a=>({...a,[k.id]:{...a[k.id],rating:e.target.value}}))}>{RATINGS.map(x=><option key={x}>{x}</option>)}</select><input disabled={submitted} placeholder="Evidence / comment" value={answers[k.id]?.comment||""} onChange={e=>setAnswers(a=>({...a,[k.id]:{...a[k.id],comment:e.target.value}}))}/></div></div>):<Empty t="Your approved objectives have not yet been published for this cycle."/>}</Card><Card t="Self-assessment"><label className="field">Overall self-rating<select disabled={submitted} value={rating} onChange={e=>setRating(e.target.value)}>{RATINGS.map(x=><option key={x}>{x}</option>)}</select></label><label className="field">Comments / improvement areas<textarea disabled={submitted} rows="4" value={comments} onChange={e=>setComments(e.target.value)} placeholder="Summarise achievements, evidence and improvement areas."/></label>{msg&&<div className="notice">{msg}</div>}{!submitted&&<button className="primary" disabled={busy||!current.kpis.length} onClick={submit}>{busy?"Submitting…":"Submit self-assessment"}</button>}{current.assessment?.finalRating&&<div className="outcome"><b>Final outcome: {title(current.assessment.finalRating)}</b><span>{current.assessment.improvementNotes||"No improvement note recorded."}</span>{current.promotionPipeline&&<strong>Promotion / LRT review: {title(current.promotionPipeline.status)}</strong>}{current.pip&&<strong>Performance Improvement Plan: {title(current.pip.status)}</strong>}</div>}</Card></Page>}

function Gratuity({data}){const g=data.gratuity;if(!g)return <Page h="Gratuity" s="Your approved gratuity / severance information from CHRiS."><Card><Empty t="No approved gratuity or severance settlement is currently recorded for your employee record."/></Card><Card t="About this page"><p className="muted">Gratuity figures are shown only after the applicable CHRiS exit settlement has been approved. No estimated entitlement is displayed here unless it has been formally recorded in CHRiS.</p></Card></Page>;return <Page h="Gratuity" s="Your approved gratuity / severance settlement recorded in CHRiS."><div className="metrics"><div className="metric"><span>Gratuity / Severance</span><strong>{money(g.gratuitySeverance,g.currency)}</strong><small>Approved settlement</small></div><div className="metric"><span>Gross Settlement</span><strong>{money(g.grossPayable,g.currency)}</strong><small>Total payable</small></div><div className="metric"><span>Net Settlement</span><strong>{money(g.netSettlement,g.currency)}</strong><small>After recoveries</small></div><div className="metric"><span>Amount Paid</span><strong>{money(g.amountPaid,g.currency)}</strong><small>{title(g.status)}</small></div></div><Card t="Settlement details"><Info items={[["Status",title(g.status)],["Currency",g.currency],["Approved Date",date(g.approvedAt)],["Paid Date",date(g.paidAt)]]}/></Card></Page>}

function BirthdayCard({data}){const dob=data.birthday?.dateOfBirth;const p=data.profile||{};if(!dob)return <Page h="Birthday Card" s="Your personalized Zermatt birthday card and birthday information."><Card><Empty t="Your date of birth is not yet recorded in your CHRiS employee profile."/><p className="muted">Please contact HR/Admin to update your personal details.</p></Card></Page>;const birth=new Date(dob);const now=new Date();const next=new Date(now.getFullYear(),birth.getMonth(),birth.getDate());if(next<new Date(now.getFullYear(),now.getMonth(),now.getDate()))next.setFullYear(now.getFullYear()+1);const days=Math.ceil((next-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);const today=next.toDateString()===new Date(now.getFullYear(),now.getMonth(),now.getDate()).toDateString();return <Page h="Birthday Card" s="Your personalized Zermatt birthday card and birthday information."><section className="birthday-card"><div className="birthday-top"><span className="eyebrow">ZERMATT LIQUOR LIMITED</span><span className="birthday-confetti">✦</span></div><div className="birthday-icon">🎂</div><h1>{today?"Happy Birthday, "+p.firstName+"!":"A Birthday Celebration for "+p.firstName}</h1><p>{today?"Wishing you a wonderful birthday filled with joy, good health and success.":"Your next birthday is "+date(next)+"."}</p><div className="birthday-message">“May the year ahead bring you greater achievements, memorable moments and continued success. Happy Birthday from everyone at Zermatt Liquor Limited.”</div><div className="birthday-meta"><span>Date of Birth <b>{date(birth)}</b></span><span>{today?"Today":"Countdown"} <b>{today?"🎉":days+" day"+(days===1?"":"s")}</b></span></div></section></Page>}

function Documents({data}){return <Page h="Documents" s="Documents attached to your CHRiS employee record."><Card><Table rows={data.onboarding.documents} empty="No employee documents are available." cols={[["Document",r=>r.originalName],["Category",r=>title(r.category)],["Type",r=>r.mimeType||"—"],["Uploaded",r=>date(r.createdAt)],["",r=><Doc id={r.id}/>]]}/></Card></Page>}

async function downloadFile(url,name){
 const r=await fetch(url,{headers:{Authorization:"Bearer "+getEssAuthToken()}});
 if(!r.ok) throw Error("The requested file could not be downloaded.");
 const blob=await r.blob(); const objectUrl=URL.createObjectURL(blob); const link=document.createElement("a");
 link.href=objectUrl; link.download=name; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(objectUrl);
}
function Download({id}){return <button className="tablebtn" onClick={()=>downloadFile(API_BASE_URL+"/api/ess/payslips/"+id+"/download","CHRiS_Payslip.xlsx").catch(e=>alert(e.message))}>Download</button>}
function Doc({id}){return <button className="tablebtn" onClick={()=>downloadFile(API_BASE_URL+"/api/ess/documents/"+id+"/download","CHRiS_Document").catch(e=>alert(e.message))}>Download</button>}

function Page({h,s,children}){return <><div className="pagehead"><span className="eyebrow">CHRiS EMPLOYEE PORTAL</span><h2>{h}</h2><p>{s}</p></div>{children}</>}
function Card({t,a,click,children}){return <section className="card">{t&&<div className="cardhead"><h3>{t}</h3>{a&&<button className="link" onClick={click}>{a} →</button>}</div>}{children}</section>}
function Metric({l,v,s,go}){return <button className="metric" onClick={go}><span>{l}</span><strong>{v}</strong><small>{s}</small></button>}
function Progress({v}){return <div className="progress"><span style={{width:Math.max(0,Math.min(100,Number(v)||0))+"%"}}/></div>}
function Info({items}){return <div className="infogrid">{items.map(([l,v])=><div className="info" key={l}><small>{l}</small><b>{val(v)}</b></div>)}</div>}
function Groups({data}){const groups=data&&typeof data==="object"&&!Array.isArray(data)?data:{};return <div>{Object.entries(groups).map(([k,v])=><div className="group" key={k}><h4>{title(k)}</h4><Info items={v&&typeof v==="object"&&!Array.isArray(v)?Object.entries(v).map(([a,b])=>[title(a),typeof b==="object"?JSON.stringify(b):b]):[[title(k),v]]}/></div>)}</div>}
function Table({rows=[],cols,empty="No records available."}){if(!rows.length)return <Empty t={empty}/>;return <div className="tablewrap"><table><thead><tr>{cols.map(([h],i)=><th key={h||i}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||i}>{cols.map(([h,f],j)=><td key={h||j}>{f(r)}</td>)}</tr>)}</tbody></table></div>}
function Empty({t}){return <div className="empty">{t}</div>}
function Brand({small=false}){return <img src={chrisLogo} alt="CHRiS" className={small?"brandlogo small":"brandlogo"}/>}

function Login({login,setLogin,submit,submitting,error}){
 const [showPassword,setShowPassword]=useState(false);
 useEffect(()=>{
   const clearFields=()=>{
     setLogin({email:"",password:""});
     setShowPassword(false);
   };
   clearFields();
   const a=window.setTimeout(clearFields,100),b=window.setTimeout(clearFields,600);
   const onShow=()=>clearFields();
   window.addEventListener("pageshow",onShow);
   return()=>{window.clearTimeout(a);window.clearTimeout(b);window.removeEventListener("pageshow",onShow)};
 },[setLogin]);
 return <main className="esslogin" style={{backgroundImage:`linear-gradient(135deg,rgba(3,45,29,.42),rgba(0,0,0,.16)),url(${loginBackground})`}}>
   <div className="esslogin-glow"/>
   <div className="ess-admin-login-card">
     <div className="ess-admin-header">
       <div className="ess-welcome">Welcome to</div>
       <img src={chrisLogo} alt="CHRIS" className="ess-admin-logo"/>
       <div className="ess-corporate">CorporateHR Network</div>
       <div className="ess-information">Information System</div>
       <div className="ess-divider" aria-hidden="true"/>
     </div>
     {error&&<div className="ess-error">{error}</div>}
     <form onSubmit={submit} autoComplete="off">
       <input type="text" name="username" autoComplete="username" tabIndex="-1" aria-hidden="true" className="autofill-decoy"/>
       <input type="password" name="password" autoComplete="current-password" tabIndex="-1" aria-hidden="true" className="autofill-decoy"/>
       <label className="ess-field-label">Email Address
         <div className="ess-input-wrap"><FiMail className="ess-input-icon" size={18}/>
           <input required type="email" name="chris_account_identifier" autoComplete="off" spellCheck="false" value={login.email} onChange={e=>setLogin({...login,email:e.target.value})} placeholder="Enter your email address"/>
         </div>
       </label>
       <label className="ess-field-label">Password
         <div className="ess-input-wrap"><FiLock className="ess-input-icon" size={18}/>
           <input required type={showPassword?"text":"password"} name="chris_secure_access" autoComplete="new-password" value={login.password} onChange={e=>setLogin({...login,password:e.target.value})} placeholder="Enter your password"/>
           <button type="button" className="password-toggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?"Hide password":"Show password"} title={showPassword?"Hide password":"Show password"}>{showPassword?<FiEyeOff size={19}/>:<FiEye size={19}/>}</button>
         </div>
       </label>
       <button className="ess-signin" disabled={submitting}>{submitting?"Signing in...":"Sign In"}</button>
     </form>
     <div className="ess-login-footer"><span>People</span><b>|</b><span>Performance</span><b>|</b><span>Rewards</span></div>
   </div>
 </main>
}
const CSS=`
*{box-sizing:border-box}
html,body,#root{margin:0;min-height:100%;font-family:Inter,Arial,Helvetica,sans-serif}
body{background:#07110C;color:#F3F7F4}
.esslogin{min-height:100vh;position:relative;display:flex;align-items:center;justify-content:center;padding:32px;box-sizing:border-box;background-size:cover;background-position:center;background-repeat:no-repeat}
.esslogin-glow{position:absolute;inset:0;background:radial-gradient(circle at 18% 20%,rgba(212,175,55,.13),transparent 38%);pointer-events:none}
.ess-admin-login-card{width:100%;max-width:460px;position:relative;z-index:1;background:linear-gradient(180deg,rgba(3,12,8,.94),rgba(5,24,15,.92));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(212,175,55,.38);border-radius:24px;padding:38px;box-shadow:0 28px 80px rgba(0,0,0,.46),0 0 30px rgba(8,122,67,.12)}
.ess-admin-header{text-align:center;margin-bottom:28px}
.ess-welcome{color:#D4AF37;font-size:16px;font-weight:800;letter-spacing:.04em;margin-bottom:8px}
.ess-admin-logo{display:block;width:245px;max-width:92%;height:auto;margin:0 auto 5px;object-fit:contain;animation:chrisEssLogoPulse 2.5s ease-in-out infinite}
@keyframes chrisEssLogoPulse{0%,100%{opacity:1;transform:scale(1);filter:drop-shadow(0 0 6px rgba(0,155,74,.24)) drop-shadow(0 0 5px rgba(212,175,55,.15))}50%{opacity:.64;transform:scale(1.035);filter:drop-shadow(0 0 14px rgba(0,185,88,.40)) drop-shadow(0 0 11px rgba(212,175,55,.28))}}
.ess-corporate{margin-top:3px;color:#087A43;font-size:17px;font-weight:900;line-height:1.25;letter-spacing:.01em;text-shadow:0 0 9px rgba(8,122,67,.22)}
.ess-information{margin-top:5px;color:#D4AF37;font-size:10px;font-weight:800;line-height:1.3;letter-spacing:.16em;text-transform:uppercase;text-shadow:0 0 8px rgba(212,175,55,.18)}
.ess-divider{width:62%;height:1px;margin:15px auto 0;background:linear-gradient(90deg,transparent 0%,rgba(8,122,67,.72) 25%,rgba(212,175,55,.92) 50%,rgba(8,122,67,.72) 75%,transparent 100%)}
.ess-field-label{display:block;margin-bottom:18px;color:#D7E4DC;font-size:13px;font-weight:800}
.ess-input-wrap{position:relative;width:100%;margin-top:8px}
.ess-input-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#64748B;pointer-events:none}
.ess-input-wrap input{width:100%;padding:13px 50px 13px 43px;box-sizing:border-box;border:1px solid rgba(8,122,67,.70);border-radius:11px;background:rgba(2,10,7,.62);color:#F8FAF9;font-size:14px;outline:none}
.ess-input-wrap input:focus{border-color:#D4AF37;box-shadow:0 0 0 3px rgba(212,175,55,.10)}
.password-toggle{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:transparent!important;color:#475569;border:none;border-radius:8px;cursor:pointer;padding:0;transition:none!important;box-shadow:none!important;outline:none!important}
.password-toggle:hover,.password-toggle:focus,.password-toggle:focus-visible,.password-toggle:active{background:transparent!important;color:#475569!important;transform:translateY(-50%)!important;transition:none!important;box-shadow:none!important;outline:none!important}
.autofill-decoy{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.ess-signin{width:100%;border:none;border-radius:11px;padding:14px;background:linear-gradient(90deg,#075F36,#0B7A45);color:#fff;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.30),0 0 14px rgba(8,122,67,.18)}
.ess-signin:disabled{background:#688B79;cursor:not-allowed;opacity:.8}
.ess-error{margin-bottom:20px;padding:13px 15px;background:rgba(254,242,242,.94);border:1px solid #FECACA;border-radius:10px;color:#B91C1C;font-size:13px;font-weight:600;line-height:1.5}
.ess-login-footer{margin-top:28px;height:1px;background:rgba(203,213,225,.70);position:relative;padding-top:20px;display:flex;justify-content:center;gap:10px;color:#7FAF96;font-size:12px;font-weight:700}
.ess-login-footer b{color:#D4AF37}
@media(max-width:760px){.esslogin{padding:18px}.ess-admin-login-card{padding:28px 24px;border-radius:20px}.ess-admin-logo{width:220px}.ess-welcome{font-size:15px}.ess-corporate{font-size:16px}}
`;

