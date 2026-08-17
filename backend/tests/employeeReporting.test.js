const assert =
  require("assert");

const {
  normalizeFilters,
  summarizeEmployee,
  buildTotals,
  workforceReportToCsv,
  lifecycleReportToCsv,
} = require(
  "../src/services/employeeReporting"
);

const employee = {
  employeeNumber:
    "CHR000006",

  firstName:
    "Loveth",

  middleName:
    null,

  lastName:
    "Zion",

  status:
    "ACTIVE",

  hireDate:
    new Date(
      "2026-08-16T00:00:00.000Z"
    ),

  exitDate:
    null,

  department: {
    name:
      "Logistics",
  },

  designation: {
    name:
      "Logistics Manager",
  },

  location: {
    name:
      "Head Office",
  },

  employmentEpisodes: [
    {
      sequenceNumber:
        1,

      startDate:
        new Date(
          "2026-07-01T00:00:00.000Z"
        ),

      endDate:
        new Date(
          "2026-08-16T00:00:00.000Z"
        ),
    },
    {
      sequenceNumber:
        2,

      startDate:
        new Date(
          "2026-08-16T00:00:00.000Z"
        ),

      endDate:
        null,
    },
  ],
};

const summary =
  summarizeEmployee(
    employee,
    new Date(
      "2026-08-17T00:00:00.000Z"
    )
  );

assert.equal(
  summary.employeeNumber,
  "CHR000006"
);

assert.equal(
  summary.episodeCount,
  2
);

assert.equal(
  summary.hasCurrentEpisode,
  true
);

assert.equal(
  summary.serviceGapCount,
  0
);

assert.equal(
  summary.totalGapDays,
  0
);

assert.equal(
  summary.cumulativeService
    .totalDays,
  47
);

const totals =
  buildTotals([
    summary,
  ]);

assert.equal(
  totals.employees,
  1
);

assert.equal(
  totals.currentEmployees,
  1
);

assert.equal(
  totals.employeesWithMultipleEpisodes,
  1
);

const filters =
  normalizeFilters({
    status:
      "active,probation",

    includeExited:
      "false",
  });

assert.deepEqual(
  filters.statuses,
  [
    "ACTIVE",
    "PROBATION",
  ]
);

assert.equal(
  filters.includeExited,
  false
);

const workforceCsv =
  workforceReportToCsv({
    employees: [
      summary,
    ],
  });

assert.ok(
  workforceCsv.includes(
    "CHR000006"
  )
);

assert.ok(
  workforceCsv.includes(
    "Loveth Zion"
  )
);

const lifecycleCsv =
  lifecycleReportToCsv({
    employee: {
      employeeNumber:
        "CHR000006",

      name:
        "Loveth Zion",

      status:
        "ACTIVE",
    },

    events: [
      {
        eventType:
          "REHIRED",

        effectiveDate:
          new Date(
            "2026-08-16T00:00:00.000Z"
          ),

        previousStatus:
          "RESIGNED",

        newStatus:
          "ACTIVE",

        reason:
          "Test",

        notes:
          null,
      },
    ],
  });

assert.ok(
  lifecycleCsv.includes(
    "REHIRED"
  )
);

console.log(
  "PASS: CHRIS employee reporting tests passed."
);
