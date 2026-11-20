import { useEffect, useState } from "react";
import { apiRequest, getActiveLocationId } from "../../services/api";

const money = amount => new Intl.NumberFormat("en-NG", { style:"currency",currency:"NGN" }).format(Number(amount || 0));
export default function OnboardingSalaryCorrection() {
  const [open,setOpen] = useState(false);
  const [name,setName] = useState("");
  const [rows,setRows] = useState([]);
  const [selected,setSelected] = useState(null);
  const [amount,setAmount] = useState("");
  const [reason,setReason] = useState("");
  const [preview,setPreview] = useState(null);
  const [previewBusy,setPreviewBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [scope,setScope] = useState(() => getActiveLocationId());

  useEffect(() => {
    const refresh = () => setScope(getActiveLocationId());
    window.addEventListener("chris:location-context-changed", refresh);
    return () => window.removeEventListener("chris:location-context-changed", refresh);
  }, []);
  useEffect(() => {
    setSelected(null); setRows([]);
    if (!open) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await apiRequest(`/api/onboarding/salary-corrections?name=${encodeURIComponent(name.trim())}`);
        if (active) setRows(response.data || []);
      } catch (err) {
        if (active) setError(err.message || "Unable to load salary records.");
      } finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open,name,scope]);
  async function save() {
    setError("");setMessage("");
    if (!selected) { setError("Select an employee salary record."); return; }
    const corrected = Number(amount);
    if (!Number.isFinite(corrected) || corrected <= 0 || !/^\d+(?:\.\d{1,2})?$/.test(String(amount))) {
      setError("Enter a positive monthly gross salary with at most two decimal places."); return;
    }
    if (reason.trim().length < 8) { setError("Enter an explanation of at least eight characters for the correction audit."); return; }
    if (!preview || Number(preview.fullMonthlyGross) !== corrected) { setError("Preview the allocation from the full salary before saving."); return; }
    if (!window.confirm(`Apply ${money(corrected)} to ${selected.employeeName}? Main end-month ${money(preview.endMonthGross)} and independent TSP ${money(preview.normalMidMonth)}. Draft payroll/TSP must be regenerated; approved periods are protected.`)) return;
    setSaving(true);
    try {
      const response = await apiRequest(`/api/payroll/salary-rates/${encodeURIComponent(selected.id)}`, {
        method:"PATCH", body: {
          amount:corrected,
          currency:selected.currency || "NGN",
          effectiveFrom:selected.effectiveFrom,
          effectiveTo:selected.effectiveTo || null,
          reason:reason.trim(),
        },
      });
      setMessage(`Salary allocation saved for ${selected.employeeName}. Full gross: ${money(response.data.amount)}; main payroll end-month: ${money(response.data.endMonthGross)}; TSP basis updated in Benefits. Regenerate affected draft Main Payroll and TSP before approval.`);
      setSelected(null);setReason("");setAmount("");setPreview(null);
      const updated = await apiRequest(`/api/onboarding/salary-corrections?name=${encodeURIComponent(name.trim())}`);
      setRows(updated.data || []);
    } catch(err) { setError(err.message || "Salary correction was not saved."); }
    finally { setSaving(false); }
  }
  return <section style={{border:"1px solid #52745d",borderRadius:10,padding:16,margin:"16px 0",background:"var(--chris-panel, transparent)"}}>
    <button type="button" className="qa-secondary" onClick={() => { setOpen(v=>!v);setMessage("");setError(""); }}>
      {open ? "Close existing employee salary corrections" : "Correct an existing employee's onboarding salary"}
    </button>
    {!open ? <p>Branch/Head HR can correct an employee's original monthly gross using the authoritative salary register. All corrections are audited.</p> : <>
      <h2>Unified Full Salary → Main Payroll and TSP Allocation</h2>
      <p>Enter the full agreed gross once. CHRiS uses the authoritative Zermatt split rule to allocate the End-of-Month Gross to Main Payroll and Transport Support to the independent Benefits TSP environment. Existing payroll adjustments are not replaced.</p>
      <label>Find employee salary
        <input value={name} placeholder="Type employee name" onChange={e=>setName(e.target.value)} style={{display:"block",width:"100%",maxWidth:470}} />
      </label>
      {loading && <p role="status">Loading salaries…</p>}
      {!loading && !rows.length && <p>No matching active salary records in the authorized branch.</p>}
      {error && <p role="alert" style={{color:"#d25542"}}>{error}</p>}
      {message && <p role="status">{message}</p>}
      <div style={{maxHeight:200,overflowY:"auto",margin:"8px 0"}}>
        {rows.map(rate=><button type="button" key={rate.id} style={{display:"block",padding:8,marginBottom:4,width:"100%",textAlign:"left"}}
          onClick={()=>{setSelected(rate);setAmount(String(rate.amount));setReason("");setPreview(null);setMessage("");}}>
          {rate.employeeName} · {rate.employeeNumber} · {money(rate.amount)} · Effective {rate.effectiveFrom}
        </button>)}
      </div>
      {selected && <div style={{display:"grid",gap:10,maxWidth:500}}>
        <strong>{selected.employeeName} · {selected.employeeNumber}</strong>
        <p>Current full monthly gross: {money(selected.amount)} | Main payroll end-month: {money(selected.endMonthGross)} | TSP allocation uses the applicable rate and eligible days.</p>
        <label>Correct monthly gross salary (₦) *
          <input type="number" min="0.01" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setPreview(null);}} />
        </label>
        <label>Reason for correcting onboarding salary *
          <textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain what was entered incorrectly and the approved amount" />
        </label>
        <button type="button" className="qa-secondary" disabled={previewBusy} onClick={async()=>{
          setError("");setPreview(null);
          if(!Number.isFinite(Number(amount)) || Number(amount)<=0) {setError("Enter a positive full gross amount.");return;}
          setPreviewBusy(true);
          try {
            const r=await apiRequest("/api/onboarding/salary-allocation-preview",{
              method:"POST",body:{rateId:selected.id,fullMonthlyGross:amount,effectiveFrom:selected.effectiveFrom}
            });
            setPreview(r.data);
          } catch(err){setError(err.message||"Unable to preview the CHRiS salary allocation.");}
          finally{setPreviewBusy(false);}
        }}>{previewBusy?"Calculating…":"Calculate and preview allocations"}</button>
        {preview && <div style={{border:"1px solid #769880",borderRadius:8,padding:12}}>
          <h3>CHRiS allocation preview · {preview.policyVersion}</h3>
          <p><strong>Full Monthly Gross:</strong> {money(preview.fullMonthlyGross)}</p>
          <p><strong>Main Payroll — End of Month:</strong> {money(preview.endMonthGross)}</p>
          <p><strong>Benefits — Transport Support (TSP):</strong> {money(preview.normalMidMonth)} ({preview.midMonthPercentage}%)
            {preview.midMonthPayable !== preview.normalMidMonth && ` · Current-month prorated payable: ${money(preview.midMonthPayable)}`}
          </p>
          <p>End-of-month salary components: Basic {money(preview.components?.basic)}, Housing {money(preview.components?.housing)}, Transport {money(preview.components?.transport)}, Meal {money(preview.components?.meal)}, Medical {money(preview.components?.medical)}, Utility {money(preview.components?.utility)}.</p>
          <p>Main Payroll and TSP remain separate. No payment is triggered by saving this allocation. Existing TSP overtime, PH, short payments and overpayments are preserved.</p>
        </div>}
        <p>Effective from: {selected.effectiveFrom}. Where an approved payroll has used this rate, correction is blocked and a new effective-dated record must be created through salary review.</p>
        <button type="button" className="qa-primary" onClick={save} disabled={saving || !preview}>{saving?"Saving allocations…":"Save and map salary allocations"}</button>
      </div>}
    </>}
  </section>;
}
