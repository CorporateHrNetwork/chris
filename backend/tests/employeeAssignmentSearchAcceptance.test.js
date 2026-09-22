const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const routes = fs.readFileSync(
  path.join(root, "backend/src/routes/employeeEmploymentAssignmentRoutes.js"),
  "utf8"
);
const frontend = fs.readFileSync(
  path.join(root, "src/pages/BulkEmployeeImport.jsx"),
  "utf8"
);

test("existing-employee assignment exposes branch-scoped name and ID search", () => {
  for (const expected of [
    '"/employees/search"',
    'employeeNumber: { contains: token, mode: "insensitive" }',
    'firstName: { contains: token, mode: "insensitive" }',
    'lastName: { contains: token, mode: "insensitive" }',
    'req.auth.activeLocationId',
    'status: { in: ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"] }',
    'take: 20',
  ]) {
    assert.ok(routes.includes(expected), `Missing employee search safeguard: ${expected}`);
  }
});

test("assignment UI searches by employee name or ID and selects permanent employee number", () => {
  for (const expected of [
    "Search Employee / Employee ID",
    "Type name or Employee ID, e.g. Priscilia or ZLL000313",
    "/api/employee-assignments/employees/search?q=",
    "selectAssignmentEmployee",
    "employee.employeeNumber",
    "employee.employeeName",
    "Current Employment Type:",
    "Current Cost Centre:",
  ]) {
    assert.ok(frontend.includes(expected), `Missing assignment search UX: ${expected}`);
  }
});

test("assignment search avoids manual stale employee-number submission", () => {
  assert.ok(frontend.includes('setAssignment((current) => ({ ...current, employeeNumber: "" }))'));
  assert.ok(frontend.includes('employeeNumber: employee.employeeNumber'));
});
