import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const tracker = read("src/pages/OnboardingTracker.jsx");
const app = read("src/App.jsx");

assert.match(tracker, /apiRequest\("\/api\/employees\/onboarding\/status"\)/);
for (const heading of [
  "Employee", "Department", "Designation", "Start Date", "Progress",
  "Current Stage", "Outstanding Items", "Status", "Action",
]) assert.ok(tracker.includes(`"${heading}"`), `Missing tracker column: ${heading}`);

assert.match(tracker, /const \[search, setSearch\]/);
assert.match(tracker, /const \[department, setDepartment\]/);
assert.match(tracker, /const \[status, setStatus\]/);
assert.match(tracker, /searchable\.includes\(query\)/);
assert.match(tracker, /employee\.department\?\.id === department/);
assert.match(tracker, /record\.status === status/);

// Progress is displayed directly from the authoritative onboarding projection.
assert.match(tracker, /Number\(record\.completionPercent \?\? 0\)/);
assert.doesNotMatch(tracker, /completedItems\s*\/|calculateProgress/);
assert.match(tracker, /record\.sectionProgress\?\.\[section\.key\]\?\.completed !== true/);
assert.match(tracker, /record\.taskSummary\?\.total \? taskOutstanding : outstanding\.length/);
assert.match(tracker, /taskSummary\?\.overdue/);
assert.match(tracker, /record\.currentStage \|\| "—"/);

assert.match(tracker, /navigate\(`\/employees\/\$\{encodeURIComponent\(number\)\}\/onboarding`\)/);
assert.match(tracker, /navigate\(`\/employees\/\$\{encodeURIComponent\(number\)\}`\)/);
assert.match(app, /path="\/employees\/:employeeNumber\/onboarding"/);
assert.match(tracker, /hasPermission\("employees\.update"\)/);
assert.match(tracker, /canManageWorkflows &&[\s\S]*\/employees\/onboarding\/workflows/);
assert.match(app, /path="\/employees\/onboarding\/workflows"[\s\S]*<EmployeeOnboarding/);
assert.match(tracker, /const PAGE_SIZE = 20/);
assert.match(tracker, /filtered\.slice\(\(page - 1\) \* PAGE_SIZE/);

// Increment 7 exposes only authoritative backend task overdue summaries; the
// tracker does not derive deadlines independently.
assert.match(tracker, /record\.taskSummary\?\.overdue/);
assert.doesNotMatch(tracker, /new Date\(record\..*dueDate|Date\.now\(\).*dueDate/);

console.log("PASS: operational Onboarding Tracker refinement contracts passed.");
