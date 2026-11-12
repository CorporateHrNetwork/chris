"use strict";
const el = id => document.getElementById(id);
let pending = null;
const staging = document.body.dataset.mode === "staging";
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
  if(!result.ok || !data.ok){
    const failure=new Error("CCA request rejected");
    failure.status=result.status;
    throw failure;
  }
  return data;
}
async function loadSession(){
  try{
    const user=await api("/api/whoami");
    stage("session");
    el("sessionInfo").textContent="Account: "+user.account+" · Assigned demo tenants: "+user.assignedTenants.join(", ");
    if(staging){
      el("caseInfo").textContent="Open the protected Control Centre to view your permitted workspaces.";
    }else{
      const cases=await api("/api/fictional-cases");
      el("caseInfo").textContent=cases.cases.map(c=>c.id+" — "+c.description).join("; ");
    }
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
  }catch(e){
    if(e.status===429) note("Too many attempts. Wait for the retry window before signing in again.",true);
    else if(e.status===503) note("Staging sign-in is paused. Ask the host operator to check the protected state.",true);
    else if(e.status===401 && staging) note("Sign-in failed. Check your staging credentials or wait for the account lockout to expire.",true);
    else if(e.status===403 && staging) note("Browser request blocked. Reopen the local staging sign-in page.",true);
    else if(staging) note("Could not complete the local staging request. Refresh this page and retry.",true);
    else if(e.status===401) note("Password not accepted. Check the CURRENT temporary password, not an earlier one. After five failed attempts the account is locked for five minutes.",true);
    else if(e.status===403) note("Browser request blocked. Open http://127.0.0.1:4182 directly on this laptop and retry.",true);
    else if(e.status===415) note("Your browser sent an unsupported request. Refresh this page.",true);
    else note("Could not contact the local login service. Check that port 4182 is running, then refresh.",true);
  }
});
el("otpForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!pending)return;
  try{
    const result=await api("/api/mfa",{challenge:pending,code:el("code").value});
    pending=null;el("code").value="";await loadSession();
  }catch(e){pending=null;stage("password");note(e.status===429 ? "Too many attempts. Wait for the retry window before signing in again." : e.status===503 ? "Staging sign-in is paused. Ask the host operator to check the protected state." : "MFA verification failed. Sign in again.",true);}
});
el("showPassword").addEventListener("change",()=>{
  el("password").type=el("showPassword").checked?"text":"password";
});
el("restart").addEventListener("click",()=>{pending=null;stage("password");note("");});
el("logout").addEventListener("click",async()=>{
  try{await api("/api/logout",{});pending=null;await loadSession();note("Session revoked. Signed out.");}
  catch{note("Could not confirm logout. Close this local server.",true);}
});
loadSession();
