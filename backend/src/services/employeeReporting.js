const prisma =
  require("../config/prisma");

const {
  diffDays,
  approximateDurationFromDays,
} = require("../utils/serviceDuration");

const EXIT_STATUSES = [
  "TERMINATED",
  "RESIGNED",
  "RETIRED",
];

function normalizeFilters(
  input = {}
) {
  const statuses =
    normalizeList(
      input.statuses ||
      input.status
    );

  return {
    statuses,

    departmentId:
      normalizeOptionalText(
        input.departmentId
      ),

    designationId:
      normalizeOptionalText(
        input.designationId
      ),

    locationId:
      normalizeOptionalText(
        input.locationId
      ),

    search:
      normalizeOptionalText(
        input.search
      ),

    includeExited:
      parseBoolean(
        input.includeExited,
        true
      ),
  };
}

function buildEmployeeWhere({
  organizationId,
  filters,
}) {
  const where = {
    organizationId,
  };

  if (
    filters.statuses.length > 0
  ) {
    where.status = {
      in:
        filters.statuses,
    };
  } else if (
    !filters.includeExited
  ) {
    where.status = {
      notIn:
        EXIT_STATUSES,
    };
  }

  if (filters.departmentId) {
    where.departmentId =
      filters.departmentId;
  }

  if (filters.designationId) {
    where.designationId =
      filters.designationId;
  }

  if (filters.locationId) {
    where.locationId =
      filters.locationId;
  }

  if (filters.search) {
    where.OR = [
      {
        employeeNumber: {
          contains:
            filters.search,
          mode:
            "insensitive",
        },
      },
      {
        firstName: {
          contains:
            filters.search,
          mode:
            "insensitive",
        },
      },
      {
        middleName: {
          contains:
            filters.search,
          mode:
            "insensitive",
        },
      },
      {
        lastName: {
          contains:
            filters.search,
          mode:
            "insensitive",
        },
      },
    ];
  }

  return where;
}

function summarizeEmployee(
  employee,
  asOfDate =
    new Date()
) {
  const episodes =
    [...(
      employee.employmentEpisodes ||
      []
    )].sort(
      (a, b) =>
        Number(
          a.sequenceNumber
        ) -
        Number(
          b.sequenceNumber
        )
    );

  const currentEpisode =
    episodes.find(
      (episode) =>
        !episode.endDate
    ) ||
    null;

  const totalServiceDays =
    episodes.reduce(
      (total, episode) =>
        total +
        diffDays(
          episode.startDate,
          episode.endDate ||
            asOfDate
        ),
      0
    );

  const completedServiceDays =
    episodes
      .filter(
        (episode) =>
          Boolean(
            episode.endDate
          )
      )
      .reduce(
        (total, episode) =>
          total +
          diffDays(
            episode.startDate,
            episode.endDate
          ),
        0
      );

  const serviceGaps = [];

  for (
    let index = 1;
    index < episodes.length;
    index += 1
  ) {
    const previous =
      episodes[
        index - 1
      ];

    const next =
      episodes[index];

    if (!previous.endDate) {
      continue;
    }

    const days =
      diffDays(
        previous.endDate,
        next.startDate
      );

    if (days <= 0) {
      continue;
    }

    serviceGaps.push({
      afterEpisode:
        previous.sequenceNumber,

      beforeEpisode:
        next.sequenceNumber,

      from:
        previous.endDate,

      to:
        next.startDate,

      days,
    });
  }

  const totalGapDays =
    serviceGaps.reduce(
      (total, gap) =>
        total + gap.days,
      0
    );

  const firstEpisode =
    episodes[0] ||
    null;

  const latestEpisode =
    episodes[
      episodes.length - 1
    ] ||
    null;

  return {
    employeeNumber:
      employee.employeeNumber,

    name:
      [
        employee.firstName,
        employee.middleName,
        employee.lastName,
      ]
        .filter(Boolean)
        .join(" "),

    status:
      employee.status,

    department:
      employee.department
        ?.name ||
      null,

    designation:
      employee.designation
        ?.name ||
      null,

    location:
      employee.location
        ?.name ||
      null,

    originalEmploymentDate:
      firstEpisode
        ?.startDate ||
      employee.hireDate ||
      null,

    latestEmploymentDate:
      latestEpisode
        ?.startDate ||
      employee.hireDate ||
      null,

    latestRehireDate:
      episodes.length > 1
        ? latestEpisode
            ?.startDate ||
          null
        : null,

    exitDate:
      employee.exitDate ||
      null,

    episodeCount:
      episodes.length,

    hasCurrentEpisode:
      Boolean(
        currentEpisode
      ),

    currentEpisodeDays:
      currentEpisode
        ? diffDays(
            currentEpisode
              .startDate,
            asOfDate
          )
        : 0,

    cumulativeService:
      approximateDurationFromDays(
        totalServiceDays
      ),

    previousCompletedService:
      approximateDurationFromDays(
        completedServiceDays
      ),

    serviceGapCount:
      serviceGaps.length,

    totalGapDays,

    serviceGaps,
  };
}

async function getWorkforceReport({
  organizationId,
  filters:
    inputFilters = {},
  asOfDate =
    new Date(),
}) {
  const filters =
    normalizeFilters(
      inputFilters
    );

  const employees =
    await prisma.employee.findMany({
      where:
        buildEmployeeWhere({
          organizationId,
          filters,
        }),

      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        status: true,
        hireDate: true,
        exitDate: true,

        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },

        designation: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },

        location: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },

        employmentEpisodes: {
          orderBy: {
            sequenceNumber:
              "asc",
          },

          select: {
            sequenceNumber:
              true,

            startDate:
              true,

            endDate:
              true,
          },
        },
      },

      orderBy: [
        {
          lastName:
            "asc",
        },
        {
          firstName:
            "asc",
        },
      ],
    });

  const rows =
    employees.map(
      (employee) =>
        summarizeEmployee(
          employee,
          asOfDate
        )
    );

  return {
    generatedAt:
      new Date(),

    asOfDate,

    filters,

    totals:
      buildTotals(
        rows
      ),

    employees:
      rows,
  };
}

async function getLifecycleReport({
  organizationId,
  employeeNumber,
}) {
  const employee =
    await prisma.employee.findFirst({
      where: {
        organizationId,
        employeeNumber,
      },

      select: {
        employeeNumber:
          true,

        firstName:
          true,

        middleName:
          true,

        lastName:
          true,

        status:
          true,

        lifecycleEvents: {
          orderBy: [
            {
              effectiveDate:
                "asc",
            },
            {
              createdAt:
                "asc",
            },
          ],

          select: {
            id: true,
            eventType: true,
            effectiveDate: true,
            previousStatus: true,
            newStatus: true,
            reason: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    });

  if (!employee) {
    return null;
  }

  return {
    employee: {
      employeeNumber:
        employee.employeeNumber,

      name:
        [
          employee.firstName,
          employee.middleName,
          employee.lastName,
        ]
          .filter(Boolean)
          .join(" "),

      status:
        employee.status,
    },

    events:
      employee.lifecycleEvents ||
      [],
  };
}

function buildTotals(
  employees
) {
  const byStatus = {};
  const byLocation = {};
  const byDepartment = {};

  for (
    const employee
    of employees
  ) {
    increment(
      byStatus,
      employee.status ||
        "UNKNOWN"
    );

    increment(
      byLocation,
      employee.location ||
        "Unassigned"
    );

    increment(
      byDepartment,
      employee.department ||
        "Unassigned"
    );
  }

  return {
    employees:
      employees.length,

    currentEmployees:
      employees.filter(
        (employee) =>
          employee
            .hasCurrentEpisode
      ).length,

    exitedEmployees:
      employees.filter(
        (employee) =>
          !employee
            .hasCurrentEpisode
      ).length,

    employeesWithMultipleEpisodes:
      employees.filter(
        (employee) =>
          employee
            .episodeCount > 1
      ).length,

    employeesWithServiceGaps:
      employees.filter(
        (employee) =>
          employee
            .serviceGapCount > 0
      ).length,

    byStatus,
    byLocation,
    byDepartment,
  };
}

function workforceReportToCsv(
  report
) {
  const headers = [
    "Employee Number",
    "Name",
    "Status",
    "Department",
    "Designation",
    "Location",
    "Original Employment Date",
    "Latest Employment Date",
    "Latest Rehire Date",
    "Exit Date",
    "Employment Episodes",
    "Current Episode Days",
    "Cumulative Service Days",
    "Service Gap Count",
    "Total Gap Days",
  ];

  const lines = [
    headers
      .map(csvValue)
      .join(","),
  ];

  for (
    const employee
    of report.employees
  ) {
    const row = [
      employee.employeeNumber,
      employee.name,
      employee.status,
      employee.department,
      employee.designation,
      employee.location,
      isoDate(
        employee
          .originalEmploymentDate
      ),
      isoDate(
        employee
          .latestEmploymentDate
      ),
      isoDate(
        employee
          .latestRehireDate
      ),
      isoDate(
        employee.exitDate
      ),
      employee.episodeCount,
      employee.currentEpisodeDays,
      employee.cumulativeService
        ?.totalDays ||
        0,
      employee.serviceGapCount,
      employee.totalGapDays,
    ];

    lines.push(
      row
        .map(csvValue)
        .join(",")
    );
  }

  return lines.join(
    "\r\n"
  );
}

function lifecycleReportToCsv(
  report
) {
  const headers = [
    "Employee Number",
    "Employee Name",
    "Current Status",
    "Event Type",
    "Effective Date",
    "Previous Status",
    "New Status",
    "Reason",
    "Notes",
  ];

  const lines = [
    headers
      .map(csvValue)
      .join(","),
  ];

  for (
    const event
    of report.events
  ) {
    lines.push(
      [
        report.employee
          .employeeNumber,

        report.employee
          .name,

        report.employee
          .status,

        event.eventType,

        isoDate(
          event.effectiveDate
        ),

        event.previousStatus,

        event.newStatus,

        event.reason,

        event.notes,
      ]
        .map(csvValue)
        .join(",")
    );
  }

  return lines.join(
    "\r\n"
  );
}

function normalizeList(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    return [];
  }

  const values =
    Array.isArray(value)
      ? value
      : String(value)
          .split(",");

  return Array.from(
    new Set(
      values
        .map(
          (item) =>
            String(
              item || ""
            )
              .trim()
              .toUpperCase()
        )
        .filter(Boolean)
    )
  );
}

function normalizeOptionalText(
  value
) {
  const normalized =
    String(
      value || ""
    ).trim();

  return (
    normalized ||
    null
  );
}

function parseBoolean(
  value,
  fallback
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    return fallback;
  }

  if (
    value === true ||
    value === "true" ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === false ||
    value === "false" ||
    value === "0"
  ) {
    return false;
  }

  return fallback;
}

function increment(
  target,
  key
) {
  target[key] =
    (
      target[key] ||
      0
    ) + 1;
}

function isoDate(
  value
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date
    .toISOString()
    .slice(0, 10);
}

function csvValue(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return "";
  }

  const text =
    String(value);

  return (
    '"' +
    text.replace(
      /"/g,
      '""'
    ) +
    '"'
  );
}

module.exports = {
  EXIT_STATUSES,
  normalizeFilters,
  buildEmployeeWhere,
  summarizeEmployee,
  buildTotals,
  workforceReportToCsv,
  lifecycleReportToCsv,
  getWorkforceReport,
  getLifecycleReport,
};
