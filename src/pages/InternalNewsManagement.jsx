import { useEffect, useState } from "react";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../services/api";

const blank={category:"ANNOUNCEMENT",title:"",summary:"",body:"",status:"DRAFT",isPinned:false,expireAt:""};
const categories=[
  ["ANNOUNCEMENT","Announcement"],["PROMOTION","Promotion"],["INTERNAL_CAREER","Internal Career"],
  ["TRANSFER","Transfer"],["RETIREMENT","Retirement"],["TERMINATION","Termination"],
  ["EVENT","Event"],["POLICY_HR_UPDATE","Policy / HR Update"],
];

export default function InternalNewsManagement(){
  const [form,setForm]=useState(blank);
  const [rows,setRows]=useState([]);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [attachment,setAttachment]=useState(null);

  const load=async()=>{const r=await apiRequest("/api/news");setRows(r.data||[]);};
  useEffect(()=>{load().catch(e=>setError(e.message||"Unable to load internal news."));},[]);

  const submit=async(e)=>{
    e.preventDefault();
    try{
      setBusy("save");setError("");setMessage("");
      const payload=new FormData();
      Object.entries(form).forEach(([key,value])=>payload.append(key,String(value ?? "")));
      if(attachment) payload.append("attachment",attachment);
      const r=await apiRequest("/api/news",{method:"POST",body:payload});
      setMessage(r.data?.status==="PUBLISHED"?"News published to Employee Self Service.":"News draft saved.");
      setForm(blank);setAttachment(null);e.currentTarget.reset();await load();
    }catch(err){setError(err.message||"Unable to save internal news.");}
    finally{setBusy("");}
  };

  const downloadAttachment=async(row)=>{
    try{
      setBusy(row.id+"ATTACHMENT");setError("");
      const result=await apiDownload(`/api/news/${row.id}/attachment`);
      saveDownloadedBlob(result);
    }catch(err){setError(err.message||"Unable to download news attachment.");}
    finally{setBusy("");}
  };

  const changeStatus=async(id,status)=>{
    try{
      setBusy(id+status);setError("");
      await apiRequest(`/api/news/${id}/status`,{method:"PATCH",body:{status}});
      setMessage(`News item moved to ${status}.`);await load();
    }catch(err){setError(err.message||"Unable to update news status.");}
    finally{setBusy("");}
  };

  return <section style={page}>
    <div style={eyebrow}>EMPLOYEE COMMUNICATIONS</div>
    <h1 style={title}>Internal News & Opportunities</h1>
    <p style={lead}>Publish governed updates to Zermatt Employee Self Service. Use the category that best describes the communication; draft items are not visible to employees.</p>

    {error?<div style={errorBox}>{error}</div>:null}
    {message?<div style={successBox}>{message}</div>:null}

    <form onSubmit={submit} style={panel}>
      <div style={grid}>
        <label style={field}><span>Category</span><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label style={field}><span>Status</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="DRAFT">Draft</option><option value="PUBLISHED">Publish now</option></select></label>
        <label style={field}><span>Expiry date (optional)</span><input type="datetime-local" value={form.expireAt} onChange={e=>setForm({...form,expireAt:e.target.value})}/></label>
        <label style={{...field,display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.isPinned} onChange={e=>setForm({...form,isPinned:e.target.checked})}/> Pin in employee news feed</label>
      </div>
      <label style={field}><span>Title</span><input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
      <label style={field}><span>Summary</span><input value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})}/></label>
      <label style={field}><span>Message</span><textarea rows={7} value={form.body} onChange={e=>setForm({...form,body:e.target.value})} placeholder="Add a message, or attach an approved PDF/image below."/></label>
      <label style={attachmentField}>
        <span>PDF / Image Attachment</span>
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setAttachment(e.target.files?.[0]||null)}/>
        <small style={help}>Optional. PDF, JPG, PNG or WEBP · maximum 8 MB. Employees can open/download the published attachment from Zermatt News.</small>
        {attachment?<strong style={{color:"#2EE98B"}}>{attachment.name}</strong>:null}
      </label>
      <button type="submit" style={primary} disabled={busy==="save"}>{busy==="save"?"Saving…":form.status==="PUBLISHED"?"Publish to Employees":"Save Draft"}</button>
    </form>

    <div style={panel}>
      <h2 style={{marginTop:0}}>News Register</h2>
      <div style={{overflowX:"auto"}}>
        <table style={table}>
          <thead><tr><th>Category</th><th>Title</th><th>Attachment</th><th>Status</th><th>Published</th><th>Actions</th></tr></thead>
          <tbody>{rows.length?rows.map(row=><tr key={row.id}>
            <td>{String(row.category).replaceAll("_"," ")}</td><td><strong>{row.title}</strong>{row.isPinned?<span style={pin}>Pinned</span>:null}</td>
            <td>{row.attachmentFileName?<button type="button" style={linkButton} disabled={busy===row.id+"ATTACHMENT"} onClick={()=>downloadAttachment(row)}>{row.attachmentFileName}</button>:"—"}</td>
            <td>{row.status}</td><td>{row.publishAt?new Date(row.publishAt).toLocaleString():"—"}</td>
            <td><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {row.status!=="PUBLISHED"?<button type="button" style={small} disabled={busy===row.id+"PUBLISHED"} onClick={()=>changeStatus(row.id,"PUBLISHED")}>Publish</button>:null}
              {row.status!=="DRAFT"?<button type="button" style={small} disabled={busy===row.id+"DRAFT"} onClick={()=>changeStatus(row.id,"DRAFT")}>Return to Draft</button>:null}
              {row.status!=="ARCHIVED"?<button type="button" style={small} disabled={busy===row.id+"ARCHIVED"} onClick={()=>changeStatus(row.id,"ARCHIVED")}>Archive</button>:null}
            </div></td>
          </tr>):<tr><td colSpan="6">No internal news items yet.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  </section>;
}

const page={maxWidth:1180,margin:"0 auto"};
const eyebrow={color:"#D4AF37",fontWeight:900,fontSize:11,letterSpacing:1.5};
const title={margin:"6px 0",fontSize:32};
const lead={maxWidth:900,color:"var(--chris-text-secondary)",lineHeight:1.6};
const panel={marginTop:20,padding:20,border:"1px solid rgba(212,175,55,.35)",borderRadius:14,background:"linear-gradient(145deg,rgba(8,50,33,.96),rgba(3,20,13,.98))"};
const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12};
const field={display:"grid",gap:6,marginBottom:12,color:"#D4AF37",fontSize:12,fontWeight:800};
const primary={border:0,borderRadius:9,padding:"11px 15px",background:"#D4AF37",color:"#07140D",fontWeight:900,cursor:"pointer"};
const small={...primary,padding:"7px 10px",fontSize:12};
const table={width:"100%",borderCollapse:"collapse",minWidth:760};
const pin={marginLeft:8,fontSize:10,padding:"2px 6px",borderRadius:999,background:"#D4AF37",color:"#07140D"};
const errorBox={marginTop:14,padding:12,borderRadius:9,background:"rgba(185,28,28,.16)",color:"#FCA5A5"};
const successBox={marginTop:14,padding:12,borderRadius:9,background:"rgba(46,233,139,.08)",color:"#2EE98B"};

const attachmentField={...field,padding:14,border:"1px dashed rgba(212,175,55,.46)",borderRadius:10,background:"rgba(212,175,55,.05)"};
const help={color:"#9DB8AA",fontWeight:500,lineHeight:1.5};
const linkButton={border:0,background:"transparent",color:"#F2D166",padding:0,textDecoration:"underline",cursor:"pointer",fontWeight:800,textAlign:"left"};
