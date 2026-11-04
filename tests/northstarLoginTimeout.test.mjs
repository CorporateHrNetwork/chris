import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {JSDOM} from "jsdom";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {MemoryRouter} from "react-router-dom";
import {createServer} from "vite";

const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("admin login limits sign-in and resets loading state on timeout",()=>{
 const source=read("src/pages/Login.jsx");
 assert.match(source,/new AbortController\(\)/);
 assert.match(source,/setTimeout\(\(\) => loginController\.abort\(\), 20000\)/);
 assert.match(source,/signal: loginController\.signal/);
 assert.match(source,/err\.name === "AbortError"/);
 assert.match(source,/window\.clearTimeout\(loginTimeout\)/);
 assert.match(source,/setLoading\(false\)/);
 assert.match(source,/Please retry/);
});
test("workspace recovery never accepts unverified browser identity",()=>{
 const source=read("src/components/auth/ProtectedRoute.jsx");
 assert.match(source,/const verified = await verifyAuthSession\(\)/);
 assert.match(source,/if \(!profile\?\.userId \|\| !organization\?\.id \|\| !organization\?\.slug\)/);
 assert.match(source,/clearAuthSession\(\)/);
 assert.match(source,/setAuthState\("authenticated"\)/);
});
test("session recovery restores Northstar after validated missing cache",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost/"});
 const entries={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,
   localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,
   IS_REACT_ACT_ENVIRONMENT:true};
 const original=new Map();
 for(const [k,v] of Object.entries(entries)){
   original.set(k,Object.getOwnPropertyDescriptor(globalThis,k));
   Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});
 }
 const originalFetch=globalThis.fetch;
 let root,server;
 try{
   server=await createServer({server:{middlewareMode:true},appType:"custom"});
   const {default:ProtectedRoute}=await server.ssrLoadModule("/src/components/auth/ProtectedRoute.jsx");
   root=createRoot(document.getElementById("root"));
   sessionStorage.setItem("chris_token","synthetic-test-token");
   globalThis.fetch=async()=>new Response(JSON.stringify({status:"success",data:{
     userId:"demo-user",email:"sample@example.invalid",roles:["HR"],
     organization:{id:"chris-demo-org-20261022",slug:"chris-demo-company",name:"Northstar Demo Industries"}
   }}),{status:200});
   await act(async()=>root.render(React.createElement(MemoryRouter,null,
     React.createElement(ProtectedRoute,null,React.createElement("span",null,"Demo workspace ready")))));
   assert.match(document.body.textContent,/Demo workspace ready/);
   assert.equal(JSON.parse(sessionStorage.getItem("chris_organization")).slug,"chris-demo-company");
   assert.equal(JSON.parse(sessionStorage.getItem("chris_user")).id,"demo-user");
 }finally{
   if(root)await act(async()=>root.unmount());
   if(server)await server.close();
   globalThis.fetch=originalFetch;
   dom.window.close();
   for(const [k,desc] of original){if(desc)Object.defineProperty(globalThis,k,desc);else delete globalThis[k];}
 }
});
