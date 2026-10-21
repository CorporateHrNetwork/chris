const test = require('node:test');
const assert = require('node:assert/strict');
const { splitSalary, prepareSalaryRows } = require('../src/services/zermattSalarySplit');
const input = { employmentType: 'Full-Time', hireDate: '2020-01-01', periodMonth: '2026-11' };
test('threshold uses agreed gross; end-month and mid-month conserve the salary', () => {
  for (const [salary, pct, mid, end] of [[99999,16,15999.84,83999.16],[100000,25,25000,75000],[200000,25,50000,150000]]) {
    const r=splitSalary({...input,fullMonthlyGross:salary});
    assert.equal(r.midMonthPercentage,pct); assert.equal(r.normalMidMonth,mid); assert.equal(r.endMonthGross,end);
    assert.equal(Math.round((r.normalMidMonth+r.endMonthGross)*100),salary*100);
    assert.equal(Math.round(Object.values(r.components).reduce((s,n)=>s+n,0)*100),Math.round(end*100));
  }
});
test('new hires use inclusive 15-day period; unearned days are not arrears', () => {
  for (const [day,eligible] of [[1,15],[6,10],[15,1],[16,0],[30,0]]) {
    const r=splitSalary({...input,fullMonthlyGross:120000,hireDate:`2026-11-${String(day).padStart(2,'0')}`});
    assert.equal(r.eligibleDays,eligible); assert.equal(r.midMonthPercentage,25);
    assert.equal(r.midMonthPayable,30000*eligible/15); assert.equal(r.endMonthGross,90000);
  }
});
test('other employment types receive no mid-month entitlement', () => {
  for (const type of ['Part-time','Expatriate','NYSC/Internship','Contract']) {
    const r=splitSalary({...input,fullMonthlyGross:200000,employmentType:type});
    assert.equal(r.midMonthPayable,0); assert.equal(r.endMonthGross,200000);
  }
});
test('mid-month loan and statutory deductions are always zero', () => {
  const r=splitSalary({...input,fullMonthlyGross:200000,loanRecovery:50000});
  assert.equal(r.loanRecovery,0); assert.equal(r.statutoryDeductionOnMidMonth,0);
});
test('invalid salaries, dates and missing employee authority fail closed', () => {
  for (const gross of ['',0,-1,'1e5','10,00','100000.001','NaN','Infinity']) assert.throws(()=>splitSalary({...input,fullMonthlyGross:gross}));
  assert.throws(()=>splitSalary({...input,fullMonthlyGross:100000,hireDate:'2026-02-30'}));
  assert.throws(()=>splitSalary({...input,fullMonthlyGross:100000,employmentType:''}));
});
test('future hires cannot receive current mid-month pay and component rounding conserves kobo',()=>{
  const r=splitSalary({...input,fullMonthlyGross:'100,000.01',hireDate:'2026-12-01'});
  assert.equal(r.midMonthPayable,0);
  assert.equal(Math.round(Object.values(r.components).reduce((s,n)=>s+n,0)*100),Math.round(r.endMonthGross*100));
});
const staff=[{id:'employee-a',employeeNumber:'ZLL001',employmentType:'Full-Time',hireDate:new Date('2026-11-06T00:00:00Z')}];
const row={'Employee No':'ZLL001','Full Monthly Gross Salary':'120,000','Currency':'NGN','Effective From':'2026-11-01',Reason:'Opening full salary upload'};
test('bulk preview uses authoritative employee details and ignores submitted type or hire-date overrides',()=>{
  const [r]=prepareSalaryRows([{...row,EmploymentType:'Contract',HireDate:'2020-01-01'}],staff);
  assert.equal(r.valid,true);assert.equal(r.allocation.midMonthPayable,20000);assert.equal(r.allocation.endMonthGross,90000);
});
test('bulk preview rejects duplicate and out-of-scope employee numbers',()=>{
  const rows=prepareSalaryRows([row,{...row,'Employee No':'zll001'},{...row,'Employee No':'OTHER-TENANT'}],staff);
  assert.equal(rows[1].valid,false);assert.match(rows[1].errors.join(' '),/Duplicate/);
  assert.equal(rows[2].valid,false);assert.equal(rows[2].allocation,null);
});
test('bulk preview rejects invalid calendar dates, non-NGN and missing reasons',()=>{
  for(const bad of [{'Effective From':'2026-02-30'},{'Effective From':'2026-11-02'},{'Effective From':'2026-11-01abc'},{Currency:'USD'},{Reason:''}]) assert.equal(prepareSalaryRows([{...row,...bad}],staff)[0].valid,false);
});
test('empty and oversized bulk uploads fail before any database operation',()=>{
  assert.throws(()=>prepareSalaryRows([],staff));
  assert.throws(()=>prepareSalaryRows(Array(2001).fill(row),staff));
});
