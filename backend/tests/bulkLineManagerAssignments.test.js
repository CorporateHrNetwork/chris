const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { buildAssignmentTemplateWorkbook, prepareAssignmentRows, assignEmployee } = require('../src/services/employeeEmploymentAssignmentService');
const service = require('../src/services/lineManagerService');
function fixture() {
  const employees = [
    { id: 'e', organizationId: 'org', employeeNumber: 'E001', firstName: 'Employee', status: 'ACTIVE', exitDate: null, designationId: 'junior', designation: { id: 'junior' }, locationId: 'branch', employmentType: 'Full-Time', costCentreId: null },
    { id: 'm', organizationId: 'org', employeeNumber: 'M001', firstName: 'Manager', status: 'ACTIVE', exitDate: null, designationId: 'senior', designation: { id: 'senior' }, locationId: 'branch' },
    { id: 'x', organizationId: 'other', employeeNumber: 'X001', status: 'ACTIVE', exitDate: null },
  ];
  let state = { assignments: [], audits: [], employeeUpdates: [] };
  const matches = (e,w) => Object.entries(w).every(([k,v]) => k === 'NOT' ? e.id !== v.id : v && typeof v === 'object' && v.in ? v.in.includes(e[k]) : e[k] === v);
  const db = {
    organization: { findUnique: async () => ({ id:'org', slug:'zermatt-liquor-limited' }) },
    costCentre: { findMany: async () => [] },
    employee: {
      findMany: async ({where}) => employees.filter(e => matches(e,where)),
      findFirst: async ({where}) => employees.find(e => matches(e,where)) || null,
      update: async ({where,data}) => { state.employeeUpdates.push(data); return {...employees.find(e=>e.id===where.id),...data}; },
    },
    designation: { findMany: async () => [{id:'junior',reportsToDesignationId:'senior'}, {id:'senior',reportsToDesignationId:null}] },
    employeeLineManagerAssignment: {
      findFirst: async ({where}) => state.assignments.find(a => matches(a,where)) || null,
      findUnique: async ({where}) => state.assignments.find(a=>a.id===where.id),
      create: async ({data}) => { const a={id:`a${state.assignments.length}`,effectiveTo:null,...data}; state.assignments.push(a); return a; },
      update: async ({where,data}) => Object.assign(state.assignments.find(a=>a.id===where.id),data),
    },
    organizationAudit: { create: async ({data}) => { state.audits.push(data); } },
    $transaction: async fn => { const before=structuredClone(state); try{return await fn(db);}catch(e){state=before;throw e;} },
  };
  return {db,employees,get state(){return state;}};
}
function workbook(rows) {const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Employee Assignments');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
const row = { 'Employee No':'E001', 'Line Manager Employee No':'M001', 'Manager Effective From':'2026-01-01', Reason:'Approved reporting assignment' };
const input = { organizationId:'org', actorUserId:'hr', employeeNumber:'E001', managerEmployeeNumber:'M001', managerEffectiveFrom:'2026-01-01', reason:'Approved reporting assignment' };
test('template prefills employees and reference sheet without actionable example rows', async()=>{
 const f=fixture(); const buffer=buildAssignmentTemplateWorkbook({employees:[f.employees[0]],managers:[f.employees[1]]}); const wb=XLSX.read(buffer);
 const rows=XLSX.utils.sheet_to_json(wb.Sheets['Employee Assignments'],{defval:''}); assert.equal(rows[0]['Employee No'],'E001'); assert.equal(rows[0]['Line Manager Employee No'],''); assert.ok(wb.Sheets['Manager Reference']);
 assert.deepEqual(await prepareAssignmentRows(f.db,{organizationId:'org',buffer}),[]);
});
test('manager-only preview resolves name and makes no changes',async()=>{
 const f=fixture();const rows=await prepareAssignmentRows(f.db,{organizationId:'org',buffer:workbook([row])});assert.equal(rows[0].valid,true);assert.equal(rows[0].display.managerName,'Manager');assert.equal(f.state.assignments.length,0);
});
test('reject unknown, cross-tenant, self, inactive, outside hierarchy, future, invalid dates and branch',async()=>{
 for(const [patch,error] of [
  [{'Line Manager Employee No':'X001'},'this organization'],
  [{'Line Manager Employee No':'E001'},'SELF_MANAGER'],
  [{'Manager Effective From':'2999-01-01'},'FUTURE_EFFECTIVE_DATE'],
  [{'Manager Effective From':'2026-02-30'},'YYYY-MM-DD'],
  [{'Manager Effective From':''},'YYYY-MM-DD'],
 ]) {const f=fixture();const [r]=await prepareAssignmentRows(f.db,{organizationId:'org',buffer:workbook([{...row,...patch}])}); assert.equal(r.valid,false);assert.ok(r.errors.join(' ').includes(error),r.errors.join(' '));}
 const f=fixture();f.employees[1].status='INACTIVE';let [r]=await prepareAssignmentRows(f.db,{organizationId:'org',buffer:workbook([row])});assert.ok(r.errors.includes('MANAGER_NOT_CURRENT'));
 f.employees[1].status='ACTIVE';f.employees[1].designationId='junior';[r]=await prepareAssignmentRows(f.db,{organizationId:'org',buffer:workbook([row])});assert.ok(r.errors.includes('MANAGER_OUTSIDE_DESIGNATION_HIERARCHY'));
 [r]=await prepareAssignmentRows(f.db,{organizationId:'org',activeLocationId:'another',buffer:workbook([row])});assert.equal(r.valid,false);
});
test('duplicate employees are rejected',async()=>{const f=fixture();const rows=await prepareAssignmentRows(f.db,{organizationId:'org',buffer:workbook([row,row])});assert.ok(rows.every(r=>!r.valid&&r.errors.some(e=>e.includes('Duplicate'))));});
test('manager-only apply records history and audit without changing other employee fields, retry is unchanged',async()=>{
 const f=fixture();let r=await assignEmployee(f.db,input);assert.equal(r.changed,true);assert.equal(f.state.assignments.length,1);assert.equal(f.state.audits[0].actorUserId,'hr');assert.equal(f.state.employeeUpdates.length,0);
 r=await assignEmployee(f.db,input);assert.equal(r.changed,false);assert.equal(f.state.assignments.length,1);
});
test('blank manager preserves assignment; legacy employment type workbook remains supported',async()=>{
 const f=fixture();await assignEmployee(f.db,input);const buffer=workbook([{'Employee No':'E001','Employment Type':'Part-time'}]);const [r]=await prepareAssignmentRows(f.db,{organizationId:'org',buffer});assert.equal(r.valid,true);await assignEmployee(f.db,{organizationId:'org',...r.input});assert.equal(f.state.assignments.length,1);assert.equal(f.state.employeeUpdates[0].employmentType,'Part-time');
});
test('commit revalidates manager and branch; failed mixed updates leave no partial changes',async()=>{
 const f=fixture();await prepareAssignmentRows(f.db,{organizationId:'org',buffer:workbook([row])});f.employees[1].status='INACTIVE';await assert.rejects(assignEmployee(f.db,{...input,employmentType:'Part-time'}),/MANAGER_NOT_CURRENT/);assert.equal(f.state.employeeUpdates.length,0);assert.equal(f.state.assignments.length,0);
 await assert.rejects(assignEmployee(f.db,{...input,activeLocationId:'other'}),/EMPLOYEE_OUTSIDE_ACTIVE_BRANCH/);
});
test('history reason, backdating and cycles remain enforced',async()=>{
 const f=fixture();f.state.assignments.push({id:'prior',organizationId:'org',employeeId:'e',managerEmployeeId:'old',effectiveFrom:new Date('2026-02-01'),effectiveTo:null});
 await assert.rejects(assignEmployee(f.db,input),/INVALID_EFFECTIVE_DATE/);
 await assert.rejects(assignEmployee(f.db,{...input,managerEffectiveFrom:'2026-03-01',reason:''}),/CHANGE_REASON_REQUIRED/);
 const g=fixture();g.state.assignments.push({id:'cycle',organizationId:'org',employeeId:'m',managerEmployeeId:'e',effectiveTo:null});await assert.rejects(assignEmployee(g.db,input),/MANAGEMENT_CYCLE/);
});
test('single-manager API still uses the shared validated transaction',async()=>{const f=fixture();await service.setLineManager(f.db,{organizationId:'org',employeeId:'e',managerEmployeeId:'m',effectiveFrom:new Date('2026-01-01')});assert.equal(f.state.assignments.length,1);});
test('Excel date cells are accepted regardless of their display format',async()=>{
 const f=fixture();const [r]=await prepareAssignmentRows(f.db,{organizationId:'org',buffer:workbook([{...row,'Manager Effective From':new Date('2026-01-01T00:00:00Z')}])});assert.equal(r.valid,true);assert.equal(r.input.managerEffectiveFrom,'2026-01-01');
});
test('failure after manager creation rolls back assignment and audit',async()=>{
 const f=fixture();f.db.employee.update=async()=>{throw new Error('update failed');};await assert.rejects(assignEmployee(f.db,{...input,employmentType:'Part-time'}),/update failed/);assert.equal(f.state.assignments.length,0);assert.equal(f.state.audits.length,0);
});
