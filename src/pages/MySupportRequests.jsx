import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const severityLabel = {
  P1_CRITICAL: "P1 Critical",
  P2_HIGH: "P2 High",
  P3_MEDIUM: "P3 Medium",
  P4_LOW: "P4 Low",
};

export default function MySupportRequests() {
  const [summary, setSummary] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    description: "",
    businessImpact: "",
    expectedBehaviour: "",
    actualBehaviour: "",
    branch: "",
  });

  async function load() {
    setLoading(true);
    try {
      const [summaryResult, ticketResult] = await Promise.all([
        apiRequest("/api/support-desk/client/summary"),
        apiRequest("/api/support-desk/client/tickets?limit=500"),
      ]);
      setSummary(summaryResult.data || null);
      setTickets(ticketResult.data || []);
    } catch (error) {
      setMessage(error.message || "Unable to load your support requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const openTickets = useMemo(
    () => tickets.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)),
    [tickets]
  );

  async function submit(event) {
    event.preventDefault();
    if (!form.description.trim()) {
      setMessage("Describe the query, complaint, defect or improvement request.");
      return;
    }
    try {
      const result = await apiRequest("/api/support-desk/client/tickets", {
        method: "POST",
        body: form,
      });
      const number = result.data?.ticket?.ticketNumber;
      setMessage(number ? `Support request ${number} has been received and triaged.` : "Support request received.");
      setForm({ subject: "", description: "", businessImpact: "", expectedBehaviour: "", actualBehaviour: "", branch: "" });
      setShowForm(false);
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to submit your support request.");
    }
  }

  return (
    <div>
      <section style={hero}>
        <div style={eyebrow}>CLIENT SUPPORT</div>
        <h1 style={title}>My Support Requests</h1>
        <p style={muted}>Raise a CHRiS query, complaint, technical issue or improvement request and track its progress.</p>
        <div style={contactLine}>WhatsApp: +234 911 299 3759 · Email: support@crnetwork.com.ng</div>
      </section>

      {message ? <div style={notice}>{message}</div> : null}

      <section style={metricGrid}>
        <Metric label="Open" value={summary?.open ?? "—"} />
        <Metric label="Awaiting You" value={summary?.awaitingClient ?? "—"} />
        <Metric label="Resolved / Closed" value={summary?.resolved ?? "—"} />
        <Metric label="Total Requests" value={summary?.total ?? "—"} />
      </section>

      <section style={panel}>
        <div style={sectionHeader}>
          <div>
            <div style={eyebrow}>YOUR CASES</div>
            <h2 style={sectionTitle}>Support Requests</h2>
          </div>
          <button type="button" style={primaryButton} onClick={() => setShowForm((current) => !current)}>
            {showForm ? "Close Form" : "+ New Support Request"}
          </button>
        </div>

        {showForm ? (
          <form onSubmit={submit} style={formCard}>
            <input style={field} placeholder="Subject (optional)" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
            <input style={field} placeholder="Branch / location (optional)" value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} />
            <textarea style={{ ...field, minHeight: 110 }} placeholder="Describe your query, complaint, defect or improvement request *" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            <textarea style={{ ...field, minHeight: 70 }} placeholder="Business impact (optional)" value={form.businessImpact} onChange={(event) => setForm({ ...form, businessImpact: event.target.value })} />
            <div style={twoColumn}>
              <textarea style={{ ...field, minHeight: 70 }} placeholder="Expected behaviour (optional)" value={form.expectedBehaviour} onChange={(event) => setForm({ ...form, expectedBehaviour: event.target.value })} />
              <textarea style={{ ...field, minHeight: 70 }} placeholder="Actual behaviour (optional)" value={form.actualBehaviour} onChange={(event) => setForm({ ...form, actualBehaviour: event.target.value })} />
            </div>
            <div style={privacyNote}>Do not send passwords, OTPs, database credentials or unnecessary payroll/personal data through support messages.</div>
            <button type="submit" style={primaryButton}>Submit Request</button>
          </form>
        ) : null}

        {loading ? <p style={muted}>Loading your support requests…</p> : tickets.length === 0 ? (
          <p style={muted}>You have not submitted any support requests yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead><tr><th>Case</th><th>Issue</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.ticketNumber}>
                    <td><strong>{ticket.ticketNumber}</strong><br/><small>{ticket.channel}</small></td>
                    <td><strong>{ticket.subject || "Support request"}</strong><br/><span>{ticket.module || "General"}</span></td>
                    <td><span style={badge}>{severityLabel[ticket.severity] || ticket.severity}</span></td>
                    <td>{formatStatus(ticket.status)}</td>
                    <td>{formatDate(ticket.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {openTickets.length ? <p style={{ ...muted, marginTop: 14 }}>CHRiS Support Desk will contact you through your recorded support channel when more information or validation is required.</p> : null}
      </section>
    </div>
  );
}

function Metric({ label, value }) {
  return <div style={metric}><span style={eyebrow}>{label}</span><strong style={metricValue}>{value}</strong></div>;
}

function formatStatus(value) {
  return String(value || "NEW").replaceAll("_", " ");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

const hero = { padding: "24px 26px", border: "1px solid rgba(212,175,55,.25)", borderRadius: 16, background: "linear-gradient(135deg, rgba(0,125,70,.19), rgba(212,175,55,.06))", marginBottom: 18 };
const eyebrow = { color: "#D4AF37", fontSize: 10, letterSpacing: ".13em", fontWeight: 900, textTransform: "uppercase" };
const title = { margin: "7px 0", color: "#FFFFFF", fontSize: 30 };
const sectionTitle = { margin: "6px 0 0", color: "#FFFFFF", fontSize: 20 };
const muted = { color: "#AFC5B8", lineHeight: 1.55 };
const contactLine = { marginTop: 12, color: "#DDEBE3", fontWeight: 700, fontSize: 13 };
const notice = { marginBottom: 16, padding: "11px 13px", borderRadius: 9, color: "#F8E8A9", background: "rgba(212,175,55,.10)", border: "1px solid rgba(212,175,55,.25)" };
const metricGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 };
const metric = { padding: 16, borderRadius: 12, background: "rgba(3,32,20,.88)", border: "1px solid rgba(212,175,55,.30)" };
const metricValue = { display: "block", marginTop: 8, color: "#FFFFFF", fontSize: 26 };
const panel = { padding: 18, borderRadius: 14, background: "rgba(4,22,14,.84)", border: "1px solid rgba(8,122,67,.32)" };
const sectionHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 18 };
const formCard = { padding: 16, marginBottom: 18, borderRadius: 12, background: "rgba(2,16,10,.72)", border: "1px solid rgba(212,175,55,.20)" };
const twoColumn = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 };
const field = { width: "100%", boxSizing: "border-box", marginBottom: 10, padding: "11px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.13)", background: "#09140E", color: "#FFFFFF", fontFamily: "inherit", resize: "vertical" };
const privacyNote = { color: "#9FB1A7", fontSize: 11, lineHeight: 1.5, margin: "2px 0 12px" };
const primaryButton = { border: "1px solid rgba(212,175,55,.30)", borderRadius: 8, padding: "10px 14px", background: "#087A43", color: "#FFFFFF", fontWeight: 900, cursor: "pointer" };
const table = { width: "100%", minWidth: 760, borderCollapse: "collapse", color: "#E9F3ED", fontSize: 12 };
const badge = { display: "inline-block", padding: "4px 7px", borderRadius: 999, background: "rgba(212,175,55,.11)", color: "#F4D66B", fontWeight: 900, fontSize: 10 };
