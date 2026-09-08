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

function detectDesignationCycles(designations) {
  const byId = new Map(designations.map((item) => [item.id, item]));
  const cycles = [];
  const signatures = new Set();

  for (const designation of designations) {
    const chain = [];
    const seenAt = new Map();
    let cursor = designation;
    while (cursor?.reportsToDesignationId) {
      if (seenAt.has(cursor.id)) {
        const start = seenAt.get(cursor.id);
        const cycle = chain.slice(start).concat(cursor.id);
        const names = cycle.map((id) => byId.get(id)?.code || byId.get(id)?.name || id);
        const signature = [...new Set(names)].sort().join("|");
        if (!signatures.has(signature)) {
          signatures.add(signature);
          cycles.push(names);
        }
        break;
      }
      seenAt.set(cursor.id, chain.length);
      chain.push(cursor.id);
      cursor = byId.get(cursor.reportsToDesignationId) || null;
    }
  }
  return cycles;
}

function rankCandidate(employee, candidate) {
  let score = 0;
  if (employee.locationId && candidate.locationId === employee.locationId) score += 100;
  if (employee.departmentId && candidate.departmentId === employee.departmentId) score += 20;
  return score;
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
        careerTrack: true,
        careerLevel: true,
        isActive: true,
        reportsToDesignationId: true,
        reportsToDesignation: {
          select: { id: true, name: true, code: true, careerLevel: true, departmentId: true },
        },
        _count: { select: { employees: true } },
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
            reportsToDesignation: {
              select: { id: true, name: true, code: true, careerLevel: true },
            },
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
            employeeNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            designationId: true,
            designation: { select: { name: true, code: true } },
            locationId: true,
          },
        },
      },
    }),
  ]);

  const employeeById = new Map(employees.map((item) => [item.id, item]));
  const assignmentByEmployeeId = new Map(existingAssignments.map((item) => [item.employeeId, item]));
  const employeesByDesignationId = new Map();
  for (const employee of employees) {
    if (!employee.designationId) continue;
    if (!employeesByDesignationId.has(employee.designationId)) {
      employeesByDesignationId.set(employee.designationId, []);
    }
    employeesByDesignationId.get(employee.designationId).push(employee);
  }

  const designationRows = designations.map((designation) => ({
    DesignationCode: designation.code || "",
    Designation: designation.name,
    CareerLevelInternal: designation.careerLevel ?? "",
    Active: designation.isActive !== false ? "YES" : "NO",
    CurrentEmployees: designation._count.employees,
    ReportsToDesignationCode: designation.reportsToDesignation?.code || "",
    ReportsToDesignation: designation.reportsToDesignation?.name || "",
    ReportsToLevelInternal: designation.reportsToDesignation?.careerLevel ?? "",
    HierarchyConfigured: designation.reportsToDesignationId ? "YES" : "NO",
  }));

  const employeeRows = [];
  const statusCounts = new Map();

  for (const employee of employees) {
    const expectedDesignation = employee.designation?.reportsToDesignation || null;
    const expectedDesignationId = employee.designation?.reportsToDesignationId || null;
    const currentAssignment = assignmentByEmployeeId.get(employee.id) || null;
    const allCandidates = expectedDesignationId
      ? (employeesByDesignationId.get(expectedDesignationId) || []).filter((candidate) => candidate.id !== employee.id)
      : [];

    const rankedCandidates = allCandidates
      .map((candidate) => ({ candidate, score: rankCandidate(employee, candidate) }))
      .sort((left, right) => right.score - left.score || left.candidate.employeeNumber.localeCompare(right.candidate.employeeNumber));
    const topScore = rankedCandidates[0]?.score ?? null;
    const topCandidates = topScore == null
      ? []
      : rankedCandidates.filter((item) => item.score === topScore).map((item) => item.candidate);

    let hierarchyStatus;
    if (!employee.designationId) hierarchyStatus = "EMPLOYEE_DESIGNATION_MISSING";
    else if (!expectedDesignationId) hierarchyStatus = "NO_REPORTS_TO_DESIGNATION";
    else if (!allCandidates.length) hierarchyStatus = "NO_CURRENT_MANAGER_CANDIDATE";
    else if (currentAssignment && currentAssignment.manager?.designationId === expectedDesignationId) hierarchyStatus = "CURRENT_MANAGER_MATCHES_HIERARCHY";
    else if (currentAssignment) hierarchyStatus = "CURRENT_MANAGER_OUTSIDE_HIERARCHY";
    else if (topCandidates.length === 1) hierarchyStatus = "UNIQUE_TOP_CANDIDATE";
    else hierarchyStatus = "MULTIPLE_TOP_CANDIDATES";

    statusCounts.set(hierarchyStatus, (statusCounts.get(hierarchyStatus) || 0) + 1);

    employeeRows.push({
      EmployeeNumber: employee.employeeNumber,
      EmployeeName: employeeName(employee),
      Status: employee.status,
      EmploymentType: employee.employmentType || "",
      Department: employee.department?.name || "",
      Location: employee.location?.name || "",
      DesignationCode: employee.designation?.code || "",
      Designation: employee.designation?.name || "",
      LevelInternal: employee.designation?.careerLevel ?? "",
      ExpectedManagerDesignationCode: expectedDesignation?.code || "",
      ExpectedManagerDesignation: expectedDesignation?.name || "",
      CurrentManagerEmployeeNumber: currentAssignment?.manager?.employeeNumber || "",
      CurrentManagerName: currentAssignment?.manager ? employeeName(currentAssignment.manager) : "",
      CurrentManagerDesignationCode: currentAssignment?.manager?.designation?.code || "",
      CurrentManagerDesignation: currentAssignment?.manager?.designation?.name || "",
      CandidateCount: allCandidates.length,
      TopCandidateCount: topCandidates.length,
      SuggestedManagerEmployeeNumber: topCandidates.length === 1 ? topCandidates[0].employeeNumber : "",
      SuggestedManagerName: topCandidates.length === 1 ? employeeName(topCandidates[0]) : "",
      SuggestedManagerLocation: topCandidates.length === 1 ? topCandidates[0].location?.name || "" : "",
      HierarchyStatus: hierarchyStatus,
    });
  }

  const cycles = detectDesignationCycles(designations);
  const configuredDesignations = designations.filter((item) => item.reportsToDesignationId).length;
  const unconfiguredDesignations = designations.length - configuredDesignations;

  const designationFile = `zermatt-line-manager-designation-hierarchy-preview.csv`;
  const employeeFile = `zermatt-line-manager-employee-impact-preview.csv`;
  const summaryFile = `zermatt-line-manager-hierarchy-summary.json`;

  writeCsv(designationFile, designationRows, Object.keys(designationRows[0] || {}));
  writeCsv(employeeFile, employeeRows, Object.keys(employeeRows[0] || {}));

  const summary = {
    organization: organization.name,
    currentEmployees: employees.length,
    designations: designations.length,
    designationsWithReportsTo: configuredDesignations,
    designationsWithoutReportsTo: unconfiguredDesignations,
    existingCurrentLineManagerAssignments: existingAssignments.length,
    designationHierarchyCycles: cycles,
    employeeHierarchyStatuses: Object.fromEntries([...statusCounts.entries()].sort()),
    controls: {
      databaseWritesIssued: 0,
      candidateRanking: "Exact reports-to designation required; same location +100, same department +20; no automatic write.",
      hierarchyOverridePolicyProposed: "Managers outside the configured reports-to designation require authorized HR override with reason.",
    },
  };
  fs.writeFileSync(path.resolve(process.cwd(), summaryFile), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("\n============================================================");
  console.log("ZERMATT LINE MANAGER HIERARCHY — READ-ONLY IMPACT PREVIEW");
  console.log("============================================================");
  console.log(`Organization: ${organization.name}`);
  console.log(`Current Employees: ${employees.length}`);
  console.log(`Designations: ${designations.length}`);
  console.log(`Designations with Reports-To configured: ${configuredDesignations}`);
  console.log(`Designations without Reports-To configured: ${unconfiguredDesignations}`);
  console.log(`Existing current Line Manager assignments: ${existingAssignments.length}`);
  console.log(`Designation hierarchy cycles: ${cycles.length}`);
  console.log("\nEMPLOYEE HIERARCHY STATUS");
  console.table([...statusCounts.entries()].map(([Status, Employees]) => ({ Status, Employees })));
  if (cycles.length) {
    console.log("\nDESIGNATION HIERARCHY CYCLES");
    cycles.forEach((cycle, index) => console.log(`${index + 1}. ${cycle.join(" -> ")}`));
  }
  console.log("\nFILES GENERATED");
  console.log(`- ${path.resolve(process.cwd(), designationFile)}`);
  console.log(`- ${path.resolve(process.cwd(), employeeFile)}`);
  console.log(`- ${path.resolve(process.cwd(), summaryFile)}`);
  console.log("\nDATABASE WRITES: NONE");
  console.log("============================================================\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
