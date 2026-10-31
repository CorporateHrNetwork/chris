const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
process.env.DATABASE_URL||='postgresql://test:test@127.0.0.1:5432/chris_test';
const {TASKS,buildStageEmail,queueStageEmail,deliverNext}=require('../src/services/payrollStageEmailService');
test('each payroll stage addresses its assigned task and uses tenant-specific secure sign-in',()=>{
 for(const stage of Object.keys(TASKS)){const email=buildStageEmail({stage,periodName:'October <2026>',organizationName:'Zermatt Liquor Limited',slug:'zermatt-liquor-limited'});assert.match(email.textBody,/organization=zermatt-liquor-limited/);assert.ok(email.textBody.includes(TASKS[stage].task));assert.match(email.htmlBody,/October &lt;2026&gt;/);assert.doesNotMatch(email.htmlBody,/approvalToken|approve=true/);}
});
test('outbox migration and delivery handle deduplication, failures, tenant scope and stale owners without changing payroll',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE organizations(id text PRIMARY KEY,name text,slug text);CREATE TABLE users(id text PRIMARY KEY,"organizationId" text,email text,"isActive" boolean);CREATE TABLE payroll_approval_events(id text PRIMARY KEY);CREATE TABLE payroll_approval_assignments("organizationId" text,responsibility text,"assignedUserId" text,"isActive" boolean);CREATE TABLE payroll_runs(id text,"organizationId" text,"periodId" text);CREATE TABLE payroll_periods(id text,"organizationId" text,name text);CREATE TABLE payroll_approval_workflows("organizationId" text,"runId" text,stage text);CREATE ROLE anon;CREATE ROLE authenticated;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261031180000_payroll_stage_email_outbox/migration.sql'),'utf8'));
 await db.exec(`INSERT INTO organizations VALUES('org','Zermatt Liquor Limited','zermatt-liquor-limited');INSERT INTO users VALUES('auditor','org','auditor@example.test',true);INSERT INTO payroll_approval_events VALUES('event1'),('event2'),('event3');INSERT INTO payroll_approval_assignments VALUES('org','PAYROLL_AUDITOR','auditor',true);INSERT INTO payroll_runs VALUES('run','org','period');INSERT INTO payroll_periods VALUES('period','org','October 2026');INSERT INTO payroll_approval_workflows VALUES('org','run','PENDING_AUDIT');`);
 const adapter=client=>({$queryRawUnsafe:async(sql,...args)=>(await client.query(sql,args)).rows,$executeRawUnsafe:async(sql,...args)=>(await client.query(sql,args)).affectedRows,organizationAudit:{create:async()=>{}}});
 const tx=adapter(db);const prisma={$transaction:fn=>db.transaction(client=>fn(adapter(client)))};
 await queueStageEmail(tx,{organizationId:'org',runId:'run',eventId:'event1',stage:'PENDING_AUDIT'});await queueStageEmail(tx,{organizationId:'org',runId:'run',eventId:'event1',stage:'PENDING_AUDIT'});
 assert.equal((await db.query('SELECT * FROM payroll_stage_email_outbox')).rows.length,1);
 let sent=0;assert.equal((await deliverNext({prisma,configured:()=>true,send:async message=>{assert.equal(message.to,'auditor@example.test');sent++;}})).status,'SENT');
 assert.equal((await deliverNext({prisma,configured:()=>true,send:async()=>sent++})).status,'EMPTY');assert.equal(sent,1);
 await queueStageEmail(tx,{organizationId:'org',runId:'run',eventId:'event2',stage:'PENDING_AUDIT'});assert.equal((await deliverNext({prisma,configured:()=>true,send:async()=>{throw Error('secret provider error');}})).status,'FAILED');
 const failed=(await db.query("SELECT * FROM payroll_stage_email_outbox WHERE status='FAILED'")).rows[0];assert.equal(failed.attempts,1);assert.equal(failed.lastError,'SMTP_DELIVERY_FAILED');
 await queueStageEmail(tx,{organizationId:'org',runId:'run',eventId:'event3',stage:'PENDING_AUDIT'});await db.exec(`UPDATE users SET "isActive"=false`);assert.equal((await deliverNext({prisma,configured:()=>true,send:async()=>sent++})).status,'CANCELLED');assert.equal(sent,1);
 await assert.rejects(()=>queueStageEmail(tx,{organizationId:'other',runId:'run',eventId:'event3',stage:'PENDING_GM'}),/Exactly one active approval owner/);
 assert.equal((await db.query('SELECT stage FROM payroll_approval_workflows')).rows[0].stage,'PENDING_AUDIT');
 }finally{await db.close();}
});
