import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";
import ZermattEmploymentResources from "./ZermattEmploymentResources";

const TABS = [
  ["employee", "Employee Documents"],
  ["hr", "HR Documents"],
  ["policies", "Company Policies"],
  ["templates", "Templates"],
  ["categories", "Document Categories"],
  ["expiry", "Expiry Tracking"],
  ["requests", "Document Requests"],
  ["resources", "Employment Resources & SOPs"],
];
const KIND_BY_TAB = { employee: "EMPLOYEE_DOCUMENT", hr: "HR_DOCUMENT", policies: "COMPANY_POLICY", templates: "TEMPLATE", categories: "CATEGORY" };
const LABEL_BY_KIND = { EMPLOYEE_DOCUMENT: "Employee document", HR_DOCUMENT: "HR document", COMPANY_POLICY: "Company policy", TEMPLATE: "Template", CATEGORY: "Document category" };

export default function DocumentsWorkspace() {
  const [tab, setTab] = useState("employee");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await apiRequest("/api/documents/overview");
      setData(response?.data || null);
    } catch (err) { setError(err.message || "Unable to load Documents."); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const kind = KIND_BY_TAB[tab];
    const source = kind ? (data?.records || []).filter((row) => row.kind === kind) : [];
    const term = search.trim().toLowerCase();
    if (!term) return source;
    return source.filter((row) => [row.title, row.category, row.employeeNumber, row.reference, row.owner, row.status].some((v) => String(v || "").toLowerCase().includes(term)));
  }, [data, search, tab]);

  async function createRecord(kind) {
    const label = LABEL_BY_KIND[kind] || "document";
    const title = window.prompt(`Enter ${label} title:`)?.trim();
    if (!title) return;
    const body = { kind, title };
    if (kind === "EMPLOYEE_DOCUMENT") {
      const employeeNumber = window.prompt("Employee number (for example ZLL000001):")?.trim();
      if (!employeeNumber) return;
      body.employeeNumber = employeeNumber;
    }
    if (kind !== "CATEGORY") {
      body.category = window.prompt("Document category (optional):")?.trim() || null;
      body.reference = window.prompt("Reference / document number (optional):")?.trim() || null;
      body.sourceUrl = window.prompt("Document file/link URL (optional):")?.trim() || null;
      body.expiryDate = window.prompt("Expiry date YYYY-MM-DD (optional):")?.trim() || null;
    }
    try {
      await apiRequest("/api/documents/records", { method: "POST", body });
      setNotice(`${label} created and added to the audit trail.`);
      await load();
    } catch (err) { setError(err.message || `Unable to create ${label}.`); }
  }

  async function archiveRecord(row) {
    if (!window.confirm(`Archive “${row.title}”? The audit history will be preserved.`)) return;
    try {
      await apiRequest(`/api/documents/records/${row.id}`, { method: "PUT", body: { status: "ARCHIVED", reason: "Archived from Documents workspace" } });
      setNotice("Document archived. Audit history retained.");
      await load();
    } catch (err) { setError(err.message || "Unable to archive document."); }
  }

  async function createRequest() {
    const title = window.prompt("What document is required?")?.trim();
    if (!title) return;
    const employeeNumber = window.prompt("Employee number, if this request is employee-specific (optional):")?.trim() || null;
    const requestedFrom = window.prompt("Requested from (person/team) (optional):")?.trim() || null;
    const dueDate = window.prompt("Due date YYYY-MM-DD (optional):")?.trim() || null;
    try {
      await apiRequest("/api/documents/requests", { method: "POST", body: { title, employeeNumber, requestedFrom, dueDate } });
      setNotice("Document request lodged and connected to the request tracker.");
      await load();
    } catch (err) { setError(err.message || "Unable to create document request."); }
  }

  async function changeRequestStatus(row) {
    const status = window.prompt("Status: OPEN, IN_PROGRESS, FULFILLED or CANCELLED", row.status)?.trim().toUpperCase();
    if (!status || status === row.status) return;
    const note = window.prompt("Status note (optional):")?.trim() || null;
    try {
      await apiRequest(`/api/documents/requests/${row.id}/status`, { method: "PUT", body: { status, note } });
      setNotice("Document request status updated.");
      await load();
    } catch (err) { setError(err.message || "Unable to update document request."); }
  }

  if (tab === "resources") return <div><BackTabs tab={tab} setTab={setTab} /><ZermattEmploymentResources /></div>;

  return <div style={{ color: "var(--chris-text-main)" }}>
    <div style={{ marginBottom: 20 }}>
      <div style={eyebrow}>DOCUMENT MANAGEMENT</div>
      <h1 style={{ margin: "7px 0 6px", fontSize: "var(--chris-font-2xl)" }}>Documents Dashboard</h1>
      <p style={lead}>Controlled employee and HR documents, company policies, templates, categories, expiry alerts and document requests. Changes are tenant-scoped and audit-preserving.</p>
    </div>

    <div style={metrics}>
      <Metric label="Employee Documents" value={data?.summary?.employeeDocuments} />
      <Metric label="HR Documents" value={data?.summary?.hrDocuments} />
      <Metric label="Policies" value={data?.summary?.companyPolicies} />
      <Metric label="Templates" value={data?.summary?.templates} />
      <Metric label="Expiring Soon" value={data?.summary?.expiringSoon} />
      <Metric label="Expired" value={data?.summary?.expired} />
      <Metric label="Open Requests" value={data?.summary?.openRequests} />
    </div>

    <BackTabs tab={tab} setTab={setTab} />
    {error && <div style={errorStyle}>{error}</div>}
    {notice && <div style={noticeStyle}>{notice}</div>}
    {!data && !error && <section style={panel}>Loading document controls…</section>}

    {data && ["employee", "hr", "policies", "templates", "categories"].includes(tab) && <>
      <section style={panel}>
        <div style={rowStyle}>
          <div><h2 style={h2}>{TABS.find(([key]) => key === tab)?.[1]}</h2><p style={muted}>Live controlled records. Archive preserves history rather than deleting evidence.</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records" style={input} />
            <button style={primaryButton} onClick={() => createRecord(KIND_BY_TAB[tab])}>+ Add</button>
          </div>
        </div>
      </section>
      <RecordTable rows={rows} onArchive={archiveRecord} />
    </>}

    {data && tab === "expiry" && <ExpiryTable rows={data.expiry || []} />}
    {data && tab === "requests" && <Requests rows={data.requests || []} createRequest={createRequest} changeStatus={changeRequestStatus} />}
  </div>;
}

function BackTabs({ tab, setTab }) { return <div style={tabs}>{TABS.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} style={{ ...tabButton, ...(tab === key ? activeTab : {}) }}>{label}</button>)}</div>; }
function Metric({ label, value }) { return <div style={panel}><div style={muted}>{label}</div><div style={{ fontSize: 26, fontWeight: 900, marginTop: 7 }}>{value ?? "—"}</div></div>; }
function RecordTable({ rows, onArchive }) { return <section style={{ ...panel, marginTop: 15, overflowX: "auto" }}><table style={table}><thead><tr><Th>Title</Th><Th>Employee</Th><Th>Category</Th><Th>Reference</Th><Th>Status</Th><Th>Expiry</Th><Th>Link</Th><Th>Action</Th></tr></thead><tbody>{rows.length ? rows.map((r) => <tr key={r.id}><Td>{r.title}</Td><Td>{r.employeeNumber || "—"}</Td><Td>{r.category || "—"}</Td><Td>{r.reference || "—"}</Td><Td><Badge>{r.status || "ACTIVE"}</Badge></Td><Td>{date(r.expiryDate)}{r.expiryState && r.expiryState !== "NO_EXPIRY" ? <div style={tiny}>{r.expiryState.replaceAll("_", " ")}</div> : null}</Td><Td>{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer" style={link}>Open ↗</a> : "—"}</Td><Td>{r.status !== "ARCHIVED" ? <button style={secondaryButton} onClick={() => onArchive(r)}>Archive</button> : "—"}</Td></tr>) : <tr><Td colSpan={8}>No records yet.</Td></tr>}</tbody></table></section>; }
function ExpiryTable({ rows }) { return <section style={panel}><h2 style={h2}>Expiry Tracking</h2><p style={muted}>Automatically derived from document expiry dates.</p><table style={{ ...table, marginTop: 14 }}><thead><tr><Th>Document</Th><Th>Employee</Th><Th>Expiry Date</Th><Th>State</Th></tr></thead><tbody>{rows.length ? rows.map((r) => <tr key={r.id}><Td>{r.title}</Td><Td>{r.employeeNumber || "—"}</Td><Td>{date(r.expiryDate)}</Td><Td><Badge>{r.expiryState?.replaceAll("_", " ")}</Badge></Td></tr>) : <tr><Td colSpan={4}>No expiry-controlled documents yet.</Td></tr>}</tbody></table></section>; }
function Requests({ rows, createRequest, changeStatus }) { return <section style={panel}><div style={rowStyle}><div><h2 style={h2}>Document Requests</h2><p style={muted}>Track missing documents and evidence through fulfilment or cancellation.</p></div><button style={primaryButton} onClick={createRequest}>+ New Request</button></div><table style={{ ...table, marginTop: 14 }}><thead><tr><Th>Request</Th><Th>Employee</Th><Th>Requested From</Th><Th>Due</Th><Th>Status</Th><Th>Action</Th></tr></thead><tbody>{rows.length ? rows.map((r) => <tr key={r.id}><Td>{r.title}</Td><Td>{r.employeeNumber || "—"}</Td><Td>{r.requestedFrom || "—"}</Td><Td>{date(r.dueDate)}</Td><Td><Badge>{r.status}</Badge></Td><Td><button style={secondaryButton} onClick={() => changeStatus(r)}>Update</button></Td></tr>) : <tr><Td colSpan={6}>No document requests yet.</Td></tr>}</tbody></table></section>; }
function Th({ children }) { return <th style={th}>{children}</th>; }
function Td({ children, colSpan }) { return <td colSpan={colSpan} style={td}>{children}</td>; }
function Badge({ children }) { return <span style={badge}>{children}</span>; }
function date(value) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(); }

const panel = { background: "linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))", border: "1px solid var(--chris-border-gold)", borderRadius: "var(--chris-radius-card)", padding: 18, boxShadow: "var(--chris-shadow-card)" };
const metrics = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 };
const tabs = { display: "flex", gap: 8, flexWrap: "wrap", margin: "18px 0" };
const tabButton = { border: "1px solid var(--chris-border-soft)", borderRadius: 9, background: "rgba(255,255,255,.03)", color: "var(--chris-text-secondary)", padding: "9px 11px", fontWeight: 800, cursor: "pointer" };
const activeTab = { borderColor: "var(--chris-gold)", color: "var(--chris-gold)", background: "rgba(212,175,55,.08)" };
const primaryButton = { border: 0, borderRadius: 9, padding: "10px 14px", background: "var(--chris-gold)", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...tabButton, color: "var(--chris-gold)", padding: "7px 10px" };
const input = { minWidth: 210, borderRadius: 9, border: "1px solid var(--chris-border-gold)", background: "rgba(255,255,255,.04)", color: "var(--chris-text-main)", padding: "10px 12px" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const th = { textAlign: "left", padding: "10px 8px", color: "var(--chris-gold)", borderBottom: "1px solid var(--chris-border-soft)", whiteSpace: "nowrap" };
const td = { padding: "10px 8px", color: "var(--chris-text-secondary)", borderBottom: "1px solid var(--chris-border-soft)", verticalAlign: "top" };
const badge = { display: "inline-block", border: "1px solid var(--chris-border-soft)", borderRadius: 999, padding: "3px 7px", fontSize: 10, fontWeight: 800, color: "var(--chris-gold)" };
const eyebrow = { color: "var(--chris-gold)", fontSize: "var(--chris-font-sm)", fontWeight: 900, letterSpacing: ".15em" };
const lead = { color: "var(--chris-text-secondary)", lineHeight: 1.6, maxWidth: 980 };
const h2 = { margin: "3px 0 5px", fontSize: 20 };
const muted = { margin: 0, color: "var(--chris-text-secondary)", lineHeight: 1.55, fontSize: 12 };
const rowStyle = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" };
const noticeStyle = { ...panel, marginBottom: 14, borderColor: "var(--chris-gold)", color: "var(--chris-text-secondary)" };
const errorStyle = { ...panel, marginBottom: 14, color: "#FCA5A5" };
const link = { color: "var(--chris-gold)", fontWeight: 800 };
const tiny = { fontSize: 9, marginTop: 4, color: "var(--chris-text-muted)" };
