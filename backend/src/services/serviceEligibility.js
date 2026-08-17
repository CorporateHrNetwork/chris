const {
  getEmploymentServiceSummary,
} = require("./employmentService");

const SERVICE_BASES = {
  CURRENT_EPISODE: "CURRENT_EPISODE",
  CUMULATIVE: "CUMULATIVE",
};

const DEFAULT_ALLOWED_STATUSES = [
  "ACTIVE",
  "PROBATION",
  "LEAVE",
];

function normalizeRule(input = {}) {
  const serviceBasis =
    String(
      input.serviceBasis ||
        SERVICE_BASES.CURRENT_EPISODE
    )
      .trim()
      .toUpperCase();

  if (
    !Object.values(
      SERVICE_BASES
    ).includes(
      serviceBasis
    )
  ) {
    throw new Error(
      "INVALID_SERVICE_BASIS"
    );
  }

  const minimumServiceDays =
    toNonNegativeInteger(
      input.minimumServiceDays,
      0
    );

  const maximumGapDays =
    toOptionalNonNegativeInteger(
      input.maximumGapDays
    );

  const maximumGapCount =
    toOptionalNonNegativeInteger(
      input.maximumGapCount
    );

  const allowedStatuses =
    normalizeStatuses(
      input.allowedStatuses
    );

  return {
    serviceBasis,
    minimumServiceDays,

    requireCurrentEpisode:
      input.requireCurrentEpisode !==
      false,

    allowedStatuses,

    maximumGapDays,

    maximumGapCount,
  };
}

function evaluateEligibility({
  summary,
  rule,
}) {
  if (!summary) {
    return {
      eligible: false,
      decision:
        "NOT_ELIGIBLE",
      reasons: [
        {
          code:
            "EMPLOYMENT_SERVICE_NOT_FOUND",
          message:
            "Employment service information is unavailable.",
        },
      ],
    };
  }

  const normalizedRule =
    normalizeRule(rule);

  const reasons = [];

  const employmentStatus =
    summary.employmentStatus ||
    summary.employee?.status ||
    null;

  const currentEpisodeDays =
    Number(
      summary.currentEpisode
        ?.duration
        ?.totalDays
    ) || 0;

  const cumulativeServiceDays =
    Number(
      summary.cumulativeService
        ?.totalDays
    ) || 0;

  const serviceDays =
    normalizedRule
      .serviceBasis ===
    SERVICE_BASES.CUMULATIVE
      ? cumulativeServiceDays
      : currentEpisodeDays;

  if (
    normalizedRule
      .requireCurrentEpisode &&
    !summary.hasCurrentEpisode
  ) {
    reasons.push({
      code:
        "CURRENT_EMPLOYMENT_REQUIRED",
      message:
        "The employee does not have a current employment episode.",
    });
  }

  if (
    normalizedRule
      .allowedStatuses
      .length > 0 &&
    !normalizedRule
      .allowedStatuses
      .includes(
        employmentStatus
      )
  ) {
    reasons.push({
      code:
        "STATUS_NOT_ELIGIBLE",
      message:
        `Employee status ${employmentStatus || "UNKNOWN"} is not eligible under this rule.`,
    });
  }

  if (
    serviceDays <
    normalizedRule
      .minimumServiceDays
  ) {
    reasons.push({
      code:
        "MINIMUM_SERVICE_NOT_MET",
      message:
        `Minimum service requirement of ${normalizedRule.minimumServiceDays} day(s) has not been met.`,

      requiredDays:
        normalizedRule
          .minimumServiceDays,

      actualDays:
        serviceDays,

      deficitDays:
        normalizedRule
          .minimumServiceDays -
        serviceDays,
    });
  }

  const totalGapDays =
    Number(
      summary.serviceGaps
        ?.totalDays
    ) || 0;

  const gapCount =
    Number(
      summary.serviceGaps
        ?.count
    ) || 0;

  if (
    normalizedRule
      .maximumGapDays !==
      null &&
    totalGapDays >
      normalizedRule
        .maximumGapDays
  ) {
    reasons.push({
      code:
        "MAXIMUM_GAP_DAYS_EXCEEDED",
      message:
        `Total service gap of ${totalGapDays} day(s) exceeds the allowed ${normalizedRule.maximumGapDays} day(s).`,

      allowedDays:
        normalizedRule
          .maximumGapDays,

      actualDays:
        totalGapDays,
    });
  }

  if (
    normalizedRule
      .maximumGapCount !==
      null &&
    gapCount >
      normalizedRule
        .maximumGapCount
  ) {
    reasons.push({
      code:
        "MAXIMUM_GAP_COUNT_EXCEEDED",
      message:
        `Service gap count of ${gapCount} exceeds the allowed ${normalizedRule.maximumGapCount}.`,

      allowedCount:
        normalizedRule
          .maximumGapCount,

      actualCount:
        gapCount,
    });
  }

  const eligible =
    reasons.length === 0;

  return {
    eligible,

    decision:
      eligible
        ? "ELIGIBLE"
        : "NOT_ELIGIBLE",

    rule:
      normalizedRule,

    measured: {
      employmentStatus,

      hasCurrentEpisode:
        Boolean(
          summary.hasCurrentEpisode
        ),

      serviceBasis:
        normalizedRule
          .serviceBasis,

      serviceDays,

      currentEpisodeDays,

      cumulativeServiceDays,

      episodeCount:
        Number(
          summary.episodeCount
        ) || 0,

      gapCount,

      totalGapDays,

      originalEmploymentDate:
        summary
          .originalEmploymentDate ||
        null,

      latestEmploymentDate:
        summary
          .latestEmploymentDate ||
        null,

      latestRehireDate:
        summary
          .latestRehireDate ||
        null,
    },

    reasons,
  };
}

async function evaluateEmployeeEligibility({
  organizationId,
  employeeNumber,
  rule,
  asOfDate =
    new Date(),
}) {
  const summary =
    await getEmploymentServiceSummary({
      organizationId,
      employeeNumber,
      asOfDate,
    });

  if (!summary) {
    return null;
  }

  return {
    employee: summary.employee,

    eligibility:
      evaluateEligibility({
        summary,
        rule,
      }),
  };
}

async function evaluateEmployeesEligibility({
  organizationId,
  employeeNumbers,
  rule,
  asOfDate =
    new Date(),
}) {
  const uniqueEmployeeNumbers =
    Array.from(
      new Set(
        (employeeNumbers || [])
          .map(
            (value) =>
              String(
                value || ""
              ).trim()
          )
          .filter(Boolean)
      )
    );

  if (
    uniqueEmployeeNumbers
      .length > 250
  ) {
    throw new Error(
      "ELIGIBILITY_BATCH_LIMIT_EXCEEDED"
    );
  }

  const results = [];

  for (
    const employeeNumber
    of uniqueEmployeeNumbers
  ) {
    const result =
      await evaluateEmployeeEligibility({
        organizationId,
        employeeNumber,
        rule,
        asOfDate,
      });

    results.push(
      result || {
        employee: {
          employeeNumber,
        },

        eligibility: {
          eligible: false,

          decision:
            "NOT_FOUND",

          reasons: [
            {
              code:
                "EMPLOYEE_NOT_FOUND",

              message:
                "Employee not found.",
            },
          ],
        },
      }
    );
  }

  return results;
}

function normalizeStatuses(
  statuses
) {
  if (
    statuses ===
    undefined ||
    statuses ===
    null
  ) {
    return [
      ...DEFAULT_ALLOWED_STATUSES,
    ];
  }

  if (
    !Array.isArray(
      statuses
    )
  ) {
    throw new Error(
      "INVALID_ALLOWED_STATUSES"
    );
  }

  return Array.from(
    new Set(
      statuses
        .map(
          (status) =>
            String(
              status || ""
            )
              .trim()
              .toUpperCase()
        )
        .filter(Boolean)
    )
  );
}

function toNonNegativeInteger(
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

  const parsed =
    Number(value);

  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed < 0
  ) {
    throw new Error(
      "INVALID_NON_NEGATIVE_INTEGER"
    );
  }

  return parsed;
}

function toOptionalNonNegativeInteger(
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
    return null;
  }

  return toNonNegativeInteger(
    value,
    0
  );
}

module.exports = {
  SERVICE_BASES,
  DEFAULT_ALLOWED_STATUSES,
  normalizeRule,
  evaluateEligibility,
  evaluateEmployeeEligibility,
  evaluateEmployeesEligibility,
};
