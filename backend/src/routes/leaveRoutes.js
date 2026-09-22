const express =
  require("express");

const {
  requireAuth,
  requirePermission,
  requireAnyPermission,
} = require(
  "../middleware/authMiddleware"
);

const {
  submitLeaveRequest,
  reviewLeaveRequest,
  cancelLeaveRequest,
  commenceLeave,
  returnFromLeave,
  getLeaveRequests,
  getLeaveConsistency,
  getEmployeeBalances,
  calculateLeaveRequestDays,
} = require(
  "../services/leaveService"
);

const {
  listPolicyWorkspace,
  createPolicy,
  adoptTemplate,
  changePolicyStatus,
  createPolicyVersion,
} = require("../services/leavePolicyService");

const { getLeaveOverview, getBalanceRegister, getEntitlementRegister } = require("../services/leaveOperationalService");

const {
  getEmployeePolicyBalance,
} = require("../services/leaveBalanceService");
const {
  createEntitlementAdjustment,
  listEntitlementAdjustments,
} = require("../services/leaveEntitlementAdjustmentService");
const { getEmployeeLeaveProfile } = require("../services/employeeLeaveProfileService");
const {
  buildProvisioningPreview,
  provisionEntitlements,
  listEntitlementMatrix,
  saveEntitlementMatrixRule,
} = require("../services/leaveEntitlementProvisioningService");
const { getEmployeeLeaveLedger } = require("../services/employeeLeaveLedgerService");
const {
  listLeaveExceptions,
  keepExceptionOpen,
  restoreWorkingStatus,
  reconstructHistoricalLeave,
} = require("../services/leaveExceptionService");

const prisma =
  require("../config/prisma");

const router =
  express.Router();

router.use(
  requireAuth
);


router.get("/overview",requirePermission("employees.view"),async(req,res)=>{try{return res.json({status:"success",data:await getLeaveOverview({organizationId:req.auth.organizationId})})}catch(error){return handleError(error,res)}});
router.get("/balance-register",requirePermission("employees.view"),async(req,res)=>{try{return res.json({status:"success",data:await getBalanceRegister({organizationId:req.auth.organizationId,leaveYear:req.query.leaveYear})})}catch(error){return handleError(error,res)}});
router.get("/employees/:employeeNumber/profile",requirePermission("employees.view"),async(req,res)=>{try{return res.json({status:"success",data:await getEmployeeLeaveProfile({organizationId:req.auth.organizationId,employeeNumber:req.params.employeeNumber,asOfDate:req.query.asOfDate})})}catch(error){return handleError(error,res)}});
router.get("/employees/:employeeNumber/ledger",requirePermission("employees.view"),async(req,res)=>{try{return res.json({status:"success",data:await getEmployeeLeaveLedger({organizationId:req.auth.organizationId,employeeNumber:req.params.employeeNumber,leavePolicyId:req.query.leavePolicyId,leaveYear:req.query.leaveYear,proposedUnits:req.query.proposedUnits})})}catch(error){return handleError(error,res)}});
router.get(
  "/employees/:employeeNumber/policy-balance",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const result =
        await getEmployeePolicyBalance({
          organizationId:
            req.auth.organizationId,
          employeeNumber:
            req.params.employeeNumber,
          leavePolicyId:
            req.query.leavePolicyId,
          leaveYear: req.query.leaveYear,
        });

      return res.json({
        status: "success",
        data: result,
      });
    } catch (error) {
      return handleError(error, res);
    }
  }
);
router.get("/entitlements",requirePermission("employees.view"),async(req,res)=>{try{return res.json({status:"success",data:await getEntitlementRegister({organizationId:req.auth.organizationId,asOfDate:req.query.asOfDate,employeeNumber:req.query.employeeNumber})})}catch(error){return handleError(error,res)}});
router.get("/entitlement-matrix",requirePermission("employees.view"),async(req,res)=>{try{return res.json({status:"success",data:await listEntitlementMatrix({organizationId:req.auth.organizationId})})}catch(error){return handleError(error,res)}});
router.post("/entitlement-matrix",requirePermission("leave.manage"),async(req,res)=>{try{return res.status(201).json({status:"success",data:await saveEntitlementMatrixRule({organizationId:req.auth.organizationId,actorUserId:req.auth.userId,input:req.body})})}catch(error){return handleError(error,res)}});
router.post("/entitlements/provisioning-preview",requirePermission("leave.manage"),async(req,res)=>{try{return res.json({status:"success",data:await buildProvisioningPreview({organizationId:req.auth.organizationId,leaveYear:req.body.leaveYear,policyIds:req.body.policyIds,employeeNumbers:req.body.employeeNumbers,baselineOnly:req.body.baselineOnly,rebaseExisting:req.body.rebaseExisting})})}catch(error){return handleError(error,res)}});
router.post("/entitlements/provision",requirePermission("leave.manage"),async(req,res)=>{try{return res.status(201).json({status:"success",data:await provisionEntitlements({organizationId:req.auth.organizationId,actorUserId:req.auth.userId,leaveYear:req.body.leaveYear,policyIds:req.body.policyIds,employeeNumbers:req.body.employeeNumbers,reason:req.body.reason,baselineOnly:req.body.baselineOnly,rebaseExisting:req.body.rebaseExisting,method:req.body.method})})}catch(error){return handleError(error,res)}});
router.get("/entitlements/adjustments",requirePermission("employees.view"),async(req,res)=>{try{return res.json({status:"success",data:await listEntitlementAdjustments({organizationId:req.auth.organizationId,employeeNumber:req.query.employeeNumber,leavePolicyId:req.query.leavePolicyId,leaveYear:req.query.leaveYear})})}catch(error){return handleError(error,res)}});
router.post("/entitlements/adjustments",requirePermission("leave.manage"),async(req,res)=>{try{return res.status(201).json({status:"success",data:await createEntitlementAdjustment({organizationId:req.auth.organizationId,actorUserId:req.auth.userId,employeeNumber:req.body.employeeNumber,leavePolicyId:req.body.leavePolicyId,leaveYear:req.body.leaveYear,amount:req.body.amount,reason:req.body.reason,effectiveDate:req.body.effectiveDate})})}catch(error){return handleError(error,res)}});
router.get("/request-day-calculation",requirePermission("employees.view"),async(req,res)=>{try{return res.json({status:"success",data:await calculateLeaveRequestDays({organizationId:req.auth.organizationId,employeeNumber:req.query.employeeNumber,leaveTypeId:req.query.leaveTypeId,leavePolicyId:req.query.leavePolicyId,startDate:req.query.startDate,endDate:req.query.endDate})})}catch(error){return handleError(error,res)}});

router.get(
  "/types",

  requirePermission(
    "employees.view"
  ),

  async (req, res) => {
    const types =
      await prisma.leaveType.findMany({
        where: {
          organizationId:
            req.auth
              .organizationId,
        },
        orderBy: {
          name:
            "asc",
        },
      });

    return res.json({
      status:
        "success",
      data:
        types,
    });
  }
);

router.get(
  "/policies",

  requirePermission(
    "employees.view"
  ),

  async (req, res) => {
    const policies =
      await prisma.leavePolicy.findMany({
        where: {
          organizationId:
            req.auth
              .organizationId,
        },
        include: {
          leaveType: true,
        },
        orderBy: {
          effectiveFrom:
            "desc",
        },
      });

    return res.json({
      status:
        "success",
      data:
        policies,
    });
  }
);


router.get(
  "/policy-workspace",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const data = await listPolicyWorkspace({ organizationId: req.auth.organizationId });
      return res.json({ status: "success", data });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.post(
  "/policies",
  requirePermission("leave.manage"),
  async (req, res) => {
    try {
      const data = await createPolicy({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, input: req.body });
      return res.status(201).json({ status: "success", data });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.post(
  "/policy-templates/:code/use",
  requirePermission("leave.manage"),
  async (req, res) => {
    try {
      const data = await adoptTemplate({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, templateCode: req.params.code, mode: "USE", overrides: req.body || {} });
      return res.status(201).json({ status: "success", data });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.post(
  "/policy-templates/:code/clone",
  requirePermission("leave.manage"),
  async (req, res) => {
    try {
      const data = await adoptTemplate({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, templateCode: req.params.code, mode: "CLONE", overrides: req.body || {} });
      return res.status(201).json({ status: "success", data });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.post(
  "/policies/:id/status",
  requirePermission("leave.manage"),
  async (req, res) => {
    try {
      const data = await changePolicyStatus({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, policyId: req.params.id, status: req.body.status, reason: req.body.reason });
      return res.json({ status: "success", data });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.post(
  "/policies/:id/versions",
  requirePermission("leave.manage"),
  async (req, res) => {
    try {
      const data = await createPolicyVersion({ organizationId: req.auth.organizationId, actorUserId: req.auth.userId, policyId: req.params.id, input: req.body });
      return res.status(201).json({ status: "success", data });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.get(
  "/balances/:employeeNumber",

  requirePermission(
    "employees.view"
  ),

  async (req, res) => {
    try {
      const result =
        await getEmployeeBalances({
          organizationId:
            req.auth
              .organizationId,
          employeeNumber:
            req.params
              .employeeNumber,
          leaveYear:
            req.query
              .leaveYear,
        });

      if (!result) {
        return res
          .status(404)
          .json({
            status:
              "error",
            message:
              "Employee not found.",
          });
      }

      return res.json({
        status:
          "success",
        data:
          result,
      });
    } catch (error) {
      return handleError(
        error,
        res
      );
    }
  }
);


router.get(
  "/requests",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const result = await getLeaveRequests({
        organizationId: req.auth.organizationId,
        status: req.query.status,
      });
      return res.json({ status: "success", data: result });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.get(
  "/consistency",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const result = await getLeaveConsistency({
        organizationId: req.auth.organizationId,
      });
      return res.json({ status: "success", data: result });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.get("/exceptions",requireAnyPermission("leave.view","employees.view"),async(req,res)=>{try{return res.json({status:"success",data:await listLeaveExceptions({organizationId:req.auth.organizationId})})}catch(error){return handleError(error,res)}});
router.post("/exceptions/:employeeNumber/investigation",requirePermission("leave.manage"),async(req,res)=>{try{return res.status(201).json({status:"success",data:await keepExceptionOpen({organizationId:req.auth.organizationId,employeeNumber:req.params.employeeNumber,actorUserId:req.auth.userId,note:req.body.note})})}catch(error){return handleError(error,res)}});
router.post("/exceptions/:employeeNumber/restore-status",requirePermission("leave.manage"),async(req,res)=>{try{return res.json({status:"success",data:await restoreWorkingStatus({organizationId:req.auth.organizationId,employeeNumber:req.params.employeeNumber,actorUserId:req.auth.userId,newStatus:req.body.newStatus,reason:req.body.reason})})}catch(error){return handleError(error,res)}});
router.post("/exceptions/:employeeNumber/reconstruct",requirePermission("leave.manage"),async(req,res)=>{try{return res.status(201).json({status:"success",data:await reconstructHistoricalLeave({organizationId:req.auth.organizationId,employeeNumber:req.params.employeeNumber,actorUserId:req.auth.userId,input:req.body})})}catch(error){return handleError(error,res)}});

router.post(
  "/requests/:id/commence",
  requirePermission("leave.manage"),
  async (req, res) => {
    try {
      const result = await commenceLeave({
        organizationId: req.auth.organizationId,
        leaveRequestId: req.params.id,
        actorUserId: req.auth.userId,
        effectiveDate: req.body.effectiveDate,
      });
      return res.json({ status: "success", data: result });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.post(
  "/requests/:id/return",
  requirePermission("leave.manage"),
  async (req, res) => {
    try {
      const result = await returnFromLeave({
        organizationId: req.auth.organizationId,
        leaveRequestId: req.params.id,
        actorUserId: req.auth.userId,
        returnDate: req.body.returnDate,
        notes: req.body.notes,
        returnDocumentationUrl: req.body.returnDocumentationUrl,
        fitnessCertificateUrl: req.body.fitnessCertificateUrl,
      });
      return res.json({ status: "success", data: result });
    } catch (error) {
      return handleError(error, res);
    }
  }
);

router.post(
  "/requests",

  requireAnyPermission("leave.request", "leave.manage"),

  async (req, res) => {
    try {
      const request =
        await submitLeaveRequest({
          organizationId:
            req.auth
              .organizationId,
          actorUserId:
            req.auth.userId,
          employeeNumber:
            req.body
              .employeeNumber,
          leaveTypeId:
            req.body.leaveTypeId,
          leavePolicyId:
            req.body.leavePolicyId,
          startDate:
            req.body
              .startDate,
          endDate:
            req.body
              .endDate,
          reason:
            req.body
              .reason,
          attachmentUrl:
            req.body
              .attachmentUrl,
        });

      return res
        .status(201)
        .json({
          status:
            "success",
          data:
            request,
        });
    } catch (error) {
      return handleError(
        error,
        res
      );
    }
  }
);

router.post(
  "/requests/:id/review",

  requireAnyPermission("leave.approve", "leave.manage"),

  async (req, res) => {
    try {
      const result =
        await reviewLeaveRequest({
          organizationId:
            req.auth
              .organizationId,
          leaveRequestId:
            req.params.id,
          reviewerUserId:
            req.auth.userId,
          decision:
            req.body
              .decision,
          reviewNotes:
            req.body
              .reviewNotes,
        });

      return res.json({
        status:
          "success",
        data:
          result,
      });
    } catch (error) {
      return handleError(
        error,
        res
      );
    }
  }
);

router.post(
  "/requests/:id/cancel",

  requirePermission("leave.manage"),

  async (req, res) => {
    try {
      const result =
        await cancelLeaveRequest({
          organizationId:
            req.auth
              .organizationId,
          leaveRequestId:
            req.params.id,
          cancellationReason:
            req.body
              .cancellationReason,
        });

      return res.json({
        status:
          "success",
        data:
          result,
      });
    } catch (error) {
      return handleError(
        error,
        res
      );
    }
  }
);

function handleError(
  error,
  res
) {
  console.error(
    "Leave operation error:",
    error
  );

  const validationErrors =
    new Set([
      "EMPLOYEE_NOT_FOUND",
      "LEAVE_TYPE_NOT_FOUND",
      "LEAVE_POLICY_NOT_FOUND",
      "TENANT_ACTIVE_LEAVE_POLICY_NOT_FOUND",
      "INVALID_LEAVE_DATES",
      "INVALID_REQUESTED_UNITS",
      "LEAVE_NOT_ELIGIBLE",
      "ATTACHMENT_REQUIRED",
      "LEAVE_REQUEST_OVERLAP",
      "INSUFFICIENT_LEAVE_BALANCE",
      "MAX_NEGATIVE_BALANCE_EXCEEDED",
      "INVALID_REVIEW_DECISION",
      "LEAVE_REQUEST_NOT_FOUND",
      "LEAVE_REQUEST_NOT_PENDING",
      "LEAVE_REQUEST_ALREADY_CANCELLED",
      "LEAVE_REQUEST_NOT_CANCELLABLE",
      "LEAVE_BALANCE_NOT_FOUND",
      "LEAVE_BALANCE_INTEGRITY_ERROR",
      "INVALID_COMMENCEMENT_DATE",
      "INVALID_RETURN_DATE",
      "LEAVE_NOT_APPROVED",
      "LEAVE_COMMENCEMENT_TOO_EARLY",
      "CURRENT_EMPLOYMENT_EPISODE_NOT_FOUND",
      "EMPLOYEE_STATUS_NOT_ELIGIBLE_FOR_LEAVE",
      "EMPLOYEE_ALREADY_ON_ACTIVE_LEAVE",
      "LEAVE_NOT_ACTIVE",
      "RETURN_BEFORE_COMMENCEMENT",
      "EMPLOYEE_STATUS_CHANGED_DURING_LEAVE",
      "INVALID_PRE_LEAVE_STATUS",
      "LEAVE_ALREADY_COMMENCED",
      "LEAVE_ALREADY_RETURNED",
      "POLICY_CODE_REQUIRED",
      "POLICY_NAME_REQUIRED",
      "INVALID_POLICY_DATES",
      "INVALID_POLICY_STATUS",
      "POLICY_TEMPLATE_NOT_FOUND",
      "RETIRED_POLICY_IMMUTABLE",
      "POLICY_VERSION_DATE_INVALID",
      "BACKDATED_LEAVE_NOT_ALLOWED",
      "MINIMUM_NOTICE_NOT_MET",
      "MINIMUM_LEAVE_DURATION_NOT_MET",
      "MAXIMUM_LEAVE_DURATION_EXCEEDED",
      "LEAVE_REASON_REQUIRED",
      "EARLY_RETURN_NOT_ALLOWED",
      "RETURN_DOCUMENTATION_REQUIRED",
      "FITNESS_CERTIFICATE_REQUIRED",
      "INVALID_POLICY_JURISDICTION",
      "EMPLOYEE_REQUIRED",
      "LEAVE_POLICY_REQUIRED",
      "INVALID_ADJUSTMENT_AMOUNT",
      "INVALID_LEAVE_YEAR",
      "ADJUSTMENT_REASON_REQUIRED",
      "INVALID_ADJUSTMENT_DATE",
      "ADJUSTMENT_EXCEEDS_AVAILABLE_BALANCE",
      "ENTITLEMENT_NOT_PROVISIONED",
      "PROVISIONING_REASON_REQUIRED",
      "MULTIPLE_POLICIES_FOR_LEAVE_TYPE",
      "INVALID_EMPLOYMENT_LEVEL",
      "EMPLOYMENT_LEVEL_NAME_REQUIRED",
      "EMPLOYMENT_LEVEL_MAPPING_REQUIRED",
      "INVALID_ENTITLEMENT",
      "INVALID_ENTITLEMENT_EFFECTIVE_DATE_SEQUENCE",
      "ACTIVE_ENTITLEMENT_MATRIX_RULE_EXISTS",
      "LEAVE_EXCEPTION_NOTE_REQUIRED",
      "LEAVE_EXCEPTION_REASON_REQUIRED",
      "INVALID_LEAVE_EXCEPTION_RETURN_STATUS",
      "INVALID_RECONSTRUCTED_LEAVE_STATUS",
      "LEAVE_EXCEPTION_NO_LONGER_ACTIVE",
      "TENANT_LEAVE_POLICY_NOT_FOUND",
      "HISTORICAL_GOVERNING_POLICY_NOT_FOUND",
    ]);

  if (
    validationErrors.has(
      error.message
    )
  ) {
    const conflictErrors = new Set([
      "LEAVE_ALREADY_COMMENCED",
      "LEAVE_ALREADY_RETURNED",
      "EMPLOYEE_ALREADY_ON_ACTIVE_LEAVE",
      "EMPLOYEE_STATUS_CHANGED_DURING_LEAVE",
    ]);
    return res
      .status(
        conflictErrors.has(error.message)
          ? 409
          : error.message ===
          "EMPLOYEE_NOT_FOUND" ||
        error.message ===
          "LEAVE_TYPE_NOT_FOUND" ||
        error.message ===
          "LEAVE_REQUEST_NOT_FOUND" ||
        error.message ===
          "POLICY_TEMPLATE_NOT_FOUND" ||
        error.message ===
          "LEAVE_POLICY_NOT_FOUND"
          ? 404
          : 400
      )
      .json({
        status:
          "error",
        code:
          error.message,
        message:
          error.message
            .replace(
              /_/g,
              " "
            )
            .toLowerCase(),
        details:
          error.details ||
          undefined,
      });
  }

  return res
    .status(500)
    .json({
      status:
        "error",
      message:
        "Unable to process leave operation.",
    });
}

module.exports =
  router;
