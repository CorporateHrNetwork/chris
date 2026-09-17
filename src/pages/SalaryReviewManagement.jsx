import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

export default function SalaryReviewManagement() {
  const [employees, setEmployees] = useState([]);
  const [rates, setRates] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [employeeResult, rateResult] = await Promise.all([
      apiRequest("/api/employees"),
      apiRequest("/api/payroll/salary-rates"),
    ]);
    setEmployees(Array.isArray(employeeResult?.data) ? employeeResult.data : []);
    setRates(Array.isArray(rateResult?.data) ? rateResult.data : []);
  }

  useEffect(() => { load().catch((err) => setError(err?.message || "Unable to load salary review control.")); }, []);

  const currentByEmployee = useMemo(() => {
    const map = new Map();
    for (const row of rates) {
      if (row.status !== "ACTIVE") continue;
      if (!map.has(row.employeeNumber)) map.set(row.employeeNumber, row);
    }
    return map;
  }, [rates]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((employee) => [employee.employeeNumber, employee.firstName, employee.middleName, employee.lastName, employee.location?.name, employee.employmentType]
      .filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [employees, query]);

  function choose(employee) {
    setSelected(employee);
    setAmount("");
    setEffectiveFrom("");
    setReason("");
    setError("");
    setMessage("");
  }

  async function save(event) {
    event.preventDefault();
    if (!selected) return;
    try {
      setSaving(true);
      setError("");
      const result = await apiRequest("/api/payroll/salary-reviews", {
        method: "POST",
        body: { employeeNumber: selected.employeeNumber, amount: Number(amount), effectiveFrom, reason, currency: "NGN" },
      });
      setMessage(result?.message || "Salary review saved.");
      await load();
      setAmount(""); setEffectiveFrom(""); setReason("");
    } catch (err) {
      setError(err?.message || "Unable to save salary review.");
    } finally { setSaving(false); }
  }

  const current = selected ? currentByEmployee.get(selected.employeeNumber) : null;

  return <section style={page}>
    <div style={eyebrow}>COMPENSATION CONTROL</div>
    <h1 style={title}>Individual Salary Review</h1>
    <p style={lead}>Apply an employee-specific salary review with effective dating, mandatory reason, branch scope and complete CHRiS audit history. Approved historical payroll is never rewritten.</p>
    {error && <div style={errorBox}>{error}</div>}
    {message && <div style={successBox}>{message}</div>}
    <div style={layout}>
      <section style={panel}>
        <div style={toolbar}><div><h2 style={h2}>Employees</h2><div style={muted}>Only employees visible in the active branch context are available.</div></div><input style={input} value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search employee or branch" /></div>
        <div style={tableWrap}><table style={table}><thead><tr>{["Employee","Branch","Employment Type","Current Gross","Action"].map((x)=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>
          {rows.map((employee)=>{ const rate=currentByEmployee.get(employee.employeeNumber); return <tr key={employee.id||employee.employeeNumber}>
            <td style={tdStrong}>{employee.employeeNumber} — {[employee.firstName,employee.middleName,employee.lastName].filter(Boolean).join(" ")}</td>
            <td style={td}>{employee.location?.name||"—"}</td><td style={td}>{employee.employmentType||"—"}</td>
            <td style={td}>{rate ? `₦${Number(rate.amount||0).toLocaleString()}` : "Not configured"}</td>
            <td style={td}><button style={actionButton} type="button" onClick={()=>choose(employee)}>Review Salary</button></td>
          </tr>;})}
        </tbody></table></div>
      </section>
      <section style={panel}>
        <h2 style={h2}>Salary Change Control</h2>
        {!selected ? <div style={muted}>Select an employee.</div> : <form onSubmit={save} style={{display:"grid",gap:13}}>
          <div style={employeeBox}><strong>{selected.employeeNumber}</strong><div>{[selected.firstName,selected.middleName,selected.lastName].filter(Boolean).join(" ")}</div><small style={muted}>Current monthly gross: {current ? `₦${Number(current.amount||0).toLocaleString()}` : "Not configured"}</small></div>
          <label style={label}>Revised Monthly Gross Salary<input style={input} type="number" min="1" step="0.01" value={amount} onChange={(e)=>setAmount(e.target.value)} required /></label>
          <label style={label}>Effective From<input style={input} type="date" value={effectiveFrom} onChange={(e)=>setEffectiveFrom(e.target.value)} required /></label>
          <label style={label}>Reason for Salary Review<textarea style={{...input,minHeight:90,resize:"vertical"}} value={reason} onChange={(e)=>setReason(e.target.value)} required placeholder="State the approved reason / authority for this review" /></label>
          <div style={notice}>CHRiS will end-date the applicable prior salary rate, create the new effective-dated rate, preserve both records, write the reason to audit, and flag draft payroll for recalculation.</div>
          <button style={saveButton} disabled={saving||!amount||!effectiveFrom||!reason.trim()}>{saving?"Saving…":"Apply Salary Review"}</button>
        </form>}
      </section>
    </div>
  </section>;
}

const page={maxWidth:1500,margin:"0 auto",color:"var(--chris-text-main)"};
const eyebrow={color:"var(--chris-gold)",fontSize:11,fontWeight:900,letterSpacing:".14em"};
const title={margin:"6px 0",fontSize:30};
const lead={color:"var(--chris-text-secondary)",lineHeight:1.65,maxWidth:1050};
const layout={display:"grid",gridTemplateColumns:"minmax(0,2fr) minmax(320px,.8fr)",gap:16,alignItems:"start",marginTop:18};
const panel={padding:18,border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",background:"linear-gradient(145deg,rgba(12,38,26,.90),rgba(7,18,13,.96))"};
const toolbar={display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"end",marginBottom:12};
const h2={margin:"0 0 5px",fontSize:19};
const muted={color:"var(--chris-text-secondary)",fontSize:12,lineHeight:1.5};
const input={padding:"10px 11px",borderRadius:9,border:"1px solid var(--chris-border-gold)",background:"rgba(255,255,255,.04)",color:"var(--chris-text-main)",width:"100%",boxSizing:"border-box"};
const tableWrap={overflowX:"auto"}; const table={width:"100%",minWidth:800,borderCollapse:"collapse"};
const th={padding:10,textAlign:"left",borderBottom:"1px solid var(--chris-border-gold)",color:"var(--chris-gold)",fontSize:11};
const td={padding:10,borderBottom:"1px solid var(--chris-border-soft)",fontSize:12,color:"var(--chris-text-secondary)"}; const tdStrong={...td,fontWeight:800,color:"var(--chris-text-main)"};
const actionButton={border:"1px solid var(--chris-border-gold)",borderRadius:8,background:"rgba(212,175,55,.08)",color:"var(--chris-gold)",padding:"7px 9px",fontWeight:800,cursor:"pointer"};
const employeeBox={padding:12,borderRadius:10,border:"1px solid var(--chris-border-soft)",background:"rgba(255,255,255,.025)"};
const label={display:"grid",gap:6,fontSize:12,fontWeight:800,color:"var(--chris-text-secondary)"}; const notice={padding:11,borderRadius:9,border:"1px solid var(--chris-border-soft)",color:"var(--chris-text-secondary)",fontSize:11,lineHeight:1.55};
const saveButton={border:0,borderRadius:9,padding:"11px 14px",background:"var(--chris-gold)",color:"#07140D",fontWeight:900,cursor:"pointer"};
const errorBox={marginTop:12,padding:11,borderRadius:9,color:"#FCA5A5",background:"rgba(127,29,29,.35)"}; const successBox={marginTop:12,padding:11,borderRadius:9,color:"#86EFAC",background:"rgba(20,83,45,.35)"};
