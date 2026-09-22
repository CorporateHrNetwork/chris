import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";
import DisciplinaryProcessControls from "../components/employees/DisciplinaryProcessControls";

const tabs = [
  ["CONTRACTS", "Employment Contract Lifecycle"],
  ["DISCIPLINE", "Employee Relations / Discipline"],
  ["VERIFY", "External Verification Registry"],
];

function EmployeeGovernance() {
  const [tab, setTab] = useState("CONTRACTS");
  const [catalog, setCatalog] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [cases, setCases] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const [catalogResult, contractResult, caseResult, verificationResult] = await Promise.all([
        apiRequest("/api/employment-governance/catalog"),
        apiRequest("/api/employment-governance/contracts"),
        apiRequest("/api/employment-governance/disciplinary-cases"),
        apiRequest("/api/employment-governance/verifications"),
      ]);
      setCatalog(catalogResult.data || null);
      setContracts(contractResult.data || []);
      setCases(caseResult.data || []);
      setVerifications(verificationResult.data || []);
    } catch (err) {
      setError(err.message || "Unable to load employment governance records.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const announce = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4500);
  };

  return (
    <div>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>EMPLOYMENT GOVERNANCE</div>
          <h1 style={titleStyle}>Employment Decisions & Evidence</h1>
          <p style={subtitleStyle}>
            Auditable contract-state transitions, employee-relations evidence and resilient statutory identity verification.
          </p>
        </div>
        <button type="button" style={secondaryButton} onClick={load}>Refresh</button>
      </div>

      <div style={principleStyle}>
        <strong>Control principle:</strong> external police, court or regulator outcomes are linked to an internal HR case but never automatically clear, dismiss or otherwise change that case.
      </div>

      {error && <div role="alert" style={errorStyle}>{error}</div>}
      {notice && <div role="status" style={noticeStyle}>{notice}</div>}

      <div style={tabBarStyle}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={tab === key ? activeTabStyle : tabStyle}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "CONTRACTS" && (
        <ContractPanel
          records={contracts}
          catalog={catalog}
          busy={busy}
          setBusy={setBusy}
          reload={load}
          announce={announce}
          setError={setError}
        />
      )}

      {tab === "DISCIPLINE" && (
        <DisciplinePanel
          records={cases}
          catalog={catalog}
          busy={busy}
          setBusy={setBusy}
          reload={load}
          announce={announce}
          setError={setError}
        />
      )}

      {tab === "VERIFY" && (
        <VerificationPanel
          records={verifications}
          catalog={catalog}
          busy={busy}
          setBusy={setBusy}
          reload={load}
          announce={announce}
          setError={setError}
        />
      )}
    </div>
  );
}

function ContractPanel({ records, catalog, busy, setBusy, reload, announce, setError }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", employeeNumber: "", initialState: "APPLICANT", authority: "HR-authorised lifecycle creation" });
  const [transition, setTransition] = useState({ id: "", toState: "", authority: "", reason: "", documentReference: "", employeeNumber: "" });

  const selected = useMemo(() => records.find((row) => row.id === transition.id), [records, transition.id]);
  const allowed = selected ? (catalog?.contractTransitions?.[selected.currentState] || []) : [];

  const create = async (event) => {
    event.preventDefault();
    try {
      setBusy(true); setError("");
      await apiRequest("/api/employment-governance/contracts", { method: "POST", body: form });
      setForm({ firstName: "", lastName: "", email: "", employeeNumber: "", initialState: "APPLICANT", authority: "HR-authorised lifecycle creation" });
      announce("Employment contract lifecycle created with an auditable initial-state event.");
      await reload();
    } catch (err) { setError(err.message || "Unable to create lifecycle."); } finally { setBusy(false); }
  };

  const advance = async (event) => {
    event.preventDefault();
    try {
      setBusy(true); setError("");
      await apiRequest(`/api/employment-governance/contracts/${transition.id}/transition`, {
        method: "POST",
        body: {
          toState: transition.toState,
          authority: transition.authority,
          reason: transition.reason,
          documentReference: transition.documentReference || undefined,
          employeeNumber: transition.employeeNumber || undefined,
          effectiveDate: new Date().toISOString(),
        },
      });
      announce("Employment state transitioned and audit event appended.");
      setTransition({ id: "", toState: "", authority: "", reason: "", documentReference: "", employeeNumber: "" });
      await reload();
    } catch (err) { setError(err.message || "Unable to transition lifecycle."); } finally { setBusy(false); }
  };

  return (
    <section style={panelStyle}>
      <h2 style={sectionTitle}>Employment Contract Lifecycle</h2>
      <p style={helperStyle}>Applicant → selection → offer approval/issuance/acceptance → conditions → appointment → commencement → active. Every transition requires authority and is append-only.</p>
      <form onSubmit={create} style={formGridStyle}>
        <Field label="First Name"><input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={inputStyle} /></Field>
        <Field label="Last Name"><input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={inputStyle} /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} /></Field>
        <Field label="Existing Employee No (optional)"><input value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} style={inputStyle} /></Field>
        <Field label="Initial State"><select value={form.initialState} onChange={(e) => setForm({ ...form, initialState: e.target.value })} style={inputStyle}>{(catalog?.contractStates || ["APPLICANT"]).map((state) => <option key={state}>{state}</option>)}</select></Field>
        <Field label="Authority"><input required value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} style={inputStyle} /></Field>
        <div><button disabled={busy} style={primaryButton}>Create Lifecycle</button></div>
      </form>

      <div style={dividerStyle} />
      <form onSubmit={advance} style={formGridStyle}>
        <Field label="Lifecycle"><select required value={transition.id} onChange={(e) => setTransition({ ...transition, id: e.target.value, toState: "" })} style={inputStyle}><option value="">Select lifecycle</option>{records.map((row) => <option key={row.id} value={row.id}>{row.referenceCode} — {row.firstName} {row.lastName} — {row.currentState}</option>)}</select></Field>
        <Field label="Next State"><select required value={transition.toState} onChange={(e) => setTransition({ ...transition, toState: e.target.value })} style={inputStyle}><option value="">Select permitted state</option>{allowed.map((state) => <option key={state}>{state}</option>)}</select></Field>
        <Field label="Authority / Approval"><input required value={transition.authority} onChange={(e) => setTransition({ ...transition, authority: e.target.value })} style={inputStyle} /></Field>
        <Field label="Reason"><input value={transition.reason} onChange={(e) => setTransition({ ...transition, reason: e.target.value })} style={inputStyle} /></Field>
        <Field label="Document Reference"><input value={transition.documentReference} onChange={(e) => setTransition({ ...transition, documentReference: e.target.value })} style={inputStyle} /></Field>
        <Field label="Link Employee No before ACTIVE"><input value={transition.employeeNumber} onChange={(e) => setTransition({ ...transition, employeeNumber: e.target.value })} style={inputStyle} /></Field>
        <div><button disabled={busy || !transition.id || !transition.toState} style={primaryButton}>Record Transition</button></div>
      </form>

      <RecordTable headers={["Reference", "Person", "Current State", "Employee Link", "Effective Employment"]} rows={records.map((row) => [row.referenceCode, `${row.firstName} ${row.lastName}`, row.currentState, row.employeeId ? "Linked" : "Pre-employee", row.effectiveEmploymentDate ? new Date(row.effectiveEmploymentDate).toLocaleDateString("en-GB") : "—"])} />
    </section>
  );
}

function DisciplinePanel({ records, catalog, busy, setBusy, reload, announce, setError }) {
  const [form, setForm] = useState({ employeeNumber: "", incidentSummary: "", allegation: "", policyReference: "", policyVersion: "" });
  const [external, setExternal] = useState({ caseId: "", proceedingType: "CRIMINAL", authority: "", referenceNumber: "", status: "OPEN", outcome: "" });

  const create = async (event) => {
    event.preventDefault();
    try { setBusy(true); setError(""); await apiRequest("/api/employment-governance/disciplinary-cases", { method: "POST", body: form }); setForm({ employeeNumber: "", incidentSummary: "", allegation: "", policyReference: "", policyVersion: "" }); announce("Internal disciplinary case created independently of any external proceeding."); await reload(); } catch (err) { setError(err.message || "Unable to create case."); } finally { setBusy(false); }
  };

  const linkExternal = async (event) => {
    event.preventDefault();
    try { setBusy(true); setError(""); const result = await apiRequest(`/api/employment-governance/disciplinary-cases/${external.caseId}/external-proceedings`, { method: "POST", body: external }); announce(result.message || "External proceeding linked without changing the internal HR case."); setExternal({ caseId: "", proceedingType: "CRIMINAL", authority: "", referenceNumber: "", status: "OPEN", outcome: "" }); await reload(); } catch (err) { setError(err.message || "Unable to link proceeding."); } finally { setBusy(false); }
  };

  const downloadPack = async (caseId, caseNumber) => {
    try {
      const result = await apiRequest(`/api/employment-governance/disciplinary-cases/${caseId}/evidence-pack`);
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `${caseNumber}_Employment_Decision_Evidence_Pack.json`; link.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(err.message || "Unable to generate evidence pack."); }
  };

  return (
    <section style={panelStyle}>
      <h2 style={sectionTitle}>Employee Relations / Disciplinary Cases</h2>
      <p style={helperStyle}>Incident, internal disciplinary case and external criminal/regulatory matter remain separate but linkable records. External ACQUITTED does not auto-clear an internal case.</p>
      <form onSubmit={create} style={formGridStyle}>
        <Field label="Employee No"><input required value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} style={inputStyle} /></Field>
        <Field label="Incident Summary"><input required value={form.incidentSummary} onChange={(e) => setForm({ ...form, incidentSummary: e.target.value })} style={inputStyle} /></Field>
        <Field label="Allegation"><input required value={form.allegation} onChange={(e) => setForm({ ...form, allegation: e.target.value })} style={inputStyle} /></Field>
        <Field label="Policy Reference"><input value={form.policyReference} onChange={(e) => setForm({ ...form, policyReference: e.target.value })} style={inputStyle} /></Field>
        <Field label="Policy Version"><input value={form.policyVersion} onChange={(e) => setForm({ ...form, policyVersion: e.target.value })} style={inputStyle} /></Field>
        <div><button disabled={busy} style={primaryButton}>Open Internal Case</button></div>
      </form>

      <DisciplinaryProcessControls
        records={records}
        catalog={catalog}
        busy={busy}
        setBusy={setBusy}
        reload={reload}
        announce={announce}
        setError={setError}
      />

      <div style={dividerStyle} />
      <form onSubmit={linkExternal} style={formGridStyle}>
        <Field label="Internal Case"><select required value={external.caseId} onChange={(e) => setExternal({ ...external, caseId: e.target.value })} style={inputStyle}><option value="">Select case</option>{records.map((row) => <option key={row.id} value={row.id}>{row.caseNumber} — {row.employeeNumber}</option>)}</select></Field>
        <Field label="External Matter Type"><select value={external.proceedingType} onChange={(e) => setExternal({ ...external, proceedingType: e.target.value })} style={inputStyle}><option>CRIMINAL</option><option>POLICE</option><option>REGULATORY</option><option>CIVIL</option></select></Field>
        <Field label="Authority"><input required value={external.authority} onChange={(e) => setExternal({ ...external, authority: e.target.value })} style={inputStyle} /></Field>
        <Field label="Reference"><input value={external.referenceNumber} onChange={(e) => setExternal({ ...external, referenceNumber: e.target.value })} style={inputStyle} /></Field>
        <Field label="External Status"><input value={external.status} onChange={(e) => setExternal({ ...external, status: e.target.value })} style={inputStyle} /></Field>
        <Field label="Outcome (e.g. ACQUITTED)"><input value={external.outcome} onChange={(e) => setExternal({ ...external, outcome: e.target.value })} style={inputStyle} /></Field>
        <div><button disabled={busy} style={primaryButton}>Link External Matter</button></div>
      </form>

      <div style={{ ...tableWrapStyle, marginTop: 20 }}><table style={tableStyle}><thead><tr>{["Case", "Employee", "Status", "Policy", "Evidence Pack"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead><tbody>{records.length ? records.map((row) => <tr key={row.id}><td style={tdStyle}>{row.caseNumber}</td><td style={tdStyle}>{row.employeeNumber}</td><td style={tdStyle}>{row.status}</td><td style={tdStyle}>{row.policyReference || "—"}{row.policyVersion ? ` / ${row.policyVersion}` : ""}</td><td style={tdStyle}><button type="button" style={smallButton} onClick={() => downloadPack(row.id, row.caseNumber)}>Download Pack</button></td></tr>) : <tr><td style={tdStyle} colSpan="5">No disciplinary cases recorded.</td></tr>}</tbody></table></div>
      <p style={helperStyle}>Evidence/process APIs are append-only: query, employee response, investigation, hearing, findings, approvals, decision letter and proof of delivery can be recorded as versioned evidence and process events without overwriting historical versions.</p>
    </section>
  );
}

function VerificationPanel({ records, catalog, busy, setBusy, reload, announce, setError }) {
  const [form, setForm] = useState({ employeeNumber: "", identifierType: "NIN", identifierValue: "", provider: "Nigeria Tax ID / Identity Service", status: "VERIFICATION_PENDING", errorCode: "", errorMessage: "" });
  const submit = async (event) => {
    event.preventDefault();
    try { setBusy(true); setError(""); await apiRequest("/api/employment-governance/verifications", { method: "POST", body: form }); setForm({ ...form, identifierValue: "", errorCode: "", errorMessage: "" }); announce("Verification attempt recorded. Service outages remain distinct from identity mismatch."); await reload(); } catch (err) { setError(err.message || "Unable to record verification."); } finally { setBusy(false); }
  };
  return (
    <section style={panelStyle}>
      <h2 style={sectionTitle}>External Verification Resilience</h2>
      <p style={helperStyle}>A provider outage is recorded as SERVICE_UNAVAILABLE, not as an invalid employee or failed identity. Identifiers are masked in the registry.</p>
      <form onSubmit={submit} style={formGridStyle}>
        <Field label="Employee No (optional)"><input value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} style={inputStyle} /></Field>
        <Field label="Identifier Type"><select value={form.identifierType} onChange={(e) => setForm({ ...form, identifierType: e.target.value })} style={inputStyle}><option>NIN</option><option>TAX_ID</option><option>CAC</option><option>PENSION</option><option>OTHER</option></select></Field>
        <Field label="Identifier"><input required value={form.identifierValue} onChange={(e) => setForm({ ...form, identifierValue: e.target.value })} style={inputStyle} /></Field>
        <Field label="Provider"><input required value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} style={inputStyle} /></Field>
        <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>{(catalog?.verificationStatuses || []).map((status) => <option key={status}>{status}</option>)}</select></Field>
        <Field label="Provider Error Code"><input value={form.errorCode} onChange={(e) => setForm({ ...form, errorCode: e.target.value })} style={inputStyle} /></Field>
        <Field label="Provider Error Message"><input value={form.errorMessage} onChange={(e) => setForm({ ...form, errorMessage: e.target.value })} style={inputStyle} /></Field>
        <div><button disabled={busy} style={primaryButton}>Record Verification Attempt</button></div>
      </form>
      <RecordTable headers={["Subject", "Identifier", "Provider", "Status", "Attempted", "Verified"]} rows={records.map((row) => [row.subjectReference || "—", `${row.identifierType}: ${row.maskedIdentifier}`, row.provider, row.status, new Date(row.attemptedAt).toLocaleString("en-GB"), row.verifiedAt ? new Date(row.verifiedAt).toLocaleString("en-GB") : "—"])} />
    </section>
  );
}

function Field({ label, children }) { return <label style={fieldStyle}><span style={labelStyle}>{label}</span>{children}</label>; }
function RecordTable({ headers, rows }) { return <div style={tableWrapStyle}><table style={tableStyle}><thead><tr>{headers.map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} style={tdStyle}>{cell}</td>)}</tr>) : <tr><td style={tdStyle} colSpan={headers.length}>No records yet.</td></tr>}</tbody></table></div>; }

const headerStyle = { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 };
const eyebrowStyle = { color: "#D6B437", fontWeight: 900, fontSize: 12, letterSpacing: ".08em" };
const titleStyle = { margin: "5px 0 4px", fontSize: 30, color: "#F2F6F3" };
const subtitleStyle = { margin: 0, maxWidth: 850, color: "#AFC0B7", lineHeight: 1.6 };
const principleStyle = { border: "1px solid #6B5B14", background: "#1E210E", color: "#E7E0B0", borderRadius: 12, padding: "13px 15px", marginBottom: 16, lineHeight: 1.5 };
const tabBarStyle = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 };
const tabStyle = { border: "1px solid #315443", background: "#0B2118", color: "#B7C5BE", padding: "10px 14px", borderRadius: 9, cursor: "pointer", fontWeight: 800 };
const activeTabStyle = { ...tabStyle, borderColor: "#D6B437", color: "#F2D75E" };
const panelStyle = { border: "1px solid #315443", background: "#071B13", borderRadius: 15, padding: 18 };
const sectionTitle = { margin: "0 0 4px", color: "#EFF6F1", fontSize: 22 };
const helperStyle = { color: "#AFC0B7", fontSize: 13, lineHeight: 1.55 };
const formGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, alignItems: "end", marginTop: 16 };
const fieldStyle = { display: "grid", gap: 6, minWidth: 0 };
const labelStyle = { color: "#D6B437", fontSize: 11, fontWeight: 900, textTransform: "uppercase" };
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #315443", borderRadius: 8, background: "#0B291D", color: "#ECF4EF", padding: "10px 11px", minHeight: 42 };
const primaryButton = { border: 0, borderRadius: 9, padding: "11px 15px", minHeight: 42, background: "#D6B437", color: "#111A15", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#F2D75E", border: "1px solid #D6B437" };
const smallButton = { ...secondaryButton, minHeight: 32, padding: "6px 9px", fontSize: 12 };
const dividerStyle = { height: 1, background: "#244637", margin: "20px 0 4px" };
const tableWrapStyle = { overflowX: "auto", border: "1px solid #315443", borderRadius: 11, marginTop: 18 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 720 };
const thStyle = { textAlign: "left", color: "#BFCBC5", fontSize: 11, textTransform: "uppercase", padding: 10, background: "#09251A", borderBottom: "1px solid #315443" };
const tdStyle = { color: "#E5EEE9", padding: 10, fontSize: 13, borderBottom: "1px solid #173A2A" };
const errorStyle = { border: "1px solid #9B3A32", background: "#311711", color: "#FFB5AE", borderRadius: 10, padding: 12, marginBottom: 14 };
const noticeStyle = { border: "1px solid #2F7D55", background: "#0C2D1F", color: "#A7F3D0", borderRadius: 10, padding: 12, marginBottom: 14 };

export default EmployeeGovernance;
