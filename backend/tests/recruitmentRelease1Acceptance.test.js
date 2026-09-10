const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

function read(...parts) {
  return fs.readFileSync(path.join(...parts), "utf8").replace(/\r\n/g, "\n");
}

function expect(source, fragment, message) {
  assert.ok(source.includes(fragment), message || `Expected source to contain: ${fragment}`);
}

const migration = read(
  backendRoot,
  "prisma",
  "migrations",
  "20260910000500_activate_recruitment_release1",
  "migration.sql"
);
const service = read(backendRoot, "src", "services", "recruitmentService.js");
const route = read(backendRoot, "src", "routes", "recruitmentRoutes.js");
const app = read(backendRoot, "src", "app.js");
const page = read(repoRoot, "src", "pages", "Recruitment.jsx");
const sidebar = read(repoRoot, "src", "components", "layout", "Sidebar", "Sidebar.jsx");

expect(migration, 'CREATE TABLE "recruitment_job_requisitions"', "Recruitment requisition table is missing.");
expect(migration, 'CREATE TABLE "recruitment_requisition_counters"', "Race-safe requisition numbering counter is missing.");
expect(migration, 'FOREIGN KEY ("organizationId", "locationId")', "Requisition location is not tenant-safe at database level.");
expect(migration, 'FOREIGN KEY ("organizationId", "designationId")', "Requisition designation is not tenant-safe at database level.");
expect(migration, "'PENDING_APPROVAL'", "Controlled requisition approval state is missing.");
expect(migration, "'RETURNED'", "Requisition return-for-correction state is missing.");

expect(service, 'resolveDesignation', "Controlled Designation resolver is missing.");
expect(service, 'resolveLocation', "Controlled operating-location resolver is missing.");
expect(service, 'REQ-${year}-${String(sequence).padStart(4, "0")}', "Sequential requisition numbering is missing.");
expect(service, 'RECRUITMENT_REQUISITION_CREATED', "Requisition creation audit is missing.");
expect(service, 'RECRUITMENT_REQUISITION_UPDATED', "Requisition update audit is missing.");
expect(service, 'RECRUITMENT_REQUISITION_SUBMITTED', "Requisition submission audit is missing.");
expect(service, 'RECRUITMENT_REQUISITION_APPROVED_OPENED', "Requisition approval audit is missing.");
expect(service, 'REQUISITION_OUTSIDE_ACTIVE_BRANCH', "Branch creation guard is missing.");

expect(route, 'requirePermission("recruitment.view")', "Recruitment reads are not permission protected.");
expect(route, 'requirePermission("recruitment.manage")', "Recruitment mutations are not permission protected.");
expect(route, 'scopeLocationId: req.auth.activeLocationId || null', "Recruitment workflow is not bound to active branch context.");
expect(route, 'HEAD_OFFICE_REQUIRED_FOR_RECRUITMENT_APPROVAL', "Head Office requisition approval control is missing.");
expect(route, '"/requisitions/:id/decision"', "Requisition decision endpoint is missing.");
expect(app, 'app.use("/api/recruitment", recruitmentRoutes);', "Recruitment Release-1 router is not mounted.");

expect(page, 'apiRequest("/api/recruitment/summary")', "Recruitment Dashboard is not wired to live requisition summary data.");
expect(page, 'apiRequest("/api/recruitment/requisitions")', "Recruitment requisition register is not wired.");
expect(page, 'workspace === "requisitions"', "Recruitment requisition workspace is not active.");
expect(page, 'window.addEventListener("chris:location-context-changed"', "Recruitment does not reload when branch context changes.");
expect(page, 'Approve & Open', "Head Office approve/open control is missing from Recruitment UI.");
expect(page, 'canManage && headOffice', "Head Office-only UI controls are not isolated.");
expect(page, 'Select controlled designation', "Requisition UI is not using the controlled Designation registry.");

for (const [label, activePath] of [
  ["Job Requisitions", "/recruitment?workspace=requisitions"],
  ["Vacancies", "/recruitment/vacancies"],
  ["Candidates", "/recruitment/candidates"],
  ["Interviews", "/recruitment/interviews"],
  ["Offers", "/recruitment/offers"],
  ["Applicant Tracking System", "/recruitment/ats"],
  ["Talent Pool", "/recruitment/talent-pool"],
]) {
  expect(sidebar, `{ label: "${label}", path: "${activePath}" }`, `${label} is not wired to its active Recruitment workspace.`);
  assert.ok(!sidebar.includes(`{ label: "${label}", planned: true }`), `${label} must not display a planned badge after activation.`);
}

console.log("PASS: Recruitment requisition Release-1 acceptance checks.");
