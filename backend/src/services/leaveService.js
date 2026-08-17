const prisma = require("../config/prisma");

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

async function submitLeaveRequest({
  organizationId,
  employeeNumber,
  leaveTypeId,
  startDate,
  endDate,
  requestedUnits,
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

  const units =
    Number(requestedUnits);

  if (
    !Number.isFinite(units) ||
    units <= 0
  ) {
    throw new Error(
      "INVALID_REQUESTED_UNITS"
    );
  }

  const policy =
    await getActivePolicy({
      organizationId,
      leaveTypeId,
      asOfDate: start,
    });

  if (!policy) {
    throw new Error(
      "LEAVE_POLICY_NOT_FOUND"
    );
  }

  await ensureLeaveEligibility({
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
        decimalToNumber(
          policy.entitlementDays
        ),
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
        await tx.leavePolicy.findFirst({
          where: {
            organizationId,
            leaveTypeId:
              request.leaveTypeId,
            isActive: true,
            effectiveFrom: {
              lte:
                request.startDate,
            },
            OR: [
              {
                effectiveTo:
                  null,
              },
              {
                effectiveTo: {
                  gte:
                    request.startDate,
                },
              },
            ],
          },
          orderBy: {
            effectiveFrom:
              "desc",
          },
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

module.exports = {
  decimalToNumber,
  balanceAvailable,
  getActivePolicy,
  findOrCreateBalance,
  submitLeaveRequest,
  reviewLeaveRequest,
  cancelLeaveRequest,
  getEmployeeBalances,
};
