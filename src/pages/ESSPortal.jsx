import { useState } from "react";
import { apiRequest } from "../services/api";

export default function ESSPortal() {
  const [message,setMessage]=useState("");
  const [email,setEmail]=useState("");
  const [organizationSlug,setOrganizationSlug]=useState("zermatt-liquor-limited");
  const [password,setPassword]=useState("");
  const submit=async(e)=>{
    e.preventDefault();setMessage("");
    try{
      const r=await apiRequest("/api/auth/login",{method:"POST",body:{email,password,organizationSlug}});
      const token=r?.data?.token||r?.token;
      const user=r?.data?.user||r?.user;
      if(token)localStorage.setItem("chris_token",token);
      if(user)localStorage.setItem("chris_user",JSON.stringify(user));
      setMessage("Sign-in successful. Your employee portal session is ready.");
      window.location.href="/";
    }catch(err){setMessage(err.message||"Unable to sign in.");}
  };
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"var(--chris-dashboard-bg,#f5f6f8)"}}>
    <section style={{width:"min(460px,100%)",background:"#fff",borderRadius:18,padding:28,boxShadow:"0 12px 40px rgba(0,0,0,.08)"}}>
      <div style={{fontSize:12,fontWeight:900,letterSpacing:1.3,opacity:.65}}>ZERMATT LIQUOR LIMITED</div>
      <h1 style={{margin:"8px 0 4px"}}>Employee Self-Service</h1>
      <p style={{opacity:.7}}>Access your performance assessments, objectives, employee information and future ESS workflows.</p>
      {message&&<div style={{padding:10,borderRadius:9,background:"#f2f2f2",marginBottom:12}}>{message}</div>}
      <form onSubmit={submit} style={{display:"grid",gap:12}}>
        <input required type="email" placeholder="Employee email" value={email} onChange={e=>setEmail(e.target.value)} style={{padding:12,border:"1px solid #ccc",borderRadius:9}}/>
        <input required type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} style={{padding:12,border:"1px solid #ccc",borderRadius:9}}/>
        <button style={{padding:12,border:0,borderRadius:9,background:"#D4AF37",fontWeight:900}}>Sign in to ESS</button>
      </form>
      <div style={{marginTop:18,fontSize:12,opacity:.6}}>Powered by CHRiS</div>
    </section>
  </main>;
}
