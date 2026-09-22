const assert =
  require("assert");

const {
  auditEmployeeRecord,
} = require(
  "../src/services/employeeIntegrity"
);

function employee(
  overrides = {}
) {
  return {
    organizationId:
      "ORG-1",

    employeeNumber:
      "CHR000001",

    firstName:
      "Test",

    middleName:
      null,

    lastName:
      "Employee",

    status:
      "ACTIVE",

    hireDate:
      new Date(
        "2026-02-01T00:00:00.000Z"
      ),

    employmentEpisodes: [
      {
        organizationId:
          "ORG-1",

        sequenceNumber:
          1,

        startDate:
          new Date(
            "2025-01-01T00:00:00.000Z"
          ),

        endDate:
          new Date(
            "2025-12-31T00:00:00.000Z"
          ),
      },
      {
        organizationId:
          "ORG-1",

        sequenceNumber:
          2,

        startDate:
          new Date(
            "2026-02-01T00:00:00.000Z"
          ),

        endDate:
          null,
      },
    ],

    ...overrides,
  };
}

const valid =
  auditEmployeeRecord(
    employee()
  );

assert.equal(
  valid.issueCount,
  0
);

const multipleOpen =
  auditEmployeeRecord(
    employee({
      employmentEpisodes: [
        {
          organizationId:
            "ORG-1",
          sequenceNumber:
            1,
          startDate:
            new Date(
              "2025-01-01"
            ),
          endDate:
            null,
        },
        {
          organizationId:
            "ORG-1",
          sequenceNumber:
            2,
          startDate:
            new Date(
              "2026-01-01"
            ),
          endDate:
            null,
        },
      ],
    })
  );

assert.ok(
  multipleOpen.issues
    .some(
      (issue) =>
        issue.code ===
        "MULTIPLE_OPEN_EMPLOYMENT_EPISODES"
    )
);

const exitedOpen =
  auditEmployeeRecord(
    employee({
      status:
        "RESIGNED",
    })
  );

assert.ok(
  exitedOpen.issues
    .some(
      (issue) =>
        issue.code ===
        "EXITED_EMPLOYEE_HAS_OPEN_EPISODE"
    )
);

const mismatch =
  auditEmployeeRecord(
    employee({
      hireDate:
        new Date(
          "2026-03-01"
        ),
    })
  );

assert.ok(
  mismatch.issues
    .some(
      (issue) =>
        issue.code ===
        "CURRENT_HIRE_DATE_MISMATCH"
    )
);

const tenantMismatch =
  auditEmployeeRecord(
    employee({
      employmentEpisodes: [
        {
          organizationId:
            "ORG-2",
          sequenceNumber:
            1,
          startDate:
            new Date(
              "2026-02-01"
            ),
          endDate:
            null,
        },
      ],
    })
  );

assert.ok(
  tenantMismatch.issues
    .some(
      (issue) =>
        issue.code ===
        "EPISODE_TENANT_MISMATCH"
    )
);

console.log(
  "PASS: CHRIS employee integrity unit tests passed."
);
