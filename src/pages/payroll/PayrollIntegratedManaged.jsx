import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EmployeeBatchSelector from "../../components/EmployeeBatchSelector";
import ManualWorkedDaysPanel from "../../components/payroll/ManualWorkedDaysPanel";
import { apiRequest, apiDownload, saveDownloadedBlob, getStoredOrganization } from "../../services/api";

const money = (value, currency = "NGN") => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString()}`;
  }
};

const PAYROLL_READINESS_BLOCKER_LABELS = {
  EMPLOYMENT_TYPE_MISSING: "Employment Type is missing",
  COST_CENTRE_MISSING: "Cost Centre is missing",
  AUTHORITATIVE_COMPENSATION_RATE_NOT_CONFIGURED: "effective salary rate is missing",
  PAYMENT_PROFILE_INCOMPLETE: "payment profile is incomplete",
};

function payrollOperationErrorMessage(error, fallback) {
  if (
    error?.code === "PAYROLL_EXECUTION_READINESS_INCOMPLETE" &&
    Array.isArray(error?.details?.employees) &&
    error.details.employees.length
  ) {
    const employees = error.details.employees.slice(0, 5).map((employee) => {
      const reasons = (employee.blockers || [])
        .filter((blocker) => blocker !== "PAYMENT_PROFILE_INCOMPLETE")
        .map((blocker) => PAYROLL_READINESS_BLOCKER_LABELS[blocker] || blocker)
        .join(", ");
      return `${employee.employeeNumber || "Employee"}: ${reasons || "payroll setup is incomplete"}`;
    });
    const remaining = Math.max(0, error.details.employees.length - employees.length);
    return `${error.message || fallback} ${employees.join(" · ")}${remaining ? ` · +${remaining} more` : ""}`;
  }
  return error?.message || fallback;
}

function useLoad(path, initial = []) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await apiRequest(path);
      setData(response?.data ?? initial);
    } catch (err) {
      setError(err.message || "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, setError, load };
}

export default function PayrollIntegratedManaged({ mode }) {
  const navigate = useNavigate();
  const meta = {
    execute: ["Execute Payroll", "Calculate payroll with statutory deductions, Salary Advance recovery, Loan recovery and eligible after-tax benefits in one auditable payroll line."],
    payslips: ["Payslips", "Approved payroll payslips can be viewed, printed and emailed individually or in bulk. Draft payroll lines expose live preview payslips from Execute Payroll but cannot be emailed."],
    statutory: ["Nigeria Statutory Review", "Review which payroll statutory items are active, employer-only, or require ZERMATT approval before activation."],
  };
  const [title, description] = meta[mode] || meta.execute;
  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>INTEGRATED PAYROLL CONTROL</div>
      <h1 style={titleStyle}>{title}</h1>
      <p style={leadStyle}>{description}</p>
      {mode === "execute" && <ExecuteIntegrated />}
      {mode === "payslips" && <ApprovedPayslips />}
      {mode === "statutory" && <StatutoryCatalogue />}
    </section>
  );
}

function ExecuteIntegrated() {
  const { data: periods, error: periodsError } = useLoad("/api/payroll/periods");
  const { data: runs, loading, error, setError, load } = useLoad("/api/payroll/runs");
  const { data: policyData, loading: policyLoading } = useLoad("/api/payroll/compliance-policy", {});
  const { data: profile } = useLoad("/api/auth/me", {});
  const [periodId, setPeriodId] = useState("");
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [branchView, setBranchView] = useState("");
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const payslipPreviewRef = useRef(null);
  const organization = profile?.organization || getStoredOrganization() || {};
  const selectablePeriods = (periods || []).filter((period) => period.status !== "CLOSED");

  const fetchIntegratedLines = async (runId) => {
    const response = await apiRequest(`/api/payroll/runs/${runId}/integrated-lines`);
    const nextLines = response?.data || [];
    setLines(nextLines);
    setBranchView((current) => current && nextLines.some((row) => row.locationId === current) ? current : "");
  };

  const branchOptions = [...new Map(
    (lines || []).filter((row) => row.locationId).map((row) => [
      row.locationId,
      { id: row.locationId, code: row.locationCode, name: row.locationName || row.locationCode || "Branch" },
    ])
  ).values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const visibleLines = branchView ? lines.filter((row) => row.locationId === branchView) : lines;
  const branchLabel = branchView
    ? branchOptions.find((branch) => branch.id === branchView)?.name || "Selected Branch"
    : "HEAD OFFICE · ALL BRANCHES";
  const attendanceChangesPending = visibleLines.filter((row) => row.details?.attendanceRecalculationRequired).length;

  const calculate = async () => {
    try {
      setBusy("calculate"); setError(""); setMessage("");
      const response = await apiRequest("/api/payroll/runs/draft", { method: "POST", body: { periodId } });
      const runId = response?.data?.run?.id;
      if (runId) await fetchIntegratedLines(runId);
      setMessage("Payroll recalculated. Review all employee lines before submission.");
      await load();
    } catch (err) {
      setError(payrollOperationErrorMessage(err, "Unable to calculate payroll."));
    } finally {
      setBusy("");
    }
  };

  const viewLines = async (runId) => {
    try {
      setBusy(runId); setError("");
      await fetchIntegratedLines(runId);
    } catch (err) {
      setError(err.message || "Unable to load payroll lines.");
    } finally {
      setBusy("");
    }
  };

  const submit = async (runId) => {
    try {
      setBusy(`submit-${runId}`); setError(""); setMessage("");
      await apiRequest(`/api/payroll/runs/${runId}/submit`, {
        method: "POST",
        body: { notes: "Submitted after integrated payroll review including statutory, Salary Advance, Loan recoveries and after-tax benefits." },
      });
      setMessage("Payroll submitted for approval. Loan and Salary Advance balances remain unchanged until approval.");
      await load();
    } catch (err) {
      setError(err.message || "Unable to submit payroll.");
    } finally {
      setBusy("");
    }
  };

  const exportDraftReview = async (run) => {
    try {
      setBusy(`draft-export-${run.id}`); setError(""); setMessage("");
      const download = await apiDownload(`/api/payroll/runs/${run.id}/draft-review.xlsx`);
      saveDownloadedBlob(download);
      setMessage("Draft payroll review pack exported. It is marked PRE-APPROVAL / NOT FOR PAYOUT for external HR investigation and verification.");
    } catch (err) {
      setError(err.message || "Unable to export draft payroll review pack.");
    } finally {
      setBusy("");
    }
  };

  const exportApprovedPayout = async (run) => {
    try {
      setBusy(`approved-export-${run.id}`); setError(""); setMessage("");
      const download = await apiDownload(`/api/payroll/runs/${run.id}/approved-payout.xlsx`);
      saveDownloadedBlob(download);
      setMessage("Approved payroll export generated for the external auditor / management approval and Accounts & Finance payout workflow.");
    } catch (err) {
      setError(err.message || "Unable to export approved payroll payout pack.");
    } finally {
      setBusy("");
    }
  };

  const reopen = async (run) => {
    const reason = window.prompt(`Reason for reopening approved payroll ${run.periodCode}:`);
    if (!reason?.trim()) return;
    try {
      setBusy(`reopen-${run.id}`); setError(""); setMessage("");
      const response = await apiRequest(`/api/payroll/runs/${run.id}/reopen`, { method: "POST", body: { reason: reason.trim() } });
      setPeriodId(run.periodId || "");
      await fetchIntegratedLines(run.id);
      setMessage(response?.message || "Approved payroll reopened to Draft. Recalculate before resubmission.");
      await load();
    } catch (err) {
      setError(err.message || "Unable to reopen approved payroll.");
    } finally {
      setBusy("");
    }
  };

  const emailLivePayslip = async (row) => {
    if (row?.runStatus !== "APPROVED") {
      setError("Draft payslips are preview-only. Email becomes available after Head HR approves the payroll.");
      return;
    }
    try {
      setBusy(`email-${row.id}`); setError(""); setMessage("");
      const response = await apiRequest(`/api/payroll/payslips/${row.id}/email`, { method: "POST" });
      setMessage(response?.message || `Payslip email action completed for ${row.employeeNumber}.`);
    } catch (err) {
      setError(err.message || "Unable to email approved payslip.");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(""), 12000);
    return () => window.clearTimeout(timer);
  }, [error, setError]);

  useEffect(() => {
    if (!selectedPayslip) return;
    const frame = window.requestAnimationFrame(() => {
      payslipPreviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      payslipPreviewRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedPayslip]);

  return (
    <>
      <Panel title="Integrated Draft Payroll">
        <div style={buttonRow}>
          <Select label="Payroll Period" value={periodId} onChange={setPeriodId} options={[["", "Select payroll period"], ...selectablePeriods.map((p) => [p.id, `${p.code} — ${p.name}`])]} />
          <button type="button" style={primaryButton} disabled={!periodId || busy || policyLoading || policyData?.configured === false} onClick={calculate}>{busy === "calculate" ? "Calculating…" : "Calculate Payroll"}</button>
        </div>
        <p style={controlNote}>For ZERMATT, Branch HR & Admin Officers review attendance and may enter or edit worked days only for employees within their assigned branch; the same authoritative attendance input immediately feeds Head Office payroll and marks any existing draft for recalculation. The Head of HR prepares, calculates/processes, submits and approves payroll in CHRiS. Each employee payroll line has a live payslip preview before approval; email delivery is enabled only after approval. Before approval, export the Draft Review Pack for external HR investigation/verification; it is clearly marked NOT FOR PAYOUT. After CHRiS approval, export the Approved Payout Pack for external auditor/management approval evidence and Accounts & Finance payout processing outside CHRiS. Loan installments become eligible from the configured recovery month. Salary Advance defaults to ₦0 in each new payroll period and appears only when an active repayment schedule is due for that period. Loan and scheduled Salary Advance balances reduce only on payroll approval. ZERMATT Leave Allowance, when due, is added after PAYE as a non-taxable after-tax benefit.</p>
        <ManualWorkedDaysPanel periods={selectablePeriods} onSaved={async () => { setMessage("Worked days saved. Recalculate the affected payroll before submission."); await load(); }} />
      </Panel>

      <Feedback error={periodsError || error || (!policyLoading && policyData?.configured === false ? "Nigeria payroll policy is not configured." : "")} />
      {message && <div style={infoStyle}>{message}</div>}

      <Panel title="Payroll Runs">
        <DataTable loading={loading} columns={["Period", "Status", "Statutory", "Employees", "Gross", "Deductions", "Net", "Action"]}>
          {(runs || []).map((run) => (
            <tr key={run.id}>
              <Td strong>{run.periodCode}</Td><Td><Badge>{run.status}</Badge></Td><Td><Badge>{run.statutoryStatus}</Badge></Td><Td>{run.employeeCount}</Td>
              <Td>{money(run.grossTotal)}</Td><Td>{money(run.deductionTotal)}</Td><Td>{money(run.netPreviewTotal)}</Td>
              <Td><div style={buttonRow}>
                <button type="button" style={smallButton} disabled={busy === run.id} onClick={() => viewLines(run.id)}>View</button>
                {["DRAFT", "REJECTED", "SUBMITTED"].includes(run.status) && <button type="button" style={smallButton} disabled={busy === `draft-export-${run.id}`} onClick={() => exportDraftReview(run)}>{busy === `draft-export-${run.id}` ? "Exporting…" : "Export Draft Review"}</button>}
                {(run.status === "DRAFT" || run.status === "REJECTED") && <button type="button" style={smallButton} disabled={busy === `submit-${run.id}`} onClick={() => submit(run.id)}>Submit</button>}
                {run.status === "APPROVED" && <button type="button" style={smallButton} disabled={busy === `approved-export-${run.id}`} onClick={() => exportApprovedPayout(run)}>{busy === `approved-export-${run.id}` ? "Exporting…" : "Export Approved Payout"}</button>}
                {run.status === "APPROVED" && <button type="button" style={smallButton} disabled={busy === `reopen-${run.id}`} onClick={() => reopen(run)}>{busy === `reopen-${run.id}` ? "Reopening…" : "Reopen for Correction"}</button>}
              </div></Td>
            </tr>
          ))}
        </DataTable>
      </Panel>

      {lines.length > 0 && <Panel title="Employee Payroll Calculation">
        <div style={branchViewBar}>
          <strong style={{ color: "#D4AF37" }}>Payroll KPI View</strong>
          <button type="button" style={!branchView ? activeBranchButton : branchButton} onClick={() => setBranchView("")}>HEAD OFFICE · ALL</button>
          {branchOptions.map((branch) => <button key={branch.id} type="button" style={branchView === branch.id ? activeBranchButton : branchButton} onClick={() => setBranchView(branch.id)}>{branch.code || branch.name}</button>)}
          <span style={branchViewText}>{branchLabel}</span>
        </div>
        <PayrollConnectedDashboard
          allLines={lines}
          visibleLines={visibleLines}
          branchView={branchView}
          setBranchView={setBranchView}
          branchOptions={branchOptions}
          branchLabel={branchLabel}
        />
        {attendanceChangesPending > 0 && <div style={warningStyle}>{attendanceChangesPending} employee attendance input(s) have changed since the last payroll calculation. The latest Worked Days are shown now; Head HR must recalculate before submission/approval so monetary values use those days.</div>}
        <PayrollLines rows={visibleLines} onViewPayslip={setSelectedPayslip} />
      </Panel>}
      {selectedPayslip && <div ref={payslipPreviewRef} tabIndex={-1} style={payslipScrollAnchorStyle}>
        <PayslipCard
          row={selectedPayslip}
          organization={organization}
          onClose={() => setSelectedPayslip(null)}
          onEmail={() => emailLivePayslip(selectedPayslip)}
          emailBusy={busy === `email-${selectedPayslip.id}`}
        />
      </div>}
    </>
  );
}


function PayrollConnectedDashboard({
  allLines = [],
  visibleLines = [],
  branchView,
  setBranchView,
  branchOptions = [],
  branchLabel,
}) {
  const dashboard = useMemo(() => {
    const sum = (rows, selector) => rows.reduce((total, row) => total + Number(selector(row) || 0), 0);
    const statutoryValue = (row, key) => Number(row.details?.statutory?.[key] || 0);
    const leaveValue = (row) => Number(row.details?.leaveAllowance?.amount || 0);

    const totalsFor = (rows) => {
      const employeePension = sum(rows, (row) => statutoryValue(row, "employeePension"));
      const employerPension = sum(rows, (row) => statutoryValue(row, "employerPension"));
      const nsitf = sum(rows, (row) => statutoryValue(row, "nsitfEmployer"));
      const itf = sum(rows, (row) => statutoryValue(row, "itfEmployerAccrual"));
      const gross = sum(rows, (row) => row.grossPay);
      const net = sum(rows, (row) => row.netPreview);
      return {
        employees: rows.length,
        gross,
        net,
        paye: sum(rows, (row) => statutoryValue(row, "payeTax")),
        employeePension,
        employerPension,
        totalPension: employeePension + employerPension,
        nhf: sum(rows, (row) => statutoryValue(row, "nhfEmployee")),
        nsitf,
        itf,
        payrollDeductions: sum(rows, (row) => row.deductions),
        salaryAdvance: sum(rows, (row) => row.advanceRecovery),
        loanRecovery: sum(rows, (row) => row.loanRecovery),
        leaveAllowance: sum(rows, leaveValue),
        expectedDays: sum(rows, (row) => row.details?.attendance?.standardDays),
        workedDays: sum(rows, (row) => row.details?.attendance?.payableDays),
        employerStatutory: employerPension + nsitf + itf,
        employerCost: gross + employerPension + nsitf + itf,
      };
    };

    const totals = totalsFor(visibleLines);

    const branchData = branchOptions.map((branch) => {
      const branchRows = allLines.filter((row) => row.locationId === branch.id);
      const values = totalsFor(branchRows);
      return {
        id: branch.id,
        branch: branch.code || branch.name,
        branchName: branch.name,
        employees: values.employees,
        gross: values.gross,
        net: values.net,
        paye: values.paye,
        loanRecovery: values.loanRecovery,
      };
    });

    const statutoryData = [
      { name: "PAYE", value: totals.paye },
      { name: "Employee Pension", value: totals.employeePension },
      { name: "Employer Pension", value: totals.employerPension },
      { name: "NHF", value: totals.nhf },
      { name: "NSITF", value: totals.nsitf },
      { name: "ITF", value: totals.itf },
    ].filter((item) => item.value > 0);

    const deductionData = [
      { name: "Payroll deductions", value: totals.payrollDeductions },
      { name: "Salary advance", value: totals.salaryAdvance },
      { name: "Loan recovery", value: totals.loanRecovery },
      { name: "PAYE", value: totals.paye },
      { name: "Employee pension", value: totals.employeePension },
    ].filter((item) => item.value > 0);

    return { totals, branchData, statutoryData, deductionData };
  }, [allLines, visibleLines, branchOptions]);

  const tooltipFormatter = (value) => [money(value), "Amount"];
  const netRate = dashboard.totals.gross > 0 ? (dashboard.totals.net / dashboard.totals.gross) * 100 : 0;

  return (
    <section style={connectedDashboardStyle} aria-label="Connected payroll dashboard">
      <div style={connectedDashboardHeaderStyle}>
        <div>
          <div style={connectedDashboardEyebrowStyle}>CONNECTED PAYROLL DASHBOARD</div>
          <h3 style={connectedDashboardTitleStyle}>{branchLabel}</h3>
          <div style={connectedDashboardSubtextStyle}>Live view of the payroll run currently loaded below. Branch selections update every KPI and chart instantly.</div>
        </div>
        <div style={dashboardStatusPillStyle}>{visibleLines.length} employee{visibleLines.length === 1 ? "" : "s"}</div>
      </div>

      <div style={payrollKpiGrid}>
        <DashboardKpi label="Gross Payroll" value={money(dashboard.totals.gross)} />
        <DashboardKpi label="Net Payroll" value={money(dashboard.totals.net)} hint={`${netRate.toFixed(1)}% of gross`} />
        <DashboardKpi label="PAYE" value={money(dashboard.totals.paye)} />
        <DashboardKpi label="Employee Pension" value={money(dashboard.totals.employeePension)} />
        <DashboardKpi label="Employer Pension" value={money(dashboard.totals.employerPension)} />
        <DashboardKpi label="Loan Recovery" value={money(dashboard.totals.loanRecovery)} />
        <DashboardKpi label="Salary Advance" value={money(dashboard.totals.salaryAdvance)} />
        <DashboardKpi label="Employer Cost" value={money(dashboard.totals.employerCost)} hint="Gross + employer statutory" />
      </div>

      <div style={dashboardChartGridStyle}>
        <DashboardChart title="Branch Gross vs Net" subtitle="Click a branch below the chart to filter the entire payroll view.">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dashboard.branchData} margin={{ top: 10, right: 10, left: 0, bottom: 6 }}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
              <XAxis dataKey="branch" tick={{ fill: "#C7D3CC", fontSize: 11 }} axisLine={{ stroke: "rgba(212,175,55,.25)" }} tickLine={false} />
              <YAxis tick={{ fill: "#AFC0B6", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => new Intl.NumberFormat("en-NG", { notation: "compact" }).format(value)} />
              <Tooltip formatter={tooltipFormatter} contentStyle={dashboardTooltipStyle} />
              <Legend wrapperStyle={{ color: "#C7D3CC", fontSize: 11 }} />
              <Bar dataKey="gross" name="Gross Payroll" fill="#D4AF37" radius={[5, 5, 0, 0]} />
              <Bar dataKey="net" name="Net Payroll" fill="#2EE98B" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={dashboardBranchSelectorStyle}>
            <button type="button" style={!branchView ? activeDashboardBranchChipStyle : dashboardBranchChipStyle} onClick={() => setBranchView("")}>ALL</button>
            {dashboard.branchData.map((branch) => (
              <button
                key={branch.id}
                type="button"
                style={branchView === branch.id ? activeDashboardBranchChipStyle : dashboardBranchChipStyle}
                onClick={() => setBranchView(branch.id)}
                title={branch.branchName}
              >
                {branch.branch}
              </button>
            ))}
          </div>
        </DashboardChart>

        <DashboardChart title="Statutory Composition" subtitle="PAYE and employee/employer statutory obligations for the active dashboard scope.">
          {dashboard.statutoryData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={dashboard.statutoryData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={96}
                  paddingAngle={2}
                >
                  {dashboard.statutoryData.map((item, index) => (
                    <Cell key={item.name} fill={dashboardPieColors[index % dashboardPieColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={tooltipFormatter} contentStyle={dashboardTooltipStyle} />
                <Legend wrapperStyle={{ color: "#C7D3CC", fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <DashboardEmpty>No statutory values in the selected scope.</DashboardEmpty>}
        </DashboardChart>

        <DashboardChart title="Deduction & Recovery Mix" subtitle="Connected view of PAYE, pension, payroll deductions, Salary Advance and Loan Recovery.">
          {dashboard.deductionData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dashboard.deductionData} layout="vertical" margin={{ top: 8, right: 16, left: 18, bottom: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,.08)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#AFC0B6", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => new Intl.NumberFormat("en-NG", { notation: "compact" }).format(value)} />
                <YAxis type="category" dataKey="name" width={118} tick={{ fill: "#C7D3CC", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={tooltipFormatter} contentStyle={dashboardTooltipStyle} />
                <Bar dataKey="value" name="Amount" fill="#D4AF37" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <DashboardEmpty>No deductions or recoveries in the selected scope.</DashboardEmpty>}
        </DashboardChart>

        <DashboardChart title="Attendance & Cost Control" subtitle="Payroll attendance inputs and employer-cost indicators for the active scope.">
          <div style={dashboardMiniGridStyle}>
            <DashboardMetric label="Expected Days" value={dashboard.totals.expectedDays.toLocaleString()} />
            <DashboardMetric label="Worked Days" value={dashboard.totals.workedDays.toLocaleString()} />
            <DashboardMetric label="Total Pension" value={money(dashboard.totals.totalPension)} />
            <DashboardMetric label="Payroll Deductions" value={money(dashboard.totals.payrollDeductions)} />
            <DashboardMetric label="Leave Allowance" value={money(dashboard.totals.leaveAllowance)} />
            <DashboardMetric label="Employer Statutory" value={money(dashboard.totals.employerStatutory)} />
          </div>
        </DashboardChart>
      </div>
    </section>
  );
}

function DashboardKpi({ label, value, hint }) {
  return (
    <div style={dashboardKpiCardStyle}>
      <div style={dashboardKpiLabelStyle}>{label}</div>
      <div style={dashboardKpiValueStyle}>{value}</div>
      {hint && <div style={dashboardKpiHintStyle}>{hint}</div>}
    </div>
  );
}

function DashboardChart({ title, subtitle, children }) {
  return (
    <article style={dashboardChartCardStyle}>
      <div style={dashboardChartTitleStyle}>{title}</div>
      <div style={dashboardChartSubtitleStyle}>{subtitle}</div>
      <div style={dashboardChartBodyStyle}>{children}</div>
    </article>
  );
}

function DashboardMetric({ label, value }) {
  return (
    <div style={dashboardMetricStyle}>
      <span style={dashboardMetricLabelStyle}>{label}</span>
      <strong style={dashboardMetricValueStyle}>{value}</strong>
    </div>
  );
}

function DashboardEmpty({ children }) {
  return <div style={dashboardEmptyStyle}>{children}</div>;
}

function PayrollLines({ rows, onViewPayslip }) {
  const getSearchText = useCallback((row) => [row.employeeNumber, row.employeeName, row.details?.employmentType, row.details?.costCentre].filter(Boolean).join(" "), []);
  return (
    <EmployeeBatchSelector
      rows={rows || []}
      getId={(row) => row.id}
      getSearchText={getSearchText}
      searchPlaceholder="Search employee number, name, employment type or cost centre"
      selectionLabel="payroll employee(s)"
      pageSize={50}
      renderActions={({ selectedRows }) => selectedRows.length ? (
        <div style={batchSummaryStyle}><strong>Selected batch:</strong> {selectedRows.length} employee(s) · Gross {money(selectedRows.reduce((sum, row) => sum + Number(row.grossPay || 0), 0))} · Net {money(selectedRows.reduce((sum, row) => sum + Number(row.netPreview || 0), 0))}</div>
      ) : null}
    >
      {({ displayRows, isSelected, toggleOne, toggleFiltered, allFilteredSelected, someFilteredSelected }) => (
        <DataTable columns={["Select", "Employee", "Branch", "Expected Days", "Worked Days", "Attendance", "Basic", "Other Earnings", "PAYE", "Pension", "Other Ded.", "Salary Advance", "Loan", "Leave Allowance", "Gross", "Net", "Payslip"]}>
          <tr style={{ display: "none" }}><td>{String(allFilteredSelected)}{String(someFilteredSelected)}<button type="button" onClick={toggleFiltered}>toggle</button></td></tr>
          {displayRows.map((row) => {
            const details = row.details || {};
            const statutory = details.statutory || {};
            const structure = details.salaryStructure || {};
            const leaveAllowance = Number(details.leaveAllowance?.amount || 0);
            const customAllowances = (details.customAllowances || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
            const customDeductions = (details.customDeductions || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
            return (
              <tr key={row.id}>
                <Td><input type="checkbox" aria-label={`Select ${row.employeeNumber} ${row.employeeName}`} checked={isSelected(row)} onChange={() => toggleOne(row)} /></Td>
                <Td strong>{row.employeeNumber} — {row.employeeName}</Td>
                <Td>{row.locationCode || row.locationName || "—"}</Td>
                <Td>{details.attendance?.standardDays ?? "—"}</Td>
                <Td>{details.attendance?.payableDays ?? "—"}{details.attendanceRecalculationRequired ? " *" : ""}</Td>
                <Td>{details.attendance?.source ? String(details.attendance.source).replaceAll("_", " ") : "—"}</Td>
                <Td>{money(structure.basic ?? row.baseSalary, row.currency)}</Td>
                <Td>{money(customAllowances, row.currency)}</Td>
                <Td>{money(statutory.payeTax, row.currency)}</Td>
                <Td>{money(statutory.employeePension, row.currency)}</Td>
                <Td>{money(customDeductions, row.currency)}</Td>
                <Td>{money(row.advanceRecovery, row.currency)}</Td>
                <Td>{money(row.loanRecovery, row.currency)}</Td>
                <Td>{leaveAllowance ? `${money(leaveAllowance, row.currency)} · After tax` : "—"}</Td>
                <Td>{money(row.grossPay, row.currency)}</Td>
                <Td strong>{money(row.netPreview, row.currency)}</Td>
                <Td><button type="button" style={smallButton} onClick={() => onViewPayslip?.(row)}>{row.runStatus === "APPROVED" ? "View Payslip" : "View Preview"}</button></Td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </EmployeeBatchSelector>
  );
}

function ApprovedPayslips() {
  const { data: rows, loading, error } = useLoad("/api/payroll/payslips");
  const { data: profile } = useLoad("/api/auth/me", {});
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [emailError, setEmailError] = useState("");
  const [bulkRunId, setBulkRunId] = useState("");
  const approvedPayslipRef = useRef(null);
  const organization = profile?.organization || getStoredOrganization() || {};
  const getSearchText = useCallback((row) => [row.employeeNumber, row.employeeName, row.employeeEmail, row.periodCode, row.periodName].filter(Boolean).join(" "), []);
  const approvedRuns = useMemo(() => {
    const seen = new Map();
    for (const row of rows || []) {
      if (!row.runId || seen.has(row.runId)) continue;
      seen.set(row.runId, {
        id: row.runId,
        code: row.periodCode || row.runId,
        name: row.periodName || row.periodCode || row.runId,
      });
    }
    return [...seen.values()];
  }, [rows]);

  const emailOne = async (row) => {
    try {
      setBusy(`email-${row.id}`); setEmailError(""); setFeedback("");
      const response = await apiRequest(`/api/payroll/payslips/${row.id}/email`, { method: "POST" });
      setFeedback(response?.message || `Payslip email action completed for ${row.employeeNumber}.`);
    } catch (err) {
      setEmailError(err.message || "Unable to email approved payslip.");
    } finally {
      setBusy("");
    }
  };

  const emailSelected = async (selectedRows) => {
    if (!selectedRows.length) return;
    try {
      setBusy("email-batch"); setEmailError(""); setFeedback("");
      const response = await apiRequest("/api/payroll/payslips/email-batch", {
        method: "POST",
        body: { lineIds: selectedRows.map((row) => row.id) },
      });
      const data = response?.data || {};
      setFeedback(`${data.sent || 0} selected payslip(s) emailed. ${data.notSent || 0} not sent.`);
    } catch (err) {
      setEmailError(err.message || "Unable to email selected payslips.");
    } finally {
      setBusy("");
    }
  };


  useEffect(() => {
    if (!bulkRunId && approvedRuns.length) setBulkRunId(approvedRuns[0].id);
  }, [approvedRuns, bulkRunId]);

  const emailAllForRun = async () => {
    if (!bulkRunId) {
      setEmailError("Select an approved payroll period first.");
      return;
    }
    const selectedRun = approvedRuns.find((run) => run.id === bulkRunId);
    const confirmed = window.confirm(
      `Email all approved payslips for ${selectedRun?.name || selectedRun?.code || "the selected payroll"} to the employee email addresses stored in CHRiS?`
    );
    if (!confirmed) return;

    try {
      setBusy("email-run"); setEmailError(""); setFeedback("");
      const response = await apiRequest("/api/payroll/payslips/email-run", {
        method: "POST",
        body: { runId: bulkRunId },
      });
      const data = response?.data || {};
      setFeedback(
        `${data.sent || 0} payslip(s) emailed. ${data.missingEmail || 0} employee(s) have no email address. ${Math.max(0, (data.notSent || 0) - (data.missingEmail || 0))} other delivery item(s) were not sent.`
      );
    } catch (err) {
      setEmailError(err.message || "Unable to email all payslips for the selected approved payroll.");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (!selected) return;
    const frame = window.requestAnimationFrame(() => {
      approvedPayslipRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      approvedPayslipRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  return (
    <>
      <Panel title="Approved Payroll Payslips">
        <p style={controlNote}>Only APPROVED payroll runs appear here. Approved payslips can be viewed, printed and emailed individually, by selection, or for the entire approved payroll run to the employee email stored in CHRiS. A missing employee email affects only that employee's delivery and never blocks payroll approval.</p>
        <div style={bulkPayslipEmailBarStyle}>
          <Select
            label="Approved Payroll Period"
            value={bulkRunId}
            onChange={setBulkRunId}
            options={[
              ["", "Select approved payroll"],
              ...approvedRuns.map((run) => [run.id, `${run.code} · ${run.name}`]),
            ]}
          />
          <button
            type="button"
            style={primaryButton}
            disabled={!bulkRunId || busy === "email-run"}
            onClick={emailAllForRun}
          >
            {busy === "email-run" ? "Emailing All Payslips…" : "Email All Payslips to Employees"}
          </button>
        </div>
        <EmployeeBatchSelector
          rows={rows || []}
          getId={(row) => row.id}
          getSearchText={getSearchText}
          searchPlaceholder="Search employee number, employee name, email or payroll period"
          selectionLabel="payslip(s)"
          pageSize={50}
          renderActions={({ selectedRows, setSelectedOnly }) => selectedRows.length ? <div style={buttonRow}>
            <button type="button" style={smallButton} onClick={() => setSelectedOnly(true)}>Batch View Selected</button>
            <button type="button" style={smallButton} disabled={busy === "email-batch"} onClick={() => emailSelected(selectedRows)}>{busy === "email-batch" ? "Emailing…" : "Email Selected Payslips"}</button>
          </div> : null}
        >
          {({ displayRows, isSelected, toggleOne }) => (
            <DataTable loading={loading} columns={["Select", "Period", "Employee", "Email", "Gross", "PAYE", "Pension", "Advance", "Loan", "Leave Allowance", "Net", "Action"]}>
              {displayRows.map((row) => {
                const statutory = row.details?.statutory || {};
                const leaveAllowance = Number(row.details?.leaveAllowance?.amount || 0);
                return <tr key={row.id}>
                  <Td><input type="checkbox" aria-label={`Select payslip ${row.employeeNumber} ${row.periodCode}`} checked={isSelected(row)} onChange={() => toggleOne(row)} /></Td>
                  <Td strong>{row.periodCode}</Td>
                  <Td>{row.employeeNumber} — {row.employeeName}</Td>
                  <Td>{row.employeeEmail || <span style={mutedText}>No email</span>}</Td>
                  <Td>{money(row.grossPay, row.currency)}</Td>
                  <Td>{money(statutory.payeTax, row.currency)}</Td>
                  <Td>{money(statutory.employeePension, row.currency)}</Td>
                  <Td>{money(row.advanceRecovery, row.currency)}</Td>
                  <Td>{money(row.loanRecovery, row.currency)}</Td>
                  <Td>{leaveAllowance ? money(leaveAllowance, row.currency) : "—"}</Td>
                  <Td strong>{money(row.netPreview, row.currency)}</Td>
                  <Td><div style={buttonRow}>
                    <button type="button" style={smallButton} onClick={() => setSelected(row)}>View Payslip</button>
                    <button type="button" style={smallButton} disabled={!row.employeeEmail || busy === `email-${row.id}`} onClick={() => emailOne(row)}>{busy === `email-${row.id}` ? "Emailing…" : "Email"}</button>
                  </div></Td>
                </tr>;
              })}
            </DataTable>
          )}
        </EmployeeBatchSelector>
      </Panel>
      <Feedback error={error || emailError} />
      {feedback && <div style={infoStyle}>{feedback}</div>}
      {selected && <div ref={approvedPayslipRef} tabIndex={-1} style={payslipScrollAnchorStyle}>
        <PayslipCard
          row={selected}
          organization={organization}
          onClose={() => setSelected(null)}
          onEmail={() => emailOne(selected)}
          emailBusy={busy === `email-${selected.id}`}
        />
      </div>}
    </>
  );
}

function PayslipCard({ row, organization, onClose, onEmail, emailBusy = false }) {
  const details = row.details || {};
  const statutory = details.statutory || {};
  const structure = details.salaryStructure || {};
  const attendance = details.attendance || {};
  const leaveAllowance = Number(details.leaveAllowance?.amount || 0);
  const customAllowances = (details.customAllowances || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const customDeductions = (details.customDeductions || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const organizationName = payslipOrganizationName(organization);
  const logoUrl = payslipLogoUrl(organization);
  return (
    <Panel title={`Payslip · ${row.periodCode} · ${row.employeeNumber}`}>
      <div style={payslipPreviewDocumentStyle}>
        {logoUrl
          ? <img src={logoUrl} alt="" aria-hidden="true" style={payslipPreviewWatermarkImageStyle} />
          : <div aria-hidden="true" style={payslipPreviewWatermarkTextStyle}>{organizationName}</div>}
        <div style={payslipPreviewContentStyle}>
          <div style={payslipPreviewHeaderStyle}>
            {logoUrl && <img src={logoUrl} alt={`${organizationName} logo`} style={payslipPreviewLogoStyle} />}
            <div style={payslipPreviewOrganizationNameStyle}>{organizationName}</div>
            <div style={payslipPreviewTitleStyle}>EMPLOYEE PAYSLIP</div>
          </div>
      <div style={payslipIdentityGridStyle}>
        <PayslipDetail label="Employee Name" value={row.employeeName || "—"} />
        <PayslipDetail label="Employee Number" value={row.employeeNumber || "—"} />
        <PayslipDetail label="Designation" value={row.designation || "—"} />
        <PayslipDetail label="Payroll Period" value={`${row.periodStart} → ${row.periodEnd}`} />
        <PayslipDetail label="Pay Date" value={row.payDate || "—"} />
        <PayslipDetail label="Worked Days" value={attendance.payableDays != null ? `${attendance.payableDays} / ${attendance.standardDays}` : "—"} />
        <PayslipDetail label="Attendance Source" value={attendance.source ? String(attendance.source).replaceAll("_", " ") : "—"} />
        <PayslipDetail label="Status" value={row.runStatus === "APPROVED" ? "Approved Payroll" : `${String(row.runStatus || "DRAFT").replaceAll("_", " ")} · Preview Only`} />
      </div>

      <div style={payslipLedgerWrapStyle}>
        <table style={payslipLedgerTableStyle}>
          <thead>
            <tr>
              <th style={payslipLedgerHeadStyle}>Earnings / Deductions</th>
              <th style={{ ...payslipLedgerHeadStyle, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <PayslipLedgerRow label="Basic" value={money(structure.basic ?? row.baseSalary, row.currency)} />
            {Object.entries(structure).filter(([key]) => key !== "basic").map(([key, value]) => (
              <PayslipLedgerRow key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} value={money(value, row.currency)} />
            ))}
            <PayslipLedgerRow label="Other Earnings" value={money(customAllowances, row.currency)} />
            <PayslipLedgerRow label="Taxable Gross Pay" value={money(row.grossPay, row.currency)} strong />
            <PayslipLedgerRow label="PAYE" value={money(statutory.payeTax, row.currency)} />
            <PayslipLedgerRow label="Pension" value={money(statutory.employeePension, row.currency)} />
            <PayslipLedgerRow label="Other Deductions" value={money(customDeductions, row.currency)} />
            <PayslipLedgerRow label="Salary Advance Recovery" value={money(row.advanceRecovery, row.currency)} />
            <PayslipLedgerRow label="Loan Recovery" value={money(row.loanRecovery, row.currency)} />
            {leaveAllowance > 0 && <PayslipLedgerRow label="Leave Allowance · After Tax / Non-taxable" value={money(leaveAllowance, row.currency)} strong />}
            <PayslipLedgerRow label="Net Pay" value={money(row.netPreview, row.currency)} net />
          </tbody>
        </table>
      </div>

      <section style={payslipPaymentSectionStyle}>
        <div style={payslipPaymentTitleStyle}>Loan Summary</div>
        <div style={payslipPaymentGridStyle}>
          <PayslipPaymentDetail label="Running Loan Balance" value={money(row.runningLoanBalance, row.currency)} />
        </div>
      </section>
      {row.runStatus !== "APPROVED" && <div style={warningStyle}>Preview only — this payroll has not yet been approved by Head HR. Printing is allowed for review, but employee email delivery remains disabled until approval.</div>}
      <div style={{ ...buttonRow, marginTop: 14 }}>
        <button type="button" style={secondaryButton} onClick={onClose}>Close</button>
        <button type="button" style={primaryButton} onClick={() => printPayslip(row, organization)}>{row.runStatus === "APPROVED" ? "Print Payslip" : "Print Preview"}</button>
        {row.runStatus === "APPROVED" && onEmail && <button type="button" style={primaryButton} disabled={!row.employeeEmail || emailBusy} onClick={onEmail}>{emailBusy ? "Emailing…" : row.employeeEmail ? "Email Payslip" : "Employee Email Missing"}</button>}
      </div>
        </div>
      </div>
    </Panel>
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function safeImageUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function payslipOrganizationName(organization = {}) {
  const raw = String(organization.legalName || organization.name || "CHRiS Organization").trim();
  return raw
    .replace(/\s*[—-]\s*SYNTHETIC STAGING ACCEPTANCE\s*$/i, "")
    .trim();
}

function payslipLogoUrl(organization = {}) {
  const configured = safeImageUrl(organization?.logoUrl);
  if (configured) return configured;
  const slug = String(organization?.slug || "").trim().toLowerCase();
  if (slug === "zermatt-liquor-limited") return "/zrt-logo.jpeg";
  return "";
}

function printPayslip(row, organization = {}) {
  const details = row.details || {};
  const statutory = details.statutory || {};
  const structure = details.salaryStructure || {};
  const attendance = details.attendance || {};
  const leaveAllowance = Number(details.leaveAllowance?.amount || 0);
  const customAllowances = (details.customAllowances || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const customDeductions = (details.customDeductions || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const organizationName = payslipOrganizationName(organization);
  const logoUrl = payslipLogoUrl(organization);
  const rows = [
    ["Basic", money(structure.basic ?? row.baseSalary, row.currency)],
    ...Object.entries(structure).filter(([key]) => key !== "basic").map(([key, value]) => [key.charAt(0).toUpperCase() + key.slice(1), money(value, row.currency)]),
    ["Other Earnings", money(customAllowances, row.currency)],
    ["Taxable Gross Pay", money(row.grossPay, row.currency), true],
    ["PAYE", money(statutory.payeTax, row.currency)],
    ["Pension", money(statutory.employeePension, row.currency)],
    ["Other Deductions", money(customDeductions, row.currency)],
    ["Salary Advance Recovery", money(row.advanceRecovery, row.currency)],
    ["Loan Recovery", money(row.loanRecovery, row.currency)],
    ...(leaveAllowance > 0 ? [["Leave Allowance · After Tax / Non-taxable", money(leaveAllowance, row.currency), true]] : []),
    ["Net Pay", money(row.netPreview, row.currency), true],
  ];
  const detailItems = [
    ["Employee Name", row.employeeName || "—"],
    ["Employee Number", row.employeeNumber || "—"],
    ["Designation", row.designation || "—"],
    ["Payroll Period", `${row.periodStart} — ${row.periodEnd}`],
    ["Pay Date", row.payDate || "—"],
    ["Worked Days", attendance.payableDays != null ? `${attendance.payableDays} / ${attendance.standardDays}` : "—"],
    ["Attendance Source", attendance.source ? String(attendance.source).replaceAll("_", " ") : "—"],
    ["Status", row.runStatus === "APPROVED" ? "Approved Payroll" : `${String(row.runStatus || "DRAFT").replaceAll("_", " ")} · PREVIEW ONLY`],
  ];
  const paymentItems = [
    ["Running Loan Balance", money(row.runningLoanBalance, row.currency)],
  ];
  const logo = logoUrl ? `<img class="organization-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(organizationName)} logo">` : "";
  const watermark = logoUrl ? `<img class="watermark" src="${escapeHtml(logoUrl)}" alt="" aria-hidden="true">` : `<div class="watermark-text">${escapeHtml(organizationName)}</div>`;
  // Keep a same-origin about:blank handle long enough to write the document.
  // `noopener` in windowFeatures can make browsers return null while still
  // opening a blank tab. We remove opener immediately below instead.
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Allow pop-ups to print this payslip.");
    return;
  }
  printWindow.opener = null;
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title></title><style>
    @page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#f7f3e8;color:#17211c;font-family:Arial,Helvetica,sans-serif}.payslip{position:relative;width:210mm;height:297mm;padding:10mm 14mm 9mm;overflow:hidden;background:#f7f3e8}.document-content{position:relative;z-index:1}.organization-header{text-align:center;padding-bottom:8px;border-bottom:2px solid #0b6b43}.organization-logo{display:block;max-width:92px;max-height:48px;margin:0 auto 5px;object-fit:contain}.organization-name{margin:0;color:#064e3b;font-size:17px;line-height:1.18}.document-title{margin:4px 0 0;color:#9a7410;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.watermark{position:fixed;z-index:2;top:52%;left:50%;width:46%;max-width:300px;max-height:300px;transform:translate(-50%,-50%);object-fit:contain;opacity:.10;filter:grayscale(100%);mix-blend-mode:multiply;pointer-events:none}.watermark-text{position:fixed;z-index:2;top:52%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);width:78%;text-align:center;color:#064e3b;opacity:.09;font-size:42pt;font-weight:900;letter-spacing:.08em;mix-blend-mode:multiply;pointer-events:none}.reference{margin:8px 0 8px;text-align:center;color:#475569;font-size:8.5pt}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:9px}.detail{padding:6px 8px;border:1px solid #d8c788;border-radius:6px;background:#f7f3e8}.detail span{display:block;margin-bottom:2px;color:#64748b;font-size:6.8pt;text-transform:uppercase;letter-spacing:.04em}.detail strong{font-size:8.2pt;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;background:#f7f3e8}th,td{padding:5px 8px;border-bottom:1px solid #d8dee2;font-size:8.2pt}th{background:#f7f3e8!important;color:#064e3b!important;text-align:left;text-transform:uppercase;letter-spacing:.06em;font-size:7pt;border-bottom:2px solid #064e3b;-webkit-print-color-adjust:exact;print-color-adjust:exact}th:last-child,td:last-child{text-align:right}.strong-row td{font-weight:700;color:#064e3b}.net-row td{border-top:2px solid #9a7410;border-bottom:2px solid #9a7410;font-size:9.5pt}.payment-summary{margin-top:8px;padding-top:7px;border-top:2px solid #064e3b}.payment-title{margin:0 0 5px;color:#9a7410;font-size:7.2pt;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.payment-grid{display:grid;grid-template-columns:1fr;gap:5px}.payment-item{padding:6px 8px;border:1px solid #d8c788;border-radius:6px;background:#f7f3e8}.payment-item span{display:inline;margin-right:8px;color:#64748b;font-size:6.8pt;text-transform:uppercase;letter-spacing:.04em}.payment-item strong{font-size:8.2pt;overflow-wrap:anywhere}.footer{display:flex;justify-content:space-between;gap:12px;margin-top:8px;padding-top:6px;border-top:1px solid #94a3b8;color:#64748b;font-size:6.8pt}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><article class="payslip">${watermark}<div class="document-content"><header class="organization-header">${logo}<h1 class="organization-name">${escapeHtml(organizationName)}</h1><h2 class="document-title">Employee Payslip</h2></header><p class="reference">${escapeHtml(row.periodCode)} · ${escapeHtml(row.employeeNumber)}</p><section class="details">${detailItems.map(([label, value]) => `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</section><table><thead><tr><th>Earnings / Deductions</th><th>Amount</th></tr></thead><tbody>${rows.map(([label, value, strong], index) => `<tr class="${strong ? "strong-row" : ""}${index === rows.length - 1 ? " net-row" : ""}"><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table><section class="payment-summary"><h3 class="payment-title">Loan Summary</h3><div class="payment-grid">${paymentItems.map(([label, value]) => `<div class="payment-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div></section><footer class="footer"><span>${escapeHtml(row.runStatus === "APPROVED" ? "Generated from an approved CHRiS payroll run." : "CHRiS payroll preview — not approved for employee distribution.")}</span><span>${escapeHtml(new Date().toLocaleString("en-NG"))}</span></footer></div></article><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300));</script></body></html>`);
  printWindow.document.close();
}

function StatutoryCatalogue() {
  const { data, loading, error } = useLoad("/api/payroll/statutory-catalogue", {});
  const items = data?.items || [];
  return (
    <>
      <Panel title={`Statutory Catalogue${data?.policyCode ? ` · ${data.policyCode} v${data.policyVersion}` : ""}`}>
        <p style={controlNote}>CHRiS distinguishes employee deductions from employer-only obligations. Items marked REVIEW BEFORE ACTIVATION are visible for governance but are not deducted until ZERMATT explicitly activates them and required employee/applicability data exists.</p>
        <DataTable loading={loading} columns={["Item", "Category", "Frequency", "Status", "Configured Basis", "Payroll Effect"]}>
          {items.map((item) => <tr key={item.code}><Td strong>{item.name}</Td><Td>{item.category}</Td><Td>{item.payrollFrequency}</Td><Td><Badge>{item.status}</Badge></Td><Td>{item.basis}</Td><Td>{item.employeeEffect}</Td></tr>)}
        </DataTable>
      </Panel>
      <Feedback error={error} />
      {data?.control && <div style={infoStyle}>{data.control}</div>}
    </>
  );
}

function PayslipDetail({ label, value }) { return <div style={payslipDetailCardStyle}><div style={payslipDetailLabelStyle}>{label}</div><strong style={payslipDetailValueStyle}>{value}</strong></div>; }
function PayslipPaymentDetail({ label, value }) { return <div style={payslipPaymentCardStyle}><div style={payslipPaymentLabelStyle}>{label}</div><strong style={payslipPaymentValueStyle}>{value}</strong></div>; }
function PayslipLedgerRow({ label, value, strong = false, net = false }) {
  return (
    <tr>
      <td style={{ ...payslipLedgerCellStyle, ...(strong || net ? payslipLedgerStrongStyle : {}) }}>{label}</td>
      <td style={{ ...payslipLedgerCellStyle, textAlign: "right", ...(strong || net ? payslipLedgerStrongStyle : {}), ...(net ? payslipLedgerNetStyle : {}) }}>{value}</td>
    </tr>
  );
}
function Summary({ label, value }) { return <div style={summaryCard}><div style={summaryLabel}>{label}</div><strong>{value}</strong></div>; }
function Panel({ title, children }) { return <section style={panelStyle}><h2 style={panelTitle}>{title}</h2>{children}</section>; }
function Feedback({ error }) { return error ? <div role="alert" style={errorStyle}>{error}</div> : null; }
function Select({ label, value, onChange, options }) { return <label style={fieldLabel}><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>{options.map(([key, name]) => <option key={key || "blank"} value={key}>{name}</option>)}</select></label>; }
function DataTable({ columns, children, loading = false }) { return <div style={tableWrap}>{loading ? <div style={loadingStyle}>Loading…</div> : <table style={tableStyle}><thead><tr>{columns.map((column) => <th key={column} style={thStyle}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table>}</div>; }
function Td({ children, strong = false }) { return <td style={{ ...tdStyle, ...(strong ? { fontWeight: 900, color: "#F7FAF8" } : {}) }}>{children}</td>; }
function Badge({ children }) { return <span style={badgeStyle}>{String(children || "—").replaceAll("_", " ")}</span>; }

const pageStyle = { maxWidth: 1500, margin: "0 auto", color: "#F7FAF8" };
const backButton = { border: 0, background: "transparent", color: "#D4AF37", fontWeight: 900, cursor: "pointer", padding: "0 0 14px" };
const eyebrow = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle = { margin: "6px 0", fontSize: 32 };
const leadStyle = { color: "#C7D3CC", lineHeight: 1.65, maxWidth: 1050, marginBottom: 22 };
const panelStyle = { marginTop: 18, padding: 20, border: "1px solid rgba(212,175,55,.45)", borderRadius: 15, background: "linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96))", boxShadow: "0 15px 38px rgba(0,0,0,.24)" };
const panelTitle = { margin: "0 0 15px", fontSize: 18, color: "#D4AF37" };
const fieldLabel = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800, minWidth: 220 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8", outline: "none" };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.5)" };
const smallButton = { ...secondaryButton, padding: "7px 10px", fontSize: 12 };
const buttonRow = { display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" };
const branchViewBar = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12, padding: 10, border: "1px solid rgba(212,175,55,.28)", borderRadius: 10 };
const branchButton = { border: "1px solid rgba(212,175,55,.35)", borderRadius: 8, padding: "7px 10px", background: "rgba(4,46,28,.72)", color: "#F7FAF8", fontWeight: 800, cursor: "pointer" };
const activeBranchButton = { ...branchButton, background: "#D4AF37", color: "#111" };
const branchViewText = { marginLeft: "auto", color: "#AFC0B6", fontSize: 11, fontWeight: 800 };
const payrollKpiGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 16 };
const connectedDashboardStyle = { marginBottom: 16, padding: 16, borderRadius: 14, border: "1px solid rgba(212,175,55,.28)", background: "linear-gradient(145deg,rgba(5,39,25,.88),rgba(2,20,13,.94))" };
const connectedDashboardHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 };
const connectedDashboardEyebrowStyle = { color: "#D4AF37", fontSize: 10, fontWeight: 900, letterSpacing: ".14em" };
const connectedDashboardTitleStyle = { margin: "5px 0 4px", color: "#F7FAF8", fontSize: 18 };
const connectedDashboardSubtextStyle = { color: "#9FB7AA", fontSize: 11, lineHeight: 1.5, maxWidth: 760 };
const dashboardStatusPillStyle = { padding: "7px 10px", borderRadius: 999, border: "1px solid rgba(212,175,55,.35)", background: "rgba(212,175,55,.08)", color: "#F7D66A", fontSize: 11, fontWeight: 900 };
const dashboardKpiCardStyle = { minWidth: 0, padding: 12, borderRadius: 11, border: "1px solid rgba(212,175,55,.22)", background: "rgba(255,255,255,.04)" };
const dashboardKpiLabelStyle = { color: "#9FB7AA", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".055em" };
const dashboardKpiValueStyle = { marginTop: 6, color: "#F7FAF8", fontSize: "clamp(15px,2vw,21px)", fontWeight: 900, overflowWrap: "anywhere" };
const dashboardKpiHintStyle = { marginTop: 4, color: "#D4AF37", fontSize: 9.5 };
const dashboardChartGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 12 };
const dashboardChartCardStyle = { minWidth: 0, padding: 14, borderRadius: 12, border: "1px solid rgba(212,175,55,.18)", background: "rgba(1,15,10,.50)" };
const dashboardChartTitleStyle = { color: "#F7D66A", fontWeight: 900, fontSize: 13 };
const dashboardChartSubtitleStyle = { marginTop: 3, color: "#8FA79A", fontSize: 10.5, lineHeight: 1.45 };
const dashboardChartBodyStyle = { width: "100%", minHeight: 280, marginTop: 10 };
const dashboardTooltipStyle = { background: "#082F20", border: "1px solid rgba(212,175,55,.45)", borderRadius: 8, color: "#F7FAF8", fontSize: 11 };
const dashboardBranchSelectorStyle = { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 };
const dashboardBranchChipStyle = { border: "1px solid rgba(212,175,55,.25)", borderRadius: 999, padding: "5px 8px", background: "transparent", color: "#C7D3CC", fontSize: 10, fontWeight: 800, cursor: "pointer" };
const activeDashboardBranchChipStyle = { ...dashboardBranchChipStyle, background: "#D4AF37", color: "#07140D", borderColor: "#D4AF37" };
const dashboardMiniGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 9, alignContent: "start" };
const dashboardMetricStyle = { padding: 11, borderRadius: 10, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.035)" };
const dashboardMetricLabelStyle = { display: "block", color: "#9FB7AA", fontSize: 10, marginBottom: 5 };
const dashboardMetricValueStyle = { color: "#F7FAF8", fontSize: 14, overflowWrap: "anywhere" };
const dashboardEmptyStyle = { minHeight: 220, display: "grid", placeItems: "center", color: "#8FA79A", fontSize: 12, textAlign: "center", padding: 20 };
const dashboardPieColors = ["#D4AF37", "#2EE98B", "#72A7FF", "#F59E0B", "#A78BFA", "#F472B6"];
const mutedText = { color: "#94A89D", fontSize: 11 };
const warningStyle = { padding: 10, marginBottom: 12, border: "1px solid rgba(245,158,11,.55)", borderRadius: 9, background: "rgba(245,158,11,.08)", color: "#F5D98C", fontSize: 12 };

const controlNote = { color: "#A9BDB2", lineHeight: 1.6, fontSize: 13 };
const tableWrap = { width: "100%", overflowX: "auto" };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle = { padding: "10px", borderBottom: "1px solid rgba(212,175,55,.35)", textAlign: "left", color: "#D4AF37", fontSize: 11, whiteSpace: "nowrap" };
const tdStyle = { padding: "10px", borderBottom: "1px solid rgba(255,255,255,.08)", color: "#C7D3CC", fontSize: 12, verticalAlign: "top" };
const badgeStyle = { display: "inline-block", padding: "4px 7px", borderRadius: 999, border: "1px solid rgba(212,175,55,.35)", color: "#F7D66A", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" };
const errorStyle = { marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(127,29,29,.35)", border: "1px solid rgba(248,113,113,.45)", color: "#FCA5A5" };
const infoStyle = { marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(14,71,48,.42)", border: "1px solid rgba(212,175,55,.35)", color: "#C7D3CC", lineHeight: 1.6 };
const loadingStyle = { padding: 14, color: "#C7D3CC" };
const summaryGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 };
const summaryCard = { padding: 12, border: "1px solid rgba(212,175,55,.25)", borderRadius: 10, background: "rgba(255,255,255,.04)" };
const summaryLabel = { color: "#9FB7AA", fontSize: 11, marginBottom: 5 };
const batchSummaryStyle = { display: "flex", alignItems: "center", minHeight: 36, padding: "0 4px", color: "#C7D3CC", fontSize: 12 };
const bulkPayslipEmailBarStyle = { display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", margin: "14px 0", padding: 14, border: "1px solid rgba(212,175,55,.30)", borderRadius: 12, background: "rgba(255,255,255,.035)" };

const payslipScrollAnchorStyle = { scrollMarginTop: 84, outline: "none" };

const payslipPreviewDocumentStyle = { position: "relative", overflow: "hidden", borderRadius: 14, background: "linear-gradient(145deg,#082F20,#031A11)", color: "#F7FAF8", padding: "22px 24px 26px", border: "1px solid rgba(212,175,55,.42)", boxShadow: "0 18px 48px rgba(0,0,0,.28)" };
const payslipIdentityGridStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginBottom: 18 };
const payslipDetailCardStyle = { padding: "10px 12px", border: "1px solid rgba(212,175,55,.30)", borderRadius: 9, background: "rgba(255,255,255,.045)" };
const payslipDetailLabelStyle = { color: "#9FB7AA", fontSize: 10, textTransform: "uppercase", letterSpacing: ".045em", marginBottom: 4, fontWeight: 700 };
const payslipDetailValueStyle = { color: "#F7FAF8", fontSize: 13, lineHeight: 1.35, overflowWrap: "anywhere" };
const payslipLedgerWrapStyle = { marginTop: 4, overflowX: "auto", borderRadius: 8, border: "1px solid rgba(212,175,55,.20)" };
const payslipLedgerTableStyle = { width: "100%", minWidth: 0, borderCollapse: "collapse", background: "rgba(3,20,13,.42)" };
const payslipLedgerHeadStyle = { padding: "10px 12px", background: "#064E3B", color: "#FFFFFF", textAlign: "left", textTransform: "uppercase", letterSpacing: ".06em", fontSize: 11, fontWeight: 900 };
const payslipLedgerCellStyle = { padding: "9px 12px", borderBottom: "1px solid rgba(255,255,255,.08)", color: "#D8E4DE", fontSize: 12 };
const payslipLedgerStrongStyle = { fontWeight: 900, color: "#F7D66A" };
const payslipLedgerNetStyle = { borderTop: "2px solid #9A7410", borderBottom: "2px solid #9A7410", fontSize: 14 };
const payslipPaymentSectionStyle = { marginTop: 16, paddingTop: 12, borderTop: "2px solid rgba(212,175,55,.55)" };
const payslipPaymentTitleStyle = { marginBottom: 10, color: "#9A7410", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" };
const payslipPaymentGridStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 };
const payslipPaymentCardStyle = { padding: "10px 12px", border: "1px solid rgba(212,175,55,.30)", borderRadius: 9, background: "rgba(255,255,255,.045)" };
const payslipPaymentLabelStyle = { color: "#9FB7AA", fontSize: 10, textTransform: "uppercase", letterSpacing: ".045em", marginBottom: 4, fontWeight: 700 };
const payslipPaymentValueStyle = { color: "#F7FAF8", fontSize: 13, lineHeight: 1.35, overflowWrap: "anywhere" };
const payslipPreviewContentStyle = { position: "relative", zIndex: 1 };
const payslipPreviewHeaderStyle = { textAlign: "center", paddingBottom: 14, marginBottom: 16, borderBottom: "2px solid #0B6B43" };
const payslipPreviewLogoStyle = { display: "block", maxWidth: 120, maxHeight: 64, margin: "0 auto 8px", objectFit: "contain" };
const payslipPreviewOrganizationNameStyle = { color: "#F7FAF8", fontSize: 20, fontWeight: 900, lineHeight: 1.25 };
const payslipPreviewTitleStyle = { marginTop: 6, color: "#9A7410", fontSize: 13, fontWeight: 900, letterSpacing: ".12em" };
const payslipPreviewWatermarkImageStyle = { position: "absolute", zIndex: 0, top: "54%", left: "50%", width: "42%", maxWidth: 280, maxHeight: 280, transform: "translate(-50%, -50%)", objectFit: "contain", opacity: 0.055, filter: "grayscale(100%)", pointerEvents: "none" };
const payslipPreviewWatermarkTextStyle = { position: "absolute", zIndex: 0, top: "54%", left: "50%", width: "78%", transform: "translate(-50%, -50%) rotate(-28deg)", textAlign: "center", color: "#D4AF37", opacity: 0.05, fontSize: "clamp(30px,6vw,56px)", fontWeight: 900, letterSpacing: ".08em", pointerEvents: "none" };
