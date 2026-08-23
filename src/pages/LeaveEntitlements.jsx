/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";
import { LeavePage, Panel, Notice, Table, styles } from "../components/leave/LeaveUi";

const today = () => new Date().toISOString().slice(0, 10);

export default function LeaveEntitlements() {
  const { hasPermission, loading: permissionLoading } = useAuthorization();
  const canManage = hasPermission("leave.manage");
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ amount: "", reason: "", effectiveDate: today() });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [entitlements, adjustments] = await Promise.all([
        apiRequest("/api/leave/entitlements"),
        apiRequest("/api/leave/entitlements/adjustments"),
      ]);
      setRows(entitlements.data || []);
      setHistory(adjustments.data || []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load leave entitlements.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submitAdjustment(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiRequest("/api/leave/entitlements/adjustments", {
        method: "POST",
        body: JSON.stringify({ employeeNumber: selected.employeeNumber, leavePolicyId: selected.policyId, leaveYear: selected.leaveYear, amount: Number(form.amount), reason: form.reason, effectiveDate: form.effectiveDate }),
      });
      setMessage("Entitlement adjustment recorded. Corrections require a new offsetting adjustment.");
      setSelected(null);
      setForm({ amount: "", reason: "", effectiveDate: today() });
      await load();
      window.setTimeout(() => setMessage(""), 4500);
    } catch (saveError) {
      setError(saveError.message || "Unable to record entitlement adjustment.");
    } finally { setSaving(false); }
  }

  const columns = [
    { key: "employeeName", label: "Employee", render: (row) => `${row.employeeName} (${row.employeeNumber})` },
    { key: "policyName", label: "Policy", render: (row) => `${row.policyName} v${row.policyVersion}` },
    { key: "entitlement", label: "Entitlement" }, { key: "used", label: "Used" }, { key: "committed", label: "Committed" },
    { key: "adjustments", label: "Adjustment", render: (row) => Number(row.adjustments || 0).toLocaleString() },
    { key: "available", label: "Available" },
    { key: "other", label: "Other Active Policies", render: (row) => row.otherActivePolicies?.map((item) => item.name).join(", ") || "—" },
    { key: "action", label: "Action", render: (row) => <button type="button" disabled={!canManage} style={{ ...styles.primary, opacity: canManage ? 1 : 0.5 }} onClick={() => setSelected(row)}>Adjust</button> },
  ];
  const historyColumns = [
    { key: "employee", label: "Employee", render: (row) => `${[row.employee?.firstName, row.employee?.middleName, row.employee?.lastName].filter(Boolean).join(" ")} (${row.employee?.employeeNumber})` },
    { key: "policy", label: "Policy", render: (row) => row.leavePolicy ? `${row.leavePolicy.name} v${row.leavePolicy.versionNumber}` : row.leaveType?.name },
    { key: "amount", label: "Signed Adjustment", render: (row) => Number(row.amount) > 0 ? `+${Number(row.amount)}` : Number(row.amount) },
    { key: "reason", label: "Reason" },
    { key: "effectiveDate", label: "Effective", render: (row) => new Date(row.effectiveDate).toLocaleDateString() },
    { key: "createdBy", label: "Recorded By", render: (row) => [row.createdBy?.firstName, row.createdBy?.lastName].filter(Boolean).join(" ") || "System" },
  ];

  return <LeavePage title="Leave Entitlements" description="Authoritative policy/year entitlements and employee balances.">
    {!permissionLoading && !canManage && <Notice error>Read-only access: leave.manage is required to record adjustments.</Notice>}{error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}
    <Panel title="Employee Entitlements" subtitle="Committed means PENDING requests only. APPROVED and ACTIVE leave is already represented in Used."><Table rows={rows} columns={columns} empty="No employee entitlements are currently produced by active policies." /></Panel>
    <Panel title="Adjustment History" subtitle="Append-only audit history. Corrections are recorded as reversing or offsetting entries."><Table rows={history} columns={historyColumns} empty="No entitlement adjustments have been recorded." /></Panel>
    {selected && <div style={overlay} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><form style={modal} onSubmit={submitAdjustment}><h2 style={{ marginTop: 0 }}>Adjust Entitlement</h2><p style={styles.muted}>{selected.employeeName} · {selected.policyName} · {selected.leaveYear}</p><label>Signed Adjustment<input style={styles.input} type="number" step="0.5" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label><small style={styles.muted}>Use a positive amount to add and a negative amount to offset. Existing records cannot be edited or deleted.</small><label>Effective Date<input style={styles.input} type="date" value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} required /></label><label>Reason<textarea style={{ ...styles.input, minHeight: 90 }} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required /></label><div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" style={styles.button} onClick={() => setSelected(null)}>Cancel</button><button type="submit" disabled={saving} style={styles.primary}>{saving ? "Recording..." : "Record Adjustment"}</button></div></form></div>}
  </LeavePage>;
}

const overlay = { position: "fixed", inset: 0, zIndex: 1200, display: "grid", placeItems: "center", padding: 16, background: "rgba(0,0,0,.76)" };
const modal = { width: "min(100%,540px)", display: "grid", gap: 12, padding: 20, borderRadius: 16, border: "1px solid var(--chris-border-gold)", background: "#07150E", color: "var(--chris-text-main)" };
