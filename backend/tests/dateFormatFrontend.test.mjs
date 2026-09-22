import assert from "node:assert/strict";
import { formatDate } from "../../src/utils/dateFormat.js";

const validIsoDate = "2026-08-22T00:00:00.000Z";
const validDate = new Date(validIsoDate);

assert.notEqual(formatDate(validIsoDate), "Not recorded");
assert.equal(formatDate(validDate), validDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));
assert.equal(formatDate(null), "Not recorded");
assert.equal(formatDate(undefined), "Not recorded");
assert.equal(formatDate(""), "Not recorded");
assert.equal(formatDate("not-a-date"), "Not recorded");
assert.notEqual(formatDate("not-a-date"), "Invalid Date");

console.log("PASS: CHRIS frontend date formatting tests passed.");
