import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api";

export default function NewsEngagementAdmin({row}) {
  const [open,setOpen]=useState(false);
  const [data,setData]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [matches,setMatches]=useState([]);
  async function refresh(){
    const result=await apiRequest("/api/news-engagement/"+encodeURIComponent(row.id)+"/moderation");
    setData(result.data);
  }
  useEffect(()=>{
    if(!open)return;
    let active=true;setError("");setData(null);
    apiRequest("/api/news-engagement/"+encodeURIComponent(row.id)+"/moderation")
      .then(result=>{if(active)setData(result.data);})
      .catch(e=>{if(active)setError(e.message||"Unable to load engagement moderation.");});
    return()=>{active=false;};
  },[open,row.id]);
  async function findEmployee(term){
    setSearch(term);
    if(term.trim().length<2){setMatches([]);return;}
    try{
      const result=await apiRequest("/api/news-engagement/recipient-search?q="+encodeURIComponent(term.trim()));
      setMatches(result.data||[]);
    }catch(e){setError(e.message||"Unable to search employees.");}
  }
  async function setRecipient(employeeId){
    setBusy(true);setError("");
    try{
      await apiRequest("/api/news-engagement/"+encodeURIComponent(row.id)+"/settings",
        {method:"PUT",body:{enabled:!!data?.settings?.enabled,recognizedEmployeeId:employeeId}});
      await refresh();setSearch("");setMatches([]);
    }catch(e){setError(e.message||"Unable to select the celebrated employee.");}
    finally{setBusy(false);}
  }
  async function toggle(enabled){
    setBusy(true);setError("");
    try{
      await apiRequest("/api/news-engagement/"+encodeURIComponent(row.id)+"/settings",{method:"PUT",body:{enabled}});
      await refresh();
    }catch(e){setError(e.message||"Unable to change engagement settings.");}
    finally{setBusy(false);}
  }
  async function moderate(comment,hidden){
    setBusy(true);setError("");
    try{
      await apiRequest("/api/news-engagement/"+encodeURIComponent(row.id)+"/comments/"+encodeURIComponent(comment.id)+"/hide",{method:"PATCH",body:{hidden}});
      await refresh();
    }catch(e){setError(e.message||"Unable to moderate message.");}
    finally{setBusy(false);}
  }
  async function copyApprovedAnnouncement(){
    const text=row.title+"\n\nRead the full approved company announcement in CHRiS ESS: https://chris-zermatt-web.onrender.com/ess\n\n(Staff sign-in required.)";
    try{await navigator.clipboard.writeText(text);setError("");}
    catch{setError("Copy unavailable. Open ESS and share this approved title manually.");}
  }
  const styles={button:{border:"1px solid rgba(212,175,55,.65)",background:"transparent",color:"inherit",padding:"7px 9px",borderRadius:8,cursor:"pointer"}};
  return <>
    <button type="button" style={styles.button} onClick={()=>setOpen(v=>!v)}>{open?"Close engagement":"Manage engagement"}</button>
    {open&&<div style={{background:"var(--chris-ui-panel-background, #fff)",color:"inherit",padding:12,marginTop:9,border:"1px solid rgba(212,175,55,.35)",borderRadius:8,minWidth:250,maxWidth:520}}>
      <strong>Engagement settings</strong>
      {error&&<p role="alert" style={{color:"#e88d8d"}}>{error}</p>}
      {!data?<p>Loading settings…</p>:<>
        <p>Current status: <strong>{data.settings?.enabled?"Enabled":"Disabled"}</strong></p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button disabled={busy||!!data.settings?.enabled} onClick={()=>toggle(true)} type="button" style={styles.button}>Enable</button>
          <button disabled={busy||!data.settings?.enabled} onClick={()=>toggle(false)} type="button" style={styles.button}>Disable</button>
          <button type="button" style={styles.button} onClick={copyApprovedAnnouncement}>Copy for WhatsApp Channel</button>
        </div>
        <p style={{fontSize:12,opacity:.8}}>Channel posting is manual. Copying does not send any WhatsApp message. Do not share confidential announcements.</p>
        <div style={{border:"1px solid rgba(212,175,55,.35)",borderRadius:8,padding:10,marginTop:14}}>
          <label htmlFor={"news-recipient-"+row.id} style={{display:"block",fontWeight:700}}>Employee being celebrated</label>
          <p style={{fontSize:12,opacity:.8}}>Link this announcement to an employee. Email sending remains disabled pending verification.</p>
          <p>Employee record: {data.settings?.recognizedEmployeeId||"Not selected"}</p>
          <input id={"news-recipient-"+row.id} type="search" value={search} onChange={e=>findEmployee(e.target.value)} placeholder="Type employee name or number" style={{boxSizing:"border-box",width:"100%",padding:9,borderRadius:7}}/>
          {matches.length>0&&<div role="listbox" aria-label="Matching employees" style={{display:"grid",gap:5,marginTop:8}}>
            {matches.map(emp=><button type="button" style={styles.button} disabled={busy} key={emp.id} onClick={()=>setRecipient(emp.id)}>{emp.firstName} {emp.lastName} ({emp.employeeNumber})</button>)}
          </div>}
          {data.settings?.recognizedEmployeeId&&<button style={{...styles.button,marginTop:8}} type="button" disabled={busy} onClick={()=>setRecipient(null)}>Clear selected employee</button>}
        </div>
        <h4>Employee messages ({data.comments?.length||0})</h4>
        <div style={{maxHeight:340,overflowY:"auto",display:"grid",gap:8}}>
          {(data.comments||[]).map(comment=><div key={comment.id} style={{border:"1px solid rgba(212,175,55,.25)",borderRadius:8,padding:10}}>
            <strong>{[comment.firstName,comment.lastName].filter(Boolean).join(" ")||"Employee"}</strong>
            <small style={{marginLeft:8}}>{comment.isHidden?"Hidden":"Visible"}</small>
            <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{comment.body}</p>
            <button type="button" disabled={busy} style={styles.button} onClick={()=>moderate(comment,!comment.isHidden)}>{comment.isHidden?"Restore comment":"Hide comment"}</button>
          </div>)}
        </div>
      </>}
    </div>}
  </>;
}
