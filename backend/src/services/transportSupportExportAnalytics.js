const XLSX = require('xlsx');
const { branchName, compareBranches } = require('./payrollRegisterExport');

const headings = [
  'Employee Count', 'Mid-Month Entitlement', 'Extra Days', 'Public Holiday Days',
  'Bonus', 'Approved Overtime / PH Pay', 'Prior Short Payment', 'Opening Overpayment',
  'Overpayment Deducted', 'Overpayment Remaining', 'Net Pay', 'Confirmed Payment Count', 'Actual Paid',
];

function measures(line) {
  const snapshot = line.snapshot || {};
  const input = snapshot.benefitInputs || {};
  return [
    1, snapshot.currentEntitlement, input.extraDays, input.phDays, input.bonus,
    input.overtimePhPay, snapshot.previousUnpaid, snapshot.previousOverpaid,
    snapshot.overpaidDeduction, snapshot.overpaidRemaining, line.netPay,
    Number(line.actualPaid != null), line.actualPaid,
  ].map(value => Number(value || 0));
}

function summarize(lines, group) {
  const groups = new Map();
  for (const line of lines) {
    const label = group(line.snapshot || {});
    const total = groups.get(label) || headings.map(() => 0);
    measures(line).forEach((amount, index) => { total[index] += amount; });
    groups.set(label, total);
  }
  return [...groups].map(([label, values]) => [label, ...values.map(value => Number(value.toFixed(4)))]);
}

function appendSheet(workbook, name, rows, widths) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function chartRows(title, pairs) {
  const maximum = Math.max(0, ...pairs.map(([, value]) => value));
  return [
    [title, 'Amount (NGN)', 'Relative to largest amount'],
    ...pairs.map(([label, value]) => [
      label, value, maximum && value > 0 ? '█'.repeat(Math.max(1, Math.round(value / maximum * 32))) : '',
    ]),
  ];
}

function appendTransportSupportAnalytics(workbook, { run, lines }) {
  const branch = summarize(lines, snapshot => branchName(snapshot.location)).sort(([a], [b]) => compareBranches(a, b));
  const department = summarize(lines, snapshot => snapshot.department || 'Unassigned').sort(([a], [b]) => a.localeCompare(b));
  const employment = summarize(lines, snapshot => snapshot.employmentType || 'Unspecified').sort(([a], [b]) => a.localeCompare(b));
  const totals = summarize(lines, () => 'Total')[0]?.slice(1) || headings.map(() => 0);
  const money = key => totals[headings.indexOf(key)];
  appendSheet(workbook, 'Executive Summary', [
    ['Transport Support Pay', new Date(run.periodMonth).toISOString().slice(0, 7)],
    ['Run status', run.status],
    ['Currency', 'NGN'],
    ['Scope', 'Aggregate measures cover the entire run. Export column selection applies to employee registers.'],
    ['Actual paid', 'Includes confirmed payments only. A confirmed zero counts as a confirmed record.'],
    [],
    ['Measure', 'Total'],
    ...headings.map((label, index) => [label, totals[index]]),
  ], [31, 100]);
  for (const [name, label, rows] of [
    ['Branch Analysis', 'Branch', branch],
    ['Department Analysis', 'Department', department],
    ['Employment Type Analysis', 'Employment Type', employment],
  ]) {
    appendSheet(workbook, name, [[label, ...headings], ...rows, ['Total', ...totals]], [29, ...headings.map(h => Math.max(16, h.length + 2))]);
  }
  const netColumn = headings.indexOf('Net Pay') + 1;
  appendSheet(workbook, 'Presentation Charts', [
    ...chartRows('Net Pay by Branch', branch.map(row => [row[0], row[netColumn]])),
    [],
    ...chartRows('Pay Components', ['Mid-Month Entitlement', 'Bonus', 'Approved Overtime / PH Pay', 'Prior Short Payment'].map(key => [key, money(key)])),
    [],
    ...chartRows('Overpayment Reconciliation', ['Opening Overpayment', 'Overpayment Deducted', 'Overpayment Remaining'].map(key => [key, money(key)])),
  ], [34, 19, 48]);
}

module.exports = { appendTransportSupportAnalytics };
