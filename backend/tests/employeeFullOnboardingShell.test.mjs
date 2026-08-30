import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const entry = read("src/pages/AddOnboardEmployeeEntry.jsx");
const shell = read("src/pages/FullOnboardingWizard.jsx");
const onboarding = read("backend/src/routes/onboardingRoutes.js");
const app = read("src/App.jsx");
const orchestration = read("src/utils/fullOnboardingOrchestration.js");

assert.match(entry, /mode === "full"[\s\S]*<FullOnboardingWizard/);
for (const step of [
  "Personal Information", "Employment Information", "Organization Placement",
  "Compensation / Payment Setup", "Statutory Information", "Documents",
  "Onboarding Checklist", "Review & Create",
]) assert.ok(shell.includes(step), `Missing Full Onboarding step: ${step}`);

// One in-memory draft survives navigation; moving steps performs no API write.
assert.match(shell, /const \[form, setForm\] = useState\(initialForm\)/);
assert.match(shell, /const \[payment, setPayment\] = useState/);
assert.match(shell, /const \[statutory, setStatutory\] = useState/);
const nextBody = shell.slice(shell.indexOf("function goNext"), shell.indexOf("function addDocument"));
assert.doesNotMatch(nextBody, /apiRequest/);

// Shared Quick Add date semantics and authoritative create endpoint are reused.
assert.match(shell, /import \{ tenantLocalDate \} from "\.\/QuickAddEmployeeWizard"/);
assert.match(shell, /runFullOnboarding\(\{/);
assert.match(orchestration, /apiRequest\("\/api\/employees", \{[\s\S]*method: "POST"/);
assert.ok(orchestration.indexOf('apiRequest("/api/employees",') < orchestration.indexOf("/api/employees/onboarding/${encodeURIComponent(currentEmployee.employeeNumber)}"));

// Retry guards retain a successfully created Employee and active onboarding record.
assert.match(orchestration, /if \(!currentEmployee\)[\s\S]*onEmployeeCreated\(currentEmployee\)/);
assert.match(orchestration, /if \(!currentRecord\)[\s\S]*onOnboardingStarted\(currentRecord\)/);
assert.match(shell, /Employee creation will not run again/);

// Existing payment, statutory, section-data and document contracts are reused.
assert.match(shell, /<OnboardingSectionDataForm sectionKey="payment-details"/);
assert.match(shell, /<OnboardingSectionDataForm sectionKey="statutory-details"/);
assert.match(orchestration, /\/sections\/\$\{encodeURIComponent\(key\)\}/);
assert.match(orchestration, /new FormData\(\)[\s\S]*\/documents`/);
assert.doesNotMatch(shell, /basicSalary|grossSalary|salaryRate|allowance|deduction/i);

// Backend remains tenant scoped and blocks duplicate active onboarding.
assert.match(onboarding, /employeeOnboarding\.findFirst\([\s\S]*organizationId[\s\S]*status:\s*\{[\s\S]*not: "COMPLETED"/);
assert.match(onboarding, /ACTIVE_ONBOARDING_REUSED/);
assert.match(app, /path="\/employees\/:employeeNumber\/onboarding"/);
assert.match(shell, /`\/employees\/\$\{encodeURIComponent\(createdEmployee\.employeeNumber\)\}\/onboarding`/);

console.log("PASS: Full Onboarding shell and retry-safe orchestration contracts passed.");
