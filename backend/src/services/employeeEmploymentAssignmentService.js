const XLSX = require("xlsx");
const {
  EMPLOYMENT_TYPES,
  normalizeEmploymentType,
} = require("./employeeCreationService");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const ZERMATT_EMPLOYMENT_TYPES = [
  "Full-Time",
  "Part-time",
  "Expatriate",
  "NYSC/Internship",
];

const ZERMATT_EMPLOYMENT_TYPE_ALIASES = new Map([
  ["full-time", "Full-Time"],
  ["full time", "Full-Time"],
  ["full-time-employment", "Full-Time"],
  ["full time employment", "Full-Time"],
  ["part-time", "Part-time"],
  ["part time", "Part-time"],
  ["part-time-employment", "Part-time"],
  ["part time employment", "Part-time"],
  ["expatriate", "Expatriate"],
  ["nysc/internship", "NYSC/Internship"],
  ["nysc / internship", "NYSC/Internship"],
  ["nysc internship", "NYSC/Internship"],
  ["internship", "NYSC/Internship"],
]);

const ASSIGNMENT_HEADERS = [
  "Employee No",
  "Employment Type",
  "Cost Centre / Operating Unit",
  "Reason",
];

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeHeader(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCell(row, aliases) {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const match = entries.find(([key]) => normalizeHeader(key) === normalizedAlias);
    if (match) return normalizeText(match[1]);
  }
  return "";
}

function normalizeZermattEmploymentType(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  return ZERMATT_EMPLOYMENT_TYPE_ALIASES.get(raw.toLowerCase()) || null;
}

function normalizeEmploymentTypeForOrganization(value, organizationSlug) {
  if (organizationSlug === ZERMATT_SLUG) {
    return normalizeZermattEmploymentType(value);
  }
  return normalizeEmploymentType(value);
}

function employmentTypesForOrganization(organizationSlug) {
  return organizationSlug === ZERMATT_SLUG
    ? ZERMATT_EMPLOYMENT_TYPES
    : EMPLOYMENT_TYPES;
}

function findCatalogRow(rows, value) {
  const needle = normalizeText(value).toLowerCase();
  if (!needle) return null;
  return (
    rows.find((row) => String(row.id || "").toLowerCase() === needle) ||
    rows.find((row) => normalizeText(row.code).toLowerCase() === needle) ||
    rows.find((row) => normalizeText(row.name).toLowerCase() === needle) ||
    null
  );
}

async function getOrganization(prisma, organizationId) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) {
    const error = new Error("Organization not found.");
    error.code = "ORGANIZATION_NOT_FOUND";
    throw error;
  }
  return organization;
}

async function listActiveCostCentres(prisma, organizationId) {
  const now = new Date();
  return prisma.costCentre.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      status: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });
}

async function listAssignmentCatalog(prisma, organizationId) {
  const [organization, costCentres] = await Promise.all([
    getOrganization(prisma, organizationId),
    listActiveCostCentres(prisma, organizationId),
  ]);
  return {
    organization,
    employmentTypes: employmentTypesForOrganization(organization.slug),
    costCentres,
  };
}

function buildAssignmentTemplateWorkbook({ employmentTypes = ZERMATT_EMPLOYMENT_TYPES } = {}) {
  const workbook = XLSX.utils.book_new();
  const instructions = [
    ["CHRiS Existing Employee Employment Assignment"],
    ["Use Employee No as the authoritative employee identifier."],
    ["Complete Employment Type, Cost Centre / Operating Unit, or both."],
    [`Employment Type values: ${employmentTypes.join(", ")}.`],
    ["Cost Centre may use the active CHRiS Cost Centre name or code."],
    ["Rows are validated before any assignment is applied."],
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(instructions),
    "Instructions"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ASSIGNMENT_HEADERS,
      ["ZLL000001", employmentTypes[0] || "", "BB Takeaway", "Master-data assignment"],
    ]),
    "Employee Assignments"
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function parseAssignmentWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName =
    workbook.SheetNames.find(
      (name) => normalizeText(name).toLowerCase() === "employee assignments"
    ) || workbook.SheetNames[0];
  if (!sheetName) {
    const error = new Error("The workbook does not contain a worksheet.");
    error.code = "EMPTY_WORKBOOK";
    throw error;
  }
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });
}

async function prepareAssignmentRows(prisma, { organizationId, buffer }) {
  const [organization, costCentres, employees] = await Promise.all([
    getOrganization(prisma, organizationId),
    listActiveCostCentres(prisma, organizationId),
    prisma.employee.findMany({
      where: { organizationId },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employmentType: true,
        costCentreId: true,
        costCentre: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  const employeeByNumber = new Map(
    employees.map((employee) => [String(employee.employeeNumber || "").toUpperCase(), employee])
  );

  return parseAssignmentWorkbook(buffer).map((row, index) => {
    const rowNumber = index + 2;
    const employeeNumber = getCell(row, ["Employee No", "Employee Number", "Employee ID"])
      .toUpperCase();
    const employmentTypeInput = getCell(row, ["Employment Type", "EmploymentType"]);
    const costCentreInput = getCell(row, [
      "Cost Centre / Operating Unit",
      "Cost Centre",
      "Cost Center",
      "Operating Unit",
      "Cost Centre Code",
    ]);
    const reason = getCell(row, ["Reason", "Notes"]);
    const employee = employeeByNumber.get(employeeNumber) || null;
    const employmentType = employmentTypeInput
      ? normalizeEmploymentTypeForOrganization(employmentTypeInput, organization.slug)
      : null;
    const costCentre = costCentreInput ? findCatalogRow(costCentres, costCentreInput) : null;
    const errors = [];

    if (!employeeNumber) errors.push("Employee No is required.");
    if (employeeNumber && !employee) errors.push("Employee No was not found in this organization.");
    if (!employmentTypeInput && !costCentreInput) {
      errors.push("Provide Employment Type, Cost Centre / Operating Unit, or both.");
    }
    if (employmentTypeInput && !employmentType) {
      errors.push("Employment Type is not in the organization's authoritative catalogue.");
    }
    if (costCentreInput && !costCentre) {
      errors.push("Cost Centre / Operating Unit was not found in the active CHRiS catalogue.");
    }

    return {
      rowNumber,
      valid: errors.length === 0,
      errors,
      input:
        errors.length === 0
          ? {
              employeeNumber,
              employmentType,
              costCentreId: costCentre?.id || null,
              reason,
            }
          : null,
      display: {
        employeeNumber,
        employeeName: employee
          ? [employee.firstName, employee.middleName, employee.lastName]
              .filter(Boolean)
              .join(" ")
          : "",
        currentEmploymentType: employee?.employmentType || null,
        newEmploymentType: employmentType || null,
        currentCostCentre: employee?.costCentre?.name || null,
        newCostCentre: costCentre?.name || null,
      },
    };
  });
}

async function assignEmployee(
  prisma,
  {
    organizationId,
    actorUserId,
    employeeNumber,
    employmentType: employmentTypeInput,
    costCentreId,
    costCentre: costCentreInput,
    reason,
  }
) {
  const [organization, employee, costCentres] = await Promise.all([
    getOrganization(prisma, organizationId),
    prisma.employee.findFirst({
      where: { organizationId, employeeNumber: normalizeText(employeeNumber).toUpperCase() },
      select: {
        id: true,
        employeeNumber: true,
        employmentType: true,
        costCentreId: true,
      },
    }),
    listActiveCostCentres(prisma, organizationId),
  ]);

  if (!employee) {
    const error = new Error("Employee not found in this organization.");
    error.code = "EMPLOYEE_NOT_FOUND";
    throw error;
  }

  const hasEmploymentType = normalizeText(employmentTypeInput) !== "";
  const costCentreValue = normalizeText(costCentreId || costCentreInput);
  const hasCostCentre = costCentreValue !== "";
  if (!hasEmploymentType && !hasCostCentre) {
    const error = new Error("Provide Employment Type, Cost Centre / Operating Unit, or both.");
    error.code = "ASSIGNMENT_REQUIRED";
    throw error;
  }

  const employmentType = hasEmploymentType
    ? normalizeEmploymentTypeForOrganization(employmentTypeInput, organization.slug)
    : employee.employmentType;
  if (hasEmploymentType && !employmentType) {
    const error = new Error("Employment Type is not in the organization's authoritative catalogue.");
    error.code = "INVALID_EMPLOYMENT_TYPE";
    throw error;
  }

  const costCentre = hasCostCentre ? findCatalogRow(costCentres, costCentreValue) : null;
  if (hasCostCentre && !costCentre) {
    const error = new Error("Cost Centre / Operating Unit was not found in the active CHRiS catalogue.");
    error.code = "INVALID_COST_CENTRE";
    throw error;
  }

  const nextCostCentreId = hasCostCentre ? costCentre.id : employee.costCentreId;
  const changed =
    employmentType !== employee.employmentType || nextCostCentreId !== employee.costCentreId;

  if (!changed) {
    return {
      employeeNumber: employee.employeeNumber,
      employmentType: employee.employmentType,
      costCentreId: employee.costCentreId,
      changed: false,
    };
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({
      where: { id: employee.id },
      data: {
        employmentType,
        costCentreId: nextCostCentreId,
      },
      select: {
        id: true,
        employeeNumber: true,
        employmentType: true,
        costCentreId: true,
        costCentre: { select: { id: true, code: true, name: true } },
      },
    });

    await tx.organizationAudit.create({
      data: {
        organizationId,
        actorUserId: actorUserId || null,
        entityType: "Employee",
        entityId: employee.id,
        action: "EMPLOYMENT_ASSIGNMENT_UPDATED",
        previousValue: {
          employmentType: employee.employmentType,
          costCentreId: employee.costCentreId,
        },
        newValue: {
          employmentType: updated.employmentType,
          costCentreId: updated.costCentreId,
        },
        reason: normalizeText(reason) || "Employment Type / Cost Centre assignment",
      },
    });

    return { ...updated, changed: true };
  });
}

module.exports = {
  ZERMATT_SLUG,
  ZERMATT_EMPLOYMENT_TYPES,
  ASSIGNMENT_HEADERS,
  normalizeZermattEmploymentType,
  normalizeEmploymentTypeForOrganization,
  employmentTypesForOrganization,
  listAssignmentCatalog,
  buildAssignmentTemplateWorkbook,
  prepareAssignmentRows,
  assignEmployee,
};
