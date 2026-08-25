const number = (value) => Number(value || 0);
const detectLeaveMismatch = (employee, activeEmployeeIds) => employee.status === "LEAVE" && !activeEmployeeIds.has(employee.id);
function projectProtectedBalance(balance, committed = 0) {
  const entitlement = balance.entitlementAllocations?.[0] ? number(balance.entitlementAllocations[0].allocatedEntitlement) : number(balance.openingBalance);
  return { entitlement, used: number(balance.used), committed, available: number(balance.openingBalance) + number(balance.accrued) + number(balance.carriedForward) + number(balance.adjusted) - number(balance.used) - committed };
}
module.exports = { detectLeaveMismatch, projectProtectedBalance };
