import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';

const fixture = {
  profile:{firstName:'Synthetic',lastName:'Employee',name:'Synthetic Employee',employeeNumber:'TEST-001',status:'ACTIVE'},
  payroll:{payslips:[{id:'approved',periodName:'August approved',runStatus:'APPROVED',grossPay:450000,netPreview:400000,currency:'NGN'}],
    previews:[{id:'preview',periodName:'October preview',runStatus:'PENDING_APPROVAL',grossPay:450000,netPreview:399000,currency:'NGN'}],
    latestCalculation:{periodName:'October preview',runStatus:'PENDING_APPROVAL',grossPay:450000,netPreview:399000,currency:'NGN'}},
  statutory:{registered:{taxIdentificationNumber:'SYNTHETIC-TAX'},obligations:[
    {id:'current',periodYear:2026,periodMonth:10,obligationType:'PAYE',status:'DRAFT_CALCULATED',employeeAmount:100,currency:'NGN',recordKind:'CURRENT'},
    {id:'history',periodYear:2026,periodMonth:9,obligationType:'PAYE',status:'REVERSED',employeeAmount:100,currency:'NGN',recordKind:'HISTORY'}]},
  gratuity:{grossMonthly:450000,currency:'NGN',serviceStartDate:'2020-01-01',status:'ACCRUING'},
  payment:{bankName:'Synthetic Bank',accountNumber:'TEST-ACCOUNT'}
};

test('ESS restores a saved session without login flashes and retains financial sections and retry state', async () => {
  const dom = new JSDOM('<div id="root"></div>',{url:'http://localhost/ess'});
  const originals = new Map();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,
    localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true})) {
    originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  }
  const server=await createServer({server:{middlewareMode:true},appType:'custom'});
  const {default:ESS}=await server.ssrLoadModule('/src/pages/ESSPortal.jsx');
  const api=await server.ssrLoadModule('/src/services/essApi.js');
  let root=createRoot(document.getElementById('root'));
  const oldFetch=globalThis.fetch;
  const response=()=>new Response(JSON.stringify({status:'success',data:fixture}),{status:200});
  const password=()=>document.querySelector('input[type="password"]');
  const open=async name=>act(async()=>[...document.querySelectorAll('aside button')].find(b=>b.textContent.endsWith(name)).click());
  try {
    sessionStorage.setItem('chris_ess_token','synthetic-session');
    let complete;
    globalThis.fetch=()=>new Promise(resolve=>{complete=resolve;});
    await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(ESS))));
    assert.equal(password(),null,'login form must never precede saved-session verification');
    assert.match(document.body.textContent,/Starting CHRiS/);
    await act(async()=>complete(response()));
    assert.match(document.body.textContent,/Synthetic Employee/);
    await open('Payslips');
    assert.match(document.body.textContent,/August approved/);
    assert.match(document.body.textContent,/October preview/);
    assert.equal([...document.querySelectorAll('button')].filter(b=>b.textContent==='Download').length,1,
      'only approved slips have official download actions');
    await open('Payment & Payroll');
    assert.match(document.body.textContent,/TEST-ACCOUNT/);
    assert.match(document.body.textContent,/450,000/);
    assert.match(document.body.textContent,/Pending Approval/);
    await open('Statutory');
    assert.match(document.body.textContent,/Current calculation/);
    assert.match(document.body.textContent,/Reversal history/);
    await open('Gratuity');
    assert.match(document.body.textContent,/450,000/);
    assert.doesNotMatch(document.body.textContent,/Not available in payroll/);
    await act(async()=>root.unmount());
    root=createRoot(document.getElementById('root'));
    globalThis.fetch=async()=>{throw new Error('Temporary network failure');};
    await act(async()=>root.render(React.createElement(ESS)));
    assert.equal(password(),null,'temporary outage must not present a logged-out screen');
    assert.equal(sessionStorage.getItem('chris_ess_token'),'synthetic-session');
    assert.match(document.body.textContent,/Unable to load your portal/);
    globalThis.fetch=async()=>response();
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry').click());
    assert.match(document.body.textContent,/Synthetic Employee/);
    await act(async()=>root.unmount());
    root=createRoot(document.getElementById('root'));
    globalThis.fetch=async()=>new Response(JSON.stringify({message:'Session expired'}),{status:401});
    await act(async()=>root.render(React.createElement(ESS)));
    assert.ok(password(),'genuinely expired credentials still require login');
    assert.equal(sessionStorage.getItem('chris_ess_token'),null);
    await act(async()=>root.unmount());
    sessionStorage.setItem('chris_ess_token','older-session');
    let expire;
    globalThis.fetch=()=>new Promise(resolve=>{expire=resolve;});
    const stale=api.essRequest('/api/ess/dashboard');
    sessionStorage.setItem('chris_ess_token','newer-session');
    expire(new Response(JSON.stringify({message:'Session expired'}),{status:401}));
    await assert.rejects(stale,/Session expired/);
    assert.equal(sessionStorage.getItem('chris_ess_token'),'newer-session','late requests cannot clear a newer session');
  } finally {
    globalThis.fetch=oldFetch;
    await server.close();
    dom.window.close();
    for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
