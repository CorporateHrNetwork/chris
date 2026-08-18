import {
  FaBriefcase,
  FaUsers,
  FaUserCheck,
  FaCalendarCheck,
  FaFileSignature,
  FaBullhorn,
  FaClipboardList,
  FaHandshake,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";

function Recruitment() {
  const activity = [
    {
      id: "requisition",
      icon: <FaBriefcase />,
      title: "Job Requisitions",
      description:
        "Requisition analytics will activate when the recruitment workflow is connected.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "candidates",
      icon: <FaUsers />,
      title: "Candidate Pipeline",
      description:
        "Candidate stage and screening metrics will appear here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "interviews",
      icon: <FaCalendarCheck />,
      title: "Interview Activity",
      description:
        "Interview schedules and outcomes will surface here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "offers",
      icon: <FaHandshake />,
      title: "Offers & Hiring",
      description:
        "Offer, acceptance and hiring conversion metrics will surface here.",
      time: "Planned",
      tone: "warning",
    },
  ];

  return (
    <ModuleDashboardShell
      eyebrow="TALENT ACQUISITION"
      title="Recruitment Dashboard"
      description="Manage recruitment demand, candidate pipelines, interviews, offers and hiring outcomes from one analytical home."
      metrics={[
        <DashboardCard
          key="open-roles"
          title="Open Roles"
          value="—"
          subtitle="Activates with job requisitions"
          icon={<FaBriefcase />}
          tone="gold"
        />,
        <DashboardCard
          key="candidates"
          title="Active Candidates"
          value="—"
          subtitle="Activates with candidate pipeline"
          icon={<FaUsers />}
          tone="green"
        />,
        <DashboardCard
          key="interviews"
          title="Interviews"
          value="—"
          subtitle="Scheduled interview activity"
          icon={<FaCalendarCheck />}
          tone="gold"
        />,
        <DashboardCard
          key="hires"
          title="Hires"
          value="—"
          subtitle="Completed recruitment outcomes"
          icon={<FaUserCheck />}
          tone="green"
        />,
      ]}
      analytics={
        <AnalyticsPanel
          title="Recruitment Funnel"
          subtitle="Recruitment-stage conversion will appear as hiring data is connected."
          icon={<FaBullhorn />}
        >
          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            {[
              "Requisitions",
              "Applications",
              "Screened",
              "Interviewed",
              "Offered",
              "Hired",
            ].map((stage) => (
              <div
                key={stage}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "120px 1fr 45px",
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
                  {stage}
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
          title="Recruitment Intelligence"
          subtitle="Operational recruitment indicators and workflow readiness."
          icon={<FaClipboardList />}
        >
          <RecentActivityList
            items={activity}
          />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard
          key="requisitions"
          title="Job Requisitions"
          subtitle="Create and manage hiring demand"
          icon={<FaBriefcase />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="candidates"
          title="Candidates"
          subtitle="Manage candidate pipeline"
          icon={<FaUsers />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="interviews"
          title="Interviews"
          subtitle="Schedule and manage interviews"
          icon={<FaCalendarCheck />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="offers"
          title="Offers"
          subtitle="Prepare and track offers"
          icon={<FaFileSignature />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="hiring"
          title="Hiring"
          subtitle="Complete hiring workflow"
          icon={<FaHandshake />}
          disabled
          onClick={() => {}}
        />,
      ]}
    />
  );
}

export default Recruitment;
