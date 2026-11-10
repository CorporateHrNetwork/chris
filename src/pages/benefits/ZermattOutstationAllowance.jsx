import { useState } from "react";
import { LeavePage, Panel, styles } from "../../components/leave/LeaveUi";

const bands = [
  { id: "gm", label: "General Manager", dailyRate: 30000 },
  { id: "senior", label: "Senior Management, Branch Operations Managers and expatriates (excluding the GM)", dailyRate: 25000 },
  { id: "junior", label: "Junior Management", dailyRate: 20000 },
  { id: "supervisor", label: "Supervisors and equivalent roles", dailyRate: 15000 },
  { id: "team-leader", label: "Team Leaders", dailyRate: 10000 },
];
const money = value => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);

export default function ZermattOutstationAllowance() {
  const [category, setCategory] = useState("");
  const [days, setDays] = useState("");
  const band = bands.find(item => item.id === category);
  const tripDays = Number(days);
  const validDays = Number.isSafeInteger(tripDays) && tripDays > 0;

  return <LeavePage title="Outstation Allowance" description="Zermatt daily feeding and inconvenience rates for outstation trips.">
    <Panel title="Daily rate schedule">
      <div style={styles.tableWrap}><table style={{ ...styles.table, minWidth: 600 }}>
        <thead><tr>{["Employee category", "Feeding per day", "Inconvenience per day", "Total per day"].map(label => <th key={label} style={styles.th}>{label}</th>)}</tr></thead>
        <tbody>{bands.map(item => <tr key={item.id}>{[item.label, money(item.dailyRate), money(item.dailyRate), money(item.dailyRate * 2)].map((value, index) => <td key={index} style={styles.td}>{value}</td>)}</tr>)}</tbody>
      </table></div>
    </Panel>
    <Panel title="Estimate trip allowance">
      <div style={styles.actions}>
        <label>Employee category <select value={category} onChange={event => setCategory(event.target.value)} style={styles.input}>
          <option value="">Select a category</option>
          {bands.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label>Outstation days <input type="number" min="1" step="1" value={days} onChange={event => setDays(event.target.value)} style={styles.input}/></label>
      </div>
      {days && !validDays && <p role="alert">Enter a positive whole number of days.</p>}
      {band && validDays && <dl aria-live="polite">
        <dt>Feeding allowance</dt><dd>{money(band.dailyRate * tripDays)}</dd>
        <dt>Inconvenience allowance</dt><dd>{money(band.dailyRate * tripDays)}</dd>
        <dt>Total trip allowance</dt><dd><strong>{money(band.dailyRate * tripDays * 2)}</strong></dd>
      </dl>}
    </Panel>
  </LeavePage>;
}
