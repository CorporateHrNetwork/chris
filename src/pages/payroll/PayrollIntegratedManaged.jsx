import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
      setError(err.message || "Unable to calculate payroll.");
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

  const exportAuditPack = async (run) => {
    try {
      setBusy(`export-${run.id}`); setError(""); setMessage("");
      const download = await apiDownload(`/api/payroll/runs/${run.id}/audit-pack.xlsx`);
      saveDownloadedBlob(download);
      setMessage("Approved payroll audit pack exported for external auditor confirmation, GM approval and Accounts & Finance payout processing.");
    } catch (err) {
      setError(err.message || "Unable to export payroll audit pack.");
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
        <p style={controlNote}>For ZERMATT, Branch HR & Admin Officers review attendance and may enter or edit worked days only for employees within their assigned branch; the same authoritative attendance input immediately feeds Head Office payroll and marks any existing draft for recalculation. The Head of HR prepares, calculates/processes, submits and approves payroll in CHRiS. Each employee payroll line has a live payslip preview before approval; email delivery is enabled only after approval. After approval, export the formula-backed Payroll Audit Pack for external auditor confirmation, GM approval and Accounts & Finance payout processing outside CHRiS. Loan installments become eligible from the configured recovery month. Salary Advance defaults to ₦0 in each new payroll period and appears only when an active repayment schedule is due for that period. Loan and scheduled Salary Advance balances reduce only on payroll approval. ZERMATT Leave Allowance, when due, is added after PAYE as a non-taxable after-tax benefit.</p>
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
                {(run.status === "DRAFT" || run.status === "REJECTED") && <button type="button" style={smallButton} disabled={busy === `submit-${run.id}`} onClick={() => submit(run.id)}>Submit</button>}
                {run.status === "APPROVED" && <button type="button" style={smallButton} disabled={busy === `export-${run.id}`} onClick={() => exportAuditPack(run)}>{busy === `export-${run.id}` ? "Exporting…" : "Export Audit Pack"}</button>}
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
        <div style={payrollKpiGrid}>
          <Summary label="Employees" value={visibleLines.length} />
          <Summary label="Expected Days" value={visibleLines.reduce((sum, row) => sum + Number(row.details?.attendance?.standardDays || 0), 0)} />
          <Summary label="Worked Days" value={visibleLines.reduce((sum, row) => sum + Number(row.details?.attendance?.payableDays || 0), 0)} />
          <Summary label="Gross Payroll" value={money(visibleLines.reduce((sum, row) => sum + Number(row.grossPay || 0), 0))} />
          <Summary label="Net Payroll" value={money(visibleLines.reduce((sum, row) => sum + Number(row.netPreview || 0), 0))} />
        </div>
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

function PayrollLines({ rows, onViewPayslip }) {
  const getSearchText = useCallback((row) => [row.employeeNumber, row.employeeName, row.details?.employmentType, row.details?.costCentre].filter(Boolean).join(" "), []);
  return (
    <EmployeeBatchSelector
      rows={rows || []}
      getId={(row) => row.id}
      getSearchText={getSearchText}
      searchPlaceholder="Search employee number, name, employment type or cost centre"
      selectionLabel="payroll employee(s)"
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
  const approvedPayslipRef = useRef(null);
  const organization = profile?.organization || getStoredOrganization() || {};
  const getSearchText = useCallback((row) => [row.employeeNumber, row.employeeName, row.employeeEmail, row.periodCode, row.periodName].filter(Boolean).join(" "), []);

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
        <p style={controlNote}>Only APPROVED payroll runs appear here. Approved payslips can be viewed, printed and emailed individually or in bulk to the employee email stored in CHRiS. A missing employee email affects only that employee's delivery and never blocks payroll approval.</p>
        <EmployeeBatchSelector
          rows={rows || []}
          getId={(row) => row.id}
          getSearchText={getSearchText}
          searchPlaceholder="Search employee number, employee name, email or payroll period"
          selectionLabel="payslip(s)"
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
    <Panel title={`Payslip · ${row.periodCode} · ${row.employeeNumber} — ${row.employeeName}`}>
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
      <div style={summaryGrid}>
        <Summary label="Employee" value={`${row.employeeNumber} — ${row.employeeName}`} />
        <Summary label="Payroll Period" value={`${row.periodStart} → ${row.periodEnd}`} />
        <Summary label="Pay Date" value={row.payDate || "—"} />
        <Summary label="Worked Days" value={attendance.payableDays != null ? `${attendance.payableDays} / ${attendance.standardDays}` : "—"} />
        <Summary label="Attendance Source" value={attendance.source ? String(attendance.source).replaceAll("_", " ") : "—"} />
        <Summary label="Status" value={row.runStatus === "APPROVED" ? "Approved Payroll" : `${String(row.runStatus || "DRAFT").replaceAll("_", " ")} · Preview Only`} />
      </div>
      <div style={{ marginTop: 16 }}>
        <DataTable columns={["Earnings / Deductions", "Amount"]}>
          <tr><Td strong>Basic</Td><Td>{money(structure.basic ?? row.baseSalary, row.currency)}</Td></tr>
          {Object.entries(structure).filter(([key]) => key !== "basic").map(([key, value]) => <tr key={key}><Td>{key.charAt(0).toUpperCase() + key.slice(1)}</Td><Td>{money(value, row.currency)}</Td></tr>)}
          <tr><Td>Other Earnings</Td><Td>{money(customAllowances, row.currency)}</Td></tr>
          <tr><Td strong>Taxable Gross Pay</Td><Td strong>{money(row.grossPay, row.currency)}</Td></tr>
          <tr><Td>PAYE</Td><Td>{money(statutory.payeTax, row.currency)}</Td></tr>
          <tr><Td>Pension</Td><Td>{money(statutory.employeePension, row.currency)}</Td></tr>
          <tr><Td>Other Deductions</Td><Td>{money(customDeductions, row.currency)}</Td></tr>
          <tr><Td>Salary Advance Recovery</Td><Td>{money(row.advanceRecovery, row.currency)}</Td></tr>
          <tr><Td>Loan Recovery</Td><Td>{money(row.loanRecovery, row.currency)}</Td></tr>
          {leaveAllowance > 0 && <tr><Td strong>Leave Allowance · After Tax / Non-taxable</Td><Td strong>{money(leaveAllowance, row.currency)}</Td></tr>}
          <tr><Td strong>Net Pay</Td><Td strong>{money(row.netPreview, row.currency)}</Td></tr>
        </DataTable>
      </div>
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
    ["Employee", `${row.employeeNumber} — ${row.employeeName}`],
    ["Payroll Period", `${row.periodStart} — ${row.periodEnd}`],
    ["Pay Date", row.payDate || "—"],
    ["Worked Days", attendance.payableDays != null ? `${attendance.payableDays} / ${attendance.standardDays}` : "—"],
    ["Attendance Source", attendance.source ? String(attendance.source).replaceAll("_", " ") : "—"],
    ["Status", row.runStatus === "APPROVED" ? "Approved Payroll" : `${String(row.runStatus || "DRAFT").replaceAll("_", " ")} · PREVIEW ONLY`],
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
    @page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#17211c;font-family:Arial,Helvetica,sans-serif}.payslip{position:relative;min-height:297mm;padding:18mm 19mm 16mm;overflow:hidden}.document-content{position:relative;z-index:1}.organization-header{text-align:center;padding-bottom:14px;border-bottom:2px solid #0b6b43}.organization-logo{display:block;max-width:120px;max-height:64px;margin:0 auto 8px;object-fit:contain}.organization-name{margin:0;color:#064e3b;font-size:21px;line-height:1.25}.document-title{margin:7px 0 0;color:#9a7410;font-size:15px;letter-spacing:.12em;text-transform:uppercase}.watermark{position:fixed;z-index:2;top:52%;left:50%;width:46%;max-width:300px;max-height:300px;transform:translate(-50%,-50%);object-fit:contain;opacity:.10;filter:grayscale(100%);mix-blend-mode:multiply;pointer-events:none}.watermark-text{position:fixed;z-index:2;top:52%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);width:78%;text-align:center;color:#064e3b;opacity:.09;font-size:42pt;font-weight:900;letter-spacing:.08em;mix-blend-mode:multiply;pointer-events:none}.reference{margin:16px 0 12px;text-align:center;color:#475569;font-size:10pt}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:16px}.detail{padding:9px 11px;border:1px solid #d8c788;border-radius:7px;background:rgba(255,255,255,.86)}.detail span{display:block;margin-bottom:4px;color:#64748b;font-size:8pt;text-transform:uppercase;letter-spacing:.04em}.detail strong{font-size:9.5pt;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.86)}th,td{padding:8px 10px;border-bottom:1px solid #d8dee2;font-size:9.5pt}th{background:#064e3b!important;color:#fff!important;text-align:left;text-transform:uppercase;letter-spacing:.06em;font-size:8pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}th:last-child,td:last-child{text-align:right}.strong-row td{font-weight:700;color:#064e3b}.net-row td{border-top:2px solid #9a7410;border-bottom:2px solid #9a7410;font-size:11pt}.footer{display:flex;justify-content:space-between;gap:16px;margin-top:18px;padding-top:10px;border-top:1px solid #94a3b8;color:#64748b;font-size:8pt}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><article class="payslip">${watermark}<div class="document-content"><header class="organization-header">${logo}<h1 class="organization-name">${escapeHtml(organizationName)}</h1><h2 class="document-title">Employee Payslip</h2></header><p class="reference">${escapeHtml(row.periodCode)} · ${escapeHtml(row.employeeNumber)} · ${escapeHtml(row.employeeName)}</p><section class="details">${detailItems.map(([label, value]) => `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</section><table><thead><tr><th>Earnings / Deductions</th><th>Amount</th></tr></thead><tbody>${rows.map(([label, value, strong], index) => `<tr class="${strong ? "strong-row" : ""}${index === rows.length - 1 ? " net-row" : ""}"><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table><footer class="footer"><span>${escapeHtml(row.runStatus === "APPROVED" ? "Generated from an approved CHRiS payroll run." : "CHRiS payroll preview — not approved for employee distribution.")}</span><span>${escapeHtml(new Date().toLocaleString("en-NG"))}</span></footer></div></article><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300));</script></body></html>`);
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
const payrollKpiGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 12 };
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

const payslipScrollAnchorStyle = { scrollMarginTop: 84, outline: "none" };

const payslipPreviewDocumentStyle = { position: "relative", overflow: "hidden", borderRadius: 12, background: "#fff", color: "#17211c", padding: 18, border: "1px solid rgba(212,175,55,.35)" };
const payslipPreviewContentStyle = { position: "relative", zIndex: 1 };
const payslipPreviewHeaderStyle = { textAlign: "center", paddingBottom: 14, marginBottom: 16, borderBottom: "2px solid #0B6B43" };
const payslipPreviewLogoStyle = { display: "block", maxWidth: 120, maxHeight: 64, margin: "0 auto 8px", objectFit: "contain" };
const payslipPreviewOrganizationNameStyle = { color: "#064E3B", fontSize: 20, fontWeight: 900, lineHeight: 1.25 };
const payslipPreviewTitleStyle = { marginTop: 6, color: "#9A7410", fontSize: 13, fontWeight: 900, letterSpacing: ".12em" };
const payslipPreviewWatermarkImageStyle = { position: "absolute", zIndex: 2, top: "52%", left: "50%", width: "46%", maxWidth: 300, maxHeight: 300, transform: "translate(-50%, -50%)", objectFit: "contain", opacity: 0.10, filter: "grayscale(100%)", mixBlendMode: "multiply", pointerEvents: "none" };
const payslipPreviewWatermarkTextStyle = { position: "absolute", zIndex: 2, top: "52%", left: "50%", width: "78%", transform: "translate(-50%, -50%) rotate(-28deg)", textAlign: "center", color: "#064E3B", opacity: 0.09, fontSize: "clamp(30px,6vw,56px)", fontWeight: 900, letterSpacing: ".08em", mixBlendMode: "multiply", pointerEvents: "none" };
