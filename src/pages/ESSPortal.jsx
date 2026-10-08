import { useEffect, useState } from "react";
import loginBackground from "../assets/images/login-bg.png";
import chrisLogo from "../assets/images/chris-logo.png";
import { API_BASE_URL, clearEssAuthSession, essRequest, getEssAuthToken } from "../services/essApi";

const ORG_SLUG = "zermatt-liquor-limited";
const NAV = [["overview","Overview"],["profile","My Profile"],["onboarding","Onboarding"],["statutory","Statutory"],["payroll","Payment & Payroll"],["payslips","Payslips"],["leave","Leave & Attendance"],["performance","Performance Evaluation"],["documents","Documents"]];
const RATINGS = ["EXCELLENT","SATISFACTORY","ACCEPTABLE","UNSATISFACTORY"];
const money=(v,c="NGN")=>Number.isFinite(Number(v))?new Intl.NumberFormat("en-NG",{style:"currency",currency:c||"NGN",maximumFractionDigits:2}).format(Number(v)): "—";
const date=v=>{if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-NG",{day:"2-digit",month:"short",year:"numeric"}).format(d)};
const title=v=>String(v||"").replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const val=v=>v===null||v===undefined||v===""?"—":String(v);
const initials=e=>[e?.firstName,e?.lastName].filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase()||"CH";
const icon=k=>({overview:"⌂",profile:"👤",onboarding:"✓",statutory:"▣",payroll:"₦",payslips:"▤",leave:"◷",performance:"★",documents:"▤"}[k]||"•");

export default function ESSPortal(){
 const [auth,setAuth]=useState(Boolean(getEssAuthToken())),[data,setData]=useState(null),[tab,setTab]=useState("overview"),[loading,setLoading]=useState(Boolean(getEssAuthToken())),[error,setError]=useState(""),[login,setLogin]=useState({email:"",password:""}),[submitting,setSubmitting]=useState(false);
 useEffect(()=>{if(window.location.search)window.history.replaceState({},document.title,"/ess")},[]);
 const load=async()=>{setLoading(true);setError("");try{const r=await essRequest("/api/ess/dashboard");const d=r?.data||{};setData({profile:d.profile||{},onboarding:{completionPercent:0,currentStage:null,status:"NOT_STARTED",sectionProgress:{},sections:[],data:{},documents:[],...(d.onboarding||{})},statutory:{registered:{},obligations:[],...(d.statutory||{})},payment:d.payment||{},payroll:{payslips:[],latestPayslip:null,...(d.payroll||{})},leaveBalances:Array.isArray(d.leaveBalances)?d.leaveBalances:[],attendance:Array.isArray(d.attendance)?d.attendance:[],performance:Array.isArray(d.performance)?d.performance:[]});setAuth(true)}catch(e){setAuth(false);setData(null);setError(e.message||"Unable to load your employee portal.")}finally{setLoading(false)}};
 useEffect(()=>{if(getEssAuthToken())load();else setLoading(false)},[]);
 const submit=async e=>{e.preventDefault();setSubmitting(true);setError("");try{const r=await essRequest("/api/ess/login",{method:"POST",body:{...login,organizationSlug:ORG_SLUG}});sessionStorage.setItem("chris_ess_token",r.data.token);sessionStorage.setItem("chris_ess_employee",JSON.stringify(r.data.employee||{}));sessionStorage.setItem("chris_ess_organization",JSON.stringify(r.data.organization||{}));await load()}catch(e){setError(e.message||"Invalid employee login credentials.")}finally{setSubmitting(false)}};
 const signOut=()=>{clearEssAuthSession();setAuth(false);setData(null);setTab("overview")};
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

function Documents({data}){return <Page h="Documents" s="Documents attached to your CHRiS employee record."><Card><Table rows={data.onboarding.documents} empty="No employee documents are available." cols={[["Document",r=>r.originalName],["Category",r=>title(r.category)],["Type",r=>r.mimeType||"—"],["Uploaded",r=>date(r.createdAt)],["",r=><Doc id={r.id}/>]]}/></Card></Page>}

async function downloadFile(url,name){
 const r=await fetch(url,{headers:{Authorization:"Bearer "+localStorage.getItem("chris_ess_token")}});
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

function Login({login,setLogin,submit,submitting,error}){\n const [showPassword,setShowPassword]=useState(false);\n return <main className="esslogin" style={{backgroundImage:`linear-gradient(135deg,rgba(3,45,29,.42),rgba(0,0,0,.16)),url(${loginBackground})`}}>
   <div className="esslogin-glow"/>
   <div className="esslogin-center">
     <div className="esslogin-brand">
       <Brand/>
       <div className="esslogin-system">CorporateHr Network Information System</div>
     </div>
     <section className="ess-login-card">
       <div className="ess-card-head">
         <div className="ess-kicker">ZERMATT LIQUOR LIMITED</div>
         <h1>Employee Self-Service Portal</h1>
         <p>Secure access to your personal CHRiS employee profile, payroll, statutory information, leave, attendance and performance records.</p>
       </div>
       {error&&<div className="ess-error">{error}</div>}
       <form onSubmit={submit} autoComplete="off">
         <label>Email Address<input required type="email" autoComplete="username" value={login.email} onChange={e=>setLogin({...login,email:e.target.value})} placeholder="Enter your CHRiS email address"/></label>
         <label>Password<div className="password-wrap"><input required type={showPassword?"text":"password"} autoComplete="current-password" value={login.password} onChange={e=>setLogin({...login,password:e.target.value})} placeholder="Enter your password"/><button type="button" className="password-toggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?"Hide password":"Show password"} title={showPassword?"Hide password":"Show password"}>{showPassword?"◉":"◉"}</button></div></label>
         <div className="ess-login-meta"><span>Private employee access</span><span>Your account is limited to your own employee record.</span></div>
         <button className="ess-signin" disabled={submitting}>{submitting?"Signing in...":"Sign In"}</button>
       </form>
       <div className="ess-login-footer"><span>People</span><b>|</b><span>Performance</span><b>|</b><span>Rewards</span></div>
     </section>
   </div>
 </main>
}
const CSS=`
*{box-sizing:border-box}
html,body,#root{margin:0;min-height:100%;font-family:Inter,Arial,Helvetica,sans-serif}
body{background:#07110C;color:#F3F7F4}
.essshell{min-height:100vh;background:linear-gradient(135deg,#07110C 0%,#0A1510 48%,#07100B 100%);color:#F3F7F4;font-family:Inter,Arial,sans-serif}
.app{min-height:100vh}
header{height:72px;background:rgba(5,14,9,.96);border-bottom:1px solid rgba(212,175,55,.24);display:flex;align-items:center;justify-content:space-between;padding:0 28px;position:sticky;top:0;z-index:20;box-shadow:0 8px 30px rgba(0,0,0,.20)}
.brandrow,.headuser,.person{display:flex;align-items:center;gap:12px}
.brandrow strong{display:block;color:#fff;font-size:15px;letter-spacing:.02em}
.brandrow small,.headuser small{display:block;color:#91AA9D;font-size:10px;margin-top:2px}
.brandlogo{width:48px;height:48px;object-fit:contain}
.brandlogo.small{width:42px;height:42px}
.avatar,.bigavatar{display:grid;place-items:center;border-radius:50%;background:linear-gradient(135deg,#087A43,#075F36);color:#F7D66A;font-weight:900}
.avatar{width:38px;height:38px;font-size:12px;border:1px solid rgba(212,175,55,.35)}
.headuser b{display:block;color:#F4F8F5;font-size:12px}
.ghost{border:1px solid rgba(212,175,55,.45);background:rgba(8,31,21,.8);color:#F3D56A;border-radius:9px;padding:9px 13px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}
.ghost:hover{border-color:#D4AF37;background:#0A301F}
.body{display:grid;grid-template-columns:276px minmax(0,1fr);min-height:calc(100vh - 72px)}
aside{background:rgba(4,17,11,.92);border-right:1px solid rgba(212,175,55,.16);padding:20px 14px;display:flex;flex-direction:column;gap:4px}
.caption{color:#D4AF37;font-size:9px;font-weight:900;letter-spacing:.16em;padding:8px 12px 10px}
.nav{width:100%;border:1px solid transparent;background:transparent;color:#AFC1B6;text-align:left;border-radius:9px;padding:10px 12px;display:flex;align-items:center;gap:11px;font:inherit;font-size:11px;font-weight:750;cursor:pointer}
.nav i{width:20px;text-align:center;font-style:normal;font-size:15px;color:#8FA79B}
.nav b{margin-left:auto;color:#D4AF37;font-size:9px}
.nav:hover{background:rgba(8,122,67,.10);color:#fff;border-color:rgba(212,175,55,.12)}
.nav.active{background:linear-gradient(90deg,rgba(8,122,67,.28),rgba(8,122,67,.08));border-color:rgba(212,175,55,.28);color:#fff;box-shadow:inset 3px 0 #D4AF37}
.nav.active i{color:#F3D56A}
.sidefoot{margin-top:auto;padding:13px 12px;border-top:1px solid rgba(255,255,255,.07);color:#D4AF37;font-size:10px;font-weight:800;line-height:1.5}
.sidefoot small{display:block;color:#718A7E;font-weight:500;margin-top:3px}
main{min-width:0;padding:28px 30px 44px;background:radial-gradient(circle at 8% 5%,rgba(0,145,78,.14),transparent 25%),radial-gradient(circle at 92% 88%,rgba(212,175,55,.08),transparent 24%)}
.pagehead{max-width:1500px;margin:0 auto 20px}
.eyebrow{color:#D4AF37;font-size:9px;font-weight:900;letter-spacing:.13em}
.pagehead h2{margin:7px 0 4px;color:#fff;font-size:26px;line-height:1.2}
.pagehead p{margin:0;color:#93A99E;font-size:12px;line-height:1.6}
.hero{max-width:1500px;margin:0 auto 18px;padding:20px 22px;background:linear-gradient(135deg,rgba(7,45,28,.92),rgba(5,24,15,.92));border:1px solid rgba(212,175,55,.23);border-radius:14px;display:flex;align-items:center;justify-content:space-between;gap:20px;box-shadow:0 18px 45px rgba(0,0,0,.18)}
.bigavatar{width:58px;height:58px;font-size:17px;border:1px solid rgba(212,175,55,.35)}
.hero h1{margin:4px 0 3px;color:#fff;font-size:21px}
.hero p{margin:0;color:#9CB1A6;font-size:11px}
.pill{padding:6px 10px;border-radius:999px;background:rgba(8,122,67,.20);border:1px solid rgba(0,150,78,.35);color:#7EE0AD;font-size:9px;font-weight:900}
.metrics{max-width:1500px;margin:0 auto 18px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.metric{border:1px solid rgba(212,175,55,.16);background:rgba(8,25,17,.82);border-radius:12px;padding:14px;text-align:left;color:#fff;cursor:pointer}
.metric:hover{border-color:rgba(212,175,55,.45);transform:translateY(-1px)}
.metric span{display:block;color:#8FA79B;font-size:9px;font-weight:800}
.metric strong{display:block;color:#F3D56A;font-size:21px;margin:5px 0 2px}
.metric small{display:block;color:#718A7E;font-size:9px}
.twocol,.sectiongrid{max-width:1500px;margin:0 auto 18px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.card{max-width:1500px;margin:0 auto 18px;background:rgba(5,21,14,.86);border:1px solid rgba(212,175,55,.16);border-radius:13px;padding:17px;box-shadow:0 12px 35px rgba(0,0,0,.16)}
.cardhead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:13px}
.card h3{margin:0;color:#F2F6F3;font-size:13px}
.link{border:0;background:transparent;color:#F3D56A;font:inherit;font-size:10px;font-weight:800;cursor:pointer}
.quickgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.quick{border:1px solid rgba(212,175,55,.13);background:rgba(8,31,21,.60);border-radius:10px;padding:12px;display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;text-align:left;color:#fff;cursor:pointer}
.quick:hover{border-color:rgba(212,175,55,.38);background:rgba(8,48,31,.75)}
.quick>span{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;background:rgba(8,122,67,.22);color:#F3D56A;font-size:15px}
.quick b{display:block;font-size:10px}.quick small{display:block;color:#789084;font-size:9px;margin-top:3px}.quick{font-size:16px}
.muted,.empty{color:#81968C;font-size:10px;line-height:1.5}
.progress{height:7px;background:#14271E;border-radius:99px;overflow:hidden}.progress span{display:block;height:100%;background:linear-gradient(90deg,#087A43,#D4AF37);border-radius:99px}
.latest{display:flex;align-items:center;justify-content:space-between;gap:14px}.latest small{color:#83988E;font-size:10px}.latest strong{display:block;color:#F3D56A;font-size:18px;margin-top:5px}
.infogrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.info{padding:11px;border:1px solid rgba(212,175,55,.11);border-radius:9px;background:rgba(8,31,21,.46)}.info small{display:block;color:#789084;font-size:8px;text-transform:uppercase;letter-spacing:.05em}.info b{display:block;color:#EAF1ED;font-size:10px;margin-top:4px;word-break:break-word}
.group{margin-bottom:14px}.group h4{color:#D4AF37;font-size:11px;margin:0 0 8px}
.tablewrap{overflow:auto;border:1px solid rgba(212,175,55,.13);border-radius:10px}.tablewrap table{width:100%;border-collapse:collapse;min-width:620px}.tablewrap th{background:#0A2418;color:#D4AF37;font-size:9px;text-align:left;padding:10px;border-bottom:1px solid rgba(212,175,55,.20)}.tablewrap td{color:#C4D1C9;font-size:10px;padding:10px;border-bottom:1px solid rgba(255,255,255,.05)}.tablewrap tr:last-child td{border-bottom:0}
.tablebtn{border:1px solid rgba(212,175,55,.35);background:rgba(8,48,31,.7);color:#F3D56A;border-radius:7px;padding:6px 9px;font-size:9px;font-weight:800;cursor:pointer}
.field{display:grid;gap:6px;font-size:10px;font-weight:800;color:#D7E4DC;margin-bottom:12px}.field input,.field select,.field textarea,select,input,textarea{width:100%;border:1px solid rgba(8,122,67,.7);border-radius:9px;padding:10px;background:#06140D;color:#F8FAF9;font:inherit;font-size:11px}.field input:focus,select:focus,input:focus,textarea:focus{outline:none;border-color:#D4AF37;box-shadow:0 0 0 3px rgba(212,175,55,.10)}
.primary{width:100%;border:0;border-radius:9px;background:#087A43;color:#fff;padding:11px;font-weight:900;cursor:pointer}.primary:disabled{opacity:.6}
.notice{padding:10px;background:rgba(8,122,67,.14);border:1px solid rgba(0,150,78,.25);color:#7EE0AD;border-radius:8px;font-size:10px;margin-bottom:10px}.error{background:rgba(185,28,28,.14);border:1px solid rgba(254,202,202,.28);color:#FFB4AE;padding:9px;border-radius:8px;font-size:10px;margin:12px 0}
.security{margin-top:14px;padding:10px;background:rgba(8,122,67,.10);border:1px solid rgba(212,175,55,.12);border-radius:8px;font-size:10px;color:#B7C9BF;font-weight:800}.security small{font-weight:500;color:#728A7E}
.esslogin{min-height:100vh;position:relative;display:flex;align-items:center;justify-content:center;padding:32px;box-sizing:border-box;background-size:cover;background-position:center;background-repeat:no-repeat}
.esslogin-glow{position:absolute;inset:0;background:radial-gradient(circle at 18% 20%,rgba(212,175,55,.13),transparent 38%);pointer-events:none}
.esslogin-center{width:100%;max-width:460px;position:relative;z-index:1}.esslogin-brand{text-align:center;margin-bottom:18px}.esslogin-brand .brandlogo{margin:0 auto 7px;width:58px;height:58px}.esslogin-system{color:#D4AF37;font-size:10px;font-weight:800;letter-spacing:.08em}.ess-login-card{width:100%;background:linear-gradient(180deg,rgba(3,12,8,.96),rgba(5,24,15,.94));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(212,175,55,.38);border-radius:20px;padding:34px;box-shadow:0 28px 80px rgba(0,0,0,.46),0 0 30px rgba(8,122,67,.12)}.ess-card-head{text-align:center;margin-bottom:22px}.ess-kicker{color:#D4AF37;font-size:10px;font-weight:900;letter-spacing:.12em;margin-bottom:8px}.ess-card-head h1{margin:0;color:#fff;font-size:25px;line-height:1.2;font-weight:850}.ess-card-head p{margin:10px 0 0;color:#A8C3B5;font-size:12px;line-height:1.6}.ess-login-card form{display:grid;gap:14px}.ess-login-card label{display:block;color:#D7E4DC;font-size:12px;font-weight:800}.ess-login-card input{margin-top:7px;width:100%;padding:12px 13px;box-sizing:border-box;border:1px solid rgba(8,122,67,.7);border-radius:10px;background:rgba(2,10,7,.72);color:#F8FAF9;font-size:13px;outline:none}.ess-login-card input:focus{border-color:#D4AF37;box-shadow:0 0 0 3px rgba(212,175,55,.10)}.ess-login-meta{padding:11px 12px;border-radius:9px;background:rgba(240,253,244,.06);border:1px solid rgba(212,175,55,.14);color:#D7E4DC;font-size:10px;line-height:1.5}.ess-login-meta span{display:block}.ess-login-meta span:first-child{font-weight:900;color:#D4AF37;margin-bottom:3px}.ess-login-meta span:last-child{color:#9DB9AA;font-weight:500}.ess-signin{width:100%;border:0;border-radius:10px;padding:13px;background:#087A43;color:#fff;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.30)}.ess-signin:disabled{background:#688B79;cursor:not-allowed;opacity:.8}.ess-login-footer{margin-top:20px;padding-top:16px;border-top:1px solid rgba(203,213,225,.16);display:flex;justify-content:center;gap:10px;color:#7FAF96;font-size:10px;font-weight:700}.ess-login-footer b{color:#D4AF37}.loading{text-align:center;margin:20vh auto;background:#071A10;border:1px solid rgba(212,175,55,.24);border-radius:16px;padding:32px;max-width:410px}.loading h2{color:#F3D56A}.loading p{font-size:11px;color:#81968C}
.password-wrap{position:relative}.password-wrap input{padding-right:48px}.password-toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:34px;height:34px;border:0;background:transparent;color:#D4AF37;font-size:18px;cursor:pointer;display:grid;place-items:center}.password-toggle:hover{color:#fff}.esslogin-brand .brandlogo{width:88px;height:88px}.esslogin-system{font-size:12px}.ess-card-head h1{font-size:29px}.ess-card-head p{font-size:14px}.ess-login-card label{font-size:14px}.ess-login-card input{font-size:15px;padding:14px 15px}.ess-login-meta{font-size:12px}.ess-signin{font-size:15px;padding:14px}.ess-login-footer{font-size:12px}.pagehead h2{font-size:29px}.pagehead p{font-size:14px}.nav{font-size:13px}.caption{font-size:11px}.brandrow strong{font-size:17px}.brandrow small,.headuser small{font-size:11px}.headuser b{font-size:13px}.ghost{font-size:12px}.card h3{font-size:15px}.metric span{font-size:11px}.metric strong{font-size:23px}.metric small{font-size:11px}.quick b{font-size:12px}.quick small{font-size:11px}.muted,.empty{font-size:12px}.info small{font-size:10px}.info b{font-size:12px}.group h4{font-size:13px}.tablewrap th{font-size:11px}.tablewrap td{font-size:12px}.tablebtn{font-size:11px}.field{font-size:12px}.field input,.field select,.field textarea,select,input,textarea{font-size:13px}.notice{font-size:12px}.loading p{font-size:13px}
@media(max-width:1000px){.metrics{grid-template-columns:repeat(2,1fr)}.infogrid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:760px){header{padding:0 13px;height:66px}.headuser>div:not(.avatar),.ghost{display:none}.body{display:block;min-height:calc(100vh - 66px)}aside{width:100%;min-height:auto;border-right:0;border-bottom:1px solid rgba(212,175,55,.16);display:grid;grid-template-columns:repeat(3,1fr);padding:7px;background:#04110B}.caption,.sidefoot{display:none}.nav{justify-content:center;padding:8px;font-size:9px}.nav span{display:none}.nav b{margin:0}.nav i{font-size:14px}.body main{padding:18px 12px 30px}.metrics,.twocol,.sectiongrid,.quickgrid{grid-template-columns:1fr}.infogrid{grid-template-columns:1fr}.hero{align-items:flex-start;gap:12px}.hero h1{font-size:19px}.esslogin{padding:18px}.ess-login-card{padding:24px;border-radius:16px}.ess-card-head h1{font-size:22px}}
`;
