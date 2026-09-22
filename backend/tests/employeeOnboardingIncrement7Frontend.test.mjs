import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const wizard = read("src/pages/FullOnboardingWizard.jsx");
const form = read("src/components/employees/OnboardingSectionDataForm.jsx");
const searchable = read("src/components/common/SearchableRegistrySelect.jsx");
const pfas = read("src/data/nigeriaPfas.js");
const routes = read("backend/src/routes/onboardingRoutes.js");
const tracker = read("src/pages/OnboardingTracker.jsx");
const migration = read("backend/prisma/migrations/20260828123000_add_employee_onboarding_tasks/migration.sql");

assert.match(wizard, /COUNTRY_CATALOG\.map[\s\S]*Search country \/ nationality/);
assert.match(wizard, /value=\{form\.nationality\}/);
assert.match(wizard, /\["Nationality", form\.nationality\]/);
assert.match(form, /NIGERIA_STATES\.map[\s\S]*Search state or FCT/);
assert.match(form, /NIGERIA_PFAS\.map[\s\S]*Search approved Pension Fund Administrator/);
assert.match(searchable, /role="listbox"[\s\S]*filtered\.map[\s\S]*role="option"/);
for (const name of ["Access ARM Pensions Limited", "Stanbic IBTC Pension Managers Limited", "Veritas Glanvills Pensions Limited"]) assert.ok(pfas.includes(name));
assert.doesNotMatch(pfas, /Pension Custodian|Closed Pension/);
assert.match(wizard, /Operational Onboarding Checklist/);
assert.match(routes, /records\/:id\/tasks\/:taskId/);
assert.match(tracker, /taskSummary\?\.overdue/);
assert.match(migration, /'NOT_STARTED'::"EmployeeOnboardingTaskStatus"/);
assert.match(migration, /WHERE onboarding\."status" <> 'COMPLETED'/);
assert.doesNotMatch(migration, /'COMPLETED'::"EmployeeOnboardingTaskStatus"/);

console.log("PASS: Increment 7 selector rendering and checklist contracts passed.");
