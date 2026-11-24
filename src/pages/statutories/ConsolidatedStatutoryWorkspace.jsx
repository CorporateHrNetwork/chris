import { useState } from "react";
import { apiRequest, apiDownload, saveDownloadedBlob } from "../../services/api";

const money = value => value == null ? "Not available" : new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN"}).format(value);
const SECTIONS = ["Gross salary","Net salary","PAYE","Employee pension","Employer pension","NHF","NSITF","ITF"];
function Summary({ title, value }) { return <div style={{border:"1px solid #d8e1d9",borderRadius:12,padding:16,background:"#fff"}}><div style={{color:"#53665a",fontSize:13}}>{title}</div><strong style={{fontSize:21,color:"#17603f"}}>{value}</strong></div>; }
export default function ConsolidatedStatutoryWorkspace() {
  const [year,setYear] = useState(2026);
  const [workbook,setWorkbook] = useState(null);
  const [summary,setSummary] = useState(null);
  const [historical,setHistorical] = useState(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState("");
  const base = "/api/reports/consolidated-statutory";
  async function action(kind) {
    setError(""); setBusy(kind);
    try {
      if (kind==="payroll") {
        const result=await apiRequest(`${base}/approved-preview?year=${year}`);
        setSummary(result.data);
      } else {
        if (!workbook) throw new Error("Choose the January–September historical workbook first.");
        const form = new FormData(); form.append("workbook",workbook);
        if(kind==="historical") {
          const result=await apiRequest(`${base}/historical/preview?year=${year}`,{method:"POST",body:form});
          setHistorical(result.data);
        } else {
          const result=await apiDownload(`${base}/combined-preview.xlsx?year=${year}`,{method:"POST",body:form});
          saveDownloadedBlob(result);
        }
      }
    } catch(e) { setError(e.message || "Unable to prepare the report."); }
    finally { setBusy(""); }
  }
  return <main style={{padding:"24px",maxWidth:1240,margin:"auto",color:"#233c30"}}>
    <header style={{marginBottom:18}}>
      <small style={{color:"#668273"}}>Statutories / Reporting & Analytics</small>
      <h1 style={{fontSize:27,margin:"8px 0"}}>Consolidated Statutory & Payroll Register</h1>
      <p style={{color:"#587063"}}>A permanent CHRiS workspace for annual statutory, gross and net salary reporting across branches.</p>
    </header>
    <div role="status" style={{padding:12,borderRadius:10,background:"#f3f6f1",border:"1px solid #d5dfd4",marginBottom:20}}>
      <strong>Unreconciled preview only.</strong> Imported historical records are not saved. Employee identities and branch assignments require verification before the report can become an authoritative register. Approved payroll is deemed remitted for internal reporting only.
    </div>
    <section style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"end",marginBottom:22}}>
      <label style={{display:"grid",gap:6}}>Reporting year <select value={year} onChange={e=>setYear(Number(e.target.value))} style={{padding:10,borderRadius:8}}>{Array.from({length:Math.max(3,new Date().getFullYear()-2026+3)},(_,i)=>2026+i).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label style={{display:"grid",gap:6}}>Historical Excel file <input type="file" accept=".xlsx" onChange={e=>setWorkbook(e.target.files?.[0]||null)} /></label>
      <button type="button" disabled={!!busy} onClick={()=>action("payroll")}>Review approved payroll</button>
      <button type="button" disabled={!!busy || !workbook} onClick={()=>action("historical")}>Preview historical import</button>
      <button type="button" disabled={!!busy || !workbook} onClick={()=>action("export")}>Export unreconciled Excel preview</button>
    </section>
    {error && <p role="alert" style={{color:"#9b2e2e"}}>{error}</p>}
    {busy && <p role="status">Preparing {busy} preview…</p>}
    <section aria-label="Payroll summary" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:24}}>
      <Summary title="Approved payroll lines" value={summary?.approvedPayrollLines ?? "—"}/>
      <Summary title="Gross salary" value={money(summary?.totals?.grossSalary)}/>
      <Summary title="Net salary" value={money(summary?.totals?.netSalary)}/>
      <Summary title="PAYE" value={money(summary?.totals?.paye)}/>
      <Summary title="Employee pension" value={money(summary?.totals?.pensionEmployee)}/>
      <Summary title="Employer pension" value={money(summary?.totals?.pensionEmployer)}/>
    </section>
    <section style={{padding:18,background:"#fff",border:"1px solid #d8e1d9",borderRadius:12,marginBottom:16}}>
      <h2 style={{fontSize:18}}>Available report components</h2>
      <p>{SECTIONS.join(" · ")}. Other configured statutory deductions will be identified separately.</p>
      <p>Excel sheets: Executive Summary, Abuja, Lagos, Port Harcourt, Combined, PAYE Register, Pension Register, Other Statutories, Gross & Net Salaries, Monthly Reconciliation, Exceptions & Audit Trail.</p>
    </section>
    {historical && <section style={{padding:18,border:"1px solid #d8e1d9",borderRadius:12}}>
      <h2 style={{fontSize:18}}>Historical file validation</h2>
      <p>Imported rows in preview: <strong>{historical.importedRows}</strong> · Exceptions: <strong>{historical.exceptions.length}</strong></p>
      <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Sheet</th><th align="left">Rows accepted</th></tr></thead><tbody>{historical.diagnostics.map(x=><tr key={x.sheet}><td>{x.sheet}</td><td>{x.accepted}</td></tr>)}</tbody></table>
      <details><summary>Validation exceptions ({historical.exceptions.length})</summary><div style={{maxHeight:320,overflow:"auto"}}>{historical.exceptions.slice(0,150).map((x,i)=><p key={i}>{x.code} — {x.employeeNo || x.employeeName || x.sourceId || x.sheet || "Source record"} {x.rowNumber ? `(row ${x.rowNumber})` : ""}</p>)}</div></details>
    </section>}
  </main>;
}
