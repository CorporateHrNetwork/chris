"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routeSource = fs.readFileSync(
  path.join(__dirname, "../src/routes/employeeRoutes.js"),
  "utf8"
);
const profileSource = fs.readFileSync(
  path.join(__dirname, "../../src/components/employees/EmployeeProfile.jsx"),
  "utf8"
);

test("Employee Employment Level route accepts effectiveFrom while preserving the legacy alias", () => {
  assert.match(
    routeSource,
    /parseEmploymentLevelEffectiveDate\(\s*req\.body\?\.effectiveFrom\s*\?\?\s*req\.body\?\.effectiveDate\s*\)/
  );
});

test("Employee Employment Level route maps the parsed date to the effectiveFrom assignment field", () => {
  assert.match(
    routeSource,
    /effectiveFrom:\s*effectiveDate/
  );
});

test("EmployeeProfile continues to submit its Employment Level date as effectiveFrom", () => {
  assert.match(
    profileSource,
    /effectiveFrom:\s*employmentLevelForm\.effectiveDate/
  );
});

test("Job Change validation reads only its own date and reason state", () => {
  const start = profileSource.indexOf("const handleJobChange =");
  const end = profileSource.indexOf("const handlePromotionChange =", start);
  assert.notEqual(start, -1, "Job Change handler exists");
  assert.notEqual(end, -1, "Job Change handler has a clear boundary");
  const handler = profileSource.slice(start, end);
  assert.match(handler, /jobChangeForm\.effectiveDate/);
  assert.match(handler, /jobChangeForm\.reason/);
  assert.doesNotMatch(handler, /employmentLevelForm/);
});
