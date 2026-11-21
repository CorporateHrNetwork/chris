import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('authenticated workspace recovers missing cached profile without hanging', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url:'http://localhost/' });
  const originals = new Map();
  for (const [key, value] of Object.entries({
    window:dom.window, document:dom.window.document,
    navigator:dom.window.navigator,
    localStorage:dom.window.localStorage, sessionStorage:dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT:true
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  }
  const oldFetch = globalThis.fetch;
  const server = await createServer({server:{middlewareMode:true},appType:'custom'});
  const {default:ProtectedRoute} = await server.ssrLoadModule('/src/components/auth/ProtectedRoute.jsx');
  const root = createRoot(document.getElementById('root'));
  const valid = {status:'success',data:{
    userId:'synthetic-user',email:'fixture@example.invalid',firstName:'Test',lastName:'User',
    roles:['HR'],permissions:['dashboard.view'],
    organization:{id:'synthetic-org',name:'Synthetic Organization',slug:'synthetic-org'}
  }};
  try {
    sessionStorage.setItem('chris_token','synthetic-saved-token');
    globalThis.fetch = async () => new Response(JSON.stringify(valid),{status:200});
    await act(async()=>root.render(React.createElement(MemoryRouter,null,
      React.createElement(ProtectedRoute,null,React.createElement('div',null,'Verified workspace')))));
    assert.match(document.body.textContent,/Verified workspace/);
    assert.equal(JSON.parse(sessionStorage.getItem('chris_user')).id,'synthetic-user');
    assert.equal(JSON.parse(sessionStorage.getItem('chris_organization')).slug,'synthetic-org');
    assert.equal(sessionStorage.getItem('chris_token'),'synthetic-saved-token');
  } finally {
    await act(async()=>root.unmount());
    await server.close();
    globalThis.fetch=oldFetch;
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});

test('workspace recovery requires verified identity and organization, never blindly trusts a saved token', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../src/components/auth/ProtectedRoute.jsx',import.meta.url),'utf8');
  assert.match(source,/const verified = await verifyAuthSession\(\)/);
  assert.match(source,/if \(!user\?\.userId \|\| !organization\?\.id \|\| !organization\?\.slug\)/);
  assert.match(source,/clearAuthSession\(\)/);
  assert.match(source,/setAuthState\("authenticated"\)/);
});
