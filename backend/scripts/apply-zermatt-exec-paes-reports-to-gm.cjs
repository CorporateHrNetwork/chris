require("dotenv").config({ quiet: true });

const prisma = require("../src/config/prisma");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const ACTOR_EMAIL = "corporatehr.crn@gmail.com";
const ACTOR_ROLE = "Head of HR & Admin";
const SOURCE_CODE = "EXEC-PAES";
const TARGET_CODE = "EXEC-GM";
const ESTHER_EMPLOYEE_NUMBER = "ZLL000087";

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function parseArgs() {
  return { apply: process.argv.includes("--apply") };
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ");
}

function reportingFingerprint(rows, ignoredCode = null) {
  const ignored = normalizeCode(ignoredCode);
  return JSON.stringify(
    rows
      .filter((row) => normalizeCode(row.code) !== ignored)
      .map((row) => ({
        id: row.id,
        code: normalizeCode(row.code),
        reportsToDesignationId: row.reportsToDesignationId || null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  );
}

function employeeDesignationFingerprint(rows) {
  return JSON.stringify(
    rows
      .map((row) => ({
        id: row.id,
        employeeNumber: row.employeeNumber,
        designationId: row.designationId || null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  );
}

async function resolveOrganizationAndActor() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ZERMATT_SLUG },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const actor = await prisma.user.findFirst({
    where: {
      organizationId: organization.id,
      email: ACTOR_EMAIL,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!actor) throw new Error("ZERMATT_CHRIS_ADMINISTRATOR_REQUIRED");

  const roleNames = actor.userRoles.map(({ role }) => role.name);
  if (!roleNames.includes(ACTOR_ROLE)) {
    const error = new Error("ZERMATT_HEAD_HR_ADMIN_ROLE_REQUIRED");
    error.details = { actor: actor.email, roleNames };
    throw error;
  }

  return { organization, actor, roleNames };
}

async function loadState(tx, organizationId) {
  const [designations, employees, esther, existingAssignments] = await Promise.all([
    tx.designation.findMany({
      where: { organizationId },
      select: {
        id: true,
        code: true,
        name: true,
        careerLevel: true,
        reportsToDesignationId: true,
        reportsToDesignation: { select: { id: true, code: true, name: true } },
      },
      orderBy: { code: "asc" },
    }),
    tx.employee.findMany({
      where: { organizationId },
      select: { id: true, employeeNumber: true, designationId: true },
      orderBy: { employeeNumber: "asc" },
    }),
    tx.employee.findFirst({
      where: { organizationId, employeeNumber: ESTHER_EMPLOYEE_NUMBER },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        designation: { select: { id: true, code: true, name: true, reportsToDesignationId: true } },
      },
    }),
    tx.employeeLineManagerAssignment.count({ where: { organizationId } }),
  ]);

  const byCode = new Map(designations.map((row) => [normalizeCode(row.code), row]));
  const source = byCode.get(SOURCE_CODE) || null;
  const target = byCode.get(TARGET_CODE) || null;

  if (!source) throw new Error("EXEC_PAES_DESIGNATION_NOT_FOUND");
  if (!target) throw new Error("EXEC_GM_DESIGNATION_NOT_FOUND");
  if (!esther) throw new Error("ZLL000087_NOT_FOUND");
  if (normalizeCode(esther.designation?.code) !== SOURCE_CODE) {
    const error = new Error("ZLL000087_DESIGNATION_CHANGED");
    error.details = { currentDesignation: esther.designation?.code || null };
    throw error;
  }

  return { designations, employees, esther, existingAssignments, byCode, source, target };
}

function assertNoProposedCycle(state) {
  const byId = new Map(state.designations.map((row) => [row.id, row]));
  const visited = new Set([state.source.id]);
  let cursor = state.target;
  const chain = [];

  while (cursor) {
    if (visited.has(cursor.id)) {
      const error = new Error("PROPOSED_DESIGNATION_HIERARCHY_CYCLE");
      error.details = { chain: [...chain, cursor.code || cursor.name] };
      throw error;
    }
    visited.add(cursor.id);
    chain.push(cursor.code || cursor.name);
    cursor = cursor.reportsToDesignationId
      ? byId.get(cursor.reportsToDesignationId) || null
      : null;
  }

  return chain;
}

async function verifyAppliedState(tx, organizationId) {
  const source = await tx.designation.findFirst({
    where: { organizationId, code: SOURCE_CODE },
    select: {
      id: true,
      code: true,
      name: true,
      reportsToDesignationId: true,
      reportsToDesignation: { select: { id: true, code: true, name: true } },
    },
  });
  if (!source) throw new Error("EXEC_PAES_DESIGNATION_NOT_FOUND");
  if (normalizeCode(source.reportsToDesignation?.code) !== TARGET_CODE) {
    throw new Error("EXEC_PAES_REPORTS_TO_GM_POSTCONDITION_FAILED");
  }
  return {
    designation: source.name,
    designationCode: source.code,
    reportsToDesignation: source.reportsToDesignation.name,
    reportsToDesignationCode: source.reportsToDesignation.code,
  };
}

async function main() {
  const { apply } = parseArgs();
  const { organization, actor, roleNames } = await resolveOrganizationAndActor();
  const sourceState = await loadState(prisma, organization.id);
  const proposedChain = assertNoProposedCycle(sourceState);
  const alreadyApplied =
    sourceState.source.reportsToDesignationId === sourceState.target.id;

  const gmEmployees = await prisma.employee.findMany({
    where: {
      organizationId: organization.id,
      designationId: sourceState.target.id,
      status: { in: ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"] },
      exitDate: null,
    },
    select: {
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
    },
    orderBy: { employeeNumber: "asc" },
  });

  console.log("\n============================================================");
  console.log("ZERMATT EXECUTIVE SECRETARY REPORTING-LINE CORRECTION");
  console.log("============================================================");
  console.log(`Organization: ${organization.name}`);
  console.log(`Actor: ${actor.email}`);
  console.log(`Actor Roles: ${roleNames.join(", ")}`);
  console.log(`Mode: ${apply ? "APPLY" : "PREVIEW_ONLY"}`);
  console.log(`Employee: ${sourceState.esther.employeeNumber} - ${employeeName(sourceState.esther)}`);
  console.log(`Designation: ${sourceState.source.code} - ${sourceState.source.name}`);
  console.log(
    `Current Reports-To: ${sourceState.source.reportsToDesignation?.code || "NONE"} - ${
      sourceState.source.reportsToDesignation?.name || "Not configured"
    }`
  );
  console.log(`Proposed Reports-To: ${sourceState.target.code} - ${sourceState.target.name}`);
  console.log(`Proposed hierarchy chain: ${proposedChain.join(" -> ") || TARGET_CODE}`);
  console.log(`Current GM incumbents: ${gmEmployees.length}`);
  if (gmEmployees.length) {
    console.table(
      gmEmployees.map((employee) => ({
        EmployeeNumber: employee.employeeNumber,
        EmployeeName: employeeName(employee),
        Status: employee.status,
      }))
    );
  }

  if (alreadyApplied) {
    const verified = await verifyAppliedState(prisma, organization.id);
    console.log("\nReporting-line correction is already active and verified.");
    console.log(JSON.stringify({ mode: "ALREADY_APPLIED", ...verified }, null, 2));
    console.log("Database Writes Issued: 0");
    console.log("============================================================\n");
    return;
  }

  if (!apply) {
    console.log("\nPRECONDITIONS: PASS");
    console.log("Database Writes Issued: 0");
    console.log("Run again with --apply to make only the approved EXEC-PAES -> EXEC-GM reporting-line correction.");
    console.log("============================================================\n");
    return;
  }

  const beforeOtherReportingFingerprint = reportingFingerprint(
    sourceState.designations,
    SOURCE_CODE
  );
  const beforeEmployeeDesignationFingerprint = employeeDesignationFingerprint(
    sourceState.employees
  );
  const beforeLineManagerAssignmentCount = sourceState.existingAssignments;

  const result = await prisma.$transaction(
    async (tx) => {
      const current = await loadState(tx, organization.id);
      assertNoProposedCycle(current);

      if (current.source.reportsToDesignationId === current.target.id) {
        return { mode: "ALREADY_APPLIED_IN_TRANSACTION" };
      }

      const previous = current.source.reportsToDesignation;
      await tx.designation.update({
        where: { id: current.source.id },
        data: { reportsToDesignationId: current.target.id },
      });

      await tx.organizationAudit.create({
        data: {
          organizationId: organization.id,
          actorUserId: actor.id,
          entityType: "Designation",
          entityId: current.source.id,
          action: "ZERMATT_DESIGNATION_REPORTING_LINE_CORRECTED",
          previousValue: {
            designationCode: current.source.code,
            designationName: current.source.name,
            reportsToDesignationId: previous?.id || null,
            reportsToDesignationCode: previous?.code || null,
            reportsToDesignationName: previous?.name || null,
          },
          newValue: {
            designationCode: current.source.code,
            designationName: current.source.name,
            reportsToDesignationId: current.target.id,
            reportsToDesignationCode: current.target.code,
            reportsToDesignationName: current.target.name,
            managementConfirmation: `${ESTHER_EMPLOYEE_NUMBER} reports to the GM`,
          },
          reason:
            "Management confirmed the Personal Assistant / Executive Secretary reports to the General Manager.",
        },
      });

      const afterDesignations = await tx.designation.findMany({
        where: { organizationId: organization.id },
        select: { id: true, code: true, reportsToDesignationId: true },
        orderBy: { code: "asc" },
      });
      if (
        reportingFingerprint(afterDesignations, SOURCE_CODE) !==
        beforeOtherReportingFingerprint
      ) {
        throw new Error("UNEXPECTED_OTHER_DESIGNATION_REPORTING_LINE_CHANGED");
      }

      const afterEmployees = await tx.employee.findMany({
        where: { organizationId: organization.id },
        select: { id: true, employeeNumber: true, designationId: true },
        orderBy: { employeeNumber: "asc" },
      });
      if (
        employeeDesignationFingerprint(afterEmployees) !==
        beforeEmployeeDesignationFingerprint
      ) {
        throw new Error("EMPLOYEE_DESIGNATION_RELATIONSHIP_CHANGED_UNEXPECTEDLY");
      }

      const afterLineManagerAssignmentCount = await tx.employeeLineManagerAssignment.count({
        where: { organizationId: organization.id },
      });
      if (afterLineManagerAssignmentCount !== beforeLineManagerAssignmentCount) {
        throw new Error("LINE_MANAGER_ASSIGNMENT_CHANGED_UNEXPECTEDLY");
      }

      const verified = await verifyAppliedState(tx, organization.id);
      return {
        mode: "APPLIED",
        verified,
        controls: {
          otherDesignationReportingLinesPreserved: true,
          employeeDesignationsPreserved: true,
          lineManagerAssignmentsWritten: 0,
        },
      };
    },
    {
      isolationLevel: "Serializable",
      maxWait: 10000,
      timeout: 60000,
    }
  );

  console.log("\nCORRECTION RESULT");
  console.log(JSON.stringify(result, null, 2));
  console.log("============================================================\n");
}

main()
  .catch((error) => {
    console.error("\nZERMATT reporting-line correction failed safely.");
    console.error(error);
    if (error?.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
