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
      const targetDepartment = { id: 'dep-2', name: 'Finance', code: 'FIN' };
      const level = { levelNumber: 3, code: 'L3', name: 'Supervisor' };
      const alternateLevel = { levelNumber: 2, code: 'L2', name: 'Officer' };
      const currentDesignation = { id: 'des-1', name: 'Supervisor', code: 'SUP', department, employmentLevel: level };
      const designation = { ...currentDesignation, department: targetDepartment, departmentEligibility: [{ department }] };
      const employee = { id: 'emp-1', employeeNumber: 'TEST-001', firstName: 'Test', lastName: 'Employee', departmentId: department.id, department, designationId: currentDesignation.id, designation: currentDesignation, employmentType: 'Full-Time', status: 'ACTIVE', gender: 'MALE', hireDate: '2025-01-01', locationId: explicitDepartments ? 'loc-1' : '', location: { id: 'loc-1', name: 'Test Office', code: 'TEST' } };
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
        if (url.endsWith('employment-levels')) return { data: [level, alternateLevel] };
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
        await act(async () => releaseCareer({ data: [designation], departments: explicitDepartments ? [department, targetDepartment] : [] }));
        assert.ok(!document.querySelector('[role="alert"]'), 'route error boundary must not activate');
        const select = document.querySelector('select[name="departmentId"]');
        assert.ok(select, 'edit form remains mounted after catalogue updates');
        assert.equal(select.value, department.id);
        assert.equal([...select.options].find(option => option.value === department.id).textContent, 'Operations (OPS)');
        assert.equal(document.querySelector('select[name="designationId"]').value, designation.id);
        assert.equal(document.querySelector('select[name="employmentLevel"]').value, '3');
        const employmentLevelDate = document.querySelector('#employmentLevelEffectiveDate');
        const employmentLevelReason = document.querySelector('#employmentLevelReason');
        assert.equal(employmentLevelDate.required, false, 'an unchanged Employment Level does not constrain ordinary profile saves');
        assert.equal(employmentLevelReason.required, false, 'an unchanged Employment Level does not constrain ordinary profile saves');

        const employmentLevelSelect = document.querySelector('select[name="employmentLevel"]');
        await act(async () => {
          employmentLevelSelect.value = '2';
          employmentLevelSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
        assert.equal(employmentLevelDate.required, true, 'changing the employee-specific level requires its own effective date');
        assert.equal(employmentLevelReason.required, true, 'changing the employee-specific level requires its own reason');

        await act(async () => {
          employmentLevelSelect.value = '3';
          employmentLevelSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
        assert.equal(employmentLevelDate.required, false, 'restoring the current level removes the unrelated required constraint');
        assert.equal(employmentLevelReason.required, false, 'restoring the current level removes the unrelated required constraint');
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

        await act(async () => {
          const departmentSelect = document.querySelector('select[name="departmentId"]');
          departmentSelect.value = targetDepartment.id;
          departmentSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
        await act(async () => {
          const designationSelect = document.querySelector('select[name="designationId"]');
          designationSelect.value = designation.id;
          designationSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
        const reviewJobChange = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Review Job Change');
        await act(async () => reviewJobChange.click());
        assert.ok(document.querySelector('input#jobChangeEffectiveDate'), 'Job Change has its own effective date field');
        assert.ok(document.querySelector('input#jobChangeReason'), 'Job Change has its own reason field');
        assert.equal(document.querySelector('#jobChangeEffectiveDate').required, true, 'Job Change requires its own effective date');
        assert.equal(document.querySelector('#jobChangeReason').required, true, 'Job Change requires its own reason');
        assert.equal(document.querySelector('form select[name="departmentId"]').value, targetDepartment.id);
        assert.equal(document.querySelector('form select[name="designationId"]').value, currentDesignation.id, 'the Department-only Job Change keeps the designation');
        assert.equal(document.querySelector('#employmentLevelEffectiveDate'), null, 'the Job Change workflow does not render Employment Level date validation');
        const confirmJobChange = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Confirm Job Change');
        assert.equal(confirmJobChange.disabled, true, 'the Job Change cannot submit until its own reason is entered');

        assert.deepEqual(errors, [], 'the Job Change flow does not trigger a React error');
      } finally {
        await act(async () => root.unmount());
        console.error = originalError;
        dom.window.close();
      }
    });
  }
} finally { await server.close(); }
