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
  ["EXIT_SETTLEMENT_PAYMENT_PROOF", "Exit Settlement Payment Proof"],
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
  entitledNoticeDays: "",
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
    unreturnedUniform: String(hrInputs.unreturnedUniform || ""),
    previousSalaryOverpaid: String(hrInputs.previousSalaryOverpaid || ""),
    currency: record.currency || "NGN",
    notes: record.calculationSnapshot?.hrSupplementaryNote || "",
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

function calculateNoticePreview({ noticeDate, lastWorkingDay, entitledNoticeDays, noticeStatus }) {
  const required = Number(entitledNoticeDays || 0);
  const normalizedStatus = String(noticeStatus || "").toUpperCase();
  const waived = ["WAIVED", "NOT_REQUIRED"].includes(normalizedStatus);

  if (!noticeDate || !lastWorkingDay) {
    return {
      requiredDays: required,
      daysGiven: null,
      deficiencyDays: null,
      excessDays: null,
      waived,
    };
  }

  const start = new Date(noticeDate + "T00:00:00Z");
  const end = new Date(lastWorkingDay + "T00:00:00Z");
  const valid = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime());
  const daysGiven = valid && end > start
    ? Math.floor((end.getTime() - start.getTime()) / 86400000)
    : 0;

  return {
    requiredDays: required,
    daysGiven,
    deficiencyDays: waived ? 0 : Math.max(0, required - daysGiven),
    excessDays: Math.max(0, daysGiven - required),
    waived,
  };
}


function printExitSettlementDocument() {
  const source = document.querySelector(
    ".employee-exit-settlement-page .exit-settlement-print-document"
  );

  if (!source) {
    window.alert("The Employee Exit Settlement Account is not available for printing.");
    return;
  }

  const clone = source.cloneNode(true);
  clone.querySelectorAll(".chris-print-report-powered strong").forEach((node) => node.remove());

  // The calculation basis is stored as a full audit note. For the printed
  // settlement statement, remove the duplicate title/summary and lay out only
  // the active calculation lines in a compact two-column audit grid.
  const calculationPre = clone.querySelector(".exit-settlement-print-calculation-note pre");
  if (calculationPre) {
    const calculationLines = String(calculationPre.textContent || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line !== "CHRiS Exit Settlement Calculation Basis")
      .filter((line) => !line.startsWith("Total Credits:"));

    const calculationGrid = document.createElement("div");
    calculationGrid.className = "exit-settlement-print-calculation-grid";
    calculationLines.forEach((line) => {
      const item = document.createElement("div");
      item.textContent = line;
      calculationGrid.appendChild(item);
    });
    calculationPre.replaceWith(calculationGrid);
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Allow pop-ups to print or download the Employee Exit Settlement Account.");
    return;
  }

  const baseHref = window.location.origin + "/";
  const printCss = [
    "@page{size:A4 landscape;margin:7mm}",
    "*{box-sizing:border-box}",
    "html,body{margin:0;padding:0;background:#f7f3e8!important;color:#17211c;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}",
    ".print-toolbar{position:sticky;top:0;z-index:50;display:flex;justify-content:center;gap:12px;padding:12px 16px;background:#fffdf7!important;border-bottom:1px solid #d8c788!important;box-shadow:0 2px 10px rgba(0,0,0,.08)!important}",
    ".print-toolbar button{border:1px solid #064e3b;border-radius:8px;padding:9px 16px;background:#064e3b!important;color:#fffdf7!important;font:700 13px Arial,Helvetica,sans-serif;cursor:pointer}",
    ".print-toolbar button.secondary{background:#fffdf7!important;color:#064e3b!important}",
    ".exit-settlement-print-document{display:block!important;position:relative!important;width:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;background:#f7f3e8!important;color:#17211c!important;font-size:12pt!important;line-height:1.2!important}",
    ".exit-settlement-print-document *{background-color:#f7f3e8!important;background-image:none!important;box-shadow:none!important}",
    ".chris-print-report-header{position:relative;display:grid!important;grid-template-columns:70px 1fr 70px!important;align-items:center!important;text-align:center!important;padding:0 0 5px!important;margin:0 0 6px!important;border-bottom:2px solid #064e3b!important}",
    ".chris-print-report-logo{display:block!important;grid-column:1!important;width:auto!important;height:auto!important;max-width:62px!important;max-height:34px!important;margin:0!important;object-fit:contain!important}",
    ".chris-print-report-heading{position:relative!important;z-index:3!important;grid-column:2!important;text-align:center!important}",
    ".chris-print-report-owner{margin:0!important;color:#064e3b!important;font-size:14pt!important;font-weight:900!important;line-height:1.15!important;text-transform:uppercase!important;letter-spacing:.025em!important}",
    ".chris-print-report-heading h1{margin:2px 0 0!important;color:#9a7410!important;font-size:13pt!important;font-weight:900!important;letter-spacing:.055em!important;text-transform:uppercase!important;line-height:1.1!important}",
    ".chris-print-report-scope{margin-top:2px!important;color:#64748b!important;font-size:12pt!important;font-weight:700!important;line-height:1.05!important}",
    ".chris-print-document-watermark{position:fixed!important;z-index:1!important;top:53%!important;left:50%!important;width:31%!important;max-width:300px!important;max-height:300px!important;transform:translate(-50%,-50%)!important;object-fit:contain!important;opacity:.055!important;filter:grayscale(100%)!important;mix-blend-mode:multiply!important;pointer-events:none!important;background:transparent!important}",
    ".chris-print-document-watermark-text{position:fixed!important;z-index:1!important;top:53%!important;left:50%!important;transform:translate(-50%,-50%) rotate(-24deg)!important;width:62%!important;text-align:center!important;color:#064e3b!important;opacity:.05!important;font-size:34pt!important;font-weight:900!important;letter-spacing:.08em!important;pointer-events:none!important;background:transparent!important}",
    ".exit-settlement-print-meta{position:relative;z-index:3;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;column-gap:18px!important;row-gap:3px!important;padding:3px 0 5px!important;margin-bottom:6px!important;border:0!important;border-bottom:1px solid #c7cec9!important;border-radius:0!important;break-inside:auto!important;page-break-inside:auto!important}",
    ".exit-settlement-print-meta>div{display:grid!important;grid-template-columns:minmax(92px,.68fr) minmax(0,1.32fr)!important;gap:6px!important;align-items:baseline!important;min-width:0!important;padding:1px 0 2px!important;border-bottom:1px solid #e0ddd2!important}",
    ".exit-settlement-print-meta span,.exit-settlement-print-totals span,.exit-settlement-headhr-signature-grid span,.exit-settlement-sign-line span{color:#64748b!important;font-size:12pt!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.02em!important}",
    ".exit-settlement-print-meta strong,.exit-settlement-headhr-signature-grid strong{color:#17211c!important;font-size:12pt!important;font-weight:700!important;line-height:1.3!important;overflow-wrap:anywhere!important}",
    ".exit-settlement-print-meta-wide{grid-column:1/-1!important}",
    ".exit-settlement-print-account{position:relative;z-index:3;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-rows:auto!important;gap:18px!important;align-items:start!important;width:100%!important;direction:ltr!important;margin-top:0!important;break-inside:auto!important;page-break-inside:auto!important}",
    ".exit-settlement-print-account>:first-child{grid-column:1!important;grid-row:1!important}",
    ".exit-settlement-print-account>:nth-child(2){grid-column:2!important;grid-row:1!important}",
    ".exit-settlement-print-table-section{min-width:0!important;break-inside:auto!important;page-break-inside:auto!important}",
    ".exit-settlement-print-table-section h3{margin:0 0 3px!important;padding:0 0 3px!important;color:#064e3b!important;border:0!important;border-bottom:2px solid #064e3b!important;font-size:13pt!important;font-weight:900!important;letter-spacing:.03em!important;text-transform:uppercase!important;line-height:1.1!important}",
    ".exit-settlement-print-table-section table{width:100%!important;table-layout:fixed!important;border-collapse:collapse!important;border:0!important}",
    ".exit-settlement-print-table-section th,.exit-settlement-print-table-section td{padding:2px 5px!important;border:0!important;border-bottom:1px solid #d6d8d5!important;color:#17211c!important;font-size:12pt!important;line-height:1.15!important;overflow-wrap:anywhere!important}",
    ".exit-settlement-print-table-section th{padding-top:2px!important;color:#064e3b!important;font-weight:900!important;text-align:left!important;text-transform:uppercase!important;letter-spacing:.02em!important;border-bottom:1px solid #8fa79a!important}",
    ".exit-settlement-print-table-section th:last-child,.exit-settlement-print-table-section td:last-child{width:30%!important;text-align:right!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important}",
    ".exit-settlement-print-table-section tbody tr{break-inside:avoid!important;page-break-inside:avoid!important}.exit-settlement-print-table-section tbody tr:last-child td{border-bottom:0!important}",
    ".exit-settlement-print-totals{position:relative;z-index:3;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important;margin:5px 0 0!important;padding:5px 0 0!important;border-top:2px solid #9a7410!important;break-inside:avoid!important}",
    ".exit-settlement-print-totals>div{display:grid!important;grid-template-columns:1fr auto!important;align-items:baseline!important;gap:8px!important;padding:2px 0!important;border:0!important;border-radius:0!important}",
    ".exit-settlement-print-totals .net{border:0!important}",
    ".exit-settlement-print-totals strong{color:#064e3b!important;font-size:13pt!important;font-weight:900!important;font-variant-numeric:tabular-nums!important}",
    ".exit-settlement-print-calculation-note,.exit-settlement-headhr-approval,.exit-settlement-external-workflow{position:relative;z-index:3;margin-top:6px!important}",
    ".exit-settlement-print-calculation-note{padding:5px 0 0!important;border:0!important;border-top:1px solid #c7cec9!important;border-radius:0!important;break-inside:auto!important}",
    ".exit-settlement-print-calculation-note h3,.exit-settlement-headhr-approval h3,.exit-settlement-external-title h3{margin:0 0 4px!important;color:#064e3b!important;font-size:13pt!important;font-weight:900!important;letter-spacing:.02em!important}",
    ".exit-settlement-print-calculation-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;column-gap:20px!important;row-gap:2px!important;color:#17211c!important;font-size:12pt!important;line-height:1.18!important}.exit-settlement-print-calculation-grid>div{padding:1px 0!important;border-bottom:1px dotted #d6d8d5!important;break-inside:avoid!important}",
    ".exit-settlement-print-hr-note{margin-top:4px!important;padding-top:4px!important;border-top:1px solid #d6d8d5!important;color:#475569!important;font-size:12pt!important;line-height:1.2!important}",
    ".exit-settlement-headhr-approval{padding-top:5px!important;border-top:2px solid #064e3b!important;break-inside:avoid!important}",
    ".exit-settlement-headhr-signature-grid{display:grid!important;grid-template-columns:1.2fr 1.2fr 1.2fr .75fr!important;gap:12px!important;align-items:end!important}",
    ".exit-settlement-headhr-signature-grid>div{display:grid!important;gap:2px!important;padding:1px 0!important;border:0!important;min-height:32px!important}",
    ".exit-settlement-headhr-signature-line{height:15px!important;border-bottom:1px solid #475569!important}",
    ".exit-settlement-external-workflow{padding-top:5px!important;border-top:1px solid #c7cec9!important;break-inside:auto!important;page-break-inside:auto!important}",
    ".exit-settlement-external-title{margin-bottom:4px!important}",
    ".exit-settlement-external-title p{margin:0!important;color:#64748b!important;font-size:12pt!important;line-height:1.15!important}",
    ".exit-settlement-signatory-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:16px!important;align-items:start!important}",
    ".exit-settlement-signatory-block{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;column-gap:10px!important;row-gap:2px!important;min-height:0!important;padding:0!important;border:0!important;border-top:2px solid #d8c788!important;border-radius:0!important;break-inside:avoid!important}",
    ".exit-settlement-signatory-heading{grid-column:1/-1!important;display:flex!important;align-items:center!important;gap:6px!important;margin:4px 0 2px!important}",
    ".exit-settlement-signatory-heading>span{display:inline-grid!important;place-items:center!important;width:20px!important;height:20px!important;border:1px solid #064e3b!important;border-radius:50%!important;color:#064e3b!important;font-size:12pt!important;font-weight:900!important}",
    ".exit-settlement-signatory-heading strong{color:#064e3b!important;font-size:12pt!important;font-weight:900!important}",
    ".exit-settlement-sign-line{margin-top:1px!important}",
    ".exit-settlement-sign-line div{height:12px!important;border-bottom:1px solid #94a3b8!important}",
    ".chris-print-report-footer{position:relative;z-index:3;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;margin-top:5px!important;padding-top:4px!important;border-top:1px solid #94a3b8!important;color:#64748b!important;font-size:12pt!important;break-before:avoid!important}",
    ".chris-print-report-powered{display:inline-flex!important;align-items:center!important;gap:6px!important;color:#64748b!important}",
    ".chris-print-report-powered img{width:18px!important;height:18px!important;object-fit:contain!important;background:transparent!important}",
    ".chris-print-report-powered strong{display:none!important}",
    "@media print{.print-toolbar{display:none!important}html,body{background:#f7f3e8!important}.exit-settlement-print-document{margin:0!important}.chris-print-report-header,.exit-settlement-print-meta,.exit-settlement-print-totals,.exit-settlement-headhr-approval,.chris-print-report-footer{break-inside:avoid!important;page-break-inside:avoid!important}}"
  ].join("\n");

  printWindow.document.open();
  printWindow.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><base href="' +
      baseHref +
      '"><title></title><style>' +
      printCss +
      '</style></head><body>' +
      '<div class="print-toolbar" role="toolbar" aria-label="Settlement print controls">' +
      '<button id="printSettlementDocument" type="button">Print / Download PDF</button>' +
      '<button id="closeSettlementDocument" class="secondary" type="button">Close</button>' +
      '</div>' +
      clone.outerHTML +
      '</body></html>'
  );
  printWindow.document.close();
  printWindow.opener = null;

  const printButton = printWindow.document.getElementById("printSettlementDocument");
  const closeButton = printWindow.document.getElementById("closeSettlementDocument");
  printButton?.addEventListener("click", () => {
    printWindow.focus();
    printWindow.print();
  });
  closeButton?.addEventListener("click", () => printWindow.close());

  const images = Array.from(printWindow.document.images);
  Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    })
  ).then(() => {
    printWindow.focus();
  });
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
  const noticePreview = useMemo(
    () => calculateNoticePreview(exitForm),
    [
      exitForm.noticeDate,
      exitForm.lastWorkingDay,
      exitForm.entitledNoticeDays,
      exitForm.noticeStatus,
    ]
  );
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
    queue: [],
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

  const loadExitDocuments = useCallback(async (exitProcessId) => {
    if (!exitProcessId) {
      setExitDocuments([]);
      return;
    }
    const result = await apiRequest(
      `/api/exits/${encodeURIComponent(exitProcessId)}/documents`
    );
    setExitDocuments(result?.data || []);
  }, []);

  async function uploadExitDocument(exitProcessId, draft = exitDocumentDraft) {
    if (!exitProcessId) return null;

    const queuedItems = Array.isArray(draft?.queue) && draft.queue.length
      ? draft.queue
      : draft?.file
        ? [{ file: draft.file, category: draft.category, notes: draft.notes }]
        : [];

    if (!queuedItems.length) return null;

    const body = new FormData();
    queuedItems.forEach((item) => body.append("documents", item.file));
    body.append(
      "metadata",
      JSON.stringify(
        queuedItems.map((item) => ({
          category: item.category || draft.category || "OTHER_EXIT_DOCUMENT",
          notes: item.notes || "",
        }))
      )
    );

    const result = await apiRequest(
      `/api/exits/${encodeURIComponent(exitProcessId)}/documents`,
      { method: "POST", body }
    );
    return result?.data || null;
  }

  async function saveExitDocument() {
    if (!activeExit?.id) {
      setFeedback("Initiate the exit process before uploading additional exit documents.");
      return;
    }
    const queuedCount = exitDocumentDraft.queue?.length || (exitDocumentDraft.file ? 1 : 0);
    if (!queuedCount) {
      setFeedback("Choose one or more exit documents to upload.");
      return;
    }
    if (exitDocuments.length + queuedCount > 10) {
      setFeedback(`Zermatt exit policy allows a maximum of 10 documents. ${10 - exitDocuments.length} upload slot(s) remain.`);
      return;
    }

    setDocumentBusy(true);
    setFeedback("");
    try {
      await uploadExitDocument(activeExit.id);
      setExitDocumentDraft({
        category: defaultExitDocumentType(activeExit.exitType),
        file: null,
        notes: "",
        queue: [],
      });
      await loadExitDocuments(activeExit.id);
      setFeedback(`${queuedCount} exit document${queuedCount === 1 ? "" : "s"} uploaded successfully.`);
    } catch (error) {
      setFeedback(error?.message || "Unable to upload exit document.");
    } finally {
      setDocumentBusy(false);
    }
  }

  async function deleteExitDocument(documentId, exitProcessId = activeExit?.id) {
    if (!exitProcessId || !documentId) return;
    if (!window.confirm("Delete this exit document? This cannot be undone.")) return;

    setDocumentBusy(true);
    setFeedback("");
    try {
      await apiRequest(
        `/api/exits/${encodeURIComponent(exitProcessId)}/documents/${encodeURIComponent(documentId)}`,
        { method: "DELETE" }
      );
      await loadExitDocuments(exitProcessId);
      setFeedback("Exit document deleted.");
    } catch (error) {
      setFeedback(error?.message || "Unable to delete exit document.");
    } finally {
      setDocumentBusy(false);
    }
  }


  useEffect(() => {
    if (!activeExit?.id) {
      setExitDocuments([]);
      return;
    }
    loadExitDocuments(activeExit.id).catch((error) => {
      setFeedback(error?.message || "Unable to load exit documents.");
    });
  }, [activeExit?.id, loadExitDocuments]);

  useEffect(() => {
    if (!settlementExitId) return;
    loadExitDocuments(settlementExitId).catch((error) => {
      setFeedback(error?.message || "Unable to load settlement payment proof.");
    });
  }, [settlementExitId, loadExitDocuments]);

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

      const createdExit = result?.data || null;
      const queuedDocumentCount = exitDocumentDraft.queue?.length || (exitDocumentDraft.file ? 1 : 0);
      const hadDocument = queuedDocumentCount > 0;

      if (createdExit?.id && hadDocument) {
        await uploadExitDocument(createdExit.id);
        setExitDocumentDraft({
          category: defaultExitDocumentType(createdExit.exitType),
          file: null,
          notes: "",
          queue: [],
        });
      }

      setFeedback(
        hadDocument
          ? `Exit process initiated and ${queuedDocumentCount} exit document${queuedDocumentCount === 1 ? "" : "s"} uploaded successfully.`
          : (result?.message || "Exit process initiated.")
      );
      await loadData();
      if (createdExit?.id) {
        await loadExitDocuments(createdExit.id);
      }
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

  async function saveSettlementPaymentProof() {
    if (!settlementExitId) return;

    const queue = exitDocumentDraft.queue || [];
    if (!queue.length) {
      setFeedback("Choose one or more settlement payment proof files.");
      return;
    }
    if (exitDocuments.length + queue.length > 10) {
      setFeedback(`Zermatt exit policy allows a maximum of 10 documents. ${10 - exitDocuments.length} upload slot(s) remain.`);
      return;
    }

    setDocumentBusy(true);
    setFeedback("");
    try {
      await uploadExitDocument(settlementExitId, {
        ...exitDocumentDraft,
        queue: queue.map((item) => ({
          ...item,
          category: "EXIT_SETTLEMENT_PAYMENT_PROOF",
        })),
      });
      setExitDocumentDraft({
        category: "EXIT_SETTLEMENT_PAYMENT_PROOF",
        file: null,
        notes: "",
        queue: [],
      });
      await loadExitDocuments(settlementExitId);
      setFeedback("Exit settlement payment proof uploaded successfully.");
    } catch (error) {
      setFeedback(error?.message || "Unable to upload settlement payment proof.");
    } finally {
      setDocumentBusy(false);
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
      "unreturnedUniform",
      "previousSalaryOverpaid",
    ];
    const body = { ...settlementForm };
    for (const key of amountFields) body[key] = Number(body[key] || 0);
    runSettlementAction("calculate", body);
  }

  if (settlementExitId) {
    const snapshot = settlement?.calculationSnapshot || {};
    const fallbackAccountEmployee = settlementExit ? {
      employeeNumber: settlementExit.employeeNumber,
      employeeName: nameOf(settlementExit),
      designation: settlementExit.designation?.name || "",
      department: settlementExit.department?.name || "",
      branch: settlementExit.location?.name || "",
      costCentre: "",
      costCentreCode: "",
      employmentType: "",
    } : null;
    const fallbackAccountExit = settlementExit?.exitProcess ? {
      exitType: settlementExit.exitProcess.exitType,
      noticeDate: null,
      lastWorkingDay: settlementExit.exitProcess.effectiveDate || settlementExit.exitDate || null,
      reason: settlementExit.exitProcess.reason || "",
    } : null;
    const accountEmployee = settlementPreview?.employee || snapshot.employee || fallbackAccountEmployee;
    const accountExit = settlementPreview?.exit || snapshot.exit || fallbackAccountExit;
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
    const calculationNote =
      settlementPreview?.calculationNote ||
      snapshot.calculationNote ||
      settlement?.notes ||
      "";
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
          <div className="exit-settlement-workspace" style={twoColumn}>
            <EmployeeCard employee={settlementExit} />
            <section className="exit-settlement-panel" style={panel}>
              <div style={sectionHeader}>
                <div>
                  <div style={eyebrow}>FINANCIAL STATUS</div>
                  <h2 style={sectionTitle}>{titleCase(settlementExit.exitProcess?.financialStatus || "PENDING")}</h2>
                </div>
                <div style={settlementHeaderActions}>
                  {settlementExit ? (
                    <button
                      type="button"
                      className="exit-settlement-print-button"
                      style={secondaryButton}
                      onClick={printExitSettlementDocument}
                      aria-label="Print or download Employee Exit Settlement Account as PDF"
                    >
                      <FaPrint /> Print / Download PDF
                    </button>
                  ) : null}
                  {settlement ? <span style={countBadge}>{titleCase(settlement.status)}</span> : null}
                </div>
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
                  <div><span style={metaLabel}>Notice Date</span><strong>{dateText(accountExit.noticeDate)}</strong></div>
                  <div><span style={metaLabel}>Final Working Day</span><strong>{dateText(accountExit.lastWorkingDay)}</strong></div>
                  <div><span style={metaLabel}>Notice Days Given</span><strong>{settlementPreview?.hrInputs?.noticeDaysGiven ?? snapshot.hrInputs?.noticeDaysGiven ?? "—"} days</strong></div>
                  <div style={full}><span style={metaLabel}>Exit Reason</span><strong>{accountExit.reason || "—"}</strong></div>
                  {accountSalary ? <div style={full}><span style={metaLabel}>Settlement Salary Basis</span><strong>{moneyText(accountSalary.monthlyGross, accountSalary.currency)} monthly gross · Daily rate {moneyText(accountSalary.dayRate, accountSalary.currency)} · Hourly rate {moneyText(accountSalary.hourRate, accountSalary.currency)}</strong></div> : null}
                </section>
              ) : null}

              {!settlement || ["DRAFT", "CALCULATED", "DISPUTED"].includes(settlement.status) ? (
                <form onSubmit={calculateExitSettlement}>
                  <div className="exit-settlement-account-columns">
                    <div className="exit-settlement-credit-column">
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
                    </div>

                    <div className="exit-settlement-debit-column">
                    <SettlementAccountSection title="DEBIT" tone="debit">
                      <SettlementLine label="Loan Balance" value={accountDebits?.loanBalance} currency={accountSalary?.currency} source="System · Loan Account" />
                      <SettlementLine label="Salary Advance" value={accountDebits?.salaryAdvance} currency={accountSalary?.currency} source="System · Salary Advance Account" />
                      <SettlementNoticeSummary
                        noticeDate={accountExit?.noticeDate}
                        lastWorkingDay={accountExit?.lastWorkingDay}
                        requiredDays={settlementPreview?.hrInputs?.entitledNoticeDays ?? snapshot.hrInputs?.entitledNoticeDays}
                        daysGiven={settlementPreview?.hrInputs?.noticeDaysGiven ?? snapshot.hrInputs?.noticeDaysGiven}
                        deficiencyDays={settlementPreview?.hrInputs?.noticeDeficiencyDays ?? snapshot.hrInputs?.noticeDeficiencyDays}
                        excessDays={settlementPreview?.hrInputs?.noticeExcessDays ?? snapshot.hrInputs?.noticeExcessDays}
                        waived={settlementPreview?.hrInputs?.noticeDeductionWaived ?? snapshot.hrInputs?.noticeDeductionWaived}
                        deduction={accountDebits?.noticeDeduction}
                        currency={accountSalary?.currency}
                      />
                      <SettlementInputLine label="Unreturned Uniform" value={settlementForm.unreturnedUniform} onChange={(value) => setSettlementField("unreturnedUniform", value)} amount={accountDebits?.unreturnedUniform} currency={accountSalary?.currency} />
                      <SettlementInputLine label="Previous Salary Overpaid" value={settlementForm.previousSalaryOverpaid} onChange={(value) => setSettlementField("previousSalaryOverpaid", value)} amount={accountDebits?.previousSalaryOverpaid} currency={accountSalary?.currency} />
                    </SettlementAccountSection>
                    </div>
                  </div>

                  <div style={settlementSummary}>
                    <Info label="Total Credits" value={moneyText(accountTotals?.totalCredits, accountSalary?.currency || settlement?.currency)} />
                    <Info label="Total Debits" value={moneyText(accountTotals?.totalDebits, accountSalary?.currency || settlement?.currency)} />
                    <Info label="Net Exit Settlement" value={moneyText(accountTotals?.netSettlement, accountSalary?.currency || settlement?.currency)} />
                  </div>

                  <div style={{ ...full, marginTop: 14 }}>
                    <Field label="Calculation Notes — Auto-filled by CHRiS">
                      <textarea
                        value={calculationNote}
                        readOnly
                        style={{ ...textarea, minHeight: 180, background: "rgba(255,255,255,.035)", color: "#DDE9E2" }}
                      />
                    </Field>
                  </div>
                  <div style={{ ...full, marginTop: 10 }}>
                    <Field label="HR Supplementary Note (Optional)">
                      <textarea
                        value={settlementForm.notes}
                        onChange={(event) => setSettlementField("notes", event.target.value)}
                        style={textarea}
                        placeholder="Add only any additional HR explanation not already covered by the CHRiS calculation basis."
                      />
                    </Field>
                  </div>
                  <div style={footer}><span style={muted}>System-derived items are locked and pulled from CHRiS source accounts/rules. Only HR-designated settlement inputs are editable.</span><button type="submit" style={primaryButton} disabled={!canUpdate || busy || !settlementPreview}>{busy ? "Calculating..." : "Calculate Exit Settlement Account"}</button></div>
                </form>
              ) : null}

              {!settlement && accountEmployee && accountExit ? (
                <section className="chris-print-document exit-settlement-print-document">
                  <PrintableReportHeader
                    reportTitle="Employee Exit Settlement Account — Draft"
                    scopeLabel={`${accountEmployee.employeeNumber} · ${accountEmployee.employeeName}`}
                  />

                  <div className="exit-settlement-print-meta">
                    <div><span>Employee No.</span><strong>{accountEmployee.employeeNumber || "—"}</strong></div>
                    <div><span>Employee Name</span><strong>{accountEmployee.employeeName || "—"}</strong></div>
                    <div><span>Designation</span><strong>{accountEmployee.designation || "—"}</strong></div>
                    <div><span>Department</span><strong>{accountEmployee.department || "—"}</strong></div>
                    <div><span>Cost Centre</span><strong>{accountEmployee.costCentreCode ? `${accountEmployee.costCentreCode} · ${accountEmployee.costCentre || ""}` : (accountEmployee.costCentre || "—")}</strong></div>
                    <div><span>Branch</span><strong>{accountEmployee.branch || "—"}</strong></div>
                    <div><span>Exit Type</span><strong>{titleCase(accountExit.exitType)}</strong></div>
                    <div><span>Notice Date</span><strong>{dateText(accountExit.noticeDate)}</strong></div>
                    <div><span>Final Working Day</span><strong>{dateText(accountExit.lastWorkingDay)}</strong></div>
                    <div><span>Entitled Notice</span><strong>{settlementPreview?.hrInputs?.entitledNoticeDays ?? 0} days</strong></div>
                    <div><span>Notice Days Given</span><strong>{settlementPreview?.hrInputs?.noticeDaysGiven ?? 0} days</strong></div>
                    <div><span>Notice Deficiency</span><strong>{settlementPreview?.hrInputs?.noticeDeficiencyDays ?? 0} days</strong></div>
                    <div className="exit-settlement-print-meta-wide"><span>Exit Reason</span><strong>{accountExit.reason || "—"}</strong></div>
                  </div>

                  <div className="exit-settlement-print-account">
                    <PrintableSettlementTable
                      title="CREDIT — BENEFITS / ENTITLEMENTS"
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
                      currency={accountSalary?.currency}
                    />
                    <PrintableSettlementTable
                      title="DEBIT — DEDUCTIONS / RECOVERIES"
                      items={[
                        ["Loan Balance", accountDebits?.loanBalance],
                        ["Salary Advance", accountDebits?.salaryAdvance],
                        ["In Lieu of Notice Deduction", accountDebits?.noticeDeduction],
                        ["Unreturned Uniform", accountDebits?.unreturnedUniform],
                        ["Previous Salary Overpaid", accountDebits?.previousSalaryOverpaid],
                      ]}
                      currency={accountSalary?.currency}
                    />
                  </div>

                  <div className="exit-settlement-print-totals">
                    <div><span>Total Credits</span><strong>{moneyText(accountTotals?.totalCredits, accountSalary?.currency)}</strong></div>
                    <div><span>Total Debits</span><strong>{moneyText(accountTotals?.totalDebits, accountSalary?.currency)}</strong></div>
                    <div className="net"><span>Net Exit Settlement</span><strong>{moneyText(accountTotals?.netSettlement, accountSalary?.currency)}</strong></div>
                  </div>

                  <section className="exit-settlement-print-calculation-note">
                    <h3>Calculation Basis</h3>
                    <pre>{calculationNote}</pre>
                  </section>

                  <section className="exit-settlement-headhr-approval">
                    <h3>Head of HR Approval & Signature</h3>
                    <div className="exit-settlement-headhr-signature-grid">
                      <div><span>Role</span><strong>Head of Human Resources</strong></div>
                      <div><span>Name</span><div className="exit-settlement-headhr-signature-line" /></div>
                      <div><span>Signature</span><div className="exit-settlement-headhr-signature-line" /></div>
                      <div><span>Date</span><strong>Pending</strong></div>
                    </div>
                  </section>

                  <section className="exit-settlement-external-workflow">
                    <div className="exit-settlement-external-title">
                      <h3>External Signatory Workflow</h3>
                      <p>For use after Head HR approval. Draft preview only.</p>
                    </div>
                    <div className="exit-settlement-signatory-grid">
                      <ExternalSignatoryBlock step="1" title="Auditor Review" fields={["Auditor Name", "Signature", "Date", "Review Remarks"]} />
                      <ExternalSignatoryBlock step="2" title="GM Payout Approval" fields={["General Manager Name", "Signature", "Date", "Approval / Remarks"]} />
                      <ExternalSignatoryBlock step="3" title="Accounts Team Payout Processing" fields={["Processed By", "Signature", "Processing Date", "Payment Reference / Voucher No."]} />
                    </div>
                  </section>

                  <PrintableReportFooter generatedAt={new Date().toISOString()} />
                </section>
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
                      <div style={closureNotice}>Head HR approval is complete. Auditor review, GM payout approval and Accounts Team payout processing are completed externally on the printed settlement document. Use the Print / Download PDF button above for the settlement document.</div>
                    </div>
                  ) : null}
                  {["PAYMENT_PENDING", "PARTIALLY_PAID", "PAID"].includes(settlement.status) ? (
                    <div style={{ marginTop: 16 }}>
                      <ExitDocumentSection
                        draft={exitDocumentDraft}
                        setDraft={setExitDocumentDraft}
                        documents={exitDocuments.filter((document) => document.category === "EXIT_SETTLEMENT_PAYMENT_PROOF")}
                        busy={documentBusy}
                        canUpdate={canManagePayroll}
                        onUpload={saveSettlementPaymentProof}
                        onDelete={(documentId) => deleteExitDocument(documentId, settlementExitId)}
                        forcedCategory="EXIT_SETTLEMENT_PAYMENT_PROOF"
                        title="Exit Settlement Payment Proof"
                        description="Attach payment advice, transfer confirmation, voucher, receipt or other Accounts payout evidence after the external payout process. These files remain part of the employee's audited exit record."
                        totalDocumentCount={exitDocuments.length}
                      />
                    </div>
                  ) : null}
                  {["APPROVED", "PAYMENT_PENDING"].includes(settlement.status) ? <div style={settlementAction}><Field label="Waiver Reason"><textarea value={settlementDecisionNotes} onChange={(event) => setSettlementDecisionNotes(event.target.value)} style={textarea} /></Field><button type="button" style={dangerButton} disabled={!canManagePayroll || busy || !settlementDecisionNotes.trim()} onClick={() => runSettlementAction("waive", { reason: settlementDecisionNotes })}>Waive Settlement</button></div> : null}
                  {["PAID", "WAIVED"].includes(settlement.status) ? <div style={closureNotice}>Financial closure complete. The HR-effective exit date and employment history remain unchanged.</div> : null}

                  {settlement.status !== "WAIVED" ? (
                    <section className="chris-print-document exit-settlement-print-document">
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
                        <div><span>Notice Date</span><strong>{dateText(accountExit?.noticeDate)}</strong></div>
                        <div><span>Final Working Day</span><strong>{dateText(accountExit?.lastWorkingDay)}</strong></div>
                        <div><span>Entitled Notice</span><strong>{settlementPreview?.hrInputs?.entitledNoticeDays ?? snapshot.hrInputs?.entitledNoticeDays ?? 0} days</strong></div>
                        <div><span>Notice Days Given</span><strong>{settlementPreview?.hrInputs?.noticeDaysGiven ?? snapshot.hrInputs?.noticeDaysGiven ?? 0} days</strong></div>
                        <div><span>Notice Deficiency</span><strong>{settlementPreview?.hrInputs?.noticeDeficiencyDays ?? snapshot.hrInputs?.noticeDeficiencyDays ?? 0} days</strong></div>
                        <div className="exit-settlement-print-meta-wide"><span>Exit Reason</span><strong>{accountExit?.reason || "—"}</strong></div>
                      </div>

                      <div className="exit-settlement-print-account">
                        <PrintableSettlementTable
                          title="CREDIT — BENEFITS / ENTITLEMENTS"
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
                          title="DEBIT — DEDUCTIONS / RECOVERIES"
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

                      <section className="exit-settlement-print-calculation-note">
                        <h3>Calculation Basis</h3>
                        <pre>{snapshot.calculationNote || calculationNote}</pre>
                        {snapshot.hrSupplementaryNote ? (
                          <div className="exit-settlement-print-hr-note">
                            <strong>HR Supplementary Note:</strong> {snapshot.hrSupplementaryNote}
                          </div>
                        ) : null}
                      </section>

                      <section className="exit-settlement-headhr-approval">
                        <h3>Head of HR Approval & Signature</h3>
                        <div className="exit-settlement-headhr-signature-grid">
                          <div><span>Role</span><strong>Head of Human Resources</strong></div>
                          <div><span>Name</span><div className="exit-settlement-headhr-signature-line" /></div>
                          <div><span>Signature</span><div className="exit-settlement-headhr-signature-line" /></div>
                          <div><span>Date</span><strong>{dateText(settlement.approvedAt || settlement.calculatedAt)}</strong></div>
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

                    <Field label="Entitled Notice Period (Days)">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={exitForm.entitledNoticeDays}
                        onChange={(e) => setExitField("entitledNoticeDays", e.target.value)}
                        style={input}
                        required={!["WAIVED", "NOT_REQUIRED"].includes(String(exitForm.noticeStatus || "").toUpperCase())}
                        placeholder="e.g. 30"
                      />
                    </Field>

                    <div style={full}>
                      <section style={exitNoticePreviewCard}>
                        <div style={exitNoticePreviewHeader}>
                          <div>
                            <div style={eyebrow}>NOTICE PERIOD ANALYSIS</div>
                            <strong>Automatic Notice Position</strong>
                          </div>
                          <span style={noticePreview.waived ? noticeStateNeutral : (Number(noticePreview.deficiencyDays || 0) > 0 ? noticeStateWarning : noticeStateGood)}>
                            {noticePreview.waived
                              ? "Deduction Waived"
                              : noticePreview.daysGiven == null
                                ? "Enter dates"
                                : Number(noticePreview.deficiencyDays || 0) > 0
                                  ? "Deficient Notice"
                                  : "Notice Satisfied"}
                          </span>
                        </div>

                        <div style={exitNoticePreviewGrid}>
                          <div><span>Notice Date</span><strong>{exitForm.noticeDate ? dateText(exitForm.noticeDate) : "—"}</strong></div>
                          <div><span>Last Working Day</span><strong>{exitForm.lastWorkingDay ? dateText(exitForm.lastWorkingDay) : "—"}</strong></div>
                          <div><span>Entitled Notice</span><strong>{Number(exitForm.entitledNoticeDays || 0)} days</strong></div>
                          <div><span>Notice Days Given</span><strong>{noticePreview.daysGiven == null ? "—" : `${noticePreview.daysGiven} days`}</strong></div>
                          <div><span>Deficiency</span><strong>{noticePreview.deficiencyDays == null ? "—" : `${noticePreview.deficiencyDays} days`}</strong></div>
                          <div><span>Excess</span><strong>{noticePreview.excessDays == null ? "—" : `${noticePreview.excessDays} days`}</strong></div>
                        </div>

                        <div style={noticePreviewHelp}>
                          CHRiS calculates Notice Days Given from Notice Date to Last Working Day. The saved deficiency flows automatically into the Exit Settlement Account for monetary valuation.
                        </div>
                      </section>
                    </div>

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

                    <div style={full}>
                      <ExitDocumentSection
                        draft={exitDocumentDraft}
                        setDraft={setExitDocumentDraft}
                        documents={[]}
                        busy={documentBusy}
                        canUpdate={canUpdate}
                        beforeInitiation
                      />
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
                    <span>Entitled Notice: <strong>{activeExit.entitledNoticeDays ?? 0} days</strong></span>
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
                    <ExitDocumentSection
                      draft={exitDocumentDraft}
                      setDraft={setExitDocumentDraft}
                      documents={exitDocuments}
                      busy={documentBusy}
                      canUpdate={canUpdate}
                      onUpload={saveExitDocument}
                      onDelete={deleteExitDocument}
                    />
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

function ExitDocumentSection({
  draft,
  setDraft,
  documents,
  busy,
  canUpdate,
  onUpload,
  onDelete,
  beforeInitiation = false,
  forcedCategory = null,
  title = "Supporting Exit Documents",
  description = null,
  totalDocumentCount = null,
}) {
  const queue = Array.isArray(draft.queue) ? draft.queue : [];
  const persistedCount = totalDocumentCount == null ? Number(documents?.length || 0) : Number(totalDocumentCount || 0);
  const remainingSlots = Math.max(0, 10 - persistedCount);
  const availableToQueue = Math.max(0, remainingSlots - queue.length);

  function queueFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const accepted = files.slice(0, availableToQueue);
    setDraft((current) => ({
      ...current,
      file: null,
      queue: [
        ...(current.queue || []),
        ...accepted.map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
          file,
          category: forcedCategory || current.category || "OTHER_EXIT_DOCUMENT",
          notes: "",
        })),
      ],
    }));
  }

  function updateQueueItem(id, patch) {
    setDraft((current) => ({
      ...current,
      queue: (current.queue || []).map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));
  }

  function removeQueueItem(id) {
    setDraft((current) => ({
      ...current,
      queue: (current.queue || []).filter((item) => item.id !== id),
    }));
  }

  return (
    <section style={exitDocumentPanel}>
      <div style={exitDocumentHeader}>
        <div>
          <div style={eyebrow}>EXIT DOCUMENTS</div>
          <h3 style={exitDocumentTitle}>{title}</h3>
          <div style={muted}>
            {description || (beforeInitiation
              ? "Select up to 10 supporting exit documents. CHRiS will link the complete queue to the exit process when you click Initiate Exit."
              : "Upload and retain up to 10 resignation, termination, retirement, clearance, handover, settlement-payment or other separation documents for this exit record.")}
          </div>
        </div>
        <span style={countBadge}>
          {beforeInitiation ? queue.length : persistedCount + queue.length}/10
        </span>
      </div>

      <div style={exitDocumentGrid}>
        {!forcedCategory ? (
          <Field label="Default Document Type">
            <select
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              style={input}
              disabled={!canUpdate || busy}
            >
              {EXIT_DOCUMENT_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label={forcedCategory ? "Choose Payment Proof File(s)" : "Choose File(s)"}>
          <input
            key={queue.map((item) => item.id).join("|") || "empty-exit-documents"}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onChange={(event) => {
              queueFiles(event.target.files);
              event.target.value = "";
            }}
            style={fileInput}
            disabled={!canUpdate || busy || availableToQueue <= 0}
          />
        </Field>
      </div>

      <div style={{ ...muted, marginTop: 8 }}>
        Maximum 10 documents per exit process · Maximum 10 MB per file · {remainingSlots} slot{remainingSlots === 1 ? "" : "s"} remaining.
      </div>

      {queue.length ? (
        <div style={exitDocumentQueue}>
          {queue.map((item, index) => (
            <div key={item.id} style={exitDocumentQueueRow}>
              <div style={exitDocumentQueueIndex}>{index + 1}</div>
              <div style={exitDocumentQueueFields}>
                <div>
                  <strong style={{ color: "#F7FAF8" }}>{item.file.name}</strong>
                  <div style={muted}>{Math.max(1, Math.round(Number(item.file.size || 0) / 1024))} KB</div>
                </div>
                {!forcedCategory ? (
                  <select
                    value={item.category}
                    onChange={(event) => updateQueueItem(item.id, { category: event.target.value })}
                    style={compactInput}
                    disabled={!canUpdate || busy}
                  >
                    {EXIT_DOCUMENT_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                ) : (
                  <strong style={{ color: "#F6D35D", fontSize: 10 }}>Exit Settlement Payment Proof</strong>
                )}
                <input
                  value={item.notes || ""}
                  onChange={(event) => updateQueueItem(item.id, { notes: event.target.value })}
                  style={compactInput}
                  placeholder="Optional reference / note"
                  disabled={!canUpdate || busy}
                />
              </div>
              <button
                type="button"
                style={dangerButton}
                onClick={() => removeQueueItem(item.id)}
                disabled={!canUpdate || busy}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {!beforeInitiation ? (
        <>
          <div style={exitDocumentActions}>
            <span style={muted}>{queue.length ? `${queue.length} document${queue.length === 1 ? "" : "s"} ready` : "Select files to add to the upload queue."}</span>
            <button
              type="button"
              style={secondaryButton}
              disabled={!canUpdate || busy || !queue.length}
              onClick={onUpload}
            >
              {busy ? "Uploading..." : `Upload ${queue.length || ""} Document${queue.length === 1 ? "" : "s"}`}
            </button>
          </div>

          {documents.length ? (
            <div style={exitDocumentList}>
              {documents.map((document) => (
                <div key={document.id} style={exitDocumentRow}>
                  <div>
                    <strong>{document.categoryLabel || titleCase(document.category)}</strong>
                    <div style={muted}>{document.originalName}</div>
                    {document.notes ? <div style={muted}>{document.notes}</div> : null}
                  </div>
                  <button
                    type="button"
                    style={dangerButton}
                    disabled={!canUpdate || busy}
                    onClick={() => onDelete?.(document.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...muted, marginTop: 10 }}>No exit documents uploaded yet.</div>
          )}
        </>
      ) : null}
    </section>
  );
}

function SettlementNoticeSummary({
  noticeDate,
  lastWorkingDay,
  requiredDays,
  daysGiven,
  deficiencyDays,
  excessDays,
  waived,
  deduction,
  currency = "NGN",
}) {
  const required = Number(requiredDays || 0);
  const given = Number(daysGiven || 0);
  const deficiency = Number(deficiencyDays || 0);
  const excess = Number(excessDays || 0);

  return (
    <section style={noticeSummaryCard}>
      <div style={noticeSummaryHeader}>
        <strong>Notice Period Analysis</strong>
        <span>{waived ? "Deduction Waived" : deficiency > 0 ? "Deficient Notice" : "Notice Satisfied"}</span>
      </div>
      <div style={noticeSummaryGrid}>
        <div><span>Notice Date</span><strong>{dateText(noticeDate)}</strong></div>
        <div><span>Last Working Day</span><strong>{dateText(lastWorkingDay)}</strong></div>
        <div><span>Entitled Notice</span><strong>{required} days</strong></div>
        <div><span>Notice Days Given</span><strong>{given} days</strong></div>
        <div><span>Deficiency</span><strong>{deficiency} days</strong></div>
        <div><span>Excess</span><strong>{excess} days</strong></div>
      </div>
      <div style={noticeDeductionRow}>
        <span>In Lieu of Notice Deduction</span>
        <strong>{moneyText(deduction, currency)}</strong>
      </div>
    </section>
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
  hideAmount = false,
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
        {!hideAmount ? <strong style={settlementLineAmount}>{moneyText(amount, currency)}</strong> : null}
      </div>
    </div>
  );
}

const noticeSummaryCard = {
  margin: "8px 10px 10px",
  padding: 10,
  border: "1px solid rgba(212,175,55,.24)",
  borderRadius: 10,
  background: "rgba(0,0,0,.14)",
};

const noticeSummaryHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginBottom: 9,
  color: "#F7FAF8",
  fontSize: 10,
};

const noticeSummaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 7,
};

const noticeDeductionRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginTop: 9,
  paddingTop: 8,
  borderTop: "1px solid rgba(255,255,255,.07)",
  color: "#F6D35D",
  fontSize: 11,
  fontWeight: 900,
};

const exitNoticePreviewCard = {
  padding: 13,
  border: "1px solid rgba(212,175,55,.24)",
  borderRadius: 12,
  background: "linear-gradient(145deg,rgba(6,55,34,.58),rgba(2,23,15,.72))",
};

const exitNoticePreviewHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
  color: "#F7FAF8",
};

const exitNoticePreviewGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))",
  gap: 8,
};

const noticePreviewHelp = {
  marginTop: 10,
  paddingTop: 9,
  borderTop: "1px solid rgba(255,255,255,.07)",
  color: "#8EA89A",
  fontSize: 9.5,
  lineHeight: 1.45,
};

const noticeStateGood = {
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(46,233,139,.10)",
  border: "1px solid rgba(46,233,139,.32)",
  color: "#2EE98B",
  fontSize: 9,
  fontWeight: 900,
};

const noticeStateWarning = {
  ...noticeStateGood,
  background: "rgba(246,211,93,.10)",
  border: "1px solid rgba(246,211,93,.34)",
  color: "#F6D35D",
};

const noticeStateNeutral = {
  ...noticeStateGood,
  background: "rgba(148,163,184,.10)",
  border: "1px solid rgba(148,163,184,.30)",
  color: "#CBD5E1",
};

const exitDocumentPanel = {
  padding: 14,
  border: "1px solid rgba(212,175,55,.24)",
  borderRadius: 13,
  background: "rgba(5,43,27,.50)",
};

const exitDocumentHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const exitDocumentTitle = {
  margin: "3px 0 4px",
  color: "#F7FAF8",
  fontSize: 14,
};

const exitDocumentGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 10,
};

const fileInput = {
  width: "100%",
  minHeight: 43,
  boxSizing: "border-box",
  border: "1px solid rgba(212,175,55,.20)",
  borderRadius: 9,
  outline: "none",
  background: "#061A11",
  color: "#F5F7F6",
  padding: "8px 10px",
  fontSize: 13,
};

const exitDocumentQueue = {
  display: "grid",
  gap: 8,
  marginTop: 12,
};

const exitDocumentQueueRow = {
  display: "grid",
  gridTemplateColumns: "28px minmax(0,1fr) auto",
  gap: 9,
  alignItems: "center",
  padding: "9px 10px",
  border: "1px solid rgba(46,233,139,.18)",
  borderRadius: 9,
  background: "rgba(46,233,139,.045)",
};

const exitDocumentQueueIndex = {
  display: "grid",
  placeItems: "center",
  width: 24,
  height: 24,
  borderRadius: 999,
  background: "rgba(212,175,55,.14)",
  color: "#F6D35D",
  fontSize: 9,
  fontWeight: 900,
};

const exitDocumentQueueFields = {
  display: "grid",
  gridTemplateColumns: "minmax(160px,1.3fr) minmax(145px,1fr) minmax(160px,1fr)",
  gap: 8,
  alignItems: "center",
};

const compactInput = {
  width: "100%",
  minHeight: 34,
  boxSizing: "border-box",
  border: "1px solid rgba(212,175,55,.18)",
  borderRadius: 7,
  outline: "none",
  background: "#061A11",
  color: "#F5F7F6",
  padding: "6px 8px",
  fontSize: 10,
};

const selectedExitDocument = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 10,
  padding: "9px 10px",
  border: "1px solid rgba(46,233,139,.24)",
  borderRadius: 9,
  background: "rgba(46,233,139,.06)",
  color: "#DCECE3",
  fontSize: 10,
};

const exitDocumentActions = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 12,
};

const exitDocumentList = {
  display: "grid",
  gap: 7,
  marginTop: 12,
};

const exitDocumentRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "9px 10px",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 9,
  background: "rgba(255,255,255,.025)",
};

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
  gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
  gap: 14,
  alignItems: "start",
};

const settlementHeaderActions = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
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
