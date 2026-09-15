const express = require("express");

const prisma = require("../config/prisma");
const { requireAuth } = require("../middleware/authMiddleware");
const { validateLoanPurpose } = require("../services/loanPolicyService");
const { assessLoanCollateral } = require("../services/eosbService");
const {
  recordApprovedDisbursedLoan,
  applyApprovedDisbursedLoanTopUp,
  recordApprovedDisbursedSalaryAdvance,
} = require("../services/zermattFinancialSupportService");

const router = express.Router();
router.use(requireAuth);

function sendError(res, error, fallback = "Unable to record approved financial support.") {
  if (error?.code) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      code: error.code,
      message: error.message || fallback,
      details: error.details,
    });
  }
  console.error("Zermatt financial support error:", error);
  return res.status(500).json({ status: "error", message: error?.message || fallback });
}

function isZermatt(req) {
  return req.auth?.organization?.slug === "zermatt-liquor-limited";
}

function zermattOnly(req, res, next) {
  if (!isZermatt(req)) return next("route");
  return next();
}

function requireHeadHrRecorder(req, res, next) {
  const permissions = new Set(req.auth?.permissions || []);
  const roles = (req.auth?.roles || []).map((role) => String(role || "").trim().toUpperCase());
  const roleMatch = roles.some((role) => [
    "HEAD HR",
    "HEAD OF HR",
    "HEAD_HR",
    "HEAD_HR_VERIFIER",
    "HEAD OF HUMAN RESOURCES",
  ].includes(role));
  if (!permissions.has("loans.verify") && !roleMatch) {
    return res.status(403).json({
      status: "error",
      code: "HEAD_HR_FINANCIAL_SUPPORT_RECORDING_REQUIRED",
      message: "Only the Head of HR may record a Zermatt loan or salary advance after manual GM approval and external Accounts payment.",
    });
  }
  return next();
}

router.get("/zermatt/financial-support-policy", zermattOnly, (req, res) => {
  return res.json({
    status: "success",
    data: {
      approval: "MANUAL_GM_OUTSIDE_CHRIS",
      payment: "ACCOUNTS_OUTSIDE_CHRIS",
      recorder: "HEAD_HR",
      systemPurpose: "PAYROLL_RECOVERY_RECORD_ONLY",
      loanTopUp: "MERGE_INTO_EXISTING_LOAN_ACCOUNT",
      appliesTo: ["LOAN", "SALARY_ADVANCE"],
    },
  });
});

// Zermatt no longer originates loan approval inside CHRiS. The GM approves
// manually and Accounts completes payment outside the system before Head HR
// records the liability for payroll recovery.
router.post("/loans/applications", zermattOnly, (req, res) => {
  return res.status(409).json({
    status: "error",
    code: "ZERMATT_MANUAL_GM_APPROVAL_POLICY",
    message: "Zermatt loans are approved manually by the GM and paid by Accounts outside CHRiS. Head HR should record the already approved/disbursed amount for payroll recovery instead.",
  });
});

router.post("/loans/approved-disbursed", zermattOnly, requireHeadHrRecorder, async (req, res) => {
  try {
    const purpose = await validateLoanPurpose({
      organizationId: req.auth.organizationId,
      purpose: req.body?.purpose,
      prismaClient: prisma,
    });
    const approvedAmount = req.body?.approvedAmount ?? req.body?.principalAmount;
    const collateral = await assessLoanCollateral({
      organizationId: req.auth.organizationId,
      employeeNumber: req.body?.employeeNumber,
      requestedAmount: approvedAmount,
      suretyEmployeeNumber: req.body?.suretyEmployeeNumber,
      prismaClient: prisma,
    });
    const data = await recordApprovedDisbursedLoan({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: { ...(req.body || {}), purpose },
      collateralAssessment: collateral,
      prismaClient: prisma,
    });
    return res.status(201).json({
      status: "success",
      message: "GM-approved loan recorded as already disbursed. Payroll recovery is now scheduled from the selected month.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Unable to record the approved/disbursed loan.");
  }
});

router.post("/loans/:id/top-up", zermattOnly, requireHeadHrRecorder, async (req, res) => {
  try {
    const existingRows = await prisma.$queryRawUnsafe(
      `SELECT l."id",l."loanNumber",l."purpose",l."status",e."employeeNumber"
         FROM "payroll_loans" l
         JOIN "employees" e ON e."id"=l."employeeId" AND e."organizationId"=l."organizationId"
        WHERE l."organizationId"=$1 AND l."id"=$2 LIMIT 1`,
      req.auth.organizationId,
      req.params.id
    );
    const existing = existingRows[0];
    if (!existing) {
      const error = new Error("Loan account not found.");
      error.code = "LOAN_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    const purpose = await validateLoanPurpose({
      organizationId: req.auth.organizationId,
      purpose: req.body?.purpose || existing.purpose,
      prismaClient: prisma,
    });
    const topUpAmount = req.body?.topUpAmount ?? req.body?.principalAmount;
    const collateral = await assessLoanCollateral({
      organizationId: req.auth.organizationId,
      employeeNumber: existing.employeeNumber,
      requestedAmount: topUpAmount,
      suretyEmployeeNumber: req.body?.suretyEmployeeNumber,
      prismaClient: prisma,
    });
    const data = await applyApprovedDisbursedLoanTopUp({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      loanId: req.params.id,
      input: { ...(req.body || {}), purpose },
      collateralAssessment: collateral,
      prismaClient: prisma,
    });
    return res.json({
      status: "success",
      message: "Approved top-up merged into the existing loan account. No second loan account was created.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Unable to merge the approved top-up into the existing loan account.");
  }
});

// This route deliberately precedes the generic payroll route for Zermatt. The
// advance already has GM approval and Accounts payment before Head HR records it.
router.post("/payroll/salary-advances", zermattOnly, requireHeadHrRecorder, async (req, res) => {
  try {
    const data = await recordApprovedDisbursedSalaryAdvance({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      input: req.body || {},
      prismaClient: prisma,
    });
    return res.status(201).json({
      status: "success",
      message: "GM-approved salary advance recorded as already paid externally. Payroll recovery is now scheduled from the selected month.",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Unable to record the approved/disbursed salary advance.");
  }
});

module.exports = router;
