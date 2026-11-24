"use strict";
/**
 * Tenant-scoped READ ONLY adapter for approved payroll snapshots.
 * Does not create or change statutory remittances/payroll.
 * Statutory obligations are separate records; never infer them from net pay.
 */

const TYPES = new Set(["PAYE","PENSION","NHF","NSITF_ECS","ITF"]);
function finite(value) { if(value===null || value===undefined || value==="") return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function applyObligation(row, item) {
  const employeeAmount = finite(item.employeeAmount), employerAmount = finite(item.employerAmount);
  switch (item.obligationType) {
    case "PAYE": row.paye = employeeAmount; break;
    case "PENSION": row.pensionEmployee = employeeAmount; row.pensionEmployer = employerAmount; break;
    case "NHF": row.nhfEmployee = employeeAmount; break;
    case "NSITF_ECS": row.nsitfEmployer = employerAmount; break;
    case "ITF": row.itfEmployer = employerAmount; break;
  }
}
async function readApprovedPayrollRecords({ organizationId, year, prismaClient = null }) {
  const db = prismaClient || require("../config/prisma");
  if (!organizationId || !Number.isInteger(Number(year)) || Number(year) < 2000) throw new Error("Organization and valid reporting year required");
  const lines = await db.$queryRawUnsafe(
    `SELECT pr."id" AS "runId", pr."status" AS "payrollStatus", pp."periodStart", pp."periodEnd",
            pl."id" AS "runLineId", pl."employeeId", pl."employeeNumber", pl."employeeName",
            pl."grossPay", pl."netPreview", pl."baseSalary", pl."details"
       FROM "payroll_runs" pr
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
       JOIN "payroll_run_lines" pl ON pl."runId"=pr."id" AND pl."organizationId"=pr."organizationId"
      WHERE pr."organizationId"=$1 AND pr."status"='APPROVED'
        AND pp."periodStart" >= $2::date AND pp."periodStart" < $3::date
      ORDER BY pp."periodStart", pl."employeeNumber"`,
    organizationId, `${year}-01-01`, `${Number(year)+1}-01-01`
  );
  if (!lines.length) return [];
  const obligations = await db.$queryRawUnsafe(
    `SELECT so."payrollRunId", so."payrollRunLineId", so."employeeId", so."obligationType",
            so."employeeAmount", so."employerAmount"
       FROM "statutory_obligations" so
       JOIN "payroll_runs" pr ON pr."id"=so."payrollRunId" AND pr."organizationId"=so."organizationId"
       JOIN "payroll_periods" pp ON pp."id"=pr."periodId" AND pp."organizationId"=pr."organizationId"
      WHERE so."organizationId"=$1 AND pr."status"='APPROVED'
        AND pp."periodStart" >= $2::date AND pp."periodStart" < $3::date`,
    organizationId, `${year}-01-01`, `${Number(year)+1}-01-01`
  );
  const obligationMap = new Map();
  for (const o of obligations) {
    if (!TYPES.has(o.obligationType) || !o.payrollRunLineId) continue;
    const key = o.payrollRunId + ":" + o.payrollRunLineId;
    if (!obligationMap.has(key)) obligationMap.set(key, []);
    obligationMap.get(key).push(o);
  }
  return lines.map(line => {
    const details = line.details || {};
    const snapshot = details.organizationSnapshot || {};
    const allowances = Array.isArray(details.allowanceItems) ? details.allowanceItems : [];
    const row = {
      organizationId: String(organizationId), year: Number(year), sourceType: "APPROVED_PAYROLL",
      sourceId: line.runId + ":" + line.runLineId, payrollStatus: "APPROVED",
      employeeId: line.employeeId || null, employeeNo: line.employeeNumber || "",
      employeeName: line.employeeName || "", branch: snapshot.locationName || snapshot.locationCode || null,
      department: snapshot.departmentName || null,
      period: new Date(line.periodStart).toISOString().slice(0,7),
      grossSalary: finite(line.grossPay), netSalary: finite(line.netPreview),
      basicSalary: finite(line.baseSalary),
      otherEarnings: allowances.reduce((sum,x) => sum + (finite(x.value) || 0),0),
      paye: null, pensionEmployee: null, pensionEmployer: null, nhfEmployee: null, nsitfEmployer: null, itfEmployer: null,
    };
    const ob = obligationMap.get(line.runId + ":" + line.runLineId) || [];
    for (const o of ob) applyObligation(row,o);
    // Explicitly preserve missing statutory data as NULL, not zero.
    return row;
  });
}
module.exports = { readApprovedPayrollRecords, applyObligation };
