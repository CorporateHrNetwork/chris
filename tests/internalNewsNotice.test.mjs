import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';

test('news publish feedback expires, restarts for repeated messages, dismisses manually, and leaves the published row intact', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const originals = new Map();
  for (const [key, value] of Object.entries({ window:dom.window, document:dom.window.document,
    localStorage:dom.window.localStorage, sessionStorage:dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT:true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  }
  const server = await createServer({ server:{middlewareMode:true}, appType:'custom' });
  const { default: News } = await server.ssrLoadModule('/src/pages/InternalNewsManagement.jsx');
  const root = createRoot(document.getElementById('root'));
  const rows = ['one','two','three'].map(id => ({ id,category:'ANNOUNCEMENT',title:id,status:'DRAFT' }));
  const previousFetch = globalThis.fetch;
  let rejectUpdate = false;
  globalThis.fetch = async (url,options = {}) => {
    if (options.method==='PATCH') {
      if (rejectUpdate) return new Response(JSON.stringify({message:'Update failed'}),{status:500});
      const id = String(url).split('/').at(-2);
      rows.find(r=>r.id===id).status=JSON.parse(options.body).status;
    }
    return new Response(JSON.stringify({status:'success',data:structuredClone(rows)}),{status:200});
  };
  try {
    t.mock.timers.enable({apis:['setTimeout']});
    window.setTimeout=globalThis.setTimeout;
    window.clearTimeout=globalThis.clearTimeout;
    await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(News))));
    const publish = () => [...document.querySelectorAll('button')].find(b=>b.textContent==='Publish');
    const status = () => document.querySelector('[role="status"]');
    await act(async()=>publish().click());
    assert.match(status().textContent,/News item moved to PUBLISHED/);
    assert.equal(rows[0].status,'PUBLISHED');
    await act(async()=>t.mock.timers.tick(4000));
    assert.ok(status());
    await act(async()=>publish().click());
    await act(async()=>t.mock.timers.tick(500));
    assert.ok(status(),'older timeout cannot clear the newer identical confirmation');
    await act(async()=>t.mock.timers.tick(4000));
    assert.equal(status(),null);
    assert.equal(rows[0].status,'PUBLISHED','dismissing feedback never reverts publication');
    assert.equal(rows[1].status,'PUBLISHED');
    await act(async()=>publish().click());
    await act(async()=>document.querySelector('[aria-label="Dismiss notification"]').click());
    assert.equal(status(),null);
    rejectUpdate=true;
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Return to Draft').click());
    assert.equal(status(),null);
    assert.match(document.querySelector('[role="alert"]').textContent,/Update failed/);
    await act(async()=>t.mock.timers.tick(6000));
    assert.ok(document.querySelector('[role="alert"]'),'errors remain available for correction');
    await act(async()=>root.unmount());
    await act(async()=>t.mock.timers.tick(6000));
  } finally {
    t.mock.timers.reset();
    globalThis.fetch=previousFetch;
    await server.close();
    dom.window.close();
    for(const [key,descriptor] of originals) {
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  }
});
