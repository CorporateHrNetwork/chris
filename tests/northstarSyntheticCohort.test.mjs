import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {northstarCohort,northstarCohortOverview} from "../src/demo/northstarSyntheticCohort.js";

test("fictional Northstar dataset links 48 unique people consistently across modules",()=>{
 const e=northstarCohort.employees;
 assert.equal(e.length,48);
 assert.equal(new Set(e.map(x=>x.id)).size,48);
 assert.equal(new Set(e.map(x=>x.employeeNumber)).size,48);
 assert.equal(northstarCohort.departments.length,8);
 assert.equal(northstarCohort.locations.length,4);
 const ids=new Set(e.map(x=>x.id));
 const teams=new Set(northstarCohort.departments.map(x=>x.name));
 const sites=new Set(northstarCohort.locations.map(x=>x.name));
 for(const row of e){
  assert.ok(teams.has(row.department));
  assert.ok(sites.has(row.location));
  assert.ok(!row.managerId||ids.has(row.managerId));
  assert.equal(row.grossPay-row.deduction,row.netPay);
  assert.equal(row.demoOnly,true);
 }
 for(const [key,rows] of Object.entries(northstarCohort)){
  assert.equal(new Set(rows.map(x=>x.id)).size,rows.length,key);
  if(key!=="employees"&&key!=="departments"&&key!=="locations"){
   assert.ok(rows.every(x=>x.demoOnly===true),key);
   assert.ok(rows.every(x=>!x.employeeId||ids.has(x.employeeId)),key);
  }
 }
});
test("leave balances, loans, payroll, attendance and ratings reconcile",()=>{
 const d=northstarCohort;
 assert.equal(d.attendance.length,240);
 assert.equal(d.leave.length,48);
 assert.ok(d.leave.every(x=>x.availableDays===x.entitlementDays-x.usedDays&&x.availableDays>=0));
 assert.equal(d.payroll.length,96);
 assert.ok(d.payroll.every(x=>x.gross-x.deductions===x.net));
 assert.equal(d.loans.length,6);
 assert.ok(d.loans.every(x=>x.totalPaid+x.balance===x.principal));
 assert.ok(d.loans.every(x=>x.periods.reduce((sum,p)=>sum+p.paid,0)===x.totalPaid));
 assert.ok(d.loans.every(x=>x.periods.length*x.installment===x.principal));
 assert.equal(d.performance.length,48);
 assert.ok(d.performance.every(x=>x.rating>=1&&x.rating<=5));
 assert.equal(d.recruitment.length,12);
 assert.equal(northstarCohortOverview().employeeCount,48);
});
test("no real-world customer identifiers, accounts, network, or writes exist in synthetic module",()=>{
 const src=fs.readFileSync(new URL("../src/demo/northstarSyntheticCohort.js",import.meta.url),"utf8");
 assert.doesNotMatch(src,/zermatt|beer barn|zll\d|chris-zermatt|chris\.crnetwork\.com\.ng|supabase|fetch\s*\(|axios\.|prisma\.|accountNumber|bankAccount/i);
 const ui=fs.readFileSync(new URL("../src/demo/DemoPolicyWorkspace.jsx",import.meta.url),"utf8");
 assert.match(ui,/northstarCohortOverview/);
 assert.match(ui,/Consistent fictional workforce dataset/);
 assert.match(ui,/not asserted to match/);
});
