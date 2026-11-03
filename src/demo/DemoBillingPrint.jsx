import React from "react";
import { CHRIS_DEMO_LOGO } from "./chrisDemoLogo";
const IDS=["basic","standard","premium"];
const format=n=>"₦"+Number(n||0).toLocaleString("en-NG");
const rateFields=[["CHRiS licence / employee / month","licenceMonthly"],["ESS / employee / month (optional)","essMonthly"],["Onboarding / employee / month (first 12 months)","onboardingMonthly"],["Annual support / employee / month","supportMonthly"]];
export default function DemoBillingPrint({catalogue,quotes,employees,renewalSeats,includeEss}){
 const groups=[["CHRiS main menu","hris"],["MY CHRiS employee self-service","ess"]];
 return <article className="chris-demo-print-document">
  <header className="chris-demo-print-header">
   <img className="chris-demo-print-logo" src={CHRIS_DEMO_LOGO} alt="CHRiS green and gold logo"/>
   <div className="chris-demo-print-brand">CORPORATE RESOURCES NETWORK <span>CHRiS</span></div>
   <h1>Billing & Subscription — Pricing Proposal</h1>
   <p>Prepared for: {catalogue.organizationName||"Fictional demo organisation"}</p>
   <p><strong>Initial seats:</strong> {employees} &nbsp; <strong>Renewal estimate seats:</strong> {renewalSeats} &nbsp; <strong>MY CHRiS ESS:</strong> {includeEss?"Included":"Not included"}</p>
   <p className="chris-demo-print-warning">DEMO ONLY · Non-binding proposal · No invoice, payment or subscription activation</p>
  </header>
  <section><h2>Plan profiles and monthly rates (NGN)</h2>
   <table><thead><tr><th>Pricing component</th>{IDS.map(id=><th key={id}>{catalogue.plans[id].label}</th>)}</tr></thead>
   <tbody><tr><td>Plan profile</td>{IDS.map(id=><td key={id}>{catalogue.plans[id].profile}</td>)}</tr>
   {rateFields.map(([label,key])=><tr key={key}><td>{label}</td>{IDS.map(id=><td key={id}>{format(catalogue.plans[id][key])}</td>)}</tr>)}
   </tbody></table>
  </section>
  <section><h2>First-year quotation and renewal estimates</h2>
   <table><thead><tr><th>Annual amount</th>{IDS.map(id=><th key={id}>{catalogue.plans[id].label}</th>)}</tr></thead><tbody>
   {["licence","ess","onboarding","support"].map(key=><tr key={key}><td>{key==="ess"?"ESS":key.charAt(0).toUpperCase()+key.slice(1)} — first year</td>{IDS.map(id=><td key={id}>{format(quotes[id].quote.lineItems[key])}</td>)}</tr>)}
   <tr><td>Illustrative first-year VAT (7.5%)</td>{IDS.map(id=><td key={id}>{format(quotes[id].quote.vat)}</td>)}</tr>
   <tr className="chris-demo-print-total"><td>First-year total</td>{IDS.map(id=><td key={id}>{format(quotes[id].quote.total)}</td>)}</tr>
   <tr><td>Renewal subtotal (no onboarding)</td>{IDS.map(id=><td key={id}>{format(quotes[id].renewal.subtotal)}</td>)}</tr>
   <tr><td>Illustrative renewal VAT (7.5%)</td>{IDS.map(id=><td key={id}>{format(quotes[id].renewal.vat)}</td>)}</tr>
   <tr className="chris-demo-print-total"><td>Renewal estimate at current rates</td>{IDS.map(id=><td key={id}>{format(quotes[id].renewal.total)}</td>)}</tr>
   </tbody></table>
   <p className="chris-demo-print-note">Onboarding is charged for the first 12 months only and excluded from renewals. Actual renewal pricing is recalculated using the approved rates effective in the renewal year and billable seats at that time. Renewal estimates above use current demo rates only. VAT is illustrative and subject to final invoice review.</p>
  </section>
  <section><h2>Complete module entitlement comparison</h2>
   {groups.map(([heading,key])=><div key={key} className="chris-demo-print-module-group"><h3>{heading}</h3>
    <table><thead><tr><th>Module</th>{IDS.map(id=><th key={id}>{catalogue.plans[id].label}</th>)}</tr></thead>
    <tbody>{Object.entries(catalogue.modules[key]||{}).map(([code,label])=><tr key={code}><td>{label}</td>{IDS.map(id=><td key={id}>{key==="ess"&&!includeEss?"Optional ESS":quotes[id].quote.entitlements[key].includes(code)?"Included":"Not included"}</td>)}</tr>)}</tbody></table>
   </div>)}
  </section>
  <section><h2>Reports & Analytics scope</h2>
   <table><thead><tr><th>Plan</th><th>Reporting scope</th></tr></thead><tbody>{IDS.map(id=><tr key={id}><td>{catalogue.plans[id].label}</td><td>{catalogue.modules.reportingScope[id]}</td></tr>)}</tbody></table>
  </section>
  <footer>Corporate Resources Network · CHRiS sales demonstration · Non-binding pricing illustration</footer>
 </article>;
}
