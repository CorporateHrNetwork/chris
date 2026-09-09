require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const prisma = require("../src/config/prisma");

const ORGANIZATION_SLUG = "zermatt-liquor-limited";
const CURRENT_STATUSES = ["ACTIVE", "PROBATION", "LEAVE", "SUSPENDED"];
const TARGETS = [
  { requestedName: "Ann Favour Joseph", branchCode: "ABJ" },
  { requestedName: "Angel Williams", branchCode: "PHC" },
  { requestedName: "Augustina Anienwe", branchCode: "LAG" },
];

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function tokens(value) {
  return normalize(value).split(" ").filter(Boolean);
}

function fullName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
}

function levenshtein(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  const dp = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= right.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[left.length][right.length];
}

function scoreCandidate(requestedName, employeeName) {
  const requestedTokens = new Set(tokens(requestedName));
  const employeeTokens = new Set(tokens(employeeName));
  let overlap = 0;
  for (const token of requestedTokens) if (employeeTokens.has(token)) overlap += 1;
  const subset = [...requestedTokens].every((token) => employeeTokens.has(token));
  const exact = normalize(requestedName) === normalize(employeeName);
  const distance = levenshtein(requestedName, employeeName);
  return { exact, subset, overlap, distance };
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: ORGANIZATION_SLUG },
    select: { id: true, name: true, status: true },
  });
  assert.ok(organization, "ZERMATT organization was not found.");
  assert.equal(organization.status, "ACTIVE", "ZERMATT organization must be ACTIVE.");

  const locations = await prisma.organizationLocation.findMany({
    where: { organizationId: organization.id, isActive: true, type: "BRANCH" },
    select: { id: true, name: true, code: true },
  });
  const branchByCode = new Map(locations.map((location) => [String(location.code || "").toUpperCase(), location]));

  const employees = await prisma.employee.findMany({
    where: { organizationId: organization.id, status: { in: CURRENT_STATUSES } },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      email: true,
      status: true,
      locationId: true,
      designation: { select: { name: true, code: true } },
      user: {
        select: {
          id: true,
          isActive: true,
          locationScope: true,
          userRoles: { select: { role: { select: { name: true } } } },
          userLocations: { select: { location: { select: { code: true, name: true } } } },
        },
      },
    },
    orderBy: { employeeNumber: "asc" },
  });

  const results = TARGETS.map((target) => {
    const branch = branchByCode.get(target.branchCode);
    assert.ok(branch, `Branch ${target.branchCode} was not found.`);
    const branchEmployees = employees.filter((employee) => employee.locationId === branch.id);
    const ranked = branchEmployees
      .map((employee) => {
        const name = fullName(employee);
        const match = scoreCandidate(target.requestedName, name);
        return {
          employeeNumber: employee.employeeNumber,
          employeeName: name,
          designation: employee.designation?.name || null,
          designationCode: employee.designation?.code || null,
          email: employee.email || null,
          status: employee.status,
          exactMatch: match.exact,
          tokenSubsetMatch: match.subset,
          tokenOverlap: match.overlap,
          editDistance: match.distance,
          existingUser: Boolean(employee.user),
          userActive: employee.user?.isActive ?? null,
          locationScope: employee.user?.locationScope || null,
          assignedBranches: (employee.user?.userLocations || []).map((item) => item.location?.code).filter(Boolean),
          roles: (employee.user?.userRoles || []).map((item) => item.role?.name).filter(Boolean),
        };
      })
      .sort((a, b) =>
        Number(b.exactMatch) - Number(a.exactMatch) ||
        Number(b.tokenSubsetMatch) - Number(a.tokenSubsetMatch) ||
        b.tokenOverlap - a.tokenOverlap ||
        a.editDistance - b.editDistance ||
        a.employeeNumber.localeCompare(b.employeeNumber)
      );

    return {
      requestedName: target.requestedName,
      branch: `${branch.name} · ${branch.code}`,
      branchEmployeeCount: branchEmployees.length,
      exactMatches: ranked.filter((row) => row.exactMatch),
      tokenSubsetMatches: ranked.filter((row) => row.tokenSubsetMatch),
      topCandidates: ranked.slice(0, 10),
    };
  });

  console.log("\n============================================================");
  console.log("ZERMATT BRANCH HR TARGET DIAGNOSTIC — READ ONLY");
  console.log("============================================================");
  console.log(JSON.stringify({
    mode: "READ_ONLY_TARGET_DIAGNOSTIC",
    organization: organization.name,
    targets: results,
    databaseWrites: 0,
  }, null, 2));
  console.log("============================================================");
}

main()
  .catch((error) => {
    console.error("\nFAIL: ZERMATT Branch HR target diagnostic failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
