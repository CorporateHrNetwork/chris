import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

const money = (value, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0));

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

function Field({ label, value }) {
  return <div style={field}><span style={fieldLabel}>{label}</span><strong style={fieldValue}>{value ?? "—"}</strong></div>;
}

function Card({ title, children, action }) {
  return (
    <section style={card}>
      <div style={cardHead}><h2 style={cardTitle}>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export default function EmployeeSelfService() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [leave, setLeave] = useState(null);
  const [gratuity, setGratuity] = useState(null);
  const [news, setNews] = useState([]);
  const [selectedPolicy, setSelectedPolicy] = useState("");
  const [active, setActive] = useState("profile");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const [overviewResult, payslipResult, leaveResult, gratuityResult, newsResult] = await Promise.all([
        apiRequest("/api/ess/overview"),
        apiRequest("/api/ess/payslips"),
        apiRequest("/api/ess/leave"),
        apiRequest("/api/ess/gratuity"),
        apiRequest("/api/ess/news"),
      ]);
      setOverview(overviewResult?.data || null);
      setPayslips(payslipResult?.data || []);
      setLeave(leaveResult?.data || null);
      setGratuity(gratuityResult?.data || null);
      setNews(newsResult?.data || []);
      setError("");
    } catch (requestError) {
      setError(requestError?.message || "Unable to load Employee Self Service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedPolicy) return;
    apiRequest(`/api/ess/leave?leavePolicyId=${encodeURIComponent(selectedPolicy)}&leaveYear=${new Date().getFullYear()}`)
      .then((result) => setLeave(result?.data || null))
      .catch((requestError) => setError(requestError?.message || "Unable to load selected leave ledger."));
  }, [selectedPolicy]);

  const logout = () => {
    const organization = JSON.parse(localStorage.getItem("chris_organization") || sessionStorage.getItem("chris_organization") || "{}");
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem("chris_token");
      storage.removeItem("chris_user");
      storage.removeItem("chris_organization");
    }
    navigate(`/login?organization=${encodeURIComponent(organization.slug || "zermatt-liquor-limited")}`, { replace: true });
  };

  const identity = overview?.identity || {};
  const employment = overview?.employment || {};
  const training = overview?.training || {};
  const latest = overview?.payroll?.latestPayslip || null;
  const relief = overview?.payroll?.rentRelief || null;

  const policies = leave?.policies || [];
  const ledger = leave?.ledger || null;
  const tabs = useMemo(() => [
    ["profile", "My Profile"],
    ["payroll", "Payroll"],
    ["payslips", "Payslips"],
    ["leave", "Leave Ledger"],
    ["training", "Training"],
    ["news", "Zermatt News"],
    ["gratuity", "Gratuity Account"],
  ], []);

  if (loading) {
    return <div style={page}><div style={loadingBox}>Loading your CHRiS Employee Self Service…</div></div>;
  }

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <div style={eyebrow}>ZERMMATT LIQUOR LIMITED · EMPLOYEE SELF SERVICE</div>
          <h1 style={title}>Welcome, {identity.name || "Employee"}</h1>
          <div style={subtitle}>{identity.employeeNumber || "—"} · {employment.designation?.name || "—"} · {employment.location?.name || "—"}</div>
        </div>
        <button type="button" style={logoutButton} onClick={logout}>Sign Out</button>
      </header>

      {error && <div style={errorBox}>{error}</div>}

      <nav style={tabsStyle} aria-label="Employee Self Service sections">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setActive(key)} style={{ ...tabButton, ...(active === key ? activeTab : {}) }}>
            {label}
          </button>
        ))}
      </nav>

      {active === "profile" && (
        <>
          <Card title="Personal Profile">
            <div style={grid}>
              <Field label="Employee Number" value={identity.employeeNumber} />
              <Field label="Full Name" value={identity.name} />
              <Field label="Work Email" value={identity.email} />
              <Field label="Phone" value={identity.phone} />
              <Field label="Gender" value={identity.gender} />
              <Field label="Employment Status" value={identity.status} />
            </div>
          </Card>
          <Card title="Employment Information">
            <div style={grid}>
              <Field label="Hire Date" value={fmtDate(employment.hireDate)} />
              <Field label="Current Service Start" value={fmtDate(employment.currentServiceStartDate)} />
              <Field label="Confirmation Date" value={fmtDate(employment.confirmationDate)} />
              <Field label="Employment Type" value={employment.employmentType} />
              <Field label="Department" value={employment.department?.name} />
              <Field label="Designation" value={employment.designation?.name} />
              <Field label="Employment Level" value={employment.employmentLevel ? `${employment.employmentLevel.code} · ${employment.employmentLevel.name}` : "—"} />
              <Field label="Branch / Location" value={employment.location?.name} />
              <Field label="Cost Centre" value={employment.costCentre ? `${employment.costCentre.code} · ${employment.costCentre.name}` : "—"} />
              <Field label="Line Manager" value={employment.lineManager?.name} />
            </div>
          </Card>
        </>
      )}

      {active === "payroll" && (
        <Card title="My Payroll">
          <p style={note}>Only your own approved payroll information is available in Employee Self Service.</p>
          <div style={metrics}>
            <div style={metric}><span>Latest Gross Pay</span><strong>{latest ? money(latest.grossPay, latest.currency) : "—"}</strong></div>
            <div style={metric}><span>Latest Net Pay</span><strong>{latest ? money(latest.netPreview, latest.currency) : "—"}</strong></div>
            <div style={metric}><span>Approved Payslips</span><strong>{overview?.payroll?.approvedPayslipCount ?? 0}</strong></div>
            <div style={metric}><span>Current Rent Relief</span><strong>{relief ? money(relief.eligibleReliefAmount) : "—"}</strong></div>
          </div>
          {latest && <div style={grid}><Field label="Payroll Period" value={latest.periodName || latest.periodCode} /><Field label="Pay Date" value={fmtDate(latest.payDate)} /><Field label="Statutory Status" value={latest.statutoryStatus} /><Field label="Payroll Approved" value={fmtDate(latest.approvedAt)} /></div>}
        </Card>
      )}

      {active === "payslips" && (
        <Card title="My Payslips">
          {!payslips.length ? <p style={note}>No approved payslips are available yet.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead><tr><th>Period</th><th>Gross Pay</th><th>Deductions</th><th>Loan/Advance</th><th>Net Pay</th><th>Pay Date</th></tr></thead>
                <tbody>{payslips.map((row) => <tr key={row.id}><td>{row.periodName || row.periodCode}</td><td>{money(row.grossPay,row.currency)}</td><td>{money(row.deductions,row.currency)}</td><td>{money(Number(row.loanRecovery||0)+Number(row.advanceRecovery||0),row.currency)}</td><td><strong>{money(row.netPreview,row.currency)}</strong></td><td>{fmtDate(row.payDate)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {active === "leave" && (
        <Card title="My Leave Ledger" action={
          policies.length ? <select style={select} value={selectedPolicy} onChange={(event) => setSelectedPolicy(event.target.value)}><option value="">Select leave type</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.leaveType?.name || policy.name}</option>)}</select> : null
        }>
          {!selectedPolicy ? <p style={note}>Select a leave type to view your entitlement, usage and transaction history.</p> : !ledger ? <p style={note}>No leave ledger is available for the selected policy.</p> : (
            <>
              <div style={metrics}>
                <div style={metric}><span>Total Entitlement</span><strong>{ledger.totalEntitlement} {ledger.unit}</strong></div>
                <div style={metric}><span>Used</span><strong>{ledger.used} {ledger.unit}</strong></div>
                <div style={metric}><span>Pending / Committed</span><strong>{ledger.pending} {ledger.unit}</strong></div>
                <div style={metric}><span>Available</span><strong>{ledger.available} {ledger.unit}</strong></div>
              </div>
              <div style={{ overflowX: "auto" }}><table style={table}><thead><tr><th>Date</th><th>Status</th><th>Units</th><th>From</th><th>To</th></tr></thead><tbody>{(ledger.history?.requests || []).map((row) => <tr key={row.id}><td>{fmtDate(row.submittedAt || row.createdAt)}</td><td>{row.status}</td><td>{row.requestedUnits}</td><td>{fmtDate(row.startDate)}</td><td>{fmtDate(row.endDate)}</td></tr>)}</tbody></table></div>
            </>
          )}
        </Card>
      )}

      {active === "training" && (
        <Card title="My Training">
          <p style={note}>{training.message || "Training records are not yet connected."}</p>
          <div style={metrics}><div style={metric}><span>Assigned</span><strong>{training.assigned?.length || 0}</strong></div><div style={metric}><span>Completed</span><strong>{training.completed?.length || 0}</strong></div></div>
        </Card>
      )}

      {active === "news" && (
        <Card title="Zermatt News & Opportunities">
          {!news.length ? <p style={note}>There are no published internal updates at the moment.</p> : (
            <div style={{ display: "grid", gap: 12 }}>
              {news.map((item) => (
                <article key={item.id} style={newsItem}>
                  <div style={newsMeta}>
                    <span style={newsCategory}>{String(item.category || "ANNOUNCEMENT").replaceAll("_"," ")}</span>
                    {item.isPinned ? <span style={pinned}>PINNED</span> : null}
                    <span>{fmtDate(item.publishAt || item.createdAt)}</span>
                  </div>
                  <h3 style={newsTitle}>{item.title}</h3>
                  {item.summary ? <p style={newsSummary}>{item.summary}</p> : null}
                  <div style={newsBody}>{item.body}</div>
                </article>
              ))}
            </div>
          )}
        </Card>
      )}

      {active === "gratuity" && (
        <Card title="My Gratuity Account">
          {!gratuity?.eligibleForEmployeeView ? (
            <div style={lockedBox}><strong>Available after 12 completed months</strong><p>{gratuity?.message || "Your Gratuity Account is not yet available."}</p><small>Service start: {fmtDate(gratuity?.serviceStartDate)}</small></div>
          ) : (
            <>
              <div style={metrics}>
                <div style={metric}><span>Accrued Gratuity</span><strong>{money(gratuity.eosb?.accruedValue, gratuity.salary?.currency || "NGN")}</strong></div>
                <div style={metric}><span>Service Days</span><strong>{gratuity.service?.serviceDays ?? "—"}</strong></div>
                <div style={metric}><span>Equivalent Months</span><strong>{gratuity.service?.equivalentMonths ?? "—"}</strong></div>
                <div style={metric}><span>Factor</span><strong>{gratuity.policy?.factorPercent ?? "—"}%</strong></div>
              </div>
              <p style={note}>{gratuity.policy?.formula}</p>
            </>
          )}
        </Card>
      )}

      <footer style={footer}>Powered by CHRiS · CorporateHr Network</footer>
    </div>
  );
}

const page={minHeight:"100vh",background:"#07110c",color:"#eef7f0",padding:"24px",fontFamily:"Arial,Helvetica,sans-serif"};
const header={maxWidth:1180,margin:"0 auto 18px",display:"flex",justifyContent:"space-between",gap:18,alignItems:"center",padding:"24px",border:"1px solid rgba(212,175,55,.35)",borderRadius:18,background:"linear-gradient(145deg,#0b281a,#07140d)"};
const eyebrow={fontSize:11,fontWeight:900,letterSpacing:1.5,color:"#d4af37"};
const title={margin:"6px 0",fontSize:"clamp(26px,4vw,42px)",color:"#fff"};
const subtitle={color:"#b7c8be",fontSize:14};
const logoutButton={border:"1px solid #d4af37",background:"transparent",color:"#f4d76a",padding:"10px 15px",borderRadius:9,fontWeight:800,cursor:"pointer"};
const tabsStyle={maxWidth:1180,margin:"0 auto 18px",display:"flex",gap:8,overflowX:"auto",paddingBottom:4};
const tabButton={whiteSpace:"nowrap",padding:"11px 14px",borderRadius:9,border:"1px solid #315b43",background:"#0a2117",color:"#c9d8cf",fontWeight:800,cursor:"pointer"};
const activeTab={background:"#d4af37",color:"#07110c",borderColor:"#d4af37"};
const card={maxWidth:1180,margin:"0 auto 18px",padding:"20px",background:"#0b1c14",border:"1px solid #284c38",borderRadius:16,boxShadow:"0 14px 38px rgba(0,0,0,.18)"};
const cardHead={display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:16};
const cardTitle={margin:0,fontSize:20,color:"#f5d76c"};
const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12};
const field={padding:"13px",borderRadius:10,background:"#07150f",border:"1px solid #203d2d",display:"grid",gap:5};
const fieldLabel={fontSize:11,textTransform:"uppercase",letterSpacing:.7,color:"#8eaa99",fontWeight:800};
const fieldValue={fontSize:14,color:"#f4f8f5"};
const metrics={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:18};
const metric={padding:"15px",border:"1px solid #315b43",borderRadius:11,background:"#082016",display:"grid",gap:7};
const note={color:"#adc0b4",lineHeight:1.6};
const table={width:"100%",borderCollapse:"collapse",fontSize:13};
const select={padding:"10px 12px",background:"#07150f",color:"#fff",border:"1px solid #406d51",borderRadius:8,minWidth:230};
const lockedBox={padding:20,border:"1px dashed #8b7130",borderRadius:12,background:"rgba(212,175,55,.06)",color:"#d8e2dc"};
const errorBox={maxWidth:1180,margin:"0 auto 16px",padding:13,borderRadius:10,background:"#4a1717",border:"1px solid #8b3434",color:"#ffd7d7"};
const loadingBox={maxWidth:700,margin:"15vh auto",padding:30,textAlign:"center",color:"#f4d76a"};
const footer={maxWidth:1180,margin:"30px auto 0",textAlign:"center",fontSize:12,color:"#7f9989"};

const newsItem={padding:"16px",border:"1px solid #2c523d",borderRadius:12,background:"#07150f"};
const newsMeta={display:"flex",gap:8,flexWrap:"wrap",fontSize:11,color:"#8fa99a",alignItems:"center"};
const newsCategory={fontWeight:900,color:"#f2d166",letterSpacing:.6};
const pinned={fontWeight:900,color:"#07110c",background:"#d4af37",borderRadius:999,padding:"3px 7px"};
const newsTitle={margin:"9px 0 6px",fontSize:18,color:"#fff"};
const newsSummary={margin:"0 0 8px",color:"#bfd0c6",fontWeight:700};
const newsBody={whiteSpace:"pre-wrap",lineHeight:1.65,color:"#dce8e1"};
