import { useEffect, useState } from "react";

import { apiRequest } from "../../services/api";

function EmploymentServiceSummary({ employeeNumber }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      if (!employeeNumber) {
        setSummary(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const result = await apiRequest(
          `/api/employment-service/${encodeURIComponent(
            employeeNumber
          )}`
        );

        if (!cancelled) {
          setSummary(result.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message ||
              "CHRIS could not load employment service information."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSummary();

    return () => {
      cancelled = true;
    };
  }, [employeeNumber]);

  return (
    <section style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <div style={titleStyle}>
            Employment Service
          </div>

          <div style={subtitleStyle}>
            Service and tenure intelligence calculated from permanent employment episodes.
          </div>
        </div>

        {summary ? (
          <StatusBadge
            status={
              summary.employmentStatus ||
              summary.employee?.status
            }
          />
        ) : null}
      </div>

      {loading ? (
        <MessageBox>Loading employment service...</MessageBox>
      ) : error ? (
        <MessageBox error>{error}</MessageBox>
      ) : !summary ? (
        <MessageBox>
          Employment service information is unavailable.
        </MessageBox>
      ) : (
        <div style={metricGridStyle}>
          <Metric
            label="Original Employment"
            value={formatDate(summary.originalEmploymentDate)}
          />

          <Metric
            label={
              summary.latestRehireDate
                ? "Latest Rehire"
                : "Latest Employment"
            }
            value={formatDate(summary.latestEmploymentDate)}
          />

          <Metric
            label="Current Episode"
            value={
              summary.currentEpisode
                ? compactDuration(
                    summary.currentEpisode.duration
                  )
                : "No current episode"
            }
          />

          <Metric
            label="Cumulative Service"
            value={compactDuration(summary.cumulativeService)}
          />

          <Metric
            label="Previous Service"
            value={compactDuration(
              summary.previousCompletedService
            )}
          />

          <Metric
            label="Employment Episodes"
            value={String(summary.episodeCount || 0)}
          />

          <Metric
            label="Service Gaps"
            value={
              summary.serviceGaps?.count
                ? `${summary.serviceGaps.count} gap${
                    summary.serviceGaps.count === 1 ? "" : "s"
                  }`
                : "None"
            }
          />

          <Metric
            label="Total Gap Time"
            value={compactDuration(
              summary.serviceGaps?.totalDuration
            )}
          />
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }) {
  return (
    <span style={statusStyle}>
      {formatStatus(status)}
    </span>
  );
}

function MessageBox({ children, error = false }) {
  return (
    <div
      style={{
        ...messageStyle,
        color: error
          ? "var(--chris-danger)"
          : "var(--chris-text-secondary)",
        border: error
          ? "1px solid rgba(251,113,133,.30)"
          : "1px solid var(--chris-border-soft)",
      }}
    >
      {children}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  );
}

function compactDuration(duration) {
  if (!duration) return "0d";

  const parts = [];

  if (Number(duration.years)) {
    parts.push(`${duration.years}y`);
  }

  if (Number(duration.months)) {
    parts.push(`${duration.months}m`);
  }

  if (
    Number(duration.days) ||
    parts.length === 0
  ) {
    parts.push(
      `${Number(duration.days) || 0}d`
    );
  }

  return parts.join(" ");
}

function formatStatus(status) {
  if (!status) return "Unknown";

  return String(status)
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const panelStyle = {
  marginTop: "22px",
  padding: "22px",
  borderRadius: "var(--chris-radius-card)",
  border: "1px solid var(--chris-border-gold)",
  background:
    "linear-gradient(145deg,rgba(12,38,26,.94),rgba(7,18,13,.98))",
  boxShadow: "var(--chris-shadow-card)",
  color: "var(--chris-text-main)",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const titleStyle = {
  color: "var(--chris-text-main)",
  fontSize: "var(--chris-font-xl)",
  fontWeight: 900,
};

const subtitleStyle = {
  marginTop: 4,
  color: "var(--chris-text-secondary)",
  fontSize: "var(--chris-font-sm)",
};

const metricGridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(170px,1fr))",
  gap: 12,
  marginTop: 18,
};

const metricStyle = {
  padding: "14px 15px",
  borderRadius: "var(--chris-radius-md)",
  background: "rgba(255,255,255,.025)",
  border: "1px solid var(--chris-border-soft)",
};

const metricLabelStyle = {
  color: "var(--chris-text-secondary)",
  fontSize: "var(--chris-font-xs)",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const metricValueStyle = {
  marginTop: 7,
  color: "var(--chris-text-main)",
  fontSize: "var(--chris-font-sm)",
  fontWeight: 900,
};

const statusStyle = {
  padding: "6px 10px",
  borderRadius: "var(--chris-radius-pill)",
  border: "1px solid rgba(212,175,55,.25)",
  background: "rgba(212,175,55,.07)",
  color: "var(--chris-gold)",
  fontSize: "var(--chris-font-xs)",
  fontWeight: 900,
};

const messageStyle = {
  marginTop: 18,
  padding: "14px 15px",
  borderRadius: "var(--chris-radius-md)",
  background: "rgba(255,255,255,.025)",
  fontSize: "var(--chris-font-sm)",
  fontWeight: 700,
};

export default EmploymentServiceSummary;
