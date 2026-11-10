const { splitSalary } = require('./zermattSalarySplit');
const NORTHSTAR_ID = 'chris-demo-org-20261022';
function isNorthstar(organizationId, slug) {
  return organizationId === NORTHSTAR_ID && slug === 'chris-demo-company';
}
function standardDaysFor({ policy, employmentType, northstar }) {
  if (!northstar) return Number(policy.standardDays[employmentType]);
  const normalize = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return Number(Object.entries(policy.standardDays || {}).find(([key]) => normalize(key) === normalize(employmentType))?.[1]);
}
function salaryBasis({ organizationId, slug, policy, employee, rate, monthlyOverride, periodMonth }) {
  const northstar = isNorthstar(organizationId, slug);
  const splitAllocation = !northstar && rate.fullMonthlyGross ? splitSalary({
    fullMonthlyGross: monthlyOverride ?? rate.fullMonthlyGross,
    employmentType: employee.employmentType, hireDate:'2000-01-01', periodMonth,
  }) : null;
  return {
    splitAllocation,
    monthlyGross: splitAllocation ? splitAllocation.endMonthGross : Number(monthlyOverride ?? (northstar ? rate.fullMonthlyGross ?? rate.amount : rate.amount) ?? 0),
    standardDays: splitAllocation ? 26 : standardDaysFor({policy,employmentType:employee.employmentType,northstar}),
  };
}
module.exports = { isNorthstar, standardDaysFor, salaryBasis };
