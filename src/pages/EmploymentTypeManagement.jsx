import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

export default function EmploymentTypeManagement() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [employmentType, setEmploymentType] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [employeeResult, catalogResult] = await Promise.all([
      apiRequest("/api/employees"),
      apiRequest("/api/employees/employment-types/catalog"),
    ]);
    setEmployees(Array.isArray(employeeResult?.data) ? employeeResult.data : []);
    setTypes(catalogResult?.data?.employmentTypes || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err?.message || "Unable to load Employment Types."));
  }, []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((employee) => [
      employee.employeeNumber,
      employee.firstName,
      employee.middleName,
      employee.lastName,
      employee.employmentType,
      employee.location?.name,
      employee.designation?.name,
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [employees, query]);

  function choose(employee) {
    setSelected(employee);
    setEmploymentType(employee.employmentType || "");
    setReason("");
    setMessage("");
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (!selected) return;
    try {
      setSaving(true);
      setError("");
      const result = await apiRequest(`/api/employees/${encodeURIComponent(selected.employeeNumber)}/employment-type`, {
        method: "PUT",
        body: { employmentType, reason },
      });
      setMessage(result?.message || "Employment Type updated.");
      await load();
      const refreshed = (Array.isArray(result?.data) ? null : result?.data);
      setSelected((current) => current ? { ...current, employmentType: refreshed?.employmentType || employmentType } : current);
      setReason("");
    } catch (err) {
      setError(err?.message || "Unable to update Employment Type.");
    } finally {
      setSaving(false);
    }
  }

  return <section style={page}>
    <button type="button" style={back} onClick={() => navigate("/employees")}>← Employee Dashboard</button>
    <div style={eyebrow}>EMPLOYMENT MASTER DATA</div>
    <h1 style={title}>Employment Type Management</h1>
    <p style={lead}>Change an employee between the authoritative Employment Types. Changes are immediate, branch-scoped where applicable, permission-controlled and written to the CHRiS audit trail.</p>

    {error && <div style={errorBox}>{error}</div>}
    {message && <div style={successBox}>{message}</div>}

    <div style={layout}>
      <section style={panel}>
        <div style={toolbar}>
          <div><h2 style={h2}>Employees</h2><div style={muted}>Select an employee to change Employment Type.</div></div>
          <input style={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee, branch, role or type" />
        </div>
        <div style={tableWrap}><table style={table}>
          <thead><tr>{["Employee","Branch","Designation","Current Employment Type","Action"].map((x) => <th style={th} key={x}>{x}</th>)}</tr></thead>
          <tbody>{rows.map((employee) => <tr key={employee.id || employee.employeeNumber}>
            <td style={tdStrong}>{employee.employeeNumber} — {[employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ")}</td>
            <td style={td}>{employee.location?.name || "—"}</td>
            <td style={td}>{employee.designation?.name || "—"}</td>
            <td style={td}><span style={badge}>{employee.employmentType || "Not set"}</span></td>
            <td style={td}><button type="button" style={actionButton} onClick={() => choose(employee)}>Change Type</button></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section style={panel}>
        <h2 style={h2}>Change Employment Type</h2>
        {!selected ? <div style={muted}>Select an employee from the register.</div> : <form onSubmit={save} style={{ display: "grid", gap: 13 }}>
          <div style={employeeBox}><strong>{selected.employeeNumber}</strong><div>{[selected.firstName, selected.middleName, selected.lastName].filter(Boolean).join(" ")}</div><small style={muted}>Current: {selected.employmentType || "Not set"}</small></div>
          <label style={label}>New Employment Type
            <select style={input} value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} required>
              <option value="">Select type</option>
              {types.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label style={label}>Reason for change
            <textarea style={{ ...input, minHeight: 90, resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Contract revised to part-time employment" required />
          </label>
          <div style={notice}>Changing Employment Type updates the employee's authoritative current employment record. Downstream modules that read Employment Type—such as payroll/statutory eligibility and benefits—will use the revised type on subsequent processing. Historical payroll and approved records are not rewritten.</div>
          <button style={saveButton} disabled={saving || !employmentType || !reason.trim()}>{saving ? "Saving…" : "Save Employment Type"}</button>
        </form>}
      </section>
    </div>
  </section>;
}

const page={maxWidth:1500,margin:"0 auto",color:"var(--chris-text-main)"};
const back={border:0,background:"transparent",color:"var(--chris-gold)",fontWeight:900,cursor:"pointer",padding:"0 0 12px"};
const eyebrow={color:"var(--chris-gold)",fontSize:11,fontWeight:900,letterSpacing:".14em"};
const title={margin:"6px 0",fontSize:30};
const lead={color:"var(--chris-text-secondary)",lineHeight:1.65,maxWidth:1050};
const layout={display:"grid",gridTemplateColumns:"minmax(0,2fr) minmax(320px,.8fr)",gap:16,alignItems:"start",marginTop:18};
const panel={padding:18,border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",background:"linear-gradient(145deg,rgba(12,38,26,.90),rgba(7,18,13,.96))"};
const toolbar={display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"end",marginBottom:12};
const h2={margin:"0 0 5px",fontSize:19};
const muted={color:"var(--chris-text-secondary)",fontSize:12,lineHeight:1.5};
const input={padding:"10px 11px",borderRadius:9,border:"1px solid var(--chris-border-gold)",background:"rgba(255,255,255,.04)",color:"var(--chris-text-main)",width:"100%",boxSizing:"border-box"};
const tableWrap={overflowX:"auto"};
const table={width:"100%",minWidth:820,borderCollapse:"collapse"};
const th={padding:10,textAlign:"left",borderBottom:"1px solid var(--chris-border-gold)",color:"var(--chris-gold)",fontSize:11};
const td={padding:10,borderBottom:"1px solid var(--chris-border-soft)",fontSize:12,color:"var(--chris-text-secondary)"};
const tdStrong={...td,fontWeight:800,color:"var(--chris-text-main)"};
const badge={padding:"4px 7px",borderRadius:999,border:"1px solid var(--chris-border-soft)"};
const actionButton={border:"1px solid var(--chris-border-gold)",borderRadius:8,background:"rgba(212,175,55,.08)",color:"var(--chris-gold)",padding:"7px 9px",fontWeight:800,cursor:"pointer"};
const employeeBox={padding:12,borderRadius:10,border:"1px solid var(--chris-border-soft)",background:"rgba(255,255,255,.025)"};
const label={display:"grid",gap:6,fontSize:12,fontWeight:800,color:"var(--chris-text-secondary)"};
const notice={padding:11,borderRadius:9,border:"1px solid var(--chris-border-soft)",color:"var(--chris-text-secondary)",fontSize:11,lineHeight:1.55};
const saveButton={border:0,borderRadius:9,padding:"11px 14px",background:"var(--chris-gold)",color:"#07140D",fontWeight:900,cursor:"pointer"};
const errorBox={marginTop:12,padding:11,borderRadius:9,color:"#FCA5A5",background:"rgba(127,29,29,.35)"};
const successBox={marginTop:12,padding:11,borderRadius:9,color:"#86EFAC",background:"rgba(20,83,45,.35)"};
