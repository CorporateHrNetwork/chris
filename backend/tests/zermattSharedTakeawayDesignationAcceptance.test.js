const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const fs = require("node:fs");
const path = require("node:path");
const { prepareBulkRows } = require("../src/services/employeeDataOperationsService");

test("BB Takeaway designations can be reused across BB Takeaway, WSE and GWP without cloning designation records", async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([{
    "Employee Name": "Example Takeaway Employee",
    "Gender": "MALE",
    "Hire Date": "2026-09-30",
    "Employment Type": "Full-Time",
    "Department": "BB Takeaway (WSE)",
    "Designation": "BB Takeaway Attendant",
    "Employment Level": "L1",
    "Location": "Abuja",
    "Cost Centre / Operating Unit": "BB Takeaway - WSE",
    "Monthly Gross Salary": 70560,
    "Salary Currency": "NGN",
  }]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Employee Import");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const prisma = {
    organization: { findUnique: async () => ({ slug: "zermatt-liquor-limited" }) },
    department: { findMany: async () => [
      { id: "bbo", name: "Beer Barn Operations", code: "BBO", costCentreId: "cc-main" },
      { id: "wse", name: "BB Takeaway (WSE)", code: "BBT-WSE", costCentreId: "cc-wse" },
    ] },
    designation: { findMany: async () => [{
      id: "des-ta", departmentId: "bbo", name: "BB Takeaway Attendant", code: "BBO-TA", careerLevel: 201,
      departmentEligibility: [{ departmentId: "wse" }],
    }] },
    organizationLocation: { findMany: async () => [{ id: "loc", name: "Abuja", code: "ABJ" }] },
    costCentre: { findMany: async () => [
      { id: "cc-main", name: "Beer Barn - Main Operations", code: "BBO-MAIN" },
      { id: "cc-wse", name: "BB Takeaway - WSE", code: "BBT-WSE" },
    ] },
    employee: { findMany: async () => [] },
    organizationEmploymentLevel: { findMany: async () => [{ levelNumber: 201, code: "L1", name: "Operational Support" }] },
    onboardingWorkflowTemplate: { findMany: async () => [{ id: "tmpl", employmentType: "Full-Time", sections: [] }] },
  };

  const rows = await prepareBulkRows(prisma, { organizationId: "org", buffer });
  assert.equal(rows[0].valid, true, rows[0].errors.join(" | "));
  assert.equal(rows[0].input.departmentId, "wse");
  assert.equal(rows[0].input.designationId, "des-ta");
});

test("migration maps only the four approved Takeaway roles to the three Takeaway departments", () => {
  const migration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20260930182000_shared_takeaway_designations/migration.sql"), "utf8");
  for (const name of [
    "BB Takeaway Attendant",
    "BB Takeaway Cashier",
    "BB Takeaway Shredder",
    "BB Takeaway Team Leader",
  ]) assert.ok(migration.includes(name));
  assert.equal(migration.includes("Assistant BB Takeaway Team Leader"), false);
  for (const department of ["BB Takeaway","BB Takeaway (WSE)","BB Takeaway (GWP)"]) {
    assert.ok(migration.includes(department));
  }
});
