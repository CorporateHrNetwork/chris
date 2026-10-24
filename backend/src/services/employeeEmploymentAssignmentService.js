const XLSX = require("xlsx");
const lineManagers = require("./lineManagerService");
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
  "Employee Name",
  "Employment Type",
  "Cost Centre / Operating Unit",
  "Line Manager Selection",
  "Effective From",
  "Reason",
];

function normalizeText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
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
    rows.find((row) => normalizeText([row.code, row.name].filter(Boolean).join(" - ")).toLowerCase() === needle) ||
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

function buildAssignmentTemplateWorkbook({ employmentTypes = ZERMATT_EMPLOYMENT_TYPES, costCentres = [], employees = [], managerOptionsByEmployee = {} } = {}) {
  const workbook = XLSX.utils.book_new();
  const rows = [
    ASSIGNMENT_HEADERS,
    ...employees.map((employee) => [
      employee.employeeNumber,
      [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
      "",
      "",
      "",
      "",
      "",
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 16 }, { wch: 34 }, { wch: 22 }, { wch: 34 },
    { wch: 54 }, { wch: 18 }, { wch: 34 },
  ];
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  const employmentFormula = `"${employmentTypes.map((value) => String(value).replace(/"/g, '""')).join(",")}"`;
  const costCentreValues = costCentres.map((row) => `${row.code} - ${row.name}`);
  const costCentreFormula = `"${costCentreValues.map((value) => String(value).replace(/"/g, '""')).join(",")}"`;

  employees.forEach((employee, index) => {
    const row = index + 2;
    if (employmentFormula.length <= 255) {
      sheet[`C${row}`] = sheet[`C${row}`] || { t: "s", v: "" };
      sheet[`C${row}`].dataValidation = { type: "list", allowBlank: true, formula1: employmentFormula };
    }
    if (costCentreFormula.length <= 255) {
      sheet[`D${row}`] = sheet[`D${row}`] || { t: "s", v: "" };
      sheet[`D${row}`].dataValidation = { type: "list", allowBlank: true, formula1: costCentreFormula };
    }
    const options = managerOptionsByEmployee[employee.employeeNumber] || [];
    const managerFormula = `"${options.map((option) => String(option.label).replace(/"/g, '""')).join(",")}"`;
    if (options.length && managerFormula.length <= 255) {
      sheet[`E${row}`] = sheet[`E${row}`] || { t: "s", v: "" };
      sheet[`E${row}`].dataValidation = { type: "list", allowBlank: true, formula1: managerFormula };
    }
    sheet[`F${row}`] = sheet[`F${row}`] || { t: "s", v: "" };
    sheet[`F${row}`].z = "yyyy-mm-dd";
  });

  XLSX.utils.book_append_sheet(workbook, sheet, "Employee Assignments");
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
    raw: true,
  }).map(row => {
    // Decode Excel serial dates directly: Date conversion can shift a calendar day across timezones.
    for (const key of Object.keys(row)) {
      if (!["managereffectivefrom", "effectivefrom"].includes(normalizeHeader(key)) || typeof row[key] !== "number") continue;
      const date = XLSX.SSF.parse_date_code(row[key], { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) });
      if (date) row[key] = `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
    return row;
  });
}

async function prepareAssignmentRows(prisma, { organizationId, buffer, activeLocationId = null, allowHierarchyOverride = false }) {
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
        locationId: true,
        costCentre: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  const employeeByNumber = new Map(
    employees.map((employee) => [String(employee.employeeNumber || "").toUpperCase(), employee])
  );
  const employeeIdsByName = new Map();
  for (const employee of employees) {
    const fullName = normalizeText(
      [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ")
    ).toLowerCase();
    if (!fullName) continue;
    const ids = employeeIdsByName.get(fullName) || [];
    ids.push(employee.id);
    employeeIdsByName.set(fullName, ids);
  }

  const prepared = parseAssignmentWorkbook(buffer).map((row, index) => {
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
    const managerSelection = getCell(row, ["Line Manager Selection", "Line Manager Employee No", "Line Manager Employee Number"]);
    const parsedManagerEmployeeNumber = (
      managerSelection.match(/^(ZLL\d+)\b/i)?.[1] || ""
    ).trim().toUpperCase();
    const managerNameKey = normalizeText(
      parsedManagerEmployeeNumber
        ? managerSelection.split(/\s+—\s+/)[1] || ""
        : managerSelection
    ).toLowerCase();
    const managerNameMatches = managerNameKey ? employeeIdsByName.get(managerNameKey) || [] : [];
    const managerEmployeeNumber = parsedManagerEmployeeNumber ||
      (managerNameMatches.length === 1
        ? String(employees.find((employee) => employee.id === managerNameMatches[0])?.employeeNumber || "").toUpperCase()
        : "");
    const managerEffectiveFrom = getCell(row, ["Effective From", "Manager Effective From"]);
    const manager = employeeByNumber.get(managerEmployeeNumber);
    const skip = !employmentTypeInput && !costCentreInput && !managerEmployeeNumber && !managerEffectiveFrom && !reason;
    const employee = employeeByNumber.get(employeeNumber) || null;
    const employmentType = employmentTypeInput
      ? normalizeEmploymentTypeForOrganization(employmentTypeInput, organization.slug)
      : null;
    const costCentre = costCentreInput ? findCatalogRow(costCentres, costCentreInput) : null;
    const errors = [];

    if (!employeeNumber) errors.push("Employee No is required.");
    if (employeeNumber && !employee) errors.push("Employee No was not found in this organization.");
    if (employee && activeLocationId && employee.locationId !== activeLocationId) errors.push("Employee is outside the active branch.");
    if (!skip && !employmentTypeInput && !costCentreInput && !managerEmployeeNumber) {
      errors.push("Provide Employment Type, Cost Centre / Operating Unit, or Line Manager Selection.");
    }
    if (employmentTypeInput && !employmentType) {
      errors.push("Employment Type is not in the organization's authoritative catalogue.");
    }
    if (costCentreInput && !costCentre) {
      errors.push("Cost Centre / Operating Unit was not found in the active CHRiS catalogue.");
    }

    if (managerEmployeeNumber && !manager) errors.push("Line Manager Selection was not found in this organization.");
    if (managerEmployeeNumber && (!/^\d{4}-\d{2}-\d{2}$/.test(managerEffectiveFrom) || !lineManagers.parseEffectiveDate(managerEffectiveFrom) || new Date(managerEffectiveFrom).toISOString().slice(0, 10) !== managerEffectiveFrom)) errors.push("Effective From must be a valid YYYY-MM-DD date.");
    return {
      skip,
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
              managerEmployeeNumber,
              managerEffectiveFrom,
              hierarchyOverride: allowHierarchyOverride,
              hierarchyOverrideReason: allowHierarchyOverride
                ? "Temporary management-approved line-manager assignment via approved bulk workbook upload."
                : "",
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
        managerEmployeeNumber,
        managerEffectiveFrom,
        managerName: manager ? [manager.firstName, manager.middleName, manager.lastName].filter(Boolean).join(" ") : "",
      },
    };
  }).filter(row => !row.skip);
  const counts = new Map();
  for (const row of prepared) counts.set(row.display.employeeNumber, (counts.get(row.display.employeeNumber) || 0) + 1);
  for (const row of prepared) {
    if (counts.get(row.display.employeeNumber) > 1) row.errors.push("Duplicate Employee No in workbook.");
    if (!row.errors.length && row.input.managerEmployeeNumber) {
      try {
        await lineManagers.validateLineManager(prisma, {
          organizationId,
          employeeId: employeeByNumber.get(row.input.employeeNumber).id,
          managerEmployeeId: employeeByNumber.get(row.input.managerEmployeeNumber).id,
          effectiveFrom: new Date(row.input.managerEffectiveFrom),
          reason: row.input.reason,
          hierarchyOverride: allowHierarchyOverride,
          hierarchyOverrideReason: allowHierarchyOverride
            ? "Temporary management-approved line-manager assignment via approved bulk workbook upload."
            : "",
        });
      } catch (error) { row.errors.push(error.message); }
    }
    row.valid = row.errors.length === 0;
    if (!row.valid) row.input = null;
  }
  return prepared;
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
    managerEmployeeNumber,
    managerEffectiveFrom,
    hierarchyOverride = false,
    hierarchyOverrideReason = "",
    activeLocationId = null,
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
        locationId: true,
      },
    }),
    listActiveCostCentres(prisma, organizationId),
  ]);

  if (!employee) {
    const error = new Error("Employee not found in this organization.");
    error.code = "EMPLOYEE_NOT_FOUND";
    throw error;
  }

  if (activeLocationId && employee.locationId !== activeLocationId) throw new Error("EMPLOYEE_OUTSIDE_ACTIVE_BRANCH");
  const hasManager = Boolean(normalizeText(managerEmployeeNumber));
  const hasEmploymentType = normalizeText(employmentTypeInput) !== "";
  const costCentreValue = normalizeText(costCentreId || costCentreInput);
  const hasCostCentre = costCentreValue !== "";
  if (!hasEmploymentType && !hasCostCentre && !hasManager) {
    const error = new Error("Provide Employment Type, Cost Centre / Operating Unit, or Line Manager Employee No.");
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

  if (!changed && !hasManager) {
    return {
      employeeNumber: employee.employeeNumber,
      employmentType: employee.employmentType,
      costCentreId: employee.costCentreId,
      changed: false,
    };
  }

  return prisma.$transaction(async (tx) => {
    let managerChanged = false;
    if (hasManager) {
      const manager = await tx.employee.findFirst({ where: { organizationId, employeeNumber: normalizeText(managerEmployeeNumber).toUpperCase() } });
      if (!manager) throw new Error("MANAGER_NOT_FOUND");
      const current = await tx.employeeLineManagerAssignment.findFirst({ where: { organizationId, employeeId: employee.id, effectiveTo: null } });
      managerChanged = current?.managerEmployeeId !== manager.id;
      await lineManagers.applyLineManager(tx, {
        organizationId, employeeId: employee.id, managerEmployeeId: manager.id,
        effectiveFrom: lineManagers.parseEffectiveDate(managerEffectiveFrom),
        reason,
        hierarchyOverride,
        hierarchyOverrideReason,
        performedByUserId: actorUserId,
      });
    }
    if (!changed) return { ...employee, managerEmployeeNumber, managerEffectiveFrom, changed: managerChanged };
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

    return { ...updated, managerEmployeeNumber, managerEffectiveFrom, changed: true };
  }, { isolationLevel: "Serializable" });
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
