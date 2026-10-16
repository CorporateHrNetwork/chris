const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const settings = require('../src/services/zermattLeaveAllowanceSettingsService');
const structure = { basic: 50, housing: 30, transport: 20 };
function load(name, dependencies, extra = '') {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services', name), 'utf8') + extra, {
    module, exports: module.exports, require: (id) => {
      if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`);
      return dependencies[id];
    }, Date, Set, Map, console,
  });
  return module.exports;
}
const service = load('zermattLeaveAllowanceService.js', {
  '../config/prisma': {}, './zermattLeaveAllowanceSettingsService': settings,
});
function fixture() {
  const row = { id: 'line', employeeId: 'employee', employeeNumber: '001', employeeName: 'Test Employee',
    hireDate: '2020-10-15', employmentType: 'Full-Time', grossPay: 200000, netPreview: 180000,
    details: { salaryStructure: { basic: 100000 }, benefitEarnings: [{ code: 'OTHER', amount: 500 }] } };
  const state = { row, paid: [], enabled: true, status: 'DRAFT', periodStart: '2026-10-01', periodEnd: '2026-10-31', writes: 0 };
  const client = {
    organization: { findUnique: async () => ({ slug: 'zermatt-liquor-limited' }) },
    organizationAudit: { findFirst: async () => ({ newValue: { enabled: state.enabled } }), create: async () => ({}) },
    $transaction: async (fn) => fn(client),
    $queryRawUnsafe: async (sql) => {
      if (sql.includes('FROM "payroll_periods"')) return [{ id: 'period', code: 'MONTH', periodStart: state.periodStart, periodEnd: state.periodEnd }];
      if (sql.includes('FROM "payroll_policy_versions"')) return [{ salaryStructure: structure }];
      if (sql.includes('FOR UPDATE')) return [{ status: state.status, periodId: 'period' }];
      if (sql.includes('SELECT pl.*')) return [row];
      if (sql.includes('entitlementYear')) return state.paid;
      if (sql.includes('COUNT(*)')) return [{ employeeCount: 1, grossTotal: row.grossPay, netPreviewTotal: row.netPreview }];
      throw new Error(sql);
    },
    $executeRawUnsafe: async (sql, ...args) => {
      state.writes++;
      if (sql.includes('UPDATE "payroll_run_lines"')) { row.netPreview = args[3]; row.details = JSON.parse(args[4]); }
    },
  };
  return { state, apply: () => service.applyZermattLeaveAllowanceToDraft({ organizationId: 'zermatt', runId: 'run', periodId: 'period', prismaClient: client }) };
}
test('all twelve payroll months calculate Basic × 12 × 10% only for qualifying anniversaries', async () => {
  for (let month = 1; month <= 12; month++) {
    const { state, apply } = fixture();
    const mm = String(month).padStart(2, '0');
    state.row.hireDate = `2020-${mm}-15`;
    state.periodStart = `2026-${mm}-01`;
    state.periodEnd = new Date(Date.UTC(2026, month, 0)).toISOString().slice(0, 10);
    const result = await apply();
    assert.equal(result.totalLeaveAllowance, 120000);
    assert.equal(state.row.details.leaveAllowance.amount, 120000);
    assert.equal(state.row.netPreview, 300000);
    await apply();
    assert.equal(state.row.netPreview, 300000);
    assert.equal(state.row.details.benefitEarnings.length, 2);
  }
});
test('recalculation replaces changed Basic and removes stale allowances for ineligible or already-paid employees', async () => {
  for (const change of [
    (s) => { s.row.employmentType = 'Part-Time'; },
    (s) => { s.row.hireDate = '2020-09-15'; },
    (s) => { s.row.hireDate = '2026-10-15'; },
    (s) => { s.enabled = false; },
    (s) => { s.paid = [{ employeeId: 'employee', entitlementYear: '2026' }]; },
  ]) {
    const { state, apply } = fixture();
    await apply();
    state.row.details.salaryStructure.basic = 150000;
    await apply();
    assert.equal(state.row.details.leaveAllowance.amount, 180000);
    assert.equal(state.row.netPreview, 360000);
    change(state);
    await apply();
    assert.equal(state.row.details.leaveAllowance, undefined);
    assert.equal(state.row.netPreview, 180000);
    assert.equal(state.row.details.benefitEarnings.length, 1);
  }
});
test('approved and submitted payroll cannot be modified by allowance application', async () => {
  for (const status of ['APPROVED', 'SUBMITTED']) {
    const { state, apply } = fixture();
    state.status = status;
    await assert.rejects(apply, { code: 'LEAVE_ALLOWANCE_DRAFT_REQUIRED' });
    assert.equal(state.writes, 0);
  }
});
test('Zermatt tenant boundary rejects other organizations', async () => {
  await assert.rejects(() => service.applyZermattLeaveAllowanceToDraft({ organizationId: 'other', prismaClient: {
    organization: { findUnique: async () => ({ slug: 'other' }) },
  } }), { code: 'ZERMATT_LEAVE_ALLOWANCE_TENANT_ONLY' });
});
test('exit settlements prorate current Basic for completed service months and exclude Zermatt part-time', async () => {
  const exitService = load('exitSettlementService.js', {
    '../config/prisma': {}, './eosbService': { getEosbStatement: async () => ({}) },
    './zermattLeaveAllowanceService': service,
    './nigeriaPayrollComplianceService': { getActivePolicy: async () => ({ salaryStructure: structure }) },
  }, '\nmodule.exports.deriveForTest = deriveSystemItems;');
  const client = {
    organization: { findUnique: async () => ({ slug: 'zermatt-liquor-limited' }) },
    $queryRawUnsafe: async (sql) => {
      if (sql.includes('FROM "payroll_salary_rates"')) return [{ id: 'rate', amount: 200000 }];
      if (sql.includes('FROM "payroll_periods"')) return [{ id: 'period' }];
      if (sql.includes('SUM(')) return [{ amount: 0 }];
      return [];
    },
  };
  for (const [employmentType, expected] of [['Full-Time', 60000], ['Part-Time', 0]]) {
    const result = await exitService.deriveForTest({ client, organizationId: 'zermatt', input: {}, exit: {
      employeeId: 'employee', lastWorkingDay: '2026-10-15', employee: { employeeNumber: '001', hireDate: '2025-04-15', employmentType },
    } });
    assert.equal(result.credits.annualLeaveAllowance.amount, expected);
    if (expected) assert.equal(result.credits.annualLeaveAllowance.accruedMonths, 6);
  }
});
test('settings retire December salary authority and expose the fixed ten percent rate', () => {
  const result = settings.normalizeSettings({ salaryBasis: 'LAST_DECEMBER_GROSS' });
  assert.equal(result.salaryBasis, 'CURRENT_MONTH_GROSS_AND_BASIC');
  assert.equal(result.ratePercent, 10);
});
