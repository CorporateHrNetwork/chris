const prisma = require("../config/prisma");

function text(value) {
  return String(value ?? "").trim();
}

async function markDraftRunsRecalculationRequired({
  organizationId,
  actorUserId,
  reason,
  prismaClient = prisma,
}) {
  const rows = await prismaClient.$queryRawUnsafe(
    `UPDATE "payroll_runs"
        SET "statutoryStatus"='RECALCULATION_REQUIRED',
            "updatedAt"=CURRENT_TIMESTAMP
      WHERE "organizationId"=$1
        AND "status" IN ('DRAFT','REJECTED')
        AND COALESCE("statutoryStatus",'') <> 'RECALCULATION_REQUIRED'
      RETURNING "id","periodId","status","statutoryStatus"`,
    organizationId
  );

  for (const row of rows) {
    await prismaClient.organizationAudit.create({
      data: {
        organizationId,
        actorUserId: actorUserId || null,
        entityType: "PayrollRun",
        entityId: row.id,
        action: "RECALCULATION_REQUIRED",
        newValue: {
          periodId: row.periodId,
          status: row.status,
          statutoryStatus: "RECALCULATION_REQUIRED",
        },
        reason: text(reason) || "A payroll input changed after draft calculation.",
      },
    });
  }

  return { markedRuns: rows.length, runIds: rows.map((row) => row.id) };
}

module.exports = {
  markDraftRunsRecalculationRequired,
};
