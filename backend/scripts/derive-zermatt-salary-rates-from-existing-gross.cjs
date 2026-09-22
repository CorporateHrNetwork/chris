const crypto = require("crypto");
const prisma = require("../src/config/prisma");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const DEFAULT_EFFECTIVE_FROM = "2026-09-01";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

const EXACT_GROSS_KEYS = new Set([
  "monthlygrosssalary",
  "monthlygross",
  "grossmonthlysalary",
  "grosssalary",
  "monthlygrosspay",
  "grossmonthlypay",
  "grosspay",
  "grossremuneration",
  "monthlyremuneration",
  "monthlysalary",
  "salarygross",
]);

const GENERIC_GROSS_PARENT_HINTS = [
  "salary",
  "compensation",
  "payroll",
  "payment",
  "remuneration",
];

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
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

  const number = Number(normalized);
  return Number.isFinite(number) && number > 0
    ? Math.round(number * 100) / 100
    : null;
}

function isGrossKey(key, path) {
  const normalized = normalizeKey(key);
  if (EXACT_GROSS_KEYS.has(normalized)) return true;
  if (normalized !== "gross") return false;

  const parentPath = path.map(normalizeKey).join(".");
  return GENERIC_GROSS_PARENT_HINTS.some((hint) => parentPath.includes(hint));
}

function findGrossCandidates(node, path = [], results = []) {
  if (!node || typeof node !== "object") return results;

  if (Array.isArray(node)) {
    node.forEach((value, index) => {
      findGrossCandidates(value, [...path, String(index)], results);
    });
    return results;
  }

  for (const [key, value] of Object.entries(node)) {
    const nextPath = [...path, key];

    if (isGrossKey(key, path)) {
      const amount = parseMoney(value);
      if (amount !== null) {
        results.push({
          path: nextPath.join("."),
          amount,
        });
      }
    }

    if (value && typeof value === "object") {
      findGrossCandidates(value, nextPath, results);
    }
  }

  return results;
}

function findCurrency(node) {
  const candidates = [];

  function walk(value, path = []) {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...path, String(index)]));
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const normalized = normalizeKey(key);
      if (["payrollcurrency", "salarycurrency", "currency"].includes(normalized)) {
        const currency = clean(child).toUpperCase();
        if (/^[A-Z]{3}$/.test(currency)) {
          const priority = normalized === "payrollcurrency" ? 3 : normalized === "salarycurrency" ? 2 : 1;
          candidates.push({ currency, priority, path: [...path, key].join(".") });
        }
      }
      if (child && typeof child === "object") walk(child, [...path, key]);
    }
  }

  walk(node);
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0] || null;
}

function dateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = {
    apply: false,
    effectiveFrom: DEFAULT_EFFECTIVE_FROM,
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    if (arg.startsWith("--effective-from=")) {
      args.effectiveFrom = arg.slice("--effective-from=".length);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.effectiveFrom)) {
    throw new Error("--effective-from must use YYYY-MM-DD.");
  }

  return args;
}

async function candidateDatabaseColumns() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT table_name AS "tableName", column_name AS "columnName", data_type AS "dataType"
    FROM information_schema.columns
    WHERE table_schema='public'
      AND (
        lower(column_name) LIKE '%gross%'
        OR lower(column_name) LIKE '%salary%'
        OR lower(column_name) LIKE '%compensation%'
        OR lower(column_name) LIKE '%remuneration%'
      )
      AND table_name <> 'payroll_salary_rates'
    ORDER BY table_name, ordinal_position
  `);

  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const org = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, slug: true, currency: true },
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
      onboardings: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          sectionData: true,
          updatedAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { employeeNumber: "asc" },
  });

  const rateRows = await prisma.$queryRawUnsafe(
    `SELECT "id","employeeId","amount","currency","effectiveFrom","effectiveTo","status"
       FROM "payroll_salary_rates"
      WHERE "organizationId"=$1 AND "status"='ACTIVE'`,
    org.id
  );

  const overlappingRateByEmployee = new Map();
  for (const row of rateRows) {
    const from = dateOnly(row.effectiveFrom);
    const to = dateOnly(row.effectiveTo);
    if (
      from &&
      from <= args.effectiveFrom &&
      (!to || to >= args.effectiveFrom)
    ) {
      overlappingRateByEmployee.set(row.employeeId, row);
    }
  }

  const sourcePathCounts = {};
  const employmentTypeCounts = {};
  const prepared = [];
  const missingGross = [];
  const ambiguousGross = [];
  const existingRates = [];
  const existingRateConflicts = [];

  for (const employee of employees) {
    employmentTypeCounts[employee.employmentType || "(missing)"] =
      (employmentTypeCounts[employee.employmentType || "(missing)"] || 0) + 1;

    const existingRate = overlappingRateByEmployee.get(employee.id) || null;
    let source = null;
    let ambiguity = null;

    for (const onboarding of employee.onboardings || []) {
      const candidates = findGrossCandidates(onboarding.sectionData || {});
      if (!candidates.length) continue;

      const uniqueAmounts = [...new Set(candidates.map((item) => item.amount))];
      if (uniqueAmounts.length > 1) {
        ambiguity = {
          onboardingId: onboarding.id,
          candidates,
        };
        break;
      }

      const amount = uniqueAmounts[0];
      const matchingPaths = candidates
        .filter((item) => item.amount === amount)
        .map((item) => item.path);
      const currencyResult = findCurrency(onboarding.sectionData || {});

      source = {
        amount,
        currency: currencyResult?.currency || org.currency || "NGN",
        sourcePath: matchingPaths.join(" | "),
        onboardingId: onboarding.id,
        onboardingUpdatedAt: onboarding.updatedAt,
      };
      break;
    }

    const label = {
      employeeNumber: employee.employeeNumber,
      employeeName: [employee.firstName, employee.middleName, employee.lastName]
        .filter(Boolean)
        .join(" "),
      employmentType: employee.employmentType,
    };

    if (ambiguity) {
      ambiguousGross.push({
        ...label,
        onboardingId: ambiguity.onboardingId,
        candidates: ambiguity.candidates,
      });
      continue;
    }

    if (existingRate) {
      existingRates.push({
        ...label,
        amount: Number(existingRate.amount || 0),
        currency: existingRate.currency,
        effectiveFrom: dateOnly(existingRate.effectiveFrom),
        effectiveTo: dateOnly(existingRate.effectiveTo),
      });

      if (source && Math.abs(Number(existingRate.amount || 0) - source.amount) > 0.009) {
        existingRateConflicts.push({
          ...label,
          storedGross: source.amount,
          existingSalaryRate: Number(existingRate.amount || 0),
          sourcePath: source.sourcePath,
        });
      }
      continue;
    }

    if (!source) {
      missingGross.push(label);
      continue;
    }

    sourcePathCounts[source.sourcePath] = (sourcePathCounts[source.sourcePath] || 0) + 1;
    prepared.push({
      employee,
      ...source,
    });
  }

  const databaseCandidates =
    missingGross.length || ambiguousGross.length
      ? await candidateDatabaseColumns()
      : [];

  const preview = {
    mode: args.apply ? "APPLY" : "PREVIEW",
    organization: org.name,
    effectiveFrom: args.effectiveFrom,
    currentEmployees: employees.length,
    employmentTypeCounts,
    existingEffectiveSalaryRates: existingRates.length,
    derivableMissingSalaryRates: prepared.length,
    missingGross: missingGross.length,
    ambiguousGross: ambiguousGross.length,
    existingRateConflicts: existingRateConflicts.length,
    sourcePathCounts,
    expectedSalaryRatesAfter:
      existingRates.length + prepared.length,
    missingGrossEmployees: missingGross.slice(0, 25),
    ambiguousGrossEmployees: ambiguousGross.slice(0, 25),
    conflictingExistingRates: existingRateConflicts.slice(0, 25),
    candidateDatabaseColumns: databaseCandidates,
  };

  if (!args.apply) {
    console.log(JSON.stringify(preview, null, 2));
    console.log("\nPREVIEW ONLY: no salary-rate data was changed.");
    console.log("Run again with --apply only after the preview is clean.");
    return;
  }

  if (ambiguousGross.length) {
    throw new Error(
      `Apply aborted: ${ambiguousGross.length} employee(s) have conflicting gross values in the latest onboarding record containing gross salary.`
    );
  }

  if (missingGross.length) {
    throw new Error(
      `Apply aborted: ${missingGross.length} employee(s) without an effective salary rate have no discoverable stored monthly gross salary.`
    );
  }

  if (existingRateConflicts.length) {
    throw new Error(
      `Apply aborted: ${existingRateConflicts.length} existing effective salary rate(s) differ from the stored gross salary. Existing salary authority will not be overwritten automatically.`
    );
  }

  if (employees.length !== 312) {
    throw new Error(
      `Apply aborted: expected 312 current ZERMATT employees for this Release-1 backfill, found ${employees.length}.`
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    let createdCount = 0;

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
        "Derived from existing stored ZERMATT gross salary — Release-1 opening payroll authority"
      );

      await tx.organizationAudit.create({
        data: {
          organizationId: org.id,
          actorUserId: null,
          entityType: "PayrollSalaryRate",
          entityId: rateId,
          action: "DERIVED_FROM_EXISTING_GROSS",
          newValue: {
            employeeNumber: item.employee.employeeNumber,
            monthlyGrossSalary: item.amount,
            currency: item.currency,
            effectiveFrom: args.effectiveFrom,
            source: "EmployeeOnboarding.sectionData",
            sourcePath: item.sourcePath,
            sourceOnboardingId: item.onboardingId,
          },
          reason: "Promoted existing stored gross salary into the effective-dated Payroll Salary Rate register.",
        },
      });

      createdCount += 1;
    }

    return createdCount;
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
        ...preview,
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
