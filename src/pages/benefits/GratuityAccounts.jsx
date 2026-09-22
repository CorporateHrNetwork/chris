import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";

function money(value) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(value || 0));
}

function csv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function GratuityAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const result = await apiRequest("/api/eosb/accounts");
      setAccounts(result.data || []);
    } catch (requestError) {
      setError(requestError.message || "Unable to load EoSB accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter((row) => [
      row.employee?.employeeNumber,
      row.employee?.name,
      row.employee?.location,
      row.employee?.department,
      row.employee?.designation,
    ].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [accounts, search]);

  const summary = useMemo(() => ({
    eligible: accounts.filter((row) => row.eosb?.eligible).length,
    ready: accounts.filter((row) => row.eosb?.calculationReady).length,
    total: accounts.reduce((sum, row) => sum + Number(row.eosb?.accruedValue || 0), 0),
    collateral: accounts.reduce((sum, row) => sum + Number(row.loanCollateral?.availableCollateral || 0), 0),
  }), [accounts]);

  function exportCsv() {
    const header = ["Employee Number","Employee Name","Employment Type","Status","Branch","Department","Designation","Service Start","Calculation Date","Service Days","Equivalent Months","Gross Monthly Salary","Factor %","EoSB Value","Existing Loan Exposure","Available Loan Collateral","Collateral Mode","Calculation Ready"];
    const rows = visible.map((row) => [
      row.employee.employeeNumber,row.employee.name,row.employee.employmentType,row.employee.status,row.employee.location,row.employee.department,row.employee.designation,
      row.service.serviceStartDate,row.service.calculationDate,row.service.serviceDays,row.service.equivalentMonths,row.salary?.grossMonthlySalary ?? "",row.policy.factorPercent,
      row.eosb.accruedValue,row.loanCollateral.existingLoanExposure,row.loanCollateral.availableCollateral,row.loanCollateral.mode,row.eosb.calculationReady ? "YES" : "NO",
    ]);
    const content = "\uFEFF" + [header, ...rows].map((row) => row.map(csv).join(",")).join("\r\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CHRiS-Zermatt-EoSB-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={page}>
      <section style={hero}>
        <div style={eyebrow}>BENEFITS · END OF SERVICE BENEFIT</div>
        <h1 style={title}>EoSB / Gratuity Accounts</h1>
        <p style={muted}>Zermatt gratuity is accrued in arrears using actual service days on a fixed 30-day month basis.</p>
        <div style={formula}>Gross Monthly Salary × (Actual Service Days ÷ 30) × 7.5%</div>
      </section>

      {error ? <div style={errorBox}>{error}</div> : null}

      <section style={metrics}>
        <Metric label="Eligible Employees" value={summary.eligible} />
        <Metric label="Calculation Ready" value={summary.ready} />
        <Metric label="Total EoSB Liability" value={money(summary.total)} />
        <Metric label="Available Loan Collateral" value={money(summary.collateral)} />
      </section>

      <section style={panel}>
        <div style={toolbar}>
          <input style={input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, branch, department or designation" />
          <button type="button" style={secondary} onClick={exportCsv} disabled={loading}>Export CSV</button>
          <button type="button" style={secondary} onClick={() => window.print()} disabled={loading}>Print</button>
        </div>

        {loading ? <p style={muted}>Loading EoSB accounts…</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead><tr><th>Employee</th><th>Service</th><th>Gross Salary</th><th>EoSB</th><th>Loan Collateral</th><th>Mode</th><th></th></tr></thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.employee.employeeNumber}>
                    <td><strong>{row.employee.name}</strong><br/><small>{row.employee.employeeNumber} · {row.employee.employmentType || "—"}<br/>{row.employee.location || "—"}</small></td>
                    <td>{row.service.serviceDays} days<br/><small>{row.service.equivalentMonths} fixed-month equivalents</small></td>
                    <td>{row.salary ? money(row.salary.grossMonthlySalary) : <span style={warning}>Missing rate</span>}</td>
                    <td><strong>{money(row.eosb.accruedValue)}</strong><br/><small>{row.eosb.eligible ? "Eligible" : "Not eligible"}</small></td>
                    <td>{money(row.loanCollateral.availableCollateral)}<br/><small>Exposure {money(row.loanCollateral.existingLoanExposure)}</small></td>
                    <td><span style={badge}>{row.loanCollateral.mode === "EOSB" ? "EoSB-backed" : "Surety required"}</span></td>
                    <td><button type="button" style={linkButton} onClick={() => setSelected(row)}>Statement</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? <Statement account={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function Statement({ account, onClose }) {
  return (
    <div style={overlay}>
      <div style={statement}>
        <div style={statementHeader}>
          <div><div style={eyebrow}>CHRiS · ZERMATT LIQUOR LIMITED</div><h2 style={{ margin: "6px 0 0" }}>EoSB Account Statement</h2></div>
          <button type="button" style={secondary} onClick={onClose}>Close</button>
        </div>
        <div style={statementGrid}>
          <Item label="Employee" value={`${account.employee.name} (${account.employee.employeeNumber})`} />
          <Item label="Employment Type" value={account.employee.employmentType || "—"} />
          <Item label="Branch" value={account.employee.location || "—"} />
          <Item label="Department" value={account.employee.department || "—"} />
          <Item label="Designation" value={account.employee.designation || "—"} />
          <Item label="Service Start" value={account.service.serviceStartDate || "—"} />
          <Item label="Calculation Date" value={account.service.calculationDate || "—"} />
          <Item label="Actual Service Days" value={account.service.serviceDays} />
          <Item label="Fixed-Month Equivalent" value={account.service.equivalentMonths} />
          <Item label="Gross Monthly Salary" value={account.salary ? money(account.salary.grossMonthlySalary) : "Missing effective salary rate"} />
          <Item label="Gratuity Factor" value="7.5%" />
          <Item label="Accrued EoSB" value={money(account.eosb.accruedValue)} />
          <Item label="Existing Loan Exposure" value={money(account.loanCollateral.existingLoanExposure)} />
          <Item label="Available Loan Collateral" value={money(account.loanCollateral.availableCollateral)} />
          <Item label="Loan Access Basis" value={account.loanCollateral.mode === "EOSB" ? "EoSB collateral" : "Internal employee surety required"} />
        </div>
        {account.eosb.missingReason ? <div style={warningBox}>{account.eosb.missingReason}</div> : null}
        {account.loanCollateral.reason ? <div style={note}>{account.loanCollateral.reason}</div> : null}
        <div style={formula}>{account.policy.formula}</div>
        <div style={{ marginTop: 16 }}><button type="button" style={primary} onClick={() => window.print()}>Print Statement</button></div>
      </div>
    </div>
  );
}

function Item({ label, value }) { return <div style={item}><span style={itemLabel}>{label}</span><strong>{value}</strong></div>; }
function Metric({ label, value }) { return <div style={metric}><span style={eyebrow}>{label}</span><strong style={metricValue}>{value}</strong></div>; }

const page={color:"#F7FAF8"};
const hero={padding:"22px 24px",marginBottom:18,border:"1px solid rgba(212,175,55,.32)",borderRadius:16,background:"linear-gradient(135deg,rgba(7,60,39,.82),rgba(3,24,16,.94))"};
const eyebrow={color:"#F2CF57",fontSize:10,fontWeight:900,letterSpacing:".13em"};
const title={margin:"7px 0 6px",fontSize:29,color:"#FFFFFF"};
const muted={margin:0,color:"#AEC2B6",lineHeight:1.55};
const formula={marginTop:12,padding:"10px 12px",borderRadius:8,background:"rgba(212,175,55,.08)",border:"1px solid rgba(212,175,55,.24)",color:"#F7DF8A",fontWeight:800,fontSize:12};
const metrics={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:18};
const metric={padding:16,borderRadius:12,background:"rgba(255,255,255,.035)",border:"1px solid rgba(255,255,255,.08)"};
const metricValue={display:"block",marginTop:8,fontSize:22,color:"#FFFFFF"};
const panel={padding:18,borderRadius:14,background:"rgba(4,13,8,.72)",border:"1px solid rgba(8,122,67,.28)"};
const toolbar={display:"flex",gap:9,flexWrap:"wrap",marginBottom:15};
const input={flex:"1 1 320px",padding:"10px 12px",borderRadius:8,border:"1px solid rgba(82,145,110,.38)",background:"#07170F",color:"#F7FAF8"};
const secondary={padding:"9px 12px",borderRadius:8,border:"1px solid rgba(212,175,55,.38)",background:"rgba(212,175,55,.08)",color:"#F4D66B",fontWeight:800,cursor:"pointer"};
const primary={...secondary,background:"#087A43",color:"#FFFFFF",border:"none"};
const table={width:"100%",borderCollapse:"collapse",fontSize:12,color:"#E9F3ED"};
const badge={display:"inline-block",padding:"4px 7px",borderRadius:999,background:"rgba(212,175,55,.11)",color:"#F4D66B",fontWeight:900,fontSize:10};
const warning={color:"#F4D66B",fontWeight:800};
const linkButton={border:0,background:"transparent",color:"#F4D66B",fontWeight:850,cursor:"pointer"};
const errorBox={marginBottom:16,padding:"12px 14px",borderRadius:9,background:"rgba(185,28,28,.16)",border:"1px solid rgba(248,113,113,.35)",color:"#FCA5A5"};
const overlay={position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",padding:18,overflowY:"auto"};
const statement={width:"min(900px,96vw)",maxHeight:"92vh",overflowY:"auto",padding:24,borderRadius:16,background:"#07170F",border:"1px solid rgba(212,175,55,.38)",boxShadow:"0 25px 70px rgba(0,0,0,.45)"};
const statementHeader={display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",marginBottom:18};
const statementGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10};
const item={display:"grid",gap:4,padding:12,borderRadius:9,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)"};
const itemLabel={color:"#8FA99B",fontSize:10,fontWeight:800,textTransform:"uppercase"};
const warningBox={marginTop:14,padding:12,borderRadius:8,background:"rgba(180,83,9,.15)",border:"1px solid rgba(245,158,11,.28)",color:"#FCD34D"};
const note={marginTop:12,color:"#AEC2B6",fontSize:12};
