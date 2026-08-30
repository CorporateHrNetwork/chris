function normalizeNin(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}

async function assertTenantNinAvailable(db, {
  organizationId,
  employeeId = null,
  value,
}) {
  const normalizedNin = normalizeNin(value);

  if (!normalizedNin) {
    return null;
  }

  if (normalizedNin.length !== 11) {
    const error = new Error(
      "Enter a valid 11-digit Nigerian National Identification Number."
    );
    error.code = "INVALID_NIN";
    throw error;
  }

  const where = {
    organizationId,
    nationalIdentificationNumber: normalizedNin,
  };

  if (employeeId) {
    where.NOT = { id: employeeId };
  }

  const existingEmployee = await db.employee.findFirst({
    where,
    select: { id: true },
  });

  if (existingEmployee) {
    const error = new Error(
      "This NIN is already assigned to another employee."
    );
    error.code = "DUPLICATE_EMPLOYEE_NIN";
    throw error;
  }

  if (db.employeeOnboarding?.findMany) {
    const legacyRecords = await db.employeeOnboarding.findMany({
      where: {
        organizationId,
        ...(employeeId ? { employeeId: { not: employeeId } } : {}),
      },
      select: {
        employeeId: true,
        sectionData: true,
      },
    });

    const legacyDuplicate = legacyRecords.some((record) => {
      const personal =
        record.sectionData?.["personal-details"] || {};

      return (
        String(personal.idType || "").trim().toUpperCase() === "NIN" &&
        normalizeNin(personal.idNumber) === normalizedNin
      );
    });

    if (legacyDuplicate) {
      const error = new Error(
        "This NIN is already assigned to another employee."
      );
      error.code = "DUPLICATE_EMPLOYEE_NIN";
      throw error;
    }
  }

  return normalizedNin;
}

module.exports = {
  normalizeNin,
  assertTenantNinAvailable,
};
