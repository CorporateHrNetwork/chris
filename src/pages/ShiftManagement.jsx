import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

const EMPTY = {
  name: "",
  code: "",
  startTime: "",
  endTime: "",
  breakMinutes: 0,
  graceMinutes: 0,
  crossesMidnight: false,
};

function ShiftManagement() {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const result = await apiRequest("/api/attendance/shifts");
      setShifts(result.data || []);
    } catch (err) {
      setError(err.message || "Unable to load shifts.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const activeCount = useMemo(
    () => shifts.filter((s) => s.isActive !== false).length,
    [shifts]
  );

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
  }

  function edit(shift) {
    setEditingId(shift.id);
    setMessage("");
    setError("");
    setForm({
      name: shift.name || "",
      code: shift.code || "",
      startTime: shift.startTime || "",
      endTime: shift.endTime || "",
      breakMinutes: Number(shift.breakMinutes || 0),
      graceMinutes: Number(shift.graceMinutes || 0),
      crossesMidnight: Boolean(shift.crossesMidnight),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    const payload = {
      ...form,
      code: String(form.code || "").trim().toUpperCase(),
      breakMinutes: Number(form.breakMinutes || 0),
      graceMinutes: Number(form.graceMinutes || 0),
      crossesMidnight: Boolean(form.crossesMidnight),
    };

    try {
      if (editingId) {
        await apiRequest(`/api/attendance/shifts/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setMessage("Work shift updated successfully.");
      } else {
        await apiRequest("/api/attendance/shifts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Work shift created successfully.");
      }
      reset();
      await load();
    } catch (err) {
      setError(err.message || "Unable to save work shift.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(shift) {
    setBusy(true);
    setMessage("");
    setError("");
    const nextActive = shift.isActive === false;

    try {
      await apiRequest(`/api/attendance/shifts/${shift.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: nextActive }),
      });
      setMessage(
        nextActive
          ? "Work shift activated successfully."
          : "Work shift deactivated successfully."
      );
      if (editingId === shift.id) reset();
      await load();
    } catch (err) {
      setError(err.message || "Unable to update shift status.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(shift) {
    if (
      !window.confirm(
        `Delete "${shift.name}"? CHRIS will block deletion if the shift has historical assignments or attendance records.`
      )
    ) return;

    setBusy(true);
    setMessage("");
    setError("");

    try {
      await apiRequest(`/api/attendance/shifts/${shift.id}`, {
        method: "DELETE",
      });
      setMessage("Unused work shift deleted successfully.");
      if (editingId === shift.id) reset();
      await load();
    } catch (err) {
      setError(err.message || "Unable to delete work shift.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ color: "var(--chris-text-main)" }}>
      <button type="button" onClick={() => navigate("/attendance")} style={backStyle}>
        {"\u2190"} Back to Time & Attendance Dashboard
      </button>

      <div style={{ marginBottom: 22 }}>
        <div style={eyebrowStyle}>TIME & ATTENDANCE</div>
        <h1 style={titleStyle}>Work Shifts</h1>
        <p style={descriptionStyle}>
          Configure work shifts, working hours, grace periods and lifecycle status.
        </p>
      </div>

      {message && <Notice success>{message}</Notice>}
      {error && <Notice>{error}</Notice>}

      <div style={metricGridStyle}>
        <Metric label="Configured Shifts" value={shifts.length} />
        <Metric label="Active Shifts" value={activeCount} />
        <Metric label="Inactive Shifts" value={shifts.length - activeCount} />
        <Metric
          label="Overnight Shifts"
          value={shifts.filter((s) => s.crossesMidnight).length}
        />
      </div>

      <div style={workspaceGridStyle}>
        <section style={panelStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={{ margin: 0 }}>
                {editingId ? "Edit Work Shift" : "Create Work Shift"}
              </h2>
              <p style={sectionSubStyle}>
                {editingId
                  ? "Update the selected shift without breaking historical attendance links."
                  : "Define standard work hours and attendance processing rules."}
              </p>
            </div>

            {editingId && (
              <button type="button" onClick={reset} style={secondaryButtonStyle}>
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={save} style={formStyle}>
            <Field label="Shift Name">
              <input
                required
                style={inputStyle}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="Shift Code">
              <input
                required
                style={inputStyle}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>

            <div style={twoColumnStyle}>
              <Field label="Start Time">
                <input
                  required
                  type="time"
                  style={inputStyle}
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </Field>

              <Field label="End Time">
                <input
                  required
                  type="time"
                  style={inputStyle}
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </Field>
            </div>

            <div style={twoColumnStyle}>
              <Field label="Grace Minutes">
                <input
                  min="0"
                  type="number"
                  style={inputStyle}
                  value={form.graceMinutes}
                  onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })}
                />
              </Field>

              <Field label="Break Minutes">
                <input
                  min="0"
                  type="number"
                  style={inputStyle}
                  value={form.breakMinutes}
                  onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })}
                />
              </Field>
            </div>

            <label style={checkboxStyle}>
              <input
                type="checkbox"
                checked={form.crossesMidnight}
                onChange={(e) => setForm({ ...form, crossesMidnight: e.target.checked })}
              />
              Shift crosses midnight
            </label>

            <button
              disabled={busy}
              type="submit"
              style={{ ...primaryButtonStyle, opacity: busy ? 0.65 : 1 }}
            >
              {editingId ? "Save Changes" : "Create Shift"}
            </button>
          </form>
        </section>

        <section style={panelStyle}>
          <h2 style={{ margin: 0 }}>Configured Shifts</h2>
          <p style={sectionSubStyle}>
            Edit, activate/deactivate or safely delete unused shifts.
          </p>

          {shifts.length ? (
            <div style={listStyle}>
              {shifts.map((shift) => (
                <div key={shift.id} style={shiftRowStyle}>
                  <div>
                    <div style={titleRowStyle}>
                      <strong>{shift.name}</strong>
                      <span style={shift.isActive !== false ? activeBadgeStyle : inactiveBadgeStyle}>
                        {shift.isActive !== false ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                    <div style={mutedStyle}>
                      {shift.code} {"\u00B7"} {shift.startTime} - {shift.endTime}
                    </div>
                    <div style={metaStyle}>
                      <span>{Number(shift.graceMinutes || 0)} min grace</span>
                      <span>{Number(shift.breakMinutes || 0)} min break</span>
                      {shift.crossesMidnight && <span>Crosses midnight</span>}
                    </div>
                  </div>

                  <div style={actionsStyle}>
                    <button type="button" disabled={busy} onClick={() => edit(shift)} style={actionButtonStyle}>
                      Edit
                    </button>
                    <button type="button" disabled={busy} onClick={() => toggle(shift)} style={warningButtonStyle}>
                      {shift.isActive !== false ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => remove(shift)} style={dangerButtonStyle}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyStyle}>No work shifts configured yet.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label><div style={fieldLabelStyle}>{label}</div>{children}</label>;
}

function Metric({ label, value }) {
  return (
    <div style={panelStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
      <div style={mutedStyle}>Live shift data</div>
    </div>
  );
}

function Notice({ children, success = false }) {
  return (
    <div
      style={{
        ...panelStyle,
        padding: "12px 16px",
        marginBottom: 18,
        color: success ? "var(--chris-success)" : "var(--chris-warning)",
      }}
    >
      {children}
    </div>
  );
}

const panelStyle={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)"};
const metricGridStyle={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:16,marginBottom:18};
const workspaceGridStyle={display:"grid",gridTemplateColumns:"minmax(320px,.85fr) minmax(480px,1.4fr)",gap:18,alignItems:"start"};
const formStyle={display:"grid",gap:12,marginTop:18};
const twoColumnStyle={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12};
const inputStyle={width:"100%",boxSizing:"border-box",padding:"11px 12px",borderRadius:"var(--chris-radius-md)",border:"1px solid var(--chris-border-soft)",background:"var(--chris-input-bg)",color:"var(--chris-text-main)",fontFamily:"var(--chris-font-family)"};
const primaryButtonStyle={border:0,borderRadius:"var(--chris-radius-md)",padding:"12px 16px",background:"linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep))",color:"#07110C",fontWeight:800,cursor:"pointer"};
const secondaryButtonStyle={border:"1px solid var(--chris-border-soft)",borderRadius:"var(--chris-radius-md)",padding:"8px 11px",background:"rgba(255,255,255,.04)",color:"var(--chris-text-main)",fontWeight:800,cursor:"pointer"};
const actionButtonStyle={...secondaryButtonStyle,color:"var(--chris-gold)"};
const warningButtonStyle={...secondaryButtonStyle,color:"var(--chris-warning)",border:"1px solid rgba(246,211,101,.28)"};
const dangerButtonStyle={...secondaryButtonStyle,color:"var(--chris-danger)",border:"1px solid rgba(251,113,133,.30)"};
const checkboxStyle={display:"flex",alignItems:"center",gap:8,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700};
const listStyle={display:"grid",gap:12,marginTop:16};
const shiftRowStyle={display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:16,alignItems:"center",padding:16,border:"1px solid var(--chris-border-soft)",borderRadius:"var(--chris-radius-md)",background:"rgba(255,255,255,.025)"};
const titleRowStyle={display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"};
const metaStyle={display:"flex",gap:12,flexWrap:"wrap",marginTop:8,color:"var(--chris-text-muted)",fontSize:"var(--chris-font-xs)"};
const actionsStyle={display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"};
const activeBadgeStyle={display:"inline-block",padding:"4px 8px",borderRadius:"var(--chris-radius-pill)",background:"rgba(52,211,153,.10)",color:"var(--chris-success)",fontSize:"var(--chris-font-xs)",fontWeight:800};
const inactiveBadgeStyle={...activeBadgeStyle,background:"rgba(255,255,255,.05)",color:"var(--chris-text-muted)"};
const backStyle={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,cursor:"pointer"};
const eyebrowStyle={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const descriptionStyle={margin:0,maxWidth:900,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.55};
const sectionHeaderStyle={display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16};
const sectionSubStyle={margin:"6px 0 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
const fieldLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700,marginBottom:7};
const metricLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700};
const metricValueStyle={fontSize:28,fontWeight:800,marginTop:10};
const mutedStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-xs)",marginTop:4};
const emptyStyle={padding:"28px 12px",color:"var(--chris-text-secondary)",textAlign:"center"};

export default ShiftManagement;
