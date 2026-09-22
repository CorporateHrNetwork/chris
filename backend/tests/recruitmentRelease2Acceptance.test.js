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

const migration = read(backendRoot, "prisma", "migrations", "20260910010000_activate_recruitment_release2", "migration.sql");
const service = read(backendRoot, "src", "services", "recruitmentTalentService.js");
const routes = read(backendRoot, "src", "routes", "recruitmentTalentRoutes.js");
const app = read(backendRoot, "src", "app.js");
const frontendApp = read(repoRoot, "src", "App.jsx");
const workspace = read(repoRoot, "src", "pages", "RecruitmentTalentWorkspace.jsx");
const sidebar = read(repoRoot, "src", "components", "layout", "Sidebar", "Sidebar.jsx");
const vacancies = read(repoRoot, "src", "pages", "RecruitmentVacancies.jsx");

for (const table of [
  "recruitment_candidates",
  "recruitment_applications",
  "recruitment_application_stage_history",
  "recruitment_interviews",
  "recruitment_offers",
]) {
  expect(migration, `CREATE TABLE \"${table}\"`, `${table} table is missing.`);
}
expect(migration, 'CREATE UNIQUE INDEX "recruitment_candidates_org_email_key"', "Candidate email uniqueness is missing.");
expect(migration, 'LOWER("email")', "Candidate duplicate protection is not case-insensitive.");
expect(migration, 'CREATE UNIQUE INDEX "recruitment_applications_org_candidate_vacancy_key"', "Duplicate application protection is missing.");
expect(migration, 'FOREIGN KEY ("organizationId", "candidateId")', "Candidate/application tenant-safe FK is missing.");
expect(migration, 'FOREIGN KEY ("organizationId", "vacancyId")', "Vacancy/application tenant-safe FK is missing.");
expect(migration, '"privacyConsent" BOOLEAN NOT NULL DEFAULT FALSE', "Candidate privacy-consent evidence is missing.");
expect(migration, "'APPLIED','SCREENING','SHORTLISTED','INTERVIEW','OFFER','HIRED','REJECTED','WITHDRAWN','TALENT_POOL'", "ATS lifecycle is incomplete.");
expect(migration, "'DRAFT','PENDING_APPROVAL','APPROVED','ISSUED','ACCEPTED','DECLINED','WITHDRAWN','EXPIRED'", "Offer lifecycle is incomplete.");

expect(service, 'CANDIDATE_PRIVACY_CONSENT_REQUIRED', "Candidate consent is not enforced.");
expect(service, 'CANDIDATE_EMAIL_EXISTS', "Candidate duplicate-email guard is missing.");
expect(service, 'DUPLICATE_CANDIDATE_APPLICATION', "Duplicate candidate/vacancy guard is missing.");
expect(service, 'HEAD_OFFICE_REQUIRED_FOR_SHARED_CANDIDATE', "Cross-branch candidate master guard is missing.");
expect(service, 'appendStageHistory', "Immutable ATS stage history is missing.");
expect(service, 'INVALID_APPLICATION_STAGE_TRANSITION', "ATS transition validation is missing.");
expect(service, 'COMPLETED_INTERVIEW_REQUIRED', "Offer preparation can bypass completed interview evidence.");
expect(service, 'RECRUITMENT_INTERVIEW_COMPLETED', "Interview completion audit is missing.");
expect(service, 'RECRUITMENT_OFFER_${normalized}', "Offer lifecycle audit is missing.");
expect(service, 'nextStage: "HIRED"', "Accepted offer does not close the application as hired.");
expect(service, 'talentPoolStatus', "Talent Pool status is not part of candidate governance.");

expect(routes, 'requirePermission("recruitment.view")', "Release-2 reads are not permission protected.");
expect(routes, 'requirePermission("recruitment.manage")', "Release-2 mutations are not permission protected.");
expect(routes, 'scopeLocationId: req.auth.activeLocationId || null', "Release-2 is not bound to active branch context.");
expect(routes, 'HEAD_OFFICE_REQUIRED_FOR_RECRUITMENT_CONTROL', "Head Office offer control is missing.");
expect(routes, 'includeCompensation: !req.auth.activeLocationId', "Branch offer reads do not redact compensation.");
expect(routes, '"/applications/:id/stage"', "ATS stage endpoint is missing.");
expect(routes, '"/applications/:id/interviews"', "Interview scheduling endpoint is missing.");
expect(routes, '"/applications/:id/offers"', "Offer preparation endpoint is missing.");
expect(routes, '"/talent-pool"', "Talent Pool endpoint is missing.");
expect(app, 'app.use("/api/recruitment", recruitmentTalentRoutes);', "Release-2 routes are not mounted.");

expect(frontendApp, 'import RecruitmentTalentWorkspace from "./pages/RecruitmentTalentWorkspace";', "Release-2 frontend workspace is not imported.");
for (const route of ["candidates", "interviews", "offers", "ats", "talent-pool"]) {
  expect(frontendApp, `path=\"/recruitment/${route}\"`, `${route} route is not active.`);
}
for (const [label, route] of [
  ["Candidates", "/recruitment/candidates"],
  ["Interviews", "/recruitment/interviews"],
  ["Offers", "/recruitment/offers"],
  ["Applicant Tracking System", "/recruitment/ats"],
  ["Talent Pool", "/recruitment/talent-pool"],
]) {
  expect(sidebar, `{ label: "${label}", path: "${route}" }`, `${label} sidebar navigation is not active.`);
  assert.ok(!sidebar.includes(`{ label: "${label}", planned: true }`), `${label} still carries a planned badge.`);
}

expect(workspace, 'var(--chris-panel-bg)', "Recruitment Release-2 does not use the CHRiS panel language.");
expect(workspace, 'var(--chris-input-bg)', "Recruitment Release-2 does not use CHRiS input styling.");
expect(workspace, 'apiRequest("/api/recruitment/talent/summary")', "Release-2 summary is not live.");
expect(workspace, 'apiRequest("/api/recruitment/applications")', "ATS is not wired to live applications.");
expect(workspace, 'Candidate privacy / recruitment-data processing consent has been captured.', "Candidate privacy evidence is not visible in the UI.");
expect(workspace, 'Restricted to Head Office', "Offer compensation redaction is not represented in the UI.");

expect(vacancies, 'noEligibleRequisitions', "Vacancies does not detect an empty approved-requisition selector.");
expect(vacancies, 'No approved/open job requisitions are available in this operating context.', "Vacancies empty-state guidance is missing.");
expect(vacancies, 'No approved/open requisitions available', "Empty vacancy selector is not explicit.");
expect(vacancies, 'Open Job Requisitions', "Vacancy workspace does not guide the user to the upstream requisition workflow.");

console.log("PASS: Recruitment Release-2 end-to-end activation acceptance checks.");
