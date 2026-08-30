import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const entry = read("src/pages/AddOnboardEmployeeEntry.jsx");
const wizard = read("src/pages/QuickAddEmployeeWizard.jsx");
const styles = read("src/pages/QuickAddEmployeeWizard.css");
const service = read("backend/src/services/employeeCreationService.js");

assert.match(entry, /mode === "quick"[\s\S]*<QuickAddEmployeeWizard/);
for (const step of [
  "Personal Information",
  "Employment Information",
  "Organization Placement",
  "Review & Create",
]) assert.match(wizard, new RegExp(step));

// One durable form object is retained while Back/Next only changes the step.
assert.match(wizard, /const \[form, setForm\] = useState\(initialForm\)/);
assert.match(wizard, /setStep\(\(current\) => Math\.min\(current \+ 1/);
assert.match(wizard, /setStep\(\(current\) => Math\.max\(current - 1/);
assert.doesNotMatch(wizard, /setForm\(initialForm\(\)\)/);

assert.match(wizard, /designation\.departmentId === form\.departmentId/);
assert.match(wizard, /careerLevel[\s\S]*derived from Designation[\s\S]*readOnly/);
assert.match(wizard, /tenantLocalDate\([\s\S]*getStoredOrganization\(\)\?\.timezone/);
assert.match(wizard, /apiRequest\("\/api\/employees", \{[\s\S]*method: "POST"[\s\S]*name: fullName[\s\S]*hireDate: form\.hireDate/);
assert.match(wizard, /catch \(error\)[\s\S]*setServerError/);
assert.doesNotMatch(wizard, /catch \(error\)[\s\S]*setForm/);
assert.match(wizard, /`\/employees\/\$\{createdEmployee\.employeeNumber\}`/);
assert.match(wizard, /`\/employees\/\$\{encodeURIComponent\(createdEmployee\.employeeNumber\)\}\/onboarding`/);

assert.match(service, /hireDate: payload\.hireDate/);
assert.match(service, /startDate: payload\.hireDate \|\| employee\.hireDate \|\| employee\.createdAt/);
assert.match(styles, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(styles, /@media\(max-width:560px\)[\s\S]*grid-template-columns:1fr/);

console.log("PASS: compact Quick Add wizard and compatible hire-date contracts passed.");
