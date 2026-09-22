"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ZERMATT_EMPLOYMENT_TYPES,
  normalizeZermattEmploymentType,
  assignEmployee,
} = require("../src/services/employeeEmploymentAssignmentService");

const ROOT = path.resolve(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("ZERMATT R1 provides authoritative Employment Type and Cost Centre assignment", async () => {
  assert.deepEqual(ZERMATT_EMPLOYMENT_TYPES, [
    "Full-Time",
    "Part-time",
    "Expatriate",
    "NYSC/Internship",
  ]);
  assert.equal(normalizeZermattEmploymentType("Part-Time"), "Part-time");
  assert.equal(normalizeZermattEmploymentType("Part-Time-Employment"), "Part-time");
  assert.equal(normalizeZermattEmploymentType("NYSC / Internship"), "NYSC/Internship");
  assert.equal(normalizeZermattEmploymentType("Internship"), "NYSC/Internship");
  assert.equal(normalizeZermattEmploymentType("Domestic Staff - Housekeeper"), null);

  let employeeWhere = null;
  let updateData = null;
  let auditData = null;

  const prisma = {
    organization: {
      findUnique: async ({ where }) => {
        assert.equal(where.id, "org-1");
        return { id: "org-1", name: "ZERMATT LIQUOR LIMITED", slug: "zermatt-liquor-limited" };
      },
    },
    costCentre: {
      findMany: async ({ where }) => {
        assert.equal(where.organizationId, "org-1");
        return [
          {
            id: "cc-generic",
            code: "BBT-GEN",
            name: "BB Takeaway",
            status: "ACTIVE",
            effectiveFrom: new Date("2026-09-04T00:00:00.000Z"),
            effectiveTo: null,
          },
        ];
      },
    },
    employee: {
      findFirst: async ({ where }) => {
        employeeWhere = where;
        return {
          id: "emp-139",
          employeeNumber: "ZLL000139",
          employmentType: "Full-Time",
          costCentreId: null,
        };
      },
    },
    $transaction: async (work) =>
      work({
        employee: {
          update: async ({ where, data }) => {
            assert.equal(where.id, "emp-139");
            updateData = data;
            return {
              id: "emp-139",
              employeeNumber: "ZLL000139",
              employmentType: data.employmentType,
              costCentreId: data.costCentreId,
              costCentre: {
                id: "cc-generic",
                code: "BBT-GEN",
                name: "BB Takeaway",
              },
            };
          },
        },
        organizationAudit: {
          create: async ({ data }) => {
            auditData = data;
            return { id: "audit-1" };
          },
        },
      }),
  };

  const assigned = await assignEmployee(prisma, {
    organizationId: "org-1",
    actorUserId: "user-1",
    employeeNumber: "ZLL000139",
    employmentType: "Full-Time",
    costCentre: "BB Takeaway",
    reason: "Authoritative master-data assignment",
  });

  assert.deepEqual(employeeWhere, {
    organizationId: "org-1",
    employeeNumber: "ZLL000139",
  });
  assert.equal(updateData.employmentType, "Full-Time");
  assert.equal(updateData.costCentreId, "cc-generic");
  assert.equal(assigned.changed, true);
  assert.equal(auditData.organizationId, "org-1");
  assert.equal(auditData.actorUserId, "user-1");
  assert.equal(auditData.action, "EMPLOYMENT_ASSIGNMENT_UPDATED");
  assert.equal(auditData.previousValue.costCentreId, null);
  assert.equal(auditData.newValue.costCentreId, "cc-generic");

  const foundation = read("backend/scripts/configure-zermatt-employment-assignment-foundation.cjs");
  for (const expected of [
    'code: "BBT-GEN"',
    'name: "BB Takeaway"',
    'code: "BBT-WSE"',
    'name: "BB Takeaway - WSE"',
    'code: "BBT-GWP"',
    'name: "BB Takeaway - GWP"',
  ]) {
    assert.ok(foundation.includes(expected), `Missing foundation marker: ${expected}`);
  }
  for (const employeeNumber of [
    "ZLL000139",
    "ZLL000146",
    "ZLL000181",
    "ZLL000199",
    "ZLL000226",
    "ZLL000238",
    "ZLL000264",
    "ZLL000269",
  ]) {
    assert.ok(foundation.includes(employeeNumber));
  }

  const app = read("backend/src/app.js");
  assert.ok(app.includes('require("./routes/employeeEmploymentAssignmentRoutes")'));
  assert.ok(app.includes('"/api/employee-assignments"'));

  const page = read("src/pages/BulkEmployeeImport.jsx");
  assert.ok(page.includes("Assign Existing Employees"));
  assert.ok(page.includes("Save Employee Assignment"));
  assert.ok(page.includes("Download Assignment Template"));
  assert.ok(page.includes("/api/employee-assignments/catalog"));
  assert.ok(page.includes("/api/employee-assignments/preview"));
  assert.ok(page.includes("/api/employee-assignments/bulk"));

  const launcher = read("src/components/employees/EmployeeDataOperationsLauncher.jsx");
  assert.ok(launcher.includes("Bulk upload / assign employees"));

  const creation = read("backend/src/services/employeeCreationService.js");
  assert.ok(creation.includes("normalizeZermattEmploymentType"));
  assert.ok(creation.includes("persistedEmploymentType"));
  assert.ok(creation.includes('sequenceOwner.slug === ZERMATT_SLUG'));
});
