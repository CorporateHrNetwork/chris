import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaBalanceScale,
  FaChartLine,
  FaDownload,
  FaFileInvoiceDollar,
  FaHandHoldingUsd,
  FaHistory,
  FaMoneyCheckAlt,
  FaPlusCircle,
  FaUsers,
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";
import EmployeeSearchSelect from "../components/EmployeeSearchSelect";
import LoanProfile from "./LoanProfile";
import LoanBulkUpload from "./LoanBulkUpload";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../services/api";

const MAX_REPAYMENT_MONTHS = 600;
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const money = (value) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 9,
  border: "1px solid var(--chris-dashboard-border)",
  background: "var(--chris-dashboard-surface)",
  color: "var(--chris-dashboard-text)",
};
const buttonStyle = { border: 0, borderRadius: 9, padding: "9px 13px", fontWeight: 800, cursor: "pointer" };
const primaryButton = { ...buttonStyle, background: "var(--chris-dashboard-gold)", color: "#111" };
const secondaryButton = { ...buttonStyle, background: "var(--chris-dashboard-surface)", color: "var(--chris-dashboard-text)", border: "1px solid var(--chris-dashboard-border)" };
const dangerButton = { ...secondaryButton, color: "#ef4444", border: "1px solid rgba(239,68,68,.55)" };

const emptyForm = () => ({
  employeeNumber: "",
  approvedAmount: "",
  installmentAmount: "",
  gmApprovalDate: today(),
  disbursedDate: today(),
  recoveryStartMonth: currentMonth(),
  purpose: "",
  gmApprovalReference: "",
  accountsPaymentReference: "",
  notes: "",
  suretyEmployeeNumber: "",
});

function addMonths(month, offset) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return "";
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= MAX_REPAYMENT_MONTHS) return "";
  const [year, monthNumber] = month.split("-").map(Number);
  const timestamp = Date.UTC(year, monthNumber - 1 + offset, 1);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toISOString().slice(0, 7);
  } catch {
    return "";
  }
}

function repaymentPlan(balanceValue, installmentValue, startMonth) {
  const balance = Number(balanceValue);
  const installment = Number(installmentValue);
  if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(installment) || installment <= 0 || !/^\d{4}-\d{2}$/.test(startMonth || "")) {
    return null;
  }
  const installmentCount = Math.ceil(balance / installment);
  if (!Number.isSafeInteger(installmentCount) || installmentCount < 1 || installmentCount > MAX_REPAYMENT_MONTHS) {
    return {
      invalidReason: `The installment is too small for this balance. Increase it so recovery completes within ${MAX_REPAYMENT_MONTHS} months.`,
      installmentCount,
    };
  }
  const endMonth = addMonths(startMonth, installmentCount - 1);
  if (!endMonth) {
    return { invalidReason: "CHRiS could not calculate a safe repayment end month. Review the installment and recovery start month." };
  }
  const finalInstallment = Math.round((balance - installment * Math.max(0, installmentCount - 1)) * 100) / 100;
  return {
    installmentCount,
    startMonth,
    endMonth,
    finalInstallment: finalInstallment || installment,
  };
}

function Loans() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [summary, setSummary] = useState({});
  const [loans, setLoans] = useState([]);
  const [recoveries, setRecoveries] = useState([]);
  const [loanPolicies, setLoanPolicies] = useState([]);
  const [capabilities, setCapabilities] = useState({
    canManageLoans: false,
    canDeleteEmployeeFinancialInputs: false,
    canBulkPayrollInputs: false,
    isBranchHr: false,
    isHeadHr: false,
  });
  const [selectedLoanProfile, setSelectedLoanProfile] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loanSearch, setLoanSearch] = useState("");
  const [topUpParent, setTopUpParent] = useState(null);
  const [editingLoan, setEditingLoan] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [collateral, setCollateral] = useState(null);
  const [collateralLoading, setCollateralLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const [summaryResult, loansResult, recoveryResult, policyResult, capabilityResult] = await Promise.all([
        apiRequest("/api/loans/summary"),
        apiRequest("/api/loans"),
        apiRequest("/api/loans/recoveries"),
        apiRequest("/api/loans/policies"),
        apiRequest("/api/payroll/hr-input-capabilities").catch(() => ({ data: {} })),
      ]);
      setSummary(summaryResult?.data || {});
      setLoans(loansResult?.data || []);
      setRecoveries(recoveryResult?.data || []);
      setLoanPolicies(policyResult?.data?.policies || []);
      setCapabilities((current) => ({ ...current, ...(capabilityResult?.data || {}) }));
    } catch (requestError) {
      setError(requestError?.message || "Unable to load Loans.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (editingLoan) {
      setCollateral(null);
      setCollateralLoading(false);
      return undefined;
    }
    const employeeNumber = topUpParent?.employeeNumber || form.employeeNumber;
    if (!employeeNumber) {
      setCollateral(null);
      return undefined;
    }
    let active = true;
    (async () => {
      try {
        setCollateralLoading(true);
        const result = await apiRequest(`/api/eosb/collateral/${encodeURIComponent(employeeNumber)}`);
        if (active) setCollateral(result?.data?.statement || null);
      } catch {
        if (active) setCollateral(null);
      } finally {
        if (active) setCollateralLoading(false);
      }
    })();
    return () => { active = false; };
  }, [form.employeeNumber, topUpParent, editingLoan]);

  const setField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setError("");
    setMessage("");
  };

  const setEmployee = (employeeNumber) => {
    setForm((current) => ({ ...current, employeeNumber, suretyEmployeeNumber: "" }));
    setError("");
    setMessage("");
  };

  const resetForm = () => {
    setTopUpParent(null);
    setEditingLoan(null);
    setCollateral(null);
    setForm(emptyForm());
  };

  const startTopUp = (loan) => {
    setEditingLoan(null);
    setTopUpParent(loan);
    setForm({
      employeeNumber: loan.employeeNumber,
      approvedAmount: "",
      installmentAmount: String(loan.installmentAmount || ""),
      gmApprovalDate: today(),
      disbursedDate: today(),
      recoveryStartMonth: currentMonth(),
      purpose: loan.purpose || "",
      gmApprovalReference: "",
      accountsPaymentReference: "",
      notes: "",
      suretyEmployeeNumber: "",
    });
    setError("");
    setMessage("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startEdit = (loan) => {
    setTopUpParent(null);
    setEditingLoan(loan);
    setCollateral(null);
    setForm({
      employeeNumber: loan.employeeNumber,
      approvedAmount: String(loan.principalAmount ?? ""),
      installmentAmount: String(loan.installmentAmount ?? ""),
      gmApprovalDate: String(loan.approvedDate || loan.applicationDate || today()).slice(0, 10),
      disbursedDate: String(loan.disbursedDate || today()).slice(0, 10),
      recoveryStartMonth: String(loan.recoveryStartDate || today()).slice(0, 7),
      purpose: loan.purpose || "",
      gmApprovalReference: "",
      accountsPaymentReference: "",
      notes: loan.notes || "",
      suretyEmployeeNumber: "",
    });
    setError("");
    setMessage("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const editingRecovered = editingLoan
    ? Math.max(0, Number(editingLoan.principalAmount || 0) - Number(editingLoan.outstandingAmount || 0))
    : 0;
  const editingHistoryLocked = Boolean(editingLoan && editingRecovered > 0);
  const proposedBalance = editingLoan
    ? editingHistoryLocked
      ? Math.max(0, Number(editingLoan.outstandingAmount || 0))
      : Math.max(0, Number(form.approvedAmount || 0))
    : topUpParent
      ? Math.max(0, Number(topUpParent.outstandingAmount || 0)) + Math.max(0, Number(form.approvedAmount || 0))
      : Math.max(0, Number(form.approvedAmount || 0));
  const proposedPrincipal = topUpParent
    ? Math.max(0, Number(topUpParent.principalAmount || 0)) + Math.max(0, Number(form.approvedAmount || 0))
    : Math.max(0, Number(form.approvedAmount || 0));
  const plan = repaymentPlan(proposedBalance, form.installmentAmount, form.recoveryStartMonth);
  const validPlan = Boolean(plan && !plan.invalidReason);

  const submit = async (event) => {
    event.preventDefault();
    if (!editingLoan && collateral?.loanCollateral?.mode === "SURETY_REQUIRED" && !form.suretyEmployeeNumber) {
      setError("This employee requires an internal employee surety. Select the surety before recording the approved amount.");
      return;
    }
    if (!validPlan) {
      setError(plan?.invalidReason || "Enter a valid amount, installment and recovery start month.");
      return;
    }
    try {
      setBusy(editingLoan ? `edit-${editingLoan.id}` : topUpParent ? `topup-${topUpParent.id}` : "record");
      setError("");
      setMessage("");

      if (editingLoan) {
        await apiRequest(`/api/loans/${editingLoan.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            employeeNumber: editingLoan.employeeNumber,
            principalAmount: form.approvedAmount,
            installmentAmount: form.installmentAmount,
            recoveryStartDate: `${form.recoveryStartMonth}-01`,
            purpose: form.purpose,
            notes: form.notes,
          }),
        });
        setMessage(`Loan ${editingLoan.loanNumber} changes saved. Payroll history remains protected and draft payroll was marked for recalculation.`);
        resetForm();
        await load();
        return;
      }

      const body = {
        employeeNumber: topUpParent?.employeeNumber || form.employeeNumber,
        approvedAmount: form.approvedAmount,
        topUpAmount: form.approvedAmount,
        installmentAmount: form.installmentAmount,
        gmApprovalDate: form.gmApprovalDate,
        disbursedDate: form.disbursedDate,
        recoveryStartDate: `${form.recoveryStartMonth}-01`,
        purpose: form.purpose,
        gmApprovalReference: form.gmApprovalReference,
        accountsPaymentReference: form.accountsPaymentReference,
        notes: form.notes,
        suretyEmployeeNumber: form.suretyEmployeeNumber || undefined,
      };
      const endpoint = topUpParent
        ? `/api/loans/${topUpParent.id}/top-up`
        : "/api/loans/approved-disbursed";
      const result = await apiRequest(endpoint, { method: "POST", body: JSON.stringify(body) });
      const returnedPlan = result?.data?.repaymentPlan;
      if (topUpParent) {
        setMessage(`Top-up merged into ${topUpParent.loanNumber}. Revised balance ${money(result?.data?.outstandingAmount || proposedBalance)} over ${returnedPlan?.installmentCount || plan?.installmentCount || 0} installment(s). No second loan account was created.`);
      } else {
        setMessage("GM-approved loan recorded as already disbursed outside CHRiS and activated for payroll recovery.");
      }
      resetForm();
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to save the loan record.");
    } finally {
      setBusy("");
    }
  };

  const statusAction = async (loan, action) => {
    try {
      setBusy(`${action}-${loan.id}`);
      setError("");
      await apiRequest(`/api/loans/${loan.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason: `${action} through Loans workspace` }),
      });
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to update loan status.");
    } finally {
      setBusy("");
    }
  };

  const completeExternally = async (loan) => {
    const outstanding = Math.max(0, Number(loan.outstandingAmount || 0));
    if (outstanding <= 0) {
      setError("This loan has no outstanding balance to clear.");
      return;
    }
    const reason = window.prompt(
      `Record how ${loan.employeeNumber} — ${loan.employeeName} cleared the remaining ${money(outstanding)} outside salary deduction. Include the payment source/reference and supporting note:`
    );
    if (!reason?.trim()) return;
    if (!window.confirm(
      `Mark loan ${loan.loanNumber} COMPLETED and set its outstanding balance to ₦0.00? No payroll recovery will be fabricated. This action and the previous balance remain traceable in the organization audit trail.`
    )) return;

    try {
      setBusy(`COMPLETE_EXTERNAL-${loan.id}`);
      setError("");
      setMessage("");
      await apiRequest(`/api/loans/${loan.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "COMPLETE_EXTERNAL",
          reason: reason.trim(),
        }),
      });
      setMessage(`Loan ${loan.loanNumber} marked COMPLETED after external settlement of ${money(outstanding)}. Payroll recovery has stopped and the action is preserved in the audit trail.`);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to complete the loan from the external settlement.");
    } finally {
      setBusy("");
    }
  };

  const deleteLoan = async (loan) => {
    const reason = window.prompt(`Reason for deleting unused loan ${loan.loanNumber} for ${loan.employeeNumber} — ${loan.employeeName}:`);
    if (!reason) return;
    if (!window.confirm("Delete this unused loan record? CHRiS will block deletion if payroll recovery/financial history already exists, and the deletion remains in the audit trail.")) return;
    try {
      setBusy(`delete-${loan.id}`);
      setError("");
      await apiRequest(`/api/loans/${loan.id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      });
      if (editingLoan?.id === loan.id) resetForm();
      setMessage("Unused loan record deleted. The action remains recorded in the organization audit trail.");
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to delete the loan record.");
    } finally {
      setBusy("");
    }
  };

  const exportBulk = async (format) => {
    try {
      setBusy(`export-${format}`);
      saveDownloadedBlob(await apiDownload(`/api/loans/reports/export?format=${format}`));
    } catch (requestError) {
      setError(requestError?.message || "Unable to export loan report.");
    } finally {
      setBusy("");
    }
  };

  const dashboardMetrics = useMemo(() => {
    const financialLoans = loans.filter((loan) => ["ACTIVE", "PAUSED", "COMPLETED"].includes(loan.status));
    const active = loans.filter((loan) => loan.status === "ACTIVE");
    const outstanding = loans.filter((loan) => ["ACTIVE", "PAUSED"].includes(loan.status))
      .reduce((sum, loan) => sum + Math.max(0, Number(loan.outstandingAmount || 0)), 0);
    const recovered = financialLoans.reduce((sum, loan) => {
      const principal = Number(loan.principalAmount || 0);
      const balance = Math.max(0, Number(loan.outstandingAmount || 0));
      return sum + Math.max(0, principal - balance);
    }, 0);
    return { active: active.length, outstanding, recovered, borrowers: new Set(financialLoans.map((loan) => loan.employeeId || loan.employeeNumber)).size };
  }, [loans]);

  const filteredLoans = useMemo(() => {
    const term = loanSearch.trim().toLowerCase();
    if (!term) return loans;
    return loans.filter((loan) => [loan.employeeNumber, loan.employeeName, loan.loanNumber, loan.purpose, loan.status]
      .filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [loans, loanSearch]);

  const activity = [
    {
      id: "policy",
      icon: <FaHandHoldingUsd />,
      title: "Manual GM Approval",
      description: "GM approval takes place outside CHRiS before authorized HR records the amount.",
      time: "Zermatt policy",
      tone: "success",
    },
    {
      id: "payment",
      icon: <FaFileInvoiceDollar />,
      title: "External Accounts Payment",
      description: "Accounts processes payment outside CHRiS. Recording here does not issue a payment instruction.",
      time: "External process",
      tone: "success",
    },
    {
      id: "recovery",
      icon: <FaBalanceScale />,
      title: "Payroll Recovery",
      description: `${recoveries.filter((row) => row.status === "POSTED").length} posted loan recovery transaction(s).`,
      time: loading ? "Checking" : "Live",
      tone: "success",
    },
  ];

  if (selectedLoanProfile) return <LoanProfile loanId={selectedLoanProfile} onBack={() => setSelectedLoanProfile(null)} />;
  if (showBulkUpload) return <LoanBulkUpload onBack={() => setShowBulkUpload(false)} onImported={async () => { await load(); setShowBulkUpload(false); }} />;

  const scopeText = capabilities.isBranchHr
    ? "You can record and edit approved loans for employees in your assigned branch. The same authoritative records are visible to Head Office."
    : "Head HR can record and maintain approved loans organization-wide. Deletion is limited to unused records so payroll history remains immutable.";

  return (
    <>
      <ModuleDashboardShell
        eyebrow="EMPLOYEE FINANCIAL SUPPORT"
        title="Loans Dashboard"
        description="ZERMATT loans are approved manually by the GM and paid outside CHRiS by Accounts. Authorized Branch HR records assigned-branch employees; Head HR manages the organization-wide register for payroll recovery and audit."
        metricsColumns={4}
        metrics={[
          <DashboardCard key="active" title="Active Loan Accounts" value={loading ? "—" : dashboardMetrics.active} subtitle="Running payroll recovery accounts" icon={<FaHandHoldingUsd />} tone="green" />,
          <DashboardCard key="borrowers" title="Borrowers" value={loading ? "—" : dashboardMetrics.borrowers} subtitle="Employees with recorded financial loan history" icon={<FaUsers />} tone="gold" />,
          <DashboardCard key="outstanding" title="Outstanding Balance" value={loading ? "—" : money(dashboardMetrics.outstanding)} subtitle="Remaining payroll-recoverable balance" icon={<FaBalanceScale />} tone="gold" />,
          <DashboardCard key="recovered" title="Principal Cleared" value={loading ? "—" : money(dashboardMetrics.recovered)} subtitle="Payroll/opening recoveries plus recorded external settlements" icon={<FaMoneyCheckAlt />} tone="green" />,
        ]}
        analytics={<AnalyticsPanel title="Zermatt Loan Control" subtitle="Manual approval outside CHRiS; payroll recovery inside CHRiS." icon={<FaChartLine />}><RecentActivityList items={activity} /></AnalyticsPanel>}
        recentActivity={<AnalyticsPanel title="Recording Rule" subtitle="CHRiS is not a loan-payment engine." icon={<FaFileInvoiceDollar />}><div style={{ display: "grid", gap: 8, lineHeight: 1.6 }}><strong>1. GM approves manually.</strong><span>2. Accounts processes payment outside CHRiS.</span><span>3. Authorized HR records the approved/disbursed amount.</span><span>4. CHRiS recovers the configured installment through payroll.</span><span>5. If an employee clears the balance outside payroll, HR records External Settlement; CHRiS does not fabricate a salary deduction.</span><span style={{ marginTop: 5 }}>{scopeText}</span></div></AnalyticsPanel>}
        quickActions={[
          <QuickActionCard key="record" title="Record Approved Loan" subtitle="Record an already approved/disbursed employee loan" icon={<FaPlusCircle />} onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })} />,
          <QuickActionCard key="advances" title="Salary Advances" subtitle="Same manual GM approval / external payment policy" icon={<FaMoneyCheckAlt />} onClick={() => navigate("/payroll?workspace=salary-advances")} />,
          ...(capabilities.canBulkPayrollInputs ? [<QuickActionCard key="bulk" title="Opening Loan Upload" subtitle="Maintain legacy/opening payroll balances" icon={<FaDownload />} onClick={() => setShowBulkUpload(true)} />] : []),
          <QuickActionCard key="history" title="Recovery History" subtitle="Review posted payroll loan deductions" icon={<FaHistory />} onClick={() => document.getElementById("loan-recovery-history")?.scrollIntoView({ behavior: "smooth" })} />,
        ]}
      />

      <section ref={formRef} style={{ maxWidth: 1240, margin: "0 auto 24px", padding: "0 20px" }}>
        {error && <div role="alert" style={{ padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid #b91c1c", color: "#b91c1c" }}>{error}</div>}
        {message && <div style={{ padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid var(--chris-dashboard-border)", color: "var(--chris-dashboard-text)" }}>{message}</div>}

        <AnalyticsPanel
          title={editingLoan ? `Edit Loan · ${editingLoan.loanNumber}` : topUpParent ? `Record Approved Top-Up · ${topUpParent.loanNumber}` : "Record Approved & Disbursed Loan"}
          subtitle={editingLoan
            ? "Correct the permitted payroll-recovery terms. An increase in principal must be recorded as a Top-Up so collateral is revalidated; posted payroll history remains immutable."
            : topUpParent
              ? "The approved top-up is merged into this same loan account. Existing recoveries remain unchanged and the revised outstanding balance is redistributed using the monthly installment below."
              : "Use only after the GM has manually approved the loan and Accounts has completed payment outside CHRiS. Authorized HR records the financial liability for payroll recovery."}
          icon={<FaPlusCircle />}
        >
          <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(205px,1fr))", gap: 12 }}>
            <EmployeeSearchSelect label="Employee" value={topUpParent?.employeeNumber || editingLoan?.employeeNumber || form.employeeNumber} onChange={setEmployee} disabled={Boolean(topUpParent || editingLoan)} required placeholder="Search employee number or name" />
            <label><small>{editingLoan ? "Cumulative Principal" : topUpParent ? "Top-Up Amount Approved by GM" : "Loan Amount Approved by GM"}</small><input style={inputStyle} type="number" min="0.01" step="0.01" value={form.approvedAmount} onChange={setField("approvedAmount")} disabled={editingHistoryLocked} required /></label>
            <label><small>Monthly Installment</small><input style={inputStyle} type="number" min="0.01" step="0.01" value={form.installmentAmount} onChange={setField("installmentAmount")} required /></label>
            {!editingLoan && <label><small>GM Approval Date</small><input style={inputStyle} type="date" value={form.gmApprovalDate} onChange={setField("gmApprovalDate")} required /></label>}
            {!editingLoan && <label><small>External Accounts Payment Date</small><input style={inputStyle} type="date" value={form.disbursedDate} onChange={setField("disbursedDate")} required /></label>}
            <label><small>Payroll Recovery Start Month</small><input style={inputStyle} type="month" value={form.recoveryStartMonth} onChange={setField("recoveryStartMonth")} required /></label>
            {!editingLoan && <label><small>GM Approval Reference</small><input style={inputStyle} value={form.gmApprovalReference} onChange={setField("gmApprovalReference")} placeholder="Optional approval/minute reference" /></label>}
            {!editingLoan && <label><small>Accounts Payment Reference</small><input style={inputStyle} value={form.accountsPaymentReference} onChange={setField("accountsPaymentReference")} placeholder="Optional transfer/payment reference" /></label>}
            <label><small>Loan Policy / Purpose</small><select style={inputStyle} value={form.purpose} onChange={setField("purpose")} required><option value="">Select ZERMATT loan policy</option>{form.purpose && !loanPolicies.some((policy) => policy.name === form.purpose) && <option value={form.purpose}>{form.purpose} (existing)</option>}{loanPolicies.map((policy) => <option key={policy.code} value={policy.name}>{policy.name} · 0% interest</option>)}</select></label>

            {collateralLoading && <div style={collateralCard}><strong>Checking EoSB / internal-surety basis…</strong></div>}
            {!editingLoan && collateral && <div style={{ ...collateralCard, gridColumn: "1 / -1" }}>
              <strong style={{ color: "var(--chris-dashboard-gold-bright)" }}>Collateral Control</strong>
              <div style={collateralGrid}>
                <span>Service: <strong>{collateral.service?.serviceDays || 0} days</strong></span>
                <span>EoSB: <strong>{money(collateral.eosb?.accruedValue)}</strong></span>
                <span>Existing secured exposure: <strong>{money(collateral.loanCollateral?.existingLoanExposure)}</strong></span>
                <span>Available EoSB collateral: <strong>{money(collateral.loanCollateral?.availableCollateral)}</strong></span>
                <span>Basis: <strong>{collateral.loanCollateral?.mode === "EOSB" ? "EoSB-backed" : "Internal Surety-backed"}</strong></span>
              </div>
              {collateral.loanCollateral?.mode === "SURETY_REQUIRED" && <EmployeeSearchSelect label="Surety Employee" value={form.suretyEmployeeNumber} onChange={(value) => setForm((current) => ({ ...current, suretyEmployeeNumber: value }))} required placeholder="Search active internal employee" />}
            </div>}

            {editingLoan && <div style={{ ...collateralCard, gridColumn: "1 / -1" }}>
              <strong style={{ color: "var(--chris-dashboard-gold-bright)" }}>Controlled Edit</strong>
              <div style={collateralGrid}>
                <span>Recorded principal: <strong>{money(editingLoan.principalAmount)}</strong></span>
                <span>Posted/recovered: <strong>{money(editingRecovered)}</strong></span>
                <span>Outstanding: <strong>{money(editingLoan.outstandingAmount)}</strong></span>
                <span>Principal edit: <strong>{editingHistoryLocked ? "Locked by payroll history" : "May be reduced; increases use Top-Up"}</strong></span>
              </div>
            </div>}

            {topUpParent && <div style={{ ...collateralCard, gridColumn: "1 / -1" }}>
              <strong style={{ color: "var(--chris-dashboard-gold-bright)" }}>Existing Loan + Top-Up</strong>
              <div style={collateralGrid}>
                <span>Current cumulative principal: <strong>{money(topUpParent.principalAmount)}</strong></span>
                <span>Already recovered: <strong>{money(Math.max(0, Number(topUpParent.principalAmount || 0) - Number(topUpParent.outstandingAmount || 0)))}</strong></span>
                <span>Current outstanding: <strong>{money(topUpParent.outstandingAmount)}</strong></span>
                <span>New cumulative principal: <strong>{money(proposedPrincipal)}</strong></span>
                <span>Revised outstanding: <strong>{money(proposedBalance)}</strong></span>
              </div>
            </div>}

            {plan?.invalidReason && <div role="alert" style={{ ...collateralCard, gridColumn: "1 / -1", borderColor: "rgba(239,68,68,.55)" }}><strong>{plan.invalidReason}</strong></div>}
            {validPlan && <div style={{ ...collateralCard, gridColumn: "1 / -1" }}>
              <strong style={{ color: "var(--chris-dashboard-gold-bright)" }}>Revised Repayment Schedule</strong>
              <div style={collateralGrid}>
                <span>Balance to recover: <strong>{money(proposedBalance)}</strong></span>
                <span>Monthly installment: <strong>{money(form.installmentAmount)}</strong></span>
                <span>Total installments: <strong>{plan.installmentCount}</strong></span>
                <span>From: <strong>{plan.startMonth}</strong></span>
                <span>To: <strong>{plan.endMonth}</strong></span>
                <span>Final installment: <strong>{money(plan.finalInstallment)}</strong></span>
              </div>
            </div>}

            <label style={{ gridColumn: "1 / -1" }}><small>Recording Notes</small><textarea style={{ ...inputStyle, minHeight: 76, resize: "vertical" }} value={form.notes} onChange={setField("notes")} placeholder="Optional internal note; payment itself is processed outside CHRiS." /></label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", gridColumn: "1 / -1" }}>
              <button style={primaryButton} disabled={Boolean(busy) || !validPlan}>{busy ? "Saving…" : editingLoan ? "Save Loan Changes" : topUpParent ? "Merge Approved Top-Up" : "Record Approved & Disbursed Loan"}</button>
              {(topUpParent || editingLoan) && <button type="button" style={secondaryButton} onClick={resetForm} disabled={Boolean(busy)}>Cancel</button>}
            </div>
          </form>
        </AnalyticsPanel>
      </section>

      <section style={{ maxWidth: 1240, margin: "0 auto 24px", padding: "0 20px" }}>
        <AnalyticsPanel title="Loan Register" subtitle="One running loan account per facility. Approved top-ups increase the same account rather than creating a second loan." icon={<FaHandHoldingUsd />}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input style={{ ...inputStyle, maxWidth: 360 }} value={loanSearch} onChange={(event) => setLoanSearch(event.target.value)} placeholder="Search Loan / Employee — employee number, employee name, loan number, policy or status" />
            <button style={secondaryButton} onClick={() => exportBulk("xlsx")} disabled={Boolean(busy)}>Bulk Loan Report · XLSX</button>
            <button style={secondaryButton} onClick={() => exportBulk("csv")} disabled={Boolean(busy)}>Export CSV</button>
            <button style={secondaryButton} onClick={() => exportBulk("pdf")} disabled={Boolean(busy)}>Export PDF</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
              <thead><tr>{["Employee", "Loan", "Cumulative Principal", "Cleared", "Outstanding", "Installment", "Recovery Start", "Status", "Action"].map((head) => <th key={head} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{head}</th>)}</tr></thead>
              <tbody>
                {!loading && filteredLoans.length === 0 && <tr><td colSpan="9" style={{ padding: 16 }}>No loan records found.</td></tr>}
                {filteredLoans.map((loan) => {
                  const recovered = Math.max(0, Number(loan.principalAmount || 0) - Number(loan.outstandingAmount || 0));
                  const current = ["ACTIVE", "PAUSED"].includes(loan.status);
                  return <tr key={loan.id}>
                    <td style={cellStyle}><strong>{loan.employeeNumber}</strong><br /><span>{loan.employeeName}</span></td>
                    <td style={cellStyle}>{loan.loanNumber}<br /><span>{loan.purpose || "—"}</span></td>
                    <td style={cellStyle}>{money(loan.principalAmount)}</td>
                    <td style={cellStyle}>{money(recovered)}</td>
                    <td style={cellStyle}>{money(loan.outstandingAmount)}</td>
                    <td style={cellStyle}>{money(loan.installmentAmount)}</td>
                    <td style={cellStyle}>{loan.recoveryStartDate || "—"}</td>
                    <td style={cellStyle}>{loan.status}</td>
                    <td style={cellStyle}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button style={secondaryButton} onClick={() => setSelectedLoanProfile(loan.id)}>View Profile</button>
                      {capabilities.canManageLoans && current && <button style={secondaryButton} onClick={() => startEdit(loan)}>Edit</button>}
                      {capabilities.canManageLoans && current && <button style={secondaryButton} onClick={() => startTopUp(loan)}>Top-Up</button>}
                      {capabilities.canManageLoans && current && Number(loan.outstandingAmount || 0) > 0 && <button style={primaryButton} disabled={Boolean(busy)} onClick={() => completeExternally(loan)}>Mark Completed</button>}
                      {capabilities.canManageLoans && loan.status === "ACTIVE" && <button style={secondaryButton} disabled={Boolean(busy)} onClick={() => statusAction(loan, "PAUSE")}>Pause</button>}
                      {capabilities.canManageLoans && loan.status === "PAUSED" && <button style={secondaryButton} disabled={Boolean(busy)} onClick={() => statusAction(loan, "RESUME")}>Resume</button>}
                      {capabilities.canDeleteEmployeeFinancialInputs && recovered <= 0 && loan.status !== "COMPLETED" && <button style={dangerButton} disabled={Boolean(busy)} onClick={() => deleteLoan(loan)}>Delete</button>}
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </AnalyticsPanel>
      </section>

      <section id="loan-recovery-history" style={{ maxWidth: 1240, margin: "0 auto 36px", padding: "0 20px" }}>
        <AnalyticsPanel title="Loan Recovery History" subtitle="This register contains actual approved-payroll deductions only. External settlements complete the loan without creating a fake payroll recovery and remain traceable in the loan record and organization audit trail." icon={<FaHistory />}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead><tr>{["Date", "Employee", "Loan", "Payroll Period", "Amount", "Status"].map((head) => <th key={head} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{head}</th>)}</tr></thead>
              <tbody>
                {!loading && !recoveries.length && <tr><td colSpan="6" style={{ padding: 16 }}>No approved payroll loan recoveries have posted yet.</td></tr>}
                {recoveries.map((row) => <tr key={row.id}><td style={cellStyle}>{row.recoveryDate}</td><td style={cellStyle}><strong>{row.employeeNumber}</strong> — {row.employeeName}</td><td style={cellStyle}>{row.loanNumber}</td><td style={cellStyle}>{row.payrollPeriodCode}</td><td style={cellStyle}>{money(row.amount)}</td><td style={cellStyle}>{row.status}</td></tr>)}
              </tbody>
            </table>
          </div>
        </AnalyticsPanel>
      </section>
    </>
  );
}

const collateralCard = { padding: 13, borderRadius: 10, border: "1px solid rgba(212,175,55,.28)", background: "rgba(212,175,55,.055)", display: "grid", gap: 8 };
const collateralGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, color: "var(--chris-dashboard-text)", fontSize: 12 };
const cellStyle = { padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)", verticalAlign: "top" };

export default Loans;