import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../services/api";

const money = (value, currency = "NGN") => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString()}`;
  }
};

function useLoad(path, initial = []) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await apiRequest(path);
      setData(response?.data ?? initial);
    } catch (err) {
      setError(err.message || "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, setError, load };
}

export default function NigeriaPayrollWorkspace({ mode }) {
  const navigate = useNavigate();
  const titles = {
    execute: ["Execute Payroll", "Calculate ZERMATT payroll from uploaded gross salary, employment-type standard days, attendance exceptions, Nigeria PAYE and pension rules."],
    statutory: ["Nigeria Statutory Setup", "Review the effective payroll policy, salary split, PAYE bands, pension basis and employer-only statutory costs applied by CHRiS."],
    "rent-relief": ["Tax Rent Relief", "Record and verify annual rent declarations before CHRiS uses the permitted rent relief in PAYE."],
  };
  const [title, description] = titles[mode] || titles.execute;
  return (
    <section style={pageStyle}>
      <button type="button" style={backButton} onClick={() => navigate("/payroll")}>← Payroll Dashboard</button>
      <div style={eyebrow}>NIGERIA PAYROLL COMPLIANCE</div>
      <h1 style={titleStyle}>{title}</h1>
      <p style={leadStyle}>{description}</p>
      {mode === "execute" && <ExecuteNigeriaWorkspace />}
      {mode === "statutory" && <StatutoryWorkspace />}
      {mode === "rent-relief" && <RentReliefWorkspace />}
    </section>
  );
}

function StatutoryWorkspace() {
  const navigate = useNavigate();
  const { data, loading, error } = useLoad("/api/payroll/compliance-policy", {});
  const policy = data?.policy;
  if (loading) return <Panel title="Nigeria Payroll Policy"><div style={loadingStyle}>Loading policy…</div></Panel>;
  if (error) return <Feedback error={error} />;
  if (!policy) return <Feedback error="No active Nigeria payroll policy is configured for this organization." />;

  const structure = policy.salaryStructure || {};
  const paye = policy.payeRules || {};
  const employerRules = policy.employerStatutoryRules || {};
  return (
    <>
      <Panel title={`${policy.name} · v${policy.versionNumber}`}>
        <div style={summaryGrid}>
          <Summary label="Jurisdiction" value={policy.jurisdiction} />
          <Summary label="Effective" value={`${policy.effectiveFrom}${policy.effectiveTo ? ` → ${policy.effectiveTo}` : " → open"}`} />
          <Summary label="PAYE Rule" value={paye.ruleCode || "NG-NTA-2025-2026"} />
          <Summary label="Pension" value={`${policy.pensionEmployeeRate}% employee · ${policy.pensionEmployerRate}% employer`} />
        </div>
      </Panel>

      <Panel title="ZERMATT Gross Salary Structure">
        <p style={controlNote}>The uploaded Salary Rate is the authoritative monthly gross. These six items are a 100% split of gross, not extra allowances added on top.</p>
        <DataTable columns={["Component", "% of Gross", "Pensionable"]}>
          {Object.entries(structure).map(([key, value]) => (
            <tr key={key}>
              <Td strong>{key.charAt(0).toUpperCase() + key.slice(1)}</Td>
              <Td>{Number(value)}%</Td>
              <Td>{(policy.pensionableComponents || []).includes(key) ? "Yes" : "No"}</Td>
            </tr>
          ))}
        </DataTable>
      </Panel>

      <Panel title="Payroll Standard Days">
        <DataTable columns={["Employment Type", "Standard Pay Days"]}>
          {Object.entries(policy.standardDays || {}).map(([key, value]) => <tr key={key}><Td strong>{key}</Td><Td>{value}</Td></tr>)}
        </DataTable>
        <p style={controlNote}>If Attendance Payroll contains an exception for the exact payroll period, CHRiS uses its worked/payable days as the numerator. Otherwise the configured standard days are used.</p>
      </Panel>

      <Panel title="Nigeria Statutory Treatment">
        <DataTable columns={["Item", "Treatment", "Payroll Effect"]}>
          <tr><Td strong>PAYE</Td><Td>Automated under {paye.ruleCode || "NG-NTA-2025-2026"}</Td><Td>Employee deduction</Td></tr>
          <tr><Td strong>Pension</Td><Td>{policy.pensionEmployeeRate}% employee + {policy.pensionEmployerRate}% employer on Basic + Housing + Transport</Td><Td>Employee deduction + employer cost</Td></tr>
          <tr><Td strong>Rent Relief</Td><Td>{paye.rentReliefRate || 20}% of verified annual rent, capped at {money(paye.rentReliefCap || 500000)}</Td><Td>Reduces annual PAYE chargeable income</Td></tr>
          <tr><Td strong>NSITF / ECS</Td><Td>{employerRules.nsitf?.employerRate || 1}% of payroll</Td><Td>Employer only; never deducted from employee</Td></tr>
          <tr><Td strong>ITF</Td><Td>{employerRules.itf?.employerRate || 1}% payroll accrual</Td><Td>Employer levy/accrual; never deducted from employee</Td></tr>
          <tr><Td strong>NHF</Td><Td>{paye.nhf?.enabled ? "Enabled" : "Not deducted until applicability is configured"}</Td><Td>{paye.nhf?.enabled ? "Eligible employee deduction" : "No employee deduction"}</Td></tr>
        </DataTable>
      </Panel>

      <Panel title="Related Payroll Setup Paths">
        <div style={buttonRow}>
          <button style={secondaryButton} onClick={() => navigate("/payroll?workspace=allowances")}>Other Allowances</button>
          <button style={secondaryButton} onClick={() => navigate("/payroll?workspace=deductions")}>Other Deductions</button>
          <button style={secondaryButton} onClick={() => navigate("/payroll?workspace=rent-relief")}>Tax Rent Relief</button>
          <button style={secondaryButton} onClick={() => navigate("/payroll?workspace=rates")}>Gross Salary Rates</button>
        </div>
      </Panel>
    </>
  );
}

function RentReliefWorkspace() {
  const year = new Date().getFullYear();
  const { data: rows, loading, error, setError, load } = useLoad(`/api/payroll/tax-reliefs?taxYear=${year}`);
  const [form, setForm] = useState({ employeeNumber: "", taxYear: String(Math.max(2026, year)), annualRentPaid: "", evidenceReference: "", notes: "" });
  const [busy, setBusy] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    try {
      setBusy("save"); setError("");
      await apiRequest("/api/payroll/tax-reliefs/rent", { method: "POST", body: JSON.stringify(form) });
      setForm((current) => ({ ...current, employeeNumber: "", annualRentPaid: "", evidenceReference: "", notes: "" }));
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  const decide = async (id, decision) => {
    try {
      setBusy(`${decision}-${id}`); setError("");
      await apiRequest(`/api/payroll/tax-reliefs/${id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision, notes: decision === "VERIFY" ? "Rent relief evidence reviewed for payroll." : "Rent relief rejected during verification." }),
      });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  return (
    <>
      <Panel title="Declare Annual Rent">
        <p style={controlNote}>CHRiS calculates eligible rent relief as 20% of annual rent paid, capped at ₦500,000. PAYE uses it only after verification. Record a receipt, tenancy, payment-document or document-library reference before verification.</p>
        <form style={formGrid} onSubmit={submit}>
          <Input label="Employee Number" value={form.employeeNumber} onChange={(value) => setForm((p) => ({ ...p, employeeNumber: value }))} placeholder="ZLL000001" required />
          <Input type="number" label="Tax Year" value={form.taxYear} onChange={(value) => setForm((p) => ({ ...p, taxYear: value }))} min="2026" required />
          <Input type="number" label="Annual Rent Paid" value={form.annualRentPaid} onChange={(value) => setForm((p) => ({ ...p, annualRentPaid: value }))} min="0" step="0.01" required />
          <Input label="Evidence / Document Reference" value={form.evidenceReference} onChange={(value) => setForm((p) => ({ ...p, evidenceReference: value }))} placeholder="Receipt no., document ID or file reference" />
          <Input label="Notes" value={form.notes} onChange={(value) => setForm((p) => ({ ...p, notes: value }))} />
          <div><button style={primaryButton} disabled={busy}>{busy === "save" ? "Saving…" : "Save for Verification"}</button></div>
        </form>
      </Panel>
      <Feedback error={error} />
      <Panel title="Rent Relief Register">
        <DataTable loading={loading} columns={["Employee", "Name", "Year", "Annual Rent", "Eligible Relief", "Evidence", "Status", "Action"]}>
          {(rows || []).map((row) => (
            <tr key={row.id}>
              <Td strong>{row.employeeNumber}</Td><Td>{row.employeeName}</Td><Td>{row.taxYear}</Td>
              <Td>{money(row.annualDeclaredAmount)}</Td><Td>{money(row.eligibleReliefAmount)}</Td><Td>{row.evidenceReference || "—"}</Td><Td><Badge>{row.status}</Badge></Td>
              <Td>{row.status === "PENDING_VERIFICATION" ? <div style={buttonRow}><button style={smallButton} disabled={busy} onClick={() => decide(row.id, "VERIFY")}>Verify</button><button style={dangerButton} disabled={busy} onClick={() => decide(row.id, "REJECT")}>Reject</button></div> : "—"}</Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}

function ExecuteNigeriaWorkspace() {
  const { data: periods, error: periodsError } = useLoad("/api/payroll/periods");
  const { data: runs, loading, error, setError, load } = useLoad("/api/payroll/runs");
  const { data: policyData } = useLoad("/api/payroll/compliance-policy", {});
  const [periodId, setPeriodId] = useState("");
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState("");
  const selectablePeriods = (periods || []).filter((period) => period.status !== "CLOSED");

  const calculate = async () => {
    try {
      setBusy("calculate"); setError("");
      const response = await apiRequest("/api/payroll/runs/draft", { method: "POST", body: JSON.stringify({ periodId }) });
      setLines(response.data?.lines || []);
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };
  const viewLines = async (runId) => {
    try { setBusy(runId); setError(""); setLines((await apiRequest(`/api/payroll/runs/${runId}/lines`)).data || []); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  };
  const submit = async (runId) => {
    try {
      setBusy(`submit-${runId}`); setError("");
      await apiRequest(`/api/payroll/runs/${runId}/submit`, { method: "POST", body: JSON.stringify({ notes: "Submitted after Nigeria statutory calculation review." }) });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  };

  return (
    <>
      <Panel title="Nigeria-Compliant Draft Payroll">
        <div style={buttonRow}>
          <Select label="Payroll Period" value={periodId} onChange={setPeriodId} options={[["", "Select payroll period"], ...selectablePeriods.map((p) => [p.id, `${p.code} — ${p.name}`])]} />
          <button type="button" style={primaryButton} disabled={!periodId || busy || !policyData?.configured} onClick={calculate}>{busy === "calculate" ? "Calculating…" : "Calculate Payroll"}</button>
        </div>
        <p style={controlNote}>CHRiS applies the effective ZERMATT salary structure, 26/16 standard-day rule, verified rent relief, Nigeria PAYE bands, 8% employee pension and 10% employer pension on Basic + Housing + Transport. NSITF and ITF are tracked as employer costs. No bank/payment instruction is transmitted.</p>
      </Panel>
      <Feedback error={periodsError || error || (!policyData?.configured ? "Nigeria payroll policy is not configured. Apply the payroll compliance migration before execution." : "")} />
      <Panel title="Payroll Runs">
        <DataTable loading={loading} columns={["Period", "Status", "Statutory", "Employees", "Gross", "Deductions", "Net", "Action"]}>
          {(runs || []).map((run) => (
            <tr key={run.id}>
              <Td strong>{run.periodCode}</Td><Td><Badge>{run.status}</Badge></Td><Td><Badge>{run.statutoryStatus}</Badge></Td><Td>{run.employeeCount}</Td>
              <Td>{money(run.grossTotal)}</Td><Td>{money(run.deductionTotal)}</Td><Td>{money(run.netPreviewTotal)}</Td>
              <Td><div style={buttonRow}><button style={smallButton} onClick={() => viewLines(run.id)} disabled={busy === run.id}>View</button>{(run.status === "DRAFT" || run.status === "REJECTED") && <button style={smallButton} onClick={() => submit(run.id)} disabled={busy === `submit-${run.id}`}>Submit</button>}</div></Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      {lines.length > 0 && <Panel title="Employee Payroll Calculation"><NigeriaRunLines rows={lines} /></Panel>}
    </>
  );
}

function NigeriaRunLines({ rows }) {
  return (
    <DataTable columns={["Employee", "Days", "Basic", "Housing", "Transport", "Meal", "Medical", "Utility", "Other Allow.", "PAYE", "Pension", "Other Ded.", "Advance", "Gross", "Net"]}>
      {(rows || []).map((row) => {
        const details = row.details || {};
        const structure = details.salaryStructure || {};
        const statutory = details.statutory || {};
        const otherAllow = (details.customAllowances || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
        const otherDed = (details.customDeductions || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
        return (
          <tr key={row.id}>
            <Td strong>{row.employeeNumber}</Td>
            <Td>{details.attendance ? `${details.attendance.payableDays}/${details.attendance.standardDays}` : "—"}</Td>
            <Td>{money(structure.basic, row.currency)}</Td><Td>{money(structure.housing, row.currency)}</Td><Td>{money(structure.transport, row.currency)}</Td>
            <Td>{money(structure.meal, row.currency)}</Td><Td>{money(structure.medical, row.currency)}</Td><Td>{money(structure.utility, row.currency)}</Td>
            <Td>{money(otherAllow, row.currency)}</Td><Td>{money(statutory.payeTax, row.currency)}</Td><Td>{money(statutory.employeePension, row.currency)}</Td>
            <Td>{money(otherDed, row.currency)}</Td><Td>{money(row.advanceRecovery, row.currency)}</Td><Td>{money(row.grossPay, row.currency)}</Td><Td strong>{money(row.netPreview, row.currency)}</Td>
          </tr>
        );
      })}
    </DataTable>
  );
}

function Summary({ label, value }) {
  return <div style={summaryCard}><div style={summaryLabel}>{label}</div><strong>{value}</strong></div>;
}
function Panel({ title, children }) { return <section style={panelStyle}><h2 style={panelTitle}>{title}</h2>{children}</section>; }
function Feedback({ error }) { return error ? <div role="alert" style={errorStyle}>{error}</div> : null; }
function Input({ label, value, onChange, type = "text", ...props }) { return <label style={fieldLabel}><span>{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} {...props} /></label>; }
function Select({ label, value, onChange, options }) { return <label style={fieldLabel}><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>{options.map(([key, name]) => <option key={key || "blank"} value={key}>{name}</option>)}</select></label>; }
function DataTable({ columns, children, loading = false }) { return <div style={tableWrap}>{loading ? <div style={loadingStyle}>Loading…</div> : <table style={tableStyle}><thead><tr>{columns.map((column) => <th key={column} style={thStyle}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table>}</div>; }
function Td({ children, strong = false }) { return <td style={{ ...tdStyle, ...(strong ? { fontWeight: 900, color: "#F7FAF8" } : {}) }}>{children}</td>; }
function Badge({ children }) { return <span style={badgeStyle}>{children || "—"}</span>; }

const pageStyle = { maxWidth: 1500, margin: "0 auto", color: "#F7FAF8" };
const backButton = { border: 0, background: "transparent", color: "#D4AF37", fontWeight: 900, cursor: "pointer", padding: "0 0 14px" };
const eyebrow = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle = { margin: "6px 0", fontSize: 32 };
const leadStyle = { color: "#C7D3CC", lineHeight: 1.65, maxWidth: 1050, marginBottom: 22 };
const panelStyle = { marginTop: 18, padding: 20, border: "1px solid rgba(212,175,55,.45)", borderRadius: 15, background: "linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96))", boxShadow: "0 15px 38px rgba(0,0,0,.24)" };
const panelTitle = { margin: "0 0 15px", fontSize: 18, color: "#D4AF37" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, alignItems: "end" };
const fieldLabel = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800, minWidth: 200 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8", outline: "none" };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 16px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)" };
const smallButton = { ...secondaryButton, padding: "6px 10px", fontSize: 11 };
const dangerButton = { ...smallButton, color: "#FCA5A5", borderColor: "rgba(248,113,113,.55)" };
const buttonRow = { display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" };
const tableWrap = { overflowX: "auto", minHeight: 50 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle = { textAlign: "left", padding: "10px 9px", color: "#D4AF37", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.09)", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 9px", color: "#C7D3CC", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.055)", verticalAlign: "top", whiteSpace: "nowrap" };
const badgeStyle = { display: "inline-block", borderRadius: 999, padding: "4px 8px", border: "1px solid rgba(212,175,55,.4)", color: "#D4AF37", background: "rgba(212,175,55,.08)", fontSize: 10, fontWeight: 900 };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, border: "1px solid rgba(248,113,113,.45)", background: "rgba(185,28,28,.14)", color: "#FCA5A5" };
const controlNote = { margin: "13px 0", color: "#C7D3CC", lineHeight: 1.55, fontSize: 12 };
const loadingStyle = { padding: 14, color: "#C7D3CC" };
const summaryGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 };
const summaryCard = { padding: 14, borderRadius: 10, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)" };
const summaryLabel = { color: "#9FB7AA", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 };
