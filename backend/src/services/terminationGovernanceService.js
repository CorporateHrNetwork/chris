function governanceError(message, statusCode = 409, code = "TERMINATION_GOVERNANCE_BLOCKED", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

async function assessTerminationReadiness(prisma, input) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, organizationId: input.organizationId },
    select: { id: true, employeeNumber: true, status: true },
  });
  if (!employee) throw governanceError("Employee not found.", 404, "EMPLOYEE_NOT_FOUND");

  const blockers = [];
  const reasonClass = String(input.reasonClass || "").trim().toUpperCase();

  if (reasonClass === "MISCONDUCT") {
    const disciplinaryCase = input.disciplinaryCaseId
      ? await prisma.disciplinaryCase.findFirst({
          where: { id: input.disciplinaryCaseId, organizationId: input.organizationId, employeeId: employee.id },
          include: { processEvents: true, evidenceVersions: true },
        })
      : null;
    if (!disciplinaryCase) blockers.push("A linked disciplinary case is required for misconduct termination.");
    else {
      if (disciplinaryCase.status !== "CLOSED") blockers.push("The disciplinary process must reach a closed decision before termination.");
      if (!disciplinaryCase.outcome) blockers.push("A documented disciplinary outcome is required.");
      const eventTypes = new Set((disciplinaryCase.processEvents || []).map((event) => event.eventType));
      if (![...eventTypes].some((type) => /RESPONSE|HEARING|FAIR/i.test(type))) blockers.push("Employee response/fair-hearing evidence is required.");
      if (!(disciplinaryCase.evidenceVersions || []).some((item) => item.finalizedAt)) blockers.push("At least one finalized evidence version is required.");
    }
  }

  if (reasonClass === "PERFORMANCE") {
    const events = await prisma.employeeLifecycleEvent.findMany({
      where: { organizationId: input.organizationId, employeeId: employee.id },
      orderBy: { effectiveDate: "asc" },
    });
    const searchable = events.map((event) => `${event.eventType || ""} ${event.reason || ""} ${JSON.stringify(event.metadata || {})}`).join(" ");
    if (!/COACH|WARNING|PIP|PERFORMANCE IMPROVEMENT/i.test(searchable)) {
      blockers.push("Performance termination requires documented coaching/warning/PIP history.");
    }
  }

  if (!input.authority) blockers.push("Termination authority/approval is required.");
  if (!input.effectiveDate) blockers.push("Termination effective date is required.");

  return { ready: blockers.length === 0, employeeNumber: employee.employeeNumber, reasonClass, blockers };
}

async function assertTerminationReady(prisma, input) {
  const assessment = await assessTerminationReadiness(prisma, input);
  if (!assessment.ready) {
    throw governanceError("Termination governance requirements are incomplete.", 409, "TERMINATION_GOVERNANCE_BLOCKED", assessment);
  }
  return assessment;
}

module.exports = { assessTerminationReadiness, assertTerminationReady };
