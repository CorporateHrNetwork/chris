import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthorization from "../../hooks/useAuthorization";
import { apiRequest, apiDownload, saveDownloadedBlob } from "../../services/api";

const OBLIGATION_TYPES = ["PAYE", "PENSION", "NHF", "NSITF_ECS", "ITF"];
const today = () => new Date().toISOString().slice(0, 10);
const words = (value) => String(value || "").replaceAll("_", " ");
const money = (value, currency = "NGN") => {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || "NGN"} ${Number(value || 0).toLocaleString()}`;
  }
};

export default function RemittanceWorkspace() {
  const navigate = useNavigate();
  const { hasAnyPermission } = useAuthorization();
  const canManage = hasAnyPermission("remittances.manage", "payroll.manage");
  const [batches, setBatches] = useState([]);
  const [obligations, setObligations] = useState([]);
  const [withheld, setWithheld] = useState([]);
  const [withheldSummary, setWithheldSummary] = useState({ count: 0, employees: 0, outstandingAmount: 0, readyToRelease: 0 });
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState({ error: false, message: "" });
  const [form, setForm] = useState({
    reference: "",
    obligationType: "PAYE",
    authorityName: "",
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    declaredAmount: "",
    currency: "NGN",
  });
  const [payment, setPayment] = useState({ paymentReference: "", paymentDate: today(), evidenceReference: "" });
  const [allocation, setAllocation] = useState({ obligationId: "", amount: "" });
  const [reconciliation, setReconciliation] = useState({ paidAmount: "", notes: "" });
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [batchResult, obligationResult, withheldResult] = await Promise.all([
        apiRequest("/api/compliance/remittances"),
        apiRequest("/api/compliance/obligations"),
        apiRequest("/api/compliance/withheld-obligations"),
      ]);
      setBatches(batchResult?.data || []);
      setObligations(obligationResult?.data || []);
      setWithheld(withheldResult?.data || []);
      setWithheldSummary(withheldResult?.summary || { count: 0, employees: 0, outstandingAmount: 0, readyToRelease: 0 });
    } catch (error) {
      setFeedback({ error: true, message: error.message || "Unable to load statutory remittances." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = useMemo(
    () => batches.find((item) => item.id === selectedId) || null,
    [batches, selectedId]
  );
  const eligibleObligations = useMemo(
    () => obligations.filter((item) => selected
      && item.obligationType === selected.obligationType
      && Number(item.periodYear) === Number(selected.periodYear)
      && Number(item.periodMonth) === Number(selected.periodMonth)
      && item.exceptionCode !== "WITHHELD_MISSING_STATUTORY_DETAILS"
      && ["CONFIRMED", "DUE", "PARTIALLY_REMITTED", "OVERDUE"].includes(item.status)),
    [obligations, selected]
  );

  async function request(key, endpoint, body) {
    setBusy(key);
    setFeedback({ error: false, message: "" });
    try {
      const result = await apiRequest(endpoint, {
        method: "POST",
        ...(body === undefined ? {} : { body }),
      });
      setFeedback({ error: false, message: result?.message || "Remittance lifecycle updated." });
      await load();
      return result;
    } catch (error) {
      setFeedback({ error: true, message: error.message || "Unable to update the remittance." });
      return null;
    } finally {
      setBusy("");
    }
  }

  async function exportWithheld() {
    try {
      setBusy("withheld-export");
      setFeedback({ error: false, message: "" });
      const download = await apiDownload("/api/compliance/withheld-obligations.xlsx");
      saveDownloadedBlob(download);
      setFeedback({ error: false, message: "Withheld statutory remittance pool exported to Excel." });
    } catch (error) {
      setFeedback({ error: true, message: error.message || "Unable to export withheld statutory pool." });
    } finally {
      setBusy("");
    }
  }

  async function releaseReadyWithheld() {
    try {
      setBusy("withheld-release");
      setFeedback({ error: false, message: "" });
      const result = await apiRequest("/api/compliance/withheld-obligations/release-ready", { method: "POST", body: {} });
      setFeedback({ error: false, message: result?.message || "Withheld statutory pool refreshed." });
      await load();
    } catch (error) {
      setFeedback({ error: true, message: error.message || "Unable to release remittance-ready statutory obligations." });
    } finally {
      setBusy("");
    }
  }

  async function createBatch(event) {
    event.preventDefault();
    const result = await request("create", "/api/compliance/remittances", {
      ...form,
      periodYear: Number(form.periodYear),
      periodMonth: Number(form.periodMonth),
      declaredAmount: Number(form.declaredAmount),
    });
    if (result?.data?.id) {
      setSelectedId(result.data.id);
      setForm((current) => ({ ...current, reference: "", authorityName: "", declaredAmount: "" }));
    }
  }

  async function act(action, body) {
    if (!selected) return;
    const result = await request(action, `/api/compliance/remittances/${encodeURIComponent(selected.id)}/${action}`, body);
    if (result && action === "payment") setPayment({ paymentReference: "", paymentDate: today(), evidenceReference: "" });
    if (result && action === "allocations") setAllocation({ obligationId: "", amount: "" });
    if (result && ["fail", "reverse"].includes(action)) setReason("");
  }

  return (
    <section style={page}>
      <button type="button" style={backButton} onClick={() => navigate("/statutories")}>← Statutory Dashboard</button>
      <div style={eyebrow}>STATUTORY OPERATIONS</div>
      <h1 style={title}>Remittance & Reconciliation</h1>
      <p style={lead}>Create controlled statutory remittance batches, retain payment evidence, allocate confirmed payroll obligations and reconcile variances. CHRiS records the internal control lifecycle only; it does not transmit funds.</p>

      {feedback.message ? <div role="status" style={{ ...notice, ...(feedback.error ? errorNotice : successNotice) }}>{feedback.message}</div> : null}

      <Panel title="Withheld Statutory Remittance Pool" subtitle="Approved payroll liabilities awaiting complete employee statutory details">
        <p style={muted}>Payroll approval is not blocked by missing employee statutory identifiers. Affected PAYE/Pension liabilities remain recorded here and cannot be allocated to a remittance batch until the required employee details are completed. Use the Excel export for future consolidated/lump-sum remittance preparation.</p>
        <div style={summaryGrid}>
          <Summary label="Withheld Items" value={withheldSummary.count || 0} />
          <Summary label="Employees" value={withheldSummary.employees || 0} />
          <Summary label="Outstanding" value={money(withheldSummary.outstandingAmount || 0)} />
          <Summary label="Ready To Release" value={withheldSummary.readyToRelease || 0} />
        </div>
        <div style={{ ...buttonRow, marginTop: 12 }}>
          <button type="button" style={smallButton} disabled={Boolean(busy) || !withheld.length} onClick={exportWithheld}>{busy === "withheld-export" ? "Exporting…" : "Export Withheld Pool (Excel)"}</button>
          <button type="button" style={primaryButton} disabled={!canManage || Boolean(busy) || !withheldSummary.readyToRelease} onClick={releaseReadyWithheld}>{busy === "withheld-release" ? "Releasing…" : "Release Completed Details"}</button>
        </div>
        {withheld.length ? <div style={{ ...tableWrap, marginTop: 14 }}><table style={table}><thead><tr>{["Period", "Employee", "Type", "Outstanding", "Missing Details", "Pool Status"].map((item) => <th key={item} style={th}>{item}</th>)}</tr></thead><tbody>
          {withheld.map((item) => <tr key={item.id}>
            <td style={td}>{item.periodYear}-{String(item.periodMonth).padStart(2, "0")}</td>
            <td style={td}><strong>{item.employee?.employeeNumber || "—"}</strong><div style={muted}>{[item.employee?.firstName, item.employee?.middleName, item.employee?.lastName].filter(Boolean).join(" ")}</div></td>
            <td style={td}>{words(item.obligationType)}</td>
            <td style={td}>{money(item.outstandingAmount, item.currency)}</td>
            <td style={td}>{(item.missingFields || []).join(", ") || "Completed"}</td>
            <td style={td}><Badge value={item.poolStatus} /></td>
          </tr>)}
        </tbody></table></div> : <Empty>No statutory obligations are currently withheld for missing employee details.</Empty>}
      </Panel>

      <Panel title="Create Remittance Batch" subtitle="The preparer cannot approve the same batch.">
        <form style={formGrid} onSubmit={createBatch}>
          <Input label="Internal Reference" value={form.reference} onChange={(value) => setForm((p) => ({ ...p, reference: value }))} placeholder="PAYE-2026-09" required />
          <Select label="Obligation Type" value={form.obligationType} onChange={(value) => setForm((p) => ({ ...p, obligationType: value }))} options={OBLIGATION_TYPES.map((value) => [value, words(value)])} />
          <Input label="Statutory Authority" value={form.authorityName} onChange={(value) => setForm((p) => ({ ...p, authorityName: value }))} placeholder="Lagos State Internal Revenue Service" required />
          <Input type="number" label="Period Year" value={form.periodYear} onChange={(value) => setForm((p) => ({ ...p, periodYear: value }))} min="2000" required />
          <Input type="number" label="Period Month" value={form.periodMonth} onChange={(value) => setForm((p) => ({ ...p, periodMonth: value }))} min="1" max="12" required />
          <Input type="number" label="Declared Amount" value={form.declaredAmount} onChange={(value) => setForm((p) => ({ ...p, declaredAmount: value }))} min="0.01" step="0.01" required />
          <div style={buttonCell}><button style={primaryButton} disabled={!canManage || Boolean(busy)}>{busy === "create" ? "Creating…" : "Create Draft"}</button></div>
        </form>
      </Panel>

      <Panel title="Remittance Register" subtitle={`${batches.length} controlled batch${batches.length === 1 ? "" : "es"}`}>
        {loading ? <Empty>Loading remittances…</Empty> : batches.length ? (
          <div style={tableWrap}><table style={table}><thead><tr>{["Reference", "Type", "Period", "Declared", "Allocated", "Status", "Action"].map((item) => <th key={item} style={th}>{item}</th>)}</tr></thead><tbody>
            {batches.map((batch) => <tr key={batch.id}>
              <td style={td}><strong>{batch.reference}</strong><div style={muted}>{batch.authorityName}</div></td>
              <td style={td}>{words(batch.obligationType)}</td>
              <td style={td}>{batch.periodYear}-{String(batch.periodMonth).padStart(2, "0")}</td>
              <td style={td}>{money(batch.declaredAmount, batch.currency)}</td>
              <td style={td}>{money(batch.allocatedAmount, batch.currency)}</td>
              <td style={td}><Badge value={batch.status} /></td>
              <td style={td}><button type="button" style={smallButton} onClick={() => { setSelectedId(batch.id); setReconciliation({ paidAmount: String(batch.declaredAmount || ""), notes: "" }); }}>Manage</button></td>
            </tr>)}
          </tbody></table></div>
        ) : <Empty>No remittance batches have been created.</Empty>}
      </Panel>

      {selected ? <Panel title={`Manage ${selected.reference}`} subtitle={`${words(selected.obligationType)} · ${selected.periodYear}-${String(selected.periodMonth).padStart(2, "0")} · ${words(selected.status)}`}>
        <div style={actionGrid}>
          {selected.status === "DRAFT" ? <Action title="Submit for approval" text="Lock the prepared batch for independent review."><button type="button" style={primaryButton} disabled={!canManage || Boolean(busy)} onClick={() => act("submit", {})}>Submit Batch</button></Action> : null}
          {selected.status === "SUBMITTED" ? <Action title="Independent approval" text="The batch creator is blocked from approving their own batch."><button type="button" style={primaryButton} disabled={!canManage || Boolean(busy)} onClick={() => act("approve", {})}>Approve Batch</button></Action> : null}
          {selected.status === "APPROVED" ? <Action title="Record payment evidence" text="A reference, payment date and evidence reference are mandatory."><Input label="Payment Reference" value={payment.paymentReference} onChange={(value) => setPayment((p) => ({ ...p, paymentReference: value }))} /><Input type="date" label="Payment Date" value={payment.paymentDate} onChange={(value) => setPayment((p) => ({ ...p, paymentDate: value }))} /><Input label="Evidence Reference" value={payment.evidenceReference} onChange={(value) => setPayment((p) => ({ ...p, evidenceReference: value }))} /><button type="button" style={primaryButton} disabled={!canManage || Boolean(busy)} onClick={() => act("payment", payment)}>Record Payment</button></Action> : null}
          {["PAID", "PARTIALLY_ALLOCATED"].includes(selected.status) ? <Action title="Allocate payroll obligation" text="Only matching, confirmed obligations for this type and period are eligible."><Select label="Obligation" value={allocation.obligationId} onChange={(value) => setAllocation((p) => ({ ...p, obligationId: value }))} options={[["", "Select obligation"], ...eligibleObligations.map((item) => [item.id, `${item.employee?.employeeNumber || "Employee"} · ${money(Number(item.totalLiability) - Number(item.amountRemitted), item.currency)} outstanding`])]} /><Input type="number" label="Allocation Amount" value={allocation.amount} onChange={(value) => setAllocation((p) => ({ ...p, amount: value }))} min="0.01" step="0.01" /><button type="button" style={primaryButton} disabled={!canManage || Boolean(busy) || !allocation.obligationId} onClick={() => act("allocations", { allocations: [{ obligationId: allocation.obligationId, amount: Number(allocation.amount) }] })}>Record Allocation</button></Action> : null}
          {["ALLOCATED", "PARTIALLY_ALLOCATED"].includes(selected.status) ? <Action title="Reconcile payment" text="Compare verified payment with the declared and allocated amount."><Input type="number" label="Verified Paid Amount" value={reconciliation.paidAmount} onChange={(value) => setReconciliation((p) => ({ ...p, paidAmount: value }))} min="0.01" step="0.01" /><Input label="Reconciliation Notes" value={reconciliation.notes} onChange={(value) => setReconciliation((p) => ({ ...p, notes: value }))} /><button type="button" style={primaryButton} disabled={!canManage || Boolean(busy)} onClick={() => act("reconcile", { ...reconciliation, paidAmount: Number(reconciliation.paidAmount) })}>Reconcile</button></Action> : null}
          {["SUBMITTED", "APPROVED"].includes(selected.status) ? <Action title="Record failed batch" text="Document why the unpaid batch failed."><Input label="Failure Reason" value={reason} onChange={setReason} /><button type="button" style={dangerButton} disabled={!canManage || Boolean(busy) || !reason.trim()} onClick={() => act("fail", { reason })}>Fail Batch</button></Action> : null}
          {["PAID", "PARTIALLY_ALLOCATED", "ALLOCATED", "RECONCILED"].includes(selected.status) ? <Action title="Reverse batch" text="Restore allocated obligations and retain the reversal reason in the audit trail."><Input label="Reversal Reason" value={reason} onChange={setReason} /><button type="button" style={dangerButton} disabled={!canManage || Boolean(busy) || !reason.trim()} onClick={() => act("reverse", { reason })}>Reverse Batch</button></Action> : null}
        </div>
      </Panel> : null}
    </section>
  );
}

function Summary({ label, value }) {
  return <div style={summaryCard}><div style={summaryLabel}>{label}</div><strong>{value}</strong></div>;
}
function Panel({ title: heading, subtitle, children }) {
  return <section style={panel}><div style={panelHead}><div><h2 style={panelTitle}>{heading}</h2>{subtitle ? <p style={muted}>{subtitle}</p> : null}</div></div>{children}</section>;
}
function Action({ title: heading, text, children }) {
  return <div style={action}><h3 style={actionTitle}>{heading}</h3><p style={muted}>{text}</p><div style={actionFields}>{children}</div></div>;
}
function Input({ label: caption, onChange, ...props }) {
  return <label style={field}><span style={fieldLabel}>{caption}</span><input {...props} onChange={(event) => onChange(event.target.value)} style={input} /></label>;
}
function Select({ label: caption, options, onChange, ...props }) {
  return <label style={field}><span style={fieldLabel}>{caption}</span><select {...props} onChange={(event) => onChange(event.target.value)} style={input}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
}
function Badge({ value }) { return <span style={badge}>{words(value)}</span>; }
function Empty({ children }) { return <div style={empty}>{children}</div>; }

const page = { color: "var(--chris-text-main)" };
const backButton = { marginBottom: 16, padding: 0, border: "none", background: "transparent", color: "var(--chris-gold)", fontWeight: 850, cursor: "pointer" };
const eyebrow = { color: "var(--chris-gold)", fontSize: 10, fontWeight: 900, letterSpacing: ".14em" };
const title = { margin: "7px 0 6px", fontSize: 30, fontWeight: 900 };
const lead = { margin: 0, maxWidth: 920, color: "var(--chris-text-secondary)", lineHeight: 1.6 };
const panel = { marginTop: 20, padding: 20, border: "1px solid rgba(212,175,55,.30)", borderRadius: 18, background: "linear-gradient(145deg,rgba(4,36,23,.94),rgba(2,19,13,.96))", boxShadow: "0 18px 42px rgba(0,0,0,.22)" };
const panelHead = { display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 };
const panelTitle = { margin: 0, color: "#F7FAF8", fontSize: 19 };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, alignItems: "end" };
const field = { display: "grid", gap: 6 };
const fieldLabel = { color: "#B8C7BF", fontSize: 11, fontWeight: 850 };
const input = { width: "100%", minHeight: 41, boxSizing: "border-box", border: "1px solid rgba(212,175,55,.22)", borderRadius: 9, background: "#061A11", color: "#F5F7F6", padding: "0 11px" };
const buttonCell = { display: "flex", alignItems: "end" };
const primaryButton = { minHeight: 41, border: "1px solid #D4AF37", borderRadius: 9, padding: "0 15px", background: "linear-gradient(135deg,#D4AF37,#C59A22)", color: "#08140E", fontWeight: 900, cursor: "pointer" };
const smallButton = { ...primaryButton, minHeight: 32, padding: "0 10px", fontSize: 11 };
const dangerButton = { ...primaryButton, borderColor: "rgba(239,68,68,.7)", background: "rgba(127,29,29,.25)", color: "#FCA5A5" };
const notice = { marginTop: 16, padding: "11px 14px", borderRadius: 10, fontWeight: 750, fontSize: 13 };
const successNotice = { border: "1px solid rgba(46,233,139,.35)", background: "rgba(46,233,139,.08)", color: "#BAF7D7" };
const errorNotice = { border: "1px solid rgba(239,68,68,.45)", background: "rgba(127,29,29,.18)", color: "#FECACA" };
const tableWrap = { overflowX: "auto", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12 };
const table = { width: "100%", minWidth: 850, borderCollapse: "collapse" };
const th = { padding: "11px 12px", textAlign: "left", borderBottom: "1px solid rgba(212,175,55,.2)", color: "#AFC0B7", fontSize: 10, textTransform: "uppercase" };
const td = { padding: "12px", borderBottom: "1px solid rgba(255,255,255,.05)", color: "#E5ECE8", fontSize: 12 };
const badge = { display: "inline-flex", padding: "4px 8px", border: "1px solid rgba(212,175,55,.35)", borderRadius: 999, color: "#EAD88B", fontSize: 10, fontWeight: 850 };
const muted = { margin: "5px 0 0", color: "#94A89D", fontSize: 11, lineHeight: 1.5 };
const empty = { minHeight: 100, display: "grid", placeItems: "center", color: "#9FB0A7" };
const actionGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 };
const action = { padding: 15, border: "1px solid rgba(212,175,55,.18)", borderRadius: 12, background: "rgba(255,255,255,.018)" };
const actionTitle = { margin: 0, color: "#F5F7F6", fontSize: 14 };
const actionFields = { display: "grid", gap: 10, marginTop: 13 };

const summaryGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 14 };
const summaryCard = { padding: 12, border: "1px solid rgba(212,175,55,.20)", borderRadius: 10, background: "rgba(255,255,255,.025)" };
const summaryLabel = { marginBottom: 5, color: "#94A89D", fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em" };
const buttonRow = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" };
