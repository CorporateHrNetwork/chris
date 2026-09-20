const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("CHRiS route modules are lazy-loaded instead of bundled into initial startup", () => {
  const app = read("src/App.jsx");
  for (const expected of [
    'import { lazy, Suspense } from "react";',
    'const Payroll = lazy(() => import("./pages/Payroll"));',
    'const Employees = lazy(() => import("./pages/Employees"));',
    'const Recruitment = lazy(() => import("./pages/Recruitment"));',
    'const LeaveDashboard = lazy(() => import("./pages/LeaveDashboard"));',
    'const Reports = lazy(() => import("./pages/Reports"));',
    'const Settings = lazy(() => import("./pages/Settings"));',
    'fallback={<AppLoading />}',
    'Loading CHRiS…',
  ]) assert.ok(app.includes(expected), `Missing route code-splitting control: ${expected}`);

  assert.equal(/^import\s+Payroll\s+from\s+"\.\/pages\/Payroll";$/m.test(app), false);
  assert.equal(/^import\s+Employees\s+from\s+"\.\/pages\/Employees";$/m.test(app), false);
});

test("Payroll loads only the selected workspace and avoids unused dashboard readiness requests", () => {
  const payroll = read("src/pages/Payroll.jsx");
  for (const expected of [
    'const PayrollIntegratedManaged = lazy(() => import("./payroll/PayrollIntegratedManaged"));',
    'const RentReliefManaged = lazy(() => import("./payroll/RentReliefManaged"));',
    'const SalaryRatesManaged = lazy(() => import("./payroll/SalaryRatesManaged"));',
    'const SalaryAdvancesManaged = lazy(() => import("./payroll/SalaryAdvancesManaged"));',
    'if (WORKSPACES.has(workspace)) {',
    'setLoading(false);',
    'fallback={<PayrollWorkspaceLoading />}',
    'Loading payroll workspace…',
  ]) assert.ok(payroll.includes(expected), `Missing payroll performance control: ${expected}`);
});
