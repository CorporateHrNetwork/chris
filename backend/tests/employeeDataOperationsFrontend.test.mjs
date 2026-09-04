import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const employees = fs.readFileSync(path.join(root, "src/pages/Employees.jsx"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const backendApp = fs.readFileSync(path.join(root, "backend/src/app.js"), "utf8");
const routes = fs.readFileSync(path.join(root, "backend/src/routes/employeeDataOperationsRoutes.js"), "utf8");
const schema = fs.readFileSync(path.join(root, "backend/prisma/schema.prisma"), "utf8");

assert.match(employees, /EmployeeDataOperationsLauncher/);
assert.match(employees, /Bulk upload employees|bulk-upload/);
assert.match(employees, /Export Queue/);
assert.match(app, /employee-invite\/:token/);
assert.match(app, /employees\/bulk-upload/);
assert.match(app, /employees\/invitations/);
assert.match(app, /employees\/export-queue/);
assert.match(backendApp, /employeeDataOperationsRoutes/);
assert.match(backendApp, /employeeInvitationPublicRoutes/);
assert.match(routes, /createEmployee\(\{/);
assert.match(routes, /for \(const row of rows\)/);
assert.match(routes, /requirePermission\("employees\.update"\)/);
assert.match(schema, /model EmployeeExportJob/);
assert.match(schema, /model EmployeeSelfOnboardingInvite/);
assert.match(schema, /tokenHash\s+String\s+@unique/);

console.log("PASS: employee data operations integration contracts.");
