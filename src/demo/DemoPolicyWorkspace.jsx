import {useEffect,useState} from "react";
import {Link,useLocation} from "react-router-dom";
import {apiRequest,getStoredOrganization} from "../services/api";
import {getNorthstarPreview,northstarArchitecture} from "./northstarModuleArchitecture";
import {northstarCohort,northstarCohortOverview} from "./northstarSyntheticCohort";

const panel={background:"rgba(9,35,24,.92)",border:"1px solid rgba(212,175,55,.27)",borderRadius:12,padding:18};
const td={padding:"10px 12px",textAlign:"left",borderBottom:"1px solid rgba(212,175,55,.18)",fontSize:13};
const heading={color:"#f0ce60",margin:"0 0 8px"};
export default function DemoPolicyWorkspace(){
 const {pathname}=useLocation();
 const organization=getStoredOrganization()||{};
 const preview=getNorthstarPreview(pathname);
 const loans=preview.key==="loan";
 const cohortOverview=northstarCohortOverview();
 const sampleRows=preview.key==="loan"?northstarCohort.loans:
  preview.key==="leave"?northstarCohort.leave:
  preview.key==="performance"?northstarCohort.performance:
  preview.key==="payroll"?northstarCohort.payroll:
  preview.key==="benefit"?northstarCohort.benefits:
  northstarCohort.employees;
 const employeeLabel=id=>northstarCohort.employees.find(e=>e.id===id)?.displayName||"Fictional record";

 const [loanRows,setLoanRows]=useState([]);
 const [loanError,setLoanError]=useState("");
 useEffect(()=>{
  if(!loans)return;
  let active=true;
  apiRequest("/api/loans").then(r=>{
   const data=r.data;
   const rows=Array.isArray(data)?data:Array.isArray(data?.loans)?data.loans:[];
   if(active)setLoanRows(rows);
  }).catch(()=>{
   if(active)setLoanError("Saved fictional loan records could not be loaded; the illustrative workflow remains available.");
  });
  return()=>{active=false};
 },[loans]);

 return <section className="chris-panel" aria-label="Northstar independent demonstration workspace" style={{color:"#f7faf8",padding:24,maxWidth:1200,margin:"0 auto"}}>
  <p style={{color:"#f0ce60",fontSize:12,fontWeight:800,letterSpacing:1}}>CHRiS · NORTHSTAR DEMO INDUSTRIES</p>
  <h1 style={{fontSize:26,margin:"8px 0"}}>{preview.title}</h1>
  <p style={{maxWidth:760,lineHeight:1.7,color:"#cfdbd3"}}>{preview.intro} These examples belong to {organization.name||"Northstar Demo Industries"} and are entirely fictional. No customer-specific rules or production records are used.</p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,margin:"20px 0"}}>
   {preview.metrics.map(([label,value])=><div key={label} style={panel}><small style={{color:"#c1d0c8"}}>{label}</small><div style={{fontWeight:800,fontSize:19,marginTop:8}}>{value}</div></div>)}
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(275px,1fr))",gap:16}}>
   <section style={panel} aria-label="Illustrative workflow">
    <h2 style={{...heading,fontSize:18}}>Module structure and workflow</h2>
    <ol style={{lineHeight:1.9,paddingLeft:23,marginBottom:0}}>{preview.steps.map(step=><li key={step}>{step}</li>)}</ol>
    <p style={{fontSize:12,color:"#c5d2ca"}}>Workflow preview only — approvals, database edits, payroll calculations, emails and payments are disabled.</p>
   </section>
   <section style={panel} aria-label="Fictional records">
    <h2 style={{...heading,fontSize:18}}>Illustrative records</h2>
    {preview.rows.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:390}}>
     <thead><tr>{["Reference","Period","Description","Status"].map(h=><th key={h} scope="col" style={{...td,color:"#f0ce60"}}>{h}</th>)}</tr></thead>
     <tbody>{preview.rows.map(row=><tr key={row.id}><td style={td}>{row.id}</td><td style={td}>{row.period}</td><td style={td}>{row.description}</td><td style={td}>{row.status}</td></tr>)}</tbody>
    </table></div>:<p style={{color:"#c5d2ca"}}>Select a module below to inspect its independent demonstration structure.</p>}
   </section>
  </div>
  {loans&&<section style={{...panel,marginTop:16}} aria-label="Northstar demo loan register">
   <h2 style={{...heading,fontSize:18}}>Tenant-scoped loan register</h2>
   {loanError&&<p role="status" style={{color:"#c5d2ca"}}>{loanError}</p>}
   {!loanError&&(!loanRows.length?<p>No saved fictional loan records were returned.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
    <thead><tr>{["Loan reference","Status","Principal","Outstanding"].map(h=><th scope="col" key={h} style={{...td,color:"#f0ce60"}}>{h}</th>)}</tr></thead>
    <tbody>{loanRows.map((row,i)=><tr key={row.id||i}><td style={td}>{row.loanNumber||row.reference||"Fictional loan"}</td><td style={td}>{row.status||"—"}</td><td style={td}>{Number(row.principalAmount||row.loanAmount||0).toLocaleString("en-NG")}</td><td style={td}>{Number(row.outstandingAmount??row.balance??0).toLocaleString("en-NG")}</td></tr>)}</tbody>
   </table></div>)}
  </section>}
  <section style={{...panel,marginTop:16}} aria-label="Linked fictional organization records">
   <h2 style={{...heading,fontSize:18}}>Consistent fictional workforce dataset</h2>
   <p style={{color:"#c5d2ca",fontSize:13,lineHeight:1.65}}>This separate sample dataset demonstrates cross-module relationships without querying or changing Northstar's existing staging employees or any other customer's records. Its 48 imaginary colleagues are not asserted to match the 48 saved demo employee profiles.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:9}}>
    {Object.entries(cohortOverview).map(([key,value])=><div key={key} style={{padding:10,borderRadius:9,border:"1px solid rgba(212,175,55,.2)"}}><small style={{color:"#c5d2ca"}}>{key.replace(/([A-Z])/g," $1")}</small><div style={{fontWeight:800,fontSize:18}}>{value}</div></div>)}
   </div>
   <details style={{marginTop:16}}>
    <summary style={{cursor:"pointer",color:"#f0ce60",fontWeight:700}}>Inspect linked sample records for this module ({sampleRows.length})</summary>
    <div style={{maxHeight:300,overflow:"auto",marginTop:10}}><table style={{width:"100%",borderCollapse:"collapse"}}>
     <thead><tr>{["Reference","Fictional employee / candidate","Sample state"].map(h=><th key={h} scope="col" style={{...td,color:"#f0ce60"}}>{h}</th>)}</tr></thead>
     <tbody>{sampleRows.slice(0,48).map(row=><tr key={row.id}><td style={td}>{row.id}</td><td style={td}>{row.employeeId?employeeLabel(row.employeeId):row.displayName||row.candidate||"Fictional"}</td><td style={td}>{row.status||row.latestStatus||row.stage||row.period||row.program||"Illustrative"}</td></tr>)}</tbody>
    </table></div>
   </details>
  </section>
  <section style={{...panel,marginTop:16}} aria-label="Northstar module architecture">
   <h2 style={{...heading,fontSize:18}}>CHRiS module architecture</h2>
   <p style={{color:"#c5d2ca",fontSize:13}}>Shared navigation mirrors the commercial system structure. Only expressly enabled demonstration modules contain fictional records; unavailable workflows remain illustrative and cannot change records.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(225px,1fr))",gap:10}}>
    {northstarArchitecture.map(item=><Link key={item.key} to={item.route} style={{display:"block",padding:11,border:"1px solid rgba(212,175,55,.24)",borderRadius:9,textDecoration:"none",color:"#f7faf8"}}>
      <strong style={{display:"block",color:"#f0ce60"}}>{item.name}</strong><small style={{display:"block",margin:"5px 0",color:"#c5d2ca",lineHeight:1.5}}>{item.description}</small><small style={{fontWeight:700,color:"#c5d2ca"}}>{item.stage}</small>
    </Link>)}
   </div>
  </section>
  <p style={{fontSize:12,color:"#c5d2ca",marginTop:18}}>Read-only fictional demonstration · no transfer of customer records · no customer policy replication · no external approvals or payments.</p>
 </section>;
}
