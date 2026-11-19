import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";

const clauses = [
  ["1. Remuneration", "Your gross monthly salary shall be {{gross_monthly_salary}} ({{salary_amount_in_words}}), payable in accordance with the Company's established payroll schedule. Applicable statutory deductions, including Pay-As-You-Earn (PAYE) tax, employee pension contributions and other lawful deductions, shall be made in accordance with prevailing legislation and Company policy."],
  ["2. Hours of Work", "Your normal working hours shall commence at {{work_start_time}}, in accordance with the duty roster applicable to your position and department. You shall be entitled to at least one (1) rest day in every seven (7) consecutive days, subject to applicable labour regulations. The Company may reasonably adjust working hours, shifts and duty schedules to meet operational requirements, subject to applicable law and reasonable notice."],
  ["3. Probationary Period", "Your employment shall be subject to a probationary period of {{probation_duration}}, commencing on your official resumption date. During probation, either party may terminate employment by giving one (1) day's written notice or payment of one (1) day's gross salary in lieu of notice, subject to applicable law. Upon satisfactory completion of probation and the relevant performance evaluation, your appointment may be confirmed in writing."],
  ["4. Payment of Salary", "The Company's payroll period runs from the first to the last day of each calendar month. Your salary shall be processed and paid according to the Company's approved salary payment schedule and applicable statutory requirements. Where employment commences or terminates during a payroll period, salary shall be calculated proportionately in accordance with the applicable payroll rules."],
  ["5. Misconduct and Summary Dismissal", "The Company maintains standards of integrity, discipline and professional conduct. Acts of gross misconduct may warrant summary dismissal, subject to appropriate investigation, due process and applicable law. Examples include theft, fraud, falsification of records, gross insubordination, fighting or violence on duty, corruption or bribery, intoxication or unauthorized use of prohibited substances on duty, and serious negligence or deliberate misconduct causing material loss, danger or damage. Disciplinary action shall be determined under the Company's procedures and applicable law."],
  ["6. Termination of Employment After Probation", "Following confirmation of appointment, either party may terminate employment by giving written notice or payment in lieu as follows: one (1) week for continuous service over three months but less than two years; two (2) weeks for two to less than five years; one (1) month for five years and above. The applicable notice shall not be less than the statutory minimum. Termination for other lawful reasons remains subject to applicable procedures and contractual obligations."],
  ["7. Absence from Duty", "You must report for duty according to your schedule and promptly inform your Supervisor or Line Manager if unable to attend work. Unauthorized absence without lawful justification may constitute misconduct. After three (3) consecutive working days without notice or satisfactory explanation, the Company will make reasonable efforts to contact you and request an explanation. Unsatisfactory or absent explanations may lead to disciplinary proceedings, including possible termination after due process. Employment does not terminate automatically. Approved leave, certified sickness, public holidays, lawful suspension and other valid excuses are excluded."],
  ["8. Bank Details", "You must provide accurate personal bank account information within two (2) weeks of resumption to facilitate salary payment, and promptly notify HR of subsequent changes."],
  ["9. Statutory and Employment Benefits", "Subject to eligibility requirements, applicable legislation and approved Company policies, you shall receive: pension contributions in accordance with the Pension Reform Act; {{annual_leave_days}} {{annual_leave_day_unit}} of annual leave as determined by your effective CHRiS employment level, applicable leave policy and approved individual exceptions; recognized Nigerian public holidays; individual HMO coverage after satisfactory completion of probation, subject to scheme rules; and other eligible employment benefits. Year-End Bonus (if approved by management): {{year_end_bonus_clause}} Benefits shall be administered through CHRiS where applicable and remain subject to approved eligibility conditions."],
  ["10. Confidentiality and Conduct", "You shall comply with lawful Company rules, policies, procedures and professional standards. You must protect confidential information about the Company, its employees, customers, suppliers, operations and business affairs during and after employment, except where disclosure is authorized or required by law."],
  ["11. Guarantors", "You must submit two (2) duly completed and signed guarantor forms from reputable persons who can attest to your character and integrity, in accordance with the Company's onboarding requirements."],
  ["12. Entire Agreement", "This letter, together with expressly incorporated employment documents and applicable Company policies, sets out the principal employment terms. Amendments to contractual terms shall be handled through an authorized documented process. Indicate your acceptance by signing and returning a copy of this letter."],
  ["13. Place of Work", "Your initial duty station is {{work_location_address}}. You are expected to resume on {{commencement_date}} and report to {{reporting_manager_or_department}}. The Company may make reasonable assignments or transfers for operational requirements, subject to notice and applicable employment terms."],
  ["14. Job Responsibilities", "Your duties are outlined in the Job Description attached to this offer as part of your onboarding documentation. You must perform them diligently and professionally. Duties may be reasonably reviewed or amended in accordance with operational requirements and employment terms."],
];

const initial = {
  employee_title: "Mr./Ms.", employee_full_name: "", employee_salutation_name: "",
  letter_date: new Date().toISOString().slice(0, 10), offer_reference_number: "",
  job_title: "", commencement_date: "", branch_name: "", gross_monthly_salary: "",
  salary_amount_in_words: "", work_start_time: "9:00 a.m.", probation_duration: "three (3) months",
  work_location_address: "", reporting_manager_or_department: "",
  authorized_signatory_name: "ODIAMEHI, ZS.",
  authorized_signatory_position: "Head, Human Resource & Administration",
};
const fields = [
  ["employee_title", "Title"], ["employee_salutation_name", "Salutation name"],
  ["letter_date", "Letter date"], ["offer_reference_number", "Offer reference"],
  ["commencement_date", "Commencement date"], ["gross_monthly_salary", "Gross monthly salary"],
  ["salary_amount_in_words", "Salary in words"], ["work_start_time", "Work start time"],
  ["probation_duration", "Probation period"], ["work_location_address", "Duty station address"],
  ["reporting_manager_or_department", "Reports to"],
  ["authorized_signatory_name", "Company signatory"],
  ["authorized_signatory_position", "Signatory designation"],
];
const required = ["offer_reference_number", "commencement_date", "gross_monthly_salary", "salary_amount_in_words", "work_location_address", "reporting_manager_or_department", "authorized_signatory_name"];
function fill(source, values) {
  return String(source).replace(/{{([a-z_]+)}}/g, (match, key) => String(values[key] ?? match));
}
function formatDate(value) {
  if (!value) return "";
  const d = new Date(value + "T00:00:00");
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}
function createPrintDocument({ values, sections, brandingLogo }) {
  const frame = document.createElement("iframe");
  frame.title = "Zermatt offer letter print";
  frame.style.cssText = "position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0;";
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.title = "Zermatt Offer of Employment — HR Draft";
  const css = doc.createElement("style");
  css.textContent = `@page{size:A4;margin:16mm 17mm} body{font:11pt/1.48 Arial,sans-serif;color:#17271e;background:white} h1{text-align:center;font-size:16pt;letter-spacing:.04em;margin:8px 0 15px} h2{font-size:11pt;margin:14px 0 4px;break-after:avoid} p{margin:5px 0 9px;white-space:pre-wrap} .meta{border-top:1px solid #c3d0c7;border-bottom:1px solid #c3d0c7;padding:8px 0;margin:12px 0} .meta p{margin:2px 0} .logo{width:72px;height:55px;object-fit:contain;display:block;margin:0 auto} .company{text-align:center;font-weight:700;font-size:15pt}.section{break-inside:avoid-page}.sign{margin-top:22px;white-space:pre-wrap} footer{font-size:9pt;text-align:center;border-top:1px solid #b7c3ba;margin-top:26px;padding-top:7px} .draft{position:fixed;right:0;top:0;color:#ad3e27;font-size:9pt} `;
  doc.head.append(css);
  function el(tag, text, parent = doc.body, className = "") {
    const e = doc.createElement(tag); if (className) e.className = className; e.textContent = text; parent.append(e); return e;
  }
  const img = doc.createElement("img"); img.className = "logo"; img.src = brandingLogo; img.alt = "Zermatt Liquor Limited logo"; doc.body.append(img);
  el("div", "ZERMATT LIQUOR LIMITED", doc.body, "company");
  el("div", "DRAFT — REVIEW AND AUTHORIZE BEFORE ISSUE", doc.body, "draft");
  el("h1", "OFFER OF EMPLOYMENT");
  const meta = el("div", "", doc.body, "meta");
  el("p", `TO: ${values.employee_title} ${values.employee_full_name}`, meta);
  el("p", "FROM: Administration & Human Resources Department", meta);
  el("p", `DATE: ${formatDate(values.letter_date)}     REFERENCE: ${values.offer_reference_number}`, meta);
  el("p", `Dear ${values.employee_salutation_name},`);
  el("p", `SUBJECT: OFFER OF EMPLOYMENT\nWe are pleased to offer you employment with Zermatt Liquor Limited as ${values.job_title}, effective ${formatDate(values.commencement_date)}, at ${values.branch_name}, subject to the following terms and conditions.`);
  sections.forEach(([heading, text]) => { const div = el("section", "", doc.body, "section"); el("h2", heading, div); el("p", text, div); });
  el("p", "Congratulations on your appointment. We look forward to your contribution to the continued success of Zermatt Liquor Limited.");
  el("div", `Yours faithfully,\nFor: ZERMATT LIQUOR LIMITED\n\nAuthorized Company Representative\nSignature: __________________________\nName: ${values.authorized_signatory_name}\nDesignation: ${values.authorized_signatory_position}\nDate: __________________________\n\nACCEPTANCE OF EMPLOYMENT\nI, ${values.employee_full_name}, acknowledge receipt and accept the terms above.\nEmployee Signature: __________________________\nEmployee Name: ${values.employee_full_name}\nDate: __________________________`, doc.body, "sign");
  el("footer", `ZERMATT LIQUOR LIMITED · ${values.branch_name}\nConfidential Employment Document | Powered and generated by CHRiS`);
  return { frame, img };
}
export default function ZermattOfferLetterComposer() {
  const [employeeNameSearch, setEmployeeNameSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedEmployeeNumber, setSelectedEmployeeNumber] = useState("");
  const [terms, setTerms] = useState(null);
  const [values, setValues] = useState(initial);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editClauses, setEditClauses] = useState(false);
  const resolved = useMemo(() => ({
    ...values,
    annual_leave_days: terms?.annualLeaveDays ?? "[authoritative entitlement required]",
    annual_leave_day_unit: String(terms?.annualLeaveUnit || "").replaceAll("_", " ").toLowerCase(),
    year_end_bonus_clause: terms?.yearEndBonusClause || "[CHRiS bonus eligibility required]",
  }), [values, terms]);
  const sections = useMemo(() => clauses.map(([heading, text], i) => [heading, overrides[i] ?? fill(text, resolved)]), [overrides, resolved]);
  const missing = required.filter(key => !String(values[key] || "").trim());
  useEffect(() => {
    const name = employeeNameSearch.trim();
    if (name.length < 2) { setMatches([]); setSearchLoading(false); return; }
    let active = true;
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      apiRequest(`/api/zermatt/offer-terms/search?name=${encodeURIComponent(name)}`)
        .then(result => { if (active) setMatches(result.data || []); })
        .catch(err => { if (active) { setMatches([]); setError(err.message || "Employee name search failed."); } })
        .finally(() => { if (active) setSearchLoading(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [employeeNameSearch]);
  async function load(employeeNumber) {
    try {
      setLoading(true); setError(""); setTerms(null); setOverrides({});
      if (!employeeNumber) throw new Error("Select an employee from the matching names.");
      const result = await apiRequest(`/api/zermatt/offer-terms/${encodeURIComponent(employeeNumber)}`);
      const detail = result.data;
      setTerms(detail);
      setSelectedEmployeeNumber(employeeNumber);
      setEmployeeNameSearch(detail.employeeName || "");
      setMatches([]);
      const firstName = String(detail.employeeName || "").split(" ")[0];
      setValues({ ...initial, employee_full_name: detail.employeeName || "", employee_salutation_name: firstName,
        job_title: detail.designation || "", branch_name: detail.branch || "",
        commencement_date: detail.hireDate || "", work_location_address: detail.branch || "" });
    } catch (err) { setError(err.message || "Unable to load employee details."); }
    finally { setLoading(false); }
  }
  async function print() {
    if (!terms || missing.length) { setError("Complete all required fields and load authoritative employee terms before printing."); return; }
    setError("");
    const logo = new URL("/zrt-logo.jpeg", window.location.href).href;
    const { frame, img } = createPrintDocument({ values, sections, brandingLogo: logo });
    try { await Promise.race([img.decode(), new Promise(resolve => setTimeout(resolve, 1200))]); } catch { /* Company name remains visible if logo unavailable. */ }
    frame.contentWindow.focus();
    frame.contentWindow.print();
    window.setTimeout(() => frame.remove(), 12000);
  }
  return <section style={{ border: "1px solid #a3b5ab", borderRadius: 10, padding: 18, marginBottom: 18 }}>
    <h2>Zermatt Offer Letter Composer · Draft v1.0</h2>
    <p>Load an employee's authoritative CHRiS terms, complete editable HR fields, review clauses, then print or save as PDF. Printing does not approve, sign, issue or archive the letter.</p>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 15 }}>
      <div style={{ minWidth: 280, flex: "1 1 360px", position: "relative" }}>
        <label htmlFor="zermatt-offer-employee-name">Search employee by name</label>
        <input id="zermatt-offer-employee-name" aria-label="Search employee by name" style={{ display: "block", width: "100%", boxSizing: "border-box" }}
          value={employeeNameSearch} autoComplete="off" onChange={e => { setEmployeeNameSearch(e.target.value); setTerms(null); setSelectedEmployeeNumber(""); setError(""); }}
          placeholder="Type first, middle or surname" />
        {searchLoading && <p role="status">Searching employees…</p>}
        {employeeNameSearch.trim().length >= 2 && !searchLoading && !matches.length && !selectedEmployeeNumber && <p>No matching employees in your authorized branch.</p>}
        {matches.length > 0 && !selectedEmployeeNumber && <div role="listbox" aria-label="Matching employees" style={{ border: "1px solid #91a99d", borderRadius: 6, maxHeight: 250, overflowY: "auto", background: "var(--chris-surface, #fff)", padding: 4 }}>
          {matches.map(person => <button key={person.employeeNumber} role="option" aria-selected="false" type="button"
            style={{ display: "block", width: "100%", padding: 10, marginBottom: 4, textAlign: "left", background: "transparent", color: "inherit", border: "1px solid #aaa", borderRadius: 4, cursor: "pointer" }}
            disabled={loading} onClick={() => load(person.employeeNumber)}>
            <strong>{person.employeeName}</strong> · {person.designation} · {person.branch}
          </button>)}
        </div>}
        {selectedEmployeeNumber && <p>Selected employee: <strong>{values.employee_full_name}</strong></p>}
      </div>
    </div>
    {error && <p role="alert" style={{ color: "#d85a44" }}>{error}</p>}
    {terms && <>
      <p><strong>{terms.employeeName}</strong> · {terms.designation} · {terms.branch} · {terms.employmentLevel} · <strong>{terms.annualLeaveDays} {terms.annualLeaveUnit.replaceAll("_", " ").toLowerCase()} annual leave</strong> · {terms.yearEndBonusEligible ? "Year-End Bonus subject to management approval" : "Expatriate — bonus excluded"}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {fields.map(([key,label]) => <label key={key} style={{ display: "grid", gap: 4 }}>{label}{required.includes(key) ? " *" : ""}
          <input aria-label={label} value={values[key] || ""} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} />
        </label>)}
      </div>
      <p style={{ marginTop: 10 }}>Authoritative annual-leave entitlement and bonus eligibility are read-only. Salary and other HR fields must be reviewed against approved records before issue.</p>
      <button type="button" onClick={() => setEditClauses(v => !v)}>{editClauses ? "Close clause editor" : "Customize clauses"}</button>
      {editClauses && <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {sections.map(([heading, text], i) => <label key={heading} style={{ display: "grid", gap: 4 }}>{heading}
          <textarea rows={5} value={text} onChange={e => setOverrides(v => ({ ...v, [i]: e.target.value }))} />
        </label>)}
        <button type="button" onClick={() => setOverrides({})}>Restore standard clauses</button>
      </div>}
      <p style={{ marginTop: 12 }}><strong>Review:</strong> {missing.length ? `Complete ${missing.length} required field(s): ${missing.join(", ")}` : "All required fields entered. Final HR/legal review and signatory approval still required."}</p>
      <button type="button" disabled={Boolean(missing.length)} onClick={print}>Print / Save Draft PDF</button>
    </>}
  </section>;
}
