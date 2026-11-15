"use strict";
const byId=id=>document.getElementById(id);
async function getJSON(url,options){
 const response=await fetch(url,{cache:"no-store",credentials:"same-origin",...(options||{})});
 if(response.status===401){location.replace("/");throw Error("Session expired");}
 if(response.status===409)throw Error("This case changed. Reopen Service Desk and try again.");
 if(response.status===403)throw Error("Access denied by CCA role policy");
 if(response.status===503){
  const {code}=await response.json();
  if(code==="CCA_STAGING_DATABASE_ACTION_FAILED")throw Error("PostgreSQL staging action failed. Check that the local database is running, then retry.");
  throw Error("Staging service unavailable");
 }
 if(!response.ok)throw Error("Request failed");
 return response.json();
}
const labels=Object.freeze({support:"Service Desk",agents:"AI Agent Studio",billing:"Subscriptions",releases:"Release Control",audit:"Security & Audit"});
function text(tag,value){const node=document.createElement(tag);node.textContent=value;return node;}
function caseAction(ticket, operation, title, inputLabel, value = ""){
 const form=document.createElement("form");
 form.className="case-action";
 let field;
 if(inputLabel){
  const label=text("label",inputLabel);
  field=document.createElement("textarea");
  field.required=true;field.rows=3;field.maxLength=1500;field.value=value;
  label.append(field);
  form.append(label);
 }
 const button=text("button",title);button.type="submit";
 const status=text("p","");status.setAttribute("role","status");
 form.append(button,status);
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  if(button.disabled||(field&&!field.value.trim()))return;
  button.disabled=true;
  try{
   const endpoint = operation.endsWith("DATABASE") || operation === "REQUEST_DATABASE_APPROVAL"
    ? "/api/database-approval" : "/api/support-workflow";
   await getJSON(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({caseId:ticket.id,version:ticket.version,operation,text:field?.value.trim()})});
   await openWorkspace("support",ticket.id,["REPLY","CONFIRM","APPROVE"].includes(operation));
  }catch(error){status.textContent=error.message;button.disabled=false;}
 });
 return form;
}

function renderInbox(view, cases, openInbox){
 const inbox=document.createElement("details");
 inbox.open=openInbox;
 inbox.append(text("summary","Simulated Cedar tenant inbox"));
 for(const c of [...cases].reverse()){
  const question=c.status==="NEEDS_CLARIFICATION" && c.analysis?.question;
  const responses=c.deliveredResponses.length?c.deliveredResponses:[c.resolution].filter(Boolean);
  if(!question&&!responses.length)continue;
  const item=document.createElement("section");
  item.append(text("h3",c.id+" · "+c.status.replaceAll("_"," ")));
  for(const response of responses)item.append(text("p",response));
  if(question)item.append(text("p",question));
  if(question||c.status==="AWAITING_CLIENT_VALIDATION")
   item.append(caseAction(c,"REPLY","Simulate tenant reply","Tenant reply"));
  if(c.status==="AWAITING_CLIENT_VALIDATION")item.append(caseAction(c,"CONFIRM","Simulate confirmation of resolution"));
  inbox.append(item);
 }
 if(inbox.children.length===1)inbox.append(text("p","No clarification questions or approved responses yet."));
 view.append(inbox);
}
function renderRouting(view, data, openCaseId, openInbox){
 const list=document.createElement("ul");
 list.className="case-list";
 for(const c of [...data.routingCases].reverse()){
  const item=document.createElement("li");
  const details=document.createElement("details");
  details.open=c.id===openCaseId;
  details.append(text("summary",c.id+" · "+c.status.replaceAll("_"," ")+" · "+(c.assignee||"Unassigned")),
   text("p",c.description),text("p",c.analysis?.reason||""));
  if(c.analysis?.question)details.append(text("p",c.analysis.question));
  if(c.tenantReply)details.append(text("p","Latest tenant reply · "+c.tenantReply));
  if(c.draft&&c.status==="ASSIGNED"){
   const draft=document.createElement("section");
   draft.append(text("strong","Draft response · Awaiting human review"),text("p",c.draft));
   details.append(draft);
  }
  if(c.recommendation)details.append(text("p","Response submitted for review · "+c.recommendation));
  for(const decision of c.decisions){
   const name=decision.event==="RECOMMENDATION_APPROVED"?"Approved":"Returned for revision";
   const timestamp=decision.at?new Date(decision.at).toLocaleString():"Time unavailable";
   details.append(text("p",name+" · "+decision.actor+" · "+timestamp+
    (decision.details.initiatedBy?" · simulated by "+decision.details.initiatedBy:"")+
    (decision.details.reason?" · "+decision.details.reason:"")));
  }
  if(data.canSimulateIntake&&c.status==="ASSIGNED")
   details.append(caseAction(c,"RECOMMEND","Submit response for review","Response for review",c.draft||""));
  if(data.canRequestDatabaseApproval&&c.status==="ASSIGNED"&&c.tenantReply&&
     c.analysis?.category==="DATABASE_PROVISIONING")
   details.append(caseAction(c,"REQUEST_DATABASE_APPROVAL","Request database provisioning approval"));
  if(c.databaseApproval){
   details.append(text("p","Provisioning approval requested by "+c.databaseApproval.requestedBy));
   if(c.databaseApproval.approvedBy){
    const {approvedBy,databaseState,database,login}=c.databaseApproval;
    details.append(text("p","Provisioning approved by "+approvedBy+"."));
    details.append(text("p",databaseState
     ? "Database "+databaseState.toLowerCase()+" · "+database+" · "+login
     : "Database creation pending."));
    for(const event of c.databaseEvents||[]){
     const action=event.event==="DATABASE_PROVISIONED"?"Database created":"Database login suspended";
     details.append(text("p",action+" · "+event.actor+" · "+new Date(event.at).toLocaleString()));
    }
    if(data.canOperateDatabase&&c.databaseApproval.requestedBy===data.account){
     if(!databaseState)details.append(caseAction(c,"PROVISION_DATABASE","Create Cedar staging database"));
     if(databaseState==="ACTIVE")details.append(caseAction(c,"SUSPEND_DATABASE","Suspend Cedar database login"));
    }
   }else if(data.canApproveDatabase)
    details.append(caseAction(c,"APPROVE_DATABASE","Approve staging database provisioning"));
  }
  if(data.canSimulateIntake&&c.status==="AWAITING_APPROVAL"&&!c.databaseApproval){
   details.append(text("p","Simulate a decision by the fictional independent reviewer."),
    caseAction(c,"APPROVE","Simulate approval and send to demo inbox"),
    caseAction(c,"RETURN","Simulate return for revision","Reason for returning"));
  }
  item.append(details);
  list.append(item);
 }
 view.append(text("p","Select a case to view its details."),list);
 if(!data.canSimulateIntake)return;
 renderInbox(view,data.routingCases,openInbox);
 const form=document.createElement("form");
 const label=text("label","Simulate a fictional Cedar tenant request");
 label.htmlFor="support-request";
 const field=document.createElement("textarea");
 field.id="support-request";field.required=true;field.maxLength=500;field.rows=3;
 const button=text("button","Submit and route automatically");button.type="submit";
 const status=text("p","Use fictional details only.");status.setAttribute("role","status");
 let pending;
 form.append(label,field,button,status);
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  const description=field.value.trim();
  if(!description||button.disabled)return;
  if(pending?.description!==description)pending={description,requestId:crypto.randomUUID()};
  button.disabled=true;
  try{
   const result=await getJSON("/api/support-intake",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(pending)});
   await openWorkspace("support",result.case.id);
  }catch(e){status.textContent=e.message;button.disabled=false;}
 });
 view.prepend(form);
}
async function openWorkspace(id,openCaseId,openInbox=false){
 byId("heading").textContent=labels[id]||"Workspace";
 const view=byId("view");view.replaceChildren(text("p","Loading permitted fictional information…"));
 try{
  const data=await getJSON("/api/workspace?module="+encodeURIComponent(id));
  view.replaceChildren();
  const intro=text("p",data.description);intro.className="muted";view.append(intro);
  if(data.routingCases){
   renderRouting(view,data,openCaseId,openInbox);
   byId("feedback").textContent="Automatic routing and response drafts · fictional data · human review required";
  }else{
  const table=document.createElement("table"),body=document.createElement("tbody");
  for(const entry of data.records){
   const row=document.createElement("tr");
   for(const field of entry)row.append(text("td",String(field)));
   body.append(row);
  }
  table.append(body);view.append(table);
  byId("feedback").textContent="Server-authorized view · read-only · fictional data";
  }
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
