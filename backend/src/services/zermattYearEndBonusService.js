// Read-only Zermatt Year-End Bonus projections. No payouts or payroll writes.
const prisma = require("../config/prisma");
const { splitSalary } = require("./zermattSalarySplit");

const dateOnly = (value) => value ? new Date(value).toISOString().slice(0, 10) : null;
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const normalizeType = (value) => String(value || "").trim().toUpperCase().replace(/[\s_-]+/g, "");
const expatriate = (value) => normalizeType(value).includes("EXPATRIATE") || normalizeType(value).includes("EXPAT");
const dateOverlap = (from, to, start, end) => from <= end && (!to || to >= start);
function serviceMonths({ hireDate, exitDate, episodes = [], year, asOf = new Date() }) {
  const intervals = episodes.length
    ? episodes.map((episode) => ({ from: dateOnly(episode.startDate), to: dateOnly(episode.endDate) }))
    : [{ from: dateOnly(hireDate), to: dateOnly(exitDate) }];
  return Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, "0");
    const start = `${year}-${month}-01`;
    const end = new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10);
    return start <= dateOnly(asOf) && intervals.some(({ from, to }) => from && dateOverlap(from, to, start, end));
  }).filter(Boolean).length;
}
function projectBonus({ employee, year, grossMonthly, months }) {
  if (expatriate(employee.employmentType)) return { status: "INELIGIBLE_EXPATRIATE", months: 0, basicSalary: null, endMonthGross: null, fullBonus: 0, bonus: 0 };
  if (!employee.hireDate || !Number.isFinite(Number(grossMonthly)) || Number(grossMonthly) <= 0) {
    return { status: "SALARY_OR_HIRE_DATE_MISSING", months, basicSalary: null, endMonthGross: null, fullBonus: null, bonus: null };
  }
  const split = splitSalary({ fullMonthlyGross: grossMonthly, employmentType: employee.employmentType, hireDate: dateOnly(employee.hireDate), periodMonth: `${year}-12` });
  // Use the authoritative Zermatt end-of-month salary structure, not the mid-month TSP.
  const basicSalary = split.components.basic;
  const endMonthGross = split.endMonthGross;
  const fullBonus = round2(basicSalary + endMonthGross * 0.5);
  return { status: months > 0 ? "PROJECTED" : "NO_SERVICE_IN_YEAR", months, basicSalary, endMonthGross, fullBonus, bonus: round2(fullBonus * months / 12), calculationBasis: split.policyVersion };
}
async function listYearEndBonus({ organizationId, year, locationIds = null, asOf = new Date(), prismaClient = prisma }) {
  const org = await prismaClient.organization.findUnique({ where: { id: organizationId }, select: { slug: true } });
  if (org?.slug !== "zermatt-liquor-limited") {
    const error = new Error("Year-End Bonus register is available to Zermatt only."); error.statusCode = 404; throw error;
  }
  const employees = await prismaClient.employee.findMany({
    where: { organizationId, ...(locationIds === null ? {} : { locationId: { in: locationIds } }) },
    include: { location: { select: { name: true } }, designation: { select: { name: true } }, department: { select: { name: true } }, employmentEpisodes: { select: { startDate: true, endDate: true } } },
    orderBy: { employeeNumber: "asc" },
  });
  const rates = await prismaClient.$queryRawUnsafe(
    `SELECT "employeeId", "amount", "currency", "effectiveFrom", "effectiveTo", "status"
       FROM "payroll_salary_rates" WHERE "organizationId"=$1
         AND "status" IN ('ACTIVE','RETIRED') ORDER BY "effectiveFrom" DESC`, organizationId
  );
  const ratesByEmployee = new Map();
  for (const rate of rates) {
    const list = ratesByEmployee.get(rate.employeeId) || [];
    list.push(rate);
    ratesByEmployee.set(rate.employeeId, list);
  }
  const yearEnd = `${year}-12-31`;
  const reportCutoff = dateOnly(asOf) < yearEnd ? dateOnly(asOf) : yearEnd;
  const rows = employees.map(employee => {
    const months = serviceMonths({ hireDate: employee.hireDate, exitDate: employee.exitDate, episodes: employee.employmentEpisodes, year, asOf });
    const salaryAsOf = employee.exitDate && dateOnly(employee.exitDate) < reportCutoff ? dateOnly(employee.exitDate) : reportCutoff;
    const payRate = (ratesByEmployee.get(employee.id) || []).find(rate =>
      dateOnly(rate.effectiveFrom) <= salaryAsOf && (!rate.effectiveTo || dateOnly(rate.effectiveTo) >= salaryAsOf)
    );
    const calculation = projectBonus({ employee, year, grossMonthly: payRate?.amount, months });
    return {
      employeeNumber: employee.employeeNumber,
      employeeName: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
      location: employee.location?.name || "Unassigned",
      designation: employee.designation?.name || "",
      department: employee.department?.name || "",
      employmentType: employee.employmentType || "",
      hireDate: dateOnly(employee.hireDate),
      exitDate: dateOnly(employee.exitDate),
      grossMonthly: payRate?.amount ?? null,
      currency: payRate?.currency || "NGN",
      ...calculation,
    };
  });
  return {
    year, asOfDate: reportCutoff, rows,
    summary: {
      employees: rows.length,
      eligible: rows.filter(row => row.status === "PROJECTED").length,
      expatriatesExcluded: rows.filter(row => row.status === "INELIGIBLE_EXPATRIATE").length,
      incomplete: rows.filter(row => row.status === "SALARY_OR_HIRE_DATE_MISSING").length,
      projectedTotal: round2(rows.reduce((sum, row) => sum + Number(row.bonus || 0), 0)),
    },
    policy: "Basic Salary + (50% of End-of-Month Gross), prorated by actual engaged calendar months through the reporting date / 12. Expatriates excluded. Read-only projections; no payments are approved.",
  };
}
module.exports = { serviceMonths, projectBonus, listYearEndBonus };
