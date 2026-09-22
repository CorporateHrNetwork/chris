import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "..", "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const app = read("src/App.jsx");
const sidebar = read("src/components/layout/Sidebar/Sidebar.jsx");
const entry = read("src/pages/AddOnboardEmployeeEntry.jsx");
const employees = read("src/pages/Employees.jsx");
const profile = read("src/components/employees/EmployeeProfile.jsx");
const onboarding = read("src/pages/EmployeeOnboarding.jsx");
const tracker = read("src/pages/OnboardingTracker.jsx");

assert.match(app, /path="\/employees\/add"[\s\S]*permission="employees\.create"[\s\S]*<AddOnboardEmployeeEntry/);
assert.match(entry, /\/employees\/add\?mode=quick/);
assert.match(entry, /\/employees\/add\?mode=full/);
assert.match(entry, /mode === "quick"[\s\S]*<QuickAddEmployeeWizard/);
assert.match(entry, /mode === "full"[\s\S]*<FullOnboardingWizard/);

assert.match(sidebar, /Add \/ Onboard Employee[\s\S]*\/employees\/add/);
assert.match(sidebar, /Onboarding Tracker[\s\S]*\/employees\/onboarding/);
assert.match(app, /path="\/employees\/onboarding"[\s\S]*<OnboardingTracker/);
assert.match(app, /path="\/employees\/onboarding\/workflows"[\s\S]*<EmployeeOnboarding/);

assert.match(app, /path="\/employees\/:employeeNumber\/onboarding"[\s\S]*<EmployeeOnboarding initialTab="STATUS"/);
assert.match(onboarding, /useParams/);
assert.match(onboarding, /employeeNumber:\s*routeEmployeeNumber/);
assert.match(onboarding, /useState\(routeEmployeeNumber\)/);
assert.match(onboarding, /record\.employee\?\.employeeNumber\s*===\s*routeEmployeeNumber/);
assert.match(onboarding, /setEmployeeNumber\(routeEmployeeNumber\)/);
assert.match(onboarding, /record\.sectionProgress\?\.\[section\.key\]\?\.completed !== true/);
assert.match(onboarding, /openSection\(record, nextSection\)/);
assert.match(onboarding, /displayedRecords\.map/);

assert.match(tracker, /\/api\/employees\/onboarding\/status/);
for (const heading of ["Employee", "Department", "Designation", "Start Date", "Progress", "Outstanding Items", "Status", "Action"]) {
  assert.match(tracker, new RegExp(`"${heading}"`));
}
assert.match(tracker, /navigate\(`\/employees\/\$\{encodeURIComponent\(number\)\}\/onboarding`\)/);
assert.match(tracker, /navigate\(`\/employees\/\$\{encodeURIComponent\(number\)\}`\)/);

assert.match(employees, /Employee created successfully — \{createdEmployee\.employeeNumber\}/);
assert.match(employees, /\/employees\/\$\{encodeURIComponent\(createdEmployee\.employeeNumber\)\}\/onboarding/);
assert.match(profile, /\/employees\/\$\{encodeURIComponent\([\s\S]*employeeNumber[\s\S]*\)\}\/onboarding/);

console.log("PASS: Add/Onboard navigation, tracker and route-driven continuation contracts passed.");
