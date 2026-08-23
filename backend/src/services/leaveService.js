const prisma = require("../config/prisma");
const { calculateLeaveDays, utcDay } = require("./leaveDayCalculator");

const {
  evaluateEmployeeEligibility,
} = require("./serviceEligibility");

function decimalToNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function balanceAvailable(balance) {
  if (!balance) {
    return 0;
  }

  return (
    decimalToNumber(balance.openingBalance) +
    decimalToNumber(balance.accrued) +
    decimalToNumber(balance.carriedForward) +
    decimalToNumber(balance.adjusted) -
    decimalToNumber(balance.used)
  );
}

async function getActivePolicy({
  organizationId,
  leaveTypeId,
  asOfDate = new Date(),
}) {
  return prisma.leavePolicy.findFirst({
    where: {
      organizationId,
      leaveTypeId,
      isActive: true,
      status: "ACTIVE",
      effectiveFrom: {
        lte: asOfDate,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gte: asOfDate,
          },
        },
      ],
    },
    orderBy: {
      effectiveFrom: "desc",
    },
  });
}

async function ensureLeaveEligibility({
  organizationId,
  employee,
  leaveType,
  policy,
}) {
  const result =
    await evaluateEmployeeEligibility({
      organizationId,
      employeeNumber:
        employee.employeeNumber,
      rule: {
        serviceBasis:
          policy.serviceBasis,
        minimumServiceDays:
          policy.minimumServiceDays,
        requireCurrentEpisode:
          true,
        allowedStatuses: [
          "ACTIVE",
          "PROBATION",
          "LEAVE",
        ],
      },
    });

  if (!result) {
    throw new Error(
      "EMPLOYEE_NOT_FOUND"
    );
  }

  if (!result.eligibility.eligible) {
    const error =
      new Error(
        "LEAVE_NOT_ELIGIBLE"
      );

    error.details =
      result.eligibility;

    throw error;
  }

  return result;
}

async function findOrCreateBalance({
  tx = prisma,
  organizationId,
  employeeId,
  leaveTypeId,
  leaveYear,
  entitlementDays = 0,
}) {
  const existing =
    await tx.leaveBalance.findUnique({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear:
          {
            organizationId,
            employeeId,
            leaveTypeId,
            leaveYear,
          },
      },
    });

  if (existing) {
    return existing;
  }

  return tx.leaveBalance.create({
    data: {
      organizationId,
      employeeId,
      leaveTypeId,
      leaveYear,
      openingBalance:
        entitlementDays,
    },
  });
}


function policyEntitlementForService(policy, eligibilityResult) {
  const bands = Array.isArray(policy.serviceBands) ? policy.serviceBands : [];
  const serviceDays = Number(eligibilityResult?.eligibility?.measured?.serviceDays || 0);
  const serviceYears = serviceDays / 365.25;
  const matching = bands
    .filter((band) => serviceYears >= Number(band.minimumYears || 0) && (band.maximumYears == null || serviceYears <= Number(band.maximumYears)))
    .sort((a, b) => Number(b.minimumYears || 0) - Number(a.minimumYears || 0))[0];
  return matching ? Number(matching.value) : decimalToNumber(policy.entitlementDays);
}

async function submitLeaveRequest({
  organizationId,
  actorUserId,
  employeeNumber,
  leaveTypeId,
  leavePolicyId,
  startDate,
  endDate,
  reason,
  attachmentUrl,
}) {
  const employee =
    await prisma.employee.findFirst({
      where: {
        organizationId,
        employeeNumber,
      },
      select: {
        id: true,
        employeeNumber: true,
        status: true,
      },
    });

  if (!employee) {
    throw new Error(
      "EMPLOYEE_NOT_FOUND"
    );
  }

  const leaveType =
    await prisma.leaveType.findFirst({
      where: {
        id: leaveTypeId,
        organizationId,
        isActive: true,
      },
    });

  if (!leaveType) {
    throw new Error(
      "LEAVE_TYPE_NOT_FOUND"
    );
  }

  const start =
    new Date(startDate);

  const end =
    new Date(endDate);

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    ) ||
    end < start
  ) {
    throw new Error(
      "INVALID_LEAVE_DATES"
    );
  }

  const policy = leavePolicyId
    ? await prisma.leavePolicy.findFirst({ where: { id: leavePolicyId, organizationId, status: "ACTIVE", isActive: true, effectiveFrom: { lte: start }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] } })
    : await getActivePolicy({ organizationId, leaveTypeId, asOfDate: start });

  if (!policy) {
    throw new Error(leavePolicyId ? "TENANT_ACTIVE_LEAVE_POLICY_NOT_FOUND" : "LEAVE_POLICY_NOT_FOUND");
  }
  leaveTypeId = policy.leaveTypeId;

  const calculation = await calculateLeaveRequestDays({
    organizationId, employeeNumber, leaveTypeId, leavePolicyId: policy.id, startDate: start, endDate: end, policy,
  });
  const units = calculation.requestedUnits;
  if (units <= 0) throw new Error("LEAVE_PERIOD_HAS_NO_APPLICABLE_DAYS");

  const requestRules = policy.requestRules && typeof policy.requestRules === "object" ? policy.requestRules : {};
  const calendarDaysNotice = Math.ceil((startOfUtcDay(start) - startOfUtcDay(new Date())) / 86400000);
  if (calendarDaysNotice < 0 && !requestRules.backdatedRequestsAllowed) throw new Error("BACKDATED_LEAVE_NOT_ALLOWED");
  if (calendarDaysNotice < Number(requestRules.minimumNotice || policy.noticeDays || 0) && !requestRules.emergencyRequestsAllowed) {
    throw new Error("MINIMUM_NOTICE_NOT_MET");
  }
  if (requestRules.minimumDuration != null && units < Number(requestRules.minimumDuration)) throw new Error("MINIMUM_LEAVE_DURATION_NOT_MET");
  if (requestRules.maximumDuration != null && units > Number(requestRules.maximumDuration)) throw new Error("MAXIMUM_LEAVE_DURATION_EXCEEDED");
  if (requestRules.reasonRequired && !String(reason || "").trim()) throw new Error("LEAVE_REASON_REQUIRED");

  const eligibilityResult = await ensureLeaveEligibility({
    organizationId,
    employee,
    leaveType,
    policy,
  });

  if (
    leaveType.requiresAttachment &&
    !String(
      attachmentUrl || ""
    ).trim()
  ) {
    throw new Error(
      "ATTACHMENT_REQUIRED"
    );
  }

  const overlap =
    await prisma.leaveRequest.findFirst({
      where: {
        organizationId,
        employeeId:
          employee.id,
        status: {
          in: [
            "PENDING",
            "APPROVED",
            "ACTIVE",
          ],
        },
        startDate: {
          lte: end,
        },
        endDate: {
          gte: start,
        },
      },
      select: {
        id: true,
      },
    });

  if (overlap) {
    throw new Error(
      "LEAVE_REQUEST_OVERLAP"
    );
  }

  const leaveYear =
    start.getFullYear();

  const balance =
    await findOrCreateBalance({
      organizationId,
      employeeId:
        employee.id,
      leaveTypeId,
      leaveYear,
      entitlementDays:
        policyEntitlementForService(policy, eligibilityResult),
    });

  const available =
    balanceAvailable(balance);

  if (
    !policy.allowNegativeBalance &&
    units > available
  ) {
    const error =
      new Error(
        "INSUFFICIENT_LEAVE_BALANCE"
      );

    error.details = {
      available,
      requestedUnits:
        units,
    };

    throw error;
  }

  if (
    policy.allowNegativeBalance &&
    policy.maxNegativeDays !==
      null
  ) {
    const projected =
      available - units;

    if (
      projected <
      -decimalToNumber(
        policy.maxNegativeDays
      )
    ) {
      throw new Error(
        "MAX_NEGATIVE_BALANCE_EXCEEDED"
      );
    }
  }

  return prisma.leaveRequest.create({
    data: {
      organizationId,
      employeeId:
        employee.id,
      leaveTypeId,
      leavePolicyId:
        policy.id,
      createdByUserId:
        actorUserId || null,
      startDate:
        start,
      endDate:
        end,
      requestedUnits:
        units,
      reason:
        reason || null,
      attachmentUrl:
        attachmentUrl || null,
      status:
        "PENDING",
    },
    include: {
      employee: {
        select: {
          employeeNumber:
            true,
          firstName:
            true,
          middleName:
            true,
          lastName:
            true,
        },
      },
      leaveType: true,
    },
  });
}

async function calculateLeaveRequestDays({ organizationId, employeeNumber, leaveTypeId, leavePolicyId, startDate, endDate, policy: suppliedPolicy }) {
  const start = utcDay(startDate), end = utcDay(endDate);
  if (end < start) throw new Error("INVALID_LEAVE_DATES");
  const employee = await prisma.employee.findFirst({
    where: { organizationId, employeeNumber },
    select: { id: true, shiftAssignments: { where: { effectiveFrom: { lte: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] }, take: 1, select: { id: true } } },
  });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  const policy = suppliedPolicy || (leavePolicyId ? await prisma.leavePolicy.findFirst({ where: { id: leavePolicyId, organizationId, status: "ACTIVE", isActive: true } }) : await getActivePolicy({ organizationId, leaveTypeId, asOfDate: start }));
  if (!policy) throw new Error(leavePolicyId ? "TENANT_ACTIVE_LEAVE_POLICY_NOT_FOUND" : "LEAVE_POLICY_NOT_FOUND");
  const holidays = await prisma.publicHoliday.findMany({ where: { organizationId, holidayDate: { gte: start, lte: end } }, select: { holidayDate: true } });
  const result = calculateLeaveDays({ startDate: start, endDate: end, policy, publicHolidays: holidays.map(item => item.holidayDate) });
  return { ...result, policyId: policy.id, policyName: policy.name, policyVersion: policy.versionNumber,
    employeeScheduleConfigured: employee.shiftAssignments.length > 0,
    scheduleNote: employee.shiftAssignments.length ? "Assigned shifts define hours only; Monday-Friday is used because no per-day schedule is modeled." : "No dated shift assignment; Monday-Friday is used." };
}

async function reviewLeaveRequest({
  organizationId,
  leaveRequestId,
  reviewerUserId,
  decision,
  reviewNotes,
}) {
  const normalizedDecision =
    String(
      decision || ""
    )
      .trim()
      .toUpperCase();

  if (
    ![
      "APPROVE",
      "REJECT",
    ].includes(
      normalizedDecision
    )
  ) {
    throw new Error(
      "INVALID_REVIEW_DECISION"
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const request =
        await tx.leaveRequest.findFirst({
          where: {
            id:
              leaveRequestId,
            organizationId,
          },
          include: {
            leaveType: true,
          },
        });

      if (!request) {
        throw new Error(
          "LEAVE_REQUEST_NOT_FOUND"
        );
      }

      if (
        request.status !==
        "PENDING"
      ) {
        throw new Error(
          "LEAVE_REQUEST_NOT_PENDING"
        );
      }

      if (
        normalizedDecision ===
        "REJECT"
      ) {
        return tx.leaveRequest.update({
          where: {
            id:
              request.id,
          },
          data: {
            status:
              "REJECTED",
            reviewedByUserId:
              reviewerUserId,
            reviewedAt:
              new Date(),
            reviewNotes:
              reviewNotes || null,
          },
        });
      }

      const policy =
        request.leavePolicyId
          ? await tx.leavePolicy.findFirst({
              where: { id: request.leavePolicyId, organizationId },
            })
          : await tx.leavePolicy.findFirst({
              where: {
                organizationId,
                leaveTypeId: request.leaveTypeId,
                status: "ACTIVE",
                isActive: true,
                effectiveFrom: { lte: request.startDate },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: request.startDate } }],
              },
              orderBy: { effectiveFrom: "desc" },
            });

      if (!policy) {
        throw new Error(
          "LEAVE_POLICY_NOT_FOUND"
        );
      }

      const leaveYear =
        request.startDate
          .getFullYear();

      const balance =
        await findOrCreateBalance({
          tx,
          organizationId,
          employeeId:
            request.employeeId,
          leaveTypeId:
            request.leaveTypeId,
          leaveYear,
          entitlementDays:
            decimalToNumber(
              policy.entitlementDays
            ),
        });

      const available =
        balanceAvailable(balance);

      const units =
        decimalToNumber(
          request.requestedUnits
        );

      if (
        !policy.allowNegativeBalance &&
        units > available
      ) {
        throw new Error(
          "INSUFFICIENT_LEAVE_BALANCE"
        );
      }

      const updatedBalance =
        await tx.leaveBalance.update({
          where: {
            id:
              balance.id,
          },
          data: {
            used: {
              increment:
                request.requestedUnits,
            },
          },
        });

      const updatedRequest =
        await tx.leaveRequest.update({
          where: {
            id:
              request.id,
          },
          data: {
            status:
              "APPROVED",
            reviewedByUserId:
              reviewerUserId,
            reviewedAt:
              new Date(),
            reviewNotes:
              reviewNotes || null,
          },
        });

      return {
        request:
          updatedRequest,
        balance:
          updatedBalance,
      };
    }
  );
}

async function cancelLeaveRequest({
  organizationId,
  leaveRequestId,
  cancellationReason,
}) {
  return prisma.$transaction(
    async (tx) => {
      const request =
        await tx.leaveRequest.findFirst({
          where: {
            id:
              leaveRequestId,
            organizationId,
          },
        });

      if (!request) {
        throw new Error(
          "LEAVE_REQUEST_NOT_FOUND"
        );
      }

      if (
        request.status ===
        "CANCELLED"
      ) {
        throw new Error(
          "LEAVE_REQUEST_ALREADY_CANCELLED"
        );
      }

      if (
        ![
          "PENDING",
          "APPROVED",
        ].includes(
          request.status
        )
      ) {
        throw new Error(
          "LEAVE_REQUEST_NOT_CANCELLABLE"
        );
      }

      if (
        request.status ===
        "APPROVED"
      ) {
        const leaveYear =
          request.startDate
            .getFullYear();

        const balance =
          await tx.leaveBalance.findUnique({
            where: {
              organizationId_employeeId_leaveTypeId_leaveYear:
                {
                  organizationId,
                  employeeId:
                    request.employeeId,
                  leaveTypeId:
                    request.leaveTypeId,
                  leaveYear,
                },
            },
          });

        if (!balance) {
          throw new Error(
            "LEAVE_BALANCE_NOT_FOUND"
          );
        }

        const used =
          decimalToNumber(
            balance.used
          );

        const units =
          decimalToNumber(
            request.requestedUnits
          );

        if (used < units) {
          throw new Error(
            "LEAVE_BALANCE_INTEGRITY_ERROR"
          );
        }

        await tx.leaveBalance.update({
          where: {
            id:
              balance.id,
          },
          data: {
            used: {
              decrement:
                request.requestedUnits,
            },
          },
        });
      }

      return tx.leaveRequest.update({
        where: {
          id:
            request.id,
        },
        data: {
          status:
            "CANCELLED",
          cancelledAt:
            new Date(),
          cancellationReason:
            cancellationReason || null,
        },
      });
    }
  );
}

async function getEmployeeBalances({
  organizationId,
  employeeNumber,
  leaveYear,
}) {
  const employee =
    await prisma.employee.findFirst({
      where: {
        organizationId,
        employeeNumber,
      },
      select: {
        id: true,
        employeeNumber:
          true,
        firstName: true,
        middleName: true,
        lastName: true,
      },
    });

  if (!employee) {
    return null;
  }

  const balances =
    await prisma.leaveBalance.findMany({
      where: {
        organizationId,
        employeeId:
          employee.id,
        ...(leaveYear
          ? {
              leaveYear:
                Number(
                  leaveYear
                ),
            }
          : {}),
      },
      include: {
        leaveType: true,
      },
      orderBy: [
        {
          leaveYear:
            "desc",
        },
        {
          leaveType: {
            name:
              "asc",
          },
        },
      ],
    });

  return {
    employee: {
      employeeNumber:
        employee.employeeNumber,
      name: [
        employee.firstName,
        employee.middleName,
        employee.lastName,
      ]
        .filter(Boolean)
        .join(" "),
    },
    balances:
      balances.map(
        (balance) => ({
          ...balance,
          available:
            balanceAvailable(
              balance
            ),
        })
      ),
  };
}


function parseLifecycleDate(value, code) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error(code);
  return date;
}

function startOfUtcDay(value) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function commenceLeave({
  organizationId,
  leaveRequestId,
  actorUserId,
  effectiveDate,
}) {
  const commencementDate = parseLifecycleDate(effectiveDate, "INVALID_COMMENCEMENT_DATE");

  return prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findFirst({
      where: { id: leaveRequestId, organizationId },
      include: {
        employee: {
          include: {
            employmentEpisodes: {
              where: { endDate: null },
              orderBy: { sequenceNumber: "desc" },
              take: 1,
            },
          },
        },
        leavePolicy: true,
      },
    });

    if (!request) throw new Error("LEAVE_REQUEST_NOT_FOUND");
    if (request.status === "ACTIVE" || request.commencedAt) throw new Error("LEAVE_ALREADY_COMMENCED");
    if (request.status !== "APPROVED") throw new Error("LEAVE_NOT_APPROVED");
    const lifecycleRules = request.leavePolicy?.lifecycleRules || {};
    if (startOfUtcDay(commencementDate) < startOfUtcDay(request.startDate) && !lifecycleRules.allowEarlyCommencement) {
      throw new Error("LEAVE_COMMENCEMENT_TOO_EARLY");
    }
    if (!request.employee.employmentEpisodes.length) throw new Error("CURRENT_EMPLOYMENT_EPISODE_NOT_FOUND");
    if (!["ACTIVE", "PROBATION"].includes(request.employee.status)) {
      throw new Error("EMPLOYEE_STATUS_NOT_ELIGIBLE_FOR_LEAVE");
    }

    const competingLeave = await tx.leaveRequest.findFirst({
      where: {
        organizationId,
        employeeId: request.employeeId,
        status: "ACTIVE",
        id: { not: request.id },
      },
      select: { id: true },
    });
    if (competingLeave) throw new Error("EMPLOYEE_ALREADY_ON_ACTIVE_LEAVE");

    const activation = await tx.leaveRequest.updateMany({
      where: { id: request.id, organizationId, status: "APPROVED", commencedAt: null },
      data: {
        status: "ACTIVE",
        commencedAt: new Date(),
        commencementDate,
        commencedByUserId: actorUserId,
        preLeaveStatus: request.employee.status,
      },
    });
    if (activation.count !== 1) throw new Error("LEAVE_ALREADY_COMMENCED");

    await tx.employee.update({
      where: { id: request.employeeId },
      data: { status: "LEAVE" },
    });

    const updated = await tx.leaveRequest.findUnique({
      where: { id: request.id },
      include: { employee: true, leaveType: true },
    });

    await tx.employeeLifecycleEvent.create({
      data: {
        organizationId,
        employeeId: request.employeeId,
        eventType: "LEAVE_COMMENCED",
        effectiveDate: commencementDate,
        previousStatus: request.employee.status,
        newStatus: "LEAVE",
        reason: "Approved leave commenced",
        notes: "Leave request " + request.id,
        performedByUserId: actorUserId,
      },
    });

    return updated;
  });
}

async function returnFromLeave({
  organizationId,
  leaveRequestId,
  actorUserId,
  returnDate,
  notes,
  returnDocumentationUrl,
  fitnessCertificateUrl,
}) {
  const actualReturnDate = parseLifecycleDate(returnDate, "INVALID_RETURN_DATE");

  return prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findFirst({
      where: { id: leaveRequestId, organizationId },
      include: {
        employee: {
          include: {
            employmentEpisodes: {
              where: { endDate: null },
              orderBy: { sequenceNumber: "desc" },
              take: 1,
            },
          },
        },
        leavePolicy: true,
      },
    });

    if (!request) throw new Error("LEAVE_REQUEST_NOT_FOUND");
    if (request.status === "COMPLETED" || request.returnedAt) throw new Error("LEAVE_ALREADY_RETURNED");
    if (request.status !== "ACTIVE" || !request.commencementDate) throw new Error("LEAVE_NOT_ACTIVE");
    const lifecycleRules = request.leavePolicy?.lifecycleRules || {};
    if (startOfUtcDay(actualReturnDate) < startOfUtcDay(request.commencementDate)) throw new Error("RETURN_BEFORE_COMMENCEMENT");
    if (startOfUtcDay(actualReturnDate) < startOfUtcDay(request.endDate) && lifecycleRules.allowEarlyReturn === false) throw new Error("EARLY_RETURN_NOT_ALLOWED");
    if (lifecycleRules.returnDocumentationRequired && !String(returnDocumentationUrl || "").trim()) throw new Error("RETURN_DOCUMENTATION_REQUIRED");
    if (lifecycleRules.fitnessCertificateRequired && !String(fitnessCertificateUrl || "").trim()) throw new Error("FITNESS_CERTIFICATE_REQUIRED");
    if (!request.employee.employmentEpisodes.length) throw new Error("CURRENT_EMPLOYMENT_EPISODE_NOT_FOUND");
    if (request.employee.status !== "LEAVE") throw new Error("EMPLOYEE_STATUS_CHANGED_DURING_LEAVE");
    if (!["ACTIVE", "PROBATION"].includes(request.preLeaveStatus)) {
      throw new Error("INVALID_PRE_LEAVE_STATUS");
    }

    const restoredStatus = request.preLeaveStatus;
    const completion = await tx.leaveRequest.updateMany({
      where: { id: request.id, organizationId, status: "ACTIVE", returnedAt: null },
      data: {
        status: "COMPLETED",
        returnedAt: new Date(),
        actualReturnDate,
        returnedByUserId: actorUserId,
        returnDocumentationUrl: returnDocumentationUrl || null,
        fitnessCertificateUrl: fitnessCertificateUrl || null,
      },
    });
    if (completion.count !== 1) throw new Error("LEAVE_ALREADY_RETURNED");

    await tx.employee.update({
      where: { id: request.employeeId },
      data: { status: restoredStatus },
    });

    const updated = await tx.leaveRequest.findUnique({
      where: { id: request.id },
      include: { employee: true, leaveType: true },
    });

    await tx.employeeLifecycleEvent.create({
      data: {
        organizationId,
        employeeId: request.employeeId,
        eventType: "RETURNED_FROM_LEAVE",
        effectiveDate: actualReturnDate,
        previousStatus: "LEAVE",
        newStatus: restoredStatus,
        reason: "Employee returned from leave",
        notes: "Leave request " + request.id + (notes ? ": " + notes : ""),
        performedByUserId: actorUserId,
      },
    });

    return updated;
  });
}

async function getLeaveRequests({ organizationId, status }) {
  return prisma.leaveRequest.findMany({
    where: {
      organizationId,
      ...(status ? { status } : {}),
    },
    include: {
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          status: true,
          department: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
      leaveType: true,
      leavePolicy: true,
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
}

async function getLeaveConsistency({ organizationId }) {
  const [leaveEmployees, activeRequests] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId, status: "LEAVE" },
      select: { id: true, employeeNumber: true, firstName: true, lastName: true, status: true },
    }),
    prisma.leaveRequest.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: {
        id: true,
        employeeId: true,
        employee: { select: { employeeNumber: true, firstName: true, lastName: true, status: true } },
      },
    }),
  ]);
  const activeEmployeeIds = new Set(activeRequests.map((item) => item.employeeId));
  return {
    employeeOnLeaveWithoutActiveRequest: leaveEmployees.filter((employee) => !activeEmployeeIds.has(employee.id)),
    activeRequestWithoutLeaveStatus: activeRequests.filter((request) => request.employee.status !== "LEAVE"),
  };
}

module.exports = {
  decimalToNumber,
  balanceAvailable,
  policyEntitlementForService,
  getActivePolicy,
  calculateLeaveRequestDays,
  findOrCreateBalance,
  submitLeaveRequest,
  reviewLeaveRequest,
  cancelLeaveRequest,
  commenceLeave,
  returnFromLeave,
  getLeaveRequests,
  getLeaveConsistency,
  getEmployeeBalances,
};
