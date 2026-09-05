import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaDownload, FaFileInvoiceDollar, FaHistory, FaMoneyBillWave } from "react-icons/fa";

import { AnalyticsPanel, DashboardCard, ModuleDashboardShell } from "../components/dashboard";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../services/api";

const money = (value) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
}).format(Number(value || 0));

function LoanProfile({ loanId: loanIdProp = null, onBack = null }) {
  const params = useParams();
  const loanId = loanIdProp || params.loanId;
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const goBack = () => onBack ? onBack() : navigate("/loans");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const result = await apiRequest(`/api/loans/${loanId}/profile`);
        if (active) setProfile(result?.data || null);
      } catch (requestError) {
        if (active) setError(requestError?.message || "Unable to load loan profile.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loanId]);

  const exportLoan = async (format) => {
    try {
      setBusy(format);
      setError("");
      saveDownloadedBlob(await apiDownload(`/api/loans/${loanId}/export?format=${format}`));
    } catch (requestError) {
      setError(requestError?.message || "Unable to export loan report.");
    } finally {
      setBusy("");
    }
  };

  if (loading) return <div style={pageStyle}>Loading loan profile…</div>;
  if (error && !profile) return <div style={pageStyle}><button style={backButton} onClick={goBack}><FaArrowLeft /> Loans</button><div style={errorStyle}>{error}</div></div>;
  if (!profile?.loan) return null;

  const { loan, recoveries = [], amortizationSchedule = [] } = profile;
  const progress = loan.principalAmount > 0 ? Math.min(100, Math.round((loan.recoveredAmount / loan.principalAmount) * 100)) : 0;

  return (
    <>
      <ModuleDashboardShell
        eyebrow="EMPLOYEE LOAN PROFILE"
        title={`${loan.employeeName} · ${loan.loanNumber}`}
        description={`${loan.purpose || "Employee Loan"} · Zero-interest ZERMATT loan profile with approved-payroll recovery history and amortization plan.`}
        metrics={[
          <DashboardCard key="principal" title="Principal" value={money(loan.principalAmount)} subtitle="Approved loan principal" icon={<FaMoneyBillWave />} tone="green" />,
          <DashboardCard key="recovered" title="Recovered" value={money(loan.recoveredAmount)} subtitle={`${progress}% of principal recovered`} icon={<FaHistory />} tone="gold" />,
          <DashboardCard key="outstanding" title="Outstanding" value={money(loan.outstandingAmount)} subtitle="Remaining payroll recovery balance" icon={<FaFileInvoiceDollar />} tone="green" />,
          <DashboardCard key="installment" title="Monthly Installment" value={money(loan.installmentAmount)} subtitle={`${loan.termMonths || 0} planned installment(s)`} icon={<FaMoneyBillWave />} tone="gold" />,
        ]}
        analytics={
          <AnalyticsPanel title="Repayment Progress" subtitle="Posted recoveries originate only from approved payroll runs." icon={<FaHistory />}>
            <div style={{ display: "grid", gap: 12 }}>
              <div className="chris-progress"><div className="chris-progress__bar" style={{ width: `${progress}%` }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <strong>{progress}% recovered</strong>
                <span>{loan.nextPaymentDue ? `Next scheduled payment: ${loan.nextPaymentDue} · ${money(loan.nextPaymentAmount)}` : "No pending installment"}</span>
              </div>
            </div>
          </AnalyticsPanel>
        }
        recentActivity={
          <AnalyticsPanel title="Loan Control" subtitle="ZERMATT loan policies are zero-interest; posted recovery history is immutable." icon={<FaFileInvoiceDollar />}>
            <div style={detailGrid}>
              <Detail label="Status" value={loan.status} />
              <Detail label="Interest" value="0%" />
              <Detail label="Total Interest" value={money(0)} />
              <Detail label="Total Repayable" value={money(loan.totalRepayable)} />
            </div>
          </AnalyticsPanel>
        }
        quickActions={[]}
      />

      <main style={pageStyle}>
        <div style={toolbarStyle}>
          <button style={backButton} onClick={goBack}><FaArrowLeft /> Back to Loans</button>
          <div style={exportButtons}>
            {[["xlsx", "Excel"], ["csv", "CSV"], ["pdf", "PDF"]].map(([format, label]) => (
              <button key={format} style={exportButton} disabled={Boolean(busy)} onClick={() => exportLoan(format)}><FaDownload /> {busy === format ? "Preparing…" : label}</button>
            ))}
          </div>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <AnalyticsPanel title="Loan Details" subtitle="Employee, policy, approval, disbursement and recovery authority." icon={<FaFileInvoiceDollar />}>
          <div style={detailGrid}>
            <Detail label="Employee Number" value={loan.employeeNumber} />
            <Detail label="Employee Name" value={loan.employeeName} />
            <Detail label="Department" value={loan.departmentName || "—"} />
            <Detail label="Designation" value={loan.designationName || "—"} />
            <Detail label="Loan Policy / Purpose" value={loan.purpose || "—"} />
            <Detail label="Application Date" value={loan.applicationDate || "—"} />
            <Detail label="Approved Date" value={loan.approvedDate || "—"} />
            <Detail label="Disbursed Date" value={loan.disbursedDate || "—"} />
            <Detail label="Recovery Start" value={loan.recoveryStartDate || "—"} />
            <Detail label="Expected Final Installment" value={loan.expectedFinalInstallmentDate || "—"} />
            <Detail label="Parent / Top-Up Loan" value={loan.parentLoanNumber || "—"} />
            <Detail label="Notes" value={loan.notes || "—"} />
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel title="Loan Amortization Schedule" subtitle="Zero-interest monthly recovery plan. Final installment is automatically capped at the remaining principal." icon={<FaMoneyBillWave />}>
          <Table headers={["#", "Period", "Due Date", "Opening Balance", "Principal", "Interest", "Total Deduction", "Amount Paid", "Status"]}>
            {amortizationSchedule.map((row) => (
              <tr key={row.installmentNumber}>
                <Cell>{row.installmentNumber}</Cell>
                <Cell strong>{row.period}</Cell>
                <Cell>{row.dueDate}</Cell>
                <Cell>{money(row.outstandingBalance)}</Cell>
                <Cell>{money(row.principalAmount)}</Cell>
                <Cell>{money(row.interestAmount)}</Cell>
                <Cell>{money(row.totalDeduction)}</Cell>
                <Cell>{money(row.amountPaid)}</Cell>
                <Cell><Status value={row.status} /></Cell>
              </tr>
            ))}
            {!amortizationSchedule.length && <tr><td colSpan="9" style={emptyCell}>Amortization schedule becomes available after Recovery Start is set at disbursement.</td></tr>}
          </Table>
        </AnalyticsPanel>

        <AnalyticsPanel title="Repayment History" subtitle="Actual loan deductions posted by approved payroll runs." icon={<FaHistory />}>
          <Table headers={["Recovery Date", "Payroll Period", "Amount", "Status"]}>
            {recoveries.map((row) => (
              <tr key={row.id}>
                <Cell>{row.recoveryDate}</Cell>
                <Cell strong>{row.payrollPeriodCode || row.payrollPeriodName}</Cell>
                <Cell>{money(row.amount)}</Cell>
                <Cell><Status value={row.status} /></Cell>
              </tr>
            ))}
            {!recoveries.length && <tr><td colSpan="4" style={emptyCell}>No approved payroll loan recovery has posted yet.</td></tr>}
          </Table>
        </AnalyticsPanel>
      </main>
    </>
  );
}

function Detail({ label, value }) {
  return <div style={detailCard}><small style={detailLabel}>{label}</small><strong>{value}</strong></div>;
}
function Table({ headers, children }) {
  return <div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr>{headers.map((head) => <th key={head} style={thStyle}>{head}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
function Cell({ children, strong = false }) {
  return <td style={{ ...tdStyle, ...(strong ? { fontWeight: 900 } : {}) }}>{children}</td>;
}
function Status({ value }) {
  return <span style={statusStyle}>{value}</span>;
}

const pageStyle = { maxWidth: 1240, margin: "0 auto", padding: "0 20px 40px", color: "var(--chris-dashboard-text)" };
const toolbarStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "6px 0 18px" };
const backButton = { display: "inline-flex", alignItems: "center", gap: 8, border: 0, background: "transparent", color: "var(--chris-dashboard-gold-bright)", fontWeight: 900, cursor: "pointer", padding: "10px 0" };
const exportButtons = { display: "flex", gap: 8, flexWrap: "wrap" };
const exportButton = { display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 9, padding: "9px 13px", border: "1px solid var(--chris-dashboard-border)", background: "var(--chris-dashboard-surface)", color: "var(--chris-dashboard-text)", fontWeight: 800, cursor: "pointer" };
const detailGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 };
const detailCard = { display: "grid", gap: 5, border: "1px solid var(--chris-dashboard-border)", borderRadius: 10, padding: 12, background: "var(--chris-dashboard-surface)" };
const detailLabel = { color: "var(--chris-dashboard-muted)", fontWeight: 700 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle = { textAlign: "left", padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)", color: "var(--chris-dashboard-muted)", fontSize: 12 };
const tdStyle = { padding: 10, borderBottom: "1px solid var(--chris-dashboard-border)" };
const statusStyle = { display: "inline-block", padding: "4px 8px", borderRadius: 999, border: "1px solid var(--chris-dashboard-border)", fontSize: 11, fontWeight: 900 };
const emptyCell = { padding: 18, textAlign: "center", color: "var(--chris-dashboard-muted)" };
const errorStyle = { padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid #b91c1c", color: "#b91c1c" };

export default LoanProfile;
