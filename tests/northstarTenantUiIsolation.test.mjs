import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {MemoryRouter} from "react-router-dom";
import {createServer} from "vite";

test("Northstar displays synthetic module preview while other demo tenant stays isolated", async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost/leave"});
 const names={window:dom.window,document:dom.window.document,
   localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,
   navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true};
 const saved=new Map();
 for(const [k,v] of Object.entries(names)){
   saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));
   Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});
 }
 let server,root;
 try{
   server=await createServer({server:{middlewareMode:true},appType:"custom"});
   const {default:DemoPolicyWorkspace}=await server.ssrLoadModule("/src/demo/DemoPolicyWorkspace.jsx");
   const container=document.getElementById("root");
   root=createRoot(container);
   const render=async slug=>{
     localStorage.setItem("chris_organization",JSON.stringify({
       id:slug==="chris-demo-company"?"chris-demo-org-20261022":"chris-client-demo-org-20261025",
       slug,name:slug==="chris-demo-company"?"Northstar Demo Industries":"CHRiS DEMO LTD"
     }));
     await act(async()=>root.render(React.createElement(MemoryRouter,{key:slug,initialEntries:["/leave"]},React.createElement(DemoPolicyWorkspace))));
     return container.textContent;
   };
   const northstar=await render("chris-demo-company");
   assert.match(northstar,/Consistent fictional workforce dataset/);
   assert.match(northstar,/Northstar Demo Industries/i);
   assert.match(northstar,/48/);
   const other=await render("chris-client-demo-10");
   assert.match(other,/Independent demo configuration/);
   assert.match(other,/CHRiS DEMO LTD/);
   assert.doesNotMatch(other,/Consistent fictional workforce dataset|NS-FICTION-|NORTHSTAR DEMO INDUSTRIES/);
 }finally{
   if(root)await act(async()=>root.unmount());
   if(server)await server.close();
   dom.window.close();
   for(const [k,v] of saved){
     if(v)Object.defineProperty(globalThis,k,v);
     else delete globalThis[k];
   }
 }
});
