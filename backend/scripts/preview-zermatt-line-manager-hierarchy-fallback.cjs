require("dotenv").config();
const fs = require("fs");
const path = require("path");
const prisma = require("../src/config/prisma");

const ZERMATT_SLUG = "zermatt-liquor-limited";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ");
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(fileName, rows, headers) {
  const output = [headers.join(",")];
  for (const row of rows) {
    output.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(path.resolve(process.cwd(), fileName), `${output.join("\n")}\n`, "utf8");
}

function rankCandidate(employee, candidate) {
  let score = 0;
  if (employee.locationId && candidate.locationId === employee.locationId) score += 100;
  if (employee.departmentId && candidate.departmentId === employee.departmentId) score += 20;
  return score;
}

function topCandidates(employee, candidates) {
  const ranked = candidates
    .filter((candidate) => candidate.id !== employee.id)
    .map((candidate) => ({ candidate, score: rankCandidate(employee, candidate) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.employeeNumber.localeCompare(right.candidate.employeeNumber)
    );
  const topScore = ranked[0]?.score ?? null;
  if (topScore == null) return [];
  return ranked.filter((item) => item.score === topScore).map((item) => item.candidate);
}

function walkHierarchy(startDesignationId, designationById) {
  const chain = [];
  const seen = new Set();
  let cursor = designationById.get(startDesignationId) || null;
  while (cursor?.reportsToDesignationId) {
    if (seen.has(cursor.id)) {
      const error = new Error("DESIGNATION_HIERARCHY_CYCLE");
      error.details = chain.map((item) => item.code || item.name);
      throw error;
    }
    seen.add(cursor.id);
    const parent = designationById.get(cursor.reportsToDesignationId) || null;
    if (!parent) break;
    chain.push(parent);
    cursor = parent;
  }
  return chain;
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ZERMATT_SLUG },
    select: { id: true, name: true },
  });
  if (!organization) throw new Error("ZERMATT_ORGANIZATION_NOT_FOUND");

  const [designations, employees, existingAssignments] = await Promise.all([
    prisma.designation.findMany({
      where: { organizationId: organization.id },
      select: {
        id: true,
        name: true,
        code: true,
        departmentId: true,
        careerLevel: true,
        reportsToDesignationId: true,
      },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    prisma.employee.findMany({
      where: {
        organizationId: organization.id,
        status: { in: CURRENT_STATUSES },
        exitDate: null,
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        status: true,
        departmentId: true,
        locationId: true,
        employmentType: true,
        department: { select: { name: true, code: true } },
        location: { select: { name: true, code: true } },
        designationId: true,
        designation: {
          select: {
            id: true,
            name: true,
            code: true,
            careerLevel: true,
            reportsToDesignationId: true,
          },
        },
      },
      orderBy: { employeeNumber: "asc" },
    }),
    prisma.employeeLineManagerAssignment.findMany({
      where: { organizationId: organization.id, effectiveTo: null },
      select: {
        employeeId: true,
        managerEmployeeId: true,
        effectiveFrom: true,
        manager: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            designationId: true,
            designation: { select: { name: true, code: true } },
            locationId: true,
            departmentId: true,
          },
        },
      },
    }),
  ]);

  const designationById = new Map(designations.map((item) => [item.id, item]));
  const employeesByDesignationId = new Map();
  for (const employee of employees) {
    if (!employee.designationId) continue;
    if (!employeesByDesignationId.has(employee.designationId)) {
      employeesByDesignationId.set(employee.designationId, []);
    }
    employeesByDesignationId.get(employee.designationId).push(employee);
  }
  const assignmentByEmployeeId = new Map(
    existingAssignments.map((item) => [item.employeeId, item])
  );

  const rows = [];
  const statusCounts = new Map();

  for (const employee of employees) {
    const currentAssignment = assignmentByEmployeeId.get(employee.id) || null;
    let status = "";
    let resolvedDesignation = null;
    let hierarchyHops = 0;
    let candidatePool = [];
    let top = [];
    let chain = [];

    if (!employee.designationId || !employee.designation) {
      status = "EMPLOYEE_DESIGNATION_MISSING";
    } else {
      chain = walkHierarchy(employee.designationId, designationById);
      if (!chain.length) {
        status = "TOP_LEVEL_NO_MANAGER";
      } else {
        for (let index = 0; index < chain.length; index += 1) {
          const ancestor = chain[index];
          const candidates = (employeesByDesignationId.get(ancestor.id) || []).filter(
            (candidate) => candidate.id !== employee.id
          );
          if (!candidates.length) continue;
          resolvedDesignation = ancestor;
          hierarchyHops = index + 1;
          candidatePool = candidates;
          top = topCandidates(employee, candidates);
          break;
        }

        if (!resolvedDesignation) {
          status = "NO_MANAGER_IN_HIERARCHY";
        } else if (
          currentAssignment &&
          currentAssignment.manager?.designationId === resolvedDesignation.id
        ) {
          status =
            hierarchyHops === 1
              ? "CURRENT_MANAGER_MATCHES_DIRECT_HIERARCHY"
              : "CURRENT_MANAGER_MATCHES_FALLBACK_HIERARCHY";
        } else if (currentAssignment) {
          status = "CURRENT_MANAGER_OUTSIDE_RESOLVED_HIERARCHY";
        } else if (top.length === 1) {
          status =
            hierarchyHops === 1
              ? "DIRECT_UNIQUE_TOP_CANDIDATE"
              : "FALLBACK_UNIQUE_TOP_CANDIDATE";
        } else {
          status =
            hierarchyHops === 1
              ? "DIRECT_MULTIPLE_TOP_CANDIDATES"
              : "FALLBACK_MULTIPLE_TOP_CANDIDATES";
        }
      }
    }

    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    const suggested = top.length === 1 ? top[0] : null;
    const directDesignation = chain[0] || null;

    rows.push({
      EmployeeNumber: employee.employeeNumber,
      EmployeeName: employeeName(employee),
      Status: employee.status,
      EmploymentType: employee.employmentType || "",
      Department: employee.department?.name || "",
      Location: employee.location?.name || "",
      DesignationCode: employee.designation?.code || "",
      Designation: employee.designation?.name || "",
      LevelInternal: employee.designation?.careerLevel ?? "",
      DirectReportsToCode: directDesignation?.code || "",
      DirectReportsToDesignation: directDesignation?.name || "",
      ResolvedManagerDesignationCode: resolvedDesignation?.code || "",
      ResolvedManagerDesignation: resolvedDesignation?.name || "",
      HierarchyHops: hierarchyHops || "",
      CandidateCount: candidatePool.length,
      TopCandidateCount: top.length,
      SuggestedManagerEmployeeNumber: suggested?.employeeNumber || "",
      SuggestedManagerName: suggested ? employeeName(suggested) : "",
      SuggestedManagerLocation: suggested?.location?.name || "",
      CurrentManagerEmployeeNumber: currentAssignment?.manager?.employeeNumber || "",
      CurrentManagerName: currentAssignment?.manager
        ? employeeName(currentAssignment.manager)
        : "",
      CurrentManagerDesignationCode: currentAssignment?.manager?.designation?.code || "",
      ResolutionStatus: status,
    });
  }

  const roots = designations
    .filter((designation) => !designation.reportsToDesignationId)
    .map((designation) => ({
      DesignationCode: designation.code || "",
      Designation: designation.name,
      LevelInternal: designation.careerLevel ?? "",
      CurrentEmployees: (employeesByDesignationId.get(designation.id) || []).length,
      CurrentEmployeeNumbers: (employeesByDesignationId.get(designation.id) || [])
        .map((employee) => employee.employeeNumber)
        .join("; "),
      CurrentEmployeeNames: (employeesByDesignationId.get(designation.id) || [])
        .map(employeeName)
        .join("; "),
    }));

  const employeeFile = "zermatt-line-manager-hierarchy-fallback-preview.csv";
  const rootFile = "zermatt-line-manager-hierarchy-roots-preview.csv";
  const summaryFile = "zermatt-line-manager-hierarchy-fallback-summary.json";

  writeCsv(employeeFile, rows, Object.keys(rows[0] || {}));
  writeCsv(rootFile, roots, Object.keys(roots[0] || {
    DesignationCode: "",
    Designation: "",
    LevelInternal: "",
    CurrentEmployees: "",
    CurrentEmployeeNumbers: "",
    CurrentEmployeeNames: "",
  }));

  const unresolvedStatuses = new Set([
    "EMPLOYEE_DESIGNATION_MISSING",
    "NO_MANAGER_IN_HIERARCHY",
    "DIRECT_MULTIPLE_TOP_CANDIDATES",
    "FALLBACK_MULTIPLE_TOP_CANDIDATES",
    "CURRENT_MANAGER_OUTSIDE_RESOLVED_HIERARCHY",
  ]);

  const summary = {
    organization: organization.name,
    currentEmployees: employees.length,
    designations: designations.length,
    roots: roots.length,
    existingCurrentLineManagerAssignments: existingAssignments.length,
    resolutionStatuses: Object.fromEntries([...statusCounts.entries()].sort()),
    uniquelySuggestedEmployees: rows.filter((row) =>
      ["DIRECT_UNIQUE_TOP_CANDIDATE", "FALLBACK_UNIQUE_TOP_CANDIDATE"].includes(
        row.ResolutionStatus
      )
    ).length,
    unresolvedEmployees: rows.filter((row) => unresolvedStatuses.has(row.ResolutionStatus)).length,
    topLevelEmployees: rows.filter((row) => row.ResolutionStatus === "TOP_LEVEL_NO_MANAGER").length,
    controls: {
      databaseWritesIssued: 0,
      hierarchyRule:
        "Use exact reports-to designation first; when unoccupied, climb to nearest occupied ancestor designation only.",
      candidateRanking:
        "Within the resolved designation: same location +100, same department +20; ties remain manual review.",
      noLateralOrDownwardFallback: true,
      noAutomaticWrite: true,
    },
  };

  fs.writeFileSync(
    path.resolve(process.cwd(), summaryFile),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );

  console.log("\n============================================================");
  console.log("ZERMATT LINE MANAGER HIERARCHY — FALLBACK IMPACT PREVIEW");
  console.log("============================================================");
  console.log(`Organization: ${organization.name}`);
  console.log(`Current Employees: ${employees.length}`);
  console.log(`Designations: ${designations.length}`);
  console.log(`Hierarchy Roots: ${roots.length}`);
  console.log(`Existing current Line Manager assignments: ${existingAssignments.length}`);
  console.log("\nRESOLUTION STATUS");
  console.table([...statusCounts.entries()].map(([Status, Employees]) => ({ Status, Employees })));
  console.log("\nHIERARCHY ROOTS");
  console.table(roots);
  console.log("\nSUMMARY");
  console.log(`Uniquely suggested employees: ${summary.uniquelySuggestedEmployees}`);
  console.log(`Unresolved/manual review employees: ${summary.unresolvedEmployees}`);
  console.log(`Top-level employees requiring no manager: ${summary.topLevelEmployees}`);
  console.log("\nFILES GENERATED");
  console.log(`- ${path.resolve(process.cwd(), employeeFile)}`);
  console.log(`- ${path.resolve(process.cwd(), rootFile)}`);
  console.log(`- ${path.resolve(process.cwd(), summaryFile)}`);
  console.log("\nDATABASE WRITES: NONE");
  console.log("============================================================\n");
}

main()
  .catch((error) => {
    console.error(error);
    if (error?.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
