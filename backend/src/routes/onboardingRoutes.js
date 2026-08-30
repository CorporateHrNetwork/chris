const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const prisma = require("../config/prisma");
const {
  resolveEmploymentLevelFromDesignation,
} = require("../services/designationEmploymentLevelService");
const {
  requireAuth,
  requirePermission,
} = require("../middleware/authMiddleware");
const {
  createTasksFromTemplate,
  listOnboardingTasks,
  serializeTask,
  updateOnboardingTask,
} = require("../services/employeeOnboardingTaskService");
const {
  assertTenantNinAvailable,
} = require("../services/employeeIdentityService");
const {
  validateOnboardingSection,
} = require("../services/onboardingSectionValidationService");

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
  finalizeSection = true,
}) {
  const sectionProgress = {
    ...(onboarding.sectionProgress || {}),
  };

  const previous =
    sectionProgress[sectionKey] || {};

  const completedItems =
    completedItemKeys.length;

  const completed = finalizeSection
    ? completedItems >= section.items.length
    : previous.completed === true;

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

  if (onboardingCompleted) {
    const employee = await prisma.employee.findFirst({
      where: {
        id: onboarding.employeeId,
        organizationId: onboarding.organizationId,
      },
      select: { designationId: true },
    });
    await resolveEmploymentLevelFromDesignation({
      organizationId: onboarding.organizationId,
      designationId: employee?.designationId,
    });
  }

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
          ? "Ready for Completion"
          : nextSection?.label ||
            onboarding.currentStage,
      status:
        onboardingCompleted
          ? "READY_FOR_ACTIVATION"
          : "IN_PROGRESS",
      completedAt: null,
      completedByUserId: null,
    },
    include: {
      employee: true,
      template: true,
    },
  });
}

function hasMeaningfulSectionInput(value) {
  if (Array.isArray(value)) return value.some(hasMeaningfulSectionInput);
  if (value && typeof value === "object") {
    return Object.values(value).some(hasMeaningfulSectionInput);
  }
  return value !== null && value !== undefined && String(value).trim() !== "";
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
      const rows =
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
                department: true,
                designation: {
                  include: { employmentLevel: true },
                },
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
            tasks: {
              include: {
                owner: { select: { id: true, firstName: true, lastName: true, email: true } },
                completedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
        });

      /*
       * A legacy duplicate may exist where an active onboarding row was
       * created before the employee's completed onboarding row. That stale
       * row must never appear as a second current onboarding record.
       *
       * Preserve a genuinely later onboarding (for example, a future
       * employment episode) by comparing its creation time with the latest
       * completed onboarding boundary instead of blindly hiding all history.
       */
      const latestCompletedByEmployee = new Map();

      for (const record of rows) {
        if (record.status !== "COMPLETED") {
          continue;
        }

        const current =
          latestCompletedByEmployee.get(record.employeeId);
        const recordBoundary = new Date(
          record.completedAt ||
            record.updatedAt ||
            record.createdAt ||
            0
        ).getTime();
        const currentBoundary = current
          ? new Date(
              current.completedAt ||
                current.updatedAt ||
                current.createdAt ||
                0
            ).getTime()
          : -1;

        if (!current || recordBoundary > currentBoundary) {
          latestCompletedByEmployee.set(
            record.employeeId,
            record
          );
        }
      }

      const isStaleActiveRecord = (record) => {
        if (record.status === "COMPLETED") {
          return false;
        }

        const completed =
          latestCompletedByEmployee.get(record.employeeId);

        if (!completed) {
          return false;
        }

        const activeCreatedAt =
          new Date(record.createdAt || 0).getTime();
        const completedBoundary =
          new Date(
            completed.completedAt ||
              completed.updatedAt ||
              completed.createdAt ||
              0
          ).getTime();

        return (
          Number.isFinite(activeCreatedAt) &&
          Number.isFinite(completedBoundary) &&
          activeCreatedAt <= completedBoundary
        );
      };

      const preferredActiveOnboardingByEmployee = new Map();

      for (const record of rows) {
        if (
          record.status === "COMPLETED" ||
          isStaleActiveRecord(record)
        ) {
          continue;
        }

        const key = record.employeeId;
        const current =
          preferredActiveOnboardingByEmployee.get(key);

        if (!current) {
          preferredActiveOnboardingByEmployee.set(
            key,
            record
          );
          continue;
        }

        const recordProgress =
          Number(record.completionPercent || 0);
        const currentProgress =
          Number(current.completionPercent || 0);

        const recordUpdatedAt =
          new Date(record.updatedAt || 0).getTime();
        const currentUpdatedAt =
          new Date(current.updatedAt || 0).getTime();

        if (
          recordProgress > currentProgress ||
          (
            recordProgress === currentProgress &&
            recordUpdatedAt > currentUpdatedAt
          )
        ) {
          preferredActiveOnboardingByEmployee.set(
            key,
            record
          );
        }
      }

      const visibleRows = rows.filter((record) => {
        if (record.status === "COMPLETED") {
          return true;
        }

        if (isStaleActiveRecord(record)) {
          return false;
        }

        return (
          preferredActiveOnboardingByEmployee.get(
            record.employeeId
          )?.id === record.id
        );
      });

      const data = visibleRows.map((record) => {
        const onboardingCompleted = record.status === "COMPLETED" || Number(record.completionPercent || 0) >= 100;
        const tasks = (record.tasks || []).map((task) =>
          serializeTask(task, new Date(), record.sectionProgress, onboardingCompleted)
        );
        return {
          ...record,
          tasks,
          taskSummary: {
            total: tasks.length,
            outstanding: tasks.filter((task) => !["COMPLETED", "NOT_APPLICABLE"].includes(task.status)).length,
            overdue: tasks.filter((task) => task.isOverdue).length,
          },
        };
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
          include: {
            designation: {
              include: { employmentLevel: true },
            },
          },
        });

      if (!employee) {
        return res.status(404).json({
          status: "error",
          message:
            "Employee not found.",
        });
      }

      try {
        await resolveEmploymentLevelFromDesignation({
          organizationId,
          designationId: employee.designationId,
        });
      } catch (levelError) {
        if (["EMPLOYMENT_LEVEL_MAPPING_REQUIRED", "DESIGNATION_REQUIRED"].includes(levelError.message)) {
          return res.status(400).json({
            status: "error",
            code: "EMPLOYMENT_LEVEL_MAPPING_REQUIRED",
            message:
              "Configure the employee's designation and Employment Level before starting onboarding.",
          });
        }
        throw levelError;
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

      const [existing, latestCompleted] =
        await Promise.all([
          prisma.employeeOnboarding.findFirst({
            where: {
              organizationId,
              employeeId: employee.id,
              status: { not: "COMPLETED" },
            },
            orderBy: [
              { completionPercent: "desc" },
              { updatedAt: "desc" },
            ],
          }),
          prisma.employeeOnboarding.findFirst({
            where: {
              organizationId,
              employeeId: employee.id,
              status: "COMPLETED",
            },
            orderBy: [
              { completedAt: "desc" },
              { updatedAt: "desc" },
            ],
          }),
        ]);

      if (existing && latestCompleted) {
        const activeCreatedAt =
          new Date(existing.createdAt || 0).getTime();
        const completedBoundary =
          new Date(
            latestCompleted.completedAt ||
              latestCompleted.updatedAt ||
              latestCompleted.createdAt ||
              0
          ).getTime();

        if (activeCreatedAt <= completedBoundary) {
          return res.json({
            status: "success",
            code: "ONBOARDING_ALREADY_COMPLETED",
            message:
              "This employee's onboarding is already completed. Review the completed onboarding record.",
            data: latestCompleted,
          });
        }
      }

      if (existing) {
        return res.json({
          status: "success",
          code: "ACTIVE_ONBOARDING_REUSED",
          message:
            "Existing active onboarding opened.",
          data: existing,
        });
      }

      if (latestCompleted) {
        return res.json({
          status: "success",
          code: "ONBOARDING_ALREADY_COMPLETED",
          message:
            "This employee's onboarding is already completed. Review the completed onboarding record.",
          data: latestCompleted,
        });
      }

      const sections =
        normalizeSections(
          template.sections
        );

      const data = await prisma.$transaction(async (tx) => {
        const onboarding = await tx.employeeOnboarding.create({
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
          select: { id: true },
        });

        await createTasksFromTemplate(tx, {
          organizationId,
          onboardingId: onboarding.id,
          sections,
        });
        return tx.employeeOnboarding.findUnique({
          where: { id: onboarding.id },
          include: { employee: true, template: true, tasks: true },
        });
      });

      return res.status(201).json({
        status: "success",
        message:
          "Employee onboarding started successfully.",
        data,
      });
    } catch (error) {
      console.error(error);
      if (["EMPLOYMENT_LEVEL_MAPPING_REQUIRED", "DESIGNATION_REQUIRED"].includes(error.message)) {
        return res.status(400).json({
          status: "error",
          code: "EMPLOYMENT_LEVEL_MAPPING_REQUIRED",
          message:
            "Onboarding cannot start until the employee's designation has an active Employment Level.",
        });
      }

      return res.status(500).json({
        status: "error",
        message:
          "Unable to start employee onboarding.",
      });
    }
  }
);

router.get(
  "/task-owners",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const data = await prisma.user.findMany({
        where: { organizationId: req.auth.organizationId, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
      });
      return res.json({ status: "success", data });
    } catch (error) {
      console.error("Load onboarding task owners error:", error);
      return res.status(500).json({ status: "error", message: "Unable to load onboarding task owners." });
    }
  }
);

router.get(
  "/records/:id/tasks",
  requirePermission("employees.view"),
  async (req, res) => {
    try {
      const data = await listOnboardingTasks(prisma, {
        organizationId: req.auth.organizationId,
        onboardingId: req.params.id,
      });
      return res.json({ status: "success", data });
    } catch (error) {
      const status = error.code === "ONBOARDING_NOT_FOUND" ? 404 : 500;
      if (status === 500) console.error("Load onboarding tasks error:", error);
      return res.status(status).json({ status: "error", message: status === 404 ? error.message : "Unable to load onboarding checklist." });
    }
  }
);

router.patch(
  "/records/:id/tasks/:taskId",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const data = await updateOnboardingTask(prisma, {
        organizationId: req.auth.organizationId,
        onboardingId: req.params.id,
        taskId: req.params.taskId,
        actorUserId: req.auth.userId,
        input: req.body,
      });
      return res.json({ status: "success", message: "Onboarding checklist task updated.", data });
    } catch (error) {
      const clientCodes = new Set(["INVALID_TASK_STATUS", "NOT_APPLICABLE_REASON_REQUIRED", "INVALID_DUE_DATE", "INVALID_TASK_OWNER"]);
      const status = error.code === "TASK_NOT_FOUND" ? 404 : clientCodes.has(error.code) ? 400 : 500;
      if (status === 500) console.error("Update onboarding task error:", error);
      return res.status(status).json({ status: "error", code: error.code, message: status === 500 ? "Unable to update onboarding checklist task." : error.message });
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
          finalizeSection: false,
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

router.post(
  "/records/:id/documents/complete",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const onboarding = await prisma.employeeOnboarding.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.auth.organizationId,
        },
        include: { template: true },
      });

      if (!onboarding) {
        return res.status(404).json({
          status: "error",
          message: "Employee onboarding record not found.",
        });
      }

      const sections = normalizeSections(onboarding.template.sections);
      const section = sections.find((item) => item.key === "documents");
      if (!section) {
        return res.status(404).json({
          status: "error",
          message: "Documents section is not configured for this workflow.",
        });
      }

      const documents = await prisma.employeeDocument.findMany({
        where: {
          organizationId: req.auth.organizationId,
          onboardingId: onboarding.id,
        },
      });
      const completedItemKeys = buildCompletion("documents", {}, documents);

      if (completedItemKeys.length < section.items.length) {
        return res.status(400).json({
          status: "error",
          code: "DOCUMENT_REQUIREMENTS_INCOMPLETE",
          message: `Upload all required documents before completing this section (${completedItemKeys.length}/${section.items.length}).`,
        });
      }

      const sectionData = { ...(onboarding.sectionData || {}) };
      sectionData.documents = {
        ...(sectionData.documents || {}),
        uploadedCount: documents.length,
        completedAt: new Date().toISOString(),
      };

      const data = await applySectionProgress({
        onboarding,
        section,
        sectionKey: "documents",
        sectionData,
        completedItemKeys,
        userId: req.auth.userId,
        finalizeSection: true,
      });

      return res.json({
        status: "success",
        message: "Documents section completed successfully.",
        data,
      });
    } catch (error) {
      console.error("Complete onboarding documents error:", error);
      return res.status(500).json({
        status: "error",
        message: "Unable to complete the Documents section.",
      });
    }
  }
);

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

      const submittedSectionIsBlank = buildCompletion(req.params.sectionKey, incomingData).length === 0;

      if (
        req.params.sectionKey !== "personal-details" &&
        section.required !== false &&
        submittedSectionIsBlank &&
        !hasMeaningfulSectionInput(incomingData)
      ) {
        const validation =
          validateOnboardingSection(
            req.params.sectionKey,
            incomingData
          );

        return res.status(422).json({
          status: "error",
          code: "ONBOARDING_SECTION_INCOMPLETE",
          message:
            `${section.label} is incomplete. Complete the highlighted fields.`,
          details: {
            sectionKey: req.params.sectionKey,
            fields: validation.fields,
          },
        });
      }

      if (
        req.params.sectionKey ===
        "personal-details"
      ) {
        if (
          !hasText(incomingData.fullName) ||
          !hasText(incomingData.email) ||
          !hasText(incomingData.phone)
        ) {
          return res.status(400).json({
            status: "error",
            code: "ONBOARDING_SECTION_REQUIRED",
            message: "Full name, email address and phone number are required.",
          });
        }

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

        const validation =
          validateOnboardingSection(
            "personal-details",
            personal
          );

        if (!validation.valid) {
          return res.status(422).json({
            status: "error",
            code: "ONBOARDING_SECTION_INCOMPLETE",
            message:
              `${section.label} is incomplete. Complete the highlighted field${validation.fields.length === 1 ? "" : "s"}.`,
            details: {
              sectionKey:
                req.params.sectionKey,
              fields:
                validation.fields,
            },
          });
        }

        let normalizedNin = null;

        if (
          String(personal.idType || "")
            .trim()
            .toUpperCase() === "NIN"
        ) {
          try {
            normalizedNin =
              await assertTenantNinAvailable(
                prisma,
                {
                  organizationId:
                    req.auth.organizationId,
                  employeeId:
                    onboarding.employeeId,
                  value:
                    personal.idNumber,
                }
              );

            personal.idNumber =
              normalizedNin;
          } catch (identityError) {
            return res.status(
              identityError.code ===
                "DUPLICATE_EMPLOYEE_NIN"
                ? 409
                : 400
            ).json({
              status: "error",
              code:
                identityError.code ||
                "INVALID_NIN",
              message:
                identityError.message ||
                "Unable to validate NIN.",
              details: {
                sectionKey:
                  "personal-details",
                fields: [
                  {
                    field: "idNumber",
                    label: "ID Number",
                    message:
                      identityError.message ||
                      "Unable to validate NIN.",
                  },
                ],
              },
            });
          }
        }

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
                ...(normalizedNin
                  ? {
                      nationalIdentificationNumber:
                        normalizedNin,
                    }
                  : {}),              },
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

      if (
        section.required !== false
      ) {
        const validation =
          validateOnboardingSection(
            req.params.sectionKey,
            savedData
          );

        if (!validation.valid) {
          return res.status(422).json({
            status: "error",
            code: "ONBOARDING_SECTION_INCOMPLETE",
            message:
              `${section.label} is incomplete. Complete the highlighted field${validation.fields.length === 1 ? "" : "s"}.`,
            details: {
              sectionKey:
                req.params.sectionKey,
              fields:
                validation.fields,
            },
          });
        }
      }

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

      if (["EMPLOYMENT_LEVEL_MAPPING_REQUIRED", "DESIGNATION_REQUIRED"].includes(error.message)) {
        return res.status(400).json({
          status: "error",
          code: "EMPLOYMENT_LEVEL_MAPPING_REQUIRED",
          message:
            "Onboarding cannot be completed until the employee's designation has an active Employment Level.",
        });
      }

      return res.status(500).json({
        status: "error",
        message:
          "Unable to update onboarding section.",
      });
    }
  }
);

router.post(
  "/records/:id/complete",
  requirePermission("employees.update"),
  async (req, res) => {
    try {
      const organizationId =
        req.auth.organizationId;

      const onboarding =
        await prisma.employeeOnboarding.findFirst({
          where: {
            id: req.params.id,
            organizationId,
          },
          include: {
            template: true,
          },
        });

      if (!onboarding) {
        return res.status(404).json({
          status: "error",
          code: "ONBOARDING_NOT_FOUND",
          message:
            "Employee onboarding record not found.",
        });
      }

      if (
        onboarding.status === "COMPLETED"
      ) {
        return res.json({
          status: "success",
          code:
            "ONBOARDING_ALREADY_COMPLETED",
          message:
            "Employee onboarding is already completed.",
          data: onboarding,
        });
      }

      const sections =
        normalizeSections(
          onboarding.template.sections
        );

      const incompleteSections =
        sections
          .filter(
            (section) =>
              section.required !== false &&
              onboarding.sectionProgress?.[
                section.key
              ]?.completed !== true
          )
          .map((section) => ({
            sectionKey:
              section.key,
            sectionLabel:
              section.label,
            fields:
              validateOnboardingSection(
                section.key,
                onboarding.sectionData?.[
                  section.key
                ] || {}
              ).fields,
          }));

      const tasks =
        await listOnboardingTasks(
          prisma,
          {
            organizationId,
            onboardingId:
              onboarding.id,
          }
        );

      /*
       * completionTaskProjection:
       * Completion must evaluate the same effective task state
       * shown by the onboarding tracker. Pristine checklist
       * items belonging to an already completed section must
       * not block final onboarding completion.
       */
      const completionTaskProjection =
        tasks.map((task) =>
          serializeTask(
            task,
            new Date(),
            onboarding.sectionProgress,
            onboarding.status === "COMPLETED" ||
              Number(
                onboarding.completionPercent || 0
              ) >= 100
          )
        );

      const blockingTasks =
        completionTaskProjection
          .filter(
            (task) =>
              task.isRequired &&
              ![
                "COMPLETED",
                "NOT_APPLICABLE",
              ].includes(task.status)
          )
          .map((task) => ({
            id: task.id,
            title: task.title,
            category: task.category,
          }));

      if (
        incompleteSections.length ||
        blockingTasks.length
      ) {
        return res.status(422).json({
          status: "error",
          code:
            "ONBOARDING_COMPLETION_BLOCKED",
          message:
            incompleteSections.length
              ? `${incompleteSections[0].sectionLabel} is incomplete${
                  incompleteSections[0].fields?.[0]?.label
                    ? `: ${incompleteSections[0].fields[0].label}`
                    : ""
                }.`
              : blockingTasks.length
                ? `Outstanding onboarding task: ${blockingTasks[0].title}.`
                : "Onboarding cannot yet be completed.",
          details: {
            incompleteSections,
            blockingTasks,
          },
        });
      }

      const data =
        await prisma.$transaction(
          async (tx) => {
            await tx.employeeOnboarding.updateMany({
              where: {
                id: onboarding.id,
                organizationId,
                status: { not: "COMPLETED" },
              },
              data: {
                status: "COMPLETED",
                completionPercent: 100,
                currentStage: "Completed",
                completedAt: new Date(),
                completedByUserId: req.auth.userId,
              },
            });

            return tx.employeeOnboarding.findFirst({
              where: {
                id: onboarding.id,
                organizationId,
              },
              include: {
                employee: true,
                template: true,
              },
            });
          }
        );

      return res.json({
        status: "success",
        message:
          "Employee onboarding completed successfully.",
        data,
      });
    } catch (error) {
      console.error(
        "Complete employee onboarding error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Unable to complete employee onboarding.",
      });
    }
  }
);
module.exports = router;