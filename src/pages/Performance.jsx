import {
  FaBullseye,
  FaChartLine,
  FaStar,
  FaTasks,
  FaUsers,
  FaClipboardCheck,
  FaAward,
  FaBalanceScale,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";

function Performance() {
  const activity = [
    {
      id: "goals",
      icon: <FaBullseye />,
      title: "Goals & Objectives",
      description:
        "Goal progress and completion analytics will activate when performance workflows are connected.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "reviews",
      icon: <FaClipboardCheck />,
      title: "Performance Reviews",
      description:
        "Review-cycle status, completion and outcomes will appear here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "ratings",
      icon: <FaStar />,
      title: "Ratings",
      description:
        "Employee and team performance-rating distributions will surface here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "development",
      icon: <FaAward />,
      title: "Development Actions",
      description:
        "Performance-linked development and improvement actions will appear here.",
      time: "Planned",
      tone: "warning",
    },
  ];

  return (
    <ModuleDashboardShell
      eyebrow="PERFORMANCE & DEVELOPMENT"
      title="Performance Dashboard"
      description="Monitor goals, review cycles, ratings, performance outcomes and development actions from one analytical home."
      metrics={[
        <DashboardCard
          key="goals"
          title="Active Goals"
          value="—"
          subtitle="Goals currently in progress"
          icon={<FaBullseye />}
          tone="green"
        />,
        <DashboardCard
          key="reviews"
          title="Review Completion"
          value="—"
          subtitle="Activates with review cycles"
          icon={<FaClipboardCheck />}
          tone="gold"
        />,
        <DashboardCard
          key="rating"
          title="Average Rating"
          value="—"
          subtitle="Across completed reviews"
          icon={<FaStar />}
          tone="green"
        />,
        <DashboardCard
          key="improvement"
          title="Improvement Plans"
          value="—"
          subtitle="Active performance actions"
          icon={<FaTasks />}
          tone="gold"
        />,
      ]}
      analytics={
        <AnalyticsPanel
          title="Performance Distribution"
          subtitle="Performance-rating distribution will activate when review results are connected."
          icon={<FaChartLine />}
        >
          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            {[
              "Exceptional",
              "Exceeds Expectations",
              "Meets Expectations",
              "Partially Meets",
              "Needs Improvement",
            ].map((band) => (
              <div
                key={band}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "180px 1fr 50px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    color:
                      "var(--chris-dashboard-text)",
                    fontWeight: 800,
                  }}
                >
                  {band}
                </span>

                <div className="chris-progress">
                  <div
                    className="chris-progress__bar"
                    style={{ width: "0%" }}
                  />
                </div>

                <strong
                  style={{
                    color:
                      "var(--chris-dashboard-gold-bright)",
                    textAlign: "right",
                  }}
                >
                  —
                </strong>
              </div>
            ))}
          </div>
        </AnalyticsPanel>
      }
      recentActivity={
        <AnalyticsPanel
          title="Performance Intelligence"
          subtitle="Performance-cycle readiness and outcome indicators."
          icon={<FaBalanceScale />}
        >
          <RecentActivityList
            items={activity}
          />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard
          key="goals"
          title="Goals"
          subtitle="Set and manage objectives"
          icon={<FaBullseye />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="reviews"
          title="Review Cycles"
          subtitle="Create and manage reviews"
          icon={<FaClipboardCheck />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="ratings"
          title="Ratings"
          subtitle="Review performance ratings"
          icon={<FaStar />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="teams"
          title="Team Performance"
          subtitle="Compare team outcomes"
          icon={<FaUsers />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="development"
          title="Development Plans"
          subtitle="Track performance actions"
          icon={<FaAward />}
          disabled
          onClick={() => {}}
        />,
      ]}
    />
  );
}

export default Performance;
