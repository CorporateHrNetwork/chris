import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const statusOptions = [
  "NEW", "TRIAGED", "AWAITING_CLIENT", "ASSIGNED", "IN_PROGRESS", "FIX_READY",
  "DEPLOYED", "CLIENT_VALIDATION", "RESOLVED", "CLOSED", "CANCELLED", "ESCALATED", "BLOCKED", "REOPENED",
];

const severityLabel = {
  P1_CRITICAL: "P1 Critical",
  P2_HIGH: "P2 High",
  P3_MEDIUM: "P3 Medium",
  P4_LOW: "P4 Low",
};

export default function SupportDesk() {
  const [access, setAccess] = useState(null);
  const [summary, setSummary] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("OPEN");

  async function load() {
    setLoading(true);
    try {
      const accessResult = await apiRequest("/api/support-desk/internal/access");
      setAccess(accessResult.data || null);
      const [summaryResult, ticketResult] = await Promise.all([
        apiRequest("/api/support-desk/internal/summary"),
        apiRequest("/api/support-desk/internal/tickets?limit=5000"),
      ]);
      setSummary(summaryResult.data || null);
      setTickets(ticketResult.data || []);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "You do not have access to the internal CHRiS Support Desk.");
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
    return tickets.filter((ticket) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.status));
  }, [tickets, filter]);

  async function updateStatus(ticket, status) {
    if (!access?.canManage || ticket.status === "CANCELLED") return;
    try {
      await apiRequest(`/api/support-desk/internal/tickets/${encodeURIComponent(ticket.ticketNumber)}`, {
        method: "PATCH",
        body: {
          organizationId: ticket.organizationId,
          patch: { status },
          reason: "Internal Support Desk status update",
        },
      });
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to update support case.");
    }
  }

  async function escalate(ticket) {
    if (!access?.canEscalate || ticket.status === "CANCELLED") return;
    try {
      const result = await apiRequest(`/api/support-desk/internal/tickets/${encodeURIComponent(ticket.ticketNumber)}/escalate`, {
        method: "POST",
        body: { organizationId: ticket.organizationId },
      });
      const updated = result.data?.ticket;
      setMessage(updated?.githubIssueNumber
        ? `Engineering escalation created as GitHub issue #${updated.githubIssueNumber}.`
        : "Case marked for engineering escalation. GitHub runtime credentials must be configured before automatic issue creation can complete.");
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to escalate case.");
    }
  }

  if (!loading && !access) {
    return (
      <div style={denied}>
        <h1 style={{ marginTop: 0 }}>Internal CHRiS Support Desk</h1>
        <p>{message || "Platform Support Desk access is required."}</p>
        <p style={muted}>This workspace is reserved for authorized Corporate Resources Network support and engineering personnel. Client users should use My Support Requests.</p>
      </div>
    );
  }

  return (
    <div>
      <section style={hero}>
        <div style={eyebrow}>CORPORATE RESOURCES NETWORK · INTERNAL SUPPORT OPERATIONS</div>
        <h1 style={title}>CHRiS Support Desk</h1>
        <p style={muted}>Cross-client AI-assisted intake, triage, SLA control, engineering escalation and resolution management.</p>
        <div style={contactLine}>WhatsApp: +234 911 299 3759 · Email: support@crnetwork.com.ng</div>
      </section>

      {message ? <div style={notice}>{message}</div> : null}

      <section style={metricGrid}>
        <Metric label="Clients" value={summary?.clients ?? "—"} />
        <Metric label="Open Cases" value={summary?.open ?? "—"} />
        <Metric label="P1 Critical" value={summary?.p1 ?? "—"} />
        <Metric label="P2 High" value={summary?.p2 ?? "—"} />
        <Metric label="Engineering" value={summary?.engineering ?? "—"} />
        <Metric label="Awaiting Client" value={summary?.awaitingClient ?? "—"} />
        <Metric label="Resolved / Closed" value={summary?.resolved ?? "—"} />
      </section>

      <section style={panel}>
        <div style={tableHeader}>
          <div>
            <div style={eyebrow}>ALL CLIENTS · SUPPORT QUEUE</div>
            <h2 style={sectionTitle}>Cases</h2>
          </div>
          <div style={filters}>
            {["OPEN", "P1P2", "ENGINEERING", "RESOLVED", "ALL"].map((item) => (
              <button key={item} type="button" onClick={() => setFilter(item)} style={filter === item ? activeFilter : filterButton}>{item}</button>
            ))}
          </div>
        </div>

        {loading ? <p style={muted}>Loading internal Support Desk…</p> : visibleTickets.length === 0 ? <p style={muted}>No cases in this view.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead><tr><th>Case</th><th>Client</th><th>Issue</th><th>Classification</th><th>Status</th><th>Engineering</th></tr></thead>
              <tbody>
                {visibleTickets.map((ticket) => (
                  <tr key={`${ticket.organizationId}:${ticket.ticketNumber}`}>
                    <td><strong>{ticket.ticketNumber}</strong><br/><small>{ticket.channel || "CHRIS"}</small></td>
                    <td><strong>{ticket.organizationName || "Client"}</strong><br/><small>{ticket.organizationSlug || ""}</small></td>
                    <td><strong>{ticket.subject || ticket.description}</strong><br/><span>{ticket.module || "General"}</span><br/><small>{ticket.contactName || ticket.contactEmail || ticket.contactPhone || ""}</small></td>
                    <td><span style={badge}>{severityLabel[ticket.severity] || ticket.severity}</span><br/><small>{ticket.category}</small></td>
                    <td>
                      {ticket.status === "CANCELLED" ? (
                        <span style={cancelledBadge} title={ticket.cancellationReason || "Cancelled by requester before Support attendance"}>CANCELLED</span>
                      ) : access?.canManage ? (
                        <select style={select} value={ticket.status || "NEW"} onChange={(event) => updateStatus(ticket, event.target.value)}>
                          {statusOptions.filter((status) => status !== "CANCELLED").map((status) => <option key={status}>{status}</option>)}
                        </select>
                      ) : <span>{String(ticket.status || "NEW").replaceAll("_", " ")}</span>}
                    </td>
                    <td>
                      {ticket.status === "CANCELLED" ? <span style={muted}>Requester cancelled before attendance</span> : ticket.githubIssueUrl ? <a href={ticket.githubIssueUrl} target="_blank" rel="noreferrer" style={link}>GitHub #{ticket.githubIssueNumber}</a> : access?.canEscalate ? (
                        <button type="button" style={secondaryButton} onClick={() => escalate(ticket)}>Escalate</button>
                      ) : <span style={muted}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={panel}>
        <div style={eyebrow}>AGENT OPERATING MODEL</div>
        <h2 style={sectionTitle}>Support Agents</h2>
        <div style={agentGrid}>
          {[
            ["Client Support Agent", "Acknowledges clients, applies privacy guardrails and gathers the minimum information required."],
            ["Triage & Incident Agent", "Classifies Query, Incident, Bug, Access, Data, Configuration, Improvement or Security cases and assigns P1–P4 severity."],
            ["Engineering Liaison Agent", "Converts validated cases into structured engineer-ready GitHub briefs."],
            ["Resolution & Follow-up Agent", "Produces consistent client updates as a case moves through resolution and validation."],
            ["Knowledge Agent", "Captures reusable resolutions after successful closure while excluding security-sensitive cases."],
          ].map(([name, text]) => <div key={name} style={agentCard}><strong>{name}</strong><span>{text}</span></div>)}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }) {
  return <div style={metric}><span style={eyebrow}>{label}</span><strong style={metricValue}>{value}</strong></div>;
}

const hero = { padding: "24px 26px", border: "1px solid rgba(212,175,55,.25)", borderRadius: 16, background: "linear-gradient(135deg, rgba(0,125,70,.19), rgba(212,175,55,.06))", marginBottom: 18 };
const eyebrow = { color: "#D4AF37", fontSize: 10, letterSpacing: ".13em", fontWeight: 900 };
const title = { margin: "7px 0 7px", color: "#FFFFFF", fontSize: 31 };
const sectionTitle = { margin: "6px 0 14px", color: "#FFFFFF", fontSize: 20 };
const muted = { color: "#AFC5B8", lineHeight: 1.55 };
const contactLine = { marginTop: 12, color: "#DDEBE3", fontWeight: 700, fontSize: 13 };
const notice = { marginBottom: 16, padding: "11px 13px", borderRadius: 9, color: "#F8E8A9", background: "rgba(212,175,55,.10)", border: "1px solid rgba(212,175,55,.25)" };
const denied = { padding: 22, borderRadius: 14, border: "1px solid rgba(212,175,55,.28)", background: "rgba(4,22,14,.88)", color: "#FFFFFF" };
const metricGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12, marginBottom: 18 };
const metric = { padding: 16, borderRadius: 12, background: "rgba(3,32,20,.88)", border: "1px solid rgba(212,175,55,.30)" };
const metricValue = { display: "block", marginTop: 8, color: "#FFFFFF", fontSize: 26 };
const panel = { padding: 18, borderRadius: 14, background: "rgba(4,22,14,.84)", border: "1px solid rgba(8,122,67,.32)", marginBottom: 16 };
const tableHeader = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" };
const filters = { display: "flex", gap: 6, flexWrap: "wrap" };
const filterButton = { border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.035)", color: "#BFD5CA", borderRadius: 7, padding: "7px 9px", cursor: "pointer", fontSize: 10, fontWeight: 800 };
const activeFilter = { ...filterButton, border: "1px solid rgba(212,175,55,.38)", color: "#F4D66B", background: "rgba(212,175,55,.10)" };
const table = { width: "100%", minWidth: 980, borderCollapse: "collapse", color: "#E9F3ED", fontSize: 12 };
const select = { padding: "7px", borderRadius: 6, background: "#09140E", color: "#FFFFFF", border: "1px solid rgba(255,255,255,.13)" };
const badge = { display: "inline-block", padding: "4px 7px", borderRadius: 999, background: "rgba(212,175,55,.11)", color: "#F4D66B", fontWeight: 900, fontSize: 10 };
const cancelledBadge = { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "rgba(127,29,29,.18)", border: "1px solid rgba(239,68,68,.45)", color: "#FCA5A5", fontWeight: 900, fontSize: 10 };
const secondaryButton = { border: "1px solid rgba(212,175,55,.42)", borderRadius: 7, padding: "8px 10px", background: "rgba(212,175,55,.08)", color: "#F4D66B", fontWeight: 800, cursor: "pointer" };
const link = { color: "#F4D66B", fontWeight: 800 };
const agentGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 };
const agentCard = { display: "grid", gap: 4, padding: 12, borderRadius: 10, color: "#FFFFFF", background: "rgba(3,32,20,.72)", border: "1px solid rgba(255,255,255,.06)" };