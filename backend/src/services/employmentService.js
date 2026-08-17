const prisma = require("../config/prisma");

const {
  calendarDuration,
  diffDays,
  approximateDurationFromDays,
} = require("../utils/serviceDuration");

function normalizeEpisode(episode, asOfDate) {
  const endDate = episode.endDate || asOfDate;
  const duration = calendarDuration(episode.startDate, endDate);

  return {
    sequenceNumber: episode.sequenceNumber,
    state: episode.endDate ? "CLOSED" : "CURRENT",
    startDate: episode.startDate,
    endDate: episode.endDate,
    startStatus: episode.startStatus,
    endStatus: episode.endStatus,
    startReason: episode.startReason,
    endReason: episode.endReason,
    duration,
    startDepartment: episode.startDepartment,
    endDepartment: episode.endDepartment,
    startDesignation: episode.startDesignation,
    endDesignation: episode.endDesignation,
    startLocation: episode.startLocation,
    endLocation: episode.endLocation,
  };
}

async function getEmploymentServiceSummary({
  organizationId,
  employeeNumber,
  asOfDate = new Date(),
}) {
  const employee = await prisma.employee.findFirst({
    where: { organizationId, employeeNumber },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
      hireDate: true,
      exitDate: true,
      employmentEpisodes: {
        orderBy: { sequenceNumber: "asc" },
        include: {
          startDepartment: { select: { id: true, name: true, code: true } },
          endDepartment: { select: { id: true, name: true, code: true } },
          startDesignation: { select: { id: true, name: true, code: true } },
          endDesignation: { select: { id: true, name: true, code: true } },
          startLocation: { select: { id: true, name: true, code: true } },
          endLocation: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  if (!employee) {
    return null;
  }

  const episodes = employee.employmentEpisodes || [];
  const normalizedEpisodes = episodes.map((episode) =>
    normalizeEpisode(episode, asOfDate)
  );

  const originalEpisode = episodes[0] || null;
  const latestEpisode = episodes[episodes.length - 1] || null;
  const currentEpisode = episodes.find((episode) => !episode.endDate) || null;
  const completedEpisodes = episodes.filter((episode) => Boolean(episode.endDate));

  const totalServiceDays = normalizedEpisodes.reduce(
    (total, episode) => total + episode.duration.totalDays,
    0
  );

  const completedServiceDays = completedEpisodes.reduce(
    (total, episode) => total + diffDays(episode.startDate, episode.endDate),
    0
  );

  const gaps = [];

  for (let index = 1; index < episodes.length; index += 1) {
    const previous = episodes[index - 1];
    const current = episodes[index];

    if (!previous.endDate) {
      continue;
    }

    const gapDays = diffDays(previous.endDate, current.startDate);

    // Same-day exit and rehire is continuous service for gap reporting.
    if (gapDays <= 0) {
      continue;
    }

    gaps.push({
      afterEpisode: previous.sequenceNumber,
      beforeEpisode: current.sequenceNumber,
      from: previous.endDate,
      to: current.startDate,
      days: gapDays,
      duration: approximateDurationFromDays(gapDays),
    });
  }

  const totalGapDays = gaps.reduce((total, gap) => total + gap.days, 0);

  return {
    employee: {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      name: [employee.firstName, employee.middleName, employee.lastName]
        .filter(Boolean)
        .join(" "),
      status: employee.status,
      currentHireDate: employee.hireDate,
      currentExitDate: employee.exitDate,
    },

    employmentStatus: employee.status,
    hasCurrentEpisode: Boolean(currentEpisode),

    originalEmploymentDate:
      originalEpisode?.startDate || employee.hireDate || null,

    latestEmploymentDate:
      latestEpisode?.startDate || employee.hireDate || null,

    latestRehireDate:
      episodes.length > 1 ? latestEpisode?.startDate || null : null,

    episodeCount: episodes.length,

    currentEpisode: currentEpisode
      ? normalizeEpisode(currentEpisode, asOfDate)
      : null,

    previousCompletedService:
      approximateDurationFromDays(completedServiceDays),

    cumulativeService:
      approximateDurationFromDays(totalServiceDays),

    serviceGaps: {
      count: gaps.length,
      totalDays: totalGapDays,
      totalDuration: approximateDurationFromDays(totalGapDays),
      gaps,
    },

    episodes: normalizedEpisodes,
  };
}

module.exports = {
  getEmploymentServiceSummary,
};
