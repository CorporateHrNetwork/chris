import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../services/api";

const money = (value, currency = "NGN") => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString()}`;
  }
};
const monthName = (monthKey) => {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ""))) return "—";
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
};

export default function ZermattLeaveAllowance() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/api/benefits/leave-allowance")
      .then((response) => { if (active) { setData(response?.data || null); setError(""); } })
      .catch((err) => { if (active) setError(err?.message || "Unable to load Leave Allowance register."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => {
    const source = data?.rows || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((row) => [row.employeeNumber, row.employeeName, row.locationName, row.status, row.employmentType, row.eligibilityStatus, row.nextDueMonth]
      .filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [data, query]);

  const policy = data?.policy || {};
  const summary = data?.summary || {};
  const settings = data?.settings || {};

  return <section style={pageStyle}>
    <div style={headerActions}>
      <button type="button" style={backButton} onClick={() => navigate("/benefits")}>← Benefits Dashboard</button>
      <button type="button" style={settingsButton} onClick={() => navigate("/benefits?workspace=leave-allowance-settings")}>Leave Allowance Settings</button>
    </div>
    <div style={eyebrow}>ZERMATT BENEFITS</div>
    <h1 style={titleStyle}>Leave Allowance</h1>
    <p style={leadStyle}>Only Full-Time employees are eligible. For eligible employees, Leave Allowance is paid through payroll in the original entry month after the first completed year of service, then in that same month annually. Other Employment Types remain visible in this register but are marked Not Eligible.</p>

    <div style={cards}>
      <Metric label="Payroll Status" value={loading ? "—" : settings.enabled === false ? "Paused" : "Enabled"} />
      <Metric label="Eligible Type" value="Full-Time only" />
      <Metric label="Eligible Employees" value={loading ? "—" : summary.employmentTypeEligible ?? 0} />
      <Metric label="Not Eligible" value={loading ? "—" : summary.employmentTypeIneligible ?? 0} />
      <Metric label="Approved Payments" value={loading ? "—" : summary.visibleApprovedPayments ?? 0} />
      <Metric label="Approved Amount" value={loading ? "—" : money(summary.visibleApprovedAmount || 0)} />
    </div>

    <section style={panelStyle}>
      <h2 style={panelTitle}>Zermatt Leave Allowance Policy</h2>
      <div style={policyGrid}>
        <Policy label="Eligible Employment Type" value="Full-Time only. Part-time, Expatriate and NYSC/Internship employees are not eligible." />
        <Policy label="Eligibility timing" value={policy.eligibility || "First payment after one completed year of service in the employee entry month; annual recurrence thereafter."} />
        <Policy label="Calculation" value={policy.formula || "Basic Monthly Salary × 12 × 10%"} />
        <Policy label="Tax treatment" value="After-tax / Non-taxable. Leave Allowance does not increase PAYE chargeable income." />
        <Policy label="Payroll treatment" value={policy.payrollTreatment || "Paid with salary in the eligible payroll period and separately identified on the approved payslip."} />
        <Policy label="Control" value="An approved entitlement year cannot be paid twice. Employment Type changes apply to subsequent payroll processing without rewriting approved history." />
      </div>
    </section>

    <section style={panelStyle}>
      <div style={toolbar}>
        <div><h2 style={{ ...panelTitle, marginBottom: 4 }}>Employee Leave Allowance Register</h2><div style={subtle}>Eligibility is driven by the authoritative current Employment Type. Projected amount is calculated only for Full-Time employees.</div></div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, branch, type or eligibility" style={searchInput} />
      </div>
      {error && <div style={errorStyle}>{error}</div>}
      {loading ? <div style={loadingStyle}>Loading Leave Allowance register…</div> : <div style={tableWrap}>
        <table style={tableStyle}>
          <thead><tr>{['Employee','Branch','Employment Type','Eligibility','Hire Date','First Due','Next Due','Monthly Basic','Projected Allowance','Last Approved Payment','Employee Status'].map((heading) => <th key={heading} style={thStyle}>{heading}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => {
              const eligibleType = row.eligibilityStatus === "ELIGIBLE_EMPLOYMENT_TYPE";
              return <tr key={row.employeeId}>
                <td style={tdStrong}>{row.employeeNumber} — {row.employeeName}</td>
                <td style={tdStyle}>{row.locationName || "—"}</td>
                <td style={tdStyle}>{row.employmentType || "—"}</td>
                <td style={tdStyle}><span style={eligibleType ? eligibleBadge : ineligibleBadge}>{eligibleType ? "Eligible Type" : "Not Eligible"}</span><div style={tiny}>{row.eligibilityReason}</div></td>
                <td style={tdStyle}>{row.hireDate || "—"}</td>
                <td style={tdStyle}>{eligibleType ? monthName(row.firstDueMonth) : "—"}</td>
                <td style={tdStyle}>{eligibleType ? monthName(row.nextDueMonth) : "—"}</td>
                <td style={tdStyle}>{eligibleType ? money(row.monthlyBasicSalary, row.currency) : "—"}</td>
                <td style={tdStrong}>{eligibleType ? money(row.projectedLeaveAllowance, row.currency) : "Not eligible"}</td>
                <td style={tdStyle}>{row.lastPayment ? `${row.lastPayment.periodCode} · ${money(row.lastPayment.amount, row.currency)}` : "Not yet paid"}</td>
                <td style={tdStyle}><span style={badge}>{String(row.status || "—").replaceAll("_", " ")}</span></td>
              </tr>;
            })}
            {!rows.length && <tr><td colSpan={11} style={emptyStyle}>No employees match the current filter.</td></tr>}
          </tbody>
        </table>
      </div>}
    </section>
  </section>;
}

function Metric({ label, value }) { return <div style={metricCard}><div style={metricLabel}>{label}</div><strong style={metricValue}>{value}</strong></div>; }
function Policy({ label, value }) { return <div style={policyCard}><div style={metricLabel}>{label}</div><div style={{ lineHeight: 1.6 }}>{value}</div></div>; }

const pageStyle={maxWidth:1500,margin:"0 auto",color:"#F7FAF8"};
const headerActions={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"};
const backButton={border:0,background:"transparent",color:"#D4AF37",fontWeight:900,cursor:"pointer",padding:"0 0 14px"};
const settingsButton={border:"1px solid rgba(212,175,55,.45)",background:"rgba(212,175,55,.08)",color:"#F7D66A",borderRadius:9,fontWeight:900,cursor:"pointer",padding:"9px 12px"};
const eyebrow={color:"#D4AF37",fontSize:11,fontWeight:900,letterSpacing:".14em"}; const titleStyle={margin:"6px 0",fontSize:32}; const leadStyle={color:"#C7D3CC",lineHeight:1.65,maxWidth:1100,marginBottom:22};
const cards={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}; const metricCard={padding:16,borderRadius:14,border:"1px solid rgba(212,175,55,.35)",background:"rgba(7,49,32,.75)"}; const metricLabel={color:"#9FB7AA",fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:".06em",marginBottom:7}; const metricValue={color:"#F7D66A",fontSize:20};
const panelStyle={marginTop:18,padding:20,border:"1px solid rgba(212,175,55,.4)",borderRadius:15,background:"linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96))"}; const panelTitle={margin:"0 0 14px",fontSize:18,color:"#D4AF37"}; const policyGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}; const policyCard={padding:14,border:"1px solid rgba(255,255,255,.08)",borderRadius:10,color:"#C7D3CC",background:"rgba(255,255,255,.03)"};
const toolbar={display:"flex",justifyContent:"space-between",gap:16,alignItems:"end",flexWrap:"wrap",marginBottom:14}; const subtle={color:"#9FB7AA",fontSize:12,lineHeight:1.5,maxWidth:850}; const searchInput={minWidth:300,padding:"10px 12px",borderRadius:9,border:"1px solid rgba(212,175,55,.35)",background:"rgba(255,255,255,.06)",color:"#F7FAF8"};
const tableWrap={width:"100%",overflowX:"auto"}; const tableStyle={width:"100%",minWidth:1450,borderCollapse:"collapse"}; const thStyle={padding:10,textAlign:"left",borderBottom:"1px solid rgba(212,175,55,.35)",color:"#D4AF37",fontSize:11,whiteSpace:"nowrap"}; const tdStyle={padding:10,borderBottom:"1px solid rgba(255,255,255,.08)",color:"#C7D3CC",fontSize:12,verticalAlign:"top"}; const tdStrong={...tdStyle,fontWeight:900,color:"#F7FAF8"};
const badge={display:"inline-block",padding:"4px 7px",borderRadius:999,border:"1px solid rgba(212,175,55,.35)",color:"#F7D66A",fontSize:10,fontWeight:900}; const eligibleBadge={...badge,color:"#86EFAC",border:"1px solid rgba(134,239,172,.45)"}; const ineligibleBadge={...badge,color:"#FCA5A5",border:"1px solid rgba(252,165,165,.45)"}; const tiny={fontSize:9,marginTop:5,color:"#9FB7AA",maxWidth:220,lineHeight:1.4};
const emptyStyle={...tdStyle,textAlign:"center",padding:24}; const errorStyle={padding:12,borderRadius:10,background:"rgba(127,29,29,.35)",border:"1px solid rgba(248,113,113,.45)",color:"#FCA5A5"}; const loadingStyle={padding:18,color:"#C7D3CC"};
