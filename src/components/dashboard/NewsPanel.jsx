import { useEffect, useState } from "react";
import { API_BASE_URL, getAuthToken } from "../../services/api";
import { getEssAuthToken } from "../../services/essApi";

const displayDate = value => value ? new Date(value).toLocaleDateString("en-NG", {day:"numeric",month:"short",year:"numeric"}) : "Published";
const active = row => row.status === "PUBLISHED" && (!row.publishAt || new Date(row.publishAt) <= new Date()) && (!row.expireAt || new Date(row.expireAt) >= new Date());
const order = (a,b) => Number(Boolean(b.isPinned))-Number(Boolean(a.isPinned)) || new Date(b.publishAt||b.createdAt||0)-new Date(a.publishAt||a.createdAt||0);
const styles = {
  box:{padding:20,border:"1px solid rgba(212,175,55,.35)",borderRadius:14,background:"var(--chris-ui-panel-background, #fff)",color:"var(--chris-text-primary, #163b2c)"},
  button:{background:"transparent",color:"inherit",cursor:"pointer",border:"1px solid rgba(8,122,67,.26)",borderRadius:10,padding:"12px 14px",textAlign:"left",width:"100%"},
  link:{background:"transparent",color:"#087a43",border:0,textDecoration:"underline",cursor:"pointer",fontWeight:700},
};
function attachmentEndpoint(row,mode) { return mode==="ess" ? `/api/ess/news/${encodeURIComponent(row.id)}/attachment` : `/api/news/${encodeURIComponent(row.id)}/attachment`; }
function useAttachment(row,mode) {
  const [url,setUrl]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    if (!row?.attachmentFileName) { setUrl(""); return; }
    let cancelled=false,blobUrl="";
    const token=mode==="ess"?getEssAuthToken():getAuthToken();
    fetch(API_BASE_URL+attachmentEndpoint(row,mode),{headers:{Authorization:`Bearer ${token||""}`},cache:"no-store"})
      .then(response=>{if(!response.ok)throw new Error("Attachment unavailable");return response.blob();})
      .then(blob=>{if(cancelled)return;blobUrl=URL.createObjectURL(blob);setUrl(blobUrl);setError("");})
      .catch(()=>{if(!cancelled)setError("Unable to load attachment.");});
    return ()=>{cancelled=true;if(blobUrl)URL.revokeObjectURL(blobUrl);setUrl("");};
  },[row?.id,row?.attachmentFileName,mode]);
  return {url,error};
}
function NewsDetail({row,mode,onClose}) {
  const {url,error}=useAttachment(row,mode);
  const [fullscreen,setFullscreen]=useState(false);
  useEffect(()=>{
    const onKey=e=>{if(e.key==="Escape"){if(fullscreen)setFullscreen(false);else onClose();}};
    window.addEventListener("keydown",onKey);
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{window.removeEventListener("keydown",onKey);document.body.style.overflow=previous;};
  },[fullscreen,onClose]);
  if(!row)return null;
  const mime=String(row.attachmentMimeType||"").toLowerCase();
  const isImage=mime.startsWith("image/");
  const isPdf=mime==="application/pdf" || /\.pdf$/i.test(String(row.attachmentFileName||""));
  const previewSupported=isImage||isPdf;
  const download=url?<a href={url} download={row.attachmentFileName} style={{color:"#087a43",fontWeight:700}}>Download attachment</a>:null;
  return <>
    <div role="presentation" style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",padding:12}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <section role="dialog" aria-modal="true" aria-label={row.title} style={{background:"#fff",color:"#173729",borderRadius:14,padding:24,width:"min(780px,100%)",maxHeight:"92dvh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start"}}>
          <div><small style={{color:"#087a43",fontWeight:800}}>{String(row.category||"Announcement").replaceAll("_"," ")} · {displayDate(row.publishAt||row.createdAt)}</small><h2 style={{margin:"8px 0"}}>{row.title}</h2></div>
          <button type="button" aria-label="Close announcement" onClick={onClose} style={{...styles.link,fontSize:16,flexShrink:0}}>Close ×</button>
        </div>
        {row.summary&&<p style={{fontWeight:700}}>{row.summary}</p>}
        {row.body&&<div style={{whiteSpace:"pre-wrap",lineHeight:1.7,overflowWrap:"anywhere"}}>{row.body}</div>}
        {row.attachmentFileName&&<div style={{marginTop:20,padding:16,border:"1px solid #d6e2da",borderRadius:10,background:"#f7faf8"}}>
          <strong style={{display:"block",marginBottom:12}}>Attached document: {row.attachmentFileName}</strong>
          {error?<p role="alert" style={{color:"#9a3412"}}>{error}</p>:!url?<p>Loading attachment...</p>:
          <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
            {previewSupported&&<button type="button" onClick={()=>setFullscreen(true)} style={{padding:"12px 18px",border:0,borderRadius:8,background:"#087a43",color:"#fff",fontWeight:800,cursor:"pointer"}}>View full screen</button>}
            {download}
            {!previewSupported&&<a href={url} target="_blank" rel="noreferrer" style={{color:"#087a43",fontWeight:700}}>Open attachment</a>}
          </div>}
        </div>}
      </section>
    </div>
    {fullscreen&&url&&previewSupported&&<div role="dialog" aria-modal="true" aria-label={"Full screen attachment: "+row.attachmentFileName} style={{position:"fixed",inset:0,zIndex:3000,display:"flex",flexDirection:"column",background:"#1e2421",width:"100vw",height:"100dvh",overflow:"hidden"}}>
      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",padding:"10px 18px",background:"#fff",color:"#173729",minHeight:58,boxSizing:"border-box"}}>
        <strong style={{flex:"1 1 180px",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.attachmentFileName}</strong>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <a href={url} download={row.attachmentFileName} style={{color:"#087a43",fontWeight:800}}>Download</a>
          <button type="button" autoFocus onClick={()=>setFullscreen(false)} aria-label="Close full screen attachment" style={{padding:"10px 16px",background:"#087a43",color:"#fff",fontWeight:800,border:0,borderRadius:8,cursor:"pointer"}}>Close full screen ×</button>
        </div>
      </header>
      <main style={{flex:"1 1 auto",minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",overflow:"auto"}}>
        {isImage?<img src={url} alt={row.attachmentFileName||row.title} style={{display:"block",width:"100%",height:"100%",objectFit:"contain"}}/>:
        <iframe src={url+"#view=FitH"} title={"Full-screen PDF: "+row.attachmentFileName} style={{display:"block",border:0,width:"100%",height:"100%",background:"#fff"}}/>}
      </main>
    </div>}
  </>;
}
export default function NewsPanel({rows=[],mode="hris",limit=5,onViewAll}) {
  const [selected,setSelected]=useState(null);
  const published=(Array.isArray(rows)?rows:[]).filter(active).sort(order).slice(0,limit||undefined);
  return <section aria-label="Company News and Announcements" style={styles.box}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12}}>
      <h3 style={{margin:0,color:"inherit"}}>Company News & Announcements</h3>
      {onViewAll&&<button type="button" style={styles.link} onClick={onViewAll}>View all</button>}
    </div>
    {!published.length?<p style={{fontSize:13,opacity:.75}}>No published announcements available.</p>:<div style={{display:"grid",gap:9}}>
      {published.map(row=><button type="button" key={row.id} style={styles.button} onClick={()=>setSelected(row)}>
        <span style={{display:"block",fontSize:11,opacity:.7}}>{String(row.category||"ANNOUNCEMENT").replaceAll("_"," ")} · {displayDate(row.publishAt||row.createdAt)}{row.isPinned?" · Pinned":""}</span>
        <strong style={{display:"block",marginTop:4}}>{row.title}</strong>
        {row.summary&&<span style={{display:"block",fontSize:12,marginTop:4,opacity:.8}}>{row.summary}</span>}
        <span style={{display:"block",fontSize:12,marginTop:6,color:"#087a43",fontWeight:800}}>View full announcement</span>
      </button>)}
    </div>}
    {selected&&<NewsDetail row={selected} mode={mode} onClose={()=>setSelected(null)}/>}
  </section>;
}
