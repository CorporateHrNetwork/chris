import { useState } from "react";
import { Link } from "react-router-dom";
import { Panel, styles } from "../../components/leave/LeaveUi";

const bands = [
  { id: "gm", label: "General Manager", dailyRate: 30000 },
  { id: "senior", label: "Senior Management, Branch Operations Managers and expatriates (excluding the GM)", dailyRate: 25000 },
  { id: "junior", label: "Junior Management", dailyRate: 20000 },
  { id: "supervisor", label: "Supervisors and equivalent roles", dailyRate: 15000 },
  { id: "team-leader", label: "Team Leaders", dailyRate: 10000 },
];
const money = value => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const transportLegs = [
  ["baseToAirport", "Base location or residence to base airport"],
  ["airportToOutstation", "Destination airport to outstation location"],
  ["outstationToAirport", "Outstation location to destination airport"],
  ["airportToBase", "Base airport to base location or residence"],
];
const approvalStages = ["Head HR · Prepared and approved", "Auditor · External review", "General Manager · External approval", "Chief Accountant · External payment processing"];
const kobo = value => Math.round(Number(value || 0) * 100);

export default function ZermattOutstationAllowance() {
  const [category, setCategory] = useState("");
  const [days, setDays] = useState("");
  const [includeTransport, setIncludeTransport] = useState(false);
  const [fields, setFields] = useState({});
  const band = bands.find(item => item.id === category);
  const tripDays = Number(days);
  const validDays = Number.isInteger(tripDays) && tripDays > 0 && tripDays <= 366;
  const nights = Number(fields.nights || 0);
  const lodging = nights * kobo(fields.nightlyCost);
  const flight = kobo(fields.returnFlight);
  const feeding = validDays && band ? band.dailyRate * tripDays * 100 : 0;
  const transport = includeTransport ? transportLegs.reduce((sum, [key]) => sum + kobo(fields[key]), 0) : 0;
  const payable = feeding * 2 + transport + kobo(fields.otherAllowance);
  const total = payable + flight + lodging + kobo(fields.otherCost);
  const format = value => money(value / 100);
  const setField = key => event => setFields(current => ({ ...current, [key]: event.target.value }));
  const field = (key, label, type = "text", options = {}) => <label key={key} className="outstation-field">{label}
    <input type={type} value={fields[key] || ""} onChange={setField(key)} style={styles.input} {...options}/>
    <span className="outstation-print-value">{fields[key] || "—"}</span>
  </label>;
  const cost = (key, label, options = {}) => field(key, label, "number", { min: 0, max: 1000000000, step: "0.01", ...options });

  return <div>
    <Link to="/benefits" style={styles.back}>← Benefits Overview</Link>
    <h1>Outstation Allowance Voucher</h1>
    <p>Calculate the amount payable to the employee and the full cost of a Zermatt outstation trip.</p>
    <style>{`
      .outstation-field {display:grid;gap:6px;min-width:0}
      .outstation-field input,.outstation-field select {max-width:100%;box-sizing:border-box}
      .outstation-fields {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
      .outstation-print-value {display:none}
      @media print {
        body:has(.outstation-voucher) * {visibility:hidden}
        body:has(.outstation-voucher) :has(.outstation-voucher) {overflow:visible!important;height:auto!important}
        .outstation-voucher,.outstation-voucher * {visibility:visible}
        .outstation-voucher {position:absolute;top:0;left:0;width:100%;color:#111;background:#fff}
        .outstation-voucher h2,.outstation-voucher th,.outstation-voucher td,.outstation-voucher dt {color:#111!important}
        .outstation-voucher section {background:#fff!important;box-shadow:none!important;break-inside:avoid}
        .outstation-voucher input,.outstation-voucher select,.outstation-voucher button,.outstation-voucher details {display:none}
        .outstation-print-value {display:block;font-weight:700}
      }
    `}</style>
    <form className="outstation-voucher" autoComplete="off" onSubmit={event => { event.preventDefault(); if (band && validDays) window.print(); }}>
      <Panel title="Zermatt Liquor Limited · Outstation Allowance Voucher">
        <div className="outstation-fields">
          {field("employeeNumber", "Employee No.", "text", { required: true })}
          {field("employeeName", "Employee name", "text", { required: true })}
          {field("base", "Base station", "text", { required: true })}
          {field("destination", "Outstation location", "text", { required: true })}
          {field("departure", "Departure date", "date")}
          {field("returnDate", "Return date", "date", { min: fields.departure || undefined })}
          {field("purpose", "Trip purpose")}
        </div>
      </Panel>
      <Panel title="Employee payment details">
        <div className="outstation-fields">
          {field("bank", "Bank", "text", { required: true })}
          {field("accountName", "Account name", "text", { required: true })}
          {field("accountNumber", "Account number", "text", { required: true, inputMode: "numeric", pattern: "[0-9]{10}", maxLength: 10 })}
        </div>
      </Panel>
      <Panel title="1. Allowance payable">
        <div className="outstation-fields">
          <label className="outstation-field">Employee category <select required value={category} onChange={event => setCategory(event.target.value)} style={styles.input}>
            <option value="">Select a category</option>
            {bands.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select><span className="outstation-print-value">{band?.label || "—"}</span></label>
          <label className="outstation-field">Outstation days <input required type="number" min="1" max="366" step="1" value={days} onChange={event => setDays(event.target.value)} style={styles.input}/>
            <span className="outstation-print-value">{days}</span></label>
          {cost("otherAllowance", "Other allowance payable to employee")}
        </div>
        <p>Feeding {format(feeding)} · Inconvenience {format(feeding)} · Daily rate for each {money(band?.dailyRate || 0)}</p>
        <label><input type="checkbox" checked={includeTransport} onChange={event => setIncludeTransport(event.target.checked)}/> Include local transport when the employee did not use a company vehicle</label>
        <p>Local transport {includeTransport ? "included" : "excluded"} · {format(transport)}</p>
        {includeTransport && <div className="outstation-fields">{transportLegs.map(([key, label]) => cost(key, label))}</div>}
        <p><strong>Amount payable to employee {format(payable)}</strong></p>
      </Panel>
      <Panel title="2. Flight and accommodation costs">
        <div className="outstation-fields">
          {cost("returnFlight", "Return flight ticket cost")}
          {cost("nights", "Hotel nights used or planned", { step: "1", max: 366 })}
          {cost("nightlyCost", "Hotel cost per night")}
        </div>
        <p><strong>Flight and accommodation total {format(flight + lodging)}</strong> · Accommodation {format(lodging)}</p>
      </Panel>
      <Panel title="3. Other cost">
        <div className="outstation-fields">
          {cost("otherCost", "Other outstation expenses")}
          {field("otherCostNotes", "Expense description")}
        </div>
        <p><strong>Total outstation cost {format(total)}</strong></p>
      </Panel>
      <Panel title="External approval handoff">
        <div style={styles.tableWrap}><table style={{ ...styles.table, minWidth: 600 }}>
          <thead><tr>{["Stage", "Name", "Signature", "Date / reference"].map(label => <th key={label} style={styles.th}>{label}</th>)}</tr></thead>
          <tbody>{approvalStages.map(label => <tr key={label}><td style={styles.td}>{label}</td><td style={styles.td}></td><td style={styles.td}></td><td style={styles.td}></td></tr>)}</tbody>
        </table></div>
        <button type="submit" style={styles.primary}>Print / Save Voucher as PDF</button>
      </Panel>
      <details><summary>Daily rate schedule</summary>
        <div style={styles.tableWrap}><table style={{ ...styles.table, minWidth: 600 }}>
          <thead><tr>{["Employee category", "Feeding per day", "Inconvenience per day", "Total per day"].map(label => <th key={label} style={styles.th}>{label}</th>)}</tr></thead>
          <tbody>{bands.map(item => <tr key={item.id}>{[item.label, money(item.dailyRate), money(item.dailyRate), money(item.dailyRate * 2)].map((value, index) => <td key={index} style={styles.td}>{value}</td>)}</tr>)}</tbody>
        </table></div>
      </details>
    </form>
  </div>;
}
