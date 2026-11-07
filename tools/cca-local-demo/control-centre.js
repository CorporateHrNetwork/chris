"use strict";
// Static fictional data. No fetch, localStorage, WebSocket, or network calls.
const clients = Object.freeze([
  {name:"Cedar Demo Services",industry:"Professional services",id:"demo-cedar",product:"CHRiS",stage:"Demonstration",owner:"Demo Success Team"},
  {name:"Atlas Demo Works",industry:"Light manufacturing",id:"demo-atlas",product:"CHRiS",stage:"Demonstration",owner:"Demo Support Team"}
]);
const agents = Object.freeze([
  {name:"Intake & Triage Agent",purpose:"Classifies incoming fictional support requests",scope:"Intake metadata only",status:"Simulation"},
  {name:"HR Support Agent",purpose:"Drafts HR module troubleshooting suggestions",scope:"Assigned demo cases",status:"Simulation"},
  {name:"Technical Support Agent",purpose:"Drafts engineering issue investigations",scope:"Approved fictional evidence",status:"Simulation"},
  {name:"Billing Review Agent",purpose:"Flags demo entitlement and renewal exceptions",scope:"Billing preview only",status:"Simulation"}
]);
const releases = Object.freeze([
  {product:"CHRiS",version:"DEMO 0.1",stage:"Proposal",guard:"No deployment connection"},
  {product:"CCA",version:"Prototype",stage:"Local validation",guard:"Independent security review required"}
]);
const audit = Object.freeze([
  {event:"CCA session policy",actor:"Synthetic policy test",control:"Verify issuer, token expiry and MFA"},
  {event:"Tenant boundary",actor:"Synthetic operator",control:"Deny unrelated tenant cases"},
  {event:"Subscription change",actor:"Synthetic approver",control:"Blocked until independent entitlement verification"}
]);
function element(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
function renderClients(query=""){
  const needle=query.trim().toLocaleLowerCase();
  const target=document.getElementById("clientRows");target.replaceChildren();
  const matches=clients.filter(c=>(c.name+" "+c.industry+" "+c.product).toLocaleLowerCase().includes(needle));
  for(const c of matches){const card=element("article","tile");card.append(element("h3","",c.name),element("p","muted",c.industry+" · "+c.id),element("p","",c.product+" · "+c.stage),element("p","muted","Contact: "+c.owner));
    target.append(card);}
  if(!matches.length)target.append(element("p","muted","No fictional organizations match your search."));
}
function renderAgents(){
  const target=document.getElementById("agentRows");
  for(const a of agents){const card=element("article","tile");card.append(element("h3","",a.name),element("p","",a.purpose),element("p","muted","Scope: "+a.scope),element("span","pill",a.status));target.append(card);}
}
function renderSubscriptions(){
  const target=document.getElementById("subscriptionRows");
  for(const c of clients){const row=document.createElement("tr");
    for(const field of [c.name,"Demo — no billing","SIMULATED","None; production actions disabled"])row.append(element("td","",field));
    target.append(row);}
}
function renderReleases(){
  const target=document.getElementById("releaseRows");
  for(const r of releases){const card=element("article","tile");card.append(element("h3","",r.product+" · "+r.version),element("p","",r.stage),element("p","muted",r.guard));target.append(card);}
}
function renderAudit(){
  const target=document.getElementById("auditRows");
  for(const a of audit){const row=document.createElement("tr");
    for(const field of [a.event,a.actor,a.control])row.append(element("td","",field));target.append(row);}
}
for(const button of document.querySelectorAll("[data-tab]")){
  button.addEventListener("click",()=>{
    for(const tab of document.querySelectorAll("[data-tab]"))tab.setAttribute("aria-selected",String(tab===button));
    for(const section of document.querySelectorAll("main > section.panel"))section.hidden=section.id!==button.dataset.tab;
  });
}
document.getElementById("search").addEventListener("input",e=>renderClients(e.target.value));
renderClients();renderAgents();renderSubscriptions();renderReleases();renderAudit();
