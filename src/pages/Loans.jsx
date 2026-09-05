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
} from "react-icons/fa";

import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";
import EmployeeSearchSelect from "../components/EmployeeSearchSelect";
import { apiRequest } from "../services/api";

const today = () => new Date().toISOString().slice(0, 10);
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

function Loans() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [summary, setSummary] = useState({});
  const [loans, setLoans] = useState([]);
  const [recoveries, setRecoveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [topUpParent, setTopUpParent] = useState(null);
  const [form, setForm] = useState({
    employeeNumber: "",
    principalAmount: "",
    installmentAmount: "",
    applicationDate: today(),
    purpose: "",
    notes: "",
  });
  const [disbursementDrafts, setDisbursementDrafts] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const [summaryResult, loansResult, recoveryResult] = await Promise.all([
        apiRequest("/api/loans/summary"),
        apiRequest("/api/loans"),
        apiRequest("/api/loans/recoveries"),
      ]);
      setSummary(summaryResult?.data || {});
      setLoans(loansResult?.data || []);
      setRecoveries(recoveryResult?.data || []);
    } catch (requestError) {
      setError(requestError?.message || "Unable to load Loans.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
    setForm({
      employeeNumber: "",
      principalAmount: "",
      installmentAmount: "",
      applicationDate: today(),
      purpose: "",
      notes: "",
    });
  };

  const submitLoan = async (event) => {
    event.preventDefault();
    try {
      setBusy("create");
      setError("");
      setMessage("");
      const endpoint = topUpParent ? `/api/loans/${topUpParent.id}/top-up` : "/api/loans";
      await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          employeeNumber: topUpParent?.employeeNumber || form.employeeNumber,
        }),
      });
      setMessage(topUpParent ? "Top-up loan application created for approval." : "Loan application created for approval.");
      resetForm();
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to create loan application.");
    } finally {
      setBusy("");
    }
  };

  const decide = async (loan, decision) => {
    try {
      setBusy(loan.id);
      setError("");
      await apiRequest(`/api/loans/${loan.id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision, notes: `${decision} through Loans workspace` }),
      });
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to decide loan.");
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

  const disburse = async (loan) => {
    const draft = disbursementDrafts[loan.id] || { disbursedDate: today(), recoveryStartDate: today() };
    try {
      setBusy(loan.id);
      setError("");
      await apiRequest(`/api/loans/${loan.id}/disburse`, {
        method: "PATCH",
        body: JSON.stringify({ ...draft, notes: "Loan activated for payroll recovery" }),
      });
      setDisbursementDrafts((current) => ({ ...current, [loan.id]: undefined }));
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Unable to disburse loan.");
    } finally {
      setBusy("");
    }
  };

  const startTopUp = (loan) => {
    setTopUpParent(loan);
    setForm((current) => ({ ...current, employeeNumber: loan.employeeNumber }));
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const portfolio = useMemo(() => ([
    ["Pending Approval", Number(summary.pendingApproval || 0)],
    ["Approved", Number(summary.approvedAwaitingDisbursement || 0)],
    ["Active", Number(summary.activeLoans || 0)],
    ["Paused", Number(summary.pausedLoans || 0)],
  ]), [summary]);
  const portfolioMax = Math.max(1, ...portfolio.map(([, value]) => value));

  const activity = [
    {
      id: "applications",
      icon: <FaHandHoldingUsd />,
      title: "Loan Applications",
      description: `${Number(summary.pendingApproval || 0)} application(s) await approval.`,
      time: loading ? "Checking" : "Live",
      tone: Number(summary.pendingApproval || 0) ? "warning" : "success",
    },
    {
      id: "repayments",
      icon: <FaBalanceScale />,
      title: "Payroll Recoveries",
      description: `${recoveries.length} approved payroll recovery posting(s) are recorded.`,
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

  return (
    <>
      <ModuleDashboardShell
        eyebrow="EMPLOYEE FINANCIAL SUPPORT"
        title="Loans Dashboard"
        description="Manage employee loan applications, approval, disbursement, payroll installment recovery, top-ups and history. Loans remain separate from Salary Advances."
        metrics={[
          <DashboardCard key="active" title="Active Loans" value={loading ? "—" : Number(summary.activeLoans || 0)} subtitle="Currently recovering through payroll" icon={<FaHandHoldingUsd />} tone="green" />,
          <DashboardCard key="borrowers" title="Borrowers" value={loading ? "—" : Number(summary.borrowers || 0)} subtitle="Employees with active/paused loans" icon={<FaUsers />} tone="gold" />,
          <DashboardCard key="outstanding" title="Outstanding Balance" value={loading ? "—" : money(summary.outstandingBalance)} subtitle="Remaining active/paused principal" icon={<FaBalanceScale />} tone="green" />,
          <DashboardCard key="pending" title="Pending Approval" value={loading ? "—" : Number(summary.pendingApproval || 0)} subtitle="Applications awaiting decision" icon={<FaMoneyCheckAlt />} tone="gold" />,
        ]}
        analytics={
          <AnalyticsPanel title="Loan Portfolio" subtitle="Live application and recovery lifecycle." icon={<FaChartLine />}>
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
          <AnalyticsPanel title="Loan Intelligence" subtitle="Portfolio, repayment and Salary Advance separation controls." icon={<FaFileInvoiceDollar />}>
            <RecentActivityList items={activity} />
          </AnalyticsPanel>
        }
        quickActions={[
          <QuickActionCard key="new-loan" title="New Loan" subtitle="Create application for approval" icon={<FaPlusCircle />} onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })} />,
          <QuickActionCard key="advances" title="Salary Advances" subtitle="Open advance installment register" icon={<FaMoneyCheckAlt />} onClick={() => navigate("/payroll?workspace=salary-advances")} />,
          <QuickActionCard key="history" title="Recovery History" subtitle="Review posted payroll loan deductions" icon={<FaHistory />} onClick={() => document.getElementById("loan-recovery-history")?.scrollIntoView({ behavior: "smooth" })} />,
        ]}
      />

      <section ref={formRef} style={{ maxWidth: 1240, margin: "0 auto 24px", padding: "0 20px" }}>
        {error && <div style={{ padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid #b91c1c", color: "#b91c1c" }}>{error}</div>}
        {message && <div style={{ padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid var(--chris-dashboard-border)", color: "var(--chris-dashboard-text)" }}>{message}</div>}

        <AnalyticsPanel
          title={topUpParent ? `Top-Up Application · ${topUpParent.loanNumber}` : "New Loan Application"}
          subtitle="Creation does not begin payroll deduction. The loan must be approved and then marked disbursed before recovery starts."
          icon={<FaPlusCircle />}
        >
          <form onSubmit={submitLoan} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
            <EmployeeSearchSelect
              label="Employee"
              value={topUpParent?.employeeNumber || form.employeeNumber}
              onChange={setEmployee}
              disabled={Boolean(topUpParent)}
              required
              placeholder="Search employee number or name"
            />
            <label><small>Principal Amount</small><input style={inputStyle} type="number" min="0.01" step="0.01" value={form.principalAmount} onChange={setField("principalAmount")} required /></label>
            <label><small>Monthly Installment</small><input style={inputStyle} type="number" min="0.01" step="0.01" value={form.installmentAmount} onChange={setField("installmentAmount")} required /></label>
            <label><small>Application Date</small><input style={inputStyle} type="date" value={form.applicationDate} onChange={setField("applicationDate")} required /></label>
            <label><small>Purpose</small><input style={inputStyle} value={form.purpose} onChange={setField("purpose")} placeholder="Staff loan" /></label>
            <label><small>Notes</small><input style={inputStyle} value={form.notes} onChange={setField("notes")} /></label>
            <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
              <button style={primaryButton} disabled={busy === "create" || !(topUpParent?.employeeNumber || form.employeeNumber)}>{busy === "create" ? "Saving…" : topUpParent ? "Create Top-Up" : "Create Loan"}</button>
              {topUpParent && <button type="button" style={secondaryButton} onClick={resetForm}>Cancel Top-Up</button>}
            </div>
          </form>
        </AnalyticsPanel>
      </section>

      <section style={{ maxWidth: 1240, margin: "0 auto 24px", padding: "0 20px" }}>
        <AnalyticsPanel title="Loan Register" subtitle="Outstanding balance changes only when approved payroll recoveries are posted." icon={<FaHandHoldingUsd />}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
              <thead><tr>{["Loan", "Employee", "Principal", "Outstanding", "Installment", "Status", "Recovery Start", "Actions"].map((head) => <th key={head} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{head}</th>)}</tr></thead>
              <tbody>
                {!loading && !loans.length && <tr><td colSpan="8" style={{ padding: 16 }}>No loans have been recorded.</td></tr>}
                {loans.map((loan) => {
                  const draft = disbursementDrafts[loan.id] || { disbursedDate: today(), recoveryStartDate: today() };
                  return <tr key={loan.id}>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}><strong>{loan.loanNumber}</strong>{loan.parentLoanNumber ? <div><small>Top-up of {loan.parentLoanNumber}</small></div> : null}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}><strong>{loan.employeeNumber}</strong><div><small>{loan.employeeName}</small></div></td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{money(loan.principalAmount)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{money(loan.outstandingAmount)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{money(loan.installmentAmount)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}><strong>{loan.status}</strong></td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{loan.recoveryStartDate || "—"}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {loan.status === "PENDING_APPROVAL" && <><button style={secondaryButton} disabled={busy === loan.id} onClick={() => decide(loan, "APPROVE")}>Approve</button><button style={secondaryButton} disabled={busy === loan.id} onClick={() => decide(loan, "REJECT")}>Reject</button></>}
                        {loan.status === "APPROVED" && <>
                          <input aria-label="Disbursed Date" style={{ ...inputStyle, width: 145 }} type="date" value={draft.disbursedDate} onChange={(e) => setDisbursementDrafts((current) => ({ ...current, [loan.id]: { ...draft, disbursedDate: e.target.value } }))} />
                          <input aria-label="Recovery Start Date" style={{ ...inputStyle, width: 145 }} type="date" value={draft.recoveryStartDate} onChange={(e) => setDisbursementDrafts((current) => ({ ...current, [loan.id]: { ...draft, recoveryStartDate: e.target.value } }))} />
                          <button style={secondaryButton} disabled={busy === loan.id} onClick={() => disburse(loan)}>Disburse</button>
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
        <AnalyticsPanel title="Loan Recovery History" subtitle="Posted only when the governing payroll run is approved." icon={<FaHistory />}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr>{["Date", "Employee", "Loan", "Payroll Period", "Amount", "Status"].map((head) => <th key={head} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{head}</th>)}</tr></thead>
              <tbody>
                {!loading && !recoveries.length && <tr><td colSpan="6" style={{ padding: 16 }}>No approved payroll loan recoveries have posted yet.</td></tr>}
                {recoveries.map((row) => <tr key={row.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{row.recoveryDate}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" }}>{row.employeeNumber} · {row.employeeName}</td>
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