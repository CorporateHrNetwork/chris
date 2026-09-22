import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const source = fs.readFileSync(path.join(root, "backend/src/routes/analyticsRoutes.js"), "utf8");

for (const field of ["departmentId", "locationId", "status", "gender"]) {
  assert.match(
    source,
    new RegExp(`${field}: req\\.query\\.${field}`),
    `Advanced workforce metrics route must forward ${field}.`
  );
}

console.log("PASS: advanced workforce metrics route forwards analytics scope filters.");
