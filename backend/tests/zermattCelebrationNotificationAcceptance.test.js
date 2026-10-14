const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Zermatt celebration delivery has idempotent ESS, email and phone channels", () => {
  const service = read("backend/src/services/zermattCelebrationNotificationService.js");
  const migration = read("backend/prisma/migrations/20261014010000_employee_celebration_notification_ledger/migration.sql");
  const routes = read("backend/src/routes/employeeNewsRoutes.js");

  for (const channel of ["ESS", "EMAIL", "PHONE"]) assert.ok(service.includes(`"${channel}"`), channel);
  assert.ok(service.includes("ON CONFLICT ("organizationId","employeeId","celebrationType","celebrationDate","channel") DO NOTHING"));
  assert.ok(service.includes("employee_onboardings"));
  assert.ok(service.includes("personal-details"));
  assert.ok(service.includes("RESEND_API_KEY"));
  assert.ok(service.includes("CELEBRATION_SMS_WEBHOOK_URL"));
  assert.ok(service.includes('category','EVENT'));
  assert.ok(migration.includes("employee_celebration_notification_ledger"));
  assert.ok(migration.includes("employee_celebration_ledger_idempotency_key"));
  assert.ok(routes.includes('router.post("/celebrations/dispatch"'));
  assert.ok(routes.includes("dispatchTodayCelebrations"));
});
