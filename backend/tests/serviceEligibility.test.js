const assert =
  require("assert");

const {
  evaluateEligibility,
} = require(
  "../src/services/serviceEligibility"
);

function baseSummary(
  overrides = {}
) {
  return {
    employmentStatus:
      "ACTIVE",

    hasCurrentEpisode:
      true,

    currentEpisode: {
      duration: {
        totalDays:
          120,
      },
    },

    cumulativeService: {
      totalDays:
        365,
    },

    serviceGaps: {
      count:
        0,

      totalDays:
        0,
    },

    episodeCount:
      2,

    originalEmploymentDate:
      "2025-08-17",

    latestEmploymentDate:
      "2026-04-19",

    latestRehireDate:
      "2026-04-19",

    ...overrides,
  };
}

const eligible =
  evaluateEligibility({
    summary:
      baseSummary(),

    rule: {
      minimumServiceDays:
        90,

      serviceBasis:
        "CURRENT_EPISODE",
    },
  });

assert.equal(
  eligible.eligible,
  true
);

const insufficientCurrentService =
  evaluateEligibility({
    summary:
      baseSummary(),

    rule: {
      minimumServiceDays:
        180,

      serviceBasis:
        "CURRENT_EPISODE",
    },
  });

assert.equal(
  insufficientCurrentService
    .eligible,
  false
);

assert.ok(
  insufficientCurrentService
    .reasons
    .some(
      (reason) =>
        reason.code ===
        "MINIMUM_SERVICE_NOT_MET"
    )
);

const cumulativeEligible =
  evaluateEligibility({
    summary:
      baseSummary(),

    rule: {
      minimumServiceDays:
        180,

      serviceBasis:
        "CUMULATIVE",
    },
  });

assert.equal(
  cumulativeEligible.eligible,
  true
);

const suspended =
  evaluateEligibility({
    summary:
      baseSummary({
        employmentStatus:
          "SUSPENDED",
      }),

    rule: {
      minimumServiceDays:
        0,
    },
  });

assert.equal(
  suspended.eligible,
  false
);

assert.ok(
  suspended.reasons.some(
    (reason) =>
      reason.code ===
      "STATUS_NOT_ELIGIBLE"
  )
);

const noCurrentEpisode =
  evaluateEligibility({
    summary:
      baseSummary({
        hasCurrentEpisode:
          false,

        currentEpisode:
          null,
      }),

    rule: {
      minimumServiceDays:
        0,
    },
  });

assert.equal(
  noCurrentEpisode.eligible,
  false
);

const excessiveGap =
  evaluateEligibility({
    summary:
      baseSummary({
        serviceGaps: {
          count:
            2,

          totalDays:
            75,
        },
      }),

    rule: {
      minimumServiceDays:
        0,

      maximumGapDays:
        30,

      maximumGapCount:
        1,
    },
  });

assert.equal(
  excessiveGap.eligible,
  false
);

assert.equal(
  excessiveGap.reasons.length,
  2
);

console.log(
  "PASS: CHRIS service eligibility engine tests passed."
);
