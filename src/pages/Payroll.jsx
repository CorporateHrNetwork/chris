import {
  FaMoneyBillWave,
  FaUsers,
  FaReceipt,
  FaUniversity,
  FaPercentage,
  FaFileInvoiceDollar,
  FaChartLine,
  FaCalculator,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";

function Payroll() {
  const activity = [
    {
      id: "payroll-runs",
      icon: <FaMoneyBillWave />,
      title: "Payroll Runs",
      description:
        "Payroll execution history will appear when payroll processing APIs are connected.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "gross-pay",
      icon: <FaReceipt />,
      title: "Gross Pay",
      description:
        "Gross-pay totals will activate when compensation and payroll records are available.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "statutory",
      icon: <FaPercentage />,
      title: "Statutory Deductions",
      description:
        "PAYE, pension and other statutory deductions will surface here.",
      time: "Planned",
      tone: "warning",
    },
    {
      id: "net-pay",
      icon: <FaUniversity />,
      title: "Net Pay & Disbursement",
      description:
        "Net-pay and payment-status analytics will appear here.",
      time: "Planned",
      tone: "warning",
    },
  ];

  return (
    <ModuleDashboardShell
      eyebrow="REWARDS OPERATIONS"
      title="Payroll Dashboard"
      description="Manage payroll execution, compensation inputs, deductions, statutory obligations and payment outcomes from one analytical home."
      metrics={[
        <DashboardCard
          key="employees"
          title="Payroll Employees"
          value="—"
          subtitle="Employees included in payroll"
          icon={<FaUsers />}
          tone="green"
        />,
        <DashboardCard
          key="gross"
          title="Gross Payroll"
          value="—"
          subtitle="Activates with payroll runs"
          icon={<FaMoneyBillWave />}
          tone="gold"
        />,
        <DashboardCard
          key="deductions"
          title="Deductions"
          value="—"
          subtitle="Statutory and other deductions"
          icon={<FaPercentage />}
          tone="green"
        />,
        <DashboardCard
          key="net"
          title="Net Payroll"
          value="—"
          subtitle="Net amount payable"
          icon={<FaUniversity />}
          tone="gold"
        />,
      ]}
      analytics={
        <AnalyticsPanel
          title="Payroll Composition"
          subtitle="Payroll-value composition will activate when payroll execution data is connected."
          icon={<FaChartLine />}
        >
          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            {[
              "Basic Pay",
              "Allowances",
              "Gross Pay",
              "PAYE",
              "Pension",
              "Other Deductions",
              "Net Pay",
            ].map((item) => (
              <div
                key={item}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "150px 1fr 60px",
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
          title="Payroll Intelligence"
          subtitle="Payroll readiness, statutory processing and disbursement indicators."
          icon={<FaFileInvoiceDollar />}
        >
          <RecentActivityList
            items={activity}
          />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard
          key="run"
          title="Execute Payroll"
          subtitle="Prepare and process payroll"
          icon={<FaCalculator />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="rates"
          title="Salary Rates"
          subtitle="Manage compensation rates"
          icon={<FaMoneyBillWave />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="deductions"
          title="Deductions"
          subtitle="Manage employee deductions"
          icon={<FaPercentage />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="statutory"
          title="Statutories"
          subtitle="Review payroll obligations"
          icon={<FaReceipt />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="payslips"
          title="Pay Advice Slips"
          subtitle="Generate employee payslips"
          icon={<FaFileInvoiceDollar />}
          disabled
          onClick={() => {}}
        />,
      ]}
    />
  );
}

export default Payroll;
