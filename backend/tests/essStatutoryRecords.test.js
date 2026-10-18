const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { ESS_STATUTORY_OBLIGATIONS_SQL } = require('../src/services/essStatutoryService');

test('ESS publishes approved monthly statutory totals without exposing recalculation history or other employees', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE payroll_runs (id text, "organizationId" text, status text);
      CREATE TABLE statutory_obligations (
        id text, "organizationId" text, "employeeId" text, "payrollRunId" text,
        "obligationType" text, "periodYear" int, "periodMonth" int,
        currency text, status text, "assessableBase" numeric,
        "employeeAmount" numeric, "employerAmount" numeric,
        "totalLiability" numeric, "amountRemitted" numeric, "dueDate" timestamp
      );
      INSERT INTO payroll_runs VALUES
        ('approved','org','APPROVED'), ('supplement','org','APPROVED'),
        ('draft','org','DRAFT'), ('submitted','org','SUBMITTED'),
        ('reopened','org','DRAFT'), ('other-run','other','APPROVED');
    `);
    const insert = async (id, overrides = {}) => {
      const r = { org:'org', employee:'employee', run:'approved', type:'PAYE',
        year:2026, month:10, currency:'NGN', status:'CONFIRMED', base:1000,
        employeeAmount:100, employerAmount:0, total:100, remitted:0, ...overrides };
      await db.query('INSERT INTO statutory_obligations VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NULL)',
        [id,r.org,r.employee,r.run,r.type,r.year,r.month,r.currency,r.status,r.base,r.employeeAmount,r.employerAmount,r.total,r.remitted]);
    };
    await insert('published');
    await insert('supplement', {run:'supplement'}); // Equal amounts may be valid separate payments.
    await insert('draft-1', {run:'draft',status:'DRAFT_CALCULATED'});
    await insert('draft-2', {run:'draft',status:'DRAFT_CALCULATED'});
    await insert('submitted', {run:'submitted'});
    await insert('reversed-1', {status:'REVERSED'});
    await insert('reversed-2', {status:'REVERSED'});
    await insert('stale-draft', {status:'DRAFT_CALCULATED'});
    await insert('reopened', {run:'reopened'});
    await insert('other-employee', {employee:'someone-else'});
    await insert('other-org', {org:'other',run:'other-run'});
    await insert('cross-org-run', {run:'other-run'});
    await insert('orphan', {run:'missing'});
    await insert('september', {month:9});
    await insert('usd', {currency:'USD'});
    await insert('pension', {type:'PENSION',employeeAmount:80,employerAmount:100,total:180});
    await insert('remitted', {status:'REMITTED',remitted:100});
    const before = (await db.query('SELECT * FROM statutory_obligations ORDER BY id')).rows;
    const rows = (await db.query(ESS_STATUTORY_OBLIGATIONS_SQL,['org','employee'])).rows;
    assert.equal(rows.length, 5);
    const paye = rows.find(r => r.obligationType==='PAYE' && r.periodMonth===10 && r.currency==='NGN' && r.status==='CONFIRMED');
    assert.equal(Number(paye.employeeAmount),200);
    assert.equal(Number(paye.totalLiability),200);
    assert.equal(Number(paye.assessableBase),2000);
    assert.equal(Number(rows.find(r => r.status==='REMITTED').amountRemitted),100);
    assert.equal(Number(rows.find(r => r.obligationType==='PENSION').employerAmount),100);
    assert.equal(rows.at(-1).periodMonth,9);
    assert.deepEqual((await db.query(ESS_STATUTORY_OBLIGATIONS_SQL,['org','missing-employee'])).rows,[]);
    assert.deepEqual((await db.query('SELECT * FROM statutory_obligations ORDER BY id')).rows,before,
      'all calculation and reversal history remains unchanged');
  } finally { await db.close(); }
});
