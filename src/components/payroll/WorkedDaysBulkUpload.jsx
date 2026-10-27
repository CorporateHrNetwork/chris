import { useEffect, useState } from "react";
import { apiRequest, apiDownload, saveDownloadedBlob } from "../../services/api";
import useAuthorization from "../../hooks/useAuthorization";

export default function WorkedDaysBulkUpload({ periodId, onSaved }) {
  const { hasPermission } = useAuthorization();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inputKey, setInputKey] = useState(0);
  useEffect(() => { setFile(null); setPreview(null); setError(""); setMessage(""); setInputKey(k => k+1); }, [periodId]);
  if (!hasPermission("attendance.manage") && !hasPermission("payroll.manage")) return null;
  async function download() {
    setBusy("download"); setError("");
    try { saveDownloadedBlob(await apiDownload(`/api/attendance/worked-days/bulk/template?payrollPeriodId=${encodeURIComponent(periodId)}`)); }
    catch(e) { setError(e.message || "Unable to download worked-days template."); }
    finally { setBusy(""); }
  }
  async function submit(action) {
    if (!file || !periodId) return;
    setBusy(action); setError(""); setMessage("");
    try {
      const body = new FormData(); body.append("file",file); body.append("payrollPeriodId",periodId);
      if (action === "import") body.append("previewToken",preview?.previewToken || "");
      const response = await apiRequest(`/api/attendance/worked-days/bulk/${action}`,{ method:"POST",body });
      if (action === "preview") setPreview(response.data);
      else {
        setMessage(`${response.data.importedRows} employee worked-days entries imported. Recalculate draft payroll before submission.`);
        setPreview(null); setFile(null); setInputKey(k=>k+1);
        if(onSaved) await onSaved(response.data);
      }
    } catch(e) { setPreview(null); setError(e.message || "Unable to process worked-days workbook."); }
    finally { setBusy(""); }
  }
  return <div style={{marginTop:18,paddingTop:14,borderTop:"1px solid rgba(212,175,55,.3)"}}>
    <h3 style={{fontSize:14,color:"#D4AF37",margin:"0 0 8px"}}>Bulk Upload · Manual Worked Days</h3>
    <p style={{fontSize:12,lineHeight:1.6,color:"#A9BDB2"}}>Select Payroll Period above, then download the employee template with numbers, names and branches. Enter verified Worked Days and a reason for each employee to update. Blank days are skipped; zero is an explicit entry. Preview shows existing and proposed days. Confirming replaces days only for those employees in this period; existing worked hours are preserved.</p>
    {!periodId && <p style={{fontSize:12}}>Select a payroll period to enable bulk upload.</p>}
    {error && <p role="alert" style={{color:"#FCA5A5"}}>{error}</p>}
    {message && <p role="status">{message}</p>}
    <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
      <button type="button" style={button} disabled={!periodId || !!busy} onClick={download}>{busy==="download"?"Preparing…":"Download Worked Days Template"}</button>
      <input key={inputKey} aria-label="Worked Days Excel workbook" type="file" accept=".xlsx,.xls" disabled={!periodId || !!busy} onChange={e=>{setFile(e.target.files?.[0] || null);setPreview(null);setError("");setMessage("");}} />
      <button type="button" style={button} disabled={!periodId || !file || !!busy} onClick={()=>submit("preview")}>{busy==="preview"?"Validating…":"Validate / Preview"}</button>
      <button type="button" style={button} disabled={!periodId || !file || !preview?.validRows || preview.invalidRows>0 || !!busy} onClick={()=>submit("import")}>{busy==="import"?"Importing…":"Confirm Worked Days Import"}</button>
    </div>
    {preview && <div style={{marginTop:12}}>
      <p>{preview.validRows} valid · {preview.invalidRows} invalid · {preview.skippedRows} untouched rows skipped</p>
      <p style={{fontSize:12}}>Review each employee and value below. Existing entries marked UPDATE will be replaced when you confirm. Correct every invalid row before importing.</p>
      <div style={{overflowX:"auto",maxHeight:420}}><table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
        <thead><tr>{["Row","Employee No","Employee Name","Branch","Existing Days","New Days","Action","Reason / Errors"].map(label=><th key={label} style={cell}>{label}</th>)}</tr></thead>
        <tbody>{preview.rows.map(row=><tr key={row.rowNumber}>
          {[row.rowNumber,row.employeeNumber,row.employeeName,row.branch,row.previousDays ?? "No manual entry",row.workedDays,row.action, row.errors.length?row.errors.join(" "):row.notes].map((value,i)=><td key={i} style={{...cell,color:row.errors.length?"#FCA5A5":undefined}}>{value}</td>)}
        </tr>)}</tbody>
      </table></div>
    </div>}
  </div>;
}
const button={padding:"10px 12px",borderRadius:9,border:"1px solid rgba(212,175,55,.4)",background:"#D4AF37",color:"#07140D",fontWeight:800,cursor:"pointer"};
const cell={padding:9,textAlign:"left",borderBottom:"1px solid rgba(212,175,55,.2)",whiteSpace:"nowrap"};
