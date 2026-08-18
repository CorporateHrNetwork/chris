import {
  FaHandHoldingUsd,
  FaUsers,
  FaMoneyCheckAlt,
  FaBalanceScale,
  FaFileInvoiceDollar,
  FaChartLine,
  FaPlusCircle,
  FaHistory,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";

function Loans() {
  const activity = [
    {
      id: "applications",
      icon: <FaHandHoldingUsd />,
      title: "Loan Applications",
      description:
        "Loan application activity will activate when employee-loan workflows are connected.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "approvals",
      icon: <FaMoneyCheckAlt />,
      title: "Approvals",
      description:
        "Loan approval and disbursement status will surface here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "repayments",
      icon: <FaBalanceScale />,
      title: "Repayments",
      description:
        "Repayment schedules and payroll deductions will appear here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "topup",
      icon: <FaPlusCircle />,
      title: "Top-Up Loans",
      description:
        "Top-up eligibility and additional-loan activity will appear here.",
      time: "Planned",
      tone: "warning",
    },
  ];

  return (
    <ModuleDashboardShell
      eyebrow="EMPLOYEE FINANCIAL SUPPORT"
      title="Loans Dashboard"
      description="Monitor employee loan applications, approvals, disbursements, repayments and top-up eligibility from one analytical home."
      metrics={[
        <DashboardCard
          key="active"
          title="Active Loans"
          value="—"
          subtitle="Open employee loans"
          icon={<FaHandHoldingUsd />}
          tone="green"
        />,
        <DashboardCard
          key="borrowers"
          title="Borrowers"
          value="—"
          subtitle="Employees with active loans"
          icon={<FaUsers />}
          tone="gold"
        />,
        <DashboardCard
          key="outstanding"
          title="Outstanding Balance"
          value="—"
          subtitle="Remaining loan principal"
          icon={<FaBalanceScale />}
          tone="green"
        />,
        <DashboardCard
          key="pending"
          title="Pending Approval"
          value="—"
          subtitle="Applications awaiting action"
          icon={<FaMoneyCheckAlt />}
          tone="gold"
        />,
      ]}
      analytics={
        <AnalyticsPanel
          title="Loan Portfolio"
          subtitle="Portfolio distribution will activate when the loans engine is connected."
          icon={<FaChartLine />}
        >
          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            {[
              "Applications",
              "Approved",
              "Disbursed",
              "Repaying",
              "Completed",
              "Top-Up Eligible",
            ].map((stage) => (
              <div
                key={stage}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "140px 1fr 50px",
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
          title="Loan Intelligence"
          subtitle="Loan-readiness, repayment and top-up indicators."
          icon={<FaFileInvoiceDollar />}
        >
          <RecentActivityList
            items={activity}
          />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard
          key="new-loan"
          title="New Loan"
          subtitle="Start employee loan application"
          icon={<FaPlusCircle />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="applications"
          title="Applications"
          subtitle="Review loan applications"
          icon={<FaHandHoldingUsd />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="repayments"
          title="Repayments"
          subtitle="Manage repayment schedules"
          icon={<FaBalanceScale />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="topups"
          title="Top-Up Loans"
          subtitle="Review top-up eligibility"
          icon={<FaMoneyCheckAlt />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="history"
          title="Loan History"
          subtitle="Review completed loans"
          icon={<FaHistory />}
          disabled
          onClick={() => {}}
        />,
      ]}
    />
  );
}

export default Loans;
