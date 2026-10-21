// Monetary allocations are calculated in kobo. Never use a reduced payment to
// decide the salary band. This module has no loan or payment side effects.
const POLICY_VERSION = 'ZLL-TRANSPORT-SPLIT-1';
function fail(message) { const e = new Error(message); e.statusCode = 400; e.code = 'SALARY_SPLIT_INVALID'; throw e; }
function dateOnly(value) {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '');
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== raw) fail('Enter a valid YYYY-MM-DD date.');
  return raw;
}
function moneyCents(value) {
  const raw = String(value ?? '').trim().replace(/^₦\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) fail('Full Monthly Gross Salary must be a positive amount with at most two decimal places.');
  const cents = Math.round(Number(raw.replaceAll(',', '')) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000000) fail('Salary must be greater than zero and no more than ₦1 billion.');
  return cents;
}
function splitSalary({ fullMonthlyGross, employmentType, hireDate, periodMonth }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(periodMonth || ''))) fail('Payroll month must use YYYY-MM.');
  const hire = dateOnly(hireDate);
  const type = String(employmentType || '').trim();
  if (!type) fail('The employee must have an authoritative Employment Type.');
  const full = moneyCents(fullMonthlyGross);
  const isFullTime = type.toLowerCase().replace(/[\s-]+/g, '') === 'fulltime';
  const rate = isFullTime ? (full >= 10000000 ? 25 : 16) : 0;
  const mid = Math.round(full * rate / 100);
  const end = full - mid;
  const first = `${periodMonth}-01`;
  const last = `${periodMonth}-15`;
  const eligibleDays = !isFullTime || hire > last ? 0 : hire <= first ? 15 : 16 - Number(hire.slice(8, 10));
  const payable = Math.round(mid * eligibleDays / 15);
  const percentages = { basic: 57, housing: 11, transport: 10, meal: 9, medical: 8, utility: 5 };
  const components = {};
  let assigned = 0;
  Object.entries(percentages).forEach(([key, pct], i) => {
    const amount = i === 5 ? end - assigned : Math.round(end * pct / 100);
    assigned += amount;
    components[key] = amount / 100;
  });
  return {
    payrollElement: 'MID_MONTH_TRANSPORT_SUPPORT',
    policyVersion: POLICY_VERSION, fullMonthlyGross: full / 100, midMonthPercentage: rate,
    normalMidMonth: mid / 100, eligibleDays, midMonthPayable: payable / 100,
    endMonthGross: end / 100, endMonthCycleDays: 26, components,
    loanRecovery: 0, statutoryDeductionOnMidMonth: 0,
  };
}
function prepareSalaryRows(source,staff) {
  if (!Array.isArray(source) || !source.length || source.length>2000) fail('Include between 1 and 2,000 employee rows.');
  const byNumber=new Map(staff.map(e=>[e.employeeNumber.toUpperCase(),e]));
  const duplicates=new Set();
  return source.map((record,index)=>{
    const rowNumber=index+2, errors=[];
    const employeeNumber=String(record['Employee No']||'').trim().toUpperCase();
    const employee=byNumber.get(employeeNumber);
    let allocation=null, effectiveFrom=null, amount=null;
    const currency=String(record.Currency||'NGN').trim().toUpperCase();
    const reason=String(record.Reason||'').trim();
    if (!employee) errors.push('Employee No must identify a current employee in Zermatt.');
    if (duplicates.has(employeeNumber)) errors.push('Duplicate employee in this upload.');
    duplicates.add(employeeNumber);
    if (currency!=='NGN') errors.push('Use NGN.');
    if (!reason || reason.length>1000) errors.push('Enter a reason of up to 1,000 characters.');
    try {
      effectiveFrom=dateOnly(String(record['Effective From']||'').trim());
      if (!effectiveFrom.endsWith('-01')) fail('Effective From must be the first day of the intended payroll month.');
      amount=moneyCents(record['Full Monthly Gross Salary'])/100;
      if (employee) allocation=splitSalary({fullMonthlyGross:amount,employmentType:employee.employmentType,hireDate:employee.hireDate,periodMonth:effectiveFrom.slice(0,7)});
    } catch(e) { errors.push(e.message); }
    return {rowNumber,employeeNumber,employeeName:employee ? [employee.firstName,employee.middleName,employee.lastName].filter(Boolean).join(' ') : '',branch:employee?.location?.name||'',employeeId:employee?.id,employmentType:employee?.employmentType,hireDate:employee?.hireDate ? dateOnly(employee.hireDate) : null,amount,currency,effectiveFrom,reason,allocation,errors,valid:errors.length===0};
  });
}
module.exports = { POLICY_VERSION, splitSalary, dateOnly, moneyCents, prepareSalaryRows };

