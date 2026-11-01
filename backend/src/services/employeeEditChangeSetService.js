const { normalizeEmploymentTypeForOrganization } = require("./employeeEmploymentAssignmentService");
const { assertTenantNinAvailable } = require("./employeeIdentityService");
const {
  getEmploymentLevelState,
  applyEmploymentLevelOverride,
  applyRemoveEmploymentLevelOverride,
} = require("./employeeEmploymentLevelAssignmentService");

const STATUS_VALUES = new Set([
  "ACTIVE", "PROBATION", "LEAVE", "SUSPENDED", "TERMINATED", "RESIGNED", "RETIRED", "INACTIVE",
]);

function changeSetError(code, message, statusCode = 400) {
  const error = new Error(message || code.replaceAll("_", " ").toLowerCase());
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) throw changeSetError("INVALID_EMPLOYEE_NAME", "Please enter at least a first and last name.");
  return { firstName: parts[0], middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : null, lastName: parts.at(-1) };
}

function sameDateValue(left, right) {
  const toDateOnly = (value) => value == null || value === "" ? null : new Date(value).toISOString().slice(0, 10);
  return toDateOnly(left) === toDateOnly(right);
}

async function saveEmployeeEditChangeSet(prisma, {
  organizationId,
  employeeNumber,
  actorUserId,
  activeLocationId,
  changes = {},
}) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { organizationId, employeeNumber: String(employeeNumber || "").trim().toUpperCase() },
      include: { department: true, designation: true, location: true, user: true },
    });
    if (!employee) throw changeSetError("EMPLOYEE_NOT_FOUND", "Employee not found.", 404);
    if (activeLocationId && employee.locationId !== activeLocationId) {
      throw changeSetError("EMPLOYEE_OUTSIDE_ACTIVE_BRANCH", "Employee is outside the active branch context.", 403);
    }

    const profile = changes.profile || {};
    const jobChange = changes.jobChange || null;
    const employmentTypeChange = changes.employmentType || null;
    const levelChange = changes.employmentLevel || null;
    const data = {};
    if (!employee.locationId && Object.keys(profile).length > 0 && !Object.hasOwn(profile, "locationId")) {
      throw changeSetError("INITIAL_EMPLOYEE_LOCATION_REQUIRED", "Select the employee's initial work location before saving.");
    }
    const beforeLevel = levelChange
      ? await getEmploymentLevelState(tx, { organizationId, employeeNumber: employee.employeeNumber })
      : null;

    if (Object.hasOwn(profile, "name")) {
      const nextName = normalizeName(profile.name);
      if (nextName.firstName !== employee.firstName || nextName.middleName !== employee.middleName || nextName.lastName !== employee.lastName) Object.assign(data, nextName);
    }
    if (Object.hasOwn(profile, "email")) {
      const email = String(profile.email || "").trim().toLowerCase();
      if (!email) throw changeSetError("EMAIL_REQUIRED", "Email address is required.");
      if (email !== String(employee.email || "").toLowerCase()) {
        const duplicate = await tx.employee.findFirst({ where: { organizationId, email, NOT: { id: employee.id } } });
        if (duplicate) throw changeSetError("DUPLICATE_EMAIL", "Another employee already uses this email address.", 409);
        data.email = email;
      }
    }
    if (Object.hasOwn(profile, "phone")) {
      const phone = String(profile.phone || "").trim();
      if (!phone) throw changeSetError("PHONE_REQUIRED", "Phone number is required.");
      if (phone !== employee.phone) data.phone = phone;
    }
    if (Object.hasOwn(profile, "gender")) {
      const gender = String(profile.gender || "UNSPECIFIED").trim().toUpperCase();
      if (!["MALE", "FEMALE", "OTHER", "UNSPECIFIED"].includes(gender)) throw changeSetError("INVALID_GENDER", "Select a valid gender.");
      if (gender !== employee.gender) data.gender = gender;
    }
    if (Object.hasOwn(profile, "status")) {
      const status = String(profile.status || "").trim().toUpperCase();
      if (!STATUS_VALUES.has(status)) throw changeSetError("INVALID_EMPLOYEE_STATUS", "Select a valid employee status.");
      if (status !== employee.status) data.status = status;
    }
    for (const field of ["hireDate", "confirmationDate", "exitDate"]) {
      if (Object.hasOwn(profile, field)) {
        const current = employee[field] ? new Date(employee[field]) : null;
        const next = profile[field] ? new Date(profile[field]) : null;
        if (next && Number.isNaN(next.getTime())) throw changeSetError("INVALID_EMPLOYEE_DATE", `Select a valid ${field}.`);
        if (!sameDateValue(current, next)) data[field] = next;
      }
    }
    if (Object.hasOwn(profile, "nationalIdentificationNumber")) {
      const value = await assertTenantNinAvailable(tx, {
        organizationId,
        employeeId: employee.id,
        value: profile.nationalIdentificationNumber,
      });
      if (value !== employee.nationalIdentificationNumber) data.nationalIdentificationNumber = value;
    }
    if (Object.hasOwn(profile, "locationId")) {
      const targetLocationId = String(profile.locationId || "").trim() || null;
      if (employee.locationId && targetLocationId && targetLocationId !== employee.locationId) {
        throw changeSetError("LOCATION_CHANGE_REQUIRES_TRANSFER", "Use Transfer Employee to move this employee to another work location.", 409);
      }
      if (!employee.locationId && targetLocationId) {
        const location = await tx.organizationLocation.findFirst({ where: { id: targetLocationId, organizationId, isActive: true }, select: { id: true } });
        if (!location) throw changeSetError("INVALID_EMPLOYEE_LOCATION", "Select an active work location from the organization catalogue.");
        data.locationId = location.id;
      } else if (!employee.locationId && !targetLocationId) {
        throw changeSetError("INITIAL_EMPLOYEE_LOCATION_REQUIRED", "Select the employee's initial work location before saving.");
      }
    }

    let targetDepartment = null;
    let targetDesignation = null;
    let jobChanged = false;
    if (jobChange) {
      const departmentId = String(jobChange.departmentId || "").trim();
      const designationId = String(jobChange.designationId || "").trim();
      jobChanged = departmentId !== employee.departmentId || designationId !== employee.designationId;
      if (jobChanged) {
        if (employee.status === "EXITED") throw changeSetError("EMPLOYEE_EXITED", "A job change cannot be processed for an exited employee.", 409);
        if (!jobChange.effectiveDate || !String(jobChange.effectiveDate).trim()) throw changeSetError("EFFECTIVE_DATE_REQUIRED", "A Job Change effective date is required.");
        const effectiveDate = new Date(jobChange.effectiveDate);
        if (Number.isNaN(effectiveDate.getTime())) throw changeSetError("INVALID_EFFECTIVE_DATE", "The supplied Job Change effective date is invalid.");
        const reason = String(jobChange.reason || "").trim();
        if (!reason) throw changeSetError("JOB_CHANGE_REASON_REQUIRED", "A reason is required for a Job Change.");
        targetDesignation = await tx.designation.findFirst({ where: { id: designationId, organizationId }, include: { department: true, employmentLevel: true, departmentEligibility: { select: { departmentId: true } } } });
        if (!targetDesignation || targetDesignation.isActive === false) throw changeSetError("DESIGNATION_NOT_FOUND", "Select an active designation in this organization.", 404);
        const eligibleDepartmentIds = new Set([
          targetDesignation.departmentId,
          ...(targetDesignation.departmentEligibility || []).map((item) => item.departmentId),
        ].filter(Boolean));
        if (!eligibleDepartmentIds.has(departmentId)) throw changeSetError("DEPARTMENT_DESIGNATION_MISMATCH", "The selected designation must be mapped to or eligible for the selected department.", 409);
        targetDepartment = await tx.department.findFirst({ where: { id: departmentId, organizationId } });
        if (!targetDepartment) throw changeSetError("DEPARTMENT_NOT_FOUND", "The selected department does not exist in this organization.", 404);
        if (targetDesignation.careerLevel == null || !targetDesignation.employmentLevel?.isActive) throw changeSetError("EMPLOYMENT_LEVEL_MAPPING_REQUIRED", "The selected designation must have an active Employment Level before the Job Change can proceed.");
        data.departmentId = targetDepartment.id;
        data.designationId = targetDesignation.id;
      }
    }

    let normalizedEmploymentType = employee.employmentType;
    let employmentTypeChanged = false;
    if (employmentTypeChange) {
      const inputType = String(employmentTypeChange.employmentType || "").trim();
      const reason = String(employmentTypeChange.reason || "").trim();
      if (!inputType) throw changeSetError("EMPLOYMENT_TYPE_REQUIRED", "Select the employee's Employment Type.");
      if (!reason) throw changeSetError("EMPLOYMENT_TYPE_CHANGE_REASON_REQUIRED", "Enter a reason for the Employment Type change.");
      const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { slug: true } });
      normalizedEmploymentType = normalizeEmploymentTypeForOrganization(inputType, organization?.slug);
      if (!normalizedEmploymentType) throw changeSetError("INVALID_EMPLOYMENT_TYPE", "Employment Type is not in the organization's authoritative catalogue.");
      employmentTypeChanged = normalizedEmploymentType !== employee.employmentType;
      if (employmentTypeChanged) data.employmentType = normalizedEmploymentType;
    }

    const hasEmployeeUpdate = Object.keys(data).length > 0;
    let updatedEmployee = employee;
    if (hasEmployeeUpdate) {
      updatedEmployee = await tx.employee.update({
        where: { id: employee.id },
        data,
        include: { department: true, designation: true, location: true, user: { select: { id: true, isActive: true } } },
      });
      if (employee.user && (data.firstName || data.lastName || data.email)) {
        await tx.user.update({
          where: { id: employee.user.id },
          data: {
            ...(data.firstName ? { firstName: data.firstName } : {}),
            ...(data.lastName ? { lastName: data.lastName } : {}),
            ...(data.email ? { email: data.email } : {}),
          },
        });
      }
    }

    if (jobChanged) {
      await tx.employeeLifecycleEvent.create({
        data: {
          organizationId,
          employeeId: employee.id,
          eventType: "JOB_CHANGED",
          effectiveDate: new Date(jobChange.effectiveDate),
          previousStatus: employee.status,
          newStatus: employee.status,
          fromLocationId: employee.locationId,
          toLocationId: employee.locationId,
          previousDepartmentId: employee.departmentId,
          newDepartmentId: targetDepartment.id,
          previousDesignationId: employee.designationId,
          newDesignationId: targetDesignation.id,
          reason: String(jobChange.reason).trim(),
          notes: String(jobChange.notes || "").trim() || null,
          performedByUserId: actorUserId || null,
        },
      });
    }

    if (employmentTypeChanged) {
      await tx.organizationAudit.create({
        data: {
          organizationId,
          actorUserId: actorUserId || null,
          entityType: "Employee",
          entityId: employee.id,
          action: "EMPLOYMENT_ASSIGNMENT_UPDATED",
          previousValue: { employmentType: employee.employmentType },
          newValue: { employmentType: normalizedEmploymentType },
          reason: `Employment Type change: ${String(employmentTypeChange.reason).trim()}`,
        },
      });
    }

    let employmentLevel = beforeLevel;
    if (levelChange) {
      const levelNumber = Number(levelChange.levelNumber);
      const resetToDefault = levelChange.useDesignationDefault === true;
      const levelActuallyChanged = resetToDefault
        ? Boolean(beforeLevel.currentOverride)
        : Number.isInteger(levelNumber) && levelNumber !== Number(beforeLevel.effective.levelNumber);
      if (levelActuallyChanged) {
        const effectiveFrom = new Date(levelChange.effectiveFrom);
        if (!levelChange.effectiveFrom || Number.isNaN(effectiveFrom.getTime())) throw changeSetError("INVALID_EFFECTIVE_DATE", "Select a valid Employment Level effective date.");
        const reason = String(levelChange.reason || "").trim();
        if (!reason) throw changeSetError("EMPLOYMENT_LEVEL_REASON_REQUIRED", "Enter a reason for the Employment Level change.");
        if (resetToDefault) {
          employmentLevel = await applyRemoveEmploymentLevelOverride(tx, {
            organizationId, employeeNumber: employee.employeeNumber, effectiveTo: effectiveFrom,
            reason, notes: levelChange.notes, performedByUserId: actorUserId || null,
          });
        } else {
          if (!Number.isInteger(levelNumber)) throw changeSetError("INVALID_EMPLOYMENT_LEVEL", "Select a valid Employment Level.");
          employmentLevel = await applyEmploymentLevelOverride(tx, {
            organizationId, employeeNumber: employee.employeeNumber, levelNumber, effectiveFrom,
            reason, notes: levelChange.notes, performedByUserId: actorUserId || null,
          });
        }
      }
    }

    return {
      employee: updatedEmployee,
      employmentLevel,
      changed: hasEmployeeUpdate || jobChanged || employmentTypeChanged || employmentLevel !== beforeLevel,
      changes: { profile: hasEmployeeUpdate, jobChange: jobChanged, employmentType: employmentTypeChanged, employmentLevel: employmentLevel !== beforeLevel },
    };
  }, { isolationLevel: "Serializable" });
}

module.exports = { saveEmployeeEditChangeSet };
