import {
  useEffect,
  useState,
} from "react";
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
import { apiRequest } from "../services/api";

function ratioPercent(value, total) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total)) * 100);
}

function Payroll() {
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    apiRequest("/api/payroll/readiness")
      .then((result) => {
        if (active) {
          setReadiness(result?.data || null);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) {
          setReadiness(null);
          setError(
            requestError?.message ||
              "Unable to load payroll readiness."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const summary = readiness?.summary || {};
  const currentEmployees = Number(summary.currentEmployees || 0);
  const employmentReady = Number(summary.employmentReady || 0);
  const paymentReady = Number(summary.paymentReady || 0);
  const compensationReady = Number(summary.compensationReady || 0);
  const readyForExecution = Number(summary.readyForExecution || 0);
  const dataReadinessPercent = Number(summary.dataReadinessPercent || 0);

  const activity = [
    {
      id: "employment-readiness",
      icon: <FaUsers />,
      title: "Employment & Costing Readiness",
      description: loading
        ? "Loading current workforce readiness..."
        : `${employmentReady} of ${currentEmployees} payroll employees have authoritative Employment Type and Cost Centre data.`,
      time: loading ? "Checking" : "Live",
      tone: "warning",
    },
    {
      id: "payment-readiness",
      icon: <FaUniversity />,
      title: "Payment Profile Readiness",
      description: loading
        ? "Loading payment-profile readiness..."
        : `${paymentReady} of ${currentEmployees} payroll employees have complete bank, account, currency and payment-method data in onboarding.`,
      time: loading ? "Checking" : "Live",
      tone: "warning",
    },
    {
      id: "compensation-authority",
      icon: <FaMoneyBillWave />,
      title: "Compensation Authority",
      description:
        readiness?.systemBlockers?.[0]?.message ||
        "Authoritative effective-dated compensation rates are not yet configured.",
      time: "Execution blocker",
      tone: "warning",
    },
    {
      id: "attendance-basis",
      icon: <FaCalculator />,
      title: "Attendance Payroll Basis",
      description: `Current payroll attendance basis: ${summary.attendanceBasis || "SYSTEM"}.`,
      time: "Configured",
      tone: "warning",
    },
  ];

  const readinessBars = [
    {
      label: "Employment Authority",
      value: employmentReady,
      percent: ratioPercent(employmentReady, currentEmployees),
    },
    {
      label: "Payment Profile",
      value: paymentReady,
      percent: ratioPercent(paymentReady, currentEmployees),
    },
    {
      label: "Compensation Authority",
      value: compensationReady,
      percent: ratioPercent(compensationReady, currentEmployees),
    },
  ];

  return (
    <ModuleDashboardShell
      eyebrow="REWARDS OPERATIONS"
      title="Payroll Dashboard"
      description="Control payroll readiness across workforce authority, payment details, attendance basis and compensation prerequisites before payroll execution is enabled."
      metrics={[
        <DashboardCard
          key="employees"
          title="Payroll Employees"
          value={loading ? "—" : currentEmployees}
          subtitle="Current payroll-eligible workforce statuses"
          icon={<FaUsers />}
          tone="green"
        />,
        <DashboardCard
          key="readiness"
          title="Data Readiness"
          value={loading ? "—" : `${dataReadinessPercent}%`}
          subtitle="Employment, payment and compensation readiness"
          icon={<FaChartLine />}
          tone="gold"
        />,
        <DashboardCard
          key="payment"
          title="Payment Ready"
          value={loading ? "—" : `${paymentReady}/${currentEmployees}`}
          subtitle="Complete bank and payment profile"
          icon={<FaUniversity />}
          tone="green"
        />,
        <DashboardCard
          key="execution"
          title="Execution Ready"
          value={loading ? "—" : `${readyForExecution}/${currentEmployees}`}
          subtitle="Payroll execution remains controlled"
          icon={<FaMoneyBillWave />}
          tone="gold"
        />,
      ]}
      analytics={
        <AnalyticsPanel
          title="Payroll Readiness Composition"
          subtitle="Live Release-1 readiness from authoritative employee data, onboarding payment details and payroll attendance configuration."
          icon={<FaChartLine />}
        >
          {error ? (
            <div
              style={{
                padding: 14,
                border: "1px solid var(--chris-dashboard-border)",
                borderRadius: 12,
                color: "var(--chris-dashboard-text)",
              }}
            >
              {error}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 14,
              }}
            >
              {readinessBars.map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "170px 1fr 78px",
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
                    {item.label}
                  </span>

                  <div className="chris-progress">
                    <div
                      className="chris-progress__bar"
                      style={{ width: `${loading ? 0 : item.percent}%` }}
                    />
                  </div>

                  <strong
                    style={{
                      color: "var(--chris-dashboard-gold-bright)",
                      textAlign: "right",
                    }}
                  >
                    {loading
                      ? "—"
                      : `${item.value}/${currentEmployees}`}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </AnalyticsPanel>
      }
      recentActivity={
        <AnalyticsPanel
          title="Payroll Control Gate"
          subtitle="CHRIS will not enable payroll execution until the required authorities are available."
          icon={<FaFileInvoiceDollar />}
        >
          <RecentActivityList items={activity} />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard
          key="run"
          title="Execute Payroll"
          subtitle="Disabled until authoritative compensation rates are operational"
          icon={<FaCalculator />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="rates"
          title="Salary Rates"
          subtitle="Next payroll authority increment"
          icon={<FaMoneyBillWave />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="deductions"
          title="Deductions"
          subtitle="Activates after compensation authority"
          icon={<FaPercentage />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="statutory"
          title="Statutories"
          subtitle={`TIN recorded: ${Number(summary.taxRecorded || 0)} · Pension recorded: ${Number(summary.pensionRecorded || 0)}`}
          icon={<FaReceipt />}
          disabled
          onClick={() => {}}
        />,
        <QuickActionCard
          key="payslips"
          title="Pay Advice Slips"
          subtitle="Activates after payroll execution"
          icon={<FaFileInvoiceDollar />}
          disabled
          onClick={() => {}}
        />,
      ]}
    />
  );
}

export default Payroll;
