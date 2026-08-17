const assert =
  require("assert");

const fs =
  require("fs");

const path =
  require("path");

const projectRoot =
  path.resolve(
    __dirname,
    "..",
    ".."
  );

function read(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      projectRoot,
      relativePath
    ),
    "utf8"
  );
}

const auth =
  read(
    "backend/src/middleware/authMiddleware.js"
  );

assert.ok(
  auth.includes(
    "organizationId:"
  ),
  "Auth middleware must attach organizationId."
);

const employmentService =
  read(
    "backend/src/services/employmentService.js"
  );

assert.ok(
  employmentService.includes(
    "organizationId,"
  ),
  "Employment service must be tenant scoped."
);

const reporting =
  read(
    "backend/src/services/employeeReporting.js"
  );

assert.ok(
  reporting.includes(
    "organizationId"
  ),
  "Employee reporting must be tenant scoped."
);

const eligibilityRoutes =
  read(
    "backend/src/routes/employmentEligibilityRoutes.js"
  );

assert.ok(
  eligibilityRoutes.includes(
    'requirePermission(\n    "employees.view"'
  ),
  "Eligibility APIs must require employees.view."
);

const reportRoutes =
  read(
    "backend/src/routes/employeeReportRoutes.js"
  );

assert.ok(
  reportRoutes.includes(
    'requirePermission(\n    "employees.view"'
  ),
  "Report APIs must require employees.view."
);

const profile =
  read(
    "src/components/employees/EmployeeProfile.jsx"
  );

const summary =
  read(
    "src/components/employees/EmploymentServiceSummary.jsx"
  );

const unsafeArtifacts = [
  "â†’",
  "Ã",
  "Â",
];

for (
  const artifact
  of unsafeArtifacts
) {
  assert.equal(
    profile.includes(
      artifact
    ),
    false,
    `EmployeeProfile contains encoding artifact: ${artifact}`
  );

  assert.equal(
    summary.includes(
      artifact
    ),
    false,
    `EmploymentServiceSummary contains encoding artifact: ${artifact}`
  );
}

assert.equal(
  summary.includes(
    "IN SERVICE"
  ),
  false,
  "EmploymentServiceSummary must not introduce IN SERVICE as a display status."
);

assert.ok(
  profile.includes(
    "\\u2192"
  ),
  "EmployeeProfile must use ASCII-safe \\u2192 for lifecycle arrows."
);

console.log(
  "PASS: CHRIS source safety and consistency checks passed."
);
