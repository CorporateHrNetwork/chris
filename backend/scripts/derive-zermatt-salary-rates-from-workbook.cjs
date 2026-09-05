const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const prisma = require("../src/config/prisma");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const DEFAULT_EFFECTIVE_FROM = "2026-09-01";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const EXPECTED_EMPLOYEES = 312;

const DEFAULT_WORKBOOK_CANDIDATES = [
  path.resolve(__dirname, "..", "..", "ZERMATT_workforce_source.xlsx"),
  path.resolve(__dirname, "..", "..", "ZERMATT_CHRiS_Workforce_Migration_Validated_Review.xlsx"),
];

const GROSS_ALIASES = [
  "Monthly Gross Salary",
  "Monthly Gross Salary*",
  "Monthly Gross",
  "Gross Monthly Salary",
  "Gross Salary",
  "Monthly Gross Pay",
  "Gross Pay",
  "Gross Remuneration",
  "Monthly Remuneration",
  "Monthly Salary",
  "Gross",
];

const NAME_ALIASES = [
  "Employee Full Name*",
  "Employee Full Name",
  "Employee Name",
  "Full Name",
  "Name",
];

const START_DATE_ALIASES = [
  "Start Date*",
  "Start Date",
  "Hire Date",
  "Employment Date",
];

const EMPLOYEE_NUMBER_ALIASES = [
  "Employee No",
  "Employee Number",
  "Employee ID",
];

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function key(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizedHeader(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCell(row, aliases) {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const wanted = normalizedHeader(alias);
    const match = entries.find(([header]) => normalizedHeader(header) === wanted);
    if (match) return match[1];
  }
  return null;
}

function parseMoney(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0
      ? Math.round(value * 100) / 100
      : null;
  }

  const text = clean(value);
  if (!text) return null;

  const normalized = text
    .replace(/,/g, "")
    .replace(/₦/g, "")
    .replace(/\bNGN\b/gi, "")
    .replace(/\s+/g, "")
    .trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100) / 100
    : null;
}

function dateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = {
    apply: false,
    effectiveFrom: DEFAULT_EFFECTIVE_FROM,
    workbook: null,
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    if (arg.startsWith("--effective-from=")) {
      args.effectiveFrom = arg.slice("--effective-from=".length);
    }
    if (arg.startsWith("--workbook=")) {
      args.workbook = path.resolve(arg.slice("--workbook=".length));
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.effectiveFrom)) {
    throw new Error("--effective-from must use YYYY-MM-DD.");
  }

  return args;
}

function resolveWorkbook(explicitPath) {
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`Workbook not found: ${explicitPath}`);
    }
    return explicitPath;
  }

  const found = DEFAULT_WORKBOOK_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `ZERMATT workforce workbook not found. Expected one of: ${DEFAULT_WORKBOOK_CANDIDATES.join(", ")}`
    );
  }
  return found;
}

function chooseSheet(workbook) {
  return (
    workbook.SheetNames.find((name) => clean(name).toLowerCase() === "chris import ready") ||
    workbook.SheetNames.find((name) => clean(name).toLowerCase() === "employee master") ||
    workbook.SheetNames.find((name) => clean(name).toLowerCase().includes("employee master")) ||
    workbook.SheetNames[0]
  );
}

function employeeDisplayName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ");
}

function buildSourceRows(workbook, sheetName) {
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: null,
    raw: true,
  });

  const rows = rawRows
    .map((row, index) => {
      const name = getCell(row, NAME_ALIASES);
      return {
        workbookRow: index + 2,
        name: clean(name),
        startDate: dateOnly(getCell(row, START_DATE_ALIASES)),
        suppliedEmployeeNumber: clean(getCell(row, EMPLOYEE_NUMBER_ALIASES)).toUpperCase(),
        gross: parseMoney(getCell(row, GROSS_ALIASES)),
        currency: clean(getCell(row, ["Payroll Currency", "Salary Currency", "Currency"]) || "").toUpperCase(),
      };
    })
    .filter((row) => row.name);

  const hasCompleteEmployeeNumbers =
    rows.length > 0 &&
    rows.every((row) => /^ZLL\d{6}$/.test(row.suppliedEmployeeNumber));

  if (!hasCompleteEmployeeNumbers) {
    rows.sort((a, b) => {
      const da = a.startDate || "9999-12-31";
      const db = b.startDate || "9999-12-31";
      return da.localeCompare(db) || a.workbookRow - b.workbookRow;
    });

    rows.forEach((row, index) => {
      row.employeeNumber = `ZLL${String(index + 1).padStart(6, "0")}`;
    });
  } else {
    rows.forEach((row) => {
      row.employeeNumber = row.suppliedEmployeeNumber;
    });
  }

  return {
    rows,
    numberingSource: hasCompleteEmployeeNumbers
      ? "WORKBOOK_EMPLOYEE_NUMBER"
      : "DETERMINISTIC_START_DATE_AND_SOURCE_ROW",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workbookPath = resolveWorkbook(args.workbook);
  const workbook = XLSX.readFile(workbookPath, { cellDates: true });
  const sheetName = chooseSheet(workbook);

  if (!sheetName) throw new Error("The workbook contains no worksheet.");

  const source = buildSourceRows(workbook, sheetName);

  const org = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, currency: true },
  });
  if (!org) throw new Error("ZERMATT organization not found.");

  const employees = await prisma.employee.findMany({
    where: {
      organizationId: org.id,
      status: { in: CURRENT_STATUSES },
    },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      hireDate: true,
      employmentType: true,
    },
    orderBy: { employeeNumber: "asc" },
  });

  const employeeByNumber = new Map(
    employees.map((employee) => [employee.employeeNumber, employee])
  );

  const existingRows = await prisma.$queryRawUnsafe(
    `SELECT "id","employeeId","amount","currency","effectiveFrom","effectiveTo","status"
       FROM "payroll_salary_rates"
      WHERE "organizationId"=$1 AND "status"='ACTIVE'
        AND "effectiveFrom" <= $2::date
        AND ("effectiveTo" IS NULL OR "effectiveTo" >= $2::date)`,
    org.id,
    args.effectiveFrom
  );

  const existingByEmployee = new Map(
    existingRows.map((row) => [row.employeeId, row])
  );

  const prepared = [];
  const missingDbEmployees = [];
  const nameMismatches = [];
  const hireDateMismatches = [];
  const missingGrossEmployees = [];
  const existingRateConflicts = [];
  const existingSalaryRates = [];
  const employmentTypeCounts = {};

  for (const employee of employees) {
    employmentTypeCounts[employee.employmentType || "(missing)"] =
      (employmentTypeCounts[employee.employmentType || "(missing)"] || 0) + 1;
  }

  for (const row of source.rows) {
    const employee = employeeByNumber.get(row.employeeNumber);
    if (!employee) {
      missingDbEmployees.push({
        workbookRow: row.workbookRow,
        employeeNumber: row.employeeNumber,
        sourceName: row.name,
      });
      continue;
    }

    const dbName = employeeDisplayName(employee);
    if (key(dbName) !== key(row.name)) {
      nameMismatches.push({
        workbookRow: row.workbookRow,
        employeeNumber: row.employeeNumber,
        source: row.name,
        database: dbName,
      });
      continue;
    }

    const dbHireDate = dateOnly(employee.hireDate);
    if (dbHireDate !== row.startDate) {
      hireDateMismatches.push({
        workbookRow: row.workbookRow,
        employeeNumber: row.employeeNumber,
        source: row.startDate,
        database: dbHireDate,
      });
      continue;
    }

    if (!row.gross) {
      missingGrossEmployees.push({
        workbookRow: row.workbookRow,
        employeeNumber: row.employeeNumber,
        employeeName: dbName,
      });
      continue;
    }

    const existingRate = existingByEmployee.get(employee.id) || null;
    if (existingRate) {
      const existingAmount = Number(existingRate.amount || 0);
      existingSalaryRates.push({
        employeeNumber: employee.employeeNumber,
        amount: existingAmount,
        sourceGross: row.gross,
      });
      if (Math.abs(existingAmount - row.gross) > 0.009) {
        existingRateConflicts.push({
          employeeNumber: employee.employeeNumber,
          employeeName: dbName,
          workbookGross: row.gross,
          existingSalaryRate: existingAmount,
        });
      }
      continue;
    }

    prepared.push({
      employee,
      amount: row.gross,
      currency: /^[A-Z]{3}$/.test(row.currency)
        ? row.currency
        : org.currency || "NGN",
      workbookRow: row.workbookRow,
    });
  }

  const unmatchedDatabaseEmployees = employees
    .filter((employee) => !source.rows.some((row) => row.employeeNumber === employee.employeeNumber))
    .map((employee) => ({
      employeeNumber: employee.employeeNumber,
      employeeName: employeeDisplayName(employee),
    }));

  const exactMatches =
    source.rows.length -
    missingDbEmployees.length -
    nameMismatches.length -
    hireDateMismatches.length;

  const preview = {
    mode: args.apply ? "APPLY" : "PREVIEW",
    organization: org.name,
    workbook: path.basename(workbookPath),
    sheet: sheetName,
    numberingSource: source.numberingSource,
    effectiveFrom: args.effectiveFrom,
    sourceRows: source.rows.length,
    currentEmployees: employees.length,
    exactEmployeeMatches: exactMatches,
    employmentTypeCounts,
    existingEffectiveSalaryRates: existingSalaryRates.length,
    derivableMissingSalaryRates: prepared.length,
    missingGross: missingGrossEmployees.length,
    existingRateConflicts: existingRateConflicts.length,
    missingDbEmployees: missingDbEmployees.length,
    unmatchedDatabaseEmployees: unmatchedDatabaseEmployees.length,
    nameMismatches: nameMismatches.length,
    hireDateMismatches: hireDateMismatches.length,
    expectedSalaryRatesAfter:
      existingSalaryRates.length + prepared.length,
    samples: {
      missingGrossEmployees: missingGrossEmployees.slice(0, 25),
      existingRateConflicts: existingRateConflicts.slice(0, 25),
      missingDbEmployees: missingDbEmployees.slice(0, 25),
      unmatchedDatabaseEmployees: unmatchedDatabaseEmployees.slice(0, 25),
      nameMismatches: nameMismatches.slice(0, 25),
      hireDateMismatches: hireDateMismatches.slice(0, 25),
    },
  };

  console.log(JSON.stringify(preview, null, 2));

  if (!args.apply) {
    console.log("\nPREVIEW ONLY: no salary-rate data was changed.");
    console.log("Run again with --apply only when all reconciliation blockers are zero.");
    return;
  }

  const blockers = [
    source.rows.length !== EXPECTED_EMPLOYEES
      ? `sourceRows=${source.rows.length}`
      : null,
    employees.length !== EXPECTED_EMPLOYEES
      ? `currentEmployees=${employees.length}`
      : null,
    exactMatches !== EXPECTED_EMPLOYEES
      ? `exactEmployeeMatches=${exactMatches}`
      : null,
    missingGrossEmployees.length
      ? `missingGross=${missingGrossEmployees.length}`
      : null,
    existingRateConflicts.length
      ? `existingRateConflicts=${existingRateConflicts.length}`
      : null,
    missingDbEmployees.length
      ? `missingDbEmployees=${missingDbEmployees.length}`
      : null,
    unmatchedDatabaseEmployees.length
      ? `unmatchedDatabaseEmployees=${unmatchedDatabaseEmployees.length}`
      : null,
    nameMismatches.length
      ? `nameMismatches=${nameMismatches.length}`
      : null,
    hireDateMismatches.length
      ? `hireDateMismatches=${hireDateMismatches.length}`
      : null,
  ].filter(Boolean);

  if (blockers.length) {
    throw new Error(`Apply aborted: ${blockers.join(", ")}.`);
  }

  const created = await prisma.$transaction(async (tx) => {
    let count = 0;

    for (const item of prepared) {
      const rateId = crypto.randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO "payroll_salary_rates"
          ("id","organizationId","employeeId","amount","currency","frequency","effectiveFrom","effectiveTo","status","reason","createdByUserId")
         VALUES ($1,$2,$3,$4,$5,'MONTHLY',$6::date,NULL,'ACTIVE',$7,NULL)`,
        rateId,
        org.id,
        item.employee.id,
        item.amount,
        item.currency,
        args.effectiveFrom,
        "Derived from existing ZERMATT migration workbook gross salary — Release-1 opening payroll authority"
      );

      await tx.organizationAudit.create({
        data: {
          organizationId: org.id,
          actorUserId: null,
          entityType: "PayrollSalaryRate",
          entityId: rateId,
          action: "DERIVED_FROM_MIGRATION_WORKBOOK_GROSS",
          newValue: {
            employeeNumber: item.employee.employeeNumber,
            monthlyGrossSalary: item.amount,
            currency: item.currency,
            effectiveFrom: args.effectiveFrom,
            source: path.basename(workbookPath),
            sheet: sheetName,
            workbookRow: item.workbookRow,
          },
          reason: "Promoted the already-uploaded ZERMATT migration gross salary into the effective-dated Payroll Salary Rate register.",
        },
      });

      count += 1;
    }

    return count;
  });

  const afterRows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "employeeId")::int AS count
       FROM "payroll_salary_rates"
      WHERE "organizationId"=$1
        AND "status"='ACTIVE'
        AND "effectiveFrom" <= $2::date
        AND ("effectiveTo" IS NULL OR "effectiveTo" >= $2::date)`,
    org.id,
    args.effectiveFrom
  );

  console.log(
    JSON.stringify(
      {
        salaryRatesCreated: created,
        effectiveSalaryRatesAfter: Number(afterRows[0]?.count || 0),
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
