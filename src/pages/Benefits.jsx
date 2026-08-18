import {
  FaGift,
  FaUsers,
  FaHeartbeat,
  FaShieldAlt,
  FaMoneyBillWave,
  FaChartPie,
  FaClipboardCheck,
  FaPlusCircle,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";

function Benefits() {
  const activity = [
    {
      id: "enrolment",
      icon: <FaUsers />,
      title: "Benefit Enrolment",
      description:
        "Employee enrolment activity will appear when benefit plans are connected.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "medical",
      icon: <FaHeartbeat />,
      title: "Health Benefits",
      description:
        "Health-plan participation and employer-cost analytics will surface here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "insurance",
      icon: <FaShieldAlt />,
      title: "Insurance Benefits",
      description:
        "Insurance coverage and eligibility indicators will appear here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "cost",
      icon: <FaMoneyBillWave />,
      title: "Benefit Cost",
      description:
        "Employer and employee benefit-cost analytics will activate with plan data.",
      time: "Planned",
      tone: "warning",
    },
  ];

  return (
    <ModuleDashboardShell
      eyebrow="EMPLOYEE REWARDS"
      title="Benefits Dashboard"
      description="Monitor benefit plans, employee enrolment, coverage, eligibility and employer cost from one analytical home."
      metrics={[
        <DashboardCard
          key="plans"
          title="Active Plans"
          value={"\u2014"}
          subtitle="Configured benefit plans"
          icon={<FaGift />}
          tone="gold"
        />,
        <DashboardCard
          key="employees"
          title="Enrolled Employees"
          value={"\u2014"}
          subtitle="Employees with active benefits"
          icon={<FaUsers />}
          tone="green"
        />,
        <DashboardCard
          key="coverage"
          title="Coverage Rate"
          value={"\u2014"}
          subtitle="Eligible employees covered"
          icon={<FaShieldAlt />}
          tone="gold"
        />,
        <DashboardCard
          key="cost"
          title="Employer Cost"
          value={"\u2014"}
          subtitle="Total employer benefit cost"
          icon={<FaMoneyBillWave />}
          tone="green"
        />,
      ]}
      analytics={
        <AnalyticsPanel
          title="Benefits Composition"
          subtitle="Benefit-category distribution will activate when plan and enrolment records are connected."
          icon={<FaChartPie />}
        >
          <div style={{ display: "grid", gap: 14 }}>
            {[
              "Health / Medical",
              "Life Insurance",
              "Pension Support",
              "Wellness",
              "Allowances",
              "Other Benefits",
            ].map((item) => (
              <div
                key={item}
                style={{
                  display: "grid",
                  gridTemplateColumns: "150px 1fr 50px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    color: "var(--chris-dashboard-text)",
                    fontWeight: 800,
                  }}
                >
                  {item}
                </span>

                <div className="chris-progress">
                  <div
                    className="chris-progress__bar"
                    style={{ width: "0%" }}
                  />
                </div>

                <strong
                  style={{
                    color: "var(--chris-dashboard-gold-bright)",
                    textAlign: "right",
                  }}
                >{"\u2014"}</strong>
              </div>
            ))}
          </div>
        </AnalyticsPanel>
      }
      recentActivity={
        <AnalyticsPanel
          title="Benefits Intelligence"
          subtitle="Plan readiness, coverage and enrolment indicators."
          icon={<FaClipboardCheck />}
        >
          <RecentActivityList items={activity} />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard
          key="plans"
          title="Benefit Plans"
          subtitle="Configure employee benefit plans"
          icon={<FaGift />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="enrolment"
          title="Employee Enrolment"
          subtitle="Manage benefit enrolment"
          icon={<FaUsers />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="health"
          title="Health Benefits"
          subtitle="Manage health coverage"
          icon={<FaHeartbeat />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="insurance"
          title="Insurance"
          subtitle="Manage insurance benefits"
          icon={<FaShieldAlt />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="new-plan"
          title="New Benefit Plan"
          subtitle="Create a benefit plan"
          icon={<FaPlusCircle />}
          disabled
          onClick={() => {}}
        />,
      ]}
    />
  );
}

export default Benefits;
