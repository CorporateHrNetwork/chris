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
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseDetail, setCaseDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyVisibility, setReplyVisibility] = useState("CLIENT");
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [caseAction, setCaseAction] = useState("");

  async function load({ preserveMessage = false } = {}) {
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
      if (!preserveMessage) setMessage("");
    } catch (error) {
      setMessage(error.message || "You do not have access to the internal CHRiS Support Desk.");
      setAccess(null);
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
    if (filter === "CANCELLED") return tickets.filter((ticket) => ticket.status === "CANCELLED");
    return tickets.filter((ticket) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.status));
  }, [tickets, filter]);

  async function loadCase(ticket, { silent = false } = {}) {
    if (!ticket?.ticketNumber || !ticket?.organizationId) return;
    if (!silent) setDetailLoading(true);
    try {
      const query = new URLSearchParams({ organizationId: ticket.organizationId }).toString();
      const result = await apiRequest(`/api/support-desk/internal/tickets/${encodeURIComponent(ticket.ticketNumber)}?${query}`);
      setSelectedCase({ organizationId: ticket.organizationId, ticketNumber: ticket.ticketNumber });
      setCaseDetail(result.data || null);
      setResolutionDraft(result.data?.ticket?.resolutionSummary || "");
    } catch (error) {
      setMessage(error.message || "Unable to load this Support Desk case.");
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }

  async function refreshSelectedCase() {
    if (!selectedCase) return;
    await loadCase(selectedCase, { silent: true });
  }

  async function updateStatus(ticket, status) {
    if (!access?.canManage || ticket.status === "CANCELLED") return;
    try {
      setCaseAction("status");
      await apiRequest(`/api/support-desk/internal/tickets/${encodeURIComponent(ticket.ticketNumber)}`, {
        method: "PATCH",
        body: {
          organizationId: ticket.organizationId,
          patch: { status },
          reason: `Internal Support Desk status update: ${ticket.status || "NEW"} → ${status}`,
        },
      });
      setMessage(`Case ${ticket.ticketNumber} updated to ${formatStatus(status)}.`);
      await load({ preserveMessage: true });
      if (selectedCase?.ticketNumber === ticket.ticketNumber && selectedCase?.organizationId === ticket.organizationId) {
        await refreshSelectedCase();
      }
    } catch (error) {
      setMessage(error.message || "Unable to update support case.");
    } finally {
      setCaseAction("");
    }
  }

  async function saveResolution() {
    const ticket = caseDetail?.ticket;
    if (!access?.canManage || !ticket || ticket.status === "CANCELLED") return;
    if (!resolutionDraft.trim()) {
      setMessage("Enter a resolution summary before saving the resolution record.");
      return;
    }
    try {
      setCaseAction("resolution");
      await apiRequest(`/api/support-desk/internal/tickets/${encodeURIComponent(ticket.ticketNumber)}`, {
        method: "PATCH",
        body: {
          organizationId: ticket.organizationId,
          patch: { resolutionSummary: resolutionDraft.trim() },
          reason: "Support Desk resolution summary updated",
        },
      });
      setMessage(`Resolution summary saved for ${ticket.ticketNumber}.`);
      await Promise.all([load({ preserveMessage: true }), refreshSelectedCase()]);
    } catch (error) {
      setMessage(error.message || "Unable to save the resolution summary.");
    } finally {
      setCaseAction("");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const ticket = caseDetail?.ticket;
    if (!access?.canManage || !ticket || ticket.status === "CANCELLED" || !replyBody.trim()) return;
    try {
      setCaseAction("message");
      await apiRequest(`/api/support-desk/internal/tickets/${encodeURIComponent(ticket.ticketNumber)}/messages`, {
        method: "POST",
        body: {
          organizationId: ticket.organizationId,
          direction: "OUTBOUND",
          channel: "CHRIS_INTERNAL",
          sender: "CHRiS Support Desk",
          body: replyBody.trim(),
          visibility: replyVisibility,
        },
      });
      setReplyBody("");
      setMessage(replyVisibility === "INTERNAL"
        ? `Internal note recorded on ${ticket.ticketNumber}.`
        : `Client-visible Support response recorded on ${ticket.ticketNumber}.`);
      await Promise.all([load({ preserveMessage: true }), refreshSelectedCase()]);
    } catch (error) {
      setMessage(error.message || "Unable to record the Support Desk message.");
    } finally {
      setCaseAction("");
    }
  }

  async function escalate(ticket) {
    if (!access?.canEscalate || ticket.status === "CANCELLED") return;
    try {
      setCaseAction("escalate");
      const result = await apiRequest(`/api/support-desk/internal/tickets/${encodeURIComponent(ticket.ticketNumber)}/escalate`, {
        method: "POST",
        body: { organizationId: ticket.organizationId },
      });
      const updated = result.data?.ticket;
      setMessage(updated?.githubIssueNumber
        ? `Engineering escalation created as GitHub issue #${updated.githubIssueNumber}.`
        : "Case marked for engineering escalation. GitHub runtime credentials must be configured before automatic issue creation can complete.");
      await load({ preserveMessage: true });
      if (selectedCase?.ticketNumber === ticket.ticketNumber && selectedCase?.organizationId === ticket.organizationId) {
        await refreshSelectedCase();
      }
    } catch (error) {
      setMessage(error.message || "Unable to escalate case.");
    } finally {
      setCaseAction("");
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

  const activeTicket = caseDetail?.ticket || null;
  const activeMessages = Array.isArray(caseDetail?.messages) ? caseDetail.messages : [];

  return (
    <div>
      <section style={hero}>
        <div style={eyebrow}>CORPORATE RESOURCES NETWORK · INTERNAL SUPPORT OPERATIONS</div>
        <h1 style={title}>CHRiS Support Desk</h1>
        <p style={muted}>Cross-client AI-assisted intake, triage, case communication, engineering escalation and resolution management.</p>
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
            {["OPEN", "P1P2", "ENGINEERING", "RESOLVED", "CANCELLED", "ALL"].map((item) => (
              <button key={item} type="button" onClick={() => setFilter(item)} style={filter === item ? activeFilter : filterButton}>{item}</button>
            ))}
          </div>
        </div>

        {loading ? <p style={muted}>Loading internal Support Desk…</p> : visibleTickets.length === 0 ? <p style={muted}>No cases in this view.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead><tr><th>Case</th><th>Client</th><th>Issue</th><th>Classification</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {visibleTickets.map((ticket) => {
                  const selected = selectedCase?.ticketNumber === ticket.ticketNumber && selectedCase?.organizationId === ticket.organizationId;
                  return (
                    <tr key={`${ticket.organizationId}:${ticket.ticketNumber}`} style={selected ? selectedRow : undefined}>
                      <td><strong>{ticket.ticketNumber}</strong><br/><small>{ticket.channel || "CHRIS"}</small></td>
                      <td><strong>{ticket.organizationName || "Client"}</strong><br/><small>{ticket.organizationSlug || ""}</small></td>
                      <td><strong>{ticket.subject || ticket.description}</strong><br/><span>{ticket.module || "General"}</span><br/><small>{ticket.contactName || ticket.contactEmail || ticket.contactPhone || ""}</small></td>
                      <td><span style={badge}>{severityLabel[ticket.severity] || ticket.severity}</span><br/><small>{ticket.category}</small></td>
                      <td>
                        {ticket.status === "CANCELLED" ? (
                          <span style={cancelledBadge} title={ticket.cancellationReason || "Cancelled by requester before Support attendance"}>CANCELLED</span>
                        ) : access?.canManage ? (
                          <select style={select} value={ticket.status || "NEW"} disabled={Boolean(caseAction)} onChange={(event) => updateStatus(ticket, event.target.value)}>
                            {statusOptions.filter((status) => status !== "CANCELLED").map((status) => <option key={status}>{status}</option>)}
                          </select>
                        ) : <span>{formatStatus(ticket.status)}</span>}
                      </td>
                      <td>
                        <button type="button" style={secondaryButton} onClick={() => loadCase(ticket)}>
                          {selected && detailLoading ? "Opening…" : "Open Case"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedCase ? (
        <section style={panel}>
          {detailLoading && !activeTicket ? <p style={muted}>Loading case workspace…</p> : activeTicket ? (
            <>
              <div style={caseHeader}>
                <div>
                  <div style={eyebrow}>SUPPORT CASE WORKSPACE</div>
                  <h2 style={{ ...sectionTitle, marginBottom: 4 }}>{activeTicket.subject || activeTicket.description || "Support case"}</h2>
                  <div style={caseNumber}>{activeTicket.ticketNumber} · {activeTicket.organizationName || activeTicket.organizationSlug}</div>
                </div>
                <div style={caseHeaderActions}>
                  {activeTicket.status === "CANCELLED" ? <span style={cancelledBadge}>CANCELLED</span> : <span style={statusBadge}>{formatStatus(activeTicket.status)}</span>}
                  <button type="button" style={closeButton} onClick={() => { setSelectedCase(null); setCaseDetail(null); setReplyBody(""); setResolutionDraft(""); }}>Close View</button>
                </div>
              </div>

              <div style={caseMetaGrid}>
                <CaseMeta label="Client" value={activeTicket.organizationName || activeTicket.organizationSlug} />
                <CaseMeta label="Priority" value={severityLabel[activeTicket.severity] || activeTicket.severity} />
                <CaseMeta label="Category" value={formatStatus(activeTicket.category)} />
                <CaseMeta label="Module" value={activeTicket.module || "General"} />
                <CaseMeta label="Branch" value={activeTicket.branch || "Not specified"} />
                <CaseMeta label="Updated" value={formatDateTime(activeTicket.updatedAt)} />
              </div>

              <div style={caseBodyCard}>
                <strong>Reported issue</strong>
                <p>{activeTicket.description || "No description supplied."}</p>
                {activeTicket.businessImpact ? <><strong>Business impact</strong><p>{activeTicket.businessImpact}</p></> : null}
                {activeTicket.missingInformation?.length ? <div style={warningNote}><strong>Information still needed:</strong> {activeTicket.missingInformation.join(", ")}</div> : null}
                {activeTicket.status === "CANCELLED" ? (
                  <div style={cancelledNote}><strong>Requester cancellation</strong><div>{activeTicket.cancellationReason || "No reason recorded."}</div><small>{formatDateTime(activeTicket.cancelledAt)}</small></div>
                ) : null}
              </div>

              {activeTicket.status !== "CANCELLED" && access?.canManage ? (
                <div style={operatorGrid}>
                  <div style={operatorCard}>
                    <div style={eyebrow}>CASE STATUS</div>
                    <select style={{ ...select, width: "100%", marginTop: 8 }} value={activeTicket.status || "NEW"} disabled={Boolean(caseAction)} onChange={(event) => updateStatus(activeTicket, event.target.value)}>
                      {statusOptions.filter((status) => status !== "CANCELLED").map((status) => <option key={status}>{status}</option>)}
                    </select>
                    <small style={muted}>Move the case through triage, assignment, work, deployment and client validation.</small>
                  </div>

                  <div style={operatorCard}>
                    <div style={eyebrow}>ENGINEERING</div>
                    {activeTicket.githubIssueUrl ? (
                      <a href={activeTicket.githubIssueUrl} target="_blank" rel="noreferrer" style={{ ...link, marginTop: 9 }}>GitHub #{activeTicket.githubIssueNumber}</a>
                    ) : access?.canEscalate ? (
                      <button type="button" style={{ ...secondaryButton, marginTop: 8 }} disabled={Boolean(caseAction)} onClick={() => escalate(activeTicket)}>
                        {caseAction === "escalate" ? "Escalating…" : "Escalate to Engineering"}
                      </button>
                    ) : <span style={{ ...muted, marginTop: 8 }}>Engineering escalation permission required.</span>}
                  </div>
                </div>
              ) : null}

              {activeTicket.status !== "CANCELLED" && access?.canManage ? (
                <div style={resolutionCard}>
                  <div style={eyebrow}>RESOLUTION RECORD</div>
                  <textarea
                    style={{ ...field, minHeight: 82, marginTop: 8 }}
                    placeholder="Summarize the fix, configuration change, answer or action taken."
                    value={resolutionDraft}
                    onChange={(event) => setResolutionDraft(event.target.value)}
                  />
                  <button type="button" style={secondaryButton} disabled={!resolutionDraft.trim() || Boolean(caseAction)} onClick={saveResolution}>
                    {caseAction === "resolution" ? "Saving…" : "Save Resolution Summary"}
                  </button>
                </div>
              ) : null}

              <div style={conversationHeader}>
                <div><div style={eyebrow}>CASE CONVERSATION</div><h3 style={conversationTitle}>Client & Internal History</h3></div>
                <span style={messageCount}>{activeMessages.length} message{activeMessages.length === 1 ? "" : "s"}</span>
              </div>

              <div style={timeline}>
                {activeMessages.length === 0 ? <p style={muted}>No messages recorded.</p> : activeMessages.map((item, index) => {
                  const internal = item.visibility === "INTERNAL";
                  const outbound = item.direction === "OUTBOUND";
                  return (
                    <div key={item.id || `${item.createdAt}-${index}`} style={{ ...messageCard, ...(internal ? internalMessage : outbound ? supportMessage : clientMessage) }}>
                      <div style={messageTopLine}>
                        <strong>{internal ? "Internal note" : outbound ? (item.sender || "CHRiS Support Desk") : (item.sender || "Client")}</strong>
                        <span>{formatDateTime(item.createdAt)}</span>
                      </div>
                      <div style={messageBody}>{item.body}</div>
                      <small style={messageChannel}>{internal ? "Visible only to Corporate Resources Network Support" : outbound ? "Client-visible Support response" : "Client message"}</small>
                    </div>
                  );
                })}
              </div>

              {activeTicket.status !== "CANCELLED" && access?.canManage ? (
                <form onSubmit={sendMessage} style={replyForm}>
                  <div style={replyHeader}>
                    <label style={replyLabel}>Add Support response / note</label>
                    <select style={select} value={replyVisibility} onChange={(event) => setReplyVisibility(event.target.value)}>
                      <option value="CLIENT">Client-visible response</option>
                      <option value="INTERNAL">Internal note only</option>
                    </select>
                  </div>
                  <textarea
                    style={{ ...field, minHeight: 90 }}
                    placeholder={replyVisibility === "INTERNAL" ? "Record an internal investigation note…" : "Write the response the client should see…"}
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                  />
                  <button type="submit" style={primaryButton} disabled={!replyBody.trim() || Boolean(caseAction)}>
                    {caseAction === "message" ? "Recording…" : replyVisibility === "INTERNAL" ? "Save Internal Note" : "Send Client Response"}
                  </button>
                </form>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

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
const table = { width: "100%", minWidth: 1020, borderCollapse: "collapse", color: "#E9F3ED", fontSize: 12 };
const select = { padding: "7px", borderRadius: 6, background: "#09140E", color: "#FFFFFF", border: "1px solid rgba(255,255,255,.13)" };
const badge = { display: "inline-block", padding: "4px 7px", borderRadius: 999, background: "rgba(212,175,55,.11)", color: "#F4D66B", fontWeight: 900, fontSize: 10 };
const cancelledBadge = { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "rgba(127,29,29,.18)", border: "1px solid rgba(239,68,68,.45)", color: "#FCA5A5", fontWeight: 900, fontSize: 10 };
const primaryButton = { border: "1px solid rgba(212,175,55,.30)", borderRadius: 8, padding: "10px 14px", background: "#087A43", color: "#FFFFFF", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { border: "1px solid rgba(212,175,55,.42)", borderRadius: 7, padding: "8px 10px", background: "rgba(212,175,55,.08)", color: "#F4D66B", fontWeight: 800, cursor: "pointer" };
const link = { color: "#F4D66B", fontWeight: 800 };
const selectedRow = { background: "rgba(8,122,67,.12)" };
const caseHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,.08)" };
const caseHeaderActions = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const caseNumber = { color: "#AFC5B8", fontSize: 12, fontWeight: 800 };
const statusBadge = { display: "inline-block", padding: "6px 9px", borderRadius: 999, background: "rgba(212,175,55,.10)", border: "1px solid rgba(212,175,55,.28)", color: "#F4D66B", fontWeight: 900, fontSize: 10 };
const closeButton = { border: "1px solid rgba(255,255,255,.12)", borderRadius: 7, padding: "7px 10px", background: "transparent", color: "#C6D8CE", fontWeight: 800, cursor: "pointer" };
const caseMetaGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 9, margin: "14px 0" };
const caseMeta = { display: "grid", gap: 4, padding: 10, borderRadius: 9, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)", color: "#FFFFFF" };
const caseBodyCard = { padding: 14, borderRadius: 10, background: "rgba(2,16,10,.52)", border: "1px solid rgba(255,255,255,.06)", color: "#DDEBE3", lineHeight: 1.55 };
const warningNote = { marginTop: 10, padding: 9, borderRadius: 7, background: "rgba(212,175,55,.08)", border: "1px solid rgba(212,175,55,.20)", color: "#F8E8A9" };
const cancelledNote = { marginTop: 10, display: "grid", gap: 4, padding: 10, borderRadius: 8, background: "rgba(127,29,29,.15)", border: "1px solid rgba(239,68,68,.28)", color: "#FECACA" };
const operatorGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginTop: 12 };
const operatorCard = { display: "grid", alignContent: "start", padding: 12, borderRadius: 10, background: "rgba(3,32,20,.72)", border: "1px solid rgba(255,255,255,.06)", color: "#FFFFFF" };
const resolutionCard = { marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(3,32,20,.72)", border: "1px solid rgba(255,255,255,.06)" };
const field = { width: "100%", boxSizing: "border-box", marginBottom: 10, padding: "11px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.13)", background: "#09140E", color: "#FFFFFF", fontFamily: "inherit", resize: "vertical" };
const conversationHeader = { display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, margin: "18px 0 10px" };
const conversationTitle = { margin: "5px 0 0", color: "#FFFFFF", fontSize: 17 };
const messageCount = { color: "#91A89B", fontSize: 11 };
const timeline = { display: "grid", gap: 9 };
const messageCard = { padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.07)" };
const clientMessage = { background: "rgba(8,122,67,.10)", marginRight: "8%" };
const supportMessage = { background: "rgba(212,175,55,.07)", marginLeft: "8%", borderColor: "rgba(212,175,55,.18)" };
const internalMessage = { background: "rgba(59,130,246,.07)", borderColor: "rgba(96,165,250,.22)" };
const messageTopLine = { display: "flex", justifyContent: "space-between", gap: 12, color: "#EAF5EE", fontSize: 11, flexWrap: "wrap" };
const messageBody = { marginTop: 7, color: "#D7E5DD", lineHeight: 1.55, whiteSpace: "pre-wrap" };
const messageChannel = { display: "block", marginTop: 7, color: "#81988B" };
const replyForm = { marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.07)" };
const replyHeader = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 };
const replyLabel = { color: "#FFFFFF", fontSize: 12, fontWeight: 900 };
const agentGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 };
const agentCard = { display: "grid", gap: 4, padding: 12, borderRadius: 10, color: "#FFFFFF", background: "rgba(3,32,20,.72)", border: "1px solid rgba(255,255,255,.06)" };
