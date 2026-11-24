"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {PGlite}=require("@electric-sql/pglite");
const {readApprovedPayrollRecords}=require("../src/services/consolidatedStatutoryApprovedPayrollService");
test("approved payroll SQL reads only current tenant approved lines and statutory obligations",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`
 CREATE TABLE "payroll_periods" ("id" text PRIMARY KEY,"organizationId" text,"periodStart" date,"periodEnd" date);
 CREATE TABLE "payroll_runs" ("id" text PRIMARY KEY,"organizationId" text,"periodId" text,"status" text);
 CREATE TABLE "payroll_run_lines" ("id" text PRIMARY KEY,"organizationId" text,"runId" text,"employeeId" text,"employeeNumber" text,"employeeName" text,"grossPay" numeric,"netPreview" numeric,"baseSalary" numeric,"details" jsonb);
 CREATE TABLE "statutory_obligations" ("id" text PRIMARY KEY,"organizationId" text,"payrollRunId" text,"payrollRunLineId" text,"employeeId" text,"obligationType" text,"employeeAmount" numeric,"employerAmount" numeric);
 INSERT INTO "payroll_periods" VALUES ('p1','zll','2026-10-01','2026-10-31'),('p2','zll','2026-11-01','2026-11-30'),('p3','other','2026-10-01','2026-10-31');
 INSERT INTO "payroll_runs" VALUES ('r1','zll','p1','APPROVED'),('r2','zll','p2','DRAFT'),('r3','other','p3','APPROVED');
 INSERT INTO "payroll_run_lines" VALUES
 ('l1','zll','r1','e1','ZLL01','Employee One',200000,159000,180000,'{"organizationSnapshot":{"locationName":"Abuja"}}'),
 ('l2','zll','r2','e2','ZLL02','Employee Two',999999,999999,999999,'{}'),
 ('l3','other','r3','e3','OTHER','Foreign',999999,999999,999999,'{}');
 INSERT INTO "statutory_obligations" VALUES
 ('o1','zll','r1','l1','e1','PAYE',11000,0),('o2','zll','r1','l1','e1','PENSION',16000,20000),
 ('o3','zll','r1','l1','e1','NSITF_ECS',0,2000),('o4','zll','r2','l2','e2','PAYE',999999,0),
 ('o5','other','r3','l3','e3','PAYE',999999,0);
 `);
  const client={$queryRawUnsafe:async (query,...args)=>(await db.query(query,args)).rows};
  const rows=await readApprovedPayrollRecords({organizationId:"zll",year:2026,prismaClient:client});
  assert.equal(rows.length,1);
  assert.equal(rows[0].employeeNo,"ZLL01");
  assert.equal(rows[0].paye,11000);
  assert.equal(rows[0].pensionEmployee,16000);
  assert.equal(rows[0].pensionEmployer,20000);
  assert.equal(rows[0].nsitfEmployer,2000);
  assert.equal(rows[0].nhfEmployee,null);
 } finally {await db.close();}
});
