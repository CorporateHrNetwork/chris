import assert from "node:assert/strict";
import fs from "node:fs";

const entitlements = fs.readFileSync("src/pages/LeaveEntitlements.jsx", "utf8");
const employees = fs.readFileSync("src/pages/Employees.jsx", "utf8");
const ledger = fs.readFileSync("src/pages/LeaveBalances.jsx", "utf8");
const exportsSource = fs.readFileSync("src/utils/leaveLedgerExports.js", "utf8");

assert.match(entitlements, /showTransientSuccess\("Employment-level entitlement rule saved\."\)/);
assert.match(entitlements, /}, 4500\)/);
assert.match(entitlements, /clearSuccess\(\); setError\(""\)/);
assert.match(employees, /}, 7500\)/);
assert.match(employees, /followCreationAction/);
assert.match(ledger, /setEmployeeNumber\(employee\.employeeNumber\);\s*setSearch\(""\)/);
assert.match(ledger, /api\/organization\/profile/);
assert.match(ledger, /printLedgerReport\(report\)/);
assert.match(entitlements, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
assert.match(entitlements, /tenantDate\(tenantTimezone\)/);
assert.match(entitlements, /effectiveDateManuallySet: true/);
assert.match(exportsSource, /CorporateHR Network Information System/);
assert.match(exportsSource, /A4 portrait/);
assert.match(exportsSource, /overflow-wrap:anywhere/);
assert.match(exportsSource, /Employee Leave Ledger/);
assert.match(exportsSource, /window\.print\(\)/);
assert.match(exportsSource, /printLedgerReport\(report\)\{openLedgerReport\(report\);\}/);
assert.match(exportsSource, /exportLedgerPdf\(report\)\{openLedgerReport\(report\);\}/);

console.log("PASS: transient feedback and clean Leave Ledger report contracts passed.");
