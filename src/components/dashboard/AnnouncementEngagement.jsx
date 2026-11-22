import { useEffect, useState } from "react";
import { essRequest } from "../../services/essApi";

const choices=[["LIKE","👍 Like"],["CELEBRATE","🎉 Celebrate"],["SUPPORT","💚 Support"],["APPRECIATE","👏 Appreciate"]];
const action={border:"1px solid rgba(8,122,67,.4)",borderRadius:8,padding:"8px 12px",background:"#fff",color:"#075f36",cursor:"pointer",fontWeight:700};
const date=value=>value?new Date(value).toLocaleString("en-NG",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";

export default function AnnouncementEngagement({postId}) {
  const [feed,setFeed]=useState(null);
  const [body,setBody]=useState("");
  const [replyTo,setReplyTo]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [emailPreference,setEmailPreference]=useState(null);
  useEffect(()=>{
    if(!postId)return;
    let live=true;
    setFeed(null);setError("");
    essRequest("/api/ess/news-engagement/notifications/email-preference")
      .then(r=>{if(live)setEmailPreference(r.data?.optIn===true);})
      .catch(()=>{if(live)setEmailPreference(null);});
    essRequest("/api/ess/news-engagement/"+encodeURIComponent(postId))
      .then(r=>{if(live)setFeed(r.data||{enabled:false});})
      .catch(e=>{if(live)setError(e.message||"Unable to load reactions.");});
    return()=>{live=false};
  },[postId]);
  async function setDigestPreference(optIn){
    setBusy(true);setError("");
    try{
      const result=await essRequest("/api/ess/news-engagement/notifications/email-preference",
        {method:"PUT",body:{optIn}});
      setEmailPreference(result.data?.optIn===true);
    }catch(e){setError(e.message||"Unable to update your email notification preferences.");}
    finally{setBusy(false);}
  }
  async function react(choice){
    setBusy(true);setError("");
    try{
      const r=await essRequest("/api/ess/news-engagement/"+encodeURIComponent(postId)+"/reaction",{method:"PUT",body:{reaction:feed?.myReaction===choice?"NONE":choice}});
      setFeed({enabled:true,...r.data});
    }catch(e){setError(e.message||"Unable to save reaction.");}
    finally{setBusy(false)}
  }
  async function comment(e){
    e.preventDefault();if(!body.trim())return;
    setBusy(true);setError("");
    try{
      const r=await essRequest("/api/ess/news-engagement/"+encodeURIComponent(postId)+"/comments",{method:"POST",body:{body:body.trim(),parentId:replyTo||undefined}});
      setFeed({enabled:true,...r.data});setBody("");setReplyTo(null);
    }catch(e){setError(e.message||"Unable to publish comment.");}
    finally{setBusy(false)}
  }
  async function remove(id){
    setBusy(true);setError("");
    try{
      await essRequest("/api/ess/news-engagement/"+encodeURIComponent(postId)+"/comments/"+encodeURIComponent(id),{method:"DELETE"});
      const r=await essRequest("/api/ess/news-engagement/"+encodeURIComponent(postId));
      setFeed(r.data);
    }catch(e){setError(e.message||"Unable to remove comment.");}
    finally{setBusy(false)}
  }
  if(!feed&&!error)return <p style={{fontSize:12,color:"#597365"}}>Loading employee engagement…</p>;
  if(feed&&!feed.enabled)return null;
  return <section aria-label="Colleague reactions and comments" style={{marginTop:24,borderTop:"1px solid #d5e1d9",paddingTop:20}}>
    <h3 style={{margin:"0 0 12px",color:"#075f36"}}>Celebrate with colleagues</h3>
    <p style={{fontSize:13,color:"#587464"}}>Reactions and comments are visible to authorised Zermatt employees.</p>
    {emailPreference!==null&&<label style={{display:"flex",alignItems:"center",gap:8,margin:"10px 0",fontSize:13}}>
      <input type="checkbox" checked={emailPreference} disabled={busy} onChange={e=>setDigestPreference(e.target.checked)}/>
      Email me a daily digest when colleagues engage with announcements recognising me
    </label>}

    {error&&<p role="alert" style={{color:"#9a3412"}}>{error}</p>}
    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
      {choices.map(([key,label])=><button key={key} type="button" disabled={busy||!feed} onClick={()=>react(key)} aria-pressed={feed?.myReaction===key} style={{...action,background:feed?.myReaction===key?"#d3efe0":"#fff"}}>{label} {feed?.reactions?.find(x=>x.reaction===key)?.count||0}</button>)}
    </div>
    <div style={{marginTop:18}}>
      <strong style={{color:"#173729"}}>Colleague messages ({feed?.comments?.length||0})</strong>
      <div style={{display:"grid",gap:10,margin:"12px 0"}}>
        {(feed?.comments||[]).map(c=><article key={c.id} style={{padding:12,background:"#f4f8f5",border:"1px solid #e1eae3",borderRadius:10,marginLeft:c.parentId?18:0}}>
          <strong>{[c.firstName,c.lastName].filter(Boolean).join(" ")||"Colleague"}</strong>
          <small style={{marginLeft:8,color:"#64796c"}}>{date(c.createdAt)}</small>
          <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",margin:"8px 0"}}>{c.body}</p>
          <button type="button" style={{...action,padding:"5px 8px",fontSize:12}} disabled={busy} onClick={()=>setReplyTo(c.id)}>Reply</button>
          {feed?.myEmployeeId===c.employeeId&&<button type="button" style={{...action,padding:"5px 8px",fontSize:12,marginLeft:6}} disabled={busy} onClick={()=>remove(c.id)}>Remove my comment</button>}
        </article>)}
      </div>
      <form onSubmit={comment}>
        {replyTo&&<p style={{fontSize:12}}>Replying to a colleague <button type="button" onClick={()=>setReplyTo(null)}>Cancel reply</button></p>}
        <label htmlFor="engagement-message" style={{display:"block",fontWeight:700,marginBottom:6}}>Your congratulatory message</label>
        <textarea id="engagement-message" rows={3} maxLength={1000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Write a respectful congratulatory message..." style={{width:"100%",boxSizing:"border-box",borderRadius:8,padding:12,border:"1px solid #a5baab"}}/>
        <button type="submit" disabled={busy||!body.trim()} style={{...action,background:"#087a43",color:"#fff",marginTop:8}}>Post message</button>
      </form>
    </div>
  </section>;
}
