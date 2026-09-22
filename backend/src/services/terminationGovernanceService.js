const REASON_CLASSES = ["MISCONDUCT", "PERFORMANCE", "REDUNDANCY", "END_OF_CONTRACT", "OTHER"];
const PERFORMANCE_STEPS = [
  ["PERFORMANCE_CONCERN", "DEFICIENT_RATING"],
  ["COACHING", "COUNSELLING"],
  ["WRITTEN_WARNING", "WARNING"],
  ["PIP_STARTED", "PERFORMANCE_IMPROVEMENT_PLAN"],
  ["PIP_REVIEWED", "PERFORMANCE_REVIEW"],
  ["EMPLOYEE_RESPONSE", "FAIR_HEARING", "HEARING"],
  ["TERMINATION_RECOMMENDED", "DECISION"],
];
function governanceError(message, statusCode = 409, code = "TERMINATION_GOVERNANCE_BLOCKED", details = {}) {
  const error = new Error(message); error.statusCode = statusCode; error.code = code; error.details = details; return error;
}
function parseDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function hasEvent(events, alternatives) {
  return events.some((event) => alternatives.includes(String(event.eventType || "").trim().toUpperCase()));
}
async function assessTerminationReadiness(prisma, input) {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, organizationId: input.organizationId }, select: { id: true, employeeNumber: true, status: true, hireDate: true } });
  if (!employee) throw governanceError("Employee not found.", 404, "EMPLOYEE_NOT_FOUND");
  const blockers = [];
  const reasonClass = String(input.reasonClass || "").trim().toUpperCase();
  if (!REASON_CLASSES.includes(reasonClass)) blockers.push("A supported termination reason class is required.");
  const effectiveDate = parseDate(input.effectiveDate);
  if (!effectiveDate) blockers.push("A valid termination effective date is required.");
  if (effectiveDate && employee.hireDate && effectiveDate < employee.hireDate) blockers.push("Termination date cannot precede the employee hire date.");
  if (["TERMINATED","RESIGNED","RETIRED","INACTIVE"].includes(employee.status)) blockers.push("Employee is already in a terminal employment status.");
  const authority = input.authorityUserId ? await prisma.user.findFirst({
    where: { id: input.authorityUserId, organizationId: input.organizationId, isActive: true }, select: { id: true },
  }) : null;
  if (!authority) blockers.push("An active termination authority in this organization is required.");

  let disciplinaryCase = null;
  if (["MISCONDUCT","PERFORMANCE"].includes(reasonClass)) {
    disciplinaryCase = input.disciplinaryCaseId ? await prisma.disciplinaryCase.findFirst({
      where: { id: input.disciplinaryCaseId, organizationId: input.organizationId, employeeId: employee.id },
      include: { processEvents: { orderBy: { occurredAt: "asc" } }, evidenceVersions: true },
    }) : null;
    if (!disciplinaryCase) blockers.push(`A linked ${reasonClass === "PERFORMANCE" ? "performance-management" : "disciplinary"} case is required.`);
  }
  if (disciplinaryCase) {
    if (disciplinaryCase.status !== "CLOSED") blockers.push("The linked case must reach a closed decision before termination.");
    if (!disciplinaryCase.outcome || !disciplinaryCase.decidedAt) blockers.push("A documented and dated case outcome is required.");
    if (!(disciplinaryCase.evidenceVersions || []).some((item) => item.finalizedAt)) blockers.push("At least one finalized evidence version is required.");
    const events = disciplinaryCase.processEvents || [];
    if (reasonClass === "MISCONDUCT" && !hasEvent(events, ["EMPLOYEE_RESPONSE","HEARING","FAIR_HEARING"])) blockers.push("Employee response/fair-hearing evidence is required.");
    if (reasonClass === "PERFORMANCE") {
      for (const alternatives of PERFORMANCE_STEPS) {
        if (!hasEvent(events, alternatives)) blockers.push(`Missing structured performance step: ${alternatives[0]}.`);
      }
      for (let index = 1; index < events.length; index += 1) {
        if (events[index].occurredAt < events[index - 1].occurredAt) blockers.push("Performance events are not chronologically ordered.");
      }
    }
    if (effectiveDate && disciplinaryCase.decidedAt && effectiveDate < disciplinaryCase.decidedAt) blockers.push("Termination date cannot precede the linked case decision.");
  }
  return { ready: blockers.length === 0, employeeNumber: employee.employeeNumber, reasonClass, effectiveDate, authorityUserId: authority?.id || null, disciplinaryCaseId: disciplinaryCase?.id || null, blockers };
}
async function assertTerminationReady(prisma, input) {
  const assessment = await assessTerminationReadiness(prisma, input);
  if (!assessment.ready) throw governanceError("Termination governance requirements are incomplete.", 409, "TERMINATION_GOVERNANCE_BLOCKED", assessment);
  return assessment;
}
module.exports = { REASON_CLASSES, PERFORMANCE_STEPS, assessTerminationReadiness, assertTerminationReady };
