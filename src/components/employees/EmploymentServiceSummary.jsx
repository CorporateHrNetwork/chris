function EmploymentServiceSummary({
  episodes = [],
}) {
  const summary =
    buildSummary(
      episodes
    );

  return (
    <section
      style={{
        marginTop: "22px",
        padding: "22px",
        borderRadius: "16px",
        border:
          "1px solid rgba(8, 122, 67, 0.18)",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(244,249,245,0.98))",
        boxShadow:
          "0 10px 28px rgba(15,23,42,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "flex-start",
          justifyContent:
            "space-between",
          gap: "18px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              color:
                "#087A43",
              fontSize:
                "16px",
              fontWeight:
                "900",
            }}
          >
            Employment Service
          </div>

          <div
            style={{
              marginTop:
                "4px",
              color:
                "#64748B",
              fontSize:
                "12px",
            }}
          >
            Service and tenure intelligence calculated from permanent employment episodes.
          </div>
        </div>

        <span
          style={{
            padding:
              "7px 11px",
            borderRadius:
              "999px",
            background:
              summary.inService
                ? "#ECFDF5"
                : "#F8FAFC",
            border:
              summary.inService
                ? "1px solid #A7F3D0"
                : "1px solid #CBD5E1",
            color:
              summary.inService
                ? "#047857"
                : "#475569",
            fontSize:
              "10px",
            fontWeight:
              "900",
          }}
        >
          {summary.inService
            ? "ACTIVE"
            : "EXITED"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "12px",
          marginTop: "18px",
        }}
      >
        <Metric
          label="Original Employment"
          value={
            formatDate(
              summary.originalEmploymentDate
            )
          }
        />

        <Metric
          label={
            summary.latestRehireDate
              ? "Latest Rehire"
              : "Latest Employment"
          }
          value={
            formatDate(
              summary.latestEmploymentDate
            )
          }
        />

        <Metric
          label="Current Episode"
          value={
            summary.currentEpisode
              ? durationLabel(
                  summary.currentEpisode
                    .days
                )
              : "No current episode"
          }
        />

        <Metric
          label="Cumulative Service"
          value={
            durationLabel(
              summary.totalServiceDays
            )
          }
        />

        <Metric
          label="Previous Service"
          value={
            durationLabel(
              summary.completedServiceDays
            )
          }
        />

        <Metric
          label="Employment Episodes"
          value={String(
            summary.episodeCount
          )}
        />

        <Metric
          label="Service Gaps"
          value={
            summary.gapCount ===
            0
              ? "None"
              : `${summary.gapCount} gap${
                  summary.gapCount ===
                  1
                    ? ""
                    : "s"
                }`
          }
        />

        <Metric
          label="Total Gap Time"
          value={
            summary.gapCount ===
            0
              ? "0 days"
              : durationLabel(
                  summary.totalGapDays
                )
          }
        />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
}) {
  return (
    <div
      style={{
        padding:
          "14px 15px",
        borderRadius:
          "12px",
        background:
          "#FFFFFF",
        border:
          "1px solid #E3E9E5",
      }}
    >
      <div
        style={{
          color:
            "#64748B",
          fontSize:
            "9px",
          fontWeight:
            "900",
          textTransform:
            "uppercase",
          letterSpacing:
            "0.05em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop:
            "7px",
          color:
            "#172033",
          fontSize:
            "14px",
          fontWeight:
            "800",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function buildSummary(
  episodes
) {
  const ordered =
    [...episodes].sort(
      (a, b) =>
        Number(
          a.sequenceNumber
        ) -
        Number(
          b.sequenceNumber
        )
    );

  const now =
    new Date();

  const original =
    ordered[0] ||
    null;

  const latest =
    ordered[
      ordered.length - 1
    ] ||
    null;

  const current =
    ordered.find(
      (episode) =>
        !episode.endDate
    ) ||
    null;

  let totalServiceDays =
    0;

  let completedServiceDays =
    0;

  let totalGapDays =
    0;

  const gaps = [];

  ordered.forEach(
    (episode) => {
      const end =
        episode.endDate
          ? new Date(
              episode.endDate
            )
          : now;

      const days =
        diffDays(
          new Date(
            episode.startDate
          ),
          end
        );

      totalServiceDays +=
        days;

      if (
        episode.endDate
      ) {
        completedServiceDays +=
          days;
      }
    }
  );

  for (
    let index = 1;
    index < ordered.length;
    index += 1
  ) {
    const previous =
      ordered[
        index - 1
      ];

    const next =
      ordered[index];

    if (
      !previous.endDate
    ) {
      continue;
    }

    const days =
      diffDays(
        new Date(
          previous.endDate
        ),
        new Date(
          next.startDate
        )
      );

    totalGapDays +=
      days;

    gaps.push({
      afterEpisode:
        previous.sequenceNumber,
      beforeEpisode:
        next.sequenceNumber,
      days,
    });
  }

  return {
    inService:
      Boolean(current),

    originalEmploymentDate:
      original?.startDate ||
      null,

    latestEmploymentDate:
      latest?.startDate ||
      null,

    latestRehireDate:
      ordered.length > 1
        ? latest?.startDate ||
          null
        : null,

    currentEpisode:
      current
        ? {
            days:
              diffDays(
                new Date(
                  current.startDate
                ),
                now
              ),
          }
        : null,

    episodeCount:
      ordered.length,

    totalServiceDays,

    completedServiceDays,

    gapCount:
      gaps.length,

    totalGapDays,

    gaps,
  };
}

function diffDays(
  start,
  end
) {
  const oneDay =
    24 * 60 * 60 * 1000;

  const startUtc =
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate()
    );

  const endUtc =
    Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      end.getUTCDate()
    );

  return Math.max(
    0,
    Math.round(
      (
        endUtc -
        startUtc
      ) /
        oneDay
    )
  );
}

function durationLabel(
  totalDays
) {
  const safeDays =
    Math.max(
      0,
      Number(
        totalDays
      ) || 0
    );

  const years =
    Math.floor(
      safeDays / 365
    );

  const afterYears =
    safeDays % 365;

  const months =
    Math.floor(
      afterYears / 30
    );

  const days =
    afterYears % 30;

  const parts = [];

  if (years) {
    parts.push(
      `${years}y`
    );
  }

  if (months) {
    parts.push(
      `${months}m`
    );
  }

  if (
    days ||
    parts.length === 0
  ) {
    parts.push(
      `${days}d`
    );
  }

  return parts.join(" ");
}

function formatDate(
  value
) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day:
        "2-digit",
      month:
        "short",
      year:
        "numeric",
    }
  );
}

export default EmploymentServiceSummary;
