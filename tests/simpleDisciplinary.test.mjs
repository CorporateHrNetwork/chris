import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},plugins:[{name:'disciplinary-fixture',enforce:'pre',resolveId(id){if(/services\/api(?:\.js)?$/.test(id))return '\0disciplinary-api';},load(id){if(id==='\0disciplinary-api')return 'export const apiRequest=(...a)=>globalThis.disciplinaryTestApi(...a);';}},react()]});
const {default:Workspace}=await server.ssrLoadModule('/src/components/employees/SimpleDisciplinaryWorkspace.jsx');
try{
 for(const ess of [false,true])await test(ess?'ESS provides response/appeal actions without HR administration':'HR workspace presents next permitted action and one versioned submission',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/disciplinary-procedures'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  let row={id:'case-1',caseNumber:'ER-SYNTHETIC',employeeNumber:'SYN-1',incidentSummary:'Synthetic case',rights:{hr:true},workflow:{version:2,stage:ess?'EMPLOYEE_RESPONSE':'SCREENING',ownerUserId:'hr',dueDate:'2026-11-05',queryText:ess?'Please explain the incident.':null}};
  const calls=[];globalThis.disciplinaryTestApi=async(url,options={})=>{calls.push({url,...options});if(url.endsWith('/employee-options'))return {data:[]};if(url.endsWith('/owners'))return {data:[{id:'hr',name:'Synthetic HR',roles:['Head HR']}]};if(url.endsWith('/configuration'))return {data:{userId:'hr',targets:{screen:2,response:3,review:5,appeal:5},outcomes:['NO_CASE_ESTABLISHED']}};if(url.endsWith('/actions'))return {data:{stage:'REVIEW'}};if(url.endsWith('/cases'))return {data:[row]};if(url.endsWith('/cases/case-1'))return {data:row};throw Error('Unexpected request '+url);};
  const root=createRoot(document.getElementById('root'));
  try{
   await act(async()=>root.render(React.createElement(Workspace,ess?{essRequest:globalThis.disciplinaryTestApi}:{})));
   const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
   assert.equal(!!button('Report an Issue'),!ess);assert.ok(button('My Pending Tasks'));assert.ok(button('Track Cases'));assert.equal(calls.some(c=>c.method==='POST'),false);
   await act(async()=>button('ER-SYNTHETIC').click());
   const select=[...document.querySelectorAll('select')].find(s=>s.closest('label').textContent.startsWith('Action'));
   assert.ok(select);const values=[...select.options].map(o=>o.value);
   assert.ok(values.includes(ess?'RESPOND':'ISSUE_QUERY'));assert.equal(values.includes('DECIDE'),false);
   if(ess){assert.equal(button('Download Evidence Pack'),undefined);assert.equal(button('Service Targets'),undefined);}
   await act(async()=>{select.value=ess?'RESPOND':'ISSUE_QUERY';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
   for(const textarea of document.querySelectorAll('textarea[required]'))await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'Synthetic recorded explanation');textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));textarea.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
   const submit=button(ess?'Submit response':'Issue query');assert.ok(submit);
   await act(async()=>submit.closest('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
   const posted=calls.filter(c=>c.method==='POST');assert.equal(posted.length,1);assert.equal(posted[0].body.expectedVersion,2);assert.equal(posted[0].body.action,ess?'RESPOND':'ISSUE_QUERY');
  }finally{await act(async()=>root.unmount());dom.window.close();}
 });
 await test('ESS case notice opens the employee workspace without exposing allegations',async()=>{
  const {default:Notice}=await server.ssrLoadModule('/src/components/ess/DisciplinaryEssNotice.jsx');
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/ess'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.getElementById('root'));let opened=false;
  try{await act(async()=>root.render(React.createElement(Notice,{essRequest:async()=>({data:[{workflow:{stage:'EMPLOYEE_RESPONSE'},incidentSummary:'Private allegation'}]}),onOpen:()=>{opened=true;}})));assert.match(document.body.textContent,/1 disciplinary case update/);assert.equal(document.body.textContent.includes('Private allegation'),false);await act(async()=>document.querySelector('button').click());assert.equal(opened,true);}finally{await act(async()=>root.unmount());dom.window.close();}
 });
}finally{await server.close();}
