const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const prisma = require("../config/prisma");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();
router.use(requireAuth);

const DEFAULT_SECTIONS = [
  { key: "personal-details", label: "Personal Details", required: true, items: ["Name", "Phone Number", "Email Address", "Gender", "Date of Birth", "Marital Status", "Nationality", "Address", "ID Details"] },
  { key: "statutory-details", label: "Statutory Details", required: true, items: ["Tax / PAYE Information", "Pension / PFA / PIN", "NHIA / Health Information", "Other Statutory Requirements"] },
  { key: "payment-details", label: "Payment Details", required: true, items: ["Bank Name", "Account Name", "Account Number", "Payroll Currency", "Payment Method"] },
  { key: "documents", label: "Documents", required: true, items: ["CV / Resume", "Offer / Appointment Letter", "Valid ID", "Certificates", "Passport Photograph", "Other Required Documents"] },
  { key: "next-of-kin", label: "Next of Kin", required: true, items: ["Name", "Relationship", "Phone Number", "Address"] },
  { key: "emergency-contact", label: "Emergency Contact", required: true, items: ["Name", "Relationship", "Phone Number", "Alternative Phone"] },
  { key: "legal", label: "Legal", required: true, items: ["Employment Contract", "Confidentiality / NDA", "Policy Acknowledgements", "Data Privacy Consent"] },
  { key: "assets", label: "Assets", required: false, items: ["Laptop / Computer", "Phone", "ID / Access Card", "PPE", "Other Assigned Assets"] },
];

const DOCUMENT_CATEGORY_LABELS = {
  CV_RESUME: "CV / Resume",
  OFFER_APPOINTMENT: "Offer / Appointment Letter",
  VALID_ID: "Valid ID",
  CERTIFICATES: "Certificates",
  PASSPORT_PHOTO: "Passport Photograph",
  OTHER: "Other Required Documents",
};

function normalizeSections(value) {
  if (!Array.isArray(value) || !value.length) {
    return DEFAULT_SECTIONS.map((section, index) => ({
      ...section,
      order: index + 1,
    }));
  }

  return value.map((section, index) => ({
    key: String(section?.key || `section-${index + 1}`).trim(),
    label: String(section?.label || `Section ${index + 1}`).trim(),
    description: section?.description
      ? String(section.description).trim()
      : null,
    required: section?.required !== false,
    order: Number(section?.order || index + 1),
    items: Array.isArray(section?.items)
      ? section.items
          .map((item) =>
            String(item || "").trim()
          )
          .filter(Boolean)
      : [],
  }));
}

function initialSectionProgress(sections) {
  return sections.reduce(
    (accumulator, section) => {
      accumulator[section.key] = {
        label: section.label,
        required:
          section.required !== false,
        completed: false,
        completedItems: 0,
        totalItems:
          Array.isArray(section.items)
            ? section.items.length
            : 0,
      };
      return accumulator;
    },
    {}
  );
}

function normalizePersonalGender(value) {
  const normalized =
    String(value || "")
      .trim()
      .toUpperCase();

  return [
    "MALE",
    "FEMALE",
    "OTHER",
    "UNSPECIFIED",
  ].includes(normalized)
    ? normalized
    : "UNSPECIFIED";
}

function splitPersonalName(value) {
  const parts =
    String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  return {
    firstName: parts[0],
    middleName:
      parts.length > 2
        ? parts.slice(1, -1).join(" ")
        : null,
    lastName:
      parts[parts.length - 1],
  };
}

function hasText(value) {
  return Boolean(
    String(value || "").trim()
  );
}

function completedStatus(value) {
  return [
    "Completed",
    "Not Applicable",
  ].includes(
    String(value || "").trim()
  );
}

function buildCompletion(sectionKey, data, documents) {
  switch (sectionKey) {
    case "personal-details": {
      const keys = [];
      if (hasText(data.fullName)) keys.push("Name");
      if (hasText(data.phone)) keys.push("Phone Number");
      if (hasText(data.email)) keys.push("Email Address");
      if (data.gender && data.gender !== "UNSPECIFIED") keys.push("Gender");
      if (data.dateOfBirth) keys.push("Date of Birth");
      if (data.maritalStatus) keys.push("Marital Status");
      if (hasText(data.nationality)) keys.push("Nationality");
      if (hasText(data.residentialAddress)) keys.push("Address");
      if (hasText(data.idType) && hasText(data.idNumber)) keys.push("ID Details");
      return keys;
    }

    case "statutory-details": {
      const keys = [];
      if (hasText(data.taxIdentificationNumber) && hasText(data.payeState)) {
        keys.push("Tax / PAYE Information");
      }
      if (hasText(data.pensionPfa) && hasText(data.pensionPin)) {
        keys.push("Pension / PFA / PIN");
      }
      if (hasText(data.nhiaNumber)) {
        keys.push("NHIA / Health Information");
      }
      if (completedStatus(data.otherStatutoryStatus)) {
        keys.push("Other Statutory Requirements");
      }
      return keys;
    }

    case "payment-details": {
      const keys = [];
      if (hasText(data.bankName)) keys.push("Bank Name");
      if (hasText(data.accountName)) keys.push("Account Name");
      if (hasText(data.accountNumber)) keys.push("Account Number");
      if (hasText(data.payrollCurrency)) keys.push("Payroll Currency");
      if (hasText(data.paymentMethod)) keys.push("Payment Method");
      return keys;
    }

    case "next-of-kin": {
      const keys = [];
      if (hasText(data.name)) keys.push("Name");
      if (hasText(data.relationship)) keys.push("Relationship");
      if (hasText(data.phoneNumber)) keys.push("Phone Number");
      if (hasText(data.address)) keys.push("Address");
      return keys;
    }

    case "emergency-contact": {
      const keys = [];
      if (hasText(data.name)) keys.push("Name");
      if (hasText(data.relationship)) keys.push("Relationship");
      if (hasText(data.phoneNumber)) keys.push("Phone Number");
      if (hasText(data.alternativePhone)) keys.push("Alternative Phone");
      return keys;
    }

    case "legal": {
      const keys = [];
      if (completedStatus(data.employmentContractStatus)) {
        keys.push("Employment Contract");
      }
      if (completedStatus(data.ndaStatus)) {
        keys.push("Confidentiality / NDA");
      }
      if (completedStatus(data.policyAcknowledgementStatus)) {
        keys.push("Policy Acknowledgements");
      }
      if (completedStatus(data.dataPrivacyConsentStatus)) {
        keys.push("Data Privacy Consent");
      }
      return keys;
    }

    case "assets": {
      const keys = [];
      if (hasText(data.laptopComputer)) keys.push("Laptop / Computer");
      if (hasText(data.phoneAsset)) keys.push("Phone");
      if (hasText(data.accessCard)) keys.push("ID / Access Card");
      if (hasText(data.ppe)) keys.push("PPE");
      if (hasText(data.otherAssets)) keys.push("Other Assigned Assets");
      return keys;
    }

    case "documents": {
      const labels = new Set(
        (documents || []).map(
          (document) =>
            DOCUMENT_CATEGORY_LABELS[
              document.category
            ]
        )
      );

      return DEFAULT_SECTIONS
        .find(
          (section) =>
            section.key === "documents"
        )
        .items
        .filter((item) =>
          labels.has(item)
        );
    }

    default:
      return [];
  }
}

function calculateProgress(sections, progress) {
  const required =
    sections.filter(
      (section) =>
        section.required !== false
    );

  if (!required.length) {
    return 100;
  }

  const done =
    required.filter(
      (section) =>
        progress?.[
          section.key
        ]?.completed === true
    ).length;

  return Math.round(
    (done / required.length) * 100
  );
}

async function applySectionProgress({
  onboarding,
  section,
  sectionKey,
  sectionData,
  completedItemKeys,
  userId,
}) {
  const sectionProgress = {
    ...(onboarding.sectionProgress || {}),
  };

  const previous =
    sectionProgress[sectionKey] || {};

  const completedItems =
    completedItemKeys.length;

  const completed =
    completedItems >=
    section.items.length;

  sectionProgress[sectionKey] = {
    ...previous,
    completed,
    completedItems,
    completedItemKeys,
    totalItems:
      section.items.length,
    updatedAt:
      new Date().toISOString(),
    updatedByUserId:
      userId || null,
  };

  const sections =
    normalizeSections(
      onboarding.template.sections
    );

  const completionPercent =
    calculateProgress(
      sections,
      sectionProgress
    );

  const nextSection =
    sections.find(
      (item) =>
        sectionProgress[
          item.key
        ]?.completed !== true
    );

  const onboardingCompleted =
    completionPercent === 100;

  return prisma.employeeOnboarding.update({
    where: {
      id: onboarding.id,
    },
    data: {
      sectionProgress,
      sectionData,
      completionPercent,
      currentStage:
        onboardingCompleted
          ? "Completed"
          : nextSection?.label ||
            onboarding.currentStage,
      status:
        onboardingCompleted
          ? "COMPLETED"
          : "IN_PROGRESS",
      completedAt:
        onboardingCompleted
          ? new Date()
          : null,
      completedByUserId:
        onboardingCompleted
          ? userId || null
          : null,
    },
    include: {
      employee: true,
      template: true,
    },
  });
}

router.get(
  "/templates",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const data =
        await prisma.onboardingWorkflowTemplate.findMany({
          where: {
            organizationId:
              req.auth.organizationId,
          },
          orderBy: [
            { isActive: "desc" },
            { createdAt: "desc" },
          ],
        });

      return res.json({
        status: "success",
        data,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        status: "error",
        message:
          "Unable to load onboarding workflows.",
      });
    }
  }
);

router.post(
  "/templates",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const name =
        String(
          req.body?.name || ""
        ).trim();

      if (!name) {
        return res.status(400).json({
          status: "error",
          message:
            "Onboarding workflow name is required.",
        });
      }

      const sections =
        normalizeSections(
          req.body?.sections
        );

      const code =
        String(
          req.body?.code ||
            name
              .toUpperCase()
              .replace(
                /[^A-Z0-9]+/g,
                "_"
              )
              .replace(
                /^_+|_+$/g,
                ""
              )
        );

      const data =
        await prisma.onboardingWorkflowTemplate.create({
          data: {
            organizationId:
              req.auth.organizationId,
            name,
            code,
            employmentType:
              req.body?.employmentType
                ? String(
                    req.body
                      .employmentType
                  ).trim()
                : null,
            sections,
            isActive:
              req.body?.isActive !== false,
            createdByUserId:
              req.auth.userId || null,
          },
        });

      return res.status(201).json({
        status: "success",
        message:
          "Onboarding workflow created successfully.",
        data,
      });
    } catch (error) {
      console.error(error);

      if (error.code === "P2002") {
        return res.status(409).json({
          status: "error",
          message:
            "An onboarding workflow already uses this name or code.",
        });
      }

      return res.status(500).json({
        status: "error",
        message:
          "Unable to create onboarding workflow.",
      });
    }
  }
);

router.get(
  "/status",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const data =
        await prisma.employeeOnboarding.findMany({
          where: {
            organizationId:
              req.auth.organizationId,
          },
          include: {
            employee: {
              select: {
                id: true,
                employeeNumber: true,
                firstName: true,
                middleName: true,
                lastName: true,
                email: true,
                phone: true,
                gender: true,
                status: true,
                hireDate: true,
                confirmationDate: true,
              },
            },
            template: true,
            assignedTo: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
        });

      return res.json({
        status: "success",
        data,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        status: "error",
        message:
          "Unable to load onboarding status.",
      });
    }
  }
);


router.get(
  "/payment/banks",
  requirePermission("employees.view"),
  async (req, res) => {
    const fallbackBanks = [
      { name: "Access Bank", code: "044" },
      { name: "Citibank Nigeria", code: "023" },
      { name: "Ecobank Nigeria", code: "050" },
      { name: "Fidelity Bank", code: "070" },
      { name: "First Bank of Nigeria", code: "011" },
      { name: "First City Monument Bank", code: "214" },
      { name: "Guaranty Trust Bank", code: "058" },
      { name: "Jaiz Bank", code: "301" },
      { name: "Keystone Bank", code: "082" },
      { name: "Polaris Bank", code: "076" },
      { name: "Providus Bank", code: "101" },
      { name: "Stanbic IBTC Bank", code: "221" },
      { name: "Standard Chartered Bank", code: "068" },
      { name: "Sterling Bank", code: "232" },
      { name: "Union Bank of Nigeria", code: "032" },
      { name: "United Bank for Africa", code: "033" },
      { name: "Unity Bank", code: "215" },
      { name: "Wema Bank", code: "035" },
      { name: "Zenith Bank", code: "057" },
    ];

    try {
      const secretKey =
        String(
          process.env
            .PAYSTACK_SECRET_KEY ||
            ""
        ).trim();

      if (!secretKey) {
        return res.json({
          status: "success",
          source: "fallback",
          data: fallbackBanks,
        });
      }

      const response =
        await fetch(
          "https://api.paystack.co/bank?country=nigeria&perPage=100",
          {
            headers: {
              Authorization:
                `Bearer ${secretKey}`,
            },
          }
        );

      const payload =
        await response.json();

      if (
        !response.ok ||
        !payload?.status ||
        !Array.isArray(
          payload?.data
        )
      ) {
        return res.json({
          status: "success",
          source: "fallback",
          data: fallbackBanks,
        });
      }

      const banks =
        payload.data
          .map((bank) => ({
            name:
              bank.name,
            code:
              bank.code,
          }))
          .filter(
            (bank) =>
              bank.name &&
              bank.code
          )
          .sort(
            (left, right) =>
              left.name.localeCompare(
                right.name
              )
          );

      return res.json({
        status: "success",
        source: "paystack",
        data: banks,
      });
    } catch (error) {
      console.error(
        "Load Nigeria banks error:",
        error
      );

      return res.json({
        status: "success",
        source: "fallback",
        data: fallbackBanks,
      });
    }
  }
);

router.post(
  "/payment/resolve-account",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const secretKey =
        String(
          process.env
            .PAYSTACK_SECRET_KEY ||
            ""
        ).trim();

      if (!secretKey) {
        return res.status(503).json({
          status: "error",
          code:
            "BANK_VERIFICATION_NOT_CONFIGURED",
          message:
            "Bank account verification is not configured. Add PAYSTACK_SECRET_KEY to the CHRIS backend environment.",
        });
      }

      const bankCode =
        String(
          req.body?.bankCode ||
          ""
        ).trim();

      const accountNumber =
        String(
          req.body?.accountNumber ||
          ""
        )
          .replace(/\D/g, "")
          .slice(0, 10);

      if (!bankCode) {
        return res.status(400).json({
          status: "error",
          message:
            "Select a bank first.",
        });
      }

      if (
        accountNumber.length !==
        10
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "Enter a valid 10-digit Nigerian account number.",
        });
      }

      const url =
        new URL(
          "https://api.paystack.co/bank/resolve"
        );

      url.searchParams.set(
        "account_number",
        accountNumber
      );

      url.searchParams.set(
        "bank_code",
        bankCode
      );

      const response =
        await fetch(
          url,
          {
            headers: {
              Authorization:
                `Bearer ${secretKey}`,
            },
          }
        );

      const payload =
        await response.json();

      if (
        !response.ok ||
        !payload?.status ||
        !payload?.data
          ?.account_name
      ) {
        return res.status(400).json({
          status: "error",
          message:
            payload?.message ||
            "Account name could not be resolved. Confirm the bank and account number.",
        });
      }

      return res.json({
        status: "success",
        message:
          "Bank account verified successfully.",
        data: {
          accountNumber:
            payload.data
              .account_number ||
            accountNumber,
          accountName:
            payload.data
              .account_name,
          bankCode,
        },
      });
    } catch (error) {
      console.error(
        "Resolve bank account error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to verify bank account at this time.",
      });
    }
  }
);

router.post(
  "/:employeeNumber",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const employee =
        await prisma.employee.findFirst({
          where: {
            organizationId,
            employeeNumber:
              req.params.employeeNumber,
          },
        });

      if (!employee) {
        return res.status(404).json({
          status: "error",
          message:
            "Employee not found.",
        });
      }

      const template =
        await prisma.onboardingWorkflowTemplate.findFirst({
          where: {
            id:
              req.body?.templateId,
            organizationId,
            isActive: true,
          },
        });

      if (!template) {
        return res.status(400).json({
          status: "error",
          message:
            "Select an active onboarding workflow.",
        });
      }

      const existing =
        await prisma.employeeOnboarding.findFirst({
          where: {
            organizationId,
            employeeId:
              employee.id,
            status: {
              not: "COMPLETED",
            },
          },
        });

      if (existing) {
        return res.status(409).json({
          status: "error",
          message:
            "This employee already has an active onboarding process.",
        });
      }

      const sections =
        normalizeSections(
          template.sections
        );

      const data =
        await prisma.employeeOnboarding.create({
          data: {
            organizationId,
            employeeId:
              employee.id,
            templateId:
              template.id,
            assignedToUserId:
              req.auth.userId || null,
            createdByUserId:
              req.auth.userId || null,
            status: "IN_PROGRESS",
            completionPercent: 0,
            currentStage:
              sections[0]?.label ||
              null,
            sectionProgress:
              initialSectionProgress(
                sections
              ),
            startedAt:
              new Date(),
          },
          include: {
            employee: true,
            template: true,
          },
        });

      return res.status(201).json({
        status: "success",
        message:
          "Employee onboarding started successfully.",
        data,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        status: "error",
        message:
          "Unable to start employee onboarding.",
      });
    }
  }
);

const uploadRoot =
  path.join(
    process.cwd(),
    "uploads",
    "onboarding-documents"
  );

fs.mkdirSync(
  uploadRoot,
  { recursive: true }
);

const storage =
  multer.diskStorage({
    destination:
      (req, file, callback) => {
        callback(
          null,
          uploadRoot
        );
      },
    filename:
      (req, file, callback) => {
        const safeOriginal =
          String(
            file.originalname || "document"
          )
            .replace(
              /[^A-Za-z0-9._-]+/g,
              "_"
            )
            .slice(-120);

        callback(
          null,
          `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 10)}-${safeOriginal}`
        );
      },
  });

const upload =
  multer({
    storage,
    limits: {
      fileSize:
        10 * 1024 * 1024,
    },
  });

router.get(
  "/records/:id/documents",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const onboarding =
        await prisma.employeeOnboarding.findFirst({
          where: {
            id: req.params.id,
            organizationId:
              req.auth.organizationId,
          },
          select: {
            id: true,
          },
        });

      if (!onboarding) {
        return res.status(404).json({
          status: "error",
          message:
            "Employee onboarding record not found.",
        });
      }

      const data =
        await prisma.employeeDocument.findMany({
          where: {
            organizationId:
              req.auth.organizationId,
            onboardingId:
              onboarding.id,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

      return res.json({
        status: "success",
        data:
          data.map((document) => ({
            ...document,
            categoryLabel:
              DOCUMENT_CATEGORY_LABELS[
                document.category
              ] || document.category,
          })),
      });
    } catch (error) {
      console.error(
        "Load onboarding documents error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to load onboarding documents.",
      });
    }
  }
);

router.post(
  "/records/:id/documents",
  requirePermission("employees.update"),
  upload.single("document"),
  async (req, res) => {
    try {
      const onboarding =
        await prisma.employeeOnboarding.findFirst({
          where: {
            id: req.params.id,
            organizationId:
              req.auth.organizationId,
          },
          include: {
            template: true,
          },
        });

      if (!onboarding) {
        if (req.file?.path) {
          fs.unlink(
            req.file.path,
            () => {}
          );
        }

        return res.status(404).json({
          status: "error",
          message:
            "Employee onboarding record not found.",
        });
      }

      const category =
        String(
          req.body?.category || ""
        )
          .trim()
          .toUpperCase();

      if (
        !DOCUMENT_CATEGORY_LABELS[
          category
        ]
      ) {
        if (req.file?.path) {
          fs.unlink(
            req.file.path,
            () => {}
          );
        }

        return res.status(400).json({
          status: "error",
          message:
            "Select a valid document type.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          status: "error",
          message:
            "Choose a document to upload.",
        });
      }

      const document =
        await prisma.employeeDocument.create({
          data: {
            organizationId:
              req.auth.organizationId,
            employeeId:
              onboarding.employeeId,
            onboardingId:
              onboarding.id,
            category,
            originalName:
              req.file.originalname,
            storedName:
              req.file.filename,
            mimeType:
              req.file.mimetype,
            sizeBytes:
              req.file.size,
            storagePath:
              req.file.path,
            notes:
              req.body?.notes
                ? String(
                    req.body.notes
                  ).trim()
                : null,
            uploadedByUserId:
              req.auth.userId || null,
          },
        });

      const documents =
        await prisma.employeeDocument.findMany({
          where: {
            organizationId:
              req.auth.organizationId,
            onboardingId:
              onboarding.id,
          },
        });

      const sections =
        normalizeSections(
          onboarding.template.sections
        );

      const section =
        sections.find(
          (item) =>
            item.key === "documents"
        );

      const sectionData = {
        ...(onboarding.sectionData || {}),
      };

      sectionData.documents = {
        uploadedCount:
          documents.length,
        lastUploadedAt:
          new Date().toISOString(),
      };

      const completedItemKeys =
        buildCompletion(
          "documents",
          sectionData.documents,
          documents
        );

      const updatedOnboarding =
        await applySectionProgress({
          onboarding,
          section,
          sectionKey:
            "documents",
          sectionData,
          completedItemKeys,
          userId:
            req.auth.userId,
        });

      return res.status(201).json({
        status: "success",
        message:
          "Employee document uploaded successfully.",
        data: {
          ...document,
          categoryLabel:
            DOCUMENT_CATEGORY_LABELS[
              document.category
            ],
        },
        onboarding:
          updatedOnboarding,
      });
    } catch (error) {
      console.error(
        "Upload onboarding document error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to upload employee document.",
      });
    }
  }
);

async function recalculateDocumentsProgress({
  onboardingId,
  organizationId,
  userId,
}) {
  const onboarding = await prisma.employeeOnboarding.findFirst({
    where: { id: onboardingId, organizationId },
    include: { template: true },
  });

  if (!onboarding) return null;

  const documents = await prisma.employeeDocument.findMany({
    where: { organizationId, onboardingId },
  });

  const sections = normalizeSections(onboarding.template.sections);
  const section = sections.find((item) => item.key === "documents");

  if (!section) return onboarding;

  const sectionData = { ...(onboarding.sectionData || {}) };
  sectionData.documents = {
    uploadedCount: documents.length,
    lastUpdatedAt: new Date().toISOString(),
  };

  const completedItemKeys = buildCompletion(
    "documents",
    sectionData.documents,
    documents
  );

  return applySectionProgress({
    onboarding,
    section,
    sectionKey: "documents",
    sectionData,
    completedItemKeys,
    userId,
  });
}

router.delete(
  "/records/:id/documents/:documentId",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const onboarding = await prisma.employeeOnboarding.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.auth.organizationId,
        },
        select: { id: true },
      });

      if (!onboarding) {
        return res.status(404).json({
          status: "error",
          message: "Employee onboarding record not found.",
        });
      }

      const document = await prisma.employeeDocument.findFirst({
        where: {
          id: req.params.documentId,
          onboardingId: onboarding.id,
          organizationId: req.auth.organizationId,
        },
      });

      if (!document) {
        return res.status(404).json({
          status: "error",
          message: "Employee document not found.",
        });
      }

      await prisma.employeeDocument.delete({
        where: { id: document.id },
      });

      if (document.storagePath && fs.existsSync(document.storagePath)) {
        try {
          fs.unlinkSync(document.storagePath);
        } catch (fileError) {
          console.error("Delete onboarding document file error:", fileError);
        }
      }

      const updatedOnboarding = await recalculateDocumentsProgress({
        onboardingId: onboarding.id,
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
      });

      return res.json({
        status: "success",
        message: "Employee document deleted successfully.",
        onboarding: updatedOnboarding,
      });
    } catch (error) {
      console.error("Delete onboarding document error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to delete employee document.",
      });
    }
  }
);

router.post(
  "/records/:id/documents/:documentId/replace",
  requirePermission("employees.update"),
  upload.single("document"),
  async (req, res) => {
    try {
      const onboarding = await prisma.employeeOnboarding.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.auth.organizationId,
        },
        select: { id: true },
      });

      if (!onboarding) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(404).json({
          status: "error",
          message: "Employee onboarding record not found.",
        });
      }

      const existingDocument = await prisma.employeeDocument.findFirst({
        where: {
          id: req.params.documentId,
          onboardingId: onboarding.id,
          organizationId: req.auth.organizationId,
        },
      });

      if (!existingDocument) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return res.status(404).json({
          status: "error",
          message: "Employee document not found.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          status: "error",
          message: "Choose the replacement document.",
        });
      }

      const category = String(
        req.body?.category || existingDocument.category
      ).trim().toUpperCase();

      if (!DOCUMENT_CATEGORY_LABELS[category]) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          status: "error",
          message: "Select a valid document type.",
        });
      }

      let updatedDocument;
      try {
        updatedDocument = await prisma.employeeDocument.update({
          where: { id: existingDocument.id },
          data: {
            category,
            originalName: req.file.originalname,
            storedName: req.file.filename,
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
            storagePath: req.file.path,
            notes: req.body?.notes
              ? String(req.body.notes).trim()
              : existingDocument.notes,
            uploadedByUserId: req.auth.userId || null,
          },
        });
      } catch (updateError) {
        fs.unlink(req.file.path, () => {});
        throw updateError;
      }

      if (
        existingDocument.storagePath &&
        existingDocument.storagePath !== updatedDocument.storagePath &&
        fs.existsSync(existingDocument.storagePath)
      ) {
        try {
          fs.unlinkSync(existingDocument.storagePath);
        } catch (fileError) {
          console.error("Delete replaced onboarding file error:", fileError);
        }
      }

      const updatedOnboarding = await recalculateDocumentsProgress({
        onboardingId: onboarding.id,
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
      });

      return res.json({
        status: "success",
        message: "Employee document replaced successfully.",
        data: {
          ...updatedDocument,
          categoryLabel:
            DOCUMENT_CATEGORY_LABELS[updatedDocument.category] ||
            updatedDocument.category,
        },
        onboarding: updatedOnboarding,
      });
    } catch (error) {
      console.error("Replace onboarding document error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to replace employee document.",
      });
    }
  }
);
router.patch(
  "/records/:id/sections/:sectionKey",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const onboarding =
        await prisma.employeeOnboarding.findFirst({
          where: {
            id: req.params.id,
            organizationId:
              req.auth.organizationId,
          },
          include: {
            template: true,
            employee: {
              include: {
                user: true,
              },
            },
          },
        });

      if (!onboarding) {
        return res.status(404).json({
          status: "error",
          message:
            "Employee onboarding record not found.",
        });
      }

      const sections =
        normalizeSections(
          onboarding.template.sections
        );

      const section =
        sections.find(
          (item) =>
            item.key ===
            req.params.sectionKey
        );

      if (!section) {
        return res.status(404).json({
          status: "error",
          message:
            "Onboarding section not found.",
        });
      }

      if (
        req.params.sectionKey ===
        "documents"
      ) {
        return res.status(400).json({
          status: "error",
          message:
            "Use the document upload control to update Documents.",
        });
      }

      const sectionData = {
        ...(onboarding.sectionData || {}),
      };

      const incomingData = {
        ...(req.body?.data || {}),
      };

      if (
        req.params.sectionKey ===
        "personal-details"
      ) {
        const personal = {
          ...(
            sectionData[
              "personal-details"
            ] || {}
          ),
          ...incomingData,
        };

        const normalizedName =
          splitPersonalName(
            personal.fullName
          );

        if (!normalizedName) {
          return res.status(400).json({
            status: "error",
            message:
              "Enter at least the employee's first and last name.",
          });
        }

        const normalizedEmail =
          String(
            personal.email || ""
          )
            .trim()
            .toLowerCase();

        const normalizedPhone =
          String(
            personal.phone || ""
          ).trim();

        if (
          !normalizedEmail ||
          !normalizedPhone
        ) {
          return res.status(400).json({
            status: "error",
            message:
              "Email address and phone number are required.",
          });
        }

        const duplicateEmail =
          await prisma.employee.findFirst({
            where: {
              organizationId:
                req.auth.organizationId,
              email: normalizedEmail,
              NOT: {
                id:
                  onboarding.employeeId,
              },
            },
            select: {
              id: true,
            },
          });

        if (duplicateEmail) {
          return res.status(409).json({
            status: "error",
            message:
              "Another employee already uses this email address.",
          });
        }

        personal.fullName = [
          normalizedName.firstName,
          normalizedName.middleName,
          normalizedName.lastName,
        ]
          .filter(Boolean)
          .join(" ");

        personal.email =
          normalizedEmail;

        personal.phone =
          normalizedPhone;

        personal.gender =
          normalizePersonalGender(
            personal.gender
          );

        sectionData[
          "personal-details"
        ] = personal;

        await prisma.$transaction(
          async (tx) => {
            await tx.employee.update({
              where: {
                id:
                  onboarding.employeeId,
              },
              data: {
                firstName:
                  normalizedName.firstName,
                middleName:
                  normalizedName.middleName,
                lastName:
                  normalizedName.lastName,
                email:
                  normalizedEmail,
                phone:
                  normalizedPhone,
                gender:
                  personal.gender,
              },
            });

            if (
              onboarding.employee.user?.id
            ) {
              await tx.user.update({
                where: {
                  id:
                    onboarding.employee
                      .user.id,
                },
                data: {
                  firstName:
                    normalizedName.firstName,
                  lastName:
                    normalizedName.lastName,
                  email:
                    normalizedEmail,
                },
              });
            }
          }
        );
      } else {
        sectionData[
          req.params.sectionKey
        ] = {
          ...(
            sectionData[
              req.params.sectionKey
            ] || {}
          ),
          ...incomingData,
        };
      }

      const savedData =
        sectionData[
          req.params.sectionKey
        ] || {};

      const completedItemKeys =
        buildCompletion(
          req.params.sectionKey,
          savedData
        );

      const data =
        await applySectionProgress({
          onboarding,
          section,
          sectionKey:
            req.params.sectionKey,
          sectionData,
          completedItemKeys,
          userId:
            req.auth.userId,
        });

      return res.json({
        status: "success",
        message:
          `${section.label} saved successfully.`,
        data,
      });
    } catch (error) {
      console.error(
        "Update onboarding section error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to update onboarding section.",
      });
    }
  }
);

module.exports = router;
