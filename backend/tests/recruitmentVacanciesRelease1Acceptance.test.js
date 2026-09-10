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
  "20260910003000_activate_recruitment_vacancies_release1",
  "migration.sql"
);
const service = read(backendRoot, "src", "services", "recruitmentVacancyService.js");
const route = read(backendRoot, "src", "routes", "recruitmentVacancyRoutes.js");
const app = read(backendRoot, "src", "app.js");
const page = read(repoRoot, "src", "pages", "RecruitmentVacancies.jsx");
const frontendApp = read(repoRoot, "src", "App.jsx");
const sidebar = read(repoRoot, "src", "components", "layout", "Sidebar", "Sidebar.jsx");

expect(migration, 'CREATE TABLE "recruitment_vacancies"', "Vacancy table is missing.");
expect(migration, 'CREATE TABLE "recruitment_vacancy_counters"', "Vacancy numbering counter is missing.");
expect(migration, 'FOREIGN KEY ("requisitionId") REFERENCES "recruitment_job_requisitions"', "Vacancy is not linked to requisition history.");
expect(migration, 'FOREIGN KEY ("organizationId", "locationId")', "Vacancy location is not tenant-safe.");
expect(migration, "'DRAFT','PUBLISHED','CLOSED','CANCELLED'", "Vacancy lifecycle states are incomplete.");
expect(migration, 'CREATE UNIQUE INDEX "recruitment_vacancies_org_requisition_key"', "A requisition can produce duplicate vacancy records.");

expect(service, 'VAC-${year}-${String(sequence).padStart(4, "0")}', "Sequential vacancy numbering is missing.");
expect(service, 'r."status"=\'OPEN\'', "Vacancy creation is not restricted to approved/open requisitions.");
expect(service, 'VACANCY_OPENINGS_EXCEED_REQUISITION', "Approved headcount ceiling guard is missing.");
expect(service, 'RECRUITMENT_VACANCY_CREATED', "Vacancy creation audit is missing.");
expect(service, 'RECRUITMENT_VACANCY_PUBLISHED', "Vacancy publication audit is missing.");
expect(service, 'RECRUITMENT_VACANCY_CLOSED', "Vacancy closure audit is missing.");
expect(service, 'scopeLocationId', "Vacancy service is not branch-scope aware.");

expect(route, 'requirePermission("recruitment.view")', "Vacancy reads are not permission protected.");
expect(route, 'requirePermission("recruitment.manage")', "Vacancy mutations are not permission protected.");
expect(route, 'HEAD_OFFICE_REQUIRED_FOR_VACANCY_PUBLICATION', "Head Office publication control is missing.");
expect(route, '"/vacancies/:id/publish"', "Vacancy publish endpoint is missing.");
expect(route, 'scopeLocationId: req.auth.activeLocationId || null', "Vacancy routes are not tied to active branch context.");
expect(app, 'app.use("/api/recruitment", recruitmentVacancyRoutes);', "Vacancy router is not mounted.");

expect(page, 'apiRequest("/api/recruitment/vacancies")', "Vacancy register is not wired to live data.");
expect(page, 'apiRequest("/api/recruitment/vacancies/options")', "Vacancy creation options are not wired.");
expect(page, 'Select approved/open requisition', "Vacancy creation is not requisition-led in the UI.");
expect(page, 'headOffice && row.status === "DRAFT"', "Publish control is not Head Office isolated in the UI.");
expect(page, 'window.addEventListener("chris:location-context-changed"', "Vacancies do not reload when branch context changes.");
expect(page, 'noEligibleRequisitions', "Vacancies does not detect an empty approved-requisition selector.");
expect(page, 'No approved/open job requisitions are available in this operating context.', "Empty requisition guidance is missing.");
expect(page, 'No approved/open requisitions available', "Empty requisition select does not explain why it has no options.");
expect(page, 'Open Job Requisitions', "Vacancies does not link the user back to the upstream requisition workflow.");
expect(page, 'disabled={noEligibleRequisitions}', "Empty approved-requisition selector must be disabled rather than appearing broken.");

// CHRiS Visual Standard: recruitment workspaces must use the premium dark
// operational language rather than standalone white/light form surfaces.
expect(page, 'className="chris-vacancy-workspace"', "Vacancy workspace is not visually scoped.");
expect(page, 'var(--chris-panel-bg)', "Vacancy panels are not using CHRiS global panel tokens.");
expect(page, 'var(--chris-input-bg)', "Vacancy inputs are not using CHRiS global input tokens.");
expect(page, 'var(--chris-text-main)', "Vacancy workspace is not using CHRiS dark-surface typography tokens.");
expect(page, 'var(--chris-gold)', "Vacancy workspace is missing CHRiS gold action language.");
assert.ok(
  !page.includes('background: "#fff"') && !page.includes('background: "#FFFFFF"'),
  "Vacancy workspace must not regress to standalone white panel/input surfaces."
);

expect(frontendApp, 'import RecruitmentVacancies from "./pages/RecruitmentVacancies";', "Vacancies page is not imported.");
expect(frontendApp, 'path="/recruitment/vacancies"', "Vacancies route is not active.");
expect(frontendApp, '<RecruitmentVacancies />', "Vacancies route is still a placeholder.");
expect(sidebar, '{ label: "Vacancies", path: "/recruitment/vacancies" }', "Vacancies sidebar item is still planned.");
assert.ok(!sidebar.includes('{ label: "Vacancies", planned: true }'), "Vacancies still carries a planned badge.");

console.log("PASS: Recruitment Vacancies Release-1 acceptance checks.");
