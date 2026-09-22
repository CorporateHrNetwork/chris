const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");

const TARGET = "20260915113000_add_compliance_rules_and_obligation_ledger";
const MIGRATIONS_ROOT = path.resolve(__dirname, "..", "prisma", "migrations");

function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_ROOT)
    .sort()
    .map((directory) => ({
      directory,
      file: path.join(MIGRATIONS_ROOT, directory, "migration.sql"),
    }))
    .filter(({ file }) => fs.existsSync(file));
}

async function apply(db, migrations) {
  for (const migration of migrations) {
    try {
      await db.exec(fs.readFileSync(migration.file, "utf8"));
    } catch (error) {
      error.message = `Migration ${migration.directory} failed: ${error.message}`;
      throw error;
    }
  }
}

async function scalar(db, sql) {
  const result = await db.query(sql);
  return Number(Object.values(result.rows[0])[0]);
}

async function snapshot(db) {
  return {
    organizations: await scalar(db, 'SELECT COUNT(*) FROM "organizations"'),
    users: await scalar(db, 'SELECT COUNT(*) FROM "users"'),
    employees: await scalar(db, 'SELECT COUNT(*) FROM "employees"'),
    payrollRuns: await scalar(db, 'SELECT COUNT(*) FROM "payroll_runs"'),
    payrollLines: await scalar(db, 'SELECT COUNT(*) FROM "payroll_run_lines"'),
    grossTotal: await scalar(db, 'SELECT COALESCE(SUM("grossTotal"),0) FROM "payroll_runs"'),
    netTotal: await scalar(db, 'SELECT COALESCE(SUM("netPreviewTotal"),0) FROM "payroll_runs"'),
    loanOutstanding: await scalar(db, 'SELECT COALESCE(SUM("outstandingAmount"),0) FROM "payroll_loans"'),
    advanceOutstanding: await scalar(db, 'SELECT COALESCE(SUM("outstandingAmount"),0) FROM "payroll_salary_advances"'),
    disciplinaryCases: await scalar(db, 'SELECT COUNT(*) FROM "disciplinary_cases"'),
    exits: await scalar(db, 'SELECT COUNT(*) FROM "employee_exit_processes"'),
  };
}

async function expectConstraint(db, sql, label) {
  let rejected = false;
  try {
    await db.exec(sql);
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, `${label} must be rejected by the database`);
}

async function main() {
  const migrations = migrationFiles();
  const targetIndex = migrations.findIndex(({ directory }) => directory === TARGET);
  assert.ok(targetIndex >= 0, `Target migration ${TARGET} was not found`);

  const db = new PGlite();
  try {
    await apply(db, migrations.slice(0, targetIndex));
    await db.exec(`
      INSERT INTO "organizations" ("id","name","slug","updatedAt") VALUES
        ('org-a','Acceptance Organization A','acceptance-org-a',CURRENT_TIMESTAMP),
        ('org-b','Acceptance Organization B','acceptance-org-b',CURRENT_TIMESTAMP);
      INSERT INTO "users" ("id","organizationId","email","passwordHash","updatedAt") VALUES
        ('user-a','org-a','acceptance-a@example.test','not-a-real-password',CURRENT_TIMESTAMP),
        ('user-b','org-b','acceptance-b@example.test','not-a-real-password',CURRENT_TIMESTAMP);
      INSERT INTO "employees" ("id","organizationId","employeeNumber","firstName","lastName","employmentType","updatedAt") VALUES
        ('employee-a','org-a','ACC0001','Ada','Acceptance','Full-Time',CURRENT_TIMESTAMP),
        ('employee-b','org-b','ACC0002','Bola','Boundary','Full-Time',CURRENT_TIMESTAMP);
      INSERT INTO "payroll_periods" ("id","organizationId","code","name","periodStart","periodEnd") VALUES
        ('period-a','org-a','2026-09','September 2026','2026-09-01','2026-09-30');
      INSERT INTO "payroll_runs"
        ("id","organizationId","periodId","status","employeeCount","grossTotal","deductionTotal","netPreviewTotal")
      VALUES ('run-a','org-a','period-a','APPROVED',1,500000,75000,425000);
      INSERT INTO "payroll_run_lines"
        ("id","organizationId","runId","employeeId","employeeNumber","employeeName","baseSalary","grossPay","netPreview","details")
      VALUES
        ('line-a','org-a','run-a','employee-a','ACC0001','Ada Acceptance',300000,500000,425000,
         '{"statutory":{"payeTax":35000,"employeePension":24000,"employerPension":30000}}'::jsonb);
      INSERT INTO "payroll_loans"
        ("id","organizationId","employeeId","loanNumber","principalAmount","outstandingAmount","installmentAmount")
      VALUES ('loan-a','org-a','employee-a','LOAN-ACC-1',120000,80000,20000);
      INSERT INTO "payroll_salary_advances"
        ("id","organizationId","employeeId","amount","outstandingAmount","installmentAmount","issuedDate","recoveryStartDate")
      VALUES ('advance-a','org-a','employee-a',50000,25000,25000,'2026-08-01','2026-09-01');
      INSERT INTO "disciplinary_cases"
        ("id","organizationId","employeeId","employeeNumber","caseNumber","incidentSummary","allegation","openedAt","updatedAt")
      VALUES ('case-a','org-a','employee-a','ACC0001','CASE-ACC-1','Synthetic acceptance case','Synthetic allegation',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
      INSERT INTO "employee_exit_processes"
        ("id","organizationId","employeeId","exitType","targetStatus","lastWorkingDay","reason","updatedAt")
      VALUES ('exit-a','org-a','employee-a','RESIGNATION','RESIGNED','2026-09-30','Synthetic acceptance exit',CURRENT_TIMESTAMP);
    `);

    const before = await snapshot(db);
    await apply(db, migrations.slice(targetIndex));
    const after = await snapshot(db);
    assert.deepEqual(after, before, "The migration chain must not rewrite existing HR or payroll values");

    for (const table of [
      "compliance_rules",
      "compliance_rule_events",
      "statutory_obligations",
      "statutory_remittance_batches",
      "statutory_remittance_allocations",
      "statutory_reconciliations",
      "statutory_lifecycle_events",
      "exit_settlements",
    ]) {
      assert.equal(await scalar(db, `SELECT COUNT(*) FROM "${table}"`), 0, `${table} must start empty`);
    }

    await db.exec(`
      INSERT INTO "compliance_rules"
        ("id","organizationId","ruleKey","name","category","version","status","effectiveFrom","payload","payloadHash","createdByUserId")
      VALUES ('rule-a','org-a','NIGERIA_PAYROLL','Nigeria payroll acceptance rule','STATUTORY',1,'DRAFT',
        '2026-01-01','{}'::jsonb,'acceptance-hash','user-a');
    `);

    const obligation = `
      INSERT INTO "statutory_obligations"
        ("id","organizationId","employeeId","payrollRunId","payrollRunLineId","obligationType","periodYear","periodMonth",
         "currency","assessableBase","employeeAmount","employerAmount","totalLiability","calculationSnapshot")
      VALUES ('obligation-a','org-a','employee-a','run-a','line-a','PAYE',2026,9,'NGN',500000,35000,0,35000,'{}'::jsonb)
    `;
    await db.exec(obligation);

    await expectConstraint(
      db,
      obligation.replace("'obligation-a','org-a','employee-a'", "'obligation-cross-tenant','org-a','employee-b'"),
      "Cross-tenant employee obligation"
    );
    await expectConstraint(
      db,
      obligation.replace("'obligation-a'", "'obligation-duplicate'"),
      "Duplicate payroll-line obligation"
    );
    await expectConstraint(
      db,
      obligation
        .replace("'obligation-a'", "'obligation-unbalanced'")
        .replace("'PAYE'", "'PENSION'")
        .replace("35000,0,35000", "35000,10000,35000"),
      "Unbalanced statutory liability"
    );
    await expectConstraint(
      db,
      `INSERT INTO "exit_settlements"
        ("id","organizationId","exitProcessId","employeeId","grossPayable","totalRecovery","netSettlement","calculationSnapshot")
       VALUES ('settlement-cross-tenant','org-a','exit-a','employee-b',0,0,0,'{}'::jsonb)`,
      "Cross-tenant exit settlement"
    );

    const output = {
      status: "PASS",
      appliedMigrations: migrations.length,
      targetMigration: TARGET,
      preservedSnapshot: after,
      safeguards: [
        "full migration chain",
        "existing HR/payroll totals preserved",
        "new ledgers start empty",
        "cross-tenant obligation rejected",
        "duplicate obligation rejected",
        "unbalanced liability rejected",
        "cross-tenant exit settlement rejected",
      ],
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
