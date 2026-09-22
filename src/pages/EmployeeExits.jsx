import EmployeeStatusBadge from "../components/common/StatusBadge";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FaArrowLeft, FaCheckCircle, FaPrint, FaRedo, FaSignOutAlt } from "react-icons/fa";
import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";
import { PrintableReportHeader, PrintableReportFooter } from "../components/reporting/PrintableReportBranding";
import "./EmployeeExits.css";

const EXIT_TYPES = [
  ["RESIGNATION", "Resignation"],
  ["TERMINATION", "Termination"],
  ["RETIREMENT", "Retirement"],
  ["END_OF_CONTRACT", "End of Contract"],
  ["REDUNDANCY", "Redundancy"],
  ["OTHER", "Other"],
];

const NOTICE_STATUSES = [
  ["IN_PROGRESS", "In Progress"],
  ["SERVED", "Served"],
  ["WAIVED", "Waived"],
  ["NOT_REQUIRED", "Not Required"],
];

const EXIT_DOCUMENT_TYPES = [
  ["RESIGNATION_LETTER", "Resignation Letter"],
  ["TERMINATION_LETTER", "Termination Letter"],
  ["RETIREMENT_NOTICE", "Retirement Notice"],
  ["END_OF_CONTRACT_NOTICE", "End of Contract Notice"],
  ["REDUNDANCY_NOTICE", "Redundancy Notice"],
  ["EXIT_ACCEPTANCE_LETTER", "Exit / Resignation Acceptance Letter"],
  ["CLEARANCE_DOCUMENT", "Exit Clearance Document"],
  ["HANDOVER_DOCUMENT", "Handover Document"],
  ["OTHER_EXIT_DOCUMENT", "Other Exit Document"],
];

function defaultExitDocumentType(exitType) {
  const map = {
    RESIGNATION: "RESIGNATION_LETTER",
    TERMINATION: "TERMINATION_LETTER",
    RETIREMENT: "RETIREMENT_NOTICE",
    END_OF_CONTRACT: "END_OF_CONTRACT_NOTICE",
    REDUNDANCY: "REDUNDANCY_NOTICE",
  };
  return map[String(exitType || "").toUpperCase()] || "OTHER_EXIT_DOCUMENT";
}

const CLEARANCE_ITEMS = [
  ["assetsReturned", "Company Assets Returned"],
  ["accessDisabled", "System / Access Disabled"],
  ["handoverCompleted", "Handover Completed"],
  ["financeCleared", "Finance Clearance"],
  ["payrollCleared", "Payroll Clearance"],
  ["hrCleared", "HR Clearance"],
];

const EMPTY_EXIT = {
  exitType: "RESIGNATION",
  noticeDate: "",
  noticeStatus: "IN_PROGRESS",
  lastWorkingDay: "",
  reason: "",
  notes: "",
};

const EMPTY_REHIRE = {
  status: "ACTIVE",
  effectiveDate: new Date().toISOString().slice(0, 10),
  departmentId: "",
  designationId: "",
  locationId: "",
  reason: "",
  notes: "",
};

const EMPTY_SETTLEMENT = {
  bonusGift: "",
  noticePayDays: "",
  previousSalaryShortPaid: "",
  noticeDeductionDays: "",
  unreturnedUniform: "",
  previousSalaryOverpaid: "",
  currency: "NGN",
  notes: "",
};

function settlementFormFromRecord(record) {
  if (!record) return EMPTY_SETTLEMENT;
  const hrInputs = record.calculationSnapshot?.hrInputs || {};
  return {
    bonusGift: String(hrInputs.bonusGift || ""),
    noticePayDays: String(hrInputs.noticePayDays || ""),
    previousSalaryShortPaid: String(hrInputs.previousSalaryShortPaid || ""),
    noticeDeductionDays: String(hrInputs.noticeDeductionDays || ""),
    unreturnedUniform: String(hrInputs.unreturnedUniform || ""),
    previousSalaryOverpaid: String(hrInputs.previousSalaryOverpaid || ""),
    currency: record.currency || "NGN",
    notes: record.notes || "",
  };
}

function nameOf(employee) {
  return [employee?.firstName, employee?.middleName, employee?.lastName]
    .filter(Boolean)
    .join(" ");
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateText(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function moneyText(value, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || "NGN"} ${Number(value || 0).toLocaleString()}`;
  }
}

export default function EmployeeExits() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const employeeNumber = searchParams.get("employeeNumber");
  const rehireNumber = searchParams.get("rehire");
  const settlementExitId = searchParams.get("settlement");
  const exitSection = searchParams.get("section") === "settlements" ? "settlements" : "register";

  const { hasPermission } = useAuthorization();
  const canUpdate = hasPermission("employees.update");
  const canManagePayroll = hasPermission("payroll.manage");

  const [selectedEmployeeRecord,setSelectedEmployeeRecord] = useState(null);
  const [rehireEmployeeRecord,setRehireEmployeeRecord] = useState(null);
  const [exits, setExits] = useState([]);
  const [exitRegister, setExitRegister] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [exitForm, setExitForm] = useState(EMPTY_EXIT);
  const [rehireForm, setRehireForm] = useState(EMPTY_REHIRE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [exitDocuments, setExitDocuments] = useState([]);
  const [exitDocumentDraft, setExitDocumentDraft] = useState({
    category: defaultExitDocumentType(EMPTY_EXIT.exitType),
    file: null,
    notes: "",
  });
  const [documentBusy, setDocumentBusy] = useState(false);
  const [settlement, setSettlement] = useState(null);
  const [settlementPreview, setSettlementPreview] = useState(null);
  const [settlementForm, setSettlementForm] = useState(EMPTY_SETTLEMENT);
  const [settlementDecisionNotes, setSettlementDecisionNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [exitResult, registerResult, departmentResult, designationResult, locationResult] =
        await Promise.all([
          apiRequest("/api/exits"),
          apiRequest("/api/exits/register"),
          apiRequest("/api/employees/career/departments"),
          apiRequest("/api/employees/career/catalog"),
          apiRequest("/api/location-catalog"),
        ]);

      setExits(exitResult?.data || []);
      setExitRegister(registerResult?.data || []);
      setDepartments((departmentResult?.data || []).filter((item) => item.isActive !== false));
      setDesignations((designationResult?.data || []).filter((item) => item.isActive !== false));
      setLocations((locationResult?.data || []).filter((item) => item.isActive !== false));
    } catch (error) {
      setFeedback(error?.message || "Unable to load exit records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    let active = true;
    if (!settlementExitId) {
      return undefined;
    }
    Promise.allSettled([
      apiRequest(`/api/exits/${encodeURIComponent(settlementExitId)}/settlement`),
      apiRequest(`/api/exits/${encodeURIComponent(settlementExitId)}/settlement/preview`),
    ]).then(([settlementResult, previewResult]) => {
      if (!active) return;

      if (settlementResult.status === "fulfilled") {
        const record = settlementResult.value?.data || null;
        setSettlement(record);
        if (record) setSettlementForm(settlementFormFromRecord(record));
      }

      if (previewResult.status === "fulfilled") {
        setSettlementPreview(previewResult.value?.data || null);
      } else if (settlementResult.status === "rejected") {
        setFeedback(
          previewResult.reason?.message ||
          settlementResult.reason?.message ||
          "Unable to load the exit settlement."
        );
      }
    });
    return () => { active = false; };
  }, [settlementExitId]);

  useEffect(() => {
    if (!settlementExitId) return undefined;
    if (settlement && !["DRAFT", "CALCULATED", "DISPUTED"].includes(settlement.status)) return undefined;

    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        bonusGift: String(settlementForm.bonusGift || 0),
        noticePayDays: String(settlementForm.noticePayDays || 0),
        previousSalaryShortPaid: String(settlementForm.previousSalaryShortPaid || 0),
        noticeDeductionDays: String(settlementForm.noticeDeductionDays || 0),
        unreturnedUniform: String(settlementForm.unreturnedUniform || 0),
        previousSalaryOverpaid: String(settlementForm.previousSalaryOverpaid || 0),
      });
      apiRequest(`/api/exits/${encodeURIComponent(settlementExitId)}/settlement/preview?${params.toString()}`)
        .then((result) => {
          if (active) setSettlementPreview(result?.data || null);
        })
        .catch((error) => {
          if (active) setFeedback(error?.message || "Unable to refresh the exit settlement preview.");
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    settlementExitId,
    settlement?.status,
    settlementForm.bonusGift,
    settlementForm.noticePayDays,
    settlementForm.previousSalaryShortPaid,
    settlementForm.noticeDeductionDays,
    settlementForm.unreturnedUniform,
    settlementForm.previousSalaryOverpaid,
  ]);
  useEffect(() => {
    let active = true;
    if (!employeeNumber) {
      return undefined;
    }

    apiRequest(`/api/employees/${encodeURIComponent(employeeNumber)}`)
      .then((result) => {
        if (active) setSelectedEmployeeRecord(result?.data || null);
      })
      .catch((error) => {
        if (active) {
          setSelectedEmployeeRecord(null);
          setFeedback(error?.message || "Unable to load the selected employee.");
        }
      });

    return () => { active = false; };
  }, [employeeNumber]);

  useEffect(() => {
    let active = true;
    if (!rehireNumber) {
      return undefined;
    }

    apiRequest(`/api/employees/${encodeURIComponent(rehireNumber)}`)
      .then((result) => {
        if (active) setRehireEmployeeRecord(result?.data || null);
      })
      .catch((error) => {
        if (active) {
          setRehireEmployeeRecord(null);
          setFeedback(error?.message || "Unable to load the exited employee.");
        }
      });

    return () => { active = false; };
  }, [rehireNumber]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(""), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const selectedEmployee = selectedEmployeeRecord;

  const rehireEmployee = rehireEmployeeRecord;

  const activeExit = useMemo(
    () =>
      selectedEmployee
        ? exits.find(
            (item) =>
              item.employeeId === selectedEmployee.id &&
              !["COMPLETED", "CANCELLED"].includes(item.status)
          ) || null
        : null,
    [selectedEmployee, exits]
  );

  const exitedEmployees = exitRegister;

  const settlementExit = useMemo(
    () => exitedEmployees.find((employee) => employee.exitProcess?.id === settlementExitId) || null,
    [exitedEmployees, settlementExitId]
  );

  const rehireDesignationOptions = useMemo(
    () =>
      designations.filter(
        (item) => String(item.departmentId || "") === String(rehireForm.departmentId || "")
      ),
    [designations, rehireForm.departmentId]
  );

  useEffect(() => {
    if (!rehireEmployee) return;

    const departmentId =
      departments.some((item) => item.id === rehireEmployee.department?.id)
        ? rehireEmployee.department.id
        : "";

    const designationId =
      designations.some(
        (item) =>
          item.id === rehireEmployee.designation?.id &&
          item.departmentId === departmentId
      )
        ? rehireEmployee.designation.id
        : "";

    const locationId =
      locations.some((item) => item.id === rehireEmployee.location?.id)
        ? rehireEmployee.location.id
        : "";

    const timer = window.setTimeout(() => {
      setRehireForm((current) => ({
        ...current,
        departmentId,
        designationId,
        locationId,
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rehireEmployee, departments, designations, locations]);

  function setExitField(name, value) {
    setExitForm((current) => ({ ...current, [name]: value }));
    if (name === "exitType") {
      setExitDocumentDraft((current) => ({
        ...current,
        category: defaultExitDocumentType(value),
      }));
    }
  }

  function setRehireField(name, value) {
    setRehireForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "departmentId" ? { designationId: "" } : {}),
    }));
  }

  async function initiateExit(event) {
    event.preventDefault();
    if (!selectedEmployee) return;

    setBusy(true);
    setFeedback("");

    try {
      const result = await apiRequest("/api/exits", {
        method: "POST",
        body: {
          ...exitForm,
          employeeId: selectedEmployee.id,
        },
      });

      setFeedback(result?.message || "Exit process initiated.");
      await loadData();
    } catch (error) {
      setFeedback(error?.message || "Unable to initiate exit.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleClearance(key) {
    if (!activeExit || activeExit.status === "COMPLETED") return;

    setBusy(true);
    try {
      const result = await apiRequest(
        `/api/exits/${encodeURIComponent(activeExit.id)}`,
        {
          method: "PATCH",
          body: {
            clearance: {
              [key]: !activeExit.clearance?.[key],
            },
          },
        }
      );

      setExits((current) =>
        current.map((item) => (item.id === result.data.id ? result.data : item))
      );
      setFeedback(result?.message || "Exit clearance updated.");
    } catch (error) {
      setFeedback(error?.message || "Unable to update exit clearance.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelExit() {
    if (!activeExit) return;

    const reason = String(cancellationReason || "").trim();

    if (!reason) {
      setFeedback("A cancellation reason is required.");
      return;
    }

    if (
      !window.confirm(
        `Cancel exit processing for ${nameOf(
          activeExit.employee
        )}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setFeedback("");

    try {
      const result = await apiRequest(
        `/api/exits/${encodeURIComponent(activeExit.id)}/cancel`,
        {
          method: "POST",
          body: {
            cancellationReason: reason,
          },
        }
      );

      setCancellationReason("");
      setFeedback(
        result?.message ||
          "Exit processing cancelled successfully."
      );

      await loadData();
      navigate("/employees/directory");
    } catch (error) {
      setFeedback(
        error?.message ||
          "Unable to cancel exit processing."
      );
    } finally {
      setBusy(false);
    }
  }

  async function completeExit() {
    if (!activeExit) return;

    if (
      !window.confirm(
        `Complete the exit for ${nameOf(activeExit.employee)}? The employee will move to Exits.`
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiRequest(
        `/api/exits/${encodeURIComponent(activeExit.id)}/complete`,
        { method: "POST" }
      );

      setFeedback(result?.message || "Employee exit completed.");
      await loadData();
      navigate("/employees/exits");
    } catch (error) {
      setFeedback(error?.message || "Unable to complete employee exit.");
    } finally {
      setBusy(false);
    }
  }

  async function processRehire(event) {
    event.preventDefault();
    if (!rehireEmployee) return;

    setBusy(true);
    setFeedback("");

    try {
      const result = await apiRequest(
        `/api/employees/${encodeURIComponent(rehireEmployee.employeeNumber)}/rehire`,
        {
          method: "PATCH",
          body: rehireForm,
        }
      );

      setFeedback(result?.message || "Employee rehired successfully.");
      setRehireForm(EMPTY_REHIRE);
      await loadData();
      navigate("/employees/exits");
    } catch (error) {
      setFeedback(error?.message || "Unable to rehire employee.");
    } finally {
      setBusy(false);
    }
  }

  function setSettlementField(name, value) {
    setSettlementForm((current) => ({ ...current, [name]: value }));
  }

  async function approveHeadHrSettlement() {
    if (!settlementExitId) return;
    setBusy(true);
    setFeedback("");
    try {
      let current = settlement;
      if (current?.status === "CALCULATED") {
        const submitted = await apiRequest(
          `/api/exits/${encodeURIComponent(settlementExitId)}/settlement/submit`,
          { method: "POST" }
        );
        current = submitted?.data || current;
      }
      if (current?.status !== "PENDING_APPROVAL") {
        throw new Error("Calculate the settlement before Head HR approval.");
      }
      const approved = await apiRequest(
        `/api/exits/${encodeURIComponent(settlementExitId)}/settlement/approve`,
        { method: "POST", body: { notes: settlementDecisionNotes } }
      );
      setSettlement(approved?.data || null);
      setSettlementDecisionNotes("");
      setFeedback("Employee Exit Settlement Account approved by Head HR and ready for printing.");
      await loadData();
    } catch (error) {
      setFeedback(error?.message || "Unable to approve the exit settlement.");
    } finally {
      setBusy(false);
    }
  }

  async function runSettlementAction(action, body) {
    if (!settlementExitId) return;
    setBusy(true);
    setFeedback("");
    try {
      const result = await apiRequest(
        `/api/exits/${encodeURIComponent(settlementExitId)}/settlement/${action}`,
        { method: "POST", ...(body === undefined ? {} : { body }) }
      );
      setSettlement(result?.data || null);
      const actionLabel = action === "calculate" ? "calculated" : action === "submit" ? "submitted" : action === "approve" ? "approved" : "waived";
      setFeedback(`Exit settlement ${actionLabel} successfully.`);
      if (["approve", "payment", "waive"].includes(action)) await loadData();
      if (["approve", "waive"].includes(action)) setSettlementDecisionNotes("");
    } catch (error) {
      setFeedback(error?.message || "Unable to update the exit settlement.");
    } finally {
      setBusy(false);
    }
  }

  function calculateExitSettlement(event) {
    event.preventDefault();
    const amountFields = [
      "bonusGift",
      "noticePayDays",
      "previousSalaryShortPaid",
      "noticeDeductionDays",
      "unreturnedUniform",
      "previousSalaryOverpaid",
    ];
    const body = { ...settlementForm };
    for (const key of amountFields) body[key] = Number(body[key] || 0);
    runSettlementAction("calculate", body);
  }

  if (settlementExitId) {
    const snapshot = settlement?.calculationSnapshot || {};
    const accountEmployee = settlementPreview?.employee || snapshot.employee || null;
    const accountExit = settlementPreview?.exit || snapshot.exit || null;
    const accountSalary = settlementPreview?.salary || snapshot.salary || null;
    const accountCredits = settlementPreview?.credits || Object.fromEntries(
      Object.entries(snapshot.creditItems || {}).map(([key, item]) => [key, Number(item?.amount || 0)])
    );
    const accountDebits = settlementPreview?.debits || Object.fromEntries(
      Object.entries(snapshot.debitItems || {}).map(([key, item]) => [key, Number(item?.amount || 0)])
    );
    const accountTotals = settlementPreview?.totals || snapshot.totals || {
      totalCredits: Number(settlement?.grossPayable || 0),
      totalDebits: Number(settlement?.totalRecovery || 0),
      netSettlement: Number(settlement?.netSettlement || 0),
    };
    return (
      <div className="employee-exit-settlement-page">
        <PageHero
          eyebrow="EXIT FINANCIAL CLOSURE"
          title="Exit Settlement"
          subtitle="Calculate, independently approve and close the employee's financial settlement without delaying the HR-effective exit."
          action={<button type="button" onClick={() => navigate("/employees/exits")} style={secondaryButton}><FaArrowLeft /> Exit Register</button>}
        />

        {feedback ? <div style={feedbackStyle}>{feedback}</div> : null}
        {loading ? <div style={panel}>Loading settlement workflow...</div> : !settlementExit ? <div style={warning}>The completed exit could not be found.</div> : (
          <div style={twoColumn}>
            <EmployeeCard employee={settlementExit} />
            <section style={panel}>
              <div style={sectionHeader}>
                <div><div style={eyebrow}>FINANCIAL STATUS</div><h2 style={sectionTitle}>{titleCase(settlementExit.exitProcess?.financialStatus || "PENDING")}</h2></div>
                {settlement ? <span style={countBadge}>{titleCase(settlement.status)}</span> : null}
              </div>

              {accountEmployee && accountExit ? (
                <section style={exitAccountMeta}>
                  <div><span style={metaLabel}>Employee</span><strong>{accountEmployee.employeeNumber} · {accountEmployee.employeeName}</strong></div>
                  <div><span style={metaLabel}>Designation</span><strong>{accountEmployee.designation || "—"}</strong></div>
                  <div><span style={metaLabel}>Department</span><strong>{accountEmployee.department || "—"}</strong></div>
                  <div><span style={metaLabel}>Cost Centre</span><strong>{accountEmployee.costCentreCode ? `${accountEmployee.costCentreCode} · ${accountEmployee.costCentre || ""}` : (accountEmployee.costCentre || "—")}</strong></div>
                  <div><span style={metaLabel}>Branch</span><strong>{accountEmployee.branchCode || accountEmployee.branch || "—"}</strong></div>
                  <div><span style={metaLabel}>Employment Type</span><strong>{accountEmployee.employmentType || "—"}</strong></div>
                  <div><span style={metaLabel}>Exit Type</span><strong>{titleCase(accountExit.exitType)}</strong></div>
                  <div><span style={metaLabel}>Final Working Day</span><strong>{dateText(accountExit.lastWorkingDay)}</strong></div>
                  <div style={full}><span style={metaLabel}>Exit Reason</span><strong>{accountExit.reason || "—"}</strong></div>
                  {accountSalary ? <div style={full}><span style={metaLabel}>Settlement Salary Basis</span><strong>{moneyText(accountSalary.monthlyGross, accountSalary.currency)} monthly gross · Daily rate {moneyText(accountSalary.dayRate, accountSalary.currency)} · Hourly rate {moneyText(accountSalary.hourRate, accountSalary.currency)}</strong></div> : null}
                </section>
              ) : null}

              {!settlement || ["DRAFT", "CALCULATED", "DISPUTED"].includes(settlement.status) ? (
                <form onSubmit={calculateExitSettlement}>
                  <div style={accountColumns}>
                    <SettlementAccountSection title="CREDIT" tone="credit">
                      <SettlementLine label="Gratuity / EoSB" value={accountCredits?.gratuityEosb} currency={accountSalary?.currency} source="System · EoSB Account" />
                      <SettlementLine label="Full / Prorated Annual Leave Allowance" value={accountCredits?.annualLeaveAllowance} currency={accountSalary?.currency} source="System · Leave Allowance formula" />
                      <SettlementLine label="Full / Prorated Outstanding Salary" value={accountCredits?.outstandingSalary} currency={accountSalary?.currency} source="System · Payroll to exit date" />
                      <SettlementLine label="Public Holiday Days" value={accountCredits?.publicHolidayDays} currency={accountSalary?.currency} source="System · Recorded payroll rule" />
                      <SettlementLine label="Extra Day Work Overtime" value={accountCredits?.extraDayOvertime} currency={accountSalary?.currency} source="System · Recorded payroll rule" />
                      <SettlementLine label="Extra Hours Work Overtime" value={accountCredits?.extraHoursOvertime} currency={accountSalary?.currency} source="System · Recorded payroll rule" />
                      <SettlementInputLine label="Bonus / Gift" value={settlementForm.bonusGift} onChange={(value) => setSettlementField("bonusGift", value)} amount={accountCredits?.bonusGift} currency={accountSalary?.currency} />
                      <SettlementInputLine label="In Lieu of Notice Pay" inputLabel="Days" value={settlementForm.noticePayDays} onChange={(value) => setSettlementField("noticePayDays", value)} amount={accountCredits?.noticePay} currency={accountSalary?.currency} />
                      <SettlementInputLine label="Previous Salary Short Paid" value={settlementForm.previousSalaryShortPaid} onChange={(value) => setSettlementField("previousSalaryShortPaid", value)} amount={accountCredits?.previousSalaryShortPaid} currency={accountSalary?.currency} />
                    </SettlementAccountSection>

                    <SettlementAccountSection title="DEBIT" tone="debit">
                      <SettlementLine label="Loan Balance" value={accountDebits?.loanBalance} currency={accountSalary?.currency} source="System · Loan Account" />
                      <SettlementLine label="Salary Advance" value={accountDebits?.salaryAdvance} currency={accountSalary?.currency} source="System · Salary Advance Account" />
                      <SettlementInputLine label="In Lieu of Notice Deduction" inputLabel="Deficient Days" value={settlementForm.noticeDeductionDays} onChange={(value) => setSettlementField("noticeDeductionDays", value)} amount={accountDebits?.noticeDeduction} currency={accountSalary?.currency} />
                      <SettlementInputLine label="Unreturned Uniform" value={settlementForm.unreturnedUniform} onChange={(value) => setSettlementField("unreturnedUniform", value)} amount={accountDebits?.unreturnedUniform} currency={accountSalary?.currency} />
                      <SettlementInputLine label="Previous Salary Overpaid" value={settlementForm.previousSalaryOverpaid} onChange={(value) => setSettlementField("previousSalaryOverpaid", value)} amount={accountDebits?.previousSalaryOverpaid} currency={accountSalary?.currency} />
                    </SettlementAccountSection>
                  </div>

                  <div style={settlementSummary}>
                    <Info label="Total Credits" value={moneyText(accountTotals?.totalCredits, accountSalary?.currency || settlement?.currency)} />
                    <Info label="Total Debits" value={moneyText(accountTotals?.totalDebits, accountSalary?.currency || settlement?.currency)} />
                    <Info label="Net Exit Settlement" value={moneyText(accountTotals?.netSettlement, accountSalary?.currency || settlement?.currency)} />
                  </div>

                  <div style={{ ...full, marginTop: 14 }}><Field label="Calculation Notes"><textarea value={settlementForm.notes} onChange={(event) => setSettlementField("notes", event.target.value)} style={textarea} /></Field></div>
                  <div style={footer}><span style={muted}>System-derived items are locked and pulled from CHRiS source accounts/rules. Only HR-designated settlement inputs are editable.</span><button type="submit" style={primaryButton} disabled={!canUpdate || busy || !settlementPreview}>{busy ? "Calculating..." : "Calculate Exit Settlement Account"}</button></div>
                </form>
              ) : null}

              {settlement ? (
                <div style={{ marginTop: 18 }}>
                  <div style={settlementSummary}>
                    <Info label="Gross Payable" value={moneyText(settlement.grossPayable, settlement.currency)} />
                    <Info label="Total Recovery" value={moneyText(settlement.totalRecovery, settlement.currency)} />
                    <Info label="Net Settlement" value={moneyText(settlement.netSettlement, settlement.currency)} />
                    <Info label="Amount Paid / Recovered" value={moneyText(settlement.amountPaid, settlement.currency)} />
                  </div>
                  {["CALCULATED", "PENDING_APPROVAL"].includes(settlement.status) ? (
                    <div style={settlementAction}>
                      <Field label="Head HR Approval Notes"><textarea value={settlementDecisionNotes} onChange={(event) => setSettlementDecisionNotes(event.target.value)} style={textarea} /></Field>
                      <button type="button" style={primaryButton} disabled={!canManagePayroll || busy} onClick={approveHeadHrSettlement}>Approve & Prepare for Print</button>
                      {settlement.status === "PENDING_APPROVAL" ? <button type="button" style={dangerButton} disabled={!canManagePayroll || busy || !settlementDecisionNotes.trim()} onClick={() => runSettlementAction("waive", { reason: settlementDecisionNotes })}>Waive with Reason</button> : null}
                    </div>
                  ) : null}
                  {["PAYMENT_PENDING", "PARTIALLY_PAID"].includes(settlement.status) ? (
                    <div style={settlementAction}>
                      <div style={closureNotice}>Head HR approval is complete. Auditor review, GM payout approval and Accounts Team payout processing are completed externally on the printed settlement document.</div>
                      <button type="button" className="exit-settlement-print-button" style={primaryButton} onClick={() => window.print()}><FaPrint /> Print Settlement Account</button>
                    </div>
                  ) : null}
                  {["APPROVED", "PAYMENT_PENDING"].includes(settlement.status) ? <div style={settlementAction}><Field label="Waiver Reason"><textarea value={settlementDecisionNotes} onChange={(event) => setSettlementDecisionNotes(event.target.value)} style={textarea} /></Field><button type="button" style={dangerButton} disabled={!canManagePayroll || busy || !settlementDecisionNotes.trim()} onClick={() => runSettlementAction("waive", { reason: settlementDecisionNotes })}>Waive Settlement</button></div> : null}
                  {["PAID", "WAIVED"].includes(settlement.status) ? <div style={closureNotice}>Financial closure complete. The HR-effective exit date and employment history remain unchanged.</div> : null}

                  {settlement.status !== "WAIVED" ? (
                    <section className="exit-settlement-print-document">
                      <PrintableReportHeader
                        reportTitle="Employee Exit Settlement Account"
                        scopeLabel={accountEmployee ? `${accountEmployee.employeeNumber} · ${accountEmployee.employeeName}` : "Employee Exit Settlement"}
                      />

                      <div className="exit-settlement-print-meta">
                        <div><span>Employee No.</span><strong>{accountEmployee?.employeeNumber || "—"}</strong></div>
                        <div><span>Employee Name</span><strong>{accountEmployee?.employeeName || "—"}</strong></div>
                        <div><span>Designation</span><strong>{accountEmployee?.designation || "—"}</strong></div>
                        <div><span>Department</span><strong>{accountEmployee?.department || "—"}</strong></div>
                        <div><span>Cost Centre</span><strong>{accountEmployee?.costCentreCode ? `${accountEmployee.costCentreCode} · ${accountEmployee.costCentre || ""}` : (accountEmployee?.costCentre || "—")}</strong></div>
                        <div><span>Branch</span><strong>{accountEmployee?.branch || "—"}</strong></div>
                        <div><span>Exit Type</span><strong>{titleCase(accountExit?.exitType)}</strong></div>
                        <div><span>Final Working Day</span><strong>{dateText(accountExit?.lastWorkingDay)}</strong></div>
                        <div className="exit-settlement-print-meta-wide"><span>Exit Reason</span><strong>{accountExit?.reason || "—"}</strong></div>
                      </div>

                      <div className="exit-settlement-print-account">
                        <PrintableSettlementTable
                          title="CREDIT — EMPLOYEE ENTITLEMENTS"
                          items={[
                            ["Gratuity / EoSB", accountCredits?.gratuityEosb],
                            ["Full / Prorated Annual Leave Allowance", accountCredits?.annualLeaveAllowance],
                            ["Full / Prorated Outstanding Salary", accountCredits?.outstandingSalary],
                            ["Public Holiday Days", accountCredits?.publicHolidayDays],
                            ["Extra Day Work Overtime", accountCredits?.extraDayOvertime],
                            ["Extra Hours Work Overtime", accountCredits?.extraHoursOvertime],
                            ["Bonus / Gift", accountCredits?.bonusGift],
                            ["In Lieu of Notice Pay", accountCredits?.noticePay],
                            ["Previous Salary Short Paid", accountCredits?.previousSalaryShortPaid],
                          ]}
                          currency={accountSalary?.currency || settlement.currency}
                        />
                        <PrintableSettlementTable
                          title="DEBIT — EMPLOYEE RECOVERIES"
                          items={[
                            ["Loan Balance", accountDebits?.loanBalance],
                            ["Salary Advance", accountDebits?.salaryAdvance],
                            ["In Lieu of Notice Deduction", accountDebits?.noticeDeduction],
                            ["Unreturned Uniform", accountDebits?.unreturnedUniform],
                            ["Previous Salary Overpaid", accountDebits?.previousSalaryOverpaid],
                          ]}
                          currency={accountSalary?.currency || settlement.currency}
                        />
                      </div>

                      <div className="exit-settlement-print-totals">
                        <div><span>Total Credits</span><strong>{moneyText(accountTotals?.totalCredits, accountSalary?.currency || settlement.currency)}</strong></div>
                        <div><span>Total Debits</span><strong>{moneyText(accountTotals?.totalDebits, accountSalary?.currency || settlement.currency)}</strong></div>
                        <div className="net"><span>Net Exit Settlement</span><strong>{moneyText(accountTotals?.netSettlement, accountSalary?.currency || settlement.currency)}</strong></div>
                      </div>

                      <section className="exit-settlement-headhr-approval">
                        <h3>Internal CHRiS Approval</h3>
                        <div className="exit-settlement-headhr-line">
                          <div><span>Prepared & Approved By</span><strong>Head, Human Resources</strong></div>
                          <div><span>CHRiS Status</span><strong>{titleCase(settlement.status)}</strong></div>
                          <div><span>Approval Date</span><strong>{dateText(settlement.approvedAt || settlement.calculatedAt)}</strong></div>
                        </div>
                      </section>

                      <section className="exit-settlement-external-workflow">
                        <div className="exit-settlement-external-title">
                          <h3>External Signatory Workflow</h3>
                          <p>To be completed outside CHRiS after Head HR approval and printing.</p>
                        </div>
                        <div className="exit-settlement-signatory-grid">
                          <ExternalSignatoryBlock
                            step="1"
                            title="Auditor Review"
                            fields={["Auditor Name", "Signature", "Date", "Review Remarks"]}
                          />
                          <ExternalSignatoryBlock
                            step="2"
                            title="GM Payout Approval"
                            fields={["General Manager Name", "Signature", "Date", "Approval / Remarks"]}
                          />
                          <ExternalSignatoryBlock
                            step="3"
                            title="Accounts Team Payout Processing"
                            fields={["Processed By", "Signature", "Processing Date", "Payment Reference / Voucher No."]}
                          />
                        </div>
                      </section>

                      <PrintableReportFooter generatedAt={settlement.approvedAt || settlement.calculatedAt} />
                    </section>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    );
  }

  if (employeeNumber) {
    return (
      <div>
        <PageHero
          eyebrow="EMPLOYEE LIFECYCLE"
          title="Process Employee Exit"
          subtitle="Complete the exit workflow for the employee selected from Employee Directory."
          action={
            <button type="button" onClick={() => navigate("/employees/directory")} style={secondaryButton}>
              <FaArrowLeft /> Employee Directory
            </button>
          }
        />

        {feedback ? <div style={feedbackStyle}>{feedback}</div> : null}

        {loading ? (
          <div style={panel}>Loading employee exit workflow...</div>
        ) : !selectedEmployee ? (
          <div style={warning}>Selected employee could not be found.</div>
        ) : (
          <div style={twoColumn}>
            <EmployeeCard employee={selectedEmployee} />

            <section style={panel}>
              {!activeExit ? (
                <>
                  <div style={eyebrow}>EXIT INITIATION</div>
                  <h2 style={sectionTitle}>Separation Details</h2>

                  <form onSubmit={initiateExit} style={formGrid}>
                    <Field label="Exit Type">
                      <select value={exitForm.exitType} onChange={(e) => setExitField("exitType", e.target.value)} style={input}>
                        {EXIT_TYPES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Notice Date">
                      <input type="date" value={exitForm.noticeDate} onChange={(e) => setExitField("noticeDate", e.target.value)} style={input} />
                    </Field>

                    <Field label="Notice Status">
                      <select value={exitForm.noticeStatus} onChange={(e) => setExitField("noticeStatus", e.target.value)} style={input}>
                        {NOTICE_STATUSES.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Last Working Day">
                      <input type="date" value={exitForm.lastWorkingDay} onChange={(e) => setExitField("lastWorkingDay", e.target.value)} style={input} required />
                    </Field>

                    <div style={full}>
                      <Field label="Exit Reason">
                        <textarea value={exitForm.reason} onChange={(e) => setExitField("reason", e.target.value)} style={textarea} required />
                      </Field>
                    </div>

                    <div style={full}>
                      <Field label="HR Notes">
                        <textarea value={exitForm.notes} onChange={(e) => setExitField("notes", e.target.value)} style={textarea} />
                      </Field>
                    </div>

                    <div style={footer}>
                      <span style={muted}>
                        Initiating the exit does not remove the employee. Complete clearance below before final exit.
                      </span>
                      <button type="submit" disabled={busy || !canUpdate} style={primaryButton}>
                        <FaSignOutAlt /> {busy ? "Saving..." : "Initiate Exit"}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div style={eyebrow}>EXIT CLEARANCE</div>
                  <h2 style={sectionTitle}>Complete Separation Workflow</h2>

                  <div style={processMeta}>
                    <span>Exit Type: <strong>{titleCase(activeExit.exitType)}</strong></span>
                    <span>Last Working Day: <strong>{dateText(activeExit.lastWorkingDay)}</strong></span>
                    <span>Process: <strong>{titleCase(activeExit.status)}</strong></span>
                  </div>

                  <div style={clearanceGrid}>
                    {CLEARANCE_ITEMS.map(([key, label]) => (
                      <label key={key} style={clearanceItem}>
                        <input
                          type="checkbox"
                          checked={Boolean(activeExit.clearance?.[key])}
                          onChange={() => toggleClearance(key)}
                          disabled={busy || !canUpdate}
                          style={{ accentColor: "#087A43" }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <Field label="Cancellation Reason">
                      <textarea
                        value={cancellationReason}
                        onChange={(event) =>
                          setCancellationReason(event.target.value)
                        }
                        placeholder="Enter the reason if this exit process is being cancelled."
                        style={textarea}
                        disabled={busy || !canUpdate}
                      />
                    </Field>
                    <div style={{ ...muted, marginTop: 7 }}>
                      Required only when cancelling the exit process. The reason is retained in the exit audit record.
                    </div>
                  </div>

<div style={footer}>
  <span style={muted}>
    All six clearance items must be complete before CHRIS closes the employment episode.
  </span>

  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 10,
      flexWrap: "wrap",
    }}
  >
    <button
      type="button"
      onClick={cancelExit}
      disabled={
        busy ||
        !canUpdate ||
        !String(cancellationReason || "").trim()
      }
      style={{
        ...secondaryButton,
        opacity:
          String(cancellationReason || "").trim()
            ? 1
            : 0.45,
        minHeight: 42,
        borderColor: "rgba(239,68,68,.65)",
        background: "rgba(127,29,29,.20)",
        color: "#FCA5A5",
        fontWeight: 900,
      }}
    >
      Cancel Exit Processing
    </button>

    <button
      type="button"
      onClick={completeExit}
      disabled={
        busy ||
        !activeExit.clearanceComplete ||
        !canUpdate
      }
      style={{
        ...primaryButton,
        opacity:
          activeExit.clearanceComplete
            ? 1
            : 0.42,
      }}
    >
      <FaCheckCircle /> Complete Exit
    </button>
  </div>
</div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    );
  }

  if (rehireNumber) {
    return (
      <div>
        <PageHero
          eyebrow="EMPLOYEE LIFECYCLE"
          title="Rehire Employee"
          subtitle="Start a new employment episode while preserving the employee's permanent CHRIS identity and history."
          action={
            <button type="button" onClick={() => navigate("/employees/exits")} style={secondaryButton}>
              <FaArrowLeft /> Exited Employees
            </button>
          }
        />

        {feedback ? <div style={feedbackStyle}>{feedback}</div> : null}

        {loading ? (
          <div style={panel}>Loading rehire workflow...</div>
        ) : !rehireEmployee ? (
          <div style={warning}>Selected exited employee could not be found.</div>
        ) : (
          <div style={twoColumn}>
            <EmployeeCard employee={rehireEmployee} />

            <section style={panel}>
              <div style={eyebrow}>NEW EMPLOYMENT EPISODE</div>
              <h2 style={sectionTitle}>Rehire Details</h2>

              <form onSubmit={processRehire} style={formGrid}>
                <Field label="Employment Status">
                  <select value={rehireForm.status} onChange={(e) => setRehireField("status", e.target.value)} style={input}>
                    <option value="ACTIVE">Active</option>
                    <option value="PROBATION">Probation</option>
                  </select>
                </Field>

                <Field label="Effective Date">
                  <input type="date" value={rehireForm.effectiveDate} onChange={(e) => setRehireField("effectiveDate", e.target.value)} style={input} required />
                </Field>

                <Field label="Department">
                  <select value={rehireForm.departmentId} onChange={(e) => setRehireField("departmentId", e.target.value)} style={input} required>
                    <option value="">Select department</option>
                    {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>

                <Field label="Designation">
                  <select value={rehireForm.designationId} onChange={(e) => setRehireField("designationId", e.target.value)} style={input} required>
                    <option value="">Select designation</option>
                    {rehireDesignationOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>

                <Field label="Work Location">
                  <select value={rehireForm.locationId} onChange={(e) => setRehireField("locationId", e.target.value)} style={input} required>
                    <option value="">Select location</option>
                    {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>

                <div style={full}>
                  <Field label="Rehire Reason">
                    <textarea value={rehireForm.reason} onChange={(e) => setRehireField("reason", e.target.value)} style={textarea} required />
                  </Field>
                </div>

                <div style={full}>
                  <Field label="HR Notes">
                    <textarea value={rehireForm.notes} onChange={(e) => setRehireField("notes", e.target.value)} style={textarea} />
                  </Field>
                </div>

                <div style={footer}>
                  <span style={muted}>Rehire creates a new employment episode; previous exit history remains preserved.</span>
                  <button type="submit" disabled={busy || !canUpdate} style={primaryButton}>
                    <FaRedo /> {busy ? "Saving..." : "Rehire Employee"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    );
  }

  const settlementEmployees = exitedEmployees.filter((employee) => employee.exitProcess?.id);

  return (
    <div>
      <PageHero
        eyebrow="EMPLOYEE LIFECYCLE"
        title={exitSection === "settlements" ? "Employee Exit Settlement Account" : "Exited Employees"}
        subtitle={exitSection === "settlements"
          ? "Prepare, approve and print employee exit settlement accounts from one dedicated workspace."
          : "Current-state exit register for employees whose employment relationship has concluded."}
      />

      <div style={exitWorkspaceTabs}>
        <button
          type="button"
          style={exitSection === "register" ? exitWorkspaceTabActive : exitWorkspaceTab}
          onClick={() => navigate("/employees/exits")}
        >
          Exit Register
        </button>
        <button
          type="button"
          style={exitSection === "settlements" ? exitWorkspaceTabActive : exitWorkspaceTab}
          onClick={() => navigate("/employees/exits?section=settlements")}
        >
          Exit Settlement Account
          <span style={tabCountBadge}>{settlementEmployees.length}</span>
        </button>
      </div>

      {feedback ? <div style={feedbackStyle}>{feedback}</div> : null}

      {exitSection === "settlements" ? (
        <section style={panel}>
          <div style={sectionHeader}>
            <div>
              <div style={eyebrow}>FINANCIAL CLOSURE</div>
              <h2 style={sectionTitle}>Employee Exit Settlement Accounts</h2>
              <div style={muted}>Head HR prepares and approves in CHRiS. Auditor review, GM payout approval and Accounts payout processing continue externally on the printed document.</div>
            </div>
            <span style={countBadge}>
              {loading ? "..." : settlementEmployees.length} account{settlementEmployees.length === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? (
            <div style={empty}>Loading exit settlement accounts...</div>
          ) : settlementEmployees.length ? (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Employee</th>
                    <th style={th}>Department</th>
                    <th style={th}>Exit Type</th>
                    <th style={th}>Exit Date</th>
                    <th style={th}>Financial Status</th>
                    <th style={th}>Net Settlement</th>
                    <th style={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementEmployees.map((employee) => (
                    <tr key={employee.employeeId}>
                      <td style={td}>
                        <strong style={{ color: "#F7FAF8" }}>{nameOf(employee)}</strong>
                        <div style={muted}>{employee.employeeNumber}</div>
                      </td>
                      <td style={td}>{employee.department?.name || "-"}</td>
                      <td style={td}>{titleCase(employee.exitProcess?.exitType)}</td>
                      <td style={td}>{dateText(employee.exitProcess?.effectiveDate || employee.exitDate)}</td>
                      <td style={td}><strong>{titleCase(employee.exitProcess?.financialStatus || "NOT_STARTED")}</strong></td>
                      <td style={td}>
                        {employee.exitProcess?.settlement
                          ? moneyText(employee.exitProcess.settlement.netSettlement, employee.exitProcess.settlement.currency)
                          : "Not calculated"}
                      </td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => navigate(`/employees/exits?settlement=${encodeURIComponent(employee.exitProcess.id)}`)}
                          style={primaryButton}
                        >
                          Open Settlement Account
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={empty}>No exited employee currently has an exit process available for settlement.</div>
          )}
        </section>
      ) : (
      <section style={panel}>
        <div style={sectionHeader}>
          <div>
            <div style={eyebrow}>EXIT REGISTER</div>
            <h2 style={sectionTitle}>Exited Employee Records</h2>
          </div>
          <span style={countBadge}>
            {loading ? "..." : exitedEmployees.length} record{exitedEmployees.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <div style={empty}>Loading exited employees...</div>
        ) : exitedEmployees.length ? (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Employee</th>
                  <th style={th}>Department</th>
                  <th style={th}>Designation</th>
                  <th style={th}>Location</th>
                  <th style={th}>Status</th>
                  <th style={th}>Exit Date</th>
                  <th style={th}>Exit Workflow</th>
                  <th style={th}>Financial Closure</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {exitedEmployees.map((employee) => (
                  <tr key={employee.employeeId}>
                    <td style={td}>
                      <strong style={{ color: "#F7FAF8" }}>{nameOf(employee)}</strong>
                      <div style={muted}>{employee.employeeNumber}</div>
                    </td>
                    <td style={td}>{employee.department?.name || "-"}</td>
                    <td style={td}>{employee.designation?.name || "-"}</td>
                    <td style={td}>{employee.location?.name || "-"}</td>
                    <td style={td}><EmployeeStatusBadge status={employee.status} /></td>
                    <td style={td}>{dateText(employee.exitProcess?.effectiveDate || employee.exitDate)}</td>
                    <td style={td}>{employee.exitProcess ? `${titleCase(employee.exitProcess.status)} · ${titleCase(employee.exitProcess.exitType)}` : "Not recorded"}</td>
                    <td style={td}>
                      <strong>{titleCase(employee.exitProcess?.financialStatus || "NOT_STARTED")}</strong>
                      {employee.exitProcess?.settlement ? <div style={muted}>{moneyText(employee.exitProcess.settlement.netSettlement, employee.exitProcess.settlement.currency)} net</div> : null}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                        {employee.exitProcess?.id ? <button type="button" onClick={() => navigate(`/employees/exits?settlement=${encodeURIComponent(employee.exitProcess.id)}`)} style={rehireButton}>Settlement</button> : null}
                        <button type="button" onClick={() => navigate(`/employees/exits?rehire=${encodeURIComponent(employee.employeeNumber)}`)} style={rehireButton} disabled={!canUpdate}><FaRedo /> Rehire</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={empty}>No exited employee records yet.</div>
        )}
      </section>
      )}
    </div>
  );
}

function PageHero({ eyebrow: kicker, title, subtitle, action }) {
  return (
    <div style={hero}>
      <div>
        <div style={eyebrow}>{kicker}</div>
        <h1 style={pageTitle}>{title}</h1>
        <p style={subtitleStyle}>{subtitle}</p>
      </div>
      {action || null}
    </div>
  );
}

function EmployeeCard({ employee }) {
  return (
    <section style={employeeCard}>
      <div style={eyebrow}>SELECTED EMPLOYEE</div>
      <h2 style={employeeNameStyle}>{nameOf(employee)}</h2>
      <div style={employeeNumberStyle}>{employee.employeeNumber}</div>
      <div style={divider} />
      <Info label="Department" value={employee.department?.name || "-"} />
      <Info label="Designation" value={employee.designation?.name || "-"} />
      <Info label="Location" value={employee.location?.name || "-"} />
      <Info label="Current Status" value={titleCase(employee.status)} />
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div style={infoRow}>
      <span style={muted}>{label}</span>
      <strong style={infoValue}>{value}</strong>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={field}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function PrintableSettlementTable({ title, items, currency = "NGN" }) {
  return (
    <section className="exit-settlement-print-table-section">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr><th>Settlement Item</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {items.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{moneyText(value, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ExternalSignatoryBlock({ step, title, fields }) {
  return (
    <section className="exit-settlement-signatory-block">
      <div className="exit-settlement-signatory-heading">
        <span>{step}</span>
        <strong>{title}</strong>
      </div>
      {fields.map((field) => (
        <div className="exit-settlement-sign-line" key={field}>
          <span>{field}</span>
          <div />
        </div>
      ))}
    </section>
  );
}

function SettlementAccountSection({ title, tone, children }) {
  return (
    <section style={tone === "credit" ? settlementCreditCard : settlementDebitCard}>
      <div style={settlementAccountHeader}>
        <span>{title}</span>
        <span>{tone === "credit" ? "Employee Entitlements" : "Employee Recoveries"}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}

function SettlementLine({ label, value, currency = "NGN", source }) {
  return (
    <div style={settlementLine}>
      <div>
        <strong style={settlementLineLabel}>{label}</strong>
        {source ? <span style={settlementLineSource}>{source}</span> : null}
      </div>
      <strong style={settlementLineAmount}>{moneyText(value, currency)}</strong>
    </div>
  );
}

function SettlementInputLine({
  label,
  inputLabel = "Amount",
  value,
  onChange,
  amount,
  currency = "NGN",
}) {
  return (
    <div style={settlementInputLine}>
      <div>
        <strong style={settlementLineLabel}>{label}</strong>
        <span style={settlementLineSource}>HR Entry · {inputLabel}</span>
      </div>
      <div style={settlementInputValue}>
        <input
          type="number"
          min="0"
          step={inputLabel.toLowerCase().includes("day") ? "0.5" : "0.01"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={settlementMiniInput}
          aria-label={`${label} ${inputLabel}`}
        />
        <strong style={settlementLineAmount}>{moneyText(amount, currency)}</strong>
      </div>
    </div>
  );
}

const exitAccountMeta = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))",
  gap: 10,
  padding: 14,
  marginBottom: 16,
  border: "1px solid rgba(212,175,55,.20)",
  borderRadius: 13,
  background: "rgba(255,255,255,.025)",
};

const metaLabel = {
  display: "block",
  marginBottom: 4,
  color: "#8EA89A",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: ".05em",
  textTransform: "uppercase",
};

const accountColumns = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))",
  gap: 14,
};

const settlementCreditCard = {
  border: "1px solid rgba(46,233,139,.28)",
  borderRadius: 14,
  overflow: "hidden",
  background: "rgba(5,48,30,.62)",
};

const settlementDebitCard = {
  border: "1px solid rgba(212,175,55,.32)",
  borderRadius: 14,
  overflow: "hidden",
  background: "rgba(38,31,8,.30)",
};

const settlementAccountHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  padding: "11px 13px",
  background: "rgba(0,0,0,.20)",
  color: "#F7FAF8",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: ".06em",
};

const settlementLine = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "11px 13px",
  borderBottom: "1px solid rgba(255,255,255,.055)",
};

const settlementInputLine = {
  ...settlementLine,
  alignItems: "flex-end",
};

const settlementLineLabel = {
  display: "block",
  color: "#F1F8F4",
  fontSize: 11,
};

const settlementLineSource = {
  display: "block",
  marginTop: 3,
  color: "#8EA89A",
  fontSize: 8.5,
};

const settlementLineAmount = {
  color: "#F6D35D",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const settlementInputValue = {
  display: "grid",
  justifyItems: "end",
  gap: 5,
};

const settlementMiniInput = {
  width: 120,
  padding: "7px 8px",
  borderRadius: 8,
  border: "1px solid rgba(212,175,55,.30)",
  background: "#061F15",
  color: "#F7FAF8",
  outline: "none",
  textAlign: "right",
};

const exitWorkspaceTabs = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 16,
  padding: 7,
  border: "1px solid rgba(212,175,55,.20)",
  borderRadius: 12,
  background: "rgba(5,40,26,.58)",
};

const exitWorkspaceTab = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 13px",
  borderRadius: 9,
  border: "1px solid rgba(212,175,55,.18)",
  background: "rgba(255,255,255,.025)",
  color: "#A9BDB2",
  fontWeight: 800,
  cursor: "pointer",
};

const exitWorkspaceTabActive = {
  ...exitWorkspaceTab,
  borderColor: "#D4AF37",
  background: "linear-gradient(145deg,rgba(8,122,67,.30),rgba(4,48,29,.82))",
  color: "#F6D35D",
};

const tabCountBadge = {
  display: "inline-grid",
  placeItems: "center",
  minWidth: 22,
  height: 22,
  padding: "0 6px",
  borderRadius: 999,
  background: "rgba(212,175,55,.14)",
  color: "#F6D35D",
  fontSize: 10,
  fontWeight: 900,
};

const hero = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 18,
  padding: "24px 26px",
  marginBottom: 20,
  border: "1px solid rgba(212,175,55,.46)",
  borderRadius: 20,
  background:
    "radial-gradient(circle at 88% 10%,rgba(212,175,55,.12),transparent 28%),radial-gradient(circle at 8% 0%,rgba(46,233,139,.11),transparent 30%),linear-gradient(145deg,#063722,#02170f)",
  boxShadow: "0 20px 50px rgba(0,0,0,.28)",
};

const eyebrow = {
  color: "var(--chris-gold)",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: ".13em",
  marginBottom: 6,
};

const pageTitle = {
  margin: 0,
  color: "#F7FAF8",
  fontSize: 31,
  fontWeight: 900,
};

const subtitleStyle = {
  margin: "8px 0 0",
  color: "#C7D3CC",
  fontSize: 14,
  lineHeight: 1.6,
};

const twoColumn = {
  display: "grid",
  gridTemplateColumns: "minmax(260px,.72fr) minmax(0,1.6fr)",
  gap: 18,
};

const panel = {
  padding: 20,
  border: "1px solid rgba(212,175,55,.30)",
  borderRadius: 18,
  background: "linear-gradient(145deg,rgba(4,36,23,.94),rgba(2,19,13,.96))",
  boxShadow: "0 18px 42px rgba(0,0,0,.22)",
};

const employeeCard = {
  ...panel,
  alignSelf: "start",
  background: "linear-gradient(160deg,rgba(6,55,34,.98),rgba(2,23,15,.98))",
};

const employeeNameStyle = { margin: "10px 0 0", color: "#F7FAF8", fontSize: 22, fontWeight: 900 };
const employeeNumberStyle = { marginTop: 4, color: "#AFC0B7", fontSize: 12, fontWeight: 700 };
const divider = { height: 1, margin: "18px 0", background: "rgba(212,175,55,.18)" };
const infoRow = { display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.035)" };
const infoValue = { color: "#F4F7F5", fontSize: 12, textAlign: "right" };
const sectionTitle = { margin: 0, color: "#F7FAF8", fontSize: 20, fontWeight: 900 };
const sectionHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 };
const countBadge = { padding: "7px 10px", border: "1px solid rgba(212,175,55,.25)", borderRadius: 999, color: "#C7D3CC", fontSize: 11, fontWeight: 800 };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14, marginTop: 18 };
const full = { gridColumn: "1 / -1" };
const field = { display: "grid", gap: 7 };
const fieldLabel = { color: "#B8C7BF", fontSize: 11, fontWeight: 850 };
const input = { width: "100%", minHeight: 43, boxSizing: "border-box", border: "1px solid rgba(212,175,55,.20)", borderRadius: 9, outline: "none", background: "#061A11", color: "#F5F7F6", padding: "0 12px", fontSize: 13 };
const textarea = { ...input, minHeight: 92, padding: 12, resize: "vertical", lineHeight: 1.5 };
const footer = { gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, marginTop: 16 };
const muted = { color: "#8FA298", fontSize: 11, lineHeight: 1.55 };
const primaryButton = { minHeight: 42, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 16px", border: "1px solid var(--chris-gold)", borderRadius: 9, background: "linear-gradient(135deg,#D4AF37,#C59A22)", color: "#08140E", fontSize: 12, fontWeight: 900, cursor: "pointer" };
const secondaryButton = { minHeight: 42, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 15px", border: "1px solid rgba(212,175,55,.65)", borderRadius: 10, background: "rgba(212,175,55,.06)", color: "var(--chris-gold)", fontWeight: 850, cursor: "pointer" };
const feedbackStyle = { marginBottom: 16, padding: "12px 15px", border: "1px solid rgba(212,175,55,.35)", borderRadius: 10, background: "rgba(212,175,55,.07)", color: "#F5F7F6", fontSize: 13, fontWeight: 700 };
const warning = { padding: 16, border: "1px solid rgba(212,175,55,.30)", borderRadius: 12, background: "rgba(212,175,55,.07)", color: "#EDE5C8", fontSize: 13 };
const processMeta = { display: "flex", flexWrap: "wrap", gap: 14, margin: "16px 0", color: "#B8C7BF", fontSize: 12 };
const clearanceGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 };
const clearanceItem = { display: "flex", alignItems: "center", gap: 9, padding: 12, border: "1px solid rgba(212,175,55,.18)", borderRadius: 10, background: "rgba(255,255,255,.015)", color: "#E7EEEA", fontSize: 12, fontWeight: 700 };
const tableWrap = { overflowX: "auto", border: "1px solid rgba(255,255,255,.055)", borderRadius: 13 };
const table = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const th = { padding: "12px 14px", textAlign: "left", borderBottom: "1px solid rgba(212,175,55,.20)", background: "rgba(255,255,255,.025)", color: "#AFC0B7", fontSize: 10, fontWeight: 900, textTransform: "uppercase" };
const td = { padding: "13px 14px", borderBottom: "1px solid rgba(255,255,255,.045)", color: "#E5ECE8", fontSize: 12 };
const rehireButton = { minHeight: 34, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", border: "1px solid rgba(212,175,55,.45)", borderRadius: 8, background: "rgba(212,175,55,.07)", color: "var(--chris-gold)", fontWeight: 850, cursor: "pointer" };
const empty = { minHeight: 150, display: "grid", placeItems: "center", color: "#9FB0A7", fontSize: 13 };
const settlementSummary = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, padding: 15, border: "1px solid rgba(212,175,55,.18)", borderRadius: 12, background: "rgba(255,255,255,.015)" };
const settlementAction = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", alignItems: "end", gap: 10, marginTop: 16 };
const dangerButton = { ...primaryButton, borderColor: "rgba(239,68,68,.7)", background: "rgba(127,29,29,.24)", color: "#FCA5A5" };
const closureNotice = { marginTop: 16, padding: 13, border: "1px solid rgba(46,233,139,.35)", borderRadius: 10, background: "rgba(46,233,139,.08)", color: "#BAF7D7", fontSize: 12, fontWeight: 800 };
