import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const pagePath = path.join(root, "src/pages/EmployeeOnboarding.jsx");
const page = fs.readFileSync(pagePath, "utf8");

assert.doesNotMatch(
  page,
  /completedItems\s*=\s*calculatePersonalCompletedItems\(/,
  "Personal Details save must not calculate authoritative completion in the browser."
);

assert.doesNotMatch(
  page,
  /activeSection\.key\s*===\s*["']personal-details["'][\s\S]{0,120}\?\s*calculatePersonalCompletedItems\(/,
  "Personal Details editor count must come from backend sectionProgress."
);

assert.match(
  page,
  /progress\.completed === true\s*\|\|\s*completedKeys\.includes\(item\)/,
  "A backend-completed section must project its checklist as complete."
);

assert.match(
  page,
  /selectedRecord[\s\S]{0,200}sectionProgress\?\.\[[\s\S]{0,100}activeSection\.key[\s\S]{0,140}completedItems/,
  "Editor count must read the authoritative saved sectionProgress."
);

assert.match(
  page,
  /async function completeOnboarding\(\)[\s\S]*?\/complete[\s\S]*?method:\s*["']POST["']/,
  "Complete Onboarding must call the authoritative completion endpoint."
);

console.log("PASS: onboarding uses backend sectionProgress as the single completion authority.");