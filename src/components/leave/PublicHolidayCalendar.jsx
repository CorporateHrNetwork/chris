import { useEffect, useState } from "react";

export function currentHolidayMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export default function PublicHolidayCalendar({ request, endpoint, month, onMonthChange }) {
  const [selected, setSelected] = useState(currentHolidayMonth);
  const [holidays, setHolidays] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    request(endpoint).then(({ data }) => {
      if (active) setHolidays(data);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [request, endpoint]);

  const visibleMonth = month || selected;
  const [year, monthNumber] = visibleMonth.split("-").map(Number);
  const selectMonth = onMonthChange || setSelected;
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const marks = new Map();
  for (const holiday of holidays || []) {
    const storedDate = holiday.holidayDate.slice(0, 10);
    const date = holiday.isRecurring ? `${year}-${storedDate.slice(5)}` : storedDate;
    if (date.slice(0, 7) !== visibleMonth || Number(date.slice(8)) > days) continue;
    const day = Number(date.slice(8));
    marks.set(day, [...(marks.get(day) || []), holiday.name]);
  }

  return <section aria-label="Public holidays">
    <h2>Public Holidays</h2>
    <label>Calendar year <select value={year} onChange={event => selectMonth(`${event.target.value}-${visibleMonth.slice(5)}`)}>
      {Array.from({ length: 11 }, (_, index) => Math.max(1900, year - 5) + index).map(option => <option key={option}>{option}</option>)}
    </select></label>
    <div role="group" aria-label="Calendar month" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBlock: "0.75rem" }}>
      {Array.from({ length: 12 }, (_, index) => {
        const value = `${year}-${String(index + 1).padStart(2, "0")}`;
        const label = new Date(Date.UTC(year, index, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
        const active = value === visibleMonth;
        return <button key={value} type="button" aria-pressed={active} onClick={() => selectMonth(value)}
          style={{ fontWeight: active ? 700 : 400, textDecoration: active ? "underline" : "none" }}>{label}</button>;
      })}
    </div>
    {failed ? <p role="alert">Unable to load public holidays.</p> : holidays === null ? <p role="status">Loading public holidays…</p> : <>
      <table style={{ width: "100%", tableLayout: "fixed", textAlign: "center" }}>
        <caption>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</caption>
        <thead><tr>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: Math.ceil((offset + days) / 7) }, (_, week) => <tr key={week}>
          {Array.from({ length: 7 }, (_, column) => {
            const day = week * 7 + column - offset + 1;
            const names = marks.get(day);
            return <td key={column} style={{ paddingBlock: "0.45rem" }}>
              {day >= 1 && day <= days && (names
                ? <mark title={names.join(", ")} aria-label={`${day}: ${names.join(", ")}`}>{day}</mark>
                : day)}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      {marks.size ? <ul>{[...marks].sort(([a], [b]) => a - b).map(([day, names]) => <li key={day}>{day} · {names.join(", ")}</li>)}</ul>
        : <p>No approved public holidays are recorded for this month in the organization’s Public Holidays register.</p>}
    </>}
  </section>;
}
