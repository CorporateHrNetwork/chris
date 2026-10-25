import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Load the real route boundary and every child; replace only the API transport.
const server = await createServer({
  configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true },
  plugins: [{ name: 'fixture-api', enforce: 'pre',
    resolveId(id) { if (/services\/api(?:\.js)?$/.test(id)) return '\0fixture-api'; },
    load(id) { if (id === '\0fixture-api') return 'export const apiRequest = (...args) => globalThis.employeeTestApi(...args); export const getAuthToken = () => "fixture";'; },
  }, react()],
});
const { default: EmployeeProfile } = await server.ssrLoadModule('/src/components/employees/EmployeeProfile.jsx');
const { default: Boundary } = await server.ssrLoadModule('/src/components/employees/EmployeeProfileErrorBoundary.jsx');

try {
  for (const explicitDepartments of [true, false]) {
    await test(`Edit remains open after delayed catalogues (explicit departments: ${explicitDepartments})`, async () => {
      const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/employees/TEST-001', pretendToBeVisual: true });
      Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
      const department = { id: 'dep-1', name: 'Operations', code: 'OPS' };
      const level = { levelNumber: 3, code: 'L3', name: 'Supervisor' };
      const designation = { id: 'des-1', name: 'Supervisor', code: 'SUP', department, employmentLevel: level };
      const employee = { id: 'emp-1', employeeNumber: 'TEST-001', firstName: 'Test', lastName: 'Employee', departmentId: department.id, department, designationId: designation.id, designation, employmentType: 'Full-Time', status: 'ACTIVE', gender: 'MALE', hireDate: '2025-01-01', locationId: explicitDepartments ? 'loc-1' : '', location: { id: 'loc-1', name: 'Test Office', code: 'TEST' } };
      const levelState = { employee, effective: level, designationDefault: level };
      let releaseCareer;
      const delayedCareer = new Promise(resolve => { releaseCareer = resolve; });
      const calls = [];
      globalThis.employeeTestApi = async (url, options) => {
        calls.push({ url, method: options?.method || 'GET' });
        if (url === '/api/employees/career/catalog') return delayedCareer;
        if (url === '/api/location-catalog') return { data: [{ id: 'loc-1', name: 'Test Office', code: 'TEST', city: 'Abuja' }] };
        if (url === '/api/auth/me') return { data: { permissions: ['employees.update'] } };
        if (url === '/api/employees/TEST-001') return { data: employee };
        if (url.includes('employment-level') && !url.endsWith('employment-levels')) return { data: levelState };
        if (url.endsWith('employment-levels')) return { data: [level] };
        if (url.endsWith('/career/designations')) return { data: [designation] };
        if (url.endsWith('/employment-types/catalog')) return { data: { employmentTypes: ['Full-Time'] } };
        if (url.includes('/line-managers/')) return { current: null };
        if (['/lifecycle', '/employment-episodes', '/onboarding/status'].some(suffix => url.endsWith(suffix))) return { data: [] };
        throw new Error(`Unmocked request: ${url}`);
      };
      const errors = [];
      const originalError = console.error;
      console.error = (...args) => { errors.push(args); originalError(...args); };
      const root = createRoot(document.getElementById('root'));
      try {
        await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ['/employees/TEST-001'] }, React.createElement(Routes, null, React.createElement(Route, { path: '/employees/:employeeNumber', element: React.createElement(Boundary, null, React.createElement(EmployeeProfile)) })))));
        const edit = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Edit Employee');
        assert.ok(edit, 'actual profile edit button is available');
        await act(async () => edit.click());
        assert.ok(document.querySelector('select[name="departmentId"]'), 'form opens before career response');
        await act(async () => releaseCareer({ data: [designation], departments: explicitDepartments ? [department] : [] }));
        assert.ok(!document.querySelector('[role="alert"]'), 'route error boundary must not activate');
        const select = document.querySelector('select[name="departmentId"]');
        assert.ok(select, 'edit form remains mounted after catalogue updates');
        assert.equal(select.options[1].value, department.id);
        assert.equal(select.options[1].textContent, 'Operations (OPS)');
        assert.equal(document.querySelector('select[name="designationId"]').value, designation.id);
        assert.equal(document.querySelector('select[name="employmentLevel"]').value, '3');
        assert.equal(document.querySelectorAll('input[type="search"]').length, 2, 'real governance selectors also rendered');
        for (const field of document.querySelectorAll('input, select, textarea')) {
          assert.ok(field.id || field.name, `field missing identity: ${field.outerHTML}`);
        }
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        assert.equal(new Set(ids).size, ids.length, 'no duplicate field IDs');
        // Exceed the reported three-second failure window after all requests settle.
        await act(async () => new Promise(resolve => setTimeout(resolve, 3500)));
        assert.ok(document.querySelector('select[name="departmentId"]'));
        assert.deepEqual(errors, [], 'no React errors or warnings');
        assert.ok(calls.every(call => call.method === 'GET'), 'opening Edit never writes employee data');
      } finally {
        await act(async () => root.unmount());
        console.error = originalError;
        dom.window.close();
      }
    });
  }
} finally { await server.close(); }
