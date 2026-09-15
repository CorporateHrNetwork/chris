import {
  FaGift,
  FaUsers,
  FaHeartbeat,
  FaShieldAlt,
  FaMoneyBillWave,
  FaChartPie,
  FaClipboardCheck,
  FaPlusCircle,
  FaCalendarAlt,
} from "react-icons/fa";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";
import ZermattLeaveAllowance from "./benefits/ZermattLeaveAllowance";

function Benefits() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspace = searchParams.get("workspace") || "";

  if (workspace === "leave-allowance") return <ZermattLeaveAllowance />;

  const activity = [
    {
      id: "leave-allowance",
      icon: <FaCalendarAlt />,
      title: "Zermatt Leave Allowance",
      description:
        "Annual Leave Allowance is connected to employee entry month, payroll and approved payslips.",
      time: "Active",
      tone: "success",
    },
    {
      id: "enrolment",
      icon: <FaUsers />,
      title: "Benefit Enrolment",
      description:
        "Employee enrolment activity will appear when additional benefit plans are connected.",
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
  ];

  return (
    <ModuleDashboardShell
      eyebrow="EMPLOYEE REWARDS"
      title="Benefits Dashboard"
      description="Monitor benefit plans, employee eligibility, payroll-connected benefits, coverage and employer cost from one analytical home."
      metrics={[
        <DashboardCard
          key="plans"
          title="Active Plans"
          value={"1+"}
          subtitle="Leave Allowance active; other benefit plans expand here"
          icon={<FaGift />}
          tone="gold"
        />,
        <DashboardCard
          key="employees"
          title="Leave Allowance"
          value={"Annual"}
          subtitle="Entry-month cycle after first completed service year"
          icon={<FaCalendarAlt />}
          tone="green"
        />,
        <DashboardCard
          key="coverage"
          title="Payroll Connected"
          value={"Yes"}
          subtitle="Eligible benefit is calculated with payroll"
          icon={<FaShieldAlt />}
          tone="gold"
        />,
        <DashboardCard
          key="cost"
          title="Payslip Element"
          value={"Separate"}
          subtitle="Leave Allowance is separately identified"
          icon={<FaMoneyBillWave />}
          tone="green"
        />,
      ]}
      analytics={
        <AnalyticsPanel
          title="Benefits Composition"
          subtitle="Zermatt Leave Allowance is the first fully payroll-connected Benefits workspace."
          icon={<FaChartPie />}
        >
          <div style={{ display: "grid", gap: 14 }}>
            {[
              ["Leave Allowance", "Active"],
              ["Health / Medical", "Planned"],
              ["Life Insurance", "Planned"],
              ["Pension Support", "Planned"],
              ["Other Benefits", "Planned"],
            ].map(([item, status]) => (
              <div
                key={item}
                style={{
                  display: "grid",
                  gridTemplateColumns: "150px 1fr 70px",
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
                    style={{ width: status === "Active" ? "100%" : "0%" }}
                  />
                </div>

                <strong
                  style={{
                    color: "var(--chris-dashboard-gold-bright)",
                    textAlign: "right",
                  }}
                >{status}</strong>
              </div>
            ))}
          </div>
        </AnalyticsPanel>
      }
      recentActivity={
        <AnalyticsPanel
          title="Benefits Intelligence"
          subtitle="Plan readiness, eligibility and payroll integration indicators."
          icon={<FaClipboardCheck />}
        >
          <RecentActivityList items={activity} />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard
          key="leave-allowance"
          title="Leave Allowance"
          subtitle="Eligibility, projected amount and approved payment history"
          icon={<FaCalendarAlt />}
          onClick={() => navigate("/benefits?workspace=leave-allowance")}
        />,
        <QuickActionCard
          key="plans"
          title="Benefit Plans"
          subtitle="Configure additional employee benefit plans"
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