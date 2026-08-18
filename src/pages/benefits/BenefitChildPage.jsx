import { useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaChartPie,
  FaClipboardCheck,
} from "react-icons/fa";

function BenefitChildPage({
  eyebrow = "EMPLOYEE REWARDS",
  title,
  description,
  metricLabels = [],
  activityTitle = "Operational Readiness",
}) {
  const navigate =
    useNavigate();

  return (
    <div
      style={{
        color:
          "var(--chris-text-main)",
      }}
    >
      <button
        type="button"
        onClick={() =>
          navigate("/benefits")
        }
        style={backButtonStyle}
      >
        <FaArrowLeft />
        <span>
          Back to Benefits Dashboard
        </span>
      </button>

      <div
        style={{
          marginBottom:
            22,
        }}
      >
        <div
          style={eyebrowStyle}
        >
          {eyebrow}
        </div>

        <h1
          style={titleStyle}
        >
          {title}
        </h1>

        <p
          style={descriptionStyle}
        >
          {description}
        </p>
      </div>

      <div
        style={metricGridStyle}
      >
        {metricLabels.map(
          (label) => (
            <MetricCard
              key={label}
              label={label}
            />
          )
        )}
      </div>

      <section
        style={panelStyle}
      >
        <div
          style={sectionHeaderStyle}
        >
          <div>
            <h2
              style={{
                margin:
                  0,
              }}
            >
              {title} Analytics
            </h2>

            <p
              style={sectionSubtitleStyle}
            >
              Analytical visuals will activate automatically as this child workspace receives live benefit data.
            </p>
          </div>

          <FaChartPie
            style={sectionIconStyle}
          />
        </div>

        <div
          style={emptyStateStyle}
        >
          No live {title.toLowerCase()} analytics are available yet. This page is now independently routed and ready for its operational data model, transactions and reporting.
        </div>
      </section>

      <section
        style={{
          ...panelStyle,
          marginTop:
            18,
        }}
      >
        <div
          style={sectionHeaderStyle}
        >
          <div>
            <h2
              style={{
                margin:
                  0,
              }}
            >
              {activityTitle}
            </h2>

            <p
              style={sectionSubtitleStyle}
            >
              Configuration status, exceptions, recent activity and pending actions will surface here.
            </p>
          </div>

          <FaClipboardCheck
            style={sectionIconStyle}
          />
        </div>

        <div
          style={emptyStateStyle}
        >
          Workspace connected. No operational records have been created yet.
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
}) {
  return (
    <div
      style={metricCardStyle}
    >
      <div
        style={metricLabelStyle}
      >
        {label}
      </div>

      <div
        style={metricValueStyle}
      >
        {"\u2014"}
      </div>

      <div
        style={metricSubtitleStyle}
      >
        Activates with live data
      </div>
    </div>
  );
}

const backButtonStyle = {
  display:
    "inline-flex",
  alignItems:
    "center",
  gap:
    8,
  marginBottom:
    16,
  padding:
    0,
  border:
    "none",
  background:
    "transparent",
  color:
    "var(--chris-gold)",
  fontFamily:
    "var(--chris-font-family)",
  fontSize:
    "var(--chris-font-sm)",
  fontWeight:
    800,
  cursor:
    "pointer",
};

const eyebrowStyle = {
  color:
    "var(--chris-gold)",
  fontSize:
    "var(--chris-font-sm)",
  fontWeight:
    800,
  letterSpacing:
    "0.15em",
};

const titleStyle = {
  margin:
    "7px 0 6px",
  color:
    "var(--chris-text-main)",
  fontSize:
    "var(--chris-font-2xl)",
  fontWeight:
    800,
};

const descriptionStyle = {
  margin:
    0,
  maxWidth:
    900,
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-md)",
  lineHeight:
    1.55,
};

const metricGridStyle = {
  display:
    "grid",
  gridTemplateColumns:
    "repeat(4,minmax(0,1fr))",
  gap:
    16,
  marginBottom:
    18,
};

const metricCardStyle = {
  background:
    "linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",
  border:
    "1px solid var(--chris-border-gold)",
  borderRadius:
    "var(--chris-radius-card)",
  padding:
    20,
  boxShadow:
    "var(--chris-shadow-card)",
};

const metricLabelStyle = {
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-sm)",
  fontWeight:
    700,
};

const metricValueStyle = {
  color:
    "var(--chris-text-main)",
  fontSize:
    28,
  fontWeight:
    800,
  marginTop:
    10,
};

const metricSubtitleStyle = {
  color:
    "var(--chris-text-muted)",
  fontSize:
    "var(--chris-font-xs)",
  marginTop:
    6,
};

const panelStyle = {
  background:
    "linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",
  border:
    "1px solid var(--chris-border-gold)",
  borderRadius:
    "var(--chris-radius-card)",
  padding:
    20,
  boxShadow:
    "var(--chris-shadow-card)",
};

const sectionHeaderStyle = {
  display:
    "flex",
  justifyContent:
    "space-between",
  alignItems:
    "flex-start",
  gap:
    16,
  marginBottom:
    18,
};

const sectionSubtitleStyle = {
  margin:
    "6px 0 0",
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-sm)",
};

const sectionIconStyle = {
  color:
    "var(--chris-gold)",
  fontSize:
    20,
};

const emptyStateStyle = {
  padding:
    "18px 0",
  color:
    "var(--chris-text-secondary)",
  fontSize:
    "var(--chris-font-md)",
  lineHeight:
    1.6,
};

export default BenefitChildPage;