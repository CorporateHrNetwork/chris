import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

const blank = {
  recipientEmail: "",
  departmentId: "",
  designationId: "",
  locationId: "",
  employmentStatus: "PROBATION",
  hireDate: "",
  expiresInHours: 72,
};

export default function EmployeeInvitations() {
  const navigate = useNavigate();
  const [form, setForm] = useState(blank);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [invites, setInvites] = useState([]);
  const [latestUrl, setLatestUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    const [dept, desig, loc, inviteResult] = await Promise.all([
      apiRequest("/api/employees/career/departments"),
      apiRequest("/api/employees/career/catalog"),
      apiRequest("/api/location-catalog"),
      apiRequest("/api/employee-data/invites"),
    ]);
    setDepartments((dept.data || []).filter((row) => row.isActive !== false));
    setDesignations((desig.data || []).filter((row) => row.isActive !== false && row.departmentId));
    setLocations((loc.data || []).filter((row) => row.isActive !== false));
    setInvites(inviteResult.data || []);
  };

  useEffect(() => {
    load().catch((err) => setError(err.message || "Unable to load employee invitations."));
  }, []);

  const availableDesignations = useMemo(
    () => designations.filter((row) => row.departmentId === form.departmentId),
    [designations, form.departmentId]
  );

  const change = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "departmentId" ? { designationId: "" } : {}),
    }));
  };

  const create = async (event) => {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      setMessage("");
      const response = await apiRequest("/api/employee-data/invites", {
        method: "POST",
        body: form,
      });
      setLatestUrl(response.data?.invitationUrl || "");
      setMessage("Secure invitation created. Copy the link below and send it to the employee.");
      setForm(blank);
      await load();
    } catch (err) {
      setError(err.message || "Unable to create invitation.");
    } finally {
      setBusy(false);
    }
  };

  const action = async (id, operation) => {
    try {
      setBusy(true);
      setError("");
      const response = await apiRequest(`/api/employee-data/invites/${encodeURIComponent(id)}/${operation}`, { method: "POST" });
      setMessage(response.message || "Invitation updated.");
      await load();
    } catch (err) {
      setError(err.message || "Unable to update invitation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={pageStyle}>
      <button type="button" style={backStyle} onClick={() => navigate("/employees/directory")}>← Employee Directory</button>
      <div style={eyebrow}>EMPLOYEE SELF-ONBOARDING</div>
      <h1 style={title}>Invite Employee with a Secure Link</h1>
      <p style={lead}>HR controls organization placement and employment settings. The employee submits permitted personal details through a single-use hashed-token invitation, and HR approves the submission before the employee record is created.</p>

      <form onSubmit={create} style={formPanel}>
        <div style={grid}>
          <Field label="Employee email"><input type="email" required value={form.recipientEmail} onChange={change("recipientEmail")} /></Field>
          <Field label="Department"><select required value={form.departmentId} onChange={change("departmentId")}><option value="">Select department</option>{departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          <Field label="Designation"><select required value={form.designationId} onChange={change("designationId")} disabled={!form.departmentId}><option value="">Select designation</option>{availableDesignations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          <Field label="Location"><select required value={form.locationId} onChange={change("locationId")}><option value="">Select location</option>{locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          <Field label="Employment status"><select value={form.employmentStatus} onChange={change("employmentStatus")}><option value="PROBATION">Probation</option><option value="ACTIVE">Active</option></select></Field>
          <Field label="Hire date"><input type="date" value={form.hireDate} onChange={change("hireDate")} /></Field>
          <Field label="Link expires in"><select value={form.expiresInHours} onChange={change("expiresInHours")}><option value="24">24 hours</option><option value="72">72 hours</option><option value="168">7 days</option></select></Field>
        </div>
        <div style={actions}><button type="submit" style={primaryButton} disabled={busy}>{busy ? "Working…" : "Create Secure Invitation"}</button></div>
      </form>

      {latestUrl && (
        <div style={linkPanel}>
          <strong>Invitation link</strong>
          <input readOnly value={latestUrl} onFocus={(event) => event.target.select()} />
          <p style={muted}>CHRiS stores only the token hash. This raw link is returned at creation time for HR to send securely.</p>
        </div>
      )}
      {message && <div role="status" style={successStyle}>{message}</div>}
      {error && <div role="alert" style={errorStyle}>{error}</div>}

      <section style={queuePanel}>
        <div style={queueHeader}><h2 style={{ margin: 0 }}>Invitation Queue</h2><button type="button" style={secondaryButton} onClick={() => load()} disabled={busy}>Refresh</button></div>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead><tr><th>Email</th><th>Status</th><th>Created</th><th>Expires</th><th>Action</th></tr></thead>
            <tbody>
              {invites.length ? invites.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.recipientEmail}</td>
                  <td><span style={statusBadge(invite.status)}>{invite.status}</span></td>
                  <td>{formatDate(invite.createdAt)}</td>
                  <td>{formatDate(invite.expiresAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      {invite.status === "SUBMITTED" && <button type="button" style={primaryButton} onClick={() => action(invite.id, "approve")} disabled={busy}>Approve & Create Employee</button>}
                      {!["COMPLETED", "REVOKED", "EXPIRED"].includes(invite.status) && <button type="button" style={secondaryButton} onClick={() => action(invite.id, "revoke")} disabled={busy}>Revoke</button>}
                      {invite.employeeId && <span style={{ color: "#2EE98B", fontWeight: 800 }}>Employee created</span>}
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan="5" style={{ padding: 18 }}>No employee invitations yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function Field({ label, children }) { return <label style={field}><span style={fieldLabel}>{label}</span>{children}</label>; }
function formatDate(value) { if (!value) return "-"; return new Date(value).toLocaleString(); }
function statusBadge(status) {
  const positive = status === "COMPLETED";
  const attention = status === "SUBMITTED";
  return { display: "inline-block", padding: "4px 8px", borderRadius: 999, fontWeight: 900, fontSize: 10, background: positive ? "rgba(46,233,139,.15)" : attention ? "rgba(212,175,55,.16)" : "rgba(255,255,255,.08)", color: positive ? "#2EE98B" : attention ? "#D4AF37" : "#C7D3CC" };
}
const pageStyle = { maxWidth: 1180, margin: "0 auto", color: "var(--chris-text-main)" };
const backStyle = { border: 0, background: "transparent", color: "#D4AF37", fontWeight: 800, cursor: "pointer", padding: "0 0 16px" };
const eyebrow = { color: "#D4AF37", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" };
const title = { margin: "7px 0", fontSize: 32 };
const lead = { color: "var(--chris-text-secondary)", lineHeight: 1.65, maxWidth: 930 };
const formPanel = { marginTop: 22, padding: 22, border: "1px solid var(--chris-border-gold)", borderRadius: 16, background: "linear-gradient(145deg,rgba(8,50,33,.96),rgba(3,20,13,.98))" };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 15 };
const field = { display: "grid", gap: 6 };
const fieldLabel = { color: "#D4AF37", fontSize: 11, fontWeight: 900, textTransform: "uppercase" };
const actions = { marginTop: 18, display: "flex", justifyContent: "flex-end" };
const primaryButton = { border: 0, borderRadius: 9, padding: "10px 14px", background: "#D4AF37", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { ...primaryButton, background: "transparent", color: "#D4AF37", border: "1px solid rgba(212,175,55,.6)" };
const linkPanel = { marginTop: 18, padding: 16, borderRadius: 12, border: "1px solid rgba(46,233,139,.45)", background: "rgba(46,233,139,.08)", display: "grid", gap: 8 };
const muted = { color: "var(--chris-text-secondary)", margin: 0, fontSize: 12 };
const successStyle = { marginTop: 16, padding: 12, borderRadius: 10, color: "#2EE98B", border: "1px solid rgba(46,233,139,.42)", background: "rgba(46,233,139,.08)" };
const errorStyle = { marginTop: 16, padding: 12, borderRadius: 10, color: "#FCA5A5", border: "1px solid rgba(248,113,113,.5)", background: "rgba(185,28,28,.14)" };
const queuePanel = { marginTop: 24, border: "1px solid rgba(212,175,55,.5)", borderRadius: 14, overflow: "hidden" };
const queueHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 16 };
const tableStyle = { width: "100%", minWidth: 780, borderCollapse: "collapse" };
