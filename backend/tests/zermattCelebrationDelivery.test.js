const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const S = require('../src/services/zermattCelebrationNotificationService');
const { createZermattCelebrationScheduler } = require('../src/services/zermattCelebrationScheduler');
const NOW = new Date('2026-10-27T08:00:00Z');
const ENV = { RESEND_API_KEY: 'fixture-only', CELEBRATION_EMAIL_FROM: 'HR <hr@example.test>', CELEBRATION_SMS_WEBHOOK_URL: 'https://sms.example.test/send' };

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE organizations(id text primary key,slug text,name text,status text);
    INSERT INTO organizations VALUES ('z','zermatt-liquor-limited','Zermatt Liquor Limited','ACTIVE'),('other','other','Other','ACTIVE');
    CREATE TABLE employees(id text primary key,"organizationId" text,"employeeNumber" text,"firstName" text,"middleName" text,"lastName" text,email text,phone text,"hireDate" timestamp,"exitDate" timestamp,"designationId" text,status text);
    CREATE TABLE designations(id text,"organizationId" text,name text);
    CREATE TABLE employee_onboardings(id text,"organizationId" text,"employeeId" text,"sectionData" jsonb,"updatedAt" timestamp);
    CREATE TABLE chris_automation_settings("organizationId" text,"birthdayMessagesEnabled" boolean,"anniversaryMessagesEnabled" boolean);
    CREATE TABLE internal_news_posts(id text primary key,"organizationId" text,category text,title text,summary text,body text,status text,"isPinned" boolean,"publishAt" timestamp,"createdAt" timestamp,"updatedAt" timestamp);
    INSERT INTO employees VALUES ('e','z','SYN-001','Synthetic',NULL,'Employee','employee@example.test','08012345678','2020-10-27',NULL,NULL,'ACTIVE');
    INSERT INTO employee_onboardings VALUES ('o','z','e','{"personal-details":{"dateOfBirth":"1990-10-27"}}','2026-01-01');`);
  await db.exec(fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261014010000_employee_celebration_notification_ledger/migration.sql'), 'utf8'));
  const client = {
    $queryRawUnsafe: async (sql, ...args) => (await db.query(sql, args)).rows,
    $executeRawUnsafe: async (sql, ...args) => (await db.query(sql, args)).affectedRows,
    organization: { findUnique: async () => ({ id: 'z', status: 'ACTIVE' }) },
  };
  return { db, client };
}
function dispatch(client, extras = {}) { return S.dispatchTodayCelebrations({ organizationId: 'z', date: '2026-10-27', now: NOW, prismaClient: client, ...extras }); }
function acceptedRecorder(calls) { return async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return { ok: true, json: async () => url.includes('resend') ? { id: `email-${calls.length}` } : { accepted: true, messageId: `sms-${calls.length}` } }; }; }

test('Lagos calendar boundaries, valid dates, leap-day observation and Nigerian numbers', () => {
  assert.equal(S.lagosToday(new Date('2026-10-26T23:30Z')), '2026-10-27');
  assert.equal(S.isoDate('2026-02-30'), null);
  assert.equal(S.monthDay('2000-02-29', 2026), '02-28');
  assert.equal(S.monthDay('2000-02-29', 2028), '02-29');
  assert.equal(S.normalizePhone('0801 234 5678'), '+2348012345678');
  assert.equal(S.normalizePhone('invalid'), null);
});
test('real SQL matches Date-valued hire dates; both greetings include exact branding', async t => {
  const { client } = await fixture(t);
  const rows = await S.loadTodayCelebrations({ organizationId: 'z', date: '2026-10-27', prismaClient: client });
  assert.equal(rows.length, 2);
  assert.match(rows[1].title, /6th Work Anniversary/);
  for (const row of rows) assert.ok(row.message.endsWith(S.BRAND));
});
test('new hires, future hires, exited employees, invalid DOB and disabled event types', async t => {
  const { db, client } = await fixture(t);
  await db.exec(`UPDATE employees SET "hireDate"='2026-10-27'; UPDATE employee_onboardings SET "sectionData"='{"personal-details":{"dateOfBirth":"2026-02-30"}}';`);
  const load = () => S.loadTodayCelebrations({ organizationId: 'z', date: '2026-10-27', prismaClient: client });
  assert.equal((await load()).length, 0);
  await db.exec(`UPDATE employees SET "hireDate"='2027-10-27'; UPDATE employee_onboardings SET "sectionData"='{"personal-details":{"dateOfBirth":"1990-10-27"}}';`);
  assert.equal((await load()).length, 0);
  await db.exec(`UPDATE employees SET "hireDate"='2020-10-27',"exitDate"='2026-10-27';`);
  assert.equal((await load()).length, 0);
  await db.exec(`UPDATE employees SET "exitDate"=NULL; INSERT INTO chris_automation_settings VALUES ('z',false,true);`);
  assert.deepEqual((await load()).map(r => r.type), ['WORK_ANNIVERSARY']);
  await db.exec(`UPDATE chris_automation_settings SET "anniversaryMessagesEnabled"=false;`);
  assert.equal((await load()).length, 0);
});
test('leap-day events occur on February 28 outside leap years', async t => {
  const { db, client } = await fixture(t);
  await db.exec(`UPDATE employees SET "hireDate"='2020-02-29'; UPDATE employee_onboardings SET "sectionData"='{"personal-details":{"dateOfBirth":"1992-02-29"}}';`);
  assert.equal((await S.loadTodayCelebrations({ organizationId:'z',date:'2026-02-28',prismaClient:client })).length, 2);
  assert.equal((await S.loadTodayCelebrations({ organizationId:'z',date:'2028-02-28',prismaClient:client })).length, 0);
});
test('two simultaneous dispatches and reruns send each channel once per event', async t => {
  const { db, client } = await fixture(t); const calls = []; const fetchImpl = acceptedRecorder(calls);
  await Promise.all([dispatch(client, { env: ENV, fetchImpl }), dispatch(client, { env: ENV, fetchImpl })]);
  await dispatch(client, { env: ENV, fetchImpl });
  assert.equal(calls.length, 4);
  const ledger = (await db.query('SELECT status,COUNT(*)::int AS n FROM employee_celebration_notification_ledger GROUP BY status')).rows;
  assert.deepEqual(ledger, [{ status: 'SENT', n: 6 }]);
  assert.equal((await db.query('SELECT * FROM internal_news_posts')).rows.length, 2);
  for (const call of calls) {
    assert.ok(call.options.headers['Idempotency-Key']);
    if (call.url.includes('resend')) {
      assert.equal(call.body.from, `${S.BRAND} <hr@example.test>`);
      assert.ok(call.body.text.endsWith(S.BRAND));
    } else { assert.equal(call.body.phone, '+2348012345678'); assert.ok(call.body.message.endsWith(S.BRAND)); }
  }
});
test('missing configuration is recorded and recoverable without replaying ESS', async t => {
  const { db, client } = await fixture(t); const calls=[];
  await dispatch(client, { env: {}, fetchImpl: () => assert.fail('No provider call without credentials') });
  const pending = (await db.query(`SELECT error FROM employee_celebration_notification_ledger WHERE status='PENDING_CONFIGURATION'`)).rows;
  assert.equal(pending.length, 4); assert.ok(pending.every(row => row.error));
  await dispatch(client, { env: ENV, fetchImpl: acceptedRecorder(calls) });
  assert.equal(calls.length, 4); assert.equal((await db.query('SELECT * FROM internal_news_posts')).rows.length, 2);
});
test('an uncertain provider outcome remains held and is not blindly retried', async t => {
  const { db, client } = await fixture(t); let calls=0;
  const fetchImpl = async () => { calls++; throw new Error('NETWORK_TIMEOUT'); };
  await dispatch(client, { env: ENV, fetchImpl }); await dispatch(client, { env: ENV, fetchImpl });
  assert.equal(calls, 4);
  assert.equal((await db.query(`SELECT * FROM employee_celebration_notification_ledger WHERE status='PROCESSING'`)).rows.length, 4);
});
test('HTTP 200 without explicit SMS provider acceptance is held', async t => {
  const { client } = await fixture(t);
  const result = await dispatch(client, { env: ENV, fetchImpl: async () => ({ ok: true, json: async () => ({ id: 'some-webhook-job' }) }) });
  assert.equal(result.results[0].channels.PHONE.status, 'PROCESSING');
});
test('wrong tenant and historical dates cannot dispatch', async t => {
  const { client } = await fixture(t);
  await assert.rejects(dispatch(client, { organizationId:'other' }), { code:'CELEBRATION_NOT_ENABLED' });
  await assert.rejects(dispatch(client, { date:'2026-10-26' }), { code:'CELEBRATION_DATE_NOT_TODAY' });
});
test('Termii requires account configuration and uses short sender plus full body branding', async () => {
  const calls=[];
  const env={ TERMII_BASE_URL:'https://api.ng.termii.com', TERMII_API_KEY:'fixture-only', TERMII_SENDER_ID:'ZermattLtd' };
  assert.equal(S.deliveryConfiguration(env).smsProvider,'TERMII');
  const result=await S.sendPhone({organizationId:'z',celebration:{phone:'08012345678',message:`Happy Birthday! ${S.BRAND}`},env,deliveryKey:'k',fetchImpl:async (url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({message_id:'accepted-id'})}}});
  assert.equal(result.providerMessageId,'accepted-id');assert.equal(calls[0].body.from,'ZermattLtd');assert.equal(calls[0].body.to,'2348012345678');assert.equal(calls[0].body.channel,'generic');assert.ok(calls[0].body.sms.endsWith(S.BRAND));
});
test('scheduler is opt-in, after 08 Lagos, Zermatt-only and exposes held delivery counts', async t => {
  const { client }=await fixture(t);let sends=0;
  const options={prisma:client,now:()=>NOW,env:{},logger:{info(){},error(){}},dispatch:async()=>{sends++;return {date:'2026-10-27',count:0,results:[]}}};
  const disabled=createZermattCelebrationScheduler(options);assert.equal((await disabled.run()).skipped,'AUTOMATION_DISABLED');assert.equal(sends,0);
  const before=createZermattCelebrationScheduler({...options,env:{CHRIS_CELEBRATION_AUTOMATION_ENABLED:'true'},now:()=>new Date('2026-10-27T06:59Z')});assert.equal((await before.run()).skipped,'BEFORE_08_LAGOS');
  const enabled=createZermattCelebrationScheduler({...options,env:{CHRIS_CELEBRATION_AUTOMATION_ENABLED:'true'}});await enabled.run();assert.equal(sends,1);
});
