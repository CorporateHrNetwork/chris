const STATUS_MAP = {
  Active: "ACTIVE",
  Probation: "PROBATION",
  Leave: "LEAVE",
  Suspended: "SUSPENDED",
  Terminated: "TERMINATED",
  Resigned: "RESIGNED",
  Retired: "RETIRED",
  Inactive: "INACTIVE",
};

const ERROR_DEFINITIONS = {
  EMPLOYEE_REQUIRED_FIELDS_MISSING: [
    400,
    "Please complete all required employee fields.",
  ],
  INVALID_EMPLOYEE_GENDER: [400, "Select a valid employee gender."],
  INVALID_EMPLOYEE_NAME: [
    400,
    "Please enter at least the employee's first and last name.",
  ],
  EMPLOYEE_EMAIL_ALREADY_EXISTS: [
    409,
    "An employee with this email address already exists.",
  ],
  INVALID_NIN: [400, "Enter a valid 11-digit Nigerian National Identification Number."],
  DUPLICATE_EMPLOYEE_NIN: [409, "This NIN is already assigned to another employee."],
  INVALID_EMPLOYEE_DEPARTMENT: [
    400,
    "Select an active department from your organization's CHRIS structure.",
  ],
  INVALID_EMPLOYEE_DESIGNATION: [
    400,
    "Select an active designation mapped to the selected department.",
  ],
  EMPLOYMENT_LEVEL_MAPPING_REQUIRED: [
    400,
    "Map the selected designation to an Employment Level before creating the employee.",
  ],
  INVALID_EMPLOYEE_LOCATION: [
    400,
    "Select an active work location from your organization's CHRIS location catalogue.",
  ],
  INVALID_EMPLOYEE_HIRE_DATE: [
    400,
    "Enter a valid Hire Date in YYYY-MM-DD format.",
  ],
  EMPLOYEE_NUMBER_SEQUENCE_EXHAUSTED: [
    409,
    "The current CHRIS employee number range has been exhausted. Extend the employee number format before creating another employee.",
  ],
};

function employeeCreationError(code) {
  const definition = ERROR_DEFINITIONS[code];
  const error = new Error(code);
  error.code = code;
  error.statusCode = definition?.[0] || 400;
  error.safeMessage = definition?.[1] || "Unable to create employee.";
  error.isEmployeeCreationError = true;
  return error;
}

function normalizeEmployeeName(value) {
  const nameParts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) return null;
  return {
    firstName: nameParts[0],
    middleName: nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : null,
    lastName: nameParts[nameParts.length - 1],
  };
}

function normalizeCreationPayload(input = {}) {
  const requiredValues = [
    input.name,
    input.departmentId,
    input.designationId,
    input.locationId,
    input.email,
    input.phone,
    input.gender,
  ];
  if (requiredValues.some((value) => !String(value || "").trim())) {
    throw employeeCreationError("EMPLOYEE_REQUIRED_FIELDS_MISSING");
  }

  const name = normalizeEmployeeName(input.name);
  const gender = String(input.gender).trim().toUpperCase();
  if (!["MALE", "FEMALE", "OTHER", "UNSPECIFIED"].includes(gender)) {
    throw employeeCreationError("INVALID_EMPLOYEE_GENDER");
  }
  if (!name) throw employeeCreationError("INVALID_EMPLOYEE_NAME");

  const hireDateValue = String(input.hireDate || "").trim();
  let hireDate = null;
  if (hireDateValue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDateValue)) {
      throw employeeCreationError("INVALID_EMPLOYEE_HIRE_DATE");
    }
    hireDate = new Date(`${hireDateValue}T00:00:00.000Z`);
    if (
      Number.isNaN(hireDate.getTime()) ||
      hireDate.toISOString().slice(0, 10) !== hireDateValue
    ) {
      throw employeeCreationError("INVALID_EMPLOYEE_HIRE_DATE");
    }
  }

  return {
    ...name,
    departmentId: String(input.departmentId).trim(),
    designationId: String(input.designationId).trim(),
    locationId: String(input.locationId).trim(),
    email: String(input.email).trim().toLowerCase(),
    phone: String(input.phone).trim(),
    gender,
    status: STATUS_MAP[input.status || "Active"] || "ACTIVE",
    hireDate,
    nationalIdentificationNumber: String(input.nationalIdentificationNumber || "").trim() || null,
  };
}

function loadDefaultDependencies() {
  return {
    prisma: require("../config/prisma"),
    resolveEmploymentLevelFromDesignation:
      require("./designationEmploymentLevelService")
        .resolveEmploymentLevelFromDesignation,
    provisionNewEmployeeEntitlements:
      require("./leaveEntitlementProvisioningService")
        .provisionNewEmployeeEntitlements,
    assertTenantNinAvailable:
      require("./employeeIdentityService").assertTenantNinAvailable,
  };
}

async function createEmployeeWithDependencies(
  { organizationId, actorUserId, input },
  dependencies
) {
  const {
    prisma,
    resolveEmploymentLevelFromDesignation,
    provisionNewEmployeeEntitlements,
    assertTenantNinAvailable,
  } = dependencies;
  const payload = normalizeCreationPayload(input);

  const duplicateEmail = await prisma.employee.findFirst({
    where: { organizationId, email: payload.email },
    select: { id: true, employeeNumber: true },
  });
  if (duplicateEmail) {
    throw employeeCreationError("EMPLOYEE_EMAIL_ALREADY_EXISTS");
  }

  let normalizedNin = null;
  if (payload.nationalIdentificationNumber) {
    try {
      normalizedNin = await assertTenantNinAvailable(prisma, {
        organizationId,
        employeeId: "__new_employee__",
        value: payload.nationalIdentificationNumber,
      });
    } catch (error) {
      throw employeeCreationError(error.code === "DUPLICATE_EMPLOYEE_NIN" ? "DUPLICATE_EMPLOYEE_NIN" : "INVALID_NIN");
    }
  }

  const department = await prisma.department.findFirst({
    where: { id: payload.departmentId, organizationId, isActive: true },
    select: { id: true, name: true, code: true, isActive: true },
  });
  if (!department) throw employeeCreationError("INVALID_EMPLOYEE_DEPARTMENT");

  const designation = await prisma.designation.findFirst({
    where: {
      id: payload.designationId,
      organizationId,
      departmentId: department.id,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      code: true,
      departmentId: true,
      careerLevel: true,
      isActive: true,
    },
  });
  if (!designation) throw employeeCreationError("INVALID_EMPLOYEE_DESIGNATION");

  try {
    await resolveEmploymentLevelFromDesignation({
      organizationId,
      designationId: designation.id,
    });
  } catch (error) {
    if (error.message === "EMPLOYMENT_LEVEL_MAPPING_REQUIRED") {
      throw employeeCreationError("EMPLOYMENT_LEVEL_MAPPING_REQUIRED");
    }
    throw error;
  }

  const location = await prisma.organizationLocation.findFirst({
    where: { id: payload.locationId, organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      city: true,
      state: true,
      country: true,
      isActive: true,
    },
  });
  if (!location) throw employeeCreationError("INVALID_EMPLOYEE_LOCATION");

  return prisma.$transaction(async (tx) => {
    const sequenceOwner = await tx.organization.update({
      where: { id: organizationId },
      data: { employeeNumberSequence: { increment: 1 } },
      select: { employeeNumberSequence: true },
    });
    const nextNumber = sequenceOwner.employeeNumberSequence;
    if (nextNumber > 999999) {
      throw employeeCreationError("EMPLOYEE_NUMBER_SEQUENCE_EXHAUSTED");
    }

    const employeeNumber = `CHR${String(nextNumber).padStart(6, "0")}`;
    const employee = await tx.employee.create({
      data: {
        organizationId,
        departmentId: department.id,
        designationId: designation.id,
        locationId: location.id,
        employeeNumber,
        firstName: payload.firstName,
        middleName: payload.middleName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        ...(normalizedNin ? { nationalIdentificationNumber: normalizedNin } : {}),
        gender: payload.gender,
        status: payload.status,
        ...(payload.hireDate ? { hireDate: payload.hireDate } : {}),
      },
      include: { department: true, designation: true, location: true },
    });

    await tx.employeeEmploymentEpisode.create({
      data: {
        organizationId,
        employeeId: employee.id,
        sequenceNumber: 1,
        startDate: payload.hireDate || employee.hireDate || employee.createdAt,
        startStatus: employee.status,
        startDepartmentId: employee.departmentId,
        startDesignationId: employee.designationId,
        startLocationId: employee.locationId,
        startReason: "Initial employment",
      },
    });

    await provisionNewEmployeeEntitlements({
      organizationId,
      employeeNumber: employee.employeeNumber,
      actorUserId,
      tx,
    });

    return employee;
  });
}

function createEmployee(args) {
  return createEmployeeWithDependencies(args, loadDefaultDependencies());
}

module.exports = {
  createEmployee,
  createEmployeeWithDependencies,
  normalizeCreationPayload,
};
