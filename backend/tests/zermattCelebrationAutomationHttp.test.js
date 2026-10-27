const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRouter, authorized } = require('../src/routes/zermattCelebrationAutomationRoutes');

test('cron authentication fails closed and compares complete bearer secret', () => {
  const token='fixture-secret-which-is-at-least-32-characters';
  assert.equal(authorized({get:()=>`Bearer ${token}`},{CHRIS_CELEBRATION_CRON_TOKEN:token}),true);
  assert.equal(authorized({get:()=>`Bearer ${token}x`},{CHRIS_CELEBRATION_CRON_TOKEN:token}),false);
  assert.equal(authorized({get:()=>''},{}),false);
});
test('HTTP trigger rejects unauthorized calls and arbitrary recipients, reports incomplete delivery', async t => {
  const previous=process.env.CHRIS_CELEBRATION_CRON_TOKEN;
  process.env.CHRIS_CELEBRATION_CRON_TOKEN='fixture-secret-which-is-at-least-32-characters';
  t.after(()=>{if(previous===undefined)delete process.env.CHRIS_CELEBRATION_CRON_TOKEN;else process.env.CHRIS_CELEBRATION_CRON_TOKEN=previous});
  let runs=0;
  const ready={enabled:true,emailConfigured:true,smsConfigured:false};
  const app=express();app.use(express.json());app.use('/celebrations',createRouter({scheduler:{readiness:()=>ready,run:async()=>{runs++;return {date:'2026-10-27',channels:{'PHONE:PENDING_CONFIGURATION':1}}}}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/celebrations`;
  const headers={authorization:`Bearer ${process.env.CHRIS_CELEBRATION_CRON_TOKEN}`,'content-type':'application/json'};
  assert.equal((await fetch(base+'/dispatch',{method:'POST',body:'{}',headers:{'content-type':'application/json'}})).status,401);assert.equal(runs,0);
  const status=await fetch(base+'/status',{headers});assert.equal(status.status,200);assert.equal(runs,0);
  assert.equal((await fetch(base+'/dispatch',{method:'POST',headers,body:'{"organizationId":"other"}'})).status,400);assert.equal(runs,0);
  assert.equal((await fetch(base+'/dispatch',{method:'POST',headers,body:'{}'})).status,503);assert.equal(runs,1);
  ready.smsConfigured=true;
  // Configuration cannot hide a held delivery in the persistent ledger.
  assert.equal((await fetch(base+'/dispatch',{method:'POST',headers,body:'{}'})).status,503);
});
