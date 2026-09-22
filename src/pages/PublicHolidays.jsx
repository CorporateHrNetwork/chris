import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

function PublicHolidays() {
  const navigate = useNavigate();
  const [holidays, setHolidays] = useState([]);
  const [form, setForm] = useState({
    name: "",
    holidayDate: "",
    isRecurring: false,
    notes: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const result = await apiRequest("/api/attendance/public-holidays");
      setHolidays(result.data || []);
    } catch (err) {
      setError(err.message || "Unable to load public holidays.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      await apiRequest("/api/attendance/public-holidays", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", holidayDate: "", isRecurring: false, notes: "" });
      setMessage("Public holiday created successfully.");
      await load();
    } catch (err) {
      setError(err.message || "Unable to create public holiday.");
    }
  }

  async function remove(id) {
    if (!window.confirm("Remove this public holiday?")) return;
    setMessage("");
    setError("");

    try {
      await apiRequest(`/api/attendance/public-holidays/${id}`, {
        method: "DELETE",
      });
      setMessage("Public holiday removed.");
      await load();
    } catch (err) {
      setError(err.message || "Unable to remove public holiday.");
    }
  }

  return (
    <div style={{ color: "var(--chris-text-main)" }}>
      <button type="button" onClick={() => navigate("/attendance")} style={backStyle}>
        {"\u2190"} Back to Time & Attendance Dashboard
      </button>

      <div style={{ marginBottom: 22 }}>
        <div style={eyebrowStyle}>TIME & ATTENDANCE</div>
        <h1 style={titleStyle}>Public Holidays</h1>
        <p style={descriptionStyle}>
          Maintain organization public holidays used by attendance scheduling and workforce planning.
        </p>
      </div>

      {message && <Notice success>{message}</Notice>}
      {error && <Notice>{error}</Notice>}

      <section style={panelStyle}>
        <h2 style={{ margin: 0 }}>Add Public Holiday</h2>
        <form onSubmit={submit} style={formGridStyle}>
          <Field label="Holiday Name">
            <input required style={inputStyle} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Holiday Date">
            <input required type="date" style={inputStyle} value={form.holidayDate} onChange={(event) => setForm({ ...form, holidayDate: event.target.value })} />
          </Field>
          <Field label="Notes">
            <input style={inputStyle} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
          <label style={checkboxStyle}>
            <input type="checkbox" checked={form.isRecurring} onChange={(event) => setForm({ ...form, isRecurring: event.target.checked })} />
            Recurs annually
          </label>
          <button type="submit" style={primaryButtonStyle}>Add Holiday</button>
        </form>
      </section>

      <section style={{ ...panelStyle, marginTop: 18 }}>
        <h2 style={{ margin: 0 }}>Holiday Calendar</h2>
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Holiday</th>
                <th>Recurring</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holidays.length ? holidays.map((holiday) => (
                <tr key={holiday.id}>
                  <td>{new Date(holiday.holidayDate).toLocaleDateString()}</td>
                  <td><strong>{holiday.name}</strong></td>
                  <td>{holiday.isRecurring ? "Yes" : "No"}</td>
                  <td>{holiday.notes || "—"}</td>
                  <td>
                    <button type="button" onClick={() => remove(holiday.id)} style={dangerButtonStyle}>
                      Remove
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="5" style={emptyCellStyle}>No public holidays configured.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return <label><div style={fieldLabelStyle}>{label}</div>{children}</label>;
}
function Notice({ children, success = false }) {
  return <div style={{...panelStyle,padding:"12px 16px",marginBottom:18,color:success?"var(--chris-success)":"var(--chris-warning)"}}>{children}</div>;
}
const panelStyle={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)"};
const formGridStyle={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,alignItems:"end",marginTop:16};
const inputStyle={width:"100%",boxSizing:"border-box",padding:"11px 12px",borderRadius:"var(--chris-radius-md)",border:"1px solid var(--chris-border-soft)",background:"var(--chris-input-bg)",color:"var(--chris-text-main)",fontFamily:"var(--chris-font-family)"};
const primaryButtonStyle={border:0,borderRadius:"var(--chris-radius-md)",padding:"12px 16px",background:"linear-gradient(135deg,var(--chris-gold),var(--chris-gold-deep))",color:"#07110C",fontWeight:800};
const dangerButtonStyle={border:"1px solid rgba(251,113,133,.35)",borderRadius:"var(--chris-radius-md)",padding:"7px 10px",background:"rgba(251,113,133,.08)",color:"var(--chris-danger)",fontWeight:800};
const checkboxStyle={display:"flex",alignItems:"center",gap:8,color:"var(--chris-text-secondary)",fontWeight:700};
const backStyle={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,cursor:"pointer"};
const eyebrowStyle={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const descriptionStyle={margin:0,maxWidth:900,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.55};
const fieldLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700,marginBottom:7};
const emptyCellStyle={padding:"24px 12px",color:"var(--chris-text-secondary)",textAlign:"center"};
export default PublicHolidays;
