import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const severityLabel = {
  P1_CRITICAL: "P1 Critical",
  P2_HIGH: "P2 High",
  P3_MEDIUM: "P3 Medium",
  P4_LOW: "P4 Low",
};

const requesterCancellableStatuses = new Set(["NEW", "TRIAGED"]);
const replyBlockedStatuses = new Set(["CANCELLED", "CLOSED", "RESOLVED"]);

export default function MySupportRequests() {
  const [summary, setSummary] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [cancelling, setCancelling] = useState("");
  const [selectedTicketNumber, setSelectedTicketNumber] = useState("");
  const [caseDetail, setCaseDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [caseAction, setCaseAction] = useState("");
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
    () => tickets.filter((ticket) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.status)),
    [tickets]
  );

  async function loadCase(ticketNumber, { silent = false } = {}) {
    if (!ticketNumber) return;
    if (!silent) setDetailLoading(true);
    try {
      const result = await apiRequest(`/api/support-desk/client/tickets/${encodeURIComponent(ticketNumber)}`);
      setSelectedTicketNumber(ticketNumber);
      setCaseDetail(result.data || null);
    } catch (error) {
      setMessage(error.message || "Unable to load this support request.");
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }

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
      if (number) await loadCase(number);
    } catch (error) {
      setMessage(error.message || "Unable to submit your support request.");
    }
  }

  async function cancelRequest(ticket) {
    if (!requesterCancellableStatuses.has(ticket.status)) return;
    const reason = window.prompt(
      `Why are you cancelling support request ${ticket.ticketNumber}? This reason will remain in the Support Desk audit trail.`
    );
    if (!reason?.trim()) return;
    if (!window.confirm(
      `Cancel support request ${ticket.ticketNumber}? This is available only while Support has not yet attended to the case.`
    )) return;

    try {
      setCancelling(ticket.ticketNumber);
      setMessage("");
      await apiRequest(`/api/support-desk/client/tickets/${encodeURIComponent(ticket.ticketNumber)}/cancel`, {
        method: "POST",
        body: { reason: reason.trim() },
      });
      setMessage(`Support request ${ticket.ticketNumber} has been cancelled. The action remains traceable in the Support Desk audit trail.`);
      await load();
      if (selectedTicketNumber === ticket.ticketNumber) await loadCase(ticket.ticketNumber, { silent: true });
    } catch (error) {
      setMessage(error.message || "Unable to cancel this support request.");
    } finally {
      setCancelling("");
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    const ticket = caseDetail?.ticket;
    if (!ticket || !replyBody.trim() || replyBlockedStatuses.has(ticket.status)) return;
    try {
      setCaseAction("reply");
      await apiRequest(`/api/support-desk/client/tickets/${encodeURIComponent(ticket.ticketNumber)}/messages`, {
        method: "POST",
        body: { body: replyBody.trim() },
      });
      setReplyBody("");
      setMessage(`Your message was added to support request ${ticket.ticketNumber}.`);
      await Promise.all([load(), loadCase(ticket.ticketNumber, { silent: true })]);
    } catch (error) {
      setMessage(error.message || "Unable to add your message to this support request.");
    } finally {
      setCaseAction("");
    }
  }

  async function confirmResolution() {
    const ticket = caseDetail?.ticket;
    if (!ticket || ticket.status !== "CLIENT_VALIDATION") return;
    if (!window.confirm(`Confirm that support request ${ticket.ticketNumber} has been resolved?`)) return;
    try {
      setCaseAction("validate");
      await apiRequest(`/api/support-desk/client/tickets/${encodeURIComponent(ticket.ticketNumber)}/validate`, {
        method: "POST",
        body: {},
      });
      setMessage(`Resolution confirmed for support request ${ticket.ticketNumber}.`);
      await Promise.all([load(), loadCase(ticket.ticketNumber, { silent: true })]);
    } catch (error) {
      setMessage(error.message || "Unable to confirm this resolution.");
    } finally {
      setCaseAction("");
    }
  }

  async function reopenCase() {
    const ticket = caseDetail?.ticket;
    if (!ticket || !["RESOLVED", "CLOSED"].includes(ticket.status)) return;
    const reason = window.prompt(
      `Why should support request ${ticket.ticketNumber} be reopened? The reason will remain in the case history.`
    );
    if (!reason?.trim()) return;
    try {
      setCaseAction("reopen");
      await apiRequest(`/api/support-desk/client/tickets/${encodeURIComponent(ticket.ticketNumber)}/reopen`, {
        method: "POST",
        body: { reason: reason.trim() },
      });
      setMessage(`Support request ${ticket.ticketNumber} has been reopened.`);
      await Promise.all([load(), loadCase(ticket.ticketNumber, { silent: true })]);
    } catch (error) {
      setMessage(error.message || "Unable to reopen this support request.");
    } finally {
      setCaseAction("");
    }
  }

  const selectedTicket = caseDetail?.ticket || null;
  const selectedMessages = Array.isArray(caseDetail?.messages) ? caseDetail.messages : [];
  const canReply = selectedTicket && !replyBlockedStatuses.has(selectedTicket.status);

  return (
    <div>
      <section style={hero}>
        <div style={eyebrow}>CLIENT SUPPORT</div>
        <h1 style={title}>My Support Requests</h1>
        <p style={muted}>Raise a CHRiS query, complaint, technical issue or improvement request, communicate with Support and track it through resolution.</p>
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
              <thead><tr><th>Case</th><th>Issue</th><th>Priority</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead>
              <tbody>
                {tickets.map((ticket) => {
                  const canCancel = requesterCancellableStatuses.has(ticket.status);
                  return (
                    <tr key={ticket.ticketNumber} style={selectedTicketNumber === ticket.ticketNumber ? selectedRow : undefined}>
                      <td><strong>{ticket.ticketNumber}</strong><br/><small>{ticket.channel}</small></td>
                      <td><strong>{ticket.subject || "Support request"}</strong><br/><span>{ticket.module || "General"}</span></td>
                      <td><span style={badge}>{severityLabel[ticket.severity] || ticket.severity}</span></td>
                      <td>{formatStatus(ticket.status)}</td>
                      <td>{formatDateTime(ticket.updatedAt)}</td>
                      <td>
                        <div style={rowActions}>
                          <button type="button" style={secondaryButton} onClick={() => loadCase(ticket.ticketNumber)}>
                            {selectedTicketNumber === ticket.ticketNumber && detailLoading ? "Opening…" : "View Case"}
                          </button>
                          {canCancel ? (
                            <button
                              type="button"
                              style={cancelButton}
                              disabled={Boolean(cancelling)}
                              onClick={() => cancelRequest(ticket)}
                              title="Available only before Support attends to this request"
                            >
                              {cancelling === ticket.ticketNumber ? "Cancelling…" : "Cancel"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {openTickets.length ? <p style={{ ...muted, marginTop: 14 }}>CHRiS Support Desk will contact you through your recorded support channel when more information or validation is required. A request can be cancelled only before Support has attended to it.</p> : null}
      </section>

      {selectedTicketNumber ? (
        <section style={{ ...panel, marginTop: 16 }}>
          {detailLoading && !selectedTicket ? <p style={muted}>Loading case workspace…</p> : selectedTicket ? (
            <>
              <div style={caseHeader}>
                <div>
                  <div style={eyebrow}>CASE WORKSPACE</div>
                  <h2 style={sectionTitle}>{selectedTicket.subject || "Support request"}</h2>
                  <div style={caseNumber}>{selectedTicket.ticketNumber}</div>
                </div>
                <div style={caseHeaderActions}>
                  <span style={statusBadge}>{formatStatus(selectedTicket.status)}</span>
                  <button type="button" style={closeCaseButton} onClick={() => { setSelectedTicketNumber(""); setCaseDetail(null); setReplyBody(""); }}>Close View</button>
                </div>
              </div>

              <div style={caseMetaGrid}>
                <CaseMeta label="Priority" value={severityLabel[selectedTicket.severity] || selectedTicket.severity} />
                <CaseMeta label="Module" value={selectedTicket.module || "General"} />
                <CaseMeta label="Category" value={formatStatus(selectedTicket.category)} />
                <CaseMeta label="Branch" value={selectedTicket.branch || "Not specified"} />
                <CaseMeta label="Created" value={formatDateTime(selectedTicket.createdAt)} />
                <CaseMeta label="Last Updated" value={formatDateTime(selectedTicket.updatedAt)} />
              </div>

              <div style={caseDescription}>
                <strong>Reported issue</strong>
                <p>{selectedTicket.description || "No description supplied."}</p>
                {selectedTicket.businessImpact ? <><strong>Business impact</strong><p>{selectedTicket.businessImpact}</p></> : null}
                {(selectedTicket.expectedBehaviour || selectedTicket.actualBehaviour) ? (
                  <div style={twoColumn}>
                    <div><strong>Expected behaviour</strong><p>{selectedTicket.expectedBehaviour || "—"}</p></div>
                    <div><strong>Actual behaviour</strong><p>{selectedTicket.actualBehaviour || "—"}</p></div>
                  </div>
                ) : null}
                {selectedTicket.status === "CANCELLED" ? (
                  <div style={cancelledNote}>
                    <strong>Cancelled by requester</strong>
                    <div>{selectedTicket.cancellationReason || "No cancellation reason recorded."}</div>
                    <small>{formatDateTime(selectedTicket.cancelledAt)}</small>
                  </div>
                ) : null}
                {selectedTicket.resolutionSummary ? (
                  <div style={resolutionNote}><strong>Resolution</strong><div>{selectedTicket.resolutionSummary}</div></div>
                ) : null}
              </div>

              <div style={conversationHeader}>
                <div>
                  <div style={eyebrow}>CASE CONVERSATION</div>
                  <h3 style={conversationTitle}>Messages & Updates</h3>
                </div>
                <span style={messageCount}>{selectedMessages.length} message{selectedMessages.length === 1 ? "" : "s"}</span>
              </div>

              <div style={timeline}>
                {selectedMessages.length === 0 ? <p style={muted}>No case messages have been recorded yet.</p> : selectedMessages.map((item, index) => {
                  const outbound = item.direction === "OUTBOUND";
                  return (
                    <div key={item.id || `${item.createdAt}-${index}`} style={{ ...messageCard, ...(outbound ? supportMessage : clientMessage) }}>
                      <div style={messageTopLine}>
                        <strong>{outbound ? (item.sender || "CHRiS Support Desk") : (item.sender || "You")}</strong>
                        <span>{formatDateTime(item.createdAt)}</span>
                      </div>
                      <div style={messageBody}>{item.body}</div>
                      <small style={messageChannel}>{outbound ? "Support response" : "Client message"}{item.channel ? ` · ${item.channel}` : ""}</small>
                    </div>
                  );
                })}
              </div>

              {selectedTicket.status === "CLIENT_VALIDATION" ? (
                <div style={validationPanel}>
                  <div>
                    <strong>Support is awaiting your confirmation.</strong>
                    <div style={muted}>Test the affected workflow. If the issue is resolved, confirm it here; otherwise send a message describing what still needs attention.</div>
                  </div>
                  <button type="button" style={primaryButton} disabled={Boolean(caseAction)} onClick={confirmResolution}>
                    {caseAction === "validate" ? "Confirming…" : "Confirm Resolution"}
                  </button>
                </div>
              ) : null}

              {["RESOLVED", "CLOSED"].includes(selectedTicket.status) ? (
                <div style={validationPanel}>
                  <div>
                    <strong>This case is {selectedTicket.status.toLowerCase()}.</strong>
                    <div style={muted}>If the same issue persists or the resolution did not hold, reopen the existing case so the history remains connected.</div>
                  </div>
                  <button type="button" style={secondaryButton} disabled={Boolean(caseAction)} onClick={reopenCase}>
                    {caseAction === "reopen" ? "Reopening…" : "Reopen Case"}
                  </button>
                </div>
              ) : null}

              {canReply ? (
                <form onSubmit={sendReply} style={replyForm}>
                  <label style={replyLabel}>Add a message to this case</label>
                  <textarea
                    style={{ ...field, minHeight: 90, marginBottom: 8 }}
                    placeholder="Add the information Support needs. Do not include passwords, OTPs or other secrets."
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                  />
                  <button type="submit" style={primaryButton} disabled={!replyBody.trim() || Boolean(caseAction)}>
                    {caseAction === "reply" ? "Sending…" : "Send Message"}
                  </button>
                </form>
              ) : selectedTicket.status === "CANCELLED" ? (
                <p style={muted}>This request was cancelled before Support attended to it. Submit a new request if assistance is still required.</p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }) {
  return <div style={metric}><span style={eyebrow}>{label}</span><strong style={metricValue}>{value}</strong></div>;
}

function CaseMeta({ label, value }) {
  return <div style={caseMeta}><span>{label}</span><strong>{value || "—"}</strong></div>;
}

function formatStatus(value) {
  return String(value || "NEW").replaceAll("_", " ");
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
const secondaryButton = { border: "1px solid rgba(212,175,55,.38)", borderRadius: 7, padding: "7px 10px", background: "rgba(212,175,55,.08)", color: "#F4D66B", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
const cancelButton = { border: "1px solid rgba(239,68,68,.52)", borderRadius: 7, padding: "7px 10px", background: "rgba(127,29,29,.18)", color: "#FCA5A5", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
const table = { width: "100%", minWidth: 900, borderCollapse: "collapse", color: "#E9F3ED", fontSize: 12 };
const badge = { display: "inline-block", padding: "4px 7px", borderRadius: 999, background: "rgba(212,175,55,.11)", color: "#F4D66B", fontWeight: 900, fontSize: 10 };
const selectedRow = { background: "rgba(8,122,67,.12)" };
const rowActions = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
const caseHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,.08)" };
const caseNumber = { marginTop: 6, color: "#AFC5B8", fontSize: 12, fontWeight: 800 };
const caseHeaderActions = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const statusBadge = { display: "inline-block", padding: "7px 10px", borderRadius: 999, color: "#F4D66B", background: "rgba(212,175,55,.10)", border: "1px solid rgba(212,175,55,.28)", fontSize: 10, fontWeight: 900 };
const closeCaseButton = { border: "1px solid rgba(255,255,255,.12)", borderRadius: 7, padding: "7px 10px", background: "transparent", color: "#C6D8CE", fontWeight: 800, cursor: "pointer" };
const caseMetaGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 9, margin: "14px 0" };
const caseMeta = { display: "grid", gap: 4, padding: 10, borderRadius: 9, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)", color: "#FFFFFF" };
caseMeta.span = undefined;
const caseDescription = { padding: 14, borderRadius: 10, background: "rgba(2,16,10,.52)", border: "1px solid rgba(255,255,255,.06)", color: "#DDEBE3", lineHeight: 1.55 };
const cancelledNote = { marginTop: 12, display: "grid", gap: 4, padding: 11, borderRadius: 8, background: "rgba(127,29,29,.15)", border: "1px solid rgba(239,68,68,.28)", color: "#FECACA" };
const resolutionNote = { marginTop: 12, display: "grid", gap: 4, padding: 11, borderRadius: 8, background: "rgba(8,122,67,.12)", border: "1px solid rgba(8,122,67,.35)", color: "#D9FBE9" };
const conversationHeader = { display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, margin: "18px 0 10px" };
const conversationTitle = { margin: "5px 0 0", color: "#FFFFFF", fontSize: 17 };
const messageCount = { color: "#91A89B", fontSize: 11 };
const timeline = { display: "grid", gap: 9 };
const messageCard = { padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)" };
const clientMessage = { background: "rgba(8,122,67,.10)", marginRight: "8%" };
const supportMessage = { background: "rgba(212,175,55,.07)", marginLeft: "8%", borderColor: "rgba(212,175,55,.18)" };
const messageTopLine = { display: "flex", justifyContent: "space-between", gap: 12, color: "#EAF5EE", fontSize: 11, flexWrap: "wrap" };
const messageBody = { marginTop: 7, color: "#D7E5DD", lineHeight: 1.55, whiteSpace: "pre-wrap" };
const messageChannel = { display: "block", marginTop: 7, color: "#81988B" };
const validationPanel = { marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", padding: 13, borderRadius: 10, background: "rgba(212,175,55,.07)", border: "1px solid rgba(212,175,55,.22)", color: "#FFFFFF" };
const replyForm = { marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.07)" };
const replyLabel = { display: "block", marginBottom: 7, color: "#FFFFFF", fontSize: 12, fontWeight: 900 };