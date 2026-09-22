import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../src/pages/EmployeeAnalytics.jsx", import.meta.url), "utf8");

assert.ok(source.includes('{ status: "LEAVE", field: "leave" }'), "Employee Analytics must map On Leave to closingWorkforce.leave");
assert.equal(source.includes('field: "leaveCount"'), false, "Employee Analytics must not read the persisted leaveCount field directly");
assert.ok(source.includes("workforce?.[row.field]"), "status cards must read the canonical closingWorkforce fields");
assert.ok(source.includes("workforce={metrics.closingWorkforce}"), "Advanced Workforce Metrics must render the closing snapshot composition");
assert.ok(source.includes("Workforce Status at Period Close"), "historical composition must be labeled as period-close data");
assert.ok(source.includes('available ? value : "Not available"'), "missing contract fields must not be displayed as zero");
assert.equal(source.includes("closingWorkforce.leave || 0"), false, "missing leave data must not silently default to zero");
assert.equal(source.includes("closingWorkforce.leave ?? 0"), false, "missing leave data must not silently default to zero");

console.log("PASS: CHRIS workforce metrics frontend contract tests passed.");

assert.ok(source.includes("departmentId: filters.departmentId"), "Advanced metrics must inherit the selected department filter");
assert.ok(source.includes("locationId: filters.locationId"), "Advanced metrics must inherit the selected location filter");
assert.ok(source.includes("status: filters.status"), "Advanced metrics must inherit the selected status filter");
assert.ok(source.includes("gender: filters.gender"), "Advanced metrics must inherit the selected gender filter");
assert.ok(source.includes("Filtered workforce scope"), "Advanced metrics must disclose when a filtered scope is active");
assert.ok(source.includes("Historical headcount trend is unavailable for filtered views"), "organization-wide snapshot history must not masquerade as a filtered trend");
