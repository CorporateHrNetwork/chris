import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../src/pages/EmployeeAnalytics.jsx", import.meta.url), "utf8");

assert.ok(source.includes("<h3>Approved Leave Requests</h3>"), "operational leave workflows need an explicit request label");
assert.ok(source.includes("Current or upcoming approved requests"), "the subtitle must state the exact current-or-upcoming rule");
assert.ok(source.includes("{data.leave.approvedCurrentOrUpcoming}"), "the request card must retain the approved request binding");
assert.equal(source.includes("<h3>Leave</h3><strong>{data.leave.approvedCurrentOrUpcoming}"), false, "request counts must not use the ambiguous Leave label");
assert.ok(source.includes('{ status: "LEAVE", field: "leave" }'), "period-close On Leave must remain snapshot based");

console.log("PASS: CHRIS workforce leave UI semantics tests passed.");
