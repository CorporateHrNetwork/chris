const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const prisma = require("../src/config/prisma");
const { getPayrollReadiness } = require("../src/services/payrollReadinessService");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const EXPECTED_EMPLOYEES = 312;
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

const DEFAULT_WORKBOOK_CANDIDATES = [
  path.resolve(__dirname, "..", "..", "ZERMATT_workforce_source.xlsx"),
  path.resolve(__dirname, "..", "..", "ZERMATT_CHRiS_Workforce_Migration_Validated_Review.xlsx"),
];

const NAME_ALIASES = ["Employee Full Name*", "Employee Full Name", "Employee Name", "Full Name", "Name"];
const START_DATE_ALIASES = ["Start Date*", "Start Date", "Hire Date", "Employment Date"];
const BANK_NAME_ALIASES = ["Bank Name", "Bank", "Bank / Financial Institution"];
const ACCOUNT_NAME_ALIASES = ["Account Name", "Bank Account Name"];
const ACCOUNT_NUMBER_ALIASES = ["Account Number", "Bank Account Number", "Account No", "Account No."];
const CURRENCY_ALIASES = ["Payroll Currency", "Currency", "Salary Currency"];
const PAYMENT_METHOD_ALIASES = ["Payment Method", "Salary Payment Method"];

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizedHeader(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizedName(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
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

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = clean(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeAccountNumber(value) {
  return clean(value).replace(/\D/g, "");
}

function maskAccountNumber(value) {
  const digits = normalizeAccountNumber(value);
  return digits.length >= 4 ? `******${digits.slice(-4)}` : "";
}

function paymentSection(sectionData) {
  if (!sectionData || typeof sectionData !== "object" || Array.isArray(sectionData)) return {};
  const value = sectionData["payment-details"] || sectionData.paymentDetails;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function paymentSectionKey(sectionData) {
  if (sectionData && typeof sectionData === "object" && !Array.isArray(sectionData)) {
    if (Object.prototype.hasOwnProperty.call(sectionData, "payment-details")) return "payment-details";
    if (Object.prototype.hasOwnProperty.call(sectionData, "paymentDetails")) return "paymentDetails";
  }
  return "payment-details";
}

function paymentMissingFields(payment) {
  const missing = [];
  if (!clean(payment.bankName)) missing.push("bankName");
  if (!clean(payment.accountName)) missing.push("accountName");
  const accountNumber = normalizeAccountNumber(payment.accountNumber);
  if (accountNumber.length !== 10) missing.push("accountNumber");
  if (!clean(payment.payrollCurrency)) missing.push("payrollCurrency");
  if (!clean(payment.paymentMethod)) missing.push("paymentMethod");
  return missing;
}

function chooseWorkbook(explicitPath) {
  const candidates = explicitPath ? [path.resolve(explicitPath)] : DEFAULT_WORKBOOK_CANDIDATES;
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `No ZERMATT workforce workbook was found. Expected one of: ${candidates.join(", ")}`
    );
  }
  return found;
}

function parseArgs(argv) {
  const args = { apply: false, workbook: null };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    if (arg.startsWith("--workbook=")) args.workbook = arg.slice("--workbook=".length);
  }
  return args;
}

function readWorkbookRows(workbookPath) {
  const workbook = XLSX.readFile(workbookPath, { cellDates: true });
  const sheetName =
    workbook.SheetNames.find((name) => clean(name).toLowerCase() === "employee master") ||
    workbook.SheetNames.find((name) => clean(name).toLowerCase() === "employee import") ||
    workbook.SheetNames[0];
  if (!sheetName) throw new Error("The ZERMATT workbook has no worksheet.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
  return { rows, sheetName };
}

function numberSourceRows(rows) {
  const prepared = rows.map((row, index) => ({
    row,
    sourceRowNumber: index + 2,
    name: clean(getCell(row, NAME_ALIASES)),
    hireDate: normalizeDate(getCell(row, START_DATE_ALIASES)),
  }));

  prepared.sort((a, b) => {
    const aDate = a.hireDate || "9999-12-31";
    const bDate = b.hireDate || "9999-12-31";
    return aDate.localeCompare(bDate) || a.sourceRowNumber - b.sourceRowNumber;
  });

  return prepared.map((item, index) => ({
    ...item,
    employeeNumber: `ZLL${String(index + 1).padStart(6, "0")}`,
  }));
}

function sourcePayment(row) {
  const bankName = clean(getCell(row, BANK_NAME_ALIASES));
  const accountName = clean(getCell(row, ACCOUNT_NAME_ALIASES));
  const accountNumber = normalizeAccountNumber(getCell(row, ACCOUNT_NUMBER_ALIASES));
  const sourceCurrency = clean(getCell(row, CURRENCY_ALIASES)).toUpperCase();
  const sourcePaymentMethod = clean(getCell(row, PAYMENT_METHOD_ALIASES));
  return {
    bankName,
    accountName,
    accountNumber,
    payrollCurrency: /^[A-Z]{3}$/.test(sourceCurrency) ? sourceCurrency : "NGN",
    paymentMethod: sourcePaymentMethod || "Bank Transfer",
  };
}

function mergeMissingPaymentFields(current, source) {
  const next = { ...current };
  const changedFields = [];
  const blockers = [];

  if (!clean(current.bankName)) {
    if (!source.bankName) blockers.push("Workbook Bank Name is missing.");
    else { next.bankName = source.bankName; changedFields.push("bankName"); }
  }

  if (!clean(current.accountName)) {
    if (!source.accountName) blockers.push("Workbook Account Name is missing.");
    else { next.accountName = source.accountName; changedFields.push("accountName"); }
  }

  const currentAccountNumber = normalizeAccountNumber(current.accountNumber);
  if (currentAccountNumber.length !== 10) {
    if (clean(current.accountNumber) && currentAccountNumber.length !== 10) {
      blockers.push("Existing Account Number is present but invalid; it will not be overwritten automatically.");
    } else if (source.accountNumber.length !== 10) {
      blockers.push("Workbook Account Number is not a valid 10-digit account number.");
    } else {
      next.accountNumber = source.accountNumber;
      changedFields.push("accountNumber");
    }
  }

  if (!clean(current.payrollCurrency)) {
    next.payrollCurrency = source.payrollCurrency || "NGN";
    changedFields.push("payrollCurrency");
  }

  if (!clean(current.paymentMethod)) {
    next.paymentMethod = source.paymentMethod || "Bank Transfer";
    changedFields.push("paymentMethod");
  }

  return { next, changedFields, blockers };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workbookPath = chooseWorkbook(args.workbook);
  const { rows, sheetName } = readWorkbookRows(workbookPath);
  const numberedSource = numberSourceRows(rows);

  const organization = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) throw new Error("ZERMATT organization not found.");

  const employees = await prisma.employee.findMany({
    where: { organizationId: organization.id, status: { in: CURRENT_STATUSES } },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      hireDate: true,
      employmentType: true,
      onboardings: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true, sectionData: true, status: true, updatedAt: true, createdAt: true },
      },
    },
    orderBy: { employeeNumber: "asc" },
  });

  const employeeByNumber = new Map(employees.map((employee) => [employee.employeeNumber, employee]));
  const sourceByNumber = new Map(numberedSource.map((row) => [row.employeeNumber, row]));

  const missingDbEmployees = [];
  const unmatchedDatabaseEmployees = [];
  const nameMismatches = [];
  const hireDateMismatches = [];

  for (const source of numberedSource) {
    const employee = employeeByNumber.get(source.employeeNumber);
    if (!employee) {
      missingDbEmployees.push({ employeeNumber: source.employeeNumber, sourceName: source.name, sourceRowNumber: source.sourceRowNumber });
      continue;
    }
    const employeeName = [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
    if (normalizedName(employeeName) !== normalizedName(source.name)) {
      nameMismatches.push({ employeeNumber: employee.employeeNumber, databaseName: employeeName, sourceName: source.name });
    }
    const employeeHireDate = normalizeDate(employee.hireDate);
    if (employeeHireDate !== source.hireDate) {
      hireDateMismatches.push({ employeeNumber: employee.employeeNumber, databaseHireDate: employeeHireDate, sourceHireDate: source.hireDate });
    }
  }

  for (const employee of employees) {
    if (!sourceByNumber.has(employee.employeeNumber)) {
      unmatchedDatabaseEmployees.push({ employeeNumber: employee.employeeNumber });
    }
  }

  const readinessBefore = await getPayrollReadiness({ organizationId: organization.id, prismaClient: prisma });
  const blockedNumbers = new Set(
    readinessBefore.employees
      .filter((employee) => employee.blockers.includes("PAYMENT_PROFILE_INCOMPLETE"))
      .map((employee) => employee.employeeNumber)
  );

  const currentAccountOwners = new Map();
  for (const employee of employees) {
    const payment = paymentSection(employee.onboardings[0]?.sectionData || {});
    const accountNumber = normalizeAccountNumber(payment.accountNumber);
    if (accountNumber.length === 10) {
      if (!currentAccountOwners.has(accountNumber)) currentAccountOwners.set(accountNumber, []);
      currentAccountOwners.get(accountNumber).push(employee.employeeNumber);
    }
  }

  const workbookAccountOwners = new Map();
  for (const source of numberedSource) {
    const accountNumber = sourcePayment(source.row).accountNumber;
    if (accountNumber.length === 10) {
      if (!workbookAccountOwners.has(accountNumber)) workbookAccountOwners.set(accountNumber, []);
      workbookAccountOwners.get(accountNumber).push(source.employeeNumber);
    }
  }

  const prepared = [];
  const targetBlockers = [];

  for (const employeeNumber of [...blockedNumbers].sort()) {
    const employee = employeeByNumber.get(employeeNumber);
    const source = sourceByNumber.get(employeeNumber);
    const onboarding = employee?.onboardings?.[0] || null;
    const employeeName = employee ? [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ") : "";

    if (!employee || !source) {
      targetBlockers.push({ employeeNumber, employeeName, blockers: ["Employee/source reconciliation is incomplete."] });
      continue;
    }
    if (!onboarding) {
      targetBlockers.push({ employeeNumber, employeeName, blockers: ["No onboarding record exists to hold the payment profile."] });
      continue;
    }

    const current = paymentSection(onboarding.sectionData || {});
    const sourceValues = sourcePayment(source.row);
    const merged = mergeMissingPaymentFields(current, sourceValues);
    const blockers = [...merged.blockers];

    if (merged.changedFields.includes("accountNumber")) {
      const accountNumber = sourceValues.accountNumber;
      const currentOwners = (currentAccountOwners.get(accountNumber) || []).filter((owner) => owner !== employeeNumber);
      const workbookOwners = (workbookAccountOwners.get(accountNumber) || []).filter((owner) => owner !== employeeNumber);
      if (currentOwners.length) blockers.push(`Workbook Account Number is already used by ${currentOwners.join(", ")}.`);
      if (workbookOwners.length) blockers.push(`Workbook Account Number is duplicated with ${workbookOwners.join(", ")}.`);
    }

    const missingAfter = paymentMissingFields(merged.next);
    if (missingAfter.length) blockers.push(`Payment profile would remain incomplete: ${missingAfter.join(", ")}.`);

    const summary = {
      employeeNumber,
      employeeName,
      employmentType: employee.employmentType,
      onboardingId: onboarding.id,
      missingBefore: paymentMissingFields(current),
      changedFields: merged.changedFields,
      missingAfter,
      sourceRowNumber: source.sourceRowNumber,
      sourceAccountNumberMasked: maskAccountNumber(sourceValues.accountNumber),
      blockers,
    };

    if (blockers.length) targetBlockers.push(summary);
    else prepared.push({ employee, onboarding, current, next: merged.next, ...summary });
  }

  const reconciliationBlockers =
    missingDbEmployees.length +
    unmatchedDatabaseEmployees.length +
    nameMismatches.length +
    hireDateMismatches.length;

  const preview = {
    mode: args.apply ? "APPLY" : "PREVIEW",
    organization: organization.name,
    workbook: path.basename(workbookPath),
    sheet: sheetName,
    numberingSource: "DETERMINISTIC_START_DATE_AND_SOURCE_ROW",
    sourceRows: numberedSource.length,
    currentEmployees: employees.length,
    exactEmployeeMatches:
      numberedSource.length - missingDbEmployees.length - nameMismatches.length - hireDateMismatches.length,
    paymentReadyBefore: readinessBefore.summary.paymentReady,
    paymentBlockedBefore: blockedNumbers.size,
    repairablePaymentProfiles: prepared.length,
    blockedPaymentRepairs: targetBlockers.length,
    reconciliationBlockers,
    preparedRepairs: prepared.map((item) => ({
      employeeNumber: item.employeeNumber,
      employeeName: item.employeeName,
      missingBefore: item.missingBefore,
      changedFields: item.changedFields,
      missingAfter: item.missingAfter,
      sourceAccountNumberMasked: item.sourceAccountNumberMasked,
    })),
    blockedRepairs: targetBlockers,
    samples: {
      missingDbEmployees: missingDbEmployees.slice(0, 10),
      unmatchedDatabaseEmployees: unmatchedDatabaseEmployees.slice(0, 10),
      nameMismatches: nameMismatches.slice(0, 10),
      hireDateMismatches: hireDateMismatches.slice(0, 10),
    },
  };

  console.log(JSON.stringify(preview, null, 2));

  if (!args.apply) {
    console.log("\nPREVIEW ONLY: no payment-profile data was changed.");
    console.log("Run again with --apply only when reconciliationBlockers=0 and blockedPaymentRepairs=0.");
    return;
  }

  if (employees.length !== EXPECTED_EMPLOYEES || numberedSource.length !== EXPECTED_EMPLOYEES) {
    throw new Error(`Apply aborted: expected ${EXPECTED_EMPLOYEES} current employees and source rows.`);
  }
  if (reconciliationBlockers) {
    throw new Error(`Apply aborted: ${reconciliationBlockers} source/database reconciliation blocker(s) remain.`);
  }
  if (targetBlockers.length) {
    throw new Error(`Apply aborted: ${targetBlockers.length} payment profile(s) cannot be repaired safely.`);
  }
  if (!prepared.length && blockedNumbers.size) {
    throw new Error("Apply aborted: payment blockers exist but no safe repairs were prepared.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const item of prepared) {
      const sectionData = item.onboarding.sectionData && typeof item.onboarding.sectionData === "object"
        ? { ...item.onboarding.sectionData }
        : {};
      const sectionKey = paymentSectionKey(sectionData);
      sectionData[sectionKey] = item.next;

      await tx.employeeOnboarding.update({
        where: { id: item.onboarding.id },
        data: { sectionData },
      });

      await tx.organizationAudit.create({
        data: {
          organizationId: organization.id,
          actorUserId: null,
          entityType: "EmployeeOnboardingPaymentProfile",
          entityId: item.onboarding.id,
          action: "BACKFILLED_PAYMENT_PROFILE_FROM_WORKBOOK",
          previousValue: {
            employeeNumber: item.employeeNumber,
            missingFields: item.missingBefore,
            accountNumberMasked: maskAccountNumber(item.current.accountNumber),
          },
          newValue: {
            employeeNumber: item.employeeNumber,
            changedFields: item.changedFields,
            accountNumberMasked: maskAccountNumber(item.next.accountNumber),
          },
          reason: "Completed missing ZERMATT payroll payment-profile fields from the already supplied workforce migration workbook.",
        },
      });
      count += 1;
    }
    return count;
  });

  const readinessAfter = await getPayrollReadiness({ organizationId: organization.id, prismaClient: prisma });
  console.log(JSON.stringify({
    paymentProfilesUpdated: updated,
    paymentReadyAfter: readinessAfter.summary.paymentReady,
    readyForExecutionAfter: readinessAfter.summary.readyForExecution,
    executionEnabledAfter: readinessAfter.executionEnabled,
    statutoryCalculationEnabledAfter: readinessAfter.statutoryCalculationEnabled,
    remainingPaymentBlockers: readinessAfter.employees.filter((employee) => employee.blockers.includes("PAYMENT_PROFILE_INCOMPLETE")).map((employee) => employee.employeeNumber),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
