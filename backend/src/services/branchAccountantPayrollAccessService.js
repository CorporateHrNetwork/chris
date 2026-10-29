// Payroll-only access. This never changes a user's operating location or roles.
function denied(message, statusCode = 403) {
  return Object.assign(new Error(message), { code: 'ACCOUNTANT_PAYROLL_SCOPE_DENIED', statusCode });
}
function isBranchAccountant(req) {
  return req.auth?.organization?.slug === 'zermatt-liquor-limited' &&
    (req.auth.roles || []).some(role => String(role).trim().toUpperCase().replace(/_/g, ' ') === 'BRANCH ACCOUNTANT');
}
function options(req) {
  if (!isBranchAccountant(req)) throw denied('This payroll workspace is restricted to Zermatt branch accountants.');
  const branches = (req.auth.availableLocations || []).filter(l => l.type === 'BRANCH');
  const choices = branches.map(l => ({ id: l.id, name: l.name, locationIds: [l.id] }));
  if (branches.some(l => l.code === 'ABJ')) choices.push({ id: 'HEAD_OFFICE', name: 'HEAD OFFICE — CONSOLIDATED PAYROLL', locationIds: null });
  if (!choices.length) throw denied('No active branch is assigned to this accountant.');
  return choices;
}
function resolve(req) {
  const choices = options(req);
  const selected = String(req.query?.scope || req.auth.activeLocationId || choices[0].id);
  const scope = choices.find(c => c.id === selected);
  if (!scope) throw denied('The requested payroll is outside your assigned accountant access.');
  return scope;
}
async function listRuns(db, organizationId, scope) {
  const rows = await db.$queryRawUnsafe(`SELECT pr.id,pr."periodId",pp.code AS "periodCode",pp.name AS "periodName",
    pr.status,pr."statutoryStatus",pr."createdAt",pr."updatedAt",pp."periodStart",pp."periodEnd",pp."payDate",
    COUNT(pl.id)::int AS "employeeCount",COALESCE(SUM(pl."grossPay"),0) AS "grossTotal",
    COALESCE(SUM(pl.deductions+pl."advanceRecovery"+COALESCE(pl."loanRecovery",0)),0) AS "deductionTotal",
    COALESCE(SUM(pl."netPreview"),0) AS "netPreviewTotal",
    COALESCE(SUM((pl.details#>>'{leaveAllowance,amount}')::numeric),0) AS "leaveAllowanceTotal"
    FROM payroll_runs pr JOIN payroll_periods pp ON pp.id=pr."periodId" AND pp."organizationId"=pr."organizationId"
    JOIN payroll_run_lines pl ON pl."runId"=pr.id AND pl."organizationId"=pr."organizationId"
    JOIN employees e ON e.id=pl."employeeId" AND e."organizationId"=pl."organizationId"
    WHERE pr."organizationId"=$1 AND pr."archivedAt" IS NULL AND pp."archivedAt" IS NULL
      AND ($2::text[] IS NULL OR e."locationId"=ANY($2::text[]))
    GROUP BY pr.id,pp.id ORDER BY pp."periodStart" DESC,pr."createdAt" DESC`, organizationId, scope.locationIds);
  return rows.map(r => ({ ...r, ...Object.fromEntries(['employeeCount','grossTotal','deductionTotal','netPreviewTotal','leaveAllowanceTotal'].map(k => [k, Number(r[k] || 0)])) }));
}
module.exports = { isBranchAccountant, options, resolve, listRuns };
