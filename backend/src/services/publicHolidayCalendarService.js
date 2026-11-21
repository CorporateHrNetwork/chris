// Fixed federal holidays and year-specific dates published by Nigerian authorities.
const fixed = [
  ["01-01", "New Year's Day"],
  ["05-01", "Workers' Day"],
  ["06-12", "Democracy Day"],
  ["10-01", "Independence Day"],
  ["12-25", "Christmas Day"],
  ["12-26", "Boxing Day"],
];

// Nigerian High Commission calendar: https://nigeriahcottawa.ca/public-holidays/
// Eid dates follow the Federal Ministry of Information's individual declarations.
const dated = [
  ["2026-03-19", "Eid al-Fitr"],
  ["2026-03-20", "Eid al-Fitr"],
  ["2026-04-03", "Good Friday"],
  ["2026-04-06", "Easter Monday"],
  ["2026-05-27", "Eid al-Adha"],
  ["2026-05-28", "Eid al-Adha"],
  ["2026-08-25", "Eid ul-Mawlid"],
];

function calendarHolidays(holidays, organizationSlug) {
  const organization = holidays.map(({ name, holidayDate, isRecurring }) => ({
    name, holidayDate: new Date(holidayDate).toISOString().slice(0, 10), isRecurring,
  }));
  if (organizationSlug !== "zermatt-liquor-limited") return organization;

  const federal = [
    ...fixed.map(([day, name]) => ({ name, holidayDate: `2026-${day}`, isRecurring: true })),
    ...dated.map(([holidayDate, name]) => ({ name, holidayDate, isRecurring: false })),
  ];
  return [...organization, ...federal];
}

module.exports = { calendarHolidays };
