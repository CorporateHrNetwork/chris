const XLSX = require('xlsx');

const HEADERS = [
  'Employee No', 'Employee Name', 'Branch', 'Kind', 'Component Code', 'Frequency', 'Payroll Period', 'Amount', 'Quantity',
  'Reference Payroll Period', 'Total Amount', 'Schedule By', 'Number of Installments', 'Installment Amount',
  'Start Payroll Period', 'Reference', 'Remarks',
];
function employeeName(employee) { return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }
function normalizeName(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-NG'); }
function employeeTemplateScope(auth) {
  const where = { organizationId: auth.organizationId, status: { in: ['ACTIVE', 'PROBATION', 'LEAVE', 'SUSPENDED'] } };
  const assigned = (auth.availableLocations || []).map(location => location.id).filter(Boolean);
  if (auth.activeLocationId) {
    where.locationId = auth.locationScope === 'ALL_LOCATIONS' || assigned.includes(auth.activeLocationId)
      ? auth.activeLocationId : { in: [] };
  } else if (auth.locationScope !== 'ALL_LOCATIONS') where.locationId = { in: assigned };
  return where;
}
function getValue(row, names) {
  for (const name of names) {
    const key = Object.keys(row).find(key => key.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined && String(row[key] ?? '').trim() !== '') return String(row[key]).trim();
  }
  return '';
}
function hasPayrollEntry(row) {
  const fields = [
    ['Component Code','Code'], ['Amount'], ['Quantity','Days','Hours'], ['Reference Payroll Period','Reference Period'],
    ['Total Amount','Total Deduction'], ['Number of Installments','Installments'], ['Installment Amount','Amount Per Installment'],
    ['Start Payroll Period','Start Period'], ['Reference','External Reference'], ['Remarks','Notes'], ['Schedule By','Schedule Method'],
  ];
  return fields.some(names => getValue(row, names) !== '') || !['', 'ONE_TIME'].includes(getValue(row, ['Frequency']).toUpperCase().replace(/[ -]+/g, '_'));
}
function appendSheet(workbook, name, rows, widths) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map(wch => ({ wch }));
  if (rows.length > 1 && name !== 'Instructions') sheet['!autofilter'] = { ref: XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:rows[0].length-1}}) };
  XLSX.utils.book_append_sheet(workbook, sheet, name);
  return sheet;
}
function variableInputTemplateBuffer({ kind, employees, components = [], periods = [], payrollPeriodCode = '' }) {
  if (!['ALLOWANCE','DEDUCTION'].includes(kind)) throw new Error('Invalid payroll template kind.');
  const workbook = XLSX.utils.book_new();
  const instructions = [
    [`CHRiS ${kind === 'DEDUCTION' ? 'Deductions' : 'Allowances'} Bulk Upload`],
    ['Employee No, Employee Name and Branch are populated from the current employee records within your permitted branch scope.'],
    ['Keep Employee No and Employee Name together. CHRiS matches by Employee No and checks any supplied name before import.'],
    ['Complete only employees with a payroll input. Untouched roster rows are skipped. Copy an employee row if a second component is required.'],
    ['Use Component Catalogue and Payroll Periods for valid codes. Do not change the Payroll Inputs sheet name or column headings.'],
    ['For ONE_TIME entries, enter Component Code, Payroll Period and either Amount or Quantity as required by the component.'],
    ...(kind === 'DEDUCTION' ? [
      ['For RECURRING deductions, enter Total Amount, Schedule By, Start Payroll Period and Number of Installments or Installment Amount.'],
      ['Recurring deductions stop after the final installment. Loans and salary advances retain their existing separate recovery workflows.'],
    ] : [
      ['For entered-amount allowances, fill Amount. For day-based allowances, fill Quantity in days; for hourly overtime, use hours.'],
      ['CHRiS calculates formula-based allowances from the authoritative salary. Allowances use ONE_TIME for the selected payroll period.'],
    ]),
    ['Validate / Preview the completed file, review employee names and amounts, then Confirm Import. Imported inputs require draft payroll recalculation and the existing payroll approval workflow.'],
    ['These templates are for payroll variable inputs; they do not change mid-month transport support or its no-loan-recovery rule.'],
  ];
  // Put the actual upload sheet first so Excel opens on the employee roster.
  const rows = employees.map(employee => [String(employee.employeeNumber), employeeName(employee), employee.location?.name || '', kind, '', 'ONE_TIME', payrollPeriodCode, ...Array(10).fill('')]);
  const sheet = appendSheet(workbook, 'Payroll Inputs', [HEADERS, ...rows], [20,34,26,16,22,18,20,18,16,26,20,26,24,22,25,24,40]);
  for (let row=1;row<=rows.length;row++) {
    const numberCell = sheet[XLSX.utils.encode_cell({r:row,c:0})]; if (numberCell) numberCell.z = '@';
    for (const col of [7,8,10,12,13]) {
      const cell = sheet[XLSX.utils.encode_cell({r:row,c:col})]; if (cell) cell.z = '#,##0.00';
    }
  }
  appendSheet(workbook, 'Instructions', instructions, [135]);
  appendSheet(workbook, 'Component Catalogue', [
    ['Component Code','Component Name','Kind','Calculation Type','Installment Eligible'],
    ...components.filter(component => component.kind === kind && component.status === 'ACTIVE').map(component => [component.code,component.name,component.kind,component.calculationType,component.installmentEligible ? 'YES' : 'NO']),
  ], [23,42,18,32,24]);
  appendSheet(workbook, 'Payroll Periods', [
    ['Payroll Period','Period Name','Status','Period Start','Period End'],
    ...periods.map(period => [period.code,period.name,period.status,String(period.periodStart || '').slice(0,10),String(period.periodEnd || '').slice(0,10)]),
  ], [22,40,20,20,20]);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
module.exports = { HEADERS, employeeName, normalizeName, employeeTemplateScope, hasPayrollEntry, variableInputTemplateBuffer };
