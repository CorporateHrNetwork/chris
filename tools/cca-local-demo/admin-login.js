"use strict";
const el = id => document.getElementById(id);
let pending = null;
function stage(name){
  el("passwordStage").classList.toggle("hidden", name !== "password");
  el("otpStage").classList.toggle("hidden", name !== "otp");
  el("sessionStage").classList.toggle("hidden", name !== "session");
}
function note(message,error=false){el("feedback").textContent=message;el("feedback").style.color=error?"#b22525":"#0c7445";}
async function api(path, body) {
  const options={cache:"no-store",credentials:"same-origin"};
  if(body!==undefined){options.method="POST";options.headers={"Content-Type":"application/json"};options.body=JSON.stringify(body);}
  const result=await fetch(path,options);
  const data=await result.json();
  if(!result.ok || !data.ok)throw Error(data.code || "Authentication failed");
  return data;
}
async function loadSession(){
  try{
    const user=await api("/api/whoami");
    stage("session");
    el("sessionInfo").textContent="Account: "+user.account+" · Assigned demo tenants: "+user.assignedTenants.join(", ");
    const cases=await api("/api/fictional-cases");
    el("caseInfo").textContent=cases.cases.map(c=>c.id+" — "+c.description).join("; ");
    note("CCA local demonstration session authenticated.");
  }catch{
    pending=null;stage("password");el("caseInfo").textContent="Authenticate to view one fictional, tenant-scoped example.";
  }
}
el("passwordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const result=await api("/api/password",{account:el("account").value,password:el("password").value});
    el("password").value="";pending=result.challenge;stage("otp");note("Password checked. Enter your authenticator code.");
  }catch(e){note("Sign-in was not accepted.",true);}
});
el("otpForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!pending)return;
  try{
    const result=await api("/api/mfa",{challenge:pending,code:el("code").value});
    pending=null;el("code").value="";await loadSession();
  }catch(e){pending=null;stage("password");note("MFA verification failed. Sign in again.",true);}
});
el("restart").addEventListener("click",()=>{pending=null;stage("password");note("");});
el("logout").addEventListener("click",async()=>{
  try{await api("/api/logout",{});pending=null;await loadSession();note("Session revoked. Signed out.");}
  catch{note("Could not confirm logout. Close this local server.",true);}
});
loadSession();
