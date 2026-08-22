const { EXITED_EMPLOYEE_STATUSES } = require("./employeeStatusSemantics");

const completedExitOrder = { completedAt: "desc" };

function serializeExitRegisterEmployee(employee) {
  const process = employee.exitProcesses?.[0] || null;
  return {
    employeeId: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    middleName: employee.middleName,
    lastName: employee.lastName,
    status: employee.status,
    exitDate: employee.exitDate,
    department: employee.department,
    designation: employee.designation,
    location: employee.location,
    exitProcess: process ? {
      id: process.id,
      status: process.status,
      exitType: process.exitType,
      reason: process.reason,
      effectiveDate: process.lastWorkingDay,
      completedAt: process.completedAt,
    } : null,
  };
}

async function getExitRegister(prisma, organizationId) {
  if (!organizationId) throw new Error("organizationId is required");
  const employees = await prisma.employee.findMany({
    where: {
      organizationId,
      status: { in: EXITED_EMPLOYEE_STATUSES },
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
      exitDate: true,
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      exitProcesses: {
        where: { status: "COMPLETED", completedAt: { not: null }, cancelledAt: null },
        select: { id: true, status: true, exitType: true, reason: true, lastWorkingDay: true, completedAt: true },
        orderBy: completedExitOrder,
        take: 1,
      },
    },
    orderBy: [{ exitDate: "desc" }, { lastName: "asc" }],
  });
  return employees.map(serializeExitRegisterEmployee);
}

module.exports = { getExitRegister, serializeExitRegisterEmployee };
