import { useEffect, useMemo, useState } from "react";
import { apiRequest, getStoredOrganization } from "../services/api";

const PLAN_IDS = ["basic", "standard", "premium"];
const money = (amount) => "₦" + Number(amount || 0).toLocaleString("en-NG");
const surface = {
  background: "linear-gradient(145deg,rgba(12,38,26,.94),rgba(5,23,15,.98))",
  border: "1px solid rgba(212,175,55,.38)",
  borderRadius: 16,
  padding: 18,
  color: "#F7FAF8",
};
const moduleLabels = {
  dashboard: "Dashboard", support_requests: "Support", employees: "Employees",
  recruitment: "Recruitment", time_attendance: "Time & Attendance",
  leave: "Leave", payroll: "Payroll", compensation_rewards: "Compensation & Rewards",
  benefits: "Benefits", statutories: "Statutories", performance: "Performance",
  training_development: "Training & Development", assets: "Assets",
  documents: "Documents", reports_analytics: "Reports & Analytics",
  organization: "Organization", workflows_approvals: "Workflows & Approvals",
  employment_types: "Employment Types", settings: "Settings",
  billing_subscription: "Billing & Subscription",
};
const essLabels = {
  overview: "Overview", my_profile: "My Profile", onboarding: "Onboarding",
  statutory: "Statutory", payment_payroll: "Payment & Payroll",
  payslips: "Payslips", leave_attendance: "Leave & Attendance",
  performance_evaluation: "Performance Evaluation", gratuity: "Gratuity",
  birthdays_anniversaries: "Birthdays & Anniversaries",
  internal_communications: "Internal Communications", documents: "Documents",
};

export default function DemoBillingSubscriptions() {
  const slug = getStoredOrganization()?.slug;
  const [employees, setEmployees] = useState(slug === "chris-demo-company" ? "48" : "10");
  const [includeEss, setIncludeEss] = useState(true);
  const [catalogue, setCatalogue] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [selected, setSelected] = useState("standard");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest("/api/billing/catalogue")
      .then((response) => { if (active) setCatalogue(response.data); })
      .catch((err) => { if (active) setError(err.message || "Pricing catalogue is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const count = Number(employees);
    if (!catalogue || !Number.isSafeInteger(count) || count < 1 || count > 100000) {
      setQuotes({});
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all(PLAN_IDS.map((planId) =>
      apiRequest("/api/billing/quotes", {
        method: "POST",
        body: { planId, employeeCount: count, includeEss },
      }).then((result) => [planId, result.data])
    ))
      .then((entries) => { if (active) setQuotes(Object.fromEntries(entries)); })
      .catch((err) => { if (active) { setQuotes({}); setError(err.message || "Unable to calculate pricing."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [catalogue, employees, includeEss]);

  const selectedQuote = quotes[selected]?.quote;
  const selectedPlan = catalogue?.plans?.[selected];
  const hrisModules = useMemo(() => (selectedQuote?.entitlements?.hris || []).map((key) => moduleLabels[key] || key), [selectedQuote]);
  const essModules = useMemo(() => (selectedQuote?.entitlements?.ess || []).map((key) => essLabels[key] || key), [selectedQuote]);

  return (
    <div className="chris-page" style={{ color: "#F7FAF8", maxWidth: 1400, margin: "0 auto", paddingBottom: 30 }}>
      <header style={{ ...surface, marginBottom: 18, background: "linear-gradient(135deg,#0b5030,#061a11)" }}>
        <div style={{ color: "#F2CF57", fontWeight: 900, fontSize: 11, letterSpacing: ".12em" }}>CHRiS · DEMONSTRATION PRICING</div>
        <h1 style={{ margin: "8px 0" }}>Billing & Subscription</h1>
        <p style={{ color: "#DCE8DF", marginBottom: 8 }}>Compare Basic, Standard and Premium for {catalogue?.organizationName || "the fictional demo organisation"}.</p>
        <p style={{ color: "#F2CF57", fontSize: 12 }}>Indicative draft catalogue — subject to commercial approval. Pricing previews only: no payment, invoice delivery, subscription activation or tenant entitlement changes.</p>
      </header>

      <section style={{ ...surface, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Pricing calculator</h2>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6, color: "#E5EEE8", fontWeight: 700 }}>
            Number of employees
            <input type="number" min="1" max="100000" step="1" value={employees} onChange={(event) => setEmployees(event.target.value)}
              style={{ padding: "10px 12px", minHeight: 42, width: 180, color: "#F7FAF8", background: "#092719", border: "1px solid #D4AF37", borderRadius: 9 }} />
          </label>
          <label style={{ display: "flex", gap: 9, alignItems: "center", minHeight: 42, color: "#E5EEE8", fontWeight: 700 }}>
            <input type="checkbox" checked={includeEss} onChange={(event) => setIncludeEss(event.target.checked)} />
            Include Employee Self-Service (ESS)
          </label>
        </div>
        <p style={{ color: "#B8C9C0", marginTop: 10, fontSize: 12 }}>12-month licence and optional ESS; onboarding once per employee; annual support; indicative 7.5% VAT.</p>
      </section>

      {loading && <p role="status">Calculating demo prices…</p>}
      {error && <p role="alert" style={{ color: "#FFC1B7" }}>{error}</p>}
      {catalogue && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14, marginBottom: 16 }}>
        {PLAN_IDS.map((id) => {
          const plan = catalogue.plans[id];
          const quote = quotes[id]?.quote;
          const renewal = quotes[id]?.renewal;
          return <section key={id} style={{ ...surface, border: selected === id ? "2px solid #F2CF57" : surface.border }}>
            <h2 style={{ fontSize: 22, color: "#F2CF57", marginBottom: 8 }}>{plan?.label || id}</h2>
            <p style={{ color: "#DCE8DF", fontSize: 13 }}>{money(plan?.licenceMonthly)} / employee / month</p>
            <p style={{ color: "#C5D7CB", fontSize: 12 }}>ESS: {money(plan?.essMonthly)} / employee / month (optional)</p>
            <div style={{ fontSize: 26, fontWeight: 900, margin: "16px 0 4px", color: "#F7FAF8" }}>{quote ? money(quote.total) : "—"}</div>
            <p style={{ fontSize: 12, color: "#B8C9C0" }}>Estimated first year, VAT included</p>
            <div style={{ borderTop: "1px solid rgba(212,175,55,.25)", marginTop: 13, paddingTop: 12, fontSize: 12, lineHeight: 1.9 }}>
              <div>Licence (12 months): {quote ? money(quote.lineItems.licence) : "—"}</div>
              <div>ESS (12 months): {quote ? money(quote.lineItems.ess) : "—"}</div>
              <div>Onboarding: {quote ? money(quote.lineItems.onboarding) : "—"}</div>
              <div>Annual support: {quote ? money(quote.lineItems.support) : "—"}</div>
              <div>Indicative VAT: {quote ? money(quote.vat) : "—"}</div>
              <strong>Annual renewal estimate: {renewal ? money(renewal.total) : "—"}</strong>
            </div>
            <button type="button" onClick={() => setSelected(id)} aria-pressed={selected === id}
              style={{ marginTop: 15, width: "100%", padding: 11, borderRadius: 9, border: "1px solid #D4AF37", background: selected === id ? "#D4AF37" : "#153C2A", color: selected === id ? "#071911" : "#F7FAF8", fontWeight: 800 }}>
              {selected === id ? "Showing included modules" : "View included modules"}
            </button>
          </section>;
        })}
      </div>}

      {selectedQuote && <section style={surface}>
        <h2 style={{ color: "#F2CF57", marginBottom: 8 }}>{selectedPlan?.label} — included modules</h2>
        <p style={{ fontSize: 12, color: "#C5D7CB", marginBottom: 12 }}>These are plan comparison entitlements, not changes to the active demo tenant.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
          <div><h3 style={{ marginBottom: 8 }}>CHRiS modules</h3><ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>{hrisModules.map((label) => <li key={label}>{label}</li>)}</ul></div>
          <div><h3 style={{ marginBottom: 8 }}>ESS modules</h3>{includeEss ? <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>{essModules.map((label) => <li key={label}>{label}</li>)}</ul> : <p>ESS not selected.</p>}</div>
        </div>
      </section>}
    </div>
  );
}
