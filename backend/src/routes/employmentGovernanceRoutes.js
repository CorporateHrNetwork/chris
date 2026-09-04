const express = require("express");
const prisma = require("../config/prisma");
const { requireAuth, requirePermission } = require("../middleware/authMiddleware");
const {
  CONTRACT_STATES,
  CONTRACT_TRANSITIONS,
  VERIFICATION_STATUSES,
  DISCIPLINARY_STATUSES,
  createContractLifecycle,
  transitionContractLifecycle,
  addContractDocument,
  addContractDocumentEvent,
  createDisciplinaryCase,
  appendDisciplinaryEvidence,
  addDisciplinaryProcessEvent,
  addExternalProceeding,
  updateDisciplinaryCase,
  buildEmploymentDecisionEvidencePack,
  recordVerification,
} = require("../services/employmentGovernanceService");

const router = express.Router();
router.use(requireAuth);

function safeError(res, error, fallback) {
  return res.status(error?.statusCode || 400).json({
    status: "error",
    code: error?.code || "EMPLOYMENT_GOVERNANCE_ERROR",
    message: error?.message || fallback,
  });
}

router.get("/catalog", requirePermission("employees.view"), async (req, res) => {
  return res.json({
    status: "success",
    data: {
      contractStates: CONTRACT_STATES,
      contractTransitions: CONTRACT_TRANSITIONS,
      disciplinaryStatuses: DISCIPLINARY_STATUSES,
      verificationStatuses: VERIFICATION_STATUSES,
    },
  });
});

router.get("/contracts", requirePermission("employees.view"), async (req, res) => {
  const records = await prisma.employmentContractLifecycle.findMany({
    where: { organizationId: req.auth.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return res.json({ status: "success", data: records });
});

router.get("/contracts/:id", requirePermission("employees.view"), async (req, res) => {
  const lifecycle = await prisma.employmentContractLifecycle.findFirst({
    where: { id: req.params.id, organizationId: req.auth.organizationId },
  });
  if (!lifecycle) {
    return res.status(404).json({ status: "error", message: "Employment lifecycle record not found." });
  }
  const [transitions, documents] = await Promise.all([
    prisma.employmentContractTransition.findMany({
      where: { organizationId: req.auth.organizationId, lifecycleId: lifecycle.id },
      orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.employmentContractDocument.findMany({
      where: { organizationId: req.auth.organizationId, lifecycleId: lifecycle.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const documentIds = documents.map((document) => document.id);
  const documentEvents = documentIds.length
    ? await prisma.employmentContractDocumentEvent.findMany({
        where: {
          organizationId: req.auth.organizationId,
          documentId: { in: documentIds },
        },
        orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }],
      })
    : [];
  return res.json({
    status: "success",
    data: { lifecycle, transitions, documents, documentEvents },
  });
});

router.post("/contracts", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await createContractLifecycle(prisma, {
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      ...req.body,
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return safeError(res, error, "Unable to create employment lifecycle record.");
  }
});

router.post("/contracts/:id/transition", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await transitionContractLifecycle(prisma, {
      organizationId: req.auth.organizationId,
      lifecycleId: req.params.id,
      actorUserId: req.auth.userId,
      ...req.body,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return safeError(res, error, "Unable to transition employment lifecycle.");
  }
});

router.post("/contracts/:id/documents", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await addContractDocument(prisma, {
      organizationId: req.auth.organizationId,
      lifecycleId: req.params.id,
      actorUserId: req.auth.userId,
      ...req.body,
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return safeError(res, error, "Unable to record employment document.");
  }
});

router.post("/documents/:id/events", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await addContractDocumentEvent(prisma, {
      organizationId: req.auth.organizationId,
      documentId: req.params.id,
      actorUserId: req.auth.userId,
      ...req.body,
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return safeError(res, error, "Unable to record employment document event.");
  }
});

router.get("/disciplinary-cases", requirePermission("employees.view"), async (req, res) => {
  const records = await prisma.disciplinaryCase.findMany({
    where: { organizationId: req.auth.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return res.json({ status: "success", data: records });
});

router.post("/disciplinary-cases", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await createDisciplinaryCase(prisma, {
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      ...req.body,
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return safeError(res, error, "Unable to create disciplinary case.");
  }
});

router.patch("/disciplinary-cases/:id", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await updateDisciplinaryCase(prisma, {
      organizationId: req.auth.organizationId,
      caseId: req.params.id,
      ...req.body,
    });
    return res.json({ status: "success", data });
  } catch (error) {
    return safeError(res, error, "Unable to update disciplinary case.");
  }
});

router.post("/disciplinary-cases/:id/evidence", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await appendDisciplinaryEvidence(prisma, {
      organizationId: req.auth.organizationId,
      caseId: req.params.id,
      actorUserId: req.auth.userId,
      ...req.body,
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return safeError(res, error, "Unable to append disciplinary evidence.");
  }
});

router.post("/disciplinary-cases/:id/process-events", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await addDisciplinaryProcessEvent(prisma, {
      organizationId: req.auth.organizationId,
      caseId: req.params.id,
      actorUserId: req.auth.userId,
      ...req.body,
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return safeError(res, error, "Unable to append disciplinary process event.");
  }
});

router.post("/disciplinary-cases/:id/external-proceedings", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await addExternalProceeding(prisma, {
      organizationId: req.auth.organizationId,
      caseId: req.params.id,
      ...req.body,
    });
    return res.status(201).json({
      status: "success",
      message: "External proceeding linked. Internal disciplinary status was not changed.",
      data,
    });
  } catch (error) {
    return safeError(res, error, "Unable to link external proceeding.");
  }
});

router.get("/disciplinary-cases/:id/evidence-pack", requirePermission("employees.view"), async (req, res) => {
  try {
    const data = await buildEmploymentDecisionEvidencePack(
      prisma,
      req.auth.organizationId,
      req.params.id
    );
    return res.json({ status: "success", data });
  } catch (error) {
    return safeError(res, error, "Unable to build employment decision evidence pack.");
  }
});

router.get("/verifications", requirePermission("employees.view"), async (req, res) => {
  const records = await prisma.externalVerificationRecord.findMany({
    where: { organizationId: req.auth.organizationId },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return res.json({ status: "success", data: records });
});

router.post("/verifications", requirePermission("employees.update"), async (req, res) => {
  try {
    const data = await recordVerification(prisma, {
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      ...req.body,
    });
    return res.status(201).json({ status: "success", data });
  } catch (error) {
    return safeError(res, error, "Unable to record verification result.");
  }
});

module.exports = router;
