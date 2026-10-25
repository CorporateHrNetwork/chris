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
      const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/employees/ZLL000107', pretendToBeVisual: true });
      Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
      const department = { id: 'dep-1', name: 'Operations', code: 'OPS' };
      const targetDepartment = { id: 'dep-2', name: 'Finance', code: 'FIN' };
      const level = { levelNumber: 2, code: 'L2', name: 'Branch Junior Officers and Team Leadership' };
      const alternateLevel = { levelNumber: 3, code: 'L3', name: 'Supervisor' };
      const currentDesignation = { id: 'des-1', name: 'Officer', code: 'OFF', department, departmentEligibility: [{ department: targetDepartment }], employmentLevel: level, careerLevel: 2 };
      const targetDesignation = { id: 'des-2', name: 'Senior Supervisor', code: 'SEN', department: targetDepartment, departmentEligibility: [{ department }], employmentLevel: alternateLevel, careerLevel: 3 };
      const employee = { id: 'emp-1', employeeNumber: 'ZLL000107', firstName: 'Jonah', middleName: 'Mary', lastName: 'Eneh', name: 'Jonah Mary Eneh', email: 'jonah@example.com', phone: '08000000000', departmentId: department.id, department, designationId: currentDesignation.id, designation: currentDesignation, employmentType: 'Full-Time', status: 'ACTIVE', gender: 'MALE', hireDate: '2020-01-01', locationId: explicitDepartments ? 'loc-1' : '', location: { id: 'loc-1', name: 'Test Office', code: 'TEST' } };
      const levelState = { employee, effective: level, designationDefault: level };
      let releaseCareer;
      const delayedCareer = new Promise(resolve => { releaseCareer = resolve; });
      const calls = [];
      const submissions = [];
      globalThis.employeeTestApi = async (url, options) => {
        calls.push({ url, method: options?.method || 'GET', body: options?.body });
        if (url === '/api/employees/career/catalog') return delayedCareer;
        if (url === '/api/location-catalog') return { data: [{ id: 'loc-1', name: 'Test Office', code: 'TEST', city: 'Abuja' }] };
        if (url === '/api/auth/me') return { data: { permissions: ['employees.update'] } };
        if (url === '/api/employees/ZLL000107') return { data: employee };
        if (url.includes('employment-level') && !url.endsWith('employment-levels')) return { data: levelState };
        if (url.endsWith('employment-levels')) return { data: [level, alternateLevel] };
        if (url.endsWith('/career/designations')) return { data: [currentDesignation, targetDesignation] };
        if (url.endsWith('/employment-types/catalog')) return { data: { employmentTypes: ['Full-Time', 'Part-time'] } };
        if (url.endsWith('/edit-change-set')) {
          const changes = JSON.parse(options.body).changes;
          submissions.push(changes);
          Object.assign(employee, changes.profile || {});
          if (changes.jobChange) {
            employee.departmentId = changes.jobChange.departmentId;
            employee.designationId = changes.jobChange.designationId;
            employee.department = changes.jobChange.departmentId === targetDepartment.id ? targetDepartment : department;
            employee.designation = changes.jobChange.designationId === targetDesignation.id ? targetDesignation : currentDesignation;
          }
          if (changes.employmentType) employee.employmentType = changes.employmentType.employmentType;
          if (changes.employmentLevel) {
            levelState.effective = changes.employmentLevel.useDesignationDefault || Number(changes.employmentLevel.levelNumber) === 2 ? level : alternateLevel;
            levelState.currentOverride = changes.employmentLevel.useDesignationDefault ? null : { levelNumber: levelState.effective.levelNumber };
          }
          return { message: 'Employee changes saved successfully.', data: { employee, employmentLevel: levelState } };
        }
        if (url.includes('/line-managers/')) return { current: null };
        if (['/lifecycle', '/employment-episodes', '/onboarding/status'].some(suffix => url.endsWith(suffix))) return { data: [] };
        throw new Error(`Unmocked request: ${url}`);
      };
      const errors = [];
      const originalError = console.error;
      console.error = (...args) => { errors.push(args); originalError(...args); };
      const root = createRoot(document.getElementById('root'));
      try {
        await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ['/employees/ZLL000107'] }, React.createElement(Routes, null, React.createElement(Route, { path: '/employees/:employeeNumber', element: React.createElement(Boundary, null, React.createElement(EmployeeProfile)) })))));
        const edit = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Edit Employee');
        assert.ok(edit, 'actual profile edit button is available');
        await act(async () => edit.click());
        assert.ok(document.querySelector('select[name="departmentId"]'), 'form opens before career response');
        await act(async () => releaseCareer({ data: [currentDesignation, targetDesignation], departments: explicitDepartments ? [department, targetDepartment] : [] }));
        assert.ok(!document.querySelector('[role="alert"]'), 'route error boundary must not activate');
        const select = document.querySelector('select[name="departmentId"]');
        assert.ok(select, 'edit form remains mounted after catalogue updates');
        assert.equal(select.value, department.id);
        assert.equal([...select.options].find(option => option.value === department.id).textContent, 'Operations (OPS)');
        assert.ok(document.body.textContent.includes('Jonah Mary Eneh'), 'regression employee Jonah Mary Eneh is loaded');
        assert.equal(document.querySelector('select[name="designationId"]').value, currentDesignation.id);
        assert.equal(document.querySelector('select[name="employmentLevel"]').value, '2');
        assert.equal(document.querySelector('#employmentLevelEffectiveDate'), null, 'unchanged Employment Level fields are hidden and do not constrain saves');
        assert.equal([...document.querySelectorAll('button')].filter(button => button.textContent.trim() === 'Save Changes').length, 1, 'Employee Edit presents one primary Save Changes action');
        assert.equal([...document.querySelectorAll('button')].some(button => /Save Employment|Confirm Job Change|Review Job Change/.test(button.textContent)), false, 'Employee Edit has no separate Employment Level or Job Change save action');
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

        const selectValue = async (selector, value) => act(async () => {
          const field = document.querySelector(selector);
          assert.ok(field, `missing ${selector}`);
          field.value = value;
          field.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
        const inputValue = async (selector, value) => act(async () => {
          const field = document.querySelector(selector);
          assert.ok(field, `missing ${selector}`);
          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, value);
          field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
          field.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
        const save = async () => act(async () => {
          const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Save Changes');
          assert.ok(button, 'single Save Changes button is present');
          const form = button.closest('form');
          if (!form.checkValidity()) throw new Error(JSON.stringify([...form.querySelectorAll(':invalid')].map(field => ({ name: field.name, id: field.id, value: field.value, type: field.type }))));
          button.click();
          await new Promise(resolve => setTimeout(resolve, 0));
        });
        const openEdit = async () => {
          const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Edit Employee');
          assert.ok(button, 'Edit Employee action is available');
          await act(async () => button.click());
        };

        await save();
        assert.deepEqual(submissions.at(-1), {}, 'no-change save submits an empty change set');
        assert.equal(employee.gender, 'MALE', 'no-change save leaves existing values untouched');

        if (!employee.locationId) {
          await openEdit();
          await selectValue('select[name="locationId"]', 'loc-1');
          await save();
          assert.equal(employee.locationId, 'loc-1', 'an explicit initial location can still be assigned from Employee Edit');
        }

        await openEdit();
        await selectValue('select[name="gender"]', 'FEMALE');
        await save();
        assert.deepEqual(submissions.at(-1), { profile: { gender: 'FEMALE' } }, 'Gender-only save contains only the changed field');
        assert.equal(employee.departmentId, department.id);
        assert.equal(employee.designationId, currentDesignation.id);
        assert.equal(employee.employmentType, 'Full-Time');

        await openEdit();
        await selectValue('select[name="departmentId"]', targetDepartment.id);
        assert.equal(document.querySelector('select[name="designationId"]').value, currentDesignation.id, 'Department-only change preserves an eligible unchanged Designation');
        assert.ok(document.querySelector('#jobChangeEffectiveDate'), 'Job Change metadata appears for a Department change');
        assert.equal(document.querySelector('#jobChangeEffectiveDate').required, true);
        assert.equal(document.querySelector('#jobChangeReason').required, true);
        assert.equal(document.querySelector('#employmentLevelEffectiveDate'), null, 'Department change does not request Employment Level metadata');
        await inputValue('#jobChangeReason', 'Department reassignment');
        assert.equal(document.querySelector('#jobChangeReason').value, 'Department reassignment');
        await save();
        assert.deepEqual(Object.keys(submissions.at(-1)), ['jobChange']);
        assert.equal(submissions.at(-1).jobChange.designationId, currentDesignation.id);
        assert.equal(employee.gender, 'FEMALE');
        assert.equal(employee.employmentType, 'Full-Time');
        assert.equal(levelState.effective.levelNumber, 2, 'Department-only save leaves Jonah Mary Eneh at L2');

        await openEdit();
        await selectValue('select[name="designationId"]', targetDesignation.id);
        assert.ok(document.querySelector('#jobChangeEffectiveDate'), 'Designation-only change requires Job Change date');
        await inputValue('#jobChangeReason', 'Designation reclassification');
        await save();
        assert.equal(submissions.at(-1).jobChange.departmentId, targetDepartment.id);
        assert.equal(submissions.at(-1).jobChange.designationId, targetDesignation.id);
        assert.equal(submissions.at(-1).employmentLevel, undefined);

        await openEdit();
        await selectValue('select[name="employmentType"]', 'Part-time');
        assert.equal(document.querySelector('#employmentTypeReason').required, true);
        await inputValue('#employmentTypeReason', 'Change to part time');
        await save();
        assert.deepEqual(Object.keys(submissions.at(-1)), ['employmentType']);
        assert.equal(employee.employmentType, 'Part-time');

        await openEdit();
        await selectValue('select[name="employmentLevel"]', '3');
        assert.ok(document.querySelector('#employmentLevelEffectiveDate'), 'changed Employment Level displays its effective date');
        assert.equal(document.querySelector('#employmentLevelEffectiveDate').required, true);
        assert.equal(document.querySelector('#employmentLevelReason').required, true);
        const levelOnlyEffectiveFrom = document.querySelector('#employmentLevelEffectiveDate').value;
        await inputValue('#employmentLevelReason', 'Level reassignment');
        await save();
        assert.equal(submissions.at(-1).employmentLevel.effectiveFrom, levelOnlyEffectiveFrom, 'Employment Level request uses effectiveFrom');
        assert.equal(submissions.at(-1).jobChange, undefined);

        await openEdit();
        await selectValue('select[name="departmentId"]', department.id);
        await selectValue('select[name="designationId"]', currentDesignation.id);
        await selectValue('select[name="gender"]', 'OTHER');
        await selectValue('select[name="employmentType"]', 'Full-Time');
        await inputValue('#employmentTypeReason', 'Return to full time');
        await selectValue('select[name="employmentLevel"]', '2');
        await inputValue('#jobChangeReason', 'Combined reorganization');
        await inputValue('#employmentLevelReason', 'Combined level review');
        const combinedEffectiveFrom = document.querySelector('#employmentLevelEffectiveDate').value;
        await save();
        const combined = submissions.at(-1);
        assert.deepEqual(Object.keys(combined).sort(), ['employmentLevel', 'employmentType', 'jobChange', 'profile']);
        assert.deepEqual(combined.profile, { gender: 'OTHER' });
        assert.equal(combined.employmentLevel.effectiveFrom, combinedEffectiveFrom);
        assert.equal(employee.gender, 'OTHER');
        assert.equal(employee.employmentType, 'Full-Time');
        assert.equal(employee.departmentId, department.id);
        assert.equal(employee.designationId, currentDesignation.id);
        assert.deepEqual(errors, [], 'single-save employee edit does not trigger React errors');
      } finally {
        await act(async () => root.unmount());
        console.error = originalError;
        dom.window.close();
      }
    });
  }
} finally { await server.close(); }
