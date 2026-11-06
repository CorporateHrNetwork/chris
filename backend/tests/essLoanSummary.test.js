const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getEmployeeLoanSummary, summarizeLoanProfile } = require('../src/services/essLoanSummaryService');

const fixture = () => ({
  loan: { id: 'loan-1', employeeId: 'employee-1', loanNumber: 'LN-1', status: 'ACTIVE', principalAmount: 300000, installmentAmount: 50000, recoveredAmount: 150000, outstandingAmount: 150000, expectedFinalInstallmentDate: '2027-01-31', notes: 'Private HR note', externalSettlementReference: 'Private reference' },
  amortizationSchedule: [
    { status: 'PAID', amountPaid: 50000, dueDate: '2026-08-31' },
    { status: 'PAUSED', amountPaid: 0, dueDate: '2026-09-30' },
    { status: 'EXCEPTION', amountPaid: 10000, dueDate: '2026-10-31' },
    { status: 'PENDING', amountPaid: 0, dueDate: '2026-11-30' },
    { status: 'REVERSED', amountPaid: 50000, dueDate: '2026-12-31' },
  ],
});

test('summary uses authoritative balances and distinguishes expected and recorded deduction months', () => {
  const summary = summarizeLoanProfile(fixture());
  assert.equal(summary.loanAmount, 300000);
  assert.equal(summary.monthlyInstallment, 50000);
  assert.equal(summary.totalPaid, 150000);
  assert.equal(summary.balance, 150000);
  assert.equal(summary.expectedFinalDeductionMonth, '2027-01');
  assert.equal(summary.lastRecordedDeductionMonth, '2026-10');
  assert.deepEqual(summary.repaymentSchedule.map(row=>row.status), ['PAID','PAUSED','EXCEPTION','PENDING','REVERSED']);
  assert.equal(summary.repaymentSchedule[0].amountPaid,50000);
  assert.equal(summary.repaymentSchedule[1].amountPaid,0);
  assert.equal(summary.repaymentSchedule.some(row=>'paymentSource' in row || 'settlementReference' in row),false);
  assert.equal('notes' in summary, false);
  assert.equal('externalSettlementReference' in summary, false);
  const settled = fixture();
  settled.loan.outstandingAmount = 0; settled.loan.recoveredAmount = 300000;
  settled.amortizationSchedule.push({ status: 'SETTLED_EXTERNALLY', amountPaid: 150000, dueDate: '2027-01-01' });
  assert.equal(summarizeLoanProfile(settled).lastRecordedDeductionMonth, '2026-10');
  assert.equal(summarizeLoanProfile(settled).totalPaid, 300000);
  assert.equal(summarizeLoanProfile({ loan: { ...settled.loan, expectedFinalInstallmentDate: null }, amortizationSchedule: [] }).lastRecordedDeductionMonth, null);
});

test('loan lookup scopes both organization and employee, fails closed on changed ownership', async () => {
  const db = { $queryRawUnsafe: async (sql, org, employee) => {
    assert.match(sql, /"organizationId"=\$1 AND "employeeId"=\$2/);
    return org === 'org-1' && employee === 'employee-1' ? [{ id: 'loan-1' }] : [];
  }};
  let reads = 0;
  const profile = async args => { reads++; assert.equal(args.loanId, 'loan-1'); assert.equal(args.organizationId, 'org-1'); return fixture(); };
  assert.equal((await getEmployeeLoanSummary(db, { organizationId: 'org-1', employeeId: 'employee-1' }, profile)).length, 1);
  assert.deepEqual(await getEmployeeLoanSummary(db, { organizationId: 'org-2', employeeId: 'employee-1' }, profile), []);
  assert.deepEqual(await getEmployeeLoanSummary(db, { organizationId: 'org-1', employeeId: 'employee-2' }, profile), []);
  assert.equal(reads, 1);
  await assert.rejects(getEmployeeLoanSummary(db, {}, profile), /session required/);
  await assert.rejects(getEmployeeLoanSummary(db, { organizationId: 'org-1', employeeId: 'employee-1' }, async () => ({ ...fixture(), loan: { ...fixture().loan, employeeId: 'other' } })), /ownership changed/);
});

test('ESS loan endpoint ignores injected employee and organization selectors', async () => {
  const routes = [];
  const router = { get: (...args) => routes.push(args), post: () => {} };
  const auth = (req, res, next) => req.essAuth ? next() : res.status(401).json({});
  const calls = [];
  const sandbox = { module: { exports: {} }, console, process, Buffer, require: id => {
    if (id === 'express') return { Router: () => router };
    if (id === '../config/prisma') return {};
    if (id === '../middleware/authMiddleware') return { requireEssAuth: auth };
    if (id === '../services/essLoanSummaryService') return { getEmployeeLoanSummary: async (_, scope) => { calls.push(scope); return []; } };
    if (['bcryptjs','jsonwebtoken','../services/essStatutoryService','../services/payrollPayslipEmailService'].includes(id)) return {};
    return require(id);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/routes/essRoutes.js'), 'utf8'), sandbox);
  const route = routes.find(row => row[0] === '/loans');
  assert.equal(route[1], auth);
  const res = { status() { return this; }, json(value) { this.value = value; return this; } };
  await route[2]({ essAuth: { organizationId: 'session-org', employeeId: 'session-employee' }, query: { organizationId: 'victim-org', employeeId: 'victim' }, body: { employeeId: 'victim' } }, res);
  assert.equal(JSON.stringify(calls), JSON.stringify([{ organizationId: 'session-org', employeeId: 'session-employee' }]));
  assert.equal(res.value.status, 'success');
});

test('benefit export uses authoritative columns and external sign-off without loan recovery', async () => {
  const routes = [];
  const router = { get: (...args) => routes.push(args), post: () => {}, patch: () => {}, use: () => {} };
  const snapshot = { employeeNumber: 'E1', employeeName: 'Example Employee', fullMonthlyGross: 120000, currentEntitlement: 30000, previousUnpaid: 1000, previousOverpaid: 500, overpaidDeduction: 500, overpaidRemaining: 0, paymentDetails: { bankName: 'Example Bank', accountName: 'Example Employee', accountNumber: '0000000000' } };
  const detail = { run: { status: 'APPROVED', periodMonth: '2026-11-01' }, responsibilities: ['HEAD_HR'], lines: [{ snapshot, netPay: 30500, actualPaid: null }] };
  detail.register = require('../src/services/zermattTransportBenefitControl').buildRegister(detail.lines);
  let exportsRecorded = 0;
  const sandbox = { module: { exports: {} }, process, console, Buffer, require: id => {
    if (id === 'express') return { Router: () => router };
    if (id === 'xlsx') return { utils: { book_new: () => ({}), aoa_to_sheet: rows => rows, encode_cell: require('xlsx').utils.encode_cell, book_append_sheet: (book, rows, name) => { book[name] = rows; } }, write: book => book };
    if (id === '../services/zermattMidmonthService') return { createService: () => ({ detail: async () => detail, recordExternalExport: async () => { exportsRecorded++; } }) };
    if (id === '../services/zermattMidmonthDomain') return { invalid: (message,statusCode=409) => { throw Object.assign(new Error(message),{statusCode}); } };
    if (id === '../middleware/authMiddleware') return { requireAuth: () => {} };
    return {};
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/routes/zermattMidmonthRoutes.js'), 'utf8'), sandbox);
  const exportRoute = routes.find(row => row[0] === '/runs/:id/export');
  const res = { setHeader() {}, type() { return this; }, send(book) { this.book = book; return this; }, status() { return this; }, json(error) { assert.fail(error.message); } };
  await exportRoute[1]({ auth: { organizationId: 'org', userId: 'hr' }, params: { id: 'run' }, query: { stage: 'payout' } }, res);
  const [headers, row] = res.book['Transport Support Pay'];
  assert.equal(headers.some(header => /loan/i.test(header)), false);
  assert.equal(headers.length, row.length);
  assert.equal(headers.length,18);
  assert.equal(row[headers.indexOf('Net')],30500);
  assert.equal(row[headers.indexOf('Previous Month Short Payment')],1000);
  assert.equal(row[headers.indexOf('Previous Month Overpayment')],500);
  assert.equal(row[headers.indexOf('AccountNO')],'0000000000');
  assert.equal(res.book.Reconciliation[1][5],'');
  assert.ok(res.book['External Approvals'].some(row=>String(row[0]).includes('Auditor')));
  assert.equal(exportsRecorded,1);
  detail.responsibilities=['PAYROLL_AUDITOR'];
  const denied={status(code){this.code=code;return this;},json(error){this.error=error;return this;}};
  await exportRoute[1]({auth:{organizationId:'org',userId:'auditor'},params:{id:'run'},query:{stage:'external'}},denied);
  assert.equal(denied.code,403);
  assert.equal(exportsRecorded,1,'Unauthorized export is not generated or recorded');
});

test('document-portal policy includes the agreed support-pay rules', () => {
  const sandbox = { module: { exports: {} }, require: id => id.includes('performanceEvaluationRules') ? require('../src/services/performanceEvaluationRules') : id.includes('EmploymentLevels') ? { ZERMATT_DESIGNATION_LEVELS: [], ZERMATT_EMPLOYMENT_LEVELS: [] } : { getZermattSopLibrary: () => ({ sops: [], categories: [], status: 'DRAFT' }) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/zermattEmploymentResourceService.js'), 'utf8'), sandbox);
  const policy = sandbox.module.exports.getZermattEmploymentResourceLibrary().employmentPolicy;
  assert.ok(policy.sections.some(([heading]) => heading.includes('Mid-month Transport Support Pay')));
  const content = policy.sections.map(row => row.join(' ')).join(' ');
  for (const expected of ['100,000', '25%', '75%', '16%', '84%', '15th', '26-day', '57%', '11%', '10%', '9%', '8%', '5%', 'Previous Unpaid', 'Previous Overpaid', 'Loan recovery must never', 'before any new-hire proration', 'annual-leave calculation remains unchanged']) assert.ok(content.includes(expected), expected);
});

