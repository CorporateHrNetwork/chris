require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../src/config/prisma");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const ACTOR_EMAIL = "corporatehr.crn@gmail.com";
const ROLE_NAME = "HR & Admin Officer - Branch";
const ROLE_ALIASES = [ROLE_NAME, "Branch HR & Admin Officer"];
const APPLY = process.argv.includes("--apply");
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

const ASSIGNMENTS = [
  { fullName: "Ann Favour Joseph", branchCode: "ABJ", branchName: "ABUJA BRANCH" },
  { fullName: "Angel Williams", branchCode: "PHC", branchName: "PHC BRANCH" },
  { fullName: "Augustina Anienwe", branchCode: "LAG", branchName: "LAGOS BRANCH" },
];

// Branch HR can operate the HR lifecycle for the assigned branch, see branch
// payroll/loan information and export branch reports. Deliberately excluded:
// company-wide payroll processing/configuration, loan verification/approval/
// disbursement, user/role/settings administration and other Head Office controls.
const ROLE_PERMISSION_KEYS = [
  "dashboard.view",
  "employees.view",
  "employees.create",
  "employees.update",
  "recruitment.view",
  "recruitment.manage",
  "attendance.view",
  "attendance.manage",
  "leave.view",
  "leave.request",
  "leave.manage",
  "payroll.view",
  "payslips.view",
  "payslips.download",
  "loans.view",
  "loans.request",
  "performance.view",
  "performance.manage",
  "training.view",
  "training.manage",
  "reports.view",
  "reports.export",
];

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
}

function randomTemporaryPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

async function resolveFoundation() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, status: true, slug: true },
  });
  assert.ok(organization, "ZERMATT organization was not found.");
  assert.equal(organization.status, "ACTIVE", "ZERMATT organization must be ACTIVE.");

  const actor = await prisma.user.findFirst({
    where: { organizationId: organization.id, email: ACTOR_EMAIL, isActive: true },
    select: { id: true, email: true, locationScope: true },
  });
  assert.ok(actor, `Active CHRIS Administrator ${ACTOR_EMAIL} was not found.`);
  assert.equal(actor.locationScope, "ALL_LOCATIONS", "Provisioning actor must retain ALL_LOCATIONS scope.");

  const locations = await prisma.organizationLocation.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: { id: true, name: true, code: true, type: true },
  });
  const branchByCode = new Map(locations.map((location) => [String(location.code || "").toUpperCase(), location]));
  for (const assignment of ASSIGNMENTS) {
    const location = branchByCode.get(assignment.branchCode);
    assert.ok(location, `Active ZERMATT branch ${assignment.branchCode} was not found.`);
    assert.equal(location.type, "BRANCH", `${assignment.branchCode} must be a BRANCH location.`);
  }

  const permissions = await prisma.permission.findMany({
    where: { key: { in: ROLE_PERMISSION_KEYS } },
    select: { id: true, key: true },
  });
  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission]));
  const missingPermissions = ROLE_PERMISSION_KEYS.filter((key) => !permissionByKey.has(key));
  assert.deepEqual(missingPermissions, [], `Missing CHRIS permissions: ${missingPermissions.join(", ")}`);

  const existingRoles = await prisma.role.findMany({
    where: { organizationId: organization.id, name: { in: ROLE_ALIASES } },
    select: {
      id: true,
      name: true,
      description: true,
      userRoles: {
        select: {
          user: {
            select: {
              id: true,
              employeeId: true,
              email: true,
              isActive: true,
              locationScope: true,
            },
          },
        },
      },
      rolePermissions: { select: { permission: { select: { key: true } } } },
    },
  });
  assert.ok(
    existingRoles.length <= 1,
    `Both Branch HR role aliases exist (${existingRoles.map((role) => role.name).join(", ")}). Merge them manually before provisioning.`
  );

  return {
    organization,
    actor,
    branchByCode,
    permissionByKey,
    existingRole: existingRoles[0] || null,
  };
}

async function resolveTargets(organization, branchByCode) {
  const rows = await prisma.employee.findMany({
    where: { organizationId: organization.id, status: { in: CURRENT_STATUSES } },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      email: true,
      status: true,
      locationId: true,
      location: { select: { id: true, name: true, code: true, type: true } },
      designation: { select: { id: true, code: true, name: true } },
      user: {
        select: {
          id: true,
          email: true,
          isActive: true,
          locationScope: true,
          userLocations: { select: { location: { select: { id: true, code: true, name: true } } } },
          userRoles: { select: { role: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { employeeNumber: "asc" },
  });

  return ASSIGNMENTS.map((assignment) => {
    const expectedLocation = branchByCode.get(assignment.branchCode);
    const matches = rows.filter(
      (employee) =>
        employee.locationId === expectedLocation.id &&
        normalizeName(employeeName(employee)) === normalizeName(assignment.fullName)
    );
    assert.equal(
      matches.length,
      1,
      `${assignment.fullName} must resolve to exactly one current employee in ${assignment.branchName}; found ${matches.length}.`
    );
    const employee = matches[0];
    assert.ok(employee.email?.trim(), `${assignment.fullName} does not have an employee email address.`);
    assert.equal(String(employee.location?.code || "").toUpperCase(), assignment.branchCode, `${assignment.fullName} is not assigned to ${assignment.branchCode}.`);

    const allowedExistingRoles = new Set(["Employee", ...ROLE_ALIASES]);
    const privilegedExistingRoles = (employee.user?.userRoles || [])
      .map((item) => item.role?.name)
      .filter((name) => name && !allowedExistingRoles.has(name));
    assert.deepEqual(
      privilegedExistingRoles,
      [],
      `${assignment.fullName} already has other CHRIS role(s): ${privilegedExistingRoles.join(", ")}. Review manually before replacing access.`
    );

    return { assignment, employee, location: expectedLocation };
  });
}

function assertExistingRoleUsageIsSafe(existingRole, targets) {
  if (!existingRole) return;
  const targetEmployeeIds = new Set(targets.map((target) => target.employee.id));
  const unrelatedUsers = (existingRole.userRoles || [])
    .map((item) => item.user)
    .filter((user) => user && (!user.employeeId || !targetEmployeeIds.has(user.employeeId)));
  assert.deepEqual(
    unrelatedUsers.map((user) => ({ email: user.email, employeeId: user.employeeId })),
    [],
    `${existingRole.name} is assigned to CHRIS users outside the three approved branch HR targets. Review those users before changing this shared role.`
  );
}

function previewTarget(target) {
  const user = target.employee.user;
  return {
    employeeNumber: target.employee.employeeNumber,
    employeeName: employeeName(target.employee),
    designation: target.employee.designation?.name || null,
    email: target.employee.email,
    branch: `${target.location.name} · ${target.location.code}`,
    existingUser: Boolean(user),
    existingUserActive: user?.isActive ?? null,
    existingLocationScope: user?.locationScope || null,
    existingAssignedBranches: (user?.userLocations || []).map((item) => item.location?.code).filter(Boolean),
    existingRoles: (user?.userRoles || []).map((item) => item.role?.name).filter(Boolean),
    targetRole: ROLE_NAME,
    targetLocationScope: "ASSIGNED_LOCATIONS",
    targetAssignedBranch: target.location.code,
  };
}

function rolePreview(existingRole) {
  if (!existingRole) {
    return { existingRole: false, targetRoleName: ROLE_NAME, currentUserCount: 0, currentPermissions: [] };
  }
  return {
    existingRole: true,
    existingRoleName: existingRole.name,
    targetRoleName: existingRole.name,
    currentUserCount: existingRole.userRoles.length,
    currentPermissions: existingRole.rolePermissions.map((item) => item.permission.key).sort(),
  };
}

async function applyProvisioning({ organization, actor, permissionByKey, existingRole }, targets) {
  const generatedCredentials = [];

  const result = await prisma.$transaction(async (tx) => {
    let role = existingRole
      ? await tx.role.findUnique({ where: { id: existingRole.id }, select: { id: true, name: true, description: true } })
      : null;

    if (!role) {
      role = await tx.role.create({
        data: {
          organizationId: organization.id,
          name: ROLE_NAME,
          description: "Branch-restricted HR & Administration operational access. No Head Office payroll processing, loan approval/disbursement, user/role/settings administration or organization-wide configuration authority.",
          isSystemRole: false,
        },
        select: { id: true, name: true, description: true },
      });
    } else {
      await tx.role.update({
        where: { id: role.id },
        data: {
          description: "Branch-restricted HR & Administration operational access. No Head Office payroll processing, loan approval/disbursement, user/role/settings administration or organization-wide configuration authority.",
        },
      });
    }

    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({
      data: ROLE_PERMISSION_KEYS.map((key) => ({ roleId: role.id, permissionId: permissionByKey.get(key).id })),
    });

    const provisioned = [];
    for (const target of targets) {
      const employee = target.employee;
      const normalizedEmail = employee.email.trim().toLowerCase();
      let user = employee.user;
      let temporaryPassword = null;

      if (!user) {
        const emailCollision = await tx.user.findFirst({
          where: { organizationId: organization.id, email: normalizedEmail },
          select: { id: true, employeeId: true, email: true },
        });
        assert.ok(!emailCollision, `${employeeName(employee)} email is already used by another CHRIS account.`);
        temporaryPassword = randomTemporaryPassword();
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        user = await tx.user.create({
          data: {
            organizationId: organization.id,
            employeeId: employee.id,
            email: normalizedEmail,
            firstName: employee.firstName,
            lastName: employee.lastName,
            passwordHash,
            isActive: true,
            locationScope: "ASSIGNED_LOCATIONS",
          },
          select: { id: true, email: true, isActive: true, locationScope: true },
        });
        generatedCredentials.push({
          employeeNumber: employee.employeeNumber,
          employeeName: employeeName(employee),
          email: normalizedEmail,
          temporaryPassword,
        });
      } else {
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            employeeId: employee.id,
            email: normalizedEmail,
            firstName: employee.firstName,
            lastName: employee.lastName,
            isActive: true,
            locationScope: "ASSIGNED_LOCATIONS",
          },
          select: { id: true, email: true, isActive: true, locationScope: true },
        });
      }

      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      await tx.userLocation.deleteMany({ where: { userId: user.id } });
      await tx.userLocation.create({
        data: { organizationId: organization.id, userId: user.id, locationId: target.location.id },
      });

      await tx.organizationAudit.create({
        data: {
          organizationId: organization.id,
          actorUserId: actor.id,
          entityType: "User",
          entityId: user.id,
          action: "ZERMATT_BRANCH_HR_ACCESS_PROVISIONED",
          previousValue: {
            employeeNumber: employee.employeeNumber,
            existingUser: Boolean(employee.user),
            locationScope: employee.user?.locationScope || null,
            assignedBranches: (employee.user?.userLocations || []).map((item) => item.location?.code).filter(Boolean),
            roles: (employee.user?.userRoles || []).map((item) => item.role?.name).filter(Boolean),
          },
          newValue: {
            employeeNumber: employee.employeeNumber,
            role: role.name,
            locationScope: "ASSIGNED_LOCATIONS",
            assignedBranch: target.location.code,
            isActive: true,
          },
          reason: "Management-approved branch HR & Administration access",
        },
      });

      provisioned.push({
        employeeNumber: employee.employeeNumber,
        employeeName: employeeName(employee),
        email: normalizedEmail,
        branch: target.location.code,
        role: role.name,
        locationScope: "ASSIGNED_LOCATIONS",
        accountCreated: !employee.user,
        isActive: true,
      });
    }

    await tx.organizationAudit.create({
      data: {
        organizationId: organization.id,
        actorUserId: actor.id,
        entityType: "Role",
        entityId: role.id,
        action: "ZERMATT_BRANCH_HR_ROLE_CONFIGURED",
        previousValue: existingRole
          ? {
              name: existingRole.name,
              permissions: existingRole.rolePermissions.map((item) => item.permission.key).sort(),
            }
          : null,
        newValue: { role: role.name, permissions: ROLE_PERMISSION_KEYS },
        reason: "Controlled least-privilege branch HR operating role",
      },
    });

    return { role, provisioned };
  });

  return { ...result, generatedCredentials };
}

async function verifyPersisted(organizationId, targets, expectedRoleName) {
  const rows = [];
  for (const target of targets) {
    const user = await prisma.user.findFirst({
      where: { organizationId, employeeId: target.employee.id },
      select: {
        id: true,
        email: true,
        isActive: true,
        locationScope: true,
        userRoles: { select: { role: { select: { name: true } } } },
        userLocations: { select: { location: { select: { code: true, name: true } } } },
      },
    });
    assert.ok(user, `${employeeName(target.employee)} CHRIS user was not persisted.`);
    assert.equal(user.isActive, true, `${employeeName(target.employee)} CHRIS user must be active.`);
    assert.equal(user.locationScope, "ASSIGNED_LOCATIONS", `${employeeName(target.employee)} must be branch restricted.`);
    assert.deepEqual(user.userRoles.map((item) => item.role.name), [expectedRoleName], `${employeeName(target.employee)} role mismatch.`);
    assert.deepEqual(user.userLocations.map((item) => item.location.code), [target.location.code], `${employeeName(target.employee)} branch assignment mismatch.`);
    rows.push({
      employeeNumber: target.employee.employeeNumber,
      employeeName: employeeName(target.employee),
      email: user.email,
      branch: target.location.code,
      role: expectedRoleName,
      locationScope: user.locationScope,
      isActive: user.isActive,
    });
  }
  return rows;
}

async function main() {
  const foundation = await resolveFoundation();
  const targets = await resolveTargets(foundation.organization, foundation.branchByCode);
  assertExistingRoleUsageIsSafe(foundation.existingRole, targets);

  console.log("\n============================================================");
  console.log("ZERMATT BRANCH HR & ADMIN ACCESS");
  console.log("============================================================");
  console.log(JSON.stringify({
    mode: APPLY ? "APPLY" : "PREVIEW_ONLY",
    organization: foundation.organization.name,
    actor: foundation.actor.email,
    role: rolePreview(foundation.existingRole),
    permissionCount: ROLE_PERMISSION_KEYS.length,
    targets: targets.map(previewTarget),
    plannedDatabaseWrites: APPLY ? "CONTROLLED_TRANSACTION" : 0,
  }, null, 2));

  if (!APPLY) {
    console.log("PREVIEW PASS: no database writes performed.");
    console.log("Run again with --apply only after reviewing the three resolved employees and branches.");
    return;
  }

  const applied = await applyProvisioning(foundation, targets);
  const verification = await verifyPersisted(foundation.organization.id, targets, applied.role.name);

  console.log("\nAPPLIED AND VERIFIED");
  console.log(JSON.stringify({
    role: applied.role.name,
    provisioned: verification,
    generatedCredentials: applied.generatedCredentials,
  }, null, 2));
  console.log("PASS: ZERMATT Branch HR & Admin access provisioned and verified.");
  console.log("Temporary passwords are shown only for newly created accounts. Share them securely and have each user change/reset the password immediately.");
}

main()
  .catch((error) => {
    console.error("\nFAIL: ZERMATT Branch HR & Admin access provisioning aborted.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
