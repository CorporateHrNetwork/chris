import { useState } from "react";
import { apiRequest, apiDownload, saveDownloadedBlob } from "../../services/api";
import HistoricalReconciliationPanel from "./HistoricalReconciliationPanel";

const money = value => value == null ? "Not available" : new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN"}).format(value);
const SECTIONS = ["Gross salary","Net salary","PAYE","Employee pension","Employer pension","NHF","NSITF","ITF"];
function Summary({ title, value }) { return <div style={{border:"1px solid #d8e1d9",borderRadius:12,padding:16,background:"#fff"}}><div style={{color:"#53665a",fontSize:13}}>{title}</div><strong style={{fontSize:21,color:"#17603f"}}>{value}</strong></div>; }
export default function ConsolidatedStatutoryWorkspace() {
  const [year,setYear] = useState(2026);
  const [workbook,setWorkbook] = useState(null);
  const [summary,setSummary] = useState(null);
  const [historical,setHistorical] = useState(null);
  const [staged,setStaged] = useState(null);
  const [batches,setBatches] = useState([]);
  const [activeBatchId,setActiveBatchId] = useState("");
  const [verified,setVerified] = useState(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState("");
  const base = "/api/reports/consolidated-statutory";
  async function action(kind) {
    setError(""); setBusy(kind);
    try {
      if (kind==="batches") {
        const result=await apiRequest(`${base}/historical/batches?year=${year}`);
        setBatches(result.data||[]);
      } else if(kind==="verified") {
        const result=await apiRequest(`${base}/verified-preview?year=${year}`);
        setVerified(result.data);
      } else if(kind==="verifiedExport") {
        const result=await apiDownload(`${base}/verified-export.xlsx?year=${year}`);
        saveDownloadedBlob(result);
      } else if (kind==="payroll") {
        const result=await apiRequest(`${base}/approved-preview?year=${year}`);
        setSummary(result.data);
      } else {
        if (!workbook) throw new Error("Choose the January–September historical workbook first.");
        const form = new FormData(); form.append("workbook",workbook);
        if(kind==="stage") {
          const result=await apiRequest(`${base}/historical/stage?year=${year}`,{method:"POST",body:form});
          setStaged(result.data);
        } else if(kind==="historical") {
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
      <strong>Reconciliation workspace.</strong> Historical sources can be staged without posting to payroll. Only manually verified historical records enter the verified-sources report; approved payrolls are treated as deemed remitted for internal reporting, not as payment evidence.
    </div>
    <section style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"end",marginBottom:22}}>
      <label style={{display:"grid",gap:6}}>Reporting year <select value={year} onChange={e=>setYear(Number(e.target.value))} style={{padding:10,borderRadius:8}}>{Array.from({length:Math.max(3,new Date().getFullYear()-2026+3)},(_,i)=>2026+i).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label style={{display:"grid",gap:6}}>Historical Excel file <input type="file" accept=".xlsx" onChange={e=>setWorkbook(e.target.files?.[0]||null)} /></label>
      <button type="button" disabled={!!busy} onClick={()=>action("payroll")}>Review approved payroll</button>
      <button type="button" disabled={!!busy || !workbook} onClick={()=>action("historical")}>Preview historical import</button>
      <button type="button" disabled={!!busy || !workbook || !historical} onClick={()=>action("stage")}>Stage historical source for reconciliation</button>
      <button type="button" disabled={!!busy} onClick={()=>action("batches")}>View staged source batches</button>
      <button type="button" disabled={!!busy || !workbook} onClick={()=>action("export")}>Export unreconciled Excel preview</button>
      <button type="button" disabled={!!busy} onClick={()=>action("verified")}>Review verified sources</button>
      <button type="button" disabled={!!busy} onClick={()=>action("verifiedExport")}>Export verified-sources workbook</button>
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
      <p>Excel sheets: Executive Summary, Abuja, Lagos, Port Harcourt, Combined, Employee Annual Summary, Exited Historical, PAYE Register, Pension Register, Other Statutories, Gross & Net Salaries, Monthly Reconciliation, Exceptions & Audit Trail. Annual employee summaries require a verified CHRiS employee identity; historical net salary is marked partial where the source does not provide it.</p>
    </section>
    {staged && <p role="status">Historical source staged: {staged.batchId} — {staged.status}. No payroll changes performed.</p>}
    {verified && <section style={{marginBottom:16}}><h2 style={{fontSize:18}}>Verified-sources summary</h2><p>Rows: {verified.rows} · Gross salary: {money(verified.totals?.grossSalary)} · Net salary: {money(verified.totals?.netSalary)} · Reconciliation flags: {verified.exceptions?.length||0}</p><small>Only verified historical imports and approved payroll records are included; do not interpret deemed-remitted as payment evidence.</small></section>}
    {batches.length>0 && <section><h2 style={{fontSize:18}}>Staged historical sources</h2><table style={{width:"100%"}}><thead><tr><th align="left">File</th><th align="left">Year</th><th align="left">Rows</th><th align="left">Status</th><th align="left">Review</th></tr></thead><tbody>{batches.map(x=><tr key={x.id}><td>{x.originalFilename}</td><td>{x.reportYear}</td><td>{x.rowCount}</td><td>{x.status}</td><td><button type="button" onClick={()=>setActiveBatchId(x.id)}>Reconcile</button></td></tr>)}</tbody></table></section>}
    {activeBatchId && <HistoricalReconciliationPanel key={activeBatchId} batchId={activeBatchId} onVerified={()=>action("batches")} />}
    {historical && <section style={{padding:18,border:"1px solid #d8e1d9",borderRadius:12}}>
      <h2 style={{fontSize:18}}>Historical file validation</h2>
      <p>Imported rows in preview: <strong>{historical.importedRows}</strong> · Exceptions: <strong>{historical.exceptions.length}</strong></p>
      <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Sheet</th><th align="left">Rows accepted</th><th align="left">Source PAYE reconciliation</th></tr></thead><tbody>{historical.diagnostics.map(x=><tr key={x.sheet}><td>{x.sheet}</td><td>{x.accepted}</td><td>{x.sourceReconciliation ? `Gross difference: ${money(x.sourceReconciliation.grossDelta)}; PAYE difference: ${money(x.sourceReconciliation.payeDelta)}` : "—"}</td></tr>)}</tbody></table>
      <details><summary>Validation exceptions ({historical.exceptions.length})</summary><div style={{maxHeight:320,overflow:"auto"}}>{historical.exceptions.slice(0,150).map((x,i)=><p key={i}>{x.code} — {x.employeeNo || x.employeeName || x.sourceId || x.sheet || "Source record"} {x.rowNumber ? `(row ${x.rowNumber})` : ""}</p>)}</div></details>
    </section>}
  </main>;
}
