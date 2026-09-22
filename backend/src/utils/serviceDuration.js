const MS_PER_DAY =
  24 * 60 * 60 * 1000;

function toUtcDateOnly(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      "INVALID_SERVICE_DATE"
    );
  }

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );
}

function diffDays(
  startValue,
  endValue
) {
  const start =
    toUtcDateOnly(startValue);

  const end =
    toUtcDateOnly(endValue);

  return Math.max(
    0,
    Math.round(
      (
        end.getTime() -
        start.getTime()
      ) /
        MS_PER_DAY
    )
  );
}

function calendarDuration(
  startValue,
  endValue
) {
  const start =
    toUtcDateOnly(startValue);

  const end =
    toUtcDateOnly(endValue);

  if (
    end.getTime() <
    start.getTime()
  ) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalDays: 0,
      label: "0 days",
    };
  }

  let cursor =
    new Date(
      start.getTime()
    );

  let years =
    end.getUTCFullYear() -
    cursor.getUTCFullYear();

  let afterYears =
    new Date(
      cursor.getTime()
    );

  afterYears.setUTCFullYear(
    afterYears.getUTCFullYear() +
      years
  );

  if (
    afterYears.getTime() >
    end.getTime()
  ) {
    years -= 1;

    afterYears =
      new Date(
        cursor.getTime()
      );

    afterYears.setUTCFullYear(
      afterYears.getUTCFullYear() +
        years
    );
  }

  cursor = afterYears;

  let months =
    (
      end.getUTCFullYear() -
      cursor.getUTCFullYear()
    ) *
      12 +
    (
      end.getUTCMonth() -
      cursor.getUTCMonth()
    );

  let afterMonths =
    new Date(
      cursor.getTime()
    );

  afterMonths.setUTCMonth(
    afterMonths.getUTCMonth() +
      months
  );

  if (
    afterMonths.getTime() >
    end.getTime()
  ) {
    months -= 1;

    afterMonths =
      new Date(
        cursor.getTime()
      );

    afterMonths.setUTCMonth(
      afterMonths.getUTCMonth() +
        months
    );
  }

  cursor = afterMonths;

  const days =
    diffDays(
      cursor,
      end
    );

  const totalDays =
    diffDays(
      start,
      end
    );

  const parts = [];

  if (years) {
    parts.push(
      `${years} year${
        years === 1
          ? ""
          : "s"
      }`
    );
  }

  if (months) {
    parts.push(
      `${months} month${
        months === 1
          ? ""
          : "s"
      }`
    );
  }

  if (
    days ||
    parts.length === 0
  ) {
    parts.push(
      `${days} day${
        days === 1
          ? ""
          : "s"
      }`
    );
  }

  return {
    years,
    months,
    days,
    totalDays,
    label:
      parts.join(" "),
  };
}

function approximateDurationFromDays(
  totalDays
) {
  const safeDays =
    Math.max(
      0,
      Number(totalDays) || 0
    );

  const years =
    Math.floor(
      safeDays / 365
    );

  const remaining =
    safeDays % 365;

  const months =
    Math.floor(
      remaining / 30
    );

  const days =
    remaining % 30;

  const parts = [];

  if (years) {
    parts.push(
      `${years} year${
        years === 1
          ? ""
          : "s"
      }`
    );
  }

  if (months) {
    parts.push(
      `${months} month${
        months === 1
          ? ""
          : "s"
      }`
    );
  }

  if (
    days ||
    parts.length === 0
  ) {
    parts.push(
      `${days} day${
        days === 1
          ? ""
          : "s"
      }`
    );
  }

  return {
    years,
    months,
    days,
    totalDays:
      safeDays,
    label:
      parts.join(" "),
    approximation:
      true,
  };
}

module.exports = {
  calendarDuration,
  diffDays,
  approximateDurationFromDays,
  toUtcDateOnly,
};