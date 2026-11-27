// Complete only one-time input IDs actually captured in this payroll run.
async function transitionOneTimeInputs(tx, { organizationId, runId, actorUserId, reopen = false }) {
  const from = reopen ? "COMPLETED" : "ACTIVE";
  const to = reopen ? "ACTIVE" : "COMPLETED";
  const rows = await tx.$queryRawUnsafe(`
    UPDATE payroll_variable_inputs v SET status=$4,"updatedAt"=CURRENT_TIMESTAMP
    FROM payroll_runs r
    WHERE r."organizationId"=$1 AND r.id=$2 AND r."archivedAt" IS NULL
      AND v."organizationId"=r."organizationId" AND v."payrollPeriodId"=r."periodId" AND v.status=$3
      AND EXISTS (SELECT 1 FROM payroll_run_lines l
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l.details->'customAllowances','[]'::jsonb) || COALESCE(l.details->'customDeductions','[]'::jsonb)) j
        WHERE l."organizationId"=v."organizationId" AND l."runId"=r.id AND l."employeeId"=v."employeeId" AND j->>'inputId'=v.id)
      AND ($5::boolean=FALSE OR EXISTS (SELECT 1 FROM organization_audits a WHERE a."organizationId"=v."organizationId" AND a."entityId"=v.id AND a."entityType"='PayrollVariableInput' AND a.action IN ('PAYROLL_INPUT_COMPLETED','HISTORICAL_PAYROLL_INPUT_COMPLETED') AND a."newValue"->>'runId'=r.id))
    RETURNING v.id`, organizationId,runId,from,to,reopen);
  for(const row of rows) await tx.organizationAudit.create({data:{organizationId,actorUserId:actorUserId||null,entityType:"PayrollVariableInput",entityId:row.id,action:reopen?"PAYROLL_INPUT_REOPENED":"PAYROLL_INPUT_COMPLETED",previousValue:{status:from},newValue:{status:to,runId},reason:reopen?"Approved payroll reopened":"One-time input captured in final approved payroll"}});
  return rows.length;
}
module.exports={transitionOneTimeInputs};
