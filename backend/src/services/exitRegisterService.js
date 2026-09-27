function serializeExitRegisterProcess(process) {
  const employee = process.employee || {};
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
    exitProcess: {
      id: process.id,
      status: process.status,
      exitType: process.exitType,
      reason: process.reason,
      effectiveDate: process.lastWorkingDay,
      completedAt: process.completedAt,
      financialStatus: process.financialStatus,
      finalClosureAt: process.finalClosureAt,
      settlement: process.settlement || null,
    },
  };
}

async function getExitRegister(prisma, organizationId) {
  if (!organizationId) throw new Error("organizationId is required");

  // A completed exit process is the authoritative historical record.
  // Do not depend on the employee's current status: legacy status drift or a
  // later rehire must never make a completed exit disappear from the register.
  const processes = await prisma.employeeExitProcess.findMany({
    where: {
      organizationId,
      status: "COMPLETED",
      completedAt: { not: null },
      cancelledAt: null,
    },
    select: {
      id: true,
      status: true,
      exitType: true,
      reason: true,
      lastWorkingDay: true,
      completedAt: true,
      financialStatus: true,
      finalClosureAt: true,
      employee: {
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
        },
      },
      settlement: {
        select: {
          id: true,
          status: true,
          currency: true,
          netSettlement: true,
          amountPaid: true,
        },
      },
    },
    orderBy: [{ completedAt: "desc" }, { lastWorkingDay: "desc" }],
  });

  return processes.map(serializeExitRegisterProcess);
}

module.exports = {
  getExitRegister,
  serializeExitRegisterProcess,
  // Backward-compatible alias for existing focused tests/imports.
  serializeExitRegisterEmployee: serializeExitRegisterProcess,
};
