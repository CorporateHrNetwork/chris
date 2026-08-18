import {
  FaChalkboardTeacher,
  FaUsers,
  FaCertificate,
  FaBookOpen,
  FaClipboardCheck,
  FaChartLine,
  FaUserGraduate,
  FaCalendarAlt,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";

function Training() {
  const activity = [
    {
      id: "programs",
      icon: <FaChalkboardTeacher />,
      title: "Training Programs",
      description:
        "Program activity and completion metrics will activate when the learning workflow is connected.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "participants",
      icon: <FaUsers />,
      title: "Participants",
      description:
        "Training participation and attendance metrics will appear here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "assessments",
      icon: <FaClipboardCheck />,
      title: "Assessments",
      description:
        "Assessment completion and outcome analytics will surface here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "certificates",
      icon: <FaCertificate />,
      title: "Certifications",
      description:
        "Issued certificates and certification status will appear here.",
      time: "Planned",
      tone: "warning",
    },
  ];

  return (
    <ModuleDashboardShell
      eyebrow="LEARNING & DEVELOPMENT"
      title="Training & Development Dashboard"
      description="Monitor learning programs, participants, assessments, certifications and development outcomes from one analytical home."
      metrics={[
        <DashboardCard
          key="programs"
          title="Active Programs"
          value="—"
          subtitle="Training programs in progress"
          icon={<FaChalkboardTeacher />}
          tone="green"
        />,
        <DashboardCard
          key="participants"
          title="Participants"
          value="—"
          subtitle="Employees in active learning"
          icon={<FaUsers />}
          tone="gold"
        />,
        <DashboardCard
          key="completion"
          title="Completion Rate"
          value="—"
          subtitle="Completed learning activities"
          icon={<FaUserGraduate />}
          tone="green"
        />,
        <DashboardCard
          key="certifications"
          title="Certificates"
          value="—"
          subtitle="Certificates issued"
          icon={<FaCertificate />}
          tone="gold"
        />,
      ]}
      analytics={
        <AnalyticsPanel
          title="Learning Progress"
          subtitle="Learning-progress distribution will activate when training records are connected."
          icon={<FaChartLine />}
        >
          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            {[
              "Assigned",
              "Enrolled",
              "In Progress",
              "Completed",
              "Assessed",
              "Certified",
            ].map((stage) => (
              <div
                key={stage}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "130px 1fr 50px",
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
          title="Learning Intelligence"
          subtitle="Training-readiness and development indicators."
          icon={<FaBookOpen />}
        >
          <RecentActivityList
            items={activity}
          />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard
          key="programs"
          title="Training Programs"
          subtitle="Create and manage programs"
          icon={<FaChalkboardTeacher />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="calendar"
          title="Training Calendar"
          subtitle="Schedule learning activities"
          icon={<FaCalendarAlt />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="participants"
          title="Participants"
          subtitle="Manage training enrolment"
          icon={<FaUsers />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="assessments"
          title="Assessments"
          subtitle="Evaluate learning outcomes"
          icon={<FaClipboardCheck />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="certificates"
          title="Certificates"
          subtitle="Issue and track certificates"
          icon={<FaCertificate />}
          disabled
          onClick={() => {}}
        />,
      ]}
    />
  );
}

export default Training;
