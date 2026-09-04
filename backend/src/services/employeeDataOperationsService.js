const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const EXPORT_COLUMN_CATALOG = [
  { key: "employeeNumber", label: "Employee No" },
  { key: "employeeName", label: "Employee Name" },
  { key: "email", label: "Work Email Address" },
  { key: "phone", label: "Phone Number" },
  { key: "gender", label: "Gender" },
  { key: "status", label: "Status" },
  { key: "hireDate", label: "Employment Date" },
  { key: "department", label: "Department" },
  { key: "designation", label: "Designation" },
  { key: "employmentLevel", label: "Employment Level" },
  { key: "location", label: "Company Branch / Location" },
  { key: "nationalIdentificationNumber", label: "Identification Number" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "nationality", label: "Nationality" },
  { key: "residentialAddress", label: "Residential Address" },
  { key: "bankName", label: "Bank" },
  { key: "accountName", label: "Account Name" },
  { key: "accountNumber", label: "Account Number" },
  { key: "payrollCurrency", label: "Currency" },
  { key: "paymentMethod", label: "Payment Method" },
  { key: "taxIdentificationNumber", label: "Tax Identification Number" },
  { key: "pensionPfa", label: "PFA" },
  { key: "pensionPin", label: "Pension / RSA Number" },
  { key: "nhiaNumber", label: "NHIA Number" },
];

const DEFAULT_EXPORT_COLUMNS = [
  "employeeNumber",
  "employeeName",
  "department",
  "designation",
  "employmentLevel",
  "location",
  "status",
  "hireDate",
  "email",
  "phone",
];

const IMPORT_HEADERS = [
  "Employee Name",
  "Work Email",
  "Phone",
  "Gender",
  "Status",
  "Hire Date",
  "Department",
  "Designation",
  "Location",
  "NIN",
];

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function safeSpreadsheetValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName =
    workbook.SheetNames.find(
      (name) => String(name).trim().toLowerCase() === "employee import"
    ) ||
    workbook.SheetNames.find(
      (name) => String(name).trim().toLowerCase() === "employee master"
    ) ||
    workbook.SheetNames[0];
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

function getCell(row, aliases) {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const match = entries.find(([key]) => normalizeHeader(key) === normalizedAlias);
    if (match) return String(match[1] ?? "").trim();
  }
  return "";
}

function mapStatus(value) {
  const normalized = String(value || "Probation").trim().toUpperCase();
  const allowed = new Map([
    ["ACTIVE", "Active"],
    ["PROBATION", "Probation"],
    ["LEAVE", "Leave"],
    ["SUSPENDED", "Suspended"],
  ]);
  return allowed.get(normalized) || null;
}

function buildTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const instructions = [
    ["CHRiS Bulk Employee Import"],
    ["One employee per row. Do not change the column headings."],
    ["Department, Designation and Location may use the CHRiS name or code."],
    ["Required: Employee Name, Department, Designation and Location. Email and Phone may be completed later by authorized HR."],
    ["Gender: MALE, FEMALE, OTHER or UNSPECIFIED."],
    ["Status: Active, Probation, Leave or Suspended. Blank defaults to Probation."],
    ["Hire Date: YYYY-MM-DD."],
    ["NIN: optional; when supplied it must be a valid unused 11-digit NIN."],
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(instructions),
    "Instructions"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      IMPORT_HEADERS,
      [
        "Jane Mary Doe",
        "jane.doe@example.com",
        "08000000000",
        "FEMALE",
        "Probation",
        "2026-08-30",
        "Human Resources",
        "HR Officer",
        "Abuja",
        "",
      ],
    ]),
    "Employee Import"
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function findCatalogRow(rows, value) {
  const needle = String(value || "").trim().toLowerCase();
  if (!needle) return null;
  return (
    rows.find((row) => String(row.id || "").toLowerCase() === needle) ||
    rows.find((row) => String(row.code || "").trim().toLowerCase() === needle) ||
    rows.find((row) => String(row.name || "").trim().toLowerCase() === needle) ||
    null
  );
}

async function prepareBulkRows(prisma, { organizationId, buffer }) {
  const sourceRows = parseWorkbook(buffer);
  const [departments, designations, locations, existingEmployees] = await Promise.all([
    prisma.department.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, code: true },
    }),
    prisma.designation.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, departmentId: true, name: true, code: true, careerLevel: true },
    }),
    prisma.organizationLocation.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, code: true },
    }),
    prisma.employee.findMany({
      where: { organizationId },
      select: { email: true, nationalIdentificationNumber: true },
    }),
  ]);

  const existingEmails = new Set(
    existingEmployees.map((row) => String(row.email || "").trim().toLowerCase()).filter(Boolean)
  );
  const existingNins = new Set(
    existingEmployees.map((row) => String(row.nationalIdentificationNumber || "").trim()).filter(Boolean)
  );
  const seenEmails = new Set();
  const seenNins = new Set();

  return sourceRows.map((row, index) => {
    const rowNumber = index + 2;
    const name = getCell(row, ["Employee Name", "Employee Full Name", "Full Name", "Name"]);
    const email = getCell(row, ["Work Email", "Email", "Work Email Address"]).toLowerCase();
    const phone = getCell(row, ["Phone", "Phone Number"]);
    const gender = (getCell(row, ["Gender"]) || "UNSPECIFIED").toUpperCase();
    const status = mapStatus(getCell(row, ["Status"]) || "Active");
    const hireDate = getCell(row, ["Hire Date", "Employment Date", "Start Date"]);
    const idType = getCell(row, ["ID Type"]);
    const directNin = getCell(row, ["NIN", "National Identification Number"]);
    const idNumber = getCell(row, ["ID Number", "Identification Number"]);
    const nin = directNin || (String(idType || "").trim().toUpperCase() === "NIN" ? idNumber : "");
    const departmentInput = getCell(row, ["Department", "Department Code"]);
    const designationInput = getCell(row, ["Designation", "Designation Code"]);
    const rawLocationInput = getCell(row, ["Location", "Company Branch", "Branch", "Branch / Location", "Location Code"]);
    const locationAliases = {
      "ABUJA": "ABJ",
      "ABUJA BRANCH": "ABJ",
      "PORT HARCOURT": "PHC",
      "PORT HARCOURT BRANCH": "PHC",
      "PHC": "PHC",
      "PHC BRANCH": "PHC",
      "LAGOS": "LAG",
      "LAGOS BRANCH": "LAG",
      "HEAD OFFICE": "HO",
    };
    const locationInput =
      locationAliases[String(rawLocationInput || "").trim().toUpperCase()] ||
      rawLocationInput;

    const department = findCatalogRow(departments, departmentInput);
    const designation = findCatalogRow(designations, designationInput);
    const location = findCatalogRow(locations, locationInput);
    const errors = [];

    if (!name || name.trim().split(/\s+/).length < 2) errors.push("Employee Name must contain at least first and last name.");
if (!["MALE", "FEMALE", "OTHER", "UNSPECIFIED"].includes(gender)) errors.push("Gender must be MALE, FEMALE, OTHER or UNSPECIFIED.");
    if (!status) errors.push("Status is invalid.");
    if (!department) errors.push("Department was not found in the active CHRiS structure.");
    if (!designation) errors.push("Designation was not found in the active CHRiS structure.");
    if (designation && department && designation.departmentId !== department.id) {
      errors.push("Designation is not mapped to the selected Department.");
    }
    if (designation && !Number.isInteger(designation.careerLevel)) {
      errors.push("Designation must be mapped to an Employment Level.");
    }
    if (!location) errors.push("Location was not found in the active CHRiS location catalogue.");
    if (hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) errors.push("Hire Date must use YYYY-MM-DD.");
    if (nin && !/^\d{11}$/.test(nin.replace(/\D/g, ""))) errors.push("NIN must contain 11 digits.");
    if (email && (existingEmails.has(email) || seenEmails.has(email))) errors.push("Work Email already exists or is duplicated in this file.");
    const normalizedNin = nin.replace(/\D/g, "");
    if (normalizedNin && (existingNins.has(normalizedNin) || seenNins.has(normalizedNin))) {
      errors.push("NIN already exists or is duplicated in this file.");
    }

    if (email) seenEmails.add(email);
    if (normalizedNin) seenNins.add(normalizedNin);

    return {
      rowNumber,
      source: row,
      valid: errors.length === 0,
      errors,
      input:
        errors.length === 0
          ? {
              name,
              email,
              phone,
              gender,
              status,
              hireDate,
              departmentId: department.id,
              designationId: designation.id,
              locationId: location.id,
              nationalIdentificationNumber: normalizedNin || "",
            }
          : null,
      display: {
        name,
        email,
        department: department?.name || departmentInput,
        designation: designation?.name || designationInput,
        location: location?.name || locationInput,
      },
    };
  });
}

function buildEmployeeWhere(filters = {}) {
  const where = {};
  if (filters.includeExited !== true) {
    where.status = { notIn: ["RESIGNED", "TERMINATED", "RETIRED", "INACTIVE"] };
  }
  if (filters.departmentId) where.departmentId = String(filters.departmentId);
  if (filters.locationId) where.locationId = String(filters.locationId);
  if (filters.status) where.status = String(filters.status).toUpperCase();
  const search = String(filters.search || "").trim();
  if (search) {
    where.OR = [
      { employeeNumber: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { middleName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}

function latestOnboardingData(employee) {
  const row = employee.onboardings?.[0];
  return row?.sectionData || {};
}

function composeExportEmployeeName(employee, personal = {}) {
  const authoritative =
    personal?.fullName ||
    personal?.employeeName ||
    personal?.name ||
    "";

  const authoritativeParts = String(authoritative)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const employeeParts = [
    employee?.firstName,
    employee?.middleName,
    employee?.lastName,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const sourceParts =
    authoritativeParts.length > 0
      ? authoritativeParts
      : employeeParts;

  const deduplicated = [];

  for (const part of sourceParts) {
    const previous = deduplicated[deduplicated.length - 1];

    if (
      previous &&
      previous.localeCompare(
        part,
        undefined,
        { sensitivity: "accent" }
      ) === 0
    ) {
      continue;
    }

    deduplicated.push(part);
  }

  return deduplicated.join(" ");
}
function exportValue(employee, key) {
  const sections = latestOnboardingData(employee);
  const personal = sections["personal-details"] || {};
  const payment = sections["payment-details"] || {};
  const statutory = sections["statutory-details"] || {};
  const level = employee.designation?.employmentLevel;

  const values = {
    employeeNumber: employee.employeeNumber,
    employeeName: composeExportEmployeeName(employee, personal),
    firstName: employee.firstName,
    middleName: employee.middleName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    gender: employee.gender,
    status: employee.status,
    hireDate: employee.hireDate,
    department: employee.department?.name,
    designation: employee.designation?.name,
    employmentLevel: level?.name || (Number.isInteger(employee.designation?.careerLevel) ? `Level ${employee.designation.careerLevel}` : ""),
    location: employee.location?.name,
    nationalIdentificationNumber: employee.nationalIdentificationNumber,
    dateOfBirth: personal.dateOfBirth,
    nationality: personal.nationality,
    residentialAddress: personal.residentialAddress,
    bankName: payment.bankName,
    accountName: payment.accountName,
    accountNumber: payment.accountNumber,
    payrollCurrency: payment.payrollCurrency,
    paymentMethod: payment.paymentMethod,
    taxIdentificationNumber: statutory.taxIdentificationNumber,
    pensionPfa: statutory.pensionPfa,
    pensionPin: statutory.pensionPin,
    nhiaNumber: statutory.nhiaNumber,
  };
  return safeSpreadsheetValue(values[key]);
}

async function createEmployeeExport(prisma, {
  organizationId,
  requestedByUserId,
  filters = {},
  columns = DEFAULT_EXPORT_COLUMNS,
  exportRoot,
}) {
  const allowedKeys = new Set(EXPORT_COLUMN_CATALOG.map((row) => row.key));
  const selectedColumns = (Array.isArray(columns) ? columns : [])
    .filter((key) => allowedKeys.has(key));
  const finalColumns = selectedColumns.length ? selectedColumns : DEFAULT_EXPORT_COLUMNS;

  const job = await prisma.employeeExportJob.create({
    data: {
      organizationId,
      requestedByUserId,
      status: "PROCESSING",
      filters,
      columns: finalColumns,
    },
  });

  try {
    const employees = await prisma.employee.findMany({
      where: {
        organizationId,
        ...buildEmployeeWhere(filters),
      },
      include: {
        department: true,
        designation: { include: { employmentLevel: true } },
        location: true,
        onboardings: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { sectionData: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const catalogByKey = Object.fromEntries(EXPORT_COLUMN_CATALOG.map((row) => [row.key, row]));
    const rows = employees.map((employee) =>
      Object.fromEntries(
        finalColumns.map((key) => [catalogByKey[key].label, exportValue(employee, key)])
      )
    );

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: finalColumns.map((key) => catalogByKey[key].label),
    });
    const exportHeaders = finalColumns.map((key) => catalogByKey[key].label);
    worksheet["!cols"] = exportHeaders.map((header) => {
      const longestValue = rows.reduce((max, row) => {
        const length = String(row?.[header] ?? "").length;
        return Math.max(max, length);
      }, String(header).length);

      return { wch: Math.min(Math.max(longestValue + 2, 12), 36) };
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");

    const organizationDir = path.resolve(exportRoot, organizationId);
    fs.mkdirSync(organizationDir, { recursive: true });
    const fileName = `CHRIS_Employee_Export_${job.id}.xlsx`;
    const absolutePath = path.resolve(organizationDir, fileName);
    XLSX.writeFile(workbook, absolutePath);

    return prisma.employeeExportJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        rowCount: employees.length,
        fileName,
        storagePath: absolutePath,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.employeeExportJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage: String(error.message || "Export failed.").slice(0, 500),
      },
    });
    throw error;
  }
}

function hashInviteToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function createInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  EXPORT_COLUMN_CATALOG,
  DEFAULT_EXPORT_COLUMNS,
  IMPORT_HEADERS,
  safeSpreadsheetValue,
  composeExportEmployeeName,
  parseWorkbook,
  prepareBulkRows,
  buildTemplateWorkbook,
  createEmployeeExport,
  hashInviteToken,
  createInviteToken,
};
