import {useEffect,useState} from 'react';
import {apiRequest,apiDownload,saveDownloadedBlob} from '../../services/api';
export default function PayrollColumnExport({runId}) {
 const [expanded,setExpanded]=useState(false);
 const [columns,setColumns]=useState([]),[selected,setSelected]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let current=true;setColumns([]);setSelected([]);setError('');
  if(runId&&expanded)apiRequest(`/api/payroll/runs/${runId}/export-columns`).then(r=>{if(current){setColumns(r.data.columns);setSelected(r.data.columns.map(c=>c.index));}}).catch(e=>{if(current)setError(e.message);});
  return()=>{current=false;};
 },[runId,expanded]);
 async function download(){setBusy(true);setError('');try{
  const query=new URLSearchParams({columns:JSON.stringify(selected),schema:JSON.stringify(columns.map(c=>c.label))});
  saveDownloadedBlob(await apiDownload(`/api/payroll/runs/${runId}/register-export.xlsx?${query}`));
 }catch(e){setError(e.message||'Unable to download register.');}finally{setBusy(false);}}
 if(!runId)return null;
 return <details onToggle={e=>setExpanded(e.currentTarget.open)} style={{margin:'14px 0',padding:12,border:'1px solid #806b23',borderRadius:8}}>
  <summary>Choose columns to download · Master roll and branch sheets</summary>
  <p>Abuja, Lagos and Port Harcourt appear in that order, with separate branch sheets. This register copy does not approve or lock payroll. Use the workflow export for the full approval/payout pack.</p>
  {error&&<p role="alert">{error}</p>}
  <button type="button" disabled={busy||!columns.length} onClick={()=>setSelected(columns.map(c=>c.index))}>Select all</button>{' '}
  <button type="button" disabled={busy} onClick={()=>setSelected([])}>Clear selection</button>
  <div style={{display:'flex',gap:14,flexWrap:'wrap',margin:'12px 0'}}>{columns.map(({index,label})=><label key={index}><input type="checkbox" disabled={busy} checked={selected.includes(index)} onChange={e=>setSelected(s=>e.target.checked?[...s,index]:s.filter(i=>i!==index))}/>{label}</label>)}</div>
  <button type="button" disabled={busy||!selected.length} onClick={download}>{busy?'Exporting…':'Download Selected Columns'}</button>
 </details>;
}
