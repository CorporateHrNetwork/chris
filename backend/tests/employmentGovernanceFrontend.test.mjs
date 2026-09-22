import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const employees = fs.readFileSync(path.join(root, "src/pages/Employees.jsx"), "utf8");
const page = fs.readFileSync(path.join(root, "src/pages/EmployeeGovernance.jsx"), "utf8");
const backendApp = fs.readFileSync(path.join(root, "backend/src/app.js"), "utf8");

assert.match(app, /\/employees\/governance/);
assert.match(employees, /Employment Governance/);
assert.match(backendApp, /\/api\/employment-governance/);
assert.match(page, /external police, court or regulator outcomes/i);
assert.match(page, /SERVICE_UNAVAILABLE/);
assert.match(page, /Evidence Pack/);
assert.match(page, /contractStates/);
console.log("PASS: employment governance frontend integration contracts.");
