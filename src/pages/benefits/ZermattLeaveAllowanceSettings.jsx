import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../services/api";

export default function ZermattLeaveAllowanceSettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const result = await apiRequest("/api/benefits/leave-allowance/settings");
    const next = result?.data || null;
    setSettings(next);
    setEnabled(Boolean(next?.enabled));
  }

  useEffect(() => { load().catch((err) => setError(err?.message || "Unable to load settings.")); }, []);

  async function save(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      const result = await apiRequest("/api/benefits/leave-allowance/settings", { method: "PUT", body: { enabled, reason } });
      setSettings(result?.data || settings);
      setMessage(result?.message || "Leave Allowance settings saved.");
      setReason("");
    } catch (err) {
      setError(err?.message || "Unable to save settings.");
    } finally { setSaving(false); }
  }

  return <section style={page}>
    <button type="button" style={back} onClick={() => navigate("/benefits?workspace=leave-allowance")}>← Leave Allowance</button>
    <div style={eyebrow}>ZERMATT BENEFITS · SETTINGS</div>
    <h1 style={title}>Leave Allowance Settings</h1>
    <p style={lead}>Control whether Leave Allowance participates in future draft payroll calculations. The approved Zermatt formula, Full-Time eligibility, qualification rule and tax treatment are locked business rules and cannot be casually changed from this screen.</p>

    {error && <div style={errorBox}>{error}</div>}
    {message && <div style={successBox}>{message}</div>}

    <section style={panel}>
      {!settings ? <div style={muted}>Loading Leave Allowance settings…</div> : <form onSubmit={save} style={{ display: "grid", gap: 16 }}>
        <div style={toggleRow}>
          <div><strong style={{ fontSize: 17 }}>Payroll activation</strong><div style={muted}>When disabled, draft payroll still calculates normally but CHRiS does not add Leave Allowance.</div></div>
          <label style={switchLabel}><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {enabled ? "Enabled" : "Disabled"}</label>
        </div>

        <div style={grid}>
          <Setting label="Eligible Employment Type" value="Full-Time only" />
          <Setting label="Ineligible Employment Types" value="Part-time · Expatriate · NYSC/Internship" />
          <Setting label="Formula" value="Basic Monthly Salary × 12 × 10%" />
          <Setting label="Rate" value={`${settings.ratePercent}% of annual Basic`} />
          <Setting label="Qualifying service" value="1 completed year" />
          <Setting label="Payment timing" value="Employee entry month after qualifying service; annually thereafter" />
          <Setting label="Salary basis" value="Basic Monthly Salary" />
          <Setting label="Tax treatment" value="After-tax / Non-taxable" />
          <Setting label="Payslip element" value="Leave Allowance — separate benefit line" />
          <Setting label="Duplicate control" value="One approved payment per entitlement year" />
        </div>

        <label style={label}>Reason for settings change
          <textarea style={{ ...input, minHeight: 84 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required when changing activation status" required={enabled !== Boolean(settings.enabled)} />
        </label>
        <div style={notice}>Employment Type eligibility is controlled by the authoritative employee master record. Moving an employee away from Full-Time makes future Leave Allowance payroll calculations ineligible without rewriting approved historical payroll. All settings changes are retained in the CHRiS audit trail.</div>
        <button style={saveButton} disabled={saving || (enabled !== Boolean(settings.enabled) && !reason.trim())}>{saving ? "Saving…" : "Save Settings"}</button>
      </form>}
    </section>
  </section>;
}

function Setting({ label, value }) { return <div style={setting}><div style={settingLabel}>{label}</div><strong>{value}</strong><div style={locked}>LOCKED BUSINESS RULE</div></div>; }
const page={maxWidth:1100,margin:"0 auto",color:"var(--chris-text-main)"};
const back={border:0,background:"transparent",color:"var(--chris-gold)",fontWeight:900,cursor:"pointer",padding:"0 0 12px"};
const eyebrow={color:"var(--chris-gold)",fontSize:11,fontWeight:900,letterSpacing:".14em"};
const title={margin:"6px 0",fontSize:30};
const lead={color:"var(--chris-text-secondary)",lineHeight:1.65,maxWidth:950};
const panel={marginTop:18,padding:20,border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",background:"linear-gradient(145deg,rgba(12,38,26,.90),rgba(7,18,13,.96))"};
const toggleRow={display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",padding:14,borderRadius:10,border:"1px solid var(--chris-border-soft)",flexWrap:"wrap"};
const switchLabel={color:"var(--chris-gold)",fontWeight:900};
const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12};
const setting={padding:13,borderRadius:10,border:"1px solid var(--chris-border-soft)",background:"rgba(255,255,255,.025)",lineHeight:1.5};
const settingLabel={fontSize:11,color:"var(--chris-text-secondary)",textTransform:"uppercase",fontWeight:800,marginBottom:5};
const locked={fontSize:9,color:"var(--chris-gold)",fontWeight:900,marginTop:7,letterSpacing:".08em"};
const muted={color:"var(--chris-text-secondary)",fontSize:12,lineHeight:1.5};
const label={display:"grid",gap:6,fontSize:12,fontWeight:800,color:"var(--chris-text-secondary)"};
const input={padding:"10px 11px",borderRadius:9,border:"1px solid var(--chris-border-gold)",background:"rgba(255,255,255,.04)",color:"var(--chris-text-main)",width:"100%",boxSizing:"border-box",resize:"vertical"};
const notice={padding:11,borderRadius:9,border:"1px solid var(--chris-border-soft)",color:"var(--chris-text-secondary)",fontSize:11,lineHeight:1.55};
const saveButton={border:0,borderRadius:9,padding:"11px 14px",background:"var(--chris-gold)",color:"#07140D",fontWeight:900,cursor:"pointer"};
const errorBox={marginTop:12,padding:11,borderRadius:9,color:"#FCA5A5",background:"rgba(127,29,29,.35)"};
const successBox={marginTop:12,padding:11,borderRadius:9,color:"#86EFAC",background:"rgba(20,83,45,.35)"};
