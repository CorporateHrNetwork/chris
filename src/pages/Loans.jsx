import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaHandHoldingUsd,
  FaUsers,
  FaMoneyCheckAlt,
  FaBalanceScale,
  FaFileInvoiceDollar,
  FaChartLine,
  FaPlusCircle,
  FaHistory,
  FaDownload,
  FaIdCard,
  FaFileUpload,
  FaPaperPlane,
  FaCheckCircle,
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
const buttonStyle = {
  border: 0,
  borderRadius: 9,
  padding: "9px 13px",
  fontWeight: 800,
  cursor: "pointer",
};
const primaryButton = { ...buttonStyle, background: "var(--chris-dashboard-gold)", color: "#111" };
const secondaryButton = { ...buttonStyle, background: "var(--chris-dashboard-surface)", color: "var(--chris-dashboard-text)", border: "1px solid var(--chris-dashboard-border)" };

const WORKFLOW_PENDING = ["PENDING_HR_VERIFICATION", "PENDING_GM_APPROVAL"];
const workflowLabel = (status) => ({
  DRAFT: "Draft Application",
  PENDING_HR_VERIFICATION: "Pending HR Verification",
  RETURNED_FOR_CORRECTION: "Returned for Correction",
  PENDING_GM_APPROVAL: "Pending GM Approval",
  GM_APPROVED: "GM Approved",
  AWAITING_DISBURSEMENT: "GM Approved — Awaiting Disbursement",
  PENDING_APPROVAL: "Pending Approval (Legacy)",
  APPROVED: "Approved (Legacy)",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}[status] || status || "—");

function Loans() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [summary, setSummary] = useState({});
  const [loans, setLoans] = useState([]);
  const [recoveries, setRecoveries] = useState([]);
  const [loanPolicies, setLoanPolicies] = useState([]);
  const [selectedLoanProfile, setSelectedLoanProfile] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loanSearch, setLoanSearch] = useState("");
  const [topUpParent, setTopUpParent] = useState(null);
  const [editingLoan, setEditingLoan] = useState(null);
  const [applicationFormFile, setApplicationFormFile] = useState(null);
  const [approvalToken, setApprovalToken] = useState("");
  const [approvalTarget, setApprovalTarget] = useState(null);
  const [form, setForm] = useState({
    employeeNumber: "",
    principalAmount: "",
    installmentAmount: "",
    applicationDate: today(),
    recoveryStartDate: "",
    purpose: "",
    notes: "",
  });
  const [disbursementDrafts, setDisbursementDrafts] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const [summaryResult, loansResult, recoveryResult, policyResult] = await Promise.all([
        apiRequest("/api/loans/summary"),
        apiRequest("/api/loans"),
        apiRequest("/api/loans/recoveries"),
        apiRequest("/api/loans/policies"),
      ]);
      setSummary(summaryResult?.data || {});
      setLoans(loansResult?.data || []);
      setRecoveries(recoveryResult?.data || []);
      setLoanPolicies(policyResult?.data?.policies || []);
    } catch (requestError) {
      setError(requestError?.message || "Unable to load Loans.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("approvalToken") || "";
    if (!token) return;
    setApprovalToken(token);
    (async () => {
      try {
        setBusy("approval-token");
        setError("");
        const result = await apiRequest(`/api/loans/email-approval/${encodeURIComponent(token)}`);
        setApprovalTarget(result?.data || null);
      } catch (requestError) {
        setError(requestError?.message || "Unable to validate the GM approval link.");
      } finally {
        setBusy("");
      }
    })();
  }, []);

  const setField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setError("");
    setMessage("");
  };

  const setEmployee = (employeeNumber) => {
    setForm((current) => ({ ...current, employeeNumber }));
    setError("");
    setMessage("");
  };

  const resetForm = () => {
    setTopUpParent(null);
    setEditingLoan(null);
    setApplicationFormFile(null);
    setForm({
      employeeNumber: "",
      principalAmount: "",
      installmentAmount: "",
      applicationDate: today(),
      recoveryStartDate: "",
      purpose: "",
      notes: "",
    });
  };

  const exportBulk = async (format) => {
    try {
      setBusy(`export-${format}`);
      setError("");
      saveDownloadedBlob(await apiDownload(`/api/loans/reports/export?format=${format}`));
    } catch (requestError) {
      setError(requestError?.message || "Unable to export loan report.");
    } finally {
      setBusy("");
    }
  };

  const uploadApplicationForm = async (loanId, file) => {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    await apiRequest(`/api/loans/${loanId}/application-form`, { method: "POST", body });
  };

  const submitLoan = async (event) => {
    event.preventDefault();
    const newWorkflowApplication = !editingLoan && !topUpParent;
    if (newWorkflowApplication && !applicationFormFile) {
      setError("Attach the completed loan application form before creating and submitting the application.");
      return;
    }
    try {
      setBusy(editingLoan ? `edit-${editingLoan.id}` : "create");
      setError("");
      setMessage("");
      const endpoint = editingLoan
        ? `/api/loans/${editingLoan.id}`
        : topUpParent
          ? `/api/loans/${topUpParent.id}/top-up`
          : "/api/loans/applications";
      const body = {
        ...form,
        employeeNumber: topUpParent?.employeeNumber || form.employeeNumber,
      };
      if (!body.recoveryStartDate) delete body.recoveryStartDate;
      const result = await apiRequest(endpoint, {
        method: editingLoan ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      const loanId = result?.data?.id || editingLoan?.id;

      if ((editingLoan && ["DRAFT", "RETURNED_FOR_CORRECTION"].includes(editingLoan.status)) || newWorkflowApplication) {
        if (applicationFormFile && loanId) await uploadApplicationForm(loanId, applicationFormFile);
      }

      if (newWorkflowApplication && loanId) {
        await apiRequest(`/api/loans/${loanId}/submit-for-hr-verification`, {
          method: "POST",
          body: JSON.stringify({ comments: form.notes || "Submitted by Branch HR & Admin Officer for Head HR verification." }),
        });
        setMessage("Loan application created, form attached and submitted to Head HR for verification. CHRiS has queued the workflow notification automatically.");
      } else if (editingLoan) {
        setMessage("Loan changes saved. If this application was returned, submit it again for Head HR verification from the Loan Register.");
      } else {
        setMessage("Top-up loan application created under the existing top-up workflow.");
      }
      resetForm();
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to save loan application.");
    } finally {
      setBusy("");
    }
  };

  const legacyDecide = async (loan, decision) => {
    try {
      setBusy(loan.id);
      setError("");
      await apiRequest(`/api/loans/${loan.id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision, notes: `${decision} through legacy Loans workspace` }),
      });
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to decide loan.");
    } finally {
      setBusy("");
    }
  };

  const submitForHr = async (loan) => {
    try {
      setBusy(`workflow-${loan.id}`);
      setError("");
      await apiRequest(`/api/loans/${loan.id}/submit-for-hr-verification`, {
        method: "POST",
        body: JSON.stringify({ comments: "Corrected application resubmitted for Head HR verification." }),
      });
      setMessage(`${loan.employeeNumber} — ${loan.employeeName}: submitted for Head HR verification.`);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to submit application for HR verification.");
    } finally {
      setBusy("");
    }
  };

  const hrDecision = async (loan, decision) => {
    const comments = decision === "VERIFY"
      ? "Head HR verified the loan application and forwarded it for GM approval."
      : window.prompt(`Reason for ${decision === "RETURN" ? "returning" : "rejecting"} this loan application:`) || "";
    if (decision !== "VERIFY" && !comments) return;
    try {
      setBusy(`workflow-${loan.id}`);
      setError("");
      await apiRequest(`/api/loans/${loan.id}/hr-verification`, {
        method: "POST",
        body: JSON.stringify({ decision, comments }),
      });
      setMessage(`Head HR decision recorded for ${loan.employeeNumber} — ${loan.employeeName}.`);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to record Head HR decision.");
    } finally {
      setBusy("");
    }
  };

  const gmDecision = async (loan, decision, token = null) => {
    const comments = decision === "APPROVE"
      ? "General Manager approved the verified loan application."
      : window.prompt(`Reason for ${decision === "RETURN" ? "returning" : "rejecting"} this loan application:`) || "";
    if (decision !== "APPROVE" && !comments) return;
    const loanId = loan.id || loan.loanId;
    try {
      setBusy(`workflow-${loanId}`);
      setError("");
      await apiRequest(`/api/loans/${loanId}/gm-decision`, {
        method: "POST",
        body: JSON.stringify({ decision, comments, token: token || undefined }),
      });
      setMessage(`General Manager decision recorded for ${loan.employeeNumber} — ${loan.employeeName}.`);
      setApprovalTarget(null);
      if (token) window.history.replaceState({}, "", "/loans");
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to record General Manager decision.");
    } finally {
      setBusy("");
    }
  };

  const statusAction = async (loan, action) => {
    try {
      setBusy(loan.id);
      setError("");
      await apiRequest(`/api/loans/${loan.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason: `${action} through Loans workspace` }),
      });
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to update loan.");
    } finally {
      setBusy("");
    }
  };

  const legacyDisburse = async (loan) => {
    const draft = disbursementDrafts[loan.id] || { disbursedDate: today(), recoveryStartMonth: currentMonth(), disbursementReference: "" };
    try {
      setBusy(loan.id);
      setError("");
      await apiRequest(`/api/loans/${loan.id}/disburse`, {
        method: "PATCH",
        body: JSON.stringify({ disbursedDate: draft.disbursedDate, recoveryStartDate: `${draft.recoveryStartMonth}-01`, notes: "Loan activated for payroll recovery" }),
      });
      setDisbursementDrafts((current) => ({ ...current, [loan.id]: undefined }));
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to disburse loan.");
    } finally {
      setBusy("");
    }
  };

  const workflowDisburse = async (loan) => {
    const draft = disbursementDrafts[loan.id] || { disbursedDate: today(), recoveryStartMonth: currentMonth(), disbursementReference: "" };
    if (!draft.disbursementReference?.trim()) {
      setError("Enter the disbursement/payment reference before confirming the approved loan.");
      return;
    }
    try {
      setBusy(`workflow-${loan.id}`);
      setError("");
      await apiRequest(`/api/loans/${loan.id}/disbursement`, {
        method: "POST",
        body: JSON.stringify({
          disbursedDate: draft.disbursedDate,
          recoveryStartDate: `${draft.recoveryStartMonth}-01`,
          disbursementReference: draft.disbursementReference,
          notes: "Chief Accountant confirmed loan disbursement in CHRiS.",
        }),
      });
      setDisbursementDrafts((current) => ({ ...current, [loan.id]: undefined }));
      setMessage(`${loan.employeeNumber} — ${loan.employeeName}: loan disbursed and activated for payroll recovery from ${draft.recoveryStartMonth}.`);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to process approved loan disbursement.");
    } finally {
      setBusy("");
    }
  };

  const startTopUp = (loan) => {
    setEditingLoan(null);
    setTopUpParent(loan);
    setApplicationFormFile(null);
    setForm({ employeeNumber: loan.employeeNumber, principalAmount: "", installmentAmount: "", applicationDate: today(), recoveryStartDate: "", purpose: "", notes: "" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startEdit = (loan) => {
    setTopUpParent(null);
    setEditingLoan(loan);
    setApplicationFormFile(null);
    setForm({
      employeeNumber: loan.employeeNumber,
      principalAmount: String(loan.principalAmount ?? ""),
      installmentAmount: String(loan.installmentAmount ?? ""),
      applicationDate: loan.applicationDate || today(),
      recoveryStartDate: loan.recoveryStartDate || "",
      purpose: loan.purpose || "",
      notes: loan.notes || "",
    });
    setError("");
    setMessage("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const editHistoryLocked = Boolean(editingLoan && (editingLoan.disbursedDate || ["ACTIVE", "PAUSED", "COMPLETED"].includes(editingLoan.status)));
  const editEmployeeLocked = Boolean(editHistoryLocked || editingLoan?.parentLoanId);

  const workflowMetrics = useMemo(() => ({
    pendingHr: loans.filter((loan) => loan.status === "PENDING_HR_VERIFICATION").length,
    pendingGm: loans.filter((loan) => loan.status === "PENDING_GM_APPROVAL").length,
    awaitingDisbursement: loans.filter((loan) => ["GM_APPROVED", "AWAITING_DISBURSEMENT"].includes(loan.status)).length,
  }), [loans]);

  const filteredLoans = useMemo(() => {
    const term = loanSearch.trim().toLowerCase();
    if (!term) return loans;
    return loans.filter((loan) => [
      loan.employeeNumber,
      loan.employeeName,
      loan.loanNumber,
      loan.purpose,
      loan.status,
      loan.locationName,
    ].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [loans, loanSearch]);

  const portfolio = useMemo(() => ([
    ["HR Verification", workflowMetrics.pendingHr],
    ["GM Approval", workflowMetrics.pendingGm],
    ["Disbursement", workflowMetrics.awaitingDisbursement],
    ["Active", Number(summary.activeLoans || 0)],
  ]), [summary, workflowMetrics]);
  const portfolioMax = Math.max(1, ...portfolio.map(([, value]) => value));

  const activity = [
    {
      id: "applications",
      icon: <FaHandHoldingUsd />,
      title: "Loan Applications",
      description: `${workflowMetrics.pendingHr} pending Head HR verification · ${workflowMetrics.pendingGm} pending GM approval.`,
      time: loading ? "Checking" : "Live",
      tone: workflowMetrics.pendingHr + workflowMetrics.pendingGm ? "warning" : "success",
    },
    {
      id: "repayments",
      icon: <FaBalanceScale />,
      title: "Payroll Recoveries",
      description: `${recoveries.filter((row) => row.status === "POSTED").length} approved payroll recovery posting(s) are currently posted.`,
      time: loading ? "Checking" : "Live",
      tone: "success",
    },
    {
      id: "advances",
      icon: <FaMoneyCheckAlt />,
      title: "Salary Advances",
      description: "Salary Advances remain a separate payroll liability with their own installment and outstanding balance.",
      time: "Separate control",
      tone: "success",
    },
  ];

  if (selectedLoanProfile) return <LoanProfile loanId={selectedLoanProfile} onBack={() => setSelectedLoanProfile(null)} />;
  if (showBulkUpload) return <LoanBulkUpload onBack={() => setShowBulkUpload(false)} onImported={async () => { await load(); setShowBulkUpload(false); }} />;

  return (
    <>
      <ModuleDashboardShell
        eyebrow="EMPLOYEE FINANCIAL SUPPORT"
        title="Loans Dashboard"
        description="Branch HR creates and submits ZERMATT zero-interest loan applications; Head HR verifies; the GM approves; the Chief Accountant disburses; payroll then recovers installments from the configured recovery month."
        metrics={[
          <DashboardCard key="active" title="Active Loans" value={loading ? "—" : Number(summary.activeLoans || 0)} subtitle="Currently eligible for payroll recovery" icon={<FaHandHoldingUsd />} tone="green" />,
          <DashboardCard key="pending" title="Pending Workflow" value={loading ? "—" : workflowMetrics.pendingHr + workflowMetrics.pendingGm} subtitle="HR verification + GM approval" icon={<FaCheckCircle />} tone="gold" />,
          <DashboardCard key="disbursement" title="Awaiting Disbursement" value={loading ? "—" : workflowMetrics.awaitingDisbursement} subtitle="GM approved; Chief Accountant action" icon={<FaMoneyCheckAlt />} tone="green" />,
          <DashboardCard key="outstanding" title="Outstanding Balance" value={loading ? "—" : money(summary.outstandingBalance)} subtitle="Remaining active/paused loan principal" icon={<FaBalanceScale />} tone="gold" />,
        ]}
        analytics={
          <AnalyticsPanel title="Loan Workflow" subtitle="Simple maker-checker-approver-disbursement lifecycle." icon={<FaChartLine />}>
            <div style={{ display: "grid", gap: 14 }}>
              {portfolio.map(([stage, value]) => (
                <div key={stage} style={{ display: "grid", gridTemplateColumns: "150px 1fr 50px", gap: 12, alignItems: "center" }}>
                  <span style={{ color: "var(--chris-dashboard-text)", fontWeight: 800 }}>{stage}</span>
                  <div className="chris-progress"><div className="chris-progress__bar" style={{ width: `${Math.round((value / portfolioMax) * 100)}%` }} /></div>
                  <strong style={{ color: "var(--chris-dashboard-gold-bright)", textAlign: "right" }}>{loading ? "—" : value}</strong>
                </div>
              ))}
            </div>
          </AnalyticsPanel>
        }
        recentActivity={
          <AnalyticsPanel title="Loan Intelligence" subtitle="Approval, disbursement and payroll recovery controls." icon={<FaFileInvoiceDollar />}>
            <RecentActivityList items={activity} />
          </AnalyticsPanel>
        }
        quickActions={[
          <QuickActionCard key="new-loan" title="New Loan Application" subtitle="Create, attach form and submit to Head HR" icon={<FaPlusCircle />} onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })} />,
          <QuickActionCard key="bulk-upload" title="Bulk Loan Upload" subtitle="Import or correct opening loan balances" icon={<FaFileUpload />} onClick={() => setShowBulkUpload(true)} />,
          <QuickActionCard key="advances" title="Salary Advances" subtitle="Open advance installment register" icon={<FaMoneyCheckAlt />} onClick={() => navigate("/payroll?workspace=salary-advances")} />,
          <QuickActionCard key="history" title="Recovery History" subtitle="Review posted/reversed payroll loan deductions" icon={<FaHistory />} onClick={() => document.getElementById("loan-recovery-history")?.scrollIntoView({ behavior: "smooth" })} />,
        ]}
      />

      {approvalTarget && (
        <section style={{ maxWidth: 1240, margin: "0 auto 24px", padding: "0 20px" }}>
          <AnalyticsPanel title="General Manager Loan Approval" subtitle="This secure email link is bound to the General Manager account and remains auditable. Authentication is required before a decision can be recorded." icon={<FaPaperPlane />}>
            <div style={{ display: "grid", gap: 8 }}>
              <strong>{approvalTarget.employeeNumber} — {approvalTarget.employeeName}</strong>
              <span>{approvalTarget.loanNumber} · {approvalTarget.purpose} · {money(approvalTarget.principalAmount)} · installment {money(approvalTarget.installmentAmount)}</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={primaryButton} disabled={Boolean(busy)} onClick={() => gmDecision(approvalTarget, "APPROVE", approvalToken)}>Approve</button>
                <button style={secondaryButton} disabled={Boolean(busy)} onClick={() => gmDecision(approvalTarget, "RETURN", approvalToken)}>Return for Correction</button>
                <button style={secondaryButton} disabled={Boolean(busy)} onClick={() => gmDecision(approvalTarget, "REJECT", approvalToken)}>Reject</button>
              </div>
            </div>
          </AnalyticsPanel>
        </section>
      )}

      <section ref={formRef} style={{ maxWidth: 1240, margin: "0 auto 24px", padding: "0 20px" }}>
        {error && <div style={{ padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid #b91c1c", color: "#b91c1c" }}>{error}</div>}
        {message && <div style={{ padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid var(--chris-dashboard-border)", color: "var(--chris-dashboard-text)" }}>{message}</div>}

        <AnalyticsPanel
          title={editingLoan ? `Edit Loan · ${editingLoan.loanNumber}` : topUpParent ? `Top-Up Application · ${topUpParent.loanNumber}` : "New Loan Application"}
          subtitle={editingLoan
            ? (editHistoryLocked
                ? "The loan has financial history. Historical identity remains locked; permitted future settings may be adjusted without rewriting posted recoveries."
                : "Draft/returned applications can be corrected before resubmission. Applications pending verification/approval are frozen.")
            : "Branch HR & Admin selects the employee, completes the terms and attaches the signed/filled loan application form. CHRiS then sends it to Head HR for verification before GM approval."}
          icon={<FaPlusCircle />}
        >
          <form onSubmit={submitLoan} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
            <EmployeeSearchSelect label="Employee" value={topUpParent?.employeeNumber || form.employeeNumber} onChange={setEmployee} disabled={Boolean(topUpParent) || editEmployeeLocked} required placeholder="Search employee number or name" />
            <label><small>Principal Amount</small><input style={{ ...inputStyle, ...(editHistoryLocked ? { opacity: .68 } : {}) }} type="number" min="0.01" step="0.01" value={form.principalAmount} onChange={setField("principalAmount")} disabled={editHistoryLocked} required /></label>
            <label><small>Monthly Installment</small><input style={inputStyle} type="number" min="0.01" step="0.01" value={form.installmentAmount} onChange={setField("installmentAmount")} required /></label>
            <label><small>Application Date</small><input style={{ ...inputStyle, ...(editHistoryLocked ? { opacity: .68 } : {}) }} type="date" value={form.applicationDate} onChange={setField("applicationDate")} disabled={editHistoryLocked} required /></label>
            {editingLoan?.disbursedDate && <label><small>Recovery Start</small><input style={inputStyle} type="date" value={form.recoveryStartDate} onChange={setField("recoveryStartDate")} required /></label>}
            <label><small>Loan Policy / Purpose</small><select style={inputStyle} value={form.purpose} onChange={setField("purpose")} required>
              <option value="">Select ZERMATT loan policy</option>
              {form.purpose && !loanPolicies.some((policy) => policy.name === form.purpose) && <option value={form.purpose}>{form.purpose} (existing)</option>}
              {loanPolicies.map((policy) => <option key={policy.code} value={policy.name}>{policy.name} · 0% interest</option>)}
            </select></label>
            {!topUpParent && (!editingLoan || ["DRAFT", "RETURNED_FOR_CORRECTION"].includes(editingLoan.status)) && (
              <label><small>Completed Loan Application Form {editingLoan ? "(optional replacement)" : "*"}</small><input style={inputStyle} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => setApplicationFormFile(e.target.files?.[0] || null)} required={!editingLoan} /></label>
            )}
            <label><small>Notes</small><input style={inputStyle} value={form.notes} onChange={setField("notes")} /></label>
            <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
              <button style={primaryButton} disabled={Boolean(busy) || !(topUpParent?.employeeNumber || form.employeeNumber) || !form.purpose}>{busy ? "Saving…" : editingLoan ? "Save Changes" : topUpParent ? "Create Top-Up" : "Create & Submit to Head HR"}</button>
              {(editingLoan || topUpParent) && <button type="button" style={secondaryButton} onClick={resetForm} disabled={Boolean(busy)}>{editingLoan ? "Cancel Edit" : "Cancel Top-Up"}</button>}
            </div>
          </form>
        </AnalyticsPanel>
      </section>

      <section style={{ maxWidth: 1240, margin: "0 auto 24px", padding: "0 20px" }}>
        <AnalyticsPanel title="Loan Register" subtitle="Search by employee number/name, loan number, policy or status. Employee Number and Full Name are shown together." icon={<FaHandHoldingUsd />}>
          <div style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <label style={{ flex: "1 1 340px", maxWidth: 460 }}>
              <small>Search Loan / Employee</small>
              <input
                aria-label="Search Loan Register"
                style={inputStyle}
                value={loanSearch}
                onChange={(event) => setLoanSearch(event.target.value)}
                placeholder="Employee number, employee name, loan number, policy or status"
              />
              <small style={{ color: "var(--chris-dashboard-muted)" }}>Showing {filteredLoans.length} of {loans.length} loan(s)</small>
            </label>
            <strong style={{ marginLeft: "auto", alignSelf: "center" }}>Bulk Loan Report</strong>
            {[["xlsx", "Excel"], ["csv", "CSV"], ["pdf", "PDF"]].map(([format, label]) => <button key={format} style={secondaryButton} disabled={Boolean(busy)} onClick={() => exportBulk(format)}><FaDownload style={{ marginRight: 6 }} />{busy === `export-${format}` ? "Preparing…" : label}</button>)}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1320 }}>
              <thead><tr>{["Loan", "Employee", "Policy / Purpose", "Principal", "Outstanding", "Installment", "Workflow / Status", "Recovery Start", "Actions"].map((head) => <th key={head} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{head}</th>)}</tr></thead>
              <tbody>
                {!loading && !filteredLoans.length && <tr><td colSpan="9" style={{ padding: 16 }}>{loans.length ? "No loans match the current search." : "No loans have been recorded."}</td></tr>}
                {filteredLoans.map((loan) => {
                  const draft = disbursementDrafts[loan.id] || { disbursedDate: today(), recoveryStartMonth: currentMonth(), disbursementReference: "" };
                  const canEdit = ["DRAFT", "RETURNED_FOR_CORRECTION", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "PAUSED"].includes(loan.status);
                  const isWorkflowDisbursement = ["GM_APPROVED", "AWAITING_DISBURSEMENT"].includes(loan.status);
                  return <tr key={loan.id}>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}><strong>{loan.loanNumber}</strong>{loan.parentLoanNumber ? <div><small>Top-up of {loan.parentLoanNumber}</small></div> : null}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}><strong>{loan.employeeNumber} — {loan.employeeName}</strong></td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{loan.purpose || "—"}<div><small>0% interest</small></div></td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{money(loan.principalAmount)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{money(loan.outstandingAmount)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{money(loan.installmentAmount)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}><strong>{workflowLabel(loan.status)}</strong></td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{loan.recoveryStartDate || "—"}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        <button style={primaryButton} disabled={Boolean(busy)} onClick={() => setSelectedLoanProfile(loan.id)}><FaIdCard style={{ marginRight: 6 }} />View Profile</button>
                        {canEdit && !WORKFLOW_PENDING.includes(loan.status) && <button style={secondaryButton} disabled={Boolean(busy)} onClick={() => startEdit(loan)}>Edit</button>}
                        {["DRAFT", "RETURNED_FOR_CORRECTION"].includes(loan.status) && <button style={secondaryButton} disabled={busy === `workflow-${loan.id}`} onClick={() => submitForHr(loan)}>Submit to Head HR</button>}
                        {loan.status === "PENDING_HR_VERIFICATION" && <>
                          <button style={secondaryButton} disabled={busy === `workflow-${loan.id}`} onClick={() => hrDecision(loan, "VERIFY")}>Verify & Forward to GM</button>
                          <button style={secondaryButton} disabled={busy === `workflow-${loan.id}`} onClick={() => hrDecision(loan, "RETURN")}>Return</button>
                          <button style={secondaryButton} disabled={busy === `workflow-${loan.id}`} onClick={() => hrDecision(loan, "REJECT")}>Reject</button>
                        </>}
                        {loan.status === "PENDING_GM_APPROVAL" && <>
                          <button style={secondaryButton} disabled={busy === `workflow-${loan.id}`} onClick={() => gmDecision(loan, "APPROVE")}>GM Approve</button>
                          <button style={secondaryButton} disabled={busy === `workflow-${loan.id}`} onClick={() => gmDecision(loan, "RETURN")}>GM Return</button>
                          <button style={secondaryButton} disabled={busy === `workflow-${loan.id}`} onClick={() => gmDecision(loan, "REJECT")}>GM Reject</button>
                        </>}
                        {isWorkflowDisbursement && <>
                          <input aria-label="Disbursed Date" style={{ ...inputStyle, width: 145 }} type="date" value={draft.disbursedDate} onChange={(e) => setDisbursementDrafts((current) => ({ ...current, [loan.id]: { ...draft, disbursedDate: e.target.value } }))} />
                          <input aria-label="Recovery Start Month" style={{ ...inputStyle, width: 145 }} type="month" value={draft.recoveryStartMonth} onChange={(e) => setDisbursementDrafts((current) => ({ ...current, [loan.id]: { ...draft, recoveryStartMonth: e.target.value } }))} />
                          <input aria-label="Disbursement Reference" placeholder="Payment/reference no." style={{ ...inputStyle, width: 170 }} value={draft.disbursementReference} onChange={(e) => setDisbursementDrafts((current) => ({ ...current, [loan.id]: { ...draft, disbursementReference: e.target.value } }))} />
                          <button style={secondaryButton} disabled={busy === `workflow-${loan.id}`} onClick={() => workflowDisburse(loan)}>Process Disbursement</button>
                        </>}
                        {loan.status === "PENDING_APPROVAL" && <><button style={secondaryButton} disabled={busy === loan.id} onClick={() => legacyDecide(loan, "APPROVE")}>Legacy Approve</button><button style={secondaryButton} disabled={busy === loan.id} onClick={() => legacyDecide(loan, "REJECT")}>Legacy Reject</button></>}
                        {loan.status === "APPROVED" && <>
                          <input aria-label="Legacy Disbursed Date" style={{ ...inputStyle, width: 145 }} type="date" value={draft.disbursedDate} onChange={(e) => setDisbursementDrafts((current) => ({ ...current, [loan.id]: { ...draft, disbursedDate: e.target.value } }))} />
                          <input aria-label="Legacy Recovery Start Month" style={{ ...inputStyle, width: 145 }} type="month" value={draft.recoveryStartMonth} onChange={(e) => setDisbursementDrafts((current) => ({ ...current, [loan.id]: { ...draft, recoveryStartMonth: e.target.value } }))} />
                          <button style={secondaryButton} disabled={busy === loan.id} onClick={() => legacyDisburse(loan)}>Legacy Disburse</button>
                        </>}
                        {loan.status === "ACTIVE" && <><button style={secondaryButton} disabled={busy === loan.id} onClick={() => statusAction(loan, "PAUSE")}>Pause</button><button style={secondaryButton} onClick={() => startTopUp(loan)}>Top-Up</button></>}
                        {loan.status === "PAUSED" && <><button style={secondaryButton} disabled={busy === loan.id} onClick={() => statusAction(loan, "RESUME")}>Resume</button><button style={secondaryButton} onClick={() => startTopUp(loan)}>Top-Up</button></>}
                        {["PENDING_APPROVAL", "APPROVED", "ACTIVE", "PAUSED"].includes(loan.status) && <button style={secondaryButton} disabled={busy === loan.id} onClick={() => statusAction(loan, "CANCEL")}>Cancel</button>}
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </AnalyticsPanel>
      </section>

      <section id="loan-recovery-history" style={{ maxWidth: 1240, margin: "0 auto 36px", padding: "0 20px" }}>
        <AnalyticsPanel title="Loan Recovery History" subtitle="Payroll draft calculation schedules the installment from the recovery month. The loan balance changes only when payroll is approved; reopened payroll changes the posting to REVERSED rather than deleting history." icon={<FaHistory />}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead><tr>{["Date", "Employee", "Loan", "Payroll Period", "Amount", "Status"].map((head) => <th key={head} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{head}</th>)}</tr></thead>
              <tbody>
                {!loading && !recoveries.length && <tr><td colSpan="6" style={{ padding: 16 }}>No approved payroll loan recoveries have posted yet.</td></tr>}
                {recoveries.map((row) => <tr key={row.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{row.recoveryDate}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}><strong>{row.employeeNumber} — {row.employeeName}</strong></td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{row.loanNumber}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{row.payrollPeriodCode}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{money(row.amount)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{row.status}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </AnalyticsPanel>
      </section>
    </>
  );
}

export default Loans;
