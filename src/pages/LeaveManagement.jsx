import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const card = {
  background: "linear-gradient(145deg, rgba(12,30,21,.96), rgba(7,18,13,.96))",
  border: "1px solid rgba(212,175,55,.18)",
  borderRadius: 18,
  padding: 20,
  boxShadow: "0 18px 45px rgba(0,0,0,.20)",
};

const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.04)",
  color: "#F8FAFC",
  outline: "none",
};

function LeaveManagement() {
  const [types, setTypes] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [balances, setBalances] = useState(null);
  const [form, setForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    requestedUnits: "",
    reason: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadFoundation() {
    setLoading(true);
    setMessage("");
    try {
      const [typeResult, policyResult] = await Promise.all([
        apiRequest("/api/leave/types"),
        apiRequest("/api/leave/policies"),
      ]);
      setTypes(typeResult.data || []);
      setPolicies(policyResult.data || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFoundation();
  }, []);

  const activePolicies = useMemo(
    () => policies.filter((item) => item.isActive !== false),
    [policies]
  );

  async function loadBalances(event) {
    event?.preventDefault();
    if (!employeeNumber.trim()) return;
    setMessage("");
    try {
      const result = await apiRequest(
        `/api/leave/balances/${encodeURIComponent(employeeNumber.trim())}`
      );
      setBalances(result.data);
    } catch (error) {
      setBalances(null);
      setMessage(error.message);
    }
  }

  async function submitRequest(event) {
    event.preventDefault();
    setMessage("");
    try {
      await apiRequest("/api/leave/requests", {
        method: "POST",
        body: JSON.stringify({
          employeeNumber: employeeNumber.trim(),
          leaveTypeId: form.leaveTypeId,
          startDate: form.startDate,
          endDate: form.endDate,
          requestedUnits: Number(form.requestedUnits),
          reason: form.reason,
        }),
      });
      setMessage("Leave request submitted successfully.");
      setForm({
        leaveTypeId: "",
        startDate: "",
        endDate: "",
        requestedUnits: "",
        reason: "",
      });
      if (employeeNumber.trim()) {
        await loadBalances();
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div style={{ color: "#F8FAFC" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ color: "#D4AF37", fontSize: 12, fontWeight: 800, letterSpacing: 1.8 }}>
          PEOPLE OPERATIONS
        </div>
        <h1 style={{ margin: "7px 0 6px", fontSize: 30 }}>Leave Management</h1>
        <p style={{ margin: 0, color: "#94A3B8", maxWidth: 850 }}>
          Manage leave entitlements, employee balances and leave requests from the CHRIS leave engine.
        </p>
      </div>

      {message && (
        <div style={{ ...card, padding: "12px 16px", marginBottom: 18, color: "#F6D365" }}>
          {message}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16, marginBottom: 18 }}>
        <Metric label="Leave Types" value={loading ? "..." : types.length} />
        <Metric label="Active Policies" value={loading ? "..." : activePolicies.length} />
        <Metric label="Employee Balance" value={balances ? `${balances.balances?.length || 0} record(s)` : "Select employee"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 18, marginBottom: 18 }}>
        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Employee Leave Balance</h2>
          <form onSubmit={loadBalances} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <input
              style={input}
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              placeholder="Employee number e.g. CRN001"
            />
            <button style={buttonStyle} type="submit">Load</button>
          </form>

          {!balances ? (
            <Empty text="Enter an employee number to view leave balances." />
          ) : balances.balances?.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {balances.balances.map((balance) => (
                <div key={balance.id} style={rowStyle}>
                  <div>
                    <strong>{balance.leaveType?.name || "Leave"}</strong>
                    <div style={muted}>{balance.leaveYear}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ color: "#D4AF37" }}>{balance.available}</strong>
                    <div style={muted}>available</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="No leave balance records found for this employee." />
          )}
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>New Leave Request</h2>
          <form onSubmit={submitRequest} style={{ display: "grid", gap: 12 }}>
            <select
              style={input}
              value={form.leaveTypeId}
              onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
              required
            >
              <option value="">Select leave type</option>
              {types.filter((item) => item.isActive !== false).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input style={input} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
              <input style={input} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
            </div>
            <input style={input} type="number" min="0.5" step="0.5" placeholder="Requested days / units" value={form.requestedUnits} onChange={(e) => setForm({ ...form, requestedUnits: e.target.value })} required />
            <textarea style={{ ...input, minHeight: 82, resize: "vertical" }} placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <button style={buttonStyle} type="submit" disabled={!employeeNumber.trim()}>
              Submit Leave Request
            </button>
          </form>
        </section>
      </div>

      <section style={card}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Leave Policies</h2>
        {activePolicies.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
            {activePolicies.map((policy) => (
              <div key={policy.id} style={rowStyle}>
                <div>
                  <strong>{policy.name}</strong>
                  <div style={muted}>{policy.leaveType?.name || "Leave policy"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong style={{ color: "#D4AF37" }}>{String(policy.entitlementDays)}</strong>
                  <div style={muted}>days</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="No active leave policies configured yet." />
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }) {
  return <div style={card}><div style={muted}>{label}</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{value}</div></div>;
}

function Empty({ text }) {
  return <div style={{ color: "#64748B", padding: "18px 0" }}>{text}</div>;
}

const muted = { color: "#94A3B8", fontSize: 12, marginTop: 4 };
const rowStyle = { display: "flex", justifyContent: "space-between", gap: 14, padding: 13, borderRadius: 12, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)" };
const buttonStyle = { border: 0, borderRadius: 10, padding: "11px 16px", background: "linear-gradient(135deg,#D4AF37,#B88A16)", color: "#07110C", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };

export default LeaveManagement;
