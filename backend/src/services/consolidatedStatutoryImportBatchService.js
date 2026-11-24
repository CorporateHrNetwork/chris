"use strict";
const crypto = require("node:crypto");

const { previewHistoricalWorkbook } = require("./consolidatedStatutoryHistoricalImportService");

function stageError(message, code, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}
function safeFilename(name) {
  return String(name || "historical.xlsx").replace(/[\\/\r\n\x00-\x1f]/g,"").slice(0,180);
}
async function stageHistoricalImport({
  organizationId, actorUserId, year, buffer, originalFilename, prismaClient = null,
}) {
  if (!organizationId || !actorUserId) throw stageError("Organization and authorized actor required.","IMPORT_ACTOR_REQUIRED",403);
  const db = prismaClient || require("../config/prisma");
  const preview = previewHistoricalWorkbook({ buffer, organizationId, year });
  if (preview.exceptions.some(x=>x.code==="MISSING_SHEET" || x.code==="MISSING_HEADERS")) {
    throw stageError("Historical workbook structure does not match the expected source format.","IMPORT_INVALID_SOURCE");
  }
  if (!preview.records.length) throw stageError("No employee rows found in source workbook.","IMPORT_EMPTY_SOURCE");
  const id = crypto.randomUUID(), diagnostics = {
    rows:preview.records.length, exceptions:preview.exceptions, sheets:preview.diagnostics,
    note:"Pending reconciliation: import does not affect payroll, obligation status, or official report.",
  };
  const result = await db.$queryRawUnsafe(
    `INSERT INTO "consolidated_statutory_import_batches"
       ("id","organizationId","reportYear","sourceHash","originalFilename","status","payload","diagnostics","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,'PENDING_RECONCILIATION',$6::jsonb,$7::jsonb,$8)
       ON CONFLICT ("organizationId","sourceHash","reportYear")
       DO UPDATE SET "updatedAt" = "consolidated_statutory_import_batches"."updatedAt"
       RETURNING "id","sourceHash","reportYear","status","createdAt"`,
    id, String(organizationId), year, preview.workbookHash, safeFilename(originalFilename),
    JSON.stringify(preview.records), JSON.stringify(diagnostics), String(actorUserId)
  );
  const record = result[0];
  if (!record) throw stageError("Unable to stage import.","STAGING_FAILED",500);
  // Do not mark any statutory amounts as actually paid or mutate an approved payroll.
  await db.organizationAudit.create({
    data: { organizationId, actorUserId, entityType:"ConsolidatedStatutoryImport",
      entityId:record.id, action:"HISTORICAL_IMPORT_STAGED",
      newValue:{reportYear:year,sourceHash:preview.workbookHash,rows:preview.records.length,status:record.status},
      reason:"Read-only source staging, pending employee identity and branch reconciliation" },
  });
  return { batchId:record.id, sourceHash:record.sourceHash, reportYear:record.reportYear,
    status:record.status, importedRows:preview.records.length,
    sourceExceptions:preview.exceptions.length, persisted:true, postedToPayroll:false };
}
async function listHistoricalImports({ organizationId, year, prismaClient = null }) {
  const db = prismaClient || require("../config/prisma");
  return db.$queryRawUnsafe(
    `SELECT "id","reportYear","sourceHash","originalFilename","status",
            "createdAt","updatedAt",
            jsonb_array_length("payload") AS "rowCount"
       FROM "consolidated_statutory_import_batches"
      WHERE "organizationId"=$1 AND "reportYear"=$2
      ORDER BY "createdAt" DESC`, String(organizationId), Number(year));
}
module.exports = { stageHistoricalImport,listHistoricalImports };
