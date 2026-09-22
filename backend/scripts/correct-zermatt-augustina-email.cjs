require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const prisma = require("../src/config/prisma");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const ACTOR_EMAIL = "corporatehr.crn@gmail.com";
const EMPLOYEE_NUMBER = "ZLL000223";
const INCORRECT_EMAIL = "tina.beerbarn@gamil.com";
const CORRECT_EMAIL = "tina.beerbarn@gmail.com";
const APPLY = process.argv.includes("--apply");

async function loadContext() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, status: true },
  });
  assert.ok(organization, "ZERMATT organization was not found.");
  assert.equal(organization.status, "ACTIVE", "ZERMATT organization must be ACTIVE.");

  const actor = await prisma.user.findFirst({
    where: { organizationId: organization.id, email: ACTOR_EMAIL, isActive: true },
    select: { id: true, email: true, locationScope: true },
  });
  assert.ok(actor, `Active CHRIS Administrator ${ACTOR_EMAIL} was not found.`);
  assert.equal(actor.locationScope, "ALL_LOCATIONS", "Correction actor must retain ALL_LOCATIONS scope.");

  const employee = await prisma.employee.findFirst({
    where: { organizationId: organization.id, employeeNumber: EMPLOYEE_NUMBER },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      email: true,
      status: true,
      location: { select: { id: true, name: true, code: true, type: true } },
      designation: { select: { id: true, name: true, code: true } },
      user: { select: { id: true, email: true, isActive: true, locationScope: true } },
    },
  });
  assert.ok(employee, `${EMPLOYEE_NUMBER} was not found in ZERMATT.`);
  assert.equal(employee.location?.code, "LAG", `${EMPLOYEE_NUMBER} must remain assigned to Lagos before this correction.`);
  assert.equal(employee.designation?.code, "HRA-OFF", `${EMPLOYEE_NUMBER} must remain an HR & Admin Officer before this correction.`);

  const currentEmployeeEmail = String(employee.email || "").trim().toLowerCase();
  assert.ok(
    [INCORRECT_EMAIL, CORRECT_EMAIL].includes(currentEmployeeEmail),
    `Unexpected employee email for ${EMPLOYEE_NUMBER}: ${employee.email}. Refusing to overwrite an unreviewed value.`
  );

  const employeeCollision = await prisma.employee.findFirst({
    where: {
      organizationId: organization.id,
      email: CORRECT_EMAIL,
      NOT: { id: employee.id },
    },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true, email: true },
  });
  assert.equal(
    employeeCollision,
    null,
    `Corrected email ${CORRECT_EMAIL} is already used by employee ${employeeCollision?.employeeNumber || "unknown"}.`
  );

  if (employee.user) {
    const userCollision = await prisma.user.findFirst({
      where: {
        organizationId: organization.id,
        email: CORRECT_EMAIL,
        NOT: { id: employee.user.id },
      },
      select: { id: true, email: true, employeeId: true },
    });
    assert.equal(
      userCollision,
      null,
      `Corrected email ${CORRECT_EMAIL} is already used by another CHRIS user.`
    );
  }

  return { organization, actor, employee };
}

function fullName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
}

async function applyCorrection({ organization, actor, employee }) {
  const employeeBefore = String(employee.email || "").trim().toLowerCase();
  const userBefore = employee.user?.email ? String(employee.user.email).trim().toLowerCase() : null;

  if (employeeBefore === CORRECT_EMAIL && (!employee.user || userBefore === CORRECT_EMAIL)) {
    return { changed: false };
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employee.id },
      data: { email: CORRECT_EMAIL },
    });

    if (employee.user) {
      await tx.user.update({
        where: { id: employee.user.id },
        data: { email: CORRECT_EMAIL },
      });
    }

    await tx.organizationAudit.create({
      data: {
        organizationId: organization.id,
        actorUserId: actor.id,
        entityType: "Employee",
        entityId: employee.id,
        action: "ZERMATT_EMPLOYEE_EMAIL_CORRECTED",
        previousValue: {
          employeeNumber: employee.employeeNumber,
          employeeEmail: employeeBefore || null,
          linkedUserEmail: userBefore,
        },
        newValue: {
          employeeNumber: employee.employeeNumber,
          employeeEmail: CORRECT_EMAIL,
          linkedUserEmail: employee.user ? CORRECT_EMAIL : null,
        },
        reason: "Correct typographical error in Augustina Obiajuru Anienwe email address before branch-access activation",
      },
    });
  });

  return { changed: true };
}

async function verifyPersisted(organizationId, employeeId, userId) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
    select: { employeeNumber: true, email: true },
  });
  assert.equal(employee?.email?.toLowerCase(), CORRECT_EMAIL, "Employee email correction was not persisted.");

  let user = null;
  if (userId) {
    user = await prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, email: true, isActive: true },
    });
    assert.equal(user?.email?.toLowerCase(), CORRECT_EMAIL, "Linked CHRIS user email correction was not persisted.");
  }

  return { employee, user };
}

async function main() {
  const context = await loadContext();
  const { organization, actor, employee } = context;

  console.log("\n============================================================");
  console.log("ZERMATT AUGUSTINA EMAIL CORRECTION");
  console.log("============================================================");
  console.log(JSON.stringify({
    mode: APPLY ? "APPLY" : "PREVIEW_ONLY",
    organization: organization.name,
    actor: actor.email,
    employeeNumber: employee.employeeNumber,
    employeeName: fullName(employee),
    designation: employee.designation?.name || null,
    branch: employee.location ? `${employee.location.name} · ${employee.location.code}` : null,
    employeeEmailBefore: employee.email,
    linkedUserEmailBefore: employee.user?.email || null,
    correctedEmail: CORRECT_EMAIL,
    linkedUserPresent: Boolean(employee.user),
    plannedDatabaseWrites: APPLY ? "CONTROLLED_TRANSACTION" : 0,
  }, null, 2));

  if (!APPLY) {
    console.log("PREVIEW PASS: no database writes performed.");
    console.log("Run again with --apply after reviewing the employee and corrected email.");
    return;
  }

  const result = await applyCorrection(context);
  const persisted = await verifyPersisted(organization.id, employee.id, employee.user?.id || null);

  console.log("\nAPPLIED AND VERIFIED");
  console.log(JSON.stringify({
    changed: result.changed,
    employeeNumber: persisted.employee.employeeNumber,
    employeeEmail: persisted.employee.email,
    linkedUserEmail: persisted.user?.email || null,
  }, null, 2));
  console.log("PASS: Augustina employee and linked CHRIS user email are synchronized to tina.beerbarn@gmail.com.");
}

main()
  .catch((error) => {
    console.error("\nFAIL: ZERMATT Augustina email correction aborted.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
