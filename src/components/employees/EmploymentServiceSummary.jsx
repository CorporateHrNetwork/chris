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
          `/api/employment-service/${encodeURIComponent(employeeNumber)}`
        );

        if (!cancelled) {
          setSummary(result.data || null);
        }
      } catch (err) {
        console.error("Employment service summary error:", err);

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
    <section
      style={{
        marginTop: "22px",
        padding: "22px",
        borderRadius: "16px",
        border: "1px solid rgba(8, 122, 67, 0.18)",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(244,249,245,0.98))",
        boxShadow: "0 10px 28px rgba(15,23,42,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "18px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              color: "#087A43",
              fontSize: "16px",
              fontWeight: "900",
            }}
          >
            Employment Service
          </div>

          <div
            style={{
              marginTop: "4px",
              color: "#64748B",
              fontSize: "12px",
            }}
          >
            Service and tenure intelligence calculated from permanent employment episodes.
          </div>
        </div>

        {summary && (
          <StatusBadge
            status={
              summary.employmentStatus ||
              summary.employee?.status
            }
          />
        )}
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
                ? compactDuration(summary.currentEpisode.duration)
                : "No current episode"
            }
          />

          <Metric
            label="Cumulative Service"
            value={compactDuration(summary.cumulativeService)}
          />

          <Metric
            label="Previous Service"
            value={compactDuration(summary.previousCompletedService)}
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
            value={compactDuration(summary.serviceGaps?.totalDuration)}
          />
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }) {
  const label = formatStatus(status);

  const active =
    status === "ACTIVE" ||
    status === "PROBATION" ||
    status === "LEAVE";

  return (
    <span
      style={{
        padding: "7px 11px",
        borderRadius: "999px",
        background: active ? "#ECFDF5" : "#F8FAFC",
        border: active
          ? "1px solid #A7F3D0"
          : "1px solid #CBD5E1",
        color: active ? "#047857" : "#475569",
        fontSize: "10px",
        fontWeight: "900",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function MessageBox({ children, error = false }) {
  return (
    <div
      style={{
        marginTop: "18px",
        padding: "14px 15px",
        borderRadius: "12px",
        border: error
          ? "1px solid #FECACA"
          : "1px solid #E3E9E5",
        background: error
          ? "#FEF2F2"
          : "#FFFFFF",
        color: error
          ? "#991B1B"
          : "#64748B",
        fontSize: "12px",
        fontWeight: "700",
      }}
    >
      {children}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div
      style={{
        padding: "14px 15px",
        borderRadius: "12px",
        background: "#FFFFFF",
        border: "1px solid #E3E9E5",
      }}
    >
      <div
        style={{
          color: "#64748B",
          fontSize: "9px",
          fontWeight: "900",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: "7px",
          color: "#172033",
          fontSize: "14px",
          fontWeight: "800",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function compactDuration(duration) {
  if (!duration) {
    return "0d";
  }

  const parts = [];

  if (Number(duration.years)) {
    parts.push(`${duration.years}y`);
  }

  if (Number(duration.months)) {
    parts.push(`${duration.months}m`);
  }

  if (Number(duration.days) || parts.length === 0) {
    parts.push(`${Number(duration.days) || 0}d`);
  }

  return parts.join(" ");
}

function formatStatus(status) {
  const labels = {
    ACTIVE: "Active",
    PROBATION: "Probation",
    LEAVE: "Leave",
    SUSPENDED: "Suspended",
    TERMINATED: "Terminated",
    RESIGNED: "Resigned",
    RETIRED: "Retired",
    INACTIVE: "Inactive",
  };

  return labels[status] || status || "Unknown";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

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

export default EmploymentServiceSummary;
