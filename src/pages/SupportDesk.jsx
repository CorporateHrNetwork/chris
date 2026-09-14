import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const statusOptions = [
  "NEW", "TRIAGED", "AWAITING_CLIENT", "ASSIGNED", "IN_PROGRESS", "FIX_READY",
  "DEPLOYED", "CLIENT_VALIDATION", "RESOLVED", "CLOSED", "ESCALATED", "BLOCKED", "REOPENED",
];

const severityLabel = {
  P1_CRITICAL: "P1 Critical",
  P2_HIGH: "P2 High",
  P3_MEDIUM: "P3 Medium",
  P4_LOW: "P4 Low",
};

export default function SupportDesk() {
  const [summary, setSummary] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("OPEN");
  const [form, setForm] = useState({
    subject: "",
    description: "",
    contactName: "",
    contactPhone: "",
    businessImpact: "",
  });

  async function load() {
    setLoading(true);
    try {
      const [summaryResult, ticketResult] = await Promise.all([
        apiRequest("/api/support-desk/summary"),
        apiRequest("/api/support-desk/tickets?limit=500"),
      ]);
      setSummary(summaryResult.data || null);
      setTickets(ticketResult.data || []);
    } catch (error) {
      setMessage(error.message || "Unable to load CHRiS Support Desk.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visibleTickets = useMemo(() => {
    if (filter === "ALL") return tickets;
    if (filter === "P1P2") return tickets.filter((ticket) => ["P1_CRITICAL", "P2_HIGH"].includes(ticket.severity));
    if (filter === "ENGINEERING") return tickets.filter((ticket) => ["ESCALATED", "IN_PROGRESS", "FIX_READY"].includes(ticket.status));
    if (filter === "RESOLVED") return tickets.filter((ticket) => ["RESOLVED", "CLOSED"].includes(ticket.status));
    return tickets.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status));
  }, [tickets, filter]);

  async function createCase(event) {
    event.preventDefault();
    if (!form.description.trim()) return setMessage("Enter the client query, complaint or request.");
    try {
      const result = await apiRequest("/api/support-desk/tickets", { method: "POST", body: { ...form, channel: "CHRIS" } });
      setMessage(`Case ${result.data?.ticket?.ticketNumber || "created"} received and triaged.`);
      setForm({ subject: "", description: "", contactName: "", contactPhone: "", businessImpact: "" });
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to create support case.");
    }
  }

  async function updateStatus(ticketNumber, status) {
    try {
      await apiRequest(`/api/support-desk/tickets/${encodeURIComponent(ticketNumber)}`, {
        method: "PATCH",
        body: { patch: { status }, reason: "Support Desk console status update" },
      });
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to update support case.");
    }
  }

  async function escalate(ticketNumber) {
    try {
      const result = await apiRequest(`/api/support-desk/tickets/${encodeURIComponent(ticketNumber)}/escalate`, { method: "POST" });
      const ticket = result.data?.ticket;
      setMessage(ticket?.githubIssueNumber
        ? `Engineering escalation created as GitHub issue #${ticket.githubIssueNumber}.`
        : "Case marked for engineering escalation. GitHub runtime credentials still need to be configured before automatic issue creation can complete.");
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to escalate case.");
    }
  }

  return (
    <div>
      <section style={hero}>
        <div style={eyebrow}>CLIENT SUPPORT · ISSUE RESOLUTION · PRODUCT IMPROVEMENT</div>
        <h1 style={title}>CHRiS Support Desk</h1>
        <p style={muted}>AI-assisted intake, triage, SLA control and engineering escalation for CHRiS clients.</p>
        <div style={contactLine}>WhatsApp: +234 911 299 3759 · Email: support@crnetwork.com.ng</div>
      </section>

      {message ? <div style={notice}>{message}</div> : null}

      <section style={metricGrid}>
        <Metric label="Open Cases" value={summary?.open ?? "—"} />
        <Metric label="P1 Critical" value={summary?.p1 ?? "—"} />
        <Metric label="P2 High" value={summary?.p2 ?? "—"} />
        <Metric label="Engineering" value={summary?.engineering ?? "—"} />
        <Metric label="Awaiting Client" value={summary?.awaitingClient ?? "—"} />
        <Metric label="Resolved / Closed" value={summary?.resolved ?? "—"} />
      </section>

      <section style={twoColumn}>
        <form onSubmit={createCase} style={panel}>
          <div style={eyebrow}>MANUAL INTAKE / TEST CONSOLE</div>
          <h2 style={sectionTitle}>Create Support Case</h2>
          <input style={field} placeholder="Client/contact name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <input style={field} placeholder="WhatsApp / phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          <input style={field} placeholder="Subject (optional)" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <textarea style={{ ...field, minHeight: 110, resize: "vertical" }} placeholder="Client query, complaint, bug or improvement request" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <textarea style={{ ...field, minHeight: 72, resize: "vertical" }} placeholder="Business impact (optional)" value={form.businessImpact} onChange={(e) => setForm({ ...form, businessImpact: e.target.value })} />
          <button style={primaryButton} type="submit">Receive & Triage Case</button>
        </form>

        <div style={panel}>
          <div style={eyebrow}>AGENT OPERATING MODEL</div>
          <h2 style={sectionTitle}>Release 1 Agents</h2>
          {[
            ["Client Support Agent", "Acknowledges clients, applies privacy guardrails and gathers the minimum information required."],
            ["Triage & Incident Agent", "Classifies Query, Incident, Bug, Access, Data, Configuration, Improvement or Security cases and assigns P1–P4 severity."],
            ["Engineering Liaison Agent", "Converts validated cases into structured engineer-ready GitHub briefs."],
            ["Resolution & Follow-up Agent", "Produces consistent client updates as a case moves through resolution and validation."],
            ["Knowledge Agent", "Captures reusable resolutions after successful closure while excluding security-sensitive cases."],
          ].map(([name, text]) => <div key={name} style={agentCard}><strong>{name}</strong><span>{text}</span></div>)}
        </div>
      </section>

      <section style={panel}>
        <div style={tableHeader}>
          <div>
            <div style={eyebrow}>SUPPORT QUEUE</div>
            <h2 style={sectionTitle}>Cases</h2>
          </div>
          <div style={filters}>
            {["OPEN", "P1P2", "ENGINEERING", "RESOLVED", "ALL"].map((item) => (
              <button key={item} type="button" onClick={() => setFilter(item)} style={filter === item ? activeFilter : filterButton}>{item}</button>
            ))}
          </div>
        </div>

        {loading ? <p style={muted}>Loading Support Desk…</p> : visibleTickets.length === 0 ? <p style={muted}>No cases in this view.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead><tr><th>Case</th><th>Client / Issue</th><th>Classification</th><th>Status</th><th>Engineering</th></tr></thead>
              <tbody>
                {visibleTickets.map((ticket) => (
                  <tr key={ticket.ticketNumber}>
                    <td><strong>{ticket.ticketNumber}</strong><br/><small>{ticket.channel || "CHRIS"}</small></td>
                    <td><strong>{ticket.contactName || ticket.organizationName || "Client"}</strong><br/><span>{ticket.subject || ticket.description}</span><br/><small>{ticket.module || "general"}</small></td>
                    <td><span style={badge}>{severityLabel[ticket.severity] || ticket.severity}</span><br/><small>{ticket.category}</small></td>
                    <td>
                      <select style={select} value={ticket.status || "NEW"} onChange={(e) => updateStatus(ticket.ticketNumber, e.target.value)}>
                        {statusOptions.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </td>
                    <td>
                      {ticket.githubIssueUrl ? <a href={ticket.githubIssueUrl} target="_blank" rel="noreferrer" style={link}>GitHub #{ticket.githubIssueNumber}</a> : (
                        <button type="button" style={secondaryButton} onClick={() => escalate(ticket.ticketNumber)}>Escalate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }) {
  return <div style={metric}><span style={eyebrow}>{label}</span><strong style={metricValue}>{value}</strong></div>;
}

const hero = { padding: "24px 26px", border: "1px solid rgba(212,175,55,.22)", borderRadius: 16, background: "linear-gradient(135deg, rgba(0,125,70,.19), rgba(212,175,55,.06))", marginBottom: 18 };
const eyebrow = { color: "#D4AF37", fontSize: 10, letterSpacing: ".13em", fontWeight: 900 };
const title = { margin: "7px 0 7px", color: "#FFFFFF", fontSize: 31 };
const sectionTitle = { margin: "6px 0 14px", color: "#FFFFFF", fontSize: 20 };
const muted = { color: "#AFC5B8", lineHeight: 1.55 };
const contactLine = { marginTop: 12, color: "#DDEBE3", fontWeight: 700, fontSize: 13 };
const notice = { marginBottom: 16, padding: "11px 13px", borderRadius: 9, color: "#F8E8A9", background: "rgba(212,175,55,.10)", border: "1px solid rgba(212,175,55,.25)" };
const metricGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 };
const metric = { padding: 16, borderRadius: 12, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)" };
const metricValue = { display: "block", marginTop: 8, color: "#FFFFFF", fontSize: 26 };
const twoColumn = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 18 };
const panel = { padding: 18, borderRadius: 14, background: "rgba(4,13,8,.72)", border: "1px solid rgba(8,122,67,.28)", marginBottom: 16 };
const field = { width: "100%", boxSizing: "border-box", marginBottom: 10, padding: "11px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.13)", background: "#09140E", color: "#FFFFFF", fontFamily: "inherit" };
const primaryButton = { border: 0, borderRadius: 8, padding: "11px 15px", background: "#087A43", color: "#FFFFFF", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { border: "1px solid rgba(212,175,55,.42)", borderRadius: 7, padding: "8px 10px", background: "rgba(212,175,55,.08)", color: "#F4D66B", fontWeight: 800, cursor: "pointer" };
const agentCard = { display: "grid", gap: 4, padding: "11px 0", color: "#FFFFFF", borderBottom: "1px solid rgba(255,255,255,.06)" };
const tableHeader = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" };
const filters = { display: "flex", gap: 6, flexWrap: "wrap" };
const filterButton = { border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.035)", color: "#BFD5CA", borderRadius: 7, padding: "7px 9px", cursor: "pointer", fontSize: 10, fontWeight: 800 };
const activeFilter = { ...filterButton, border: "1px solid rgba(212,175,55,.38)", color: "#F4D66B", background: "rgba(212,175,55,.10)" };
const table = { width: "100%", borderCollapse: "collapse", color: "#E9F3ED", fontSize: 12 };
const select = { padding: "7px", borderRadius: 6, background: "#09140E", color: "#FFFFFF", border: "1px solid rgba(255,255,255,.13)" };
const badge = { display: "inline-block", padding: "4px 7px", borderRadius: 999, background: "rgba(212,175,55,.11)", color: "#F4D66B", fontWeight: 900, fontSize: 10 };
const link = { color: "#F4D66B", fontWeight: 800 };
