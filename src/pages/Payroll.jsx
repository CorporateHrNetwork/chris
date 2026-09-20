import {
  lazy,
  Suspense,
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
  FaHome,
  FaShieldAlt,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";
const PayrollWorkspace = lazy(() => import("./payroll/PayrollWorkspace"));
const NigeriaPayrollSupplementWorkspace = lazy(() => import("./payroll/NigeriaPayrollSupplementWorkspace"));
const SalaryAdvancesManaged = lazy(() => import("./payroll/SalaryAdvancesManaged"));
const SalaryRatesManaged = lazy(() => import("./payroll/SalaryRatesManaged"));
const PayrollComponentsManaged = lazy(() => import("./payroll/PayrollComponentsManaged"));
const RentReliefManaged = lazy(() => import("./payroll/RentReliefManaged"));
const PayrollIntegratedManaged = lazy(() => import("./payroll/PayrollIntegratedManaged"));
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
  "statutory",
  "rent-relief",
]);

function PayrollWorkspaceLoading() {
  return (
    <section aria-live="polite" style={{ minHeight: 280, display: "grid", placeItems: "center", color: "#D4AF37" }}>
      <div role="status" style={{ textAlign: "center", fontWeight: 900 }}>
        Loading payroll workspace…
      </div>
    </section>
  );
}

function ratioPercent(value, total) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total)) * 100);
}

function Payroll() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspace = searchParams.get("workspace") || "";
  const [readiness, setReadiness] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (WORKSPACES.has(workspace)) {
      setLoading(false);
      setError("");
      return () => { active = false; };
    }

    setLoading(true);
    Promise.all([
      apiRequest("/api/payroll/readiness"),
      apiRequest("/api/payroll/compliance-policy").catch(() => null),
    ])
      .then(([readinessResult, complianceResult]) => {
        if (active) {
          setReadiness(readinessResult?.data || null);
          setCompliance(complianceResult?.data || null);
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
    let workspaceView = <PayrollWorkspace mode={workspace} />;
    if (["execute", "payslips", "statutory"].includes(workspace)) workspaceView = <PayrollIntegratedManaged mode={workspace} />;
    else if (workspace === "salary-advances") workspaceView = <SalaryAdvancesManaged />;
    else if (workspace === "rates") workspaceView = <SalaryRatesManaged />;
    else if (workspace === "allowances") workspaceView = <PayrollComponentsManaged kind="ALLOWANCE" />;
    else if (workspace === "deductions") workspaceView = <PayrollComponentsManaged kind="DEDUCTION" />;
    else if (workspace === "rent-relief") workspaceView = <RentReliefManaged />;
    else if (workspace === "approvals") workspaceView = <NigeriaPayrollSupplementWorkspace mode={workspace} />;

    return (
      <Suspense fallback={<PayrollWorkspaceLoading />}>
        {workspaceView}
      </Suspense>
    );
  }

  const summary = readiness?.summary || {};
  const currentEmployees = Number(summary.currentEmployees || 0);
  const employmentReady = Number(summary.employmentReady || 0);
  const paymentReady = Number(summary.paymentReady || 0);
  const compensationReady = Number(summary.compensationReady || 0);
  const readyForExecution = Number(summary.readyForExecution || 0);
  const dataReadinessPercent = Number(summary.dataReadinessPercent || 0);
  const compensationMissing = Math.max(0, currentEmployees - compensationReady);
  const policy = compliance?.policy;

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
        : `${paymentReady} of ${currentEmployees} payroll employees have complete bank, account, currency and payment-method data. Incomplete payment profiles do not block draft payroll calculation, but must be resolved before payment finalization.`,
      time: loading ? "Checking" : "Live",
      tone: paymentReady === currentEmployees && currentEmployees > 0 ? "success" : "warning",
    },
    {
      id: "compensation-authority",
      icon: <FaMoneyBillWave />,
      title: "Gross Salary Authority",
      description: compensationMissing
        ? `${compensationMissing} current employee(s) still require an effective monthly gross salary rate.`
        : "Effective-dated gross salary authority is available for all current payroll employees.",
      time: compensationMissing ? "Needs attention" : "Ready",
      tone: compensationMissing ? "warning" : "success",
    },
    {
      id: "statutory-control",
      icon: <FaShieldAlt />,
      title: "Nigeria Statutory Engine",
      description: policy
        ? `Active: ${policy.code} v${policy.versionNumber}. PAYE and pension are calculated automatically; NSITF and ITF are employer-only costs.`
        : "Nigeria payroll policy must be migrated/configured before statutory payroll execution.",
      time: policy ? "Active" : "Setup required",
      tone: policy ? "success" : "warning",
    },
  ];

  const readinessBars = [
    { label: "Employment Authority", value: employmentReady, percent: ratioPercent(employmentReady, currentEmployees) },
    { label: "Payment Profile", value: paymentReady, percent: ratioPercent(paymentReady, currentEmployees) },
    { label: "Gross Salary Authority", value: compensationReady, percent: ratioPercent(compensationReady, currentEmployees) },
  ];

  return (
    <ModuleDashboardShell
      eyebrow="REWARDS OPERATIONS"
      title="Payroll Dashboard"
      description="Operate ZERMATT payroll periods, gross salary authority, Nigeria-compliant PAYE and pension calculations, integrated loans and salary advances, approved-payroll payslips, other earnings/deductions, rent relief and approval controls."
      metrics={[
        <DashboardCard key="employees" title="Payroll Employees" value={loading ? "—" : currentEmployees} subtitle="Current payroll-eligible workforce statuses" icon={<FaUsers />} tone="green" />,
        <DashboardCard key="readiness" title="Data Readiness" value={loading ? "—" : `${dataReadinessPercent}%`} subtitle="Employment, payment and salary readiness" icon={<FaChartLine />} tone="gold" />,
        <DashboardCard key="payment" title="Payment Ready" value={loading ? "—" : `${paymentReady}/${currentEmployees}`} subtitle="Required before payment finalization" icon={<FaUniversity />} tone="green" />,
        <DashboardCard key="execution" title="Calculation Ready" value={loading ? "—" : `${readyForExecution}/${currentEmployees}`} subtitle="Employment/costing + gross salary authority" icon={<FaMoneyBillWave />} tone="gold" />,
      ]}
      analytics={
        <AnalyticsPanel title="Payroll Readiness Composition" subtitle="Live readiness from employee authority, onboarding payment details and effective-dated monthly gross salary rates." icon={<FaChartLine />}>
          {error ? (
            <div style={{ padding: 14, border: "1px solid var(--chris-dashboard-border)", borderRadius: 12, color: "var(--chris-dashboard-text)" }}>{error}</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {readinessBars.map((item) => (
                <div key={item.label} style={{ display: "grid", gridTemplateColumns: "180px 1fr 78px", gap: 12, alignItems: "center" }}>
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
        <AnalyticsPanel title="Payroll Compliance Gate" subtitle="Payroll calculation, statutory readiness, payment readiness and payment transmission are separate controls." icon={<FaFileInvoiceDollar />}>
          <RecentActivityList items={activity} />
        </AnalyticsPanel>
      }
      quickActions={[
        <QuickActionCard key="run" title="Execute Payroll" subtitle="Calculate PAYE, pension, advances and loan recoveries" icon={<FaCalculator />} onClick={() => openWorkspace("execute")} />,
        <QuickActionCard key="periods" title="Payroll Periods" subtitle="Create, lock and close periods" icon={<FaCalendarAlt />} onClick={() => openWorkspace("periods")} />,
        <QuickActionCard key="rates" title="Salary Rates" subtitle="Maintain authoritative monthly gross salaries" icon={<FaMoneyBillWave />} onClick={() => openWorkspace("rates")} />,
        <QuickActionCard key="statutory" title="Nigeria Statutory Review" subtitle="Active deductions, employer costs and activation candidates" icon={<FaShieldAlt />} onClick={() => openWorkspace("statutory")} />,
        <QuickActionCard key="rent" title="Tax Rent Relief" subtitle="Declare and verify annual rent relief" icon={<FaHome />} onClick={() => openWorkspace("rent-relief")} />,
        <QuickActionCard key="allowances" title="Other Allowances" subtitle="Additional earnings outside the 100% gross structure" icon={<FaPlusCircle />} onClick={() => openWorkspace("allowances")} />,
        <QuickActionCard key="deductions" title="Other Deductions" subtitle="Configure non-statutory deductions" icon={<FaPercentage />} onClick={() => openWorkspace("deductions")} />,
        <QuickActionCard key="payslips" title="Payslips" subtitle="Generated from approved payroll runs" icon={<FaFileInvoiceDollar />} onClick={() => openWorkspace("payslips")} />,
        <QuickActionCard key="advances" title="Salary Advances" subtitle="Record and recover advances" icon={<FaMoneyBillWave />} onClick={() => openWorkspace("salary-advances")} />,
        <QuickActionCard key="paid-leave" title="Paid Leave" subtitle="Consume paid leave from Leave Management" icon={<FaCalendarAlt />} onClick={() => openWorkspace("paid-leave")} />,
        <QuickActionCard key="approvals" title="Payroll Approvals" subtitle="Review, approve or reject payroll runs" icon={<FaClipboardCheck />} onClick={() => openWorkspace("approvals")} />,
        <QuickActionCard key="stat-summary" title="PAYE / Pension Status" subtitle={`TIN recorded: ${Number(summary.taxRecorded || 0)} · Pension recorded: ${Number(summary.pensionRecorded || 0)}`} icon={<FaReceipt />} onClick={() => openWorkspace("statutory")} />,
      ]}
    />
  );
}

export default Payroll;
