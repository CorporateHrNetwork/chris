import {
  useEffect,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FaMoneyBillWave,
  FaUsers,
  FaReceipt,
  FaUniversity,
  FaPercentage,
  FaFileInvoiceDollar,
  FaChartLine,
  FaCalculator,
  FaCalendarAlt,
  FaPlusCircle,
  FaClipboardCheck,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";
import PayrollWorkspace from "./payroll/PayrollWorkspace";
import { apiRequest } from "../services/api";

const WORKSPACES = new Set([
  "execute",
  "periods",
  "rates",
  "allowances",
  "deductions",
  "payslips",
  "salary-advances",
  "paid-leave",
  "approvals",
]);

function ratioPercent(value, total) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total)) * 100);
}

function Payroll() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspace = searchParams.get("workspace") || "";
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
          setError(requestError?.message || "Unable to load payroll readiness.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [workspace]);

  if (WORKSPACES.has(workspace)) {
    return <PayrollWorkspace mode={workspace} />;
  }

  const summary = readiness?.summary || {};
  const currentEmployees = Number(summary.currentEmployees || 0);
  const employmentReady = Number(summary.employmentReady || 0);
  const paymentReady = Number(summary.paymentReady || 0);
  const compensationReady = Number(summary.compensationReady || 0);
  const readyForExecution = Number(summary.readyForExecution || 0);
  const dataReadinessPercent = Number(summary.dataReadinessPercent || 0);
  const compensationMissing = Math.max(0, currentEmployees - compensationReady);

  const openWorkspace = (name) => navigate(`/payroll?workspace=${name}`);

  const activity = [
    {
      id: "employment-readiness",
      icon: <FaUsers />,
      title: "Employment & Costing Readiness",
      description: loading
        ? "Loading current workforce readiness..."
        : `${employmentReady} of ${currentEmployees} payroll employees have authoritative Employment Type and Cost Centre data.`,
      time: loading ? "Checking" : "Live",
      tone: employmentReady === currentEmployees && currentEmployees > 0 ? "success" : "warning",
    },
    {
      id: "payment-readiness",
      icon: <FaUniversity />,
      title: "Payment Profile Readiness",
      description: loading
        ? "Loading payment-profile readiness..."
        : `${paymentReady} of ${currentEmployees} payroll employees have complete bank, account, currency and payment-method data in onboarding.`,
      time: loading ? "Checking" : "Live",
      tone: paymentReady === currentEmployees && currentEmployees > 0 ? "success" : "warning",
    },
    {
      id: "compensation-authority",
      icon: <FaMoneyBillWave />,
      title: "Compensation Authority",
      description: compensationMissing
        ? `${compensationMissing} current employee(s) still require an effective salary rate.`
        : "Effective-dated salary authority is available for all current payroll employees.",
      time: compensationMissing ? "Needs attention" : "Ready",
      tone: compensationMissing ? "warning" : "success",
    },
    {
      id: "statutory-control",
      icon: <FaReceipt />,
      title: "Release-1 Statutory Control",
      description:
        readiness?.finalizationBlockers?.[0]?.message ||
        "PAYE/pension statutory automation remains a separate controlled increment.",
      time: "Manual review required",
      tone: "warning",
    },
  ];

  const readinessBars = [
    { label: "Employment Authority", value: employmentReady, percent: ratioPercent(employmentReady, currentEmployees) },
    { label: "Payment Profile", value: paymentReady, percent: ratioPercent(paymentReady, currentEmployees) },
    { label: "Compensation Authority", value: compensationReady, percent: ratioPercent(compensationReady, currentEmployees) },
  ];

  return (
    <ModuleDashboardShell
      eyebrow="REWARDS OPERATIONS"
      title="Payroll Dashboard"
      description="Operate payroll periods, effective salary authority, earnings, deductions, advances, paid-leave inputs, controlled draft execution, payslip records and approvals from one tenant-scoped payroll workspace."
      metrics={[
        <DashboardCard key="employees" title="Payroll Employees" value={loading ? "—" : currentEmployees} subtitle="Current payroll-eligible workforce statuses" icon={<FaUsers />} tone="green" />,
        <DashboardCard key="readiness" title="Data Readiness" value={loading ? "—" : `${dataReadinessPercent}%`} subtitle="Employment, payment and compensation readiness" icon={<FaChartLine />} tone="gold" />,
        <DashboardCard key="payment" title="Payment Ready" value={loading ? "—" : `${paymentReady}/${currentEmployees}`} subtitle="Complete bank and payment profile" icon={<FaUniversity />} tone="green" />,
        <DashboardCard key="execution" title="Draft Execution Ready" value={loading ? "—" : `${readyForExecution}/${currentEmployees}`} subtitle="Controlled payroll calculation readiness" icon={<FaMoneyBillWave />} tone="gold" />,
      ]}
      analytics={
        <AnalyticsPanel
          title="Payroll Readiness Composition"
          subtitle="Live readiness from employee authority, onboarding payment details and effective-dated salary rates."
          icon={<FaChartLine />}
        >
          {error ? (
            <div style={{ padding: 14, border: "1px solid var(--chris-dashboard-border)", borderRadius: 12, color: "var(--chris-dashboard-text)" }}>{error}</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {readinessBars.map((item) => (
                <div key={item.label} style={{ display: "grid", gridTemplateColumns: "170px 1fr 78px", gap: 12, alignItems: "center" }}>
                  <span style={{ color: "var(--chris-dashboard-text)", fontWeight: 800 }}>{item.label}</span>
                  <div className="chris-progress"><div className="chris-progress__bar" style={{ width: `${loading ? 0 : item.percent}%` }} /></div>
                  <strong style={{ color: "var(--chris-dashboard-gold-bright)", textAlign: "right" }}>{loading ? "—" : `${item.value}/${currentEmployees}`}</strong>
                </div>
              ))}
            </div>
          )}
        </AnalyticsPanel>
      }
      recentActivity={
        <AnalyticsPanel
          title="Payroll Control Gate"
          subtitle="Draft calculation is operational; statutory automation and payment transmission remain explicitly separated controls."
          icon={<FaFileInvoiceDollar />}
        >
          <RecentActivityList items={activity} />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard key="run" title="Execute Payroll" subtitle="Calculate controlled draft payroll" icon={<FaCalculator />} onClick={() => openWorkspace("execute")} />,
        <QuickActionCard key="periods" title="Payroll Periods" subtitle="Create, lock and close periods" icon={<FaCalendarAlt />} onClick={() => openWorkspace("periods")} />,
        <QuickActionCard key="rates" title="Salary Rates" subtitle="Individual or Excel bulk salary authority" icon={<FaMoneyBillWave />} onClick={() => openWorkspace("rates")} />,
        <QuickActionCard key="allowances" title="Allowances" subtitle="Configure earnings" icon={<FaPlusCircle />} onClick={() => openWorkspace("allowances")} />,
        <QuickActionCard key="deductions" title="Deductions" subtitle="Configure deductions and manual statutory inputs" icon={<FaPercentage />} onClick={() => openWorkspace("deductions")} />,
        <QuickActionCard key="payslips" title="Payslips" subtitle="Review employee pay records" icon={<FaFileInvoiceDollar />} onClick={() => openWorkspace("payslips")} />,
        <QuickActionCard key="advances" title="Salary Advances" subtitle="Record and recover advances" icon={<FaMoneyBillWave />} onClick={() => openWorkspace("salary-advances")} />,
        <QuickActionCard key="paid-leave" title="Paid Leave" subtitle="Consume paid leave from Leave Management" icon={<FaCalendarAlt />} onClick={() => openWorkspace("paid-leave")} />,
        <QuickActionCard key="approvals" title="Payroll Approvals" subtitle="Submit, approve or reject payroll runs" icon={<FaClipboardCheck />} onClick={() => openWorkspace("approvals")} />,
      ]}
    />
  );
}

export default Payroll;
