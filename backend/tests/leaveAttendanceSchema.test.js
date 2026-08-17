const fs = require("fs");
const path = require("path");
const assert = require("assert");

const schemaPath = path.resolve(
  __dirname,
  "../prisma/schema.prisma"
);

const schema = fs.readFileSync(
  schemaPath,
  "utf8"
);

const requiredModels = [
  "model LeaveType",
  "model LeavePolicy",
  "model LeaveBalance",
  "model LeaveRequest",
  "model WorkShift",
  "model EmployeeShiftAssignment",
  "model AttendanceRecord",
];

for (const model of requiredModels) {
  assert.ok(
    schema.includes(model),
    `Missing Prisma model: ${model}`
  );
}

const requiredEnums = [
  "enum LeaveUnit",
  "enum LeaveAccrualMethod",
  "enum LeaveServiceBasis",
  "enum LeaveRequestStatus",
  "enum AttendanceStatus",
  "enum AttendanceSource",
];

for (const value of requiredEnums) {
  assert.ok(
    schema.includes(value),
    `Missing Prisma enum: ${value}`
  );
}

assert.ok(
  schema.includes(
    "@@unique([organizationId, employeeId, leaveTypeId, leaveYear])"
  ),
  "Leave balances must be tenant/employee/type/year unique."
);

assert.ok(
  schema.includes(
    "@@unique([organizationId, employeeId, attendanceDate])"
  ),
  "Attendance records must be unique per employee/date."
);

console.log(
  "PASS: CHRIS Leave & Attendance schema foundation tests passed."
);
