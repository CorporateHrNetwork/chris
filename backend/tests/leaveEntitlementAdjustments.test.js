const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { projectBalance } = require("../src/services/leaveBalanceService");

const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");
const service = fs.readFileSync(path.resolve(__dirname, "../src/services/leaveEntitlementAdjustmentService.js"), "utf8");
const migration = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20260823143000_add_leave_entitlement_adjustments/migration.sql"), "utf8");

assert.match(schema, /model LeaveEntitlementAdjustment/);
assert.match(service, /prisma\.\$transaction/);
assert.match(service, /leaveBalance\.update/);
assert.match(service, /leaveEntitlementAdjustment\.create/);
assert.doesNotMatch(service, /leaveEntitlementAdjustment\.(update|delete)/);
assert.match(migration, /WHERE "code" = 'UNPAID'/);
assert.doesNotMatch(migration, /UPDATE "leave_policies"/);

const projection = projectBalance({
  balance: { openingBalance: 20, used: 4, adjusted: 2 },
  policy: { entitlementDays: 20, entitlementRules: { unit: "WORKING_DAYS" } },
  committed: 3,
  entitlement: 20,
});
assert.equal(projection.entitlement, 20);
assert.equal(projection.used, 4);
assert.equal(projection.committed, 3);
assert.equal(projection.adjustments, 2);
assert.equal(projection.available, 15);

console.log("PASS: append-only entitlement adjustment tests passed.");

