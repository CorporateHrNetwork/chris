import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDownload, apiRequest, saveDownloadedBlob } from "../../services/api";

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
  const [referenceFile, setReferenceFile] = useState(null);
  const [referencePreview, setReferencePreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadRegister = async () => {
    const response = await apiRequest("/api/benefits/leave-allowance");
    setData(response?.data || null);
    return response?.data || null;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const response = await apiRequest("/api/benefits/leave-allowance");
        if (active) { setData(response?.data || null); setError(""); }
      } catch (err) {
        if (active) setError(err?.message || "Unable to load Leave Allowance register.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const downloadReferenceTemplate = async () => {
    try {
      setBusy("download-reference");
      setError("");
      const file = await apiDownload("/api/benefits/leave-allowance/reference-template");
      saveDownloadedBlob(file);
    } catch (err) {
      setError(err?.message || "Unable to download the Leave Allowance reference template.");
    } finally {
      setBusy("");
    }
  };

  const previewReference = async () => {
    if (!referenceFile) return;
    try {
      setBusy("preview-reference");
      setError("");
      setMessage("");
      const body = new FormData();
      body.append("file", referenceFile);
      const response = await apiRequest("/api/benefits/leave-allowance/reference-preview", { method: "POST", body });
      setReferencePreview(response?.data || null);
    } catch (err) {
      setReferencePreview(null);
      setError(err?.message || "Unable to validate the Leave Allowance reference workbook.");
    } finally {
      setBusy("");
    }
  };

  const importReference = async () => {
    if (!referenceFile || !referencePreview?.importAllowed) return;
    try {
      setBusy("import-reference");
      setError("");
      setMessage("");
      const body = new FormData();
      body.append("file", referenceFile);
      const response = await apiRequest("/api/benefits/leave-allowance/reference-import", { method: "POST", body });
      setMessage(response?.message || "Leave Allowance reference imported.");
      setReferencePreview(null);
      setReferenceFile(null);
      await loadRegister();
    } catch (err) {
      setError(err?.message || "Unable to import the Leave Allowance reference workbook.");
    } finally {
      setBusy("");
    }
  };

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
    <p style={leadStyle}>Zermatt Leave Allowance retains the approved Basic Salary × 12 × 10% formula. The salary basis is the employee's prior-December gross salary imported as the authoritative reference; CHRiS derives the December Basic Salary from that gross, calculates the annual Leave Allowance, and applies the existing eligibility/payment timing rules. Without the salary reference, the payroll Leave Allowance column remains blank.</p>

    <div style={cards}>
      <Metric label="Payroll Status" value={loading ? "—" : settings.enabled === false ? "Paused" : "Enabled"} />
      <Metric label="Policy Mode" value="Reference Import" />
      <Metric label="References Loaded" value={loading ? "—" : summary.referencesLoaded ?? 0} />
      <Metric label="Employees Referenced" value={loading ? "—" : summary.employeesWithReference ?? 0} />
      <Metric label="Awaiting Reference" value={loading ? "—" : summary.employeesAwaitingReference ?? 0} />
      <Metric label="Referenced Amount" value={loading ? "—" : money(summary.totalReferencedAmount || 0)} />
    </div>

    {!loading && <div style={payableNote}>Payroll Leave Allowance remains blank unless an ACTIVE employee/month reference exists. Imported references are the sole payroll authority for this benefit.</div>}

    <section style={panelStyle}>
      <h2 style={panelTitle}>Zermatt Leave Allowance Policy</h2>
      <div style={policyGrid}>
        <Policy label="Policy mode" value="Reference salary + CHRiS formula. The spreadsheet supplies salary authority; CHRiS performs the calculation." />
        <Policy label="Salary basis" value="Last December gross salary. CHRiS derives Basic Salary using the approved salary structure." />
        <Policy label="Payment timing" value="Existing Zermatt rule remains: payable in the employee entry/anniversary month after qualifying service, using the prior-December salary reference." />
        <Policy label="Tax treatment" value="After-tax / Non-taxable. Leave Allowance does not increase PAYE chargeable income." />
        <Policy label="Payroll treatment" value="CHRiS calculates Reference December Basic × 12 × 10% and pulls the calculated amount into the employee's eligible payroll month; it remains separately shown on the payslip." />
        <Policy label="Control" value="Employee + Reference December Year is the salary authority. Re-importing the same employee/year retires the prior active reference and creates a new audited authority." />
      </div>
    </section>

    <section style={panelStyle}>
      <div style={toolbar}>
        <div>
          <h2 style={{ ...panelTitle, marginBottom: 4 }}>Leave Allowance Reference Import</h2>
          <div style={subtle}>Import the authoritative December salary schedule containing Employee Number, Reference December Year and Last December Gross Salary. CHRiS will derive Basic Salary and calculate Leave Allowance before import. Validate the workbook before confirming import.</div>
        </div>
      </div>
      <div style={importControls}>
        <button type="button" style={settingsButton} disabled={busy === "download-reference"} onClick={downloadReferenceTemplate}>{busy === "download-reference" ? "Preparing…" : "Download Template"}</button>
        <input type="file" accept=".xlsx,.xls" onChange={(event) => { setReferenceFile(event.target.files?.[0] || null); setReferencePreview(null); setMessage(""); }} />
        <button type="button" style={settingsButton} disabled={!referenceFile || busy === "preview-reference"} onClick={previewReference}>{busy === "preview-reference" ? "Validating…" : "Validate / Preview"}</button>
        <button type="button" style={importButton} disabled={!referenceFile || !referencePreview?.importAllowed || busy === "import-reference"} onClick={importReference}>{busy === "import-reference" ? "Importing…" : "Confirm Import"}</button>
      </div>
      {referencePreview && <div style={previewSummary}><strong>{referencePreview.totalRows} rows</strong> · {referencePreview.validRows} valid · {referencePreview.invalidRows} errors · {referencePreview.warningRows} warnings</div>}
      {referencePreview?.rows?.length > 0 && <div style={tableWrap}>
        <table style={{ ...tableStyle, minWidth: 1200 }}>
          <thead><tr>{["Row","Employee","Applicable Month","Reference December","Last December Gross","Derived December Basic","Calculated Leave Allowance","Status"].map((heading) => <th key={heading} style={thStyle}>{heading}</th>)}</tr></thead>
          <tbody>{referencePreview.rows.slice(0,100).map((row) => <tr key={row.rowNumber}>
            <td style={tdStyle}>{row.rowNumber}</td>
            <td style={tdStrong}>{row.employeeNumber}{row.employeeName ? " — " + row.employeeName : ""}</td>
            <td style={tdStyle}>{row.applicableMonth || "—"}</td>
            <td style={tdStyle}>{row.referenceDecemberYear || "—"}</td>
            <td style={tdStyle}>{row.referenceDecemberGross == null ? "—" : money(row.referenceDecemberGross)}</td>
            <td style={tdStyle}>{row.referenceDecemberBasic == null ? "—" : money(row.referenceDecemberBasic)}</td>
            <td style={tdStrong}>{row.leaveAllowanceAmount == null ? "—" : money(row.leaveAllowanceAmount)}</td>
            <td style={tdStyle}>{row.valid ? <span style={eligibleBadge}>VALID</span> : <><span style={ineligibleBadge}>ERROR</span><div style={tiny}>{(row.errors || []).join(" ")}</div></>}{row.warnings?.length ? <div style={tiny}>{row.warnings.join(" ")}</div> : null}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {message && <div style={successStyle}>{message}</div>}
    </section>

    <section style={panelStyle}>
      <div style={toolbar}>
        <div><h2 style={{ ...panelTitle, marginBottom: 4 }}>Employee Leave Allowance Register</h2><div style={subtle}>This register shows imported December salary references, CHRiS-calculated annual Leave Allowance values, and approved payment history.</div></div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, branch, type or reference" style={searchInput} />
      </div>
      {error && <div style={errorStyle}>{error}</div>}
      {loading ? <div style={loadingStyle}>Loading Leave Allowance register…</div> : <div style={tableWrap}>
        <table style={tableStyle}>
          <thead><tr>{["Employee","Branch","Employment Type","Policy","Hire Date","Applicable Month","Reference December","Last December Gross","Referenced Allowance","Source","Last Approved Payment","Employee Status"].map((heading) => <th key={heading} style={thStyle}>{heading}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => {
              const hasReference = Boolean(row.applicableMonth);
              return <tr key={row.employeeId}>
                <td style={tdStrong}>{row.employeeNumber} — {row.employeeName}</td>
                <td style={tdStyle}>{row.locationName || "—"}</td>
                <td style={tdStyle}>{row.employmentType || "—"}</td>
                <td style={tdStyle}><span style={hasReference ? eligibleBadge : badge}>{hasReference ? "Referenced" : "Awaiting Reference"}</span></td>
                <td style={tdStyle}>{row.hireDate || "—"}</td>
                <td style={tdStyle}>{row.applicableMonth || "—"}</td>
                <td style={tdStyle}>{row.referenceDecemberYear || "—"}</td>
                <td style={tdStyle}>{row.referenceDecemberGross == null ? "" : money(row.referenceDecemberGross, row.currency)}</td>
                <td style={tdStrong}>{row.referencedLeaveAllowance == null ? "" : money(row.referencedLeaveAllowance, row.currency)}</td>
                <td style={tdStyle}>{String(row.payableSource || "AWAITING_REFERENCE").replaceAll("_", " ")}</td>
                <td style={tdStyle}>{row.lastPayment ? row.lastPayment.periodCode + " · " + money(row.lastPayment.amount, row.currency) : "Not yet paid"}</td>
                <td style={tdStyle}><span style={badge}>{String(row.status || "—").replaceAll("_", " ")}</span></td>
              </tr>;
            })}
            {!rows.length && <tr><td colSpan={12} style={emptyStyle}>No employees match the current filter.</td></tr>}
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
const payableNote={marginTop:10,color:"#9FB7AA",fontSize:11,lineHeight:1.5};
const importControls={display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"};
const importButton={...settingsButton,background:"#D4AF37",color:"#07150E",border:"1px solid #D4AF37"};
const previewSummary={marginTop:12,padding:"10px 12px",borderRadius:9,border:"1px solid rgba(212,175,55,.3)",color:"#C7D3CC",background:"rgba(255,255,255,.03)"};
const successStyle={marginTop:12,padding:"11px 12px",borderRadius:9,border:"1px solid rgba(34,197,94,.4)",background:"rgba(34,197,94,.10)",color:"#BBF7D0"};
const panelStyle={marginTop:18,padding:20,border:"1px solid rgba(212,175,55,.4)",borderRadius:15,background:"linear-gradient(145deg,rgba(8,50,33,.94),rgba(3,20,13,.96))"}; const panelTitle={margin:"0 0 14px",fontSize:18,color:"#D4AF37"}; const policyGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}; const policyCard={padding:14,border:"1px solid rgba(255,255,255,.08)",borderRadius:10,color:"#C7D3CC",background:"rgba(255,255,255,.03)"};
const toolbar={display:"flex",justifyContent:"space-between",gap:16,alignItems:"end",flexWrap:"wrap",marginBottom:14}; const subtle={color:"#9FB7AA",fontSize:12,lineHeight:1.5,maxWidth:850}; const searchInput={minWidth:300,padding:"10px 12px",borderRadius:9,border:"1px solid rgba(212,175,55,.35)",background:"rgba(255,255,255,.06)",color:"#F7FAF8"};
const tableWrap={width:"100%",overflowX:"auto"}; const tableStyle={width:"100%",minWidth:1580,borderCollapse:"collapse"}; const thStyle={padding:10,textAlign:"left",borderBottom:"1px solid rgba(212,175,55,.35)",color:"#D4AF37",fontSize:11,whiteSpace:"nowrap"}; const tdStyle={padding:10,borderBottom:"1px solid rgba(255,255,255,.08)",color:"#C7D3CC",fontSize:12,verticalAlign:"top"}; const tdStrong={...tdStyle,fontWeight:900,color:"#F7FAF8"};
const badge={display:"inline-block",padding:"4px 7px",borderRadius:999,border:"1px solid rgba(212,175,55,.35)",color:"#F7D66A",fontSize:10,fontWeight:900}; const eligibleBadge={...badge,color:"#86EFAC",border:"1px solid rgba(134,239,172,.45)"}; const ineligibleBadge={...badge,color:"#FCA5A5",border:"1px solid rgba(252,165,165,.45)"}; const tiny={fontSize:9,marginTop:5,color:"#9FB7AA",maxWidth:220,lineHeight:1.4};
const emptyStyle={...tdStyle,textAlign:"center",padding:24}; const errorStyle={padding:12,borderRadius:10,background:"rgba(127,29,29,.35)",border:"1px solid rgba(248,113,113,.45)",color:"#FCA5A5"}; const loadingStyle={padding:18,color:"#C7D3CC"};
