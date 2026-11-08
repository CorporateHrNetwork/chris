"use strict";
const byId=id=>document.getElementById(id);
async function getJSON(url,options){
 const response=await fetch(url,{cache:"no-store",credentials:"same-origin",...(options||{})});
 if(response.status===401){location.replace("/");throw Error("Session expired");}
 if(response.status===403)throw Error("Access denied by CCA role policy");
 if(!response.ok)throw Error("Request failed");
 return response.json();
}
const labels=Object.freeze({support:"Service Desk",agents:"AI Agent Studio",billing:"Subscriptions",releases:"Release Control",audit:"Security & Audit"});
function text(tag,value){const node=document.createElement(tag);node.textContent=value;return node;}
async function openWorkspace(id){
 byId("heading").textContent=labels[id]||"Workspace";
 const view=byId("view");view.replaceChildren(text("p","Loading permitted fictional information…"));
 try{
  const data=await getJSON("/api/workspace?module="+encodeURIComponent(id));
  view.replaceChildren();
  const intro=text("p",data.description);intro.className="muted";view.append(intro);
  const table=document.createElement("table"),body=document.createElement("tbody");
  for(const entry of data.records){
   const row=document.createElement("tr");
   for(const field of entry)row.append(text("td",String(field)));
   body.append(row);
  }
  table.append(body);view.append(table);
  byId("feedback").textContent="Server-authorized view · read-only · fictional data";
  for(const button of byId("nav").querySelectorAll("button"))button.setAttribute("aria-selected",String(button.dataset.id===id));
 }catch(e){view.replaceChildren(text("p",e.message));}
}
async function boot(){
 try{
  const access=await getJSON("/api/access");
  byId("account").textContent="Verified identity: "+access.account+" · Session-bound CCA permissions";
  for(const id of access.modules){
   const button=text("button",labels[id]||id);button.dataset.id=id;
   button.type="button";button.addEventListener("click",()=>openWorkspace(id));
   byId("nav").append(button);
  }
  if(access.modules.length)openWorkspace(access.modules[0]);
  else byId("view").textContent="No authorized workspaces for this identity.";
 }catch(e){byId("view").textContent="Access denied. Sign in to the dedicated CCA login.";byId("account").textContent="Authentication required";}
}
byId("logout").addEventListener("click",async()=>{
 try{await getJSON("/api/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});}
 catch{}
 location.replace("/");
});
boot();