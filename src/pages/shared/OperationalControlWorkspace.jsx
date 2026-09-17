import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";

const TITLES = {
  STATUTORIES: { DASHBOARD:"Statutory Dashboard", PAYE_TAX:"PAYE / Tax", PENSION_COMPLIANCE:"Pension Compliance", NHIA:"NHIA", NSITF:"NSITF", ITF:"ITF", REMITTANCES:"Remittances", REPORTS:"Statutory Reports" },
  PERFORMANCE: { DASHBOARD:"Performance Dashboard", GOALS_KPIS:"Goals / KPIs", CYCLES:"Performance Cycles", REVIEWS:"Reviews", APPRAISALS:"Appraisals", IMPROVEMENT_PLANS:"Improvement Plans", REPORTS:"Performance Reports" },
  ASSETS: { DASHBOARD:"Assets Dashboard", REGISTER:"Asset Register", CATEGORIES:"Asset Categories", ASSIGNMENT:"Asset Assignment", TRANSFERS:"Asset Transfers", RETURNS:"Asset Returns", MAINTENANCE:"Maintenance", REPORTS:"Asset Reports" },
  WORKFLOWS: { DASHBOARD:"Workflows & Approvals Dashboard", APPROVAL_INBOX:"Approval Inbox", MY_REQUESTS:"My Requests", TEMPLATES:"Workflow Templates", APPROVAL_CHAINS:"Approval Chains", DELEGATIONS:"Delegations", HISTORY:"Workflow History" },
  TRAINING: { DASHBOARD:"Training & Development Dashboard", PROGRAMS:"Training Programs", CALENDAR:"Training Calendar", EMPLOYEE_TRAINING:"Employee Training", LEARNING_RECORDS:"Learning Records", ASSESSMENTS:"Assessments", CERTIFICATIONS:"Certifications", REPORTS:"Training Reports" },
  REPORTS: { RECRUITMENT:"Recruitment Reports", COMPENSATION:"Compensation Reports", BENEFITS:"Benefits Reports", CUSTOM:"Custom Reports" },
};
const COPY = {
  STATUTORIES:["STATUTORY COMPLIANCE","Track statutory controls, payroll-linked compliance evidence, remittance actions, exceptions and reports."],
  PERFORMANCE:["PERFORMANCE MANAGEMENT","Track goals, cycles, reviews, appraisals, improvement actions and performance evidence with branch scope and audit history."],
  ASSETS:["ASSET CONTROL","Track asset inventory, categories, assignments, transfers, returns, maintenance actions and accountability with branch scope and audit history."],
  WORKFLOWS:["WORKFLOW CONTROL","Track approval items, requests, workflow templates, approval chains, delegations and workflow history with accountable owners and audit evidence."],
  TRAINING:["LEARNING & DEVELOPMENT","Track training programmes, calendars, employee participation, learning records, assessments, certifications and training evidence."],
  REPORTS:["REPORT CONTROL","Maintain controlled recruitment, compensation, benefits and custom reporting requests/outputs with ownership, status, evidence and audit history."],
};
const EMPLOYEE_MODULES = new Set(["PERFORMANCE","TRAINING","ASSETS"]);

export default function OperationalControlWorkspace({ module, area = "DASHBOARD" }) {
  const [data,setData]=useState(null); const [error,setError]=useState(""); const [notice,setNotice]=useState(""); const [search,setSearch]=useState("");
  const title=TITLES[module]?.[area]||`${module} ${area}`; const copy=COPY[module]||[module,"Controlled operational workspace."];
  const load=useCallback(async()=>{try{setError("");const r=await apiRequest(`/api/operations/${module}/${area}`);setData(r?.data||null);}catch(err){setError(err?.message||"Unable to load workspace.");}},[module,area]);
  useEffect(()=>{load();},[load]);
  const rows=useMemo(()=>{const term=search.trim().toLowerCase();const records=data?.records||[];if(!term)return records;return records.filter((row)=>[row.title,row.owner,row.employeeNumber,row.status,row.notes].some((v)=>String(v||"").toLowerCase().includes(term)));},[data,search]);

  async function createRecord(){
    const recordTitle=window.prompt(`${title}: enter a control item / record title`)?.trim(); if(!recordTitle)return;
    const owner=window.prompt("Owner / responsible person or team (optional)")?.trim()||null;
    const employeeNumber=EMPLOYEE_MODULES.has(module)?(window.prompt("Employee number if employee-specific (optional)")?.trim()||null):null;
    const dueDate=window.prompt("Due date YYYY-MM-DD (optional)")?.trim()||null;
    const reason=window.prompt("Reason / control basis (required)")?.trim(); if(!reason)return;
    const notes=window.prompt("Notes / evidence reference (optional)")?.trim()||null;
    try{await apiRequest(`/api/operations/${module}/${area}/records`,{method:"POST",body:{title:recordTitle,owner,employeeNumber,dueDate,reason,notes}});setNotice("Record created and added to the CHRiS audit trail.");await load();}catch(err){setError(err?.message||"Unable to create record.");}
  }
  async function updateStatus(row){
    const status=window.prompt("Status: OPEN, IN_PROGRESS, COMPLETED or CANCELLED",row.status)?.trim().toUpperCase(); if(!status||status===row.status)return;
    const reason=window.prompt("Reason for status change (required)")?.trim(); if(!reason)return;
    try{await apiRequest(`/api/operations/${module}/${area}/records/${row.id}/status`,{method:"PUT",body:{status,reason}});setNotice("Status updated and audit history preserved.");await load();}catch(err){setError(err?.message||"Unable to update status.");}
  }

  return <div style={{color:"var(--chris-text-main)"}}>
    <div style={{marginBottom:20}}><div style={eyebrow}>{copy[0]}</div><h1 style={heading}>{title}</h1><p style={lead}>{copy[1]}</p></div>
    <div style={metrics}><Metric label="Records" value={data?.summary?.total}/><Metric label="Open" value={data?.summary?.open}/><Metric label="In Progress" value={data?.summary?.inProgress}/><Metric label="Completed" value={data?.summary?.completed}/></div>
    {error&&<div style={errorBox}>{error}</div>}{notice&&<div style={noticeBox}>{notice}</div>}
    {module==="STATUTORIES"&&<PayrollContext rows={data?.payrollContext||[]}/>} 
    <section style={{...panel,marginTop:16}}><div style={toolbar}><div><h2 style={h2}>Operational Register</h2><p style={muted}>Create and progress controlled records. Every change remains in the organization audit trail.</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><input style={input} value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search records"/><button type="button" style={primary} onClick={createRecord}>+ Add Record</button></div></div>
      <div style={{overflowX:"auto"}}><table style={table}><thead><tr>{["Title","Owner","Employee","Due","Status","Notes","Action"].map((x)=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{rows.length?rows.map((row)=><tr key={row.id}><td style={tdStrong}>{row.title}</td><td style={td}>{row.owner||"—"}</td><td style={td}>{row.employeeNumber||"—"}</td><td style={td}>{row.dueDate||"—"}</td><td style={td}><span style={badge}>{row.status}</span></td><td style={td}>{row.notes||"—"}</td><td style={td}><button type="button" style={secondary} onClick={()=>updateStatus(row)}>Update</button></td></tr>):<tr><td style={td} colSpan={7}>No records yet. Use “Add Record” to start the controlled register.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
function PayrollContext({rows}){return <section style={{...panel,marginTop:16}}><h2 style={h2}>Payroll / Statutory Context</h2><p style={muted}>Recent payroll runs are linked here so statutory actions can be reconciled against actual payroll periods.</p><div style={{overflowX:"auto",marginTop:12}}><table style={table}><thead><tr>{["Period","Run Status","Statutory Status","Employees","Gross","Deductions"].map((x)=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{rows.length?rows.map((row)=><tr key={row.id}><td style={tdStrong}>{row.periodCode}</td><td style={td}>{row.status}</td><td style={td}>{row.statutoryStatus||"—"}</td><td style={td}>{row.employeeCount}</td><td style={td}>₦{Number(row.grossTotal||0).toLocaleString()}</td><td style={td}>₦{Number(row.deductionTotal||0).toLocaleString()}</td></tr>):<tr><td style={td} colSpan={6}>No payroll-run context available yet.</td></tr>}</tbody></table></div></section>;}
function Metric({label,value}){return <div style={panel}><div style={muted}>{label}</div><div style={{fontSize:27,fontWeight:900,marginTop:6}}>{value??"—"}</div></div>;}
const panel={background:"linear-gradient(145deg,rgba(12,38,26,.90),rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:18,boxShadow:"var(--chris-shadow-card)"}; const eyebrow={color:"var(--chris-gold)",fontSize:11,fontWeight:900,letterSpacing:".14em"}; const heading={margin:"6px 0",fontSize:30}; const lead={color:"var(--chris-text-secondary)",lineHeight:1.6,maxWidth:980}; const metrics={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}; const toolbar={display:"flex",justifyContent:"space-between",alignItems:"end",gap:12,flexWrap:"wrap"}; const h2={margin:"0 0 5px",fontSize:19}; const muted={margin:0,color:"var(--chris-text-secondary)",fontSize:12,lineHeight:1.5}; const input={minWidth:220,padding:"10px 11px",borderRadius:9,border:"1px solid var(--chris-border-gold)",background:"rgba(255,255,255,.04)",color:"var(--chris-text-main)"}; const primary={border:0,borderRadius:9,padding:"10px 13px",background:"var(--chris-gold)",color:"#07140D",fontWeight:900,cursor:"pointer"}; const secondary={border:"1px solid var(--chris-border-gold)",borderRadius:8,padding:"7px 9px",background:"rgba(212,175,55,.08)",color:"var(--chris-gold)",fontWeight:800,cursor:"pointer"}; const table={width:"100%",minWidth:760,borderCollapse:"collapse",marginTop:12}; const th={padding:9,textAlign:"left",borderBottom:"1px solid var(--chris-border-gold)",color:"var(--chris-gold)",fontSize:11}; const td={padding:9,borderBottom:"1px solid var(--chris-border-soft)",color:"var(--chris-text-secondary)",fontSize:12}; const tdStrong={...td,color:"var(--chris-text-main)",fontWeight:800}; const badge={display:"inline-block",padding:"3px 7px",borderRadius:999,border:"1px solid var(--chris-border-soft)",color:"var(--chris-gold)",fontSize:10,fontWeight:900}; const errorBox={...panel,marginTop:14,color:"#FCA5A5"}; const noticeBox={...panel,marginTop:14,color:"#86EFAC"};
