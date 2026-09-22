const fs = require("fs");
const path = require("path");
const assert = require("assert");

const service = fs.readFileSync(path.resolve(__dirname, "../src/services/leaveService.js"), "utf8");
const routes = fs.readFileSync(path.resolve(__dirname, "../src/routes/leaveRoutes.js"), "utf8");
const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");

for (const status of ["ACTIVE", "COMPLETED"]) assert.ok(schema.includes(status), "missing lifecycle status " + status);
for (const field of ["commencedAt", "commencementDate", "commencedByUserId", "returnedAt", "actualReturnDate", "returnedByUserId", "preLeaveStatus"]) {
  assert.ok(schema.includes(field), "missing lifecycle field " + field);
}
assert.ok(service.includes('request.status !== "APPROVED"'), "commencement must require approval");
assert.ok(service.includes('["ACTIVE", "PROBATION"].includes(request.employee.status)'), "only eligible status may commence");
assert.ok(service.includes('data: { status: "LEAVE" }'), "commencement must set employee LEAVE");
assert.ok(service.includes("preLeaveStatus: request.employee.status"), "prior status must be preserved");
assert.ok(service.includes("const restoredStatus = request.preLeaveStatus"), "return must restore prior status");
assert.ok(service.includes('request.employee.status !== "LEAVE"'), "return must not overwrite a stronger status");
assert.ok(service.includes("tx.employeeLifecycleEvent.create"), "lifecycle writes must be audited");
assert.ok(service.includes("prisma.$transaction"), "lifecycle updates must be transactional");
assert.ok(service.includes('where: { id: leaveRequestId, organizationId }'), "tenant scope must include organization");
assert.ok(routes.includes('"/requests/:id/commence"'), "commence endpoint missing");
assert.ok(routes.includes('"/requests/:id/return"'), "return endpoint missing");
assert.ok(routes.includes('requirePermission("leave.manage")'), "canonical leave write permission missing");
assert.ok(routes.includes('"/consistency"'), "consistency diagnostic missing");
console.log("PASS: CHRIS leave commencement and return lifecycle source tests passed.");
