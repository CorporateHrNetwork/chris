import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "src/pages/EmployeeOnboarding.jsx"), "utf8");

test("personal-details citizenship defaults to a matching nationality", () => {
  assert.match(source, /nationality:\s*"Nigerian"/);
  assert.match(source, /citizenshipCountryCode:\s*"NG"/);
});

test("existing onboarding records derive nationality from citizenship when saved nationality is blank", () => {
  for (const expected of [
    "const savedNationality =",
    "const citizenshipCountryCode =",
    "const resolvedNationality =",
    "getCountryByCode(",
    ")?.nationality ||",
    "nationality:\n            resolvedNationality",
    "citizenshipCountryCode,",
  ]) {
    assert.ok(source.includes(expected), `Missing nationality autofill safeguard: ${expected}`);
  }
});

test("changing citizenship continues to update the read-only nationality field", () => {
  assert.match(
    source,
    /name ===\s*"citizenshipCountryCode"[\s\S]*getCountryByCode\([\s\S]*nationality:\s*country\?\.nationality\s*\|\|\s*""/
  );
  assert.match(
    source,
    /value=\{sectionForm\.nationality\}[\s\S]*readOnly/
  );
});
