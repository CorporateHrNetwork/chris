/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { apiRequest, getStoredOrganization } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";
import { LeavePage, Panel, Notice, Table, StatusBadge, formatDate, employeeName, styles } from "../components/leave/LeaveUi";
import { leaveTodayKey, returnQueue } from "../components/leave/leaveSelectors";

export default function LeaveReturns() {
  const { hasPermission, loading: permissionLoading } = useAuthorization();
  const canEdit = hasPermission("leave.manage");
  const zermatt = getStoredOrganization()?.slug === "zermatt-liquor-limited";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dates, setDates] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest(zermatt ? "/api/leave/return-queue" : "/api/leave/requests?status=ACTIVE");
      setRows(returnQueue(response?.data));
    } catch (err) {
      setError(err.message || "Unable to load return-to-work cases.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    window.addEventListener("chris:location-context-changed", load);
    return () => window.removeEventListener("chris:location-context-changed", load);
  }, []);
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const today = leaveTodayKey();
  const actualDate = row => dates[row.id] ?? (zermatt ? "" : today);

  async function submit(request) {
    setError("");
    setSubmitting(true);
    try {
      await apiRequest(`/api/leave/requests/${request.id}/return`, {
        method: "POST", body: JSON.stringify({ returnDate: actualDate(request) }),
      });
      setMessage(`${employeeName(request.employee)} returned to work.${zermatt ? " Recalculate the affected draft payroll to refresh any leave-return deficit." : ""}`);
      window.dispatchEvent(new Event("chris:leave-return-confirmed"));
      await load();
    } catch (err) {
      if (err.code === "RETURN_BEFORE_COMMENCEMENT" || err.message?.toLowerCase().includes("return before commencement")) {
        setError(`The return date for ${employeeName(request.employee)} precedes the recorded commencement (${formatDate(request.commencementDate)}). Check the recorded commencement and actual return date.`);
      } else {
        setError(err.message || "Unable to complete return to work.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const columns = [
    { key: "employee", label: "Employee", render: row => `${employeeName(row.employee)} (${row.employee?.employeeNumber})` },
    { key: "type", label: "Leave Type", render: row => row.leaveType?.name },
    { key: "status", label: "Status", render: row => <StatusBadge status={row.status} /> },
    ...(zermatt ? [{ key: "commenced", label: "Recorded Commencement", render: row => formatDate(row.commencementDate) }] : []),
    { key: "expected", label: "Expected Return", render: row => <>{formatDate(row.expectedReturnDate || row.endDate)}{row.returnDue && <div>Confirmation due</div>}</> },
    ...(zermatt ? [{ key: "deficit", label: "Provisional Days This Month", render: row => row.provisionalMissedDays ?? "—" }] : []),
    { key: "actual", label: "Actual Return", render: row => (
      <input
        aria-label={`Actual return date for ${employeeName(row.employee)}`}
        style={styles.input} type="date" value={actualDate(row)}
        min={zermatt ? row.commencementDate?.slice(0, 10) : undefined} max={zermatt ? today : undefined}
        onChange={event => setDates({ ...dates, [row.id]: event.target.value })}
      />
    ) },
    { key: "rules", label: "Return Requirements", render: row => row.leavePolicy?.lifecycleRules?.returnDocumentationRequired
      ? "Documentation required"
      : row.leavePolicy?.lifecycleRules?.fitnessCertificateRequired ? "Fitness-to-work required" : "No additional requirement" },
    { key: "action", label: "Action", render: row => (
      <button disabled={!canEdit || submitting || !actualDate(row)} style={{ ...styles.primary, opacity: canEdit ? 1 : 0.5 }} onClick={() => submit(row)}>
        Confirm Return
      </button>
    ) },
  ];

  return (
    <LeavePage title="Return to Work" description="Confirm the date the employee actually resumed work.">
      {!permissionLoading && !canEdit && <Notice error>Read-only access. Confirmation requires leave management permission.</Notice>}
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <Panel title="Return Queue" subtitle={zermatt
        ? "Expected return follows the last approved leave day. Provisional missed days cover elapsed workdays in the current month. Recorded attendance takes precedence."
        : "Only active leave requests appear. The queue refreshes after confirmation."}>
        {loading ? <div style={styles.empty}>Loading return-to-work cases...</div>
          : <Table rows={rows} columns={columns} empty="No employees are currently awaiting return-to-work processing." />}
      </Panel>
    </LeavePage>
  );
}
