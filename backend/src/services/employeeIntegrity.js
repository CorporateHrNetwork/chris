const prisma =
  require("../config/prisma");

const EXIT_STATUSES = new Set([
  "TERMINATED",
  "RESIGNED",
  "RETIRED",
]);

function auditEmployeeRecord(
  employee
) {
  const issues = [];

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

  const openEpisodes =
    episodes.filter(
      (episode) =>
        !episode.endDate
    );

  for (
    let index = 0;
    index < episodes.length;
    index += 1
  ) {
    const episode =
      episodes[index];

    const expectedSequence =
      index + 1;

    if (
      Number(
        episode.sequenceNumber
      ) !==
      expectedSequence
    ) {
      issues.push({
        code:
          "EPISODE_SEQUENCE_GAP",

        message:
          `Expected employment episode ${expectedSequence}, found ${episode.sequenceNumber}.`,

        episodeSequence:
          episode.sequenceNumber,
      });
    }

    if (
      episode.organizationId &&
      employee.organizationId &&
      episode.organizationId !==
        employee.organizationId
    ) {
      issues.push({
        code:
          "EPISODE_TENANT_MISMATCH",

        message:
          `Employment episode ${episode.sequenceNumber} belongs to a different organization.`,

        episodeSequence:
          episode.sequenceNumber,
      });
    }

    if (
      episode.endDate &&
      new Date(
        episode.endDate
      ).getTime() <
        new Date(
          episode.startDate
        ).getTime()
    ) {
      issues.push({
        code:
          "EPISODE_END_BEFORE_START",

        message:
          `Employment episode ${episode.sequenceNumber} ends before it starts.`,

        episodeSequence:
          episode.sequenceNumber,
      });
    }

    if (index > 0) {
      const previous =
        episodes[
          index - 1
        ];

      if (
        !previous.endDate
      ) {
        issues.push({
          code:
            "EPISODE_AFTER_OPEN_EPISODE",

          message:
            `Employment episode ${episode.sequenceNumber} follows an episode that was never closed.`,

          episodeSequence:
            episode.sequenceNumber,
        });
      } else if (
        new Date(
          episode.startDate
        ).getTime() <
        new Date(
          previous.endDate
        ).getTime()
      ) {
        issues.push({
          code:
            "EMPLOYMENT_EPISODES_OVERLAP",

          message:
            `Employment episodes ${previous.sequenceNumber} and ${episode.sequenceNumber} overlap.`,

          episodeSequence:
            episode.sequenceNumber,
        });
      }
    }
  }

  const exited =
    EXIT_STATUSES.has(
      employee.status
    );

  if (
    exited &&
    openEpisodes.length > 0
  ) {
    issues.push({
      code:
        "EXITED_EMPLOYEE_HAS_OPEN_EPISODE",

      message:
        "Exited employee has an open employment episode.",
    });
  }

  if (
    !exited &&
    episodes.length > 0 &&
    openEpisodes.length === 0
  ) {
    issues.push({
      code:
        "CURRENT_EMPLOYEE_WITHOUT_OPEN_EPISODE",

      message:
        "Current employee does not have an open employment episode.",
    });
  }

  if (
    openEpisodes.length > 1
  ) {
    issues.push({
      code:
        "MULTIPLE_OPEN_EMPLOYMENT_EPISODES",

      message:
        `Employee has ${openEpisodes.length} open employment episodes.`,
    });
  }

  const latestEpisode =
    episodes[
      episodes.length - 1
    ] ||
    null;

  if (
    latestEpisode &&
    !latestEpisode.endDate &&
    employee.hireDate
  ) {
    const employeeHire =
      new Date(
        employee.hireDate
      ).toISOString()
      .slice(0, 10);

    const episodeStart =
      new Date(
        latestEpisode
          .startDate
      ).toISOString()
      .slice(0, 10);

    if (
      employeeHire !==
      episodeStart
    ) {
      issues.push({
        code:
          "CURRENT_HIRE_DATE_MISMATCH",

        message:
          `Employee hireDate ${employeeHire} does not match current episode start date ${episodeStart}.`,
      });
    }
  }

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

    episodeCount:
      episodes.length,

    openEpisodeCount:
      openEpisodes.length,

    issueCount:
      issues.length,

    issues,
  };
}

async function runEmploymentIntegrityAudit({
  organizationId,
}) {
  const employees =
    await prisma.employee.findMany({
      where: {
        organizationId,
      },

      select: {
        id: true,
        organizationId:
          true,
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
        hireDate:
          true,

        employmentEpisodes: {
          orderBy: {
            sequenceNumber:
              "asc",
          },

          select: {
            id: true,
            organizationId:
              true,
            sequenceNumber:
              true,
            startDate:
              true,
            endDate:
              true,
          },
        },
      },

      orderBy: {
        employeeNumber:
          "asc",
      },
    });

  const auditedEmployees =
    employees.map(
      auditEmployeeRecord
    );

  const employeesWithIssues =
    auditedEmployees.filter(
      (employee) =>
        employee
          .issueCount > 0
    );

  return {
    generatedAt:
      new Date(),

    organizationId,

    employeesChecked:
      auditedEmployees.length,

    employeesWithIssues:
      employeesWithIssues
        .length,

    totalIssues:
      employeesWithIssues
        .reduce(
          (total, employee) =>
            total +
            employee.issueCount,
          0
        ),

    status:
      employeesWithIssues
        .length === 0
        ? "PASS"
        : "ISSUES_FOUND",

    employees:
      employeesWithIssues,
  };
}

module.exports = {
  EXIT_STATUSES,
  auditEmployeeRecord,
  runEmploymentIntegrityAudit,
};
