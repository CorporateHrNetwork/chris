import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";
import EmployeeSearchSelect from "../components/leave/EmployeeSearchSelect";
import {
  LeavePage,
  Panel,
  Notice,
  Table,
  StatusBadge,
  formatDate,
  employeeName,
  styles,
} from "../components/leave/LeaveUi";

import "./LeaveRequests.css";

const emptyForm = {
  leaveYear: new Date().getFullYear(),
  employeeNumber: "",
  leaveTypeId: "",
  leavePolicyId: "",
  startDate: "",
  endDate: "",
  reason: "",
};

function readableUnit(unit) {
  if (!unit) return "days";

  const normalized = String(unit)
    .replaceAll("_", " ")
    .toLowerCase();

  if (normalized === "working days") return "working days";
  if (normalized === "calendar days") return "calendar days";
  if (normalized === "hours") return "hours";
  if (normalized === "weeks") return "weeks";

  return normalized;
}

export default function LeaveRequests() {
  const nav = useNavigate();
  const { hasPermission } = useAuthorization();

  const canRequest =
    hasPermission("leave.request") || hasPermission("leave.manage");

  const canApprove =
    hasPermission("leave.approve") || hasPermission("leave.manage");

  const [policies, setPolicies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeLoading, setEmployeeLoading] = useState(true);

  const [form, setForm] = useState(emptyForm);
  const [calculation, setCalculation] = useState(null);

  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const normalizeEmployees = (response) => {
    const raw = Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response)
        ? response
        : Array.isArray(response?.data?.employees)
          ? response.data.employees
          : [];

    return raw;
  };

  const loadRequests = () =>
    apiRequest("/api/leave/requests")
      .then((response) => {
        setRequests(response.data || []);
      })
      .catch((requestError) => {
        setError(requestError.message);
      });

  const loadReferenceData = async () => {
    try {
      setEmployeeLoading(true);

      const [policyResponse, employeeResponse] = await Promise.all([
        apiRequest("/api/leave/policies"),
        apiRequest("/api/employees"),
      ]);

      setPolicies(
        (policyResponse.data || []).filter(
          (item) =>
            item.status === "ACTIVE" &&
            item.isActive !== false
        )
      );

      setEmployees(normalizeEmployees(employeeResponse));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setEmployeeLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    loadReferenceData();
  }, []);

  function updateForm(patch) {
    setForm((current) => ({
      ...current,
      ...patch,
    }));
  }

  function resetRequestForm() {
    setForm(emptyForm);
    setCalculation(null);
    setBalance(null);
    setBalanceError("");
    setBalanceLoading(false);
  }

  function closeRequestModal() {
    resetRequestForm();
    setOpen(false);
  }

  useEffect(() => {
    if (!form.employeeNumber || !form.leavePolicyId) {
      setBalance(null);
      setBalanceError("");
      setBalanceLoading(false);
      return;
    }

    let live = true;

    setBalance(null);
    setBalanceError("");
    setBalanceLoading(true);

    const query = new URLSearchParams({
      leavePolicyId: form.leavePolicyId,
      leaveYear: String(form.leaveYear),
    }).toString();

    apiRequest(
      `/api/leave/employees/${encodeURIComponent(
        form.employeeNumber
      )}/policy-balance?${query}`
    )
      .then((response) => {
        if (!live) return;

        setBalance(response.data);
        setBalanceError("");
      })
      .catch((balanceLoadError) => {
        if (!live) return;

        setBalance(null);
        setBalanceError(
          balanceLoadError.message ||
            "Unable to load leave balance."
        );
      })
      .finally(() => {
        if (live) {
          setBalanceLoading(false);
        }
      });

    return () => {
      live = false;
    };
  }, [form.employeeNumber, form.leavePolicyId, form.leaveYear]);

  useEffect(() => {
    if (
      !form.employeeNumber ||
      !form.leavePolicyId ||
      !form.startDate ||
      !form.endDate
    ) {
      setCalculation(null);
      return;
    }

    let live = true;

    const query = new URLSearchParams({
      employeeNumber: form.employeeNumber,
      leaveTypeId: form.leaveTypeId,
      leavePolicyId: form.leavePolicyId,
      startDate: form.startDate,
      endDate: form.endDate,
    }).toString();

    apiRequest(`/api/leave/request-day-calculation?${query}`)
      .then((response) => {
        if (!live) return;

        setCalculation(response.data);
      })
      .catch((calculationError) => {
        if (!live) return;

        setCalculation(null);
        setError(calculationError.message);
      });

    return () => {
      live = false;
    };
  }, [
    form.employeeNumber,
    form.leaveTypeId,
    form.leavePolicyId,
    form.startDate,
    form.endDate,
  ]);

  const requestedUnits = Number(
    calculation?.requestedUnits || 0
  );

  const maximumRequestable = Number(
    balance?.maximumRequestable || 0
  );

  const exceedsMaximum =
    Boolean(calculation) &&
    Boolean(balance?.hasEntitlement) &&
    requestedUnits > maximumRequestable;

  const selectedPolicy = useMemo(
    () =>
      policies.find(
        (policy) => policy.id === form.leavePolicyId
      ) || null,
    [policies, form.leavePolicyId]
  );

  async function action(request, path, body, label) {
    setBusy(request.id);
    setError("");
    setMessage("");

    try {
      await apiRequest(
        `/api/leave/requests/${request.id}/${path}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );

      setMessage(label);
      await loadRequests();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy("");
    }
  }

  async function submit(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!form.employeeNumber) {
      setError("Select an employee.");
      return;
    }

    if (!form.leavePolicyId) {
      setError("Select an active leave policy.");
      return;
    }

    if (!balance) {
      setError(
        balanceError ||
          "Leave balance has not been loaded."
      );
      return;
    }

    if (!balance.hasEntitlement) {
      setError(
        `No entitlement is currently configured for this employee under ${
          selectedPolicy?.name || "the selected leave policy"
        }.`
      );
      return;
    }

    if (!calculation || requestedUnits <= 0) {
      setError(
        "Select valid leave dates so CHRIS can calculate the leave duration."
      );
      return;
    }

    if (requestedUnits > maximumRequestable) {
      setError(
        `Request exceeds the maximum available entitlement of ${maximumRequestable} ${readableUnit(
          balance.unit
        )}.`
      );
      return;
    }

    try {
      await apiRequest("/api/leave/requests", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setMessage(
        `Leave request submitted for ${requestedUnits} ${readableUnit(
          calculation.unit
        )}.`
      );

      resetRequestForm();
      setOpen(false);

      await loadRequests();
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  function actions(request) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(request.startDate);
    startDate.setHours(0, 0, 0, 0);

    const due = startDate <= today;

    const early =
      request.leavePolicy?.lifecycleRules
        ?.allowEarlyCommencement === true;

    return (
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {request.status === "PENDING" && (
          <>
            <button
              disabled={
                !canApprove || busy === request.id
              }
              style={styles.button}
              onClick={() =>
                action(
                  request,
                  "review",
                  { decision: "APPROVE" },
                  "Request approved."
                )
              }
            >
              Approve
            </button>

            <button
              disabled={
                !canApprove || busy === request.id
              }
              style={styles.button}
              onClick={() =>
                action(
                  request,
                  "review",
                  { decision: "REJECT" },
                  "Request rejected."
                )
              }
            >
              Reject
            </button>
          </>
        )}

        {["PENDING", "APPROVED"].includes(
          request.status
        ) && (
          <button
            disabled={
              !canApprove || busy === request.id
            }
            style={styles.button}
            onClick={() =>
              action(
                request,
                "cancel",
                {
                  cancellationReason:
                    "Cancelled from leave register",
                },
                "Request cancelled."
              )
            }
          >
            Cancel
          </button>
        )}

        {request.status === "APPROVED" && (
          <button
            title={
              !due && !early
                ? "Policy does not permit early commencement"
                : ""
            }
            disabled={
              (!due && !early) ||
              !canApprove ||
              busy === request.id
            }
            style={{
              ...styles.primary,
              opacity: due || early ? 1 : 0.5,
            }}
            onClick={() =>
              action(
                request,
                "commence",
                {
                  effectiveDate: new Date()
                    .toISOString()
                    .slice(0, 10),
                },
                "Leave commenced."
              )
            }
          >
            Commence Leave
          </button>
        )}

        {request.status === "ACTIVE" && (
          <button
            style={styles.primary}
            onClick={() => nav("/leave/returns")}
          >
            Return to Work
          </button>
        )}
      </div>
    );
  }

  function lifecycleLabel(request, due) {
    if (request.status === "APPROVED") {
      return due
        ? "Approved - Ready to Commence"
        : `Approved - Starts ${formatDate(
            request.startDate
          )}`;
    }

    if (request.status === "ACTIVE") {
      return "On Leave";
    }

    if (request.status === "COMPLETED") {
      return `Completed - Returned ${formatDate(
        request.actualReturnDate
      )}`;
    }

    return request.status;
  }

  const columns = [
    {
      key: "employee",
      label: "Employee",
      render: (row) =>
        `${employeeName(row.employee)} (${
          row.employee?.employeeNumber
        })`,
    },
    {
      key: "type",
      label: "Leave Type",
      render: (row) => row.leaveType?.name,
    },
    {
      key: "dates",
      label: "Leave Dates",
      render: (row) =>
        `${formatDate(row.startDate)} - ${formatDate(
          row.endDate
        )}`,
    },
    {
      key: "duration",
      label: "Days Applied For",
      render: (row) => row.requestedUnits,
    },
    {
      key: "policy",
      label: "Policy / Version",
      render: (row) =>
        row.leavePolicy
          ? `${row.leavePolicy.name} v${row.leavePolicy.versionNumber}`
          : "-",
    },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        const due =
          new Date(row.startDate) <= new Date();

        return (
          <>
            <StatusBadge status={row.status} />
            <div style={styles.muted}>
              {lifecycleLabel(row, due)}
            </div>
          </>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      render: actions,
    },
  ];

  return (
    <LeavePage
      title="Leave Requests"
      description="Create, review and manage the complete leave request lifecycle."
      actions={
        <button
          disabled={!canRequest}
          style={{
            ...styles.primary,
            opacity: canRequest ? 1 : 0.5,
          }}
          onClick={() => {
            setError("");
            setMessage("");
            resetRequestForm();
            setOpen(true);
          }}
        >
          + New Leave Request
        </button>
      }
    >
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}

      <Panel title="Request Register">
        <Table
          rows={requests}
          columns={columns}
          empty="No leave requests found."
        />
      </Panel>

      {open && (
        <div
          className="leave-request-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeRequestModal();
            }
          }}
        >
          <section
            className="leave-request-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-request-title"
          >
            <header className="leave-request-modal__header">
              <div>
                <h2
                  id="leave-request-title"
                  style={{ margin: 0 }}
                >
                  New Leave Request
                </h2>

                <p style={styles.muted}>
                  Leave End Date is the final day of
                  leave and is counted inclusively.
                </p>
              </div>

              <button
                type="button"
                style={styles.button}
                onClick={closeRequestModal}
              >
                Close
              </button>
            </header>

            <form
              className="leave-request-form"
              onSubmit={submit}
            >
              <EmployeeSearchSelect
                employees={employees}
                loading={employeeLoading}
                value={form.employeeNumber}
                onChange={(employeeNumber) => {
                  setBalance(null);
                  setBalanceError("");
                  setCalculation(null);

                  updateForm({
                    employeeNumber,
                  });
                }}
              />

              {!policies.length && (
                <Notice error>
                  No active leave policy is configured
                  for this organization. Go to Leave
                  Policies to activate or use a CHRIS
                  recommended policy.
                </Notice>
              )}

              <label className="leave-field">
                <span>Leave Policy *</span>

                <select
                  style={styles.input}
                  value={form.leavePolicyId}
                  onChange={(event) => {
                    const policy = policies.find(
                      (item) =>
                        item.id === event.target.value
                    );

                    setBalance(null);
                    setBalanceError("");
                    setCalculation(null);

                    updateForm({
                      leavePolicyId: event.target.value,
                      leaveTypeId:
                        policy?.leaveTypeId || "",
                    });
                  }}
                  required
                >
                  <option value="">
                    Select active policy
                  </option>

                  {policies.map((policy) => (
                    <option
                      key={policy.id}
                      value={policy.id}
                    >
                      {policy.name} v
                      {policy.versionNumber} -{" "}
                      {policy.leaveType?.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="leave-field">
                <span>Leave Year *</span>
                <select style={styles.input} value={form.leaveYear} onChange={(event) => { setBalance(null); setCalculation(null); updateForm({ leaveYear: Number(event.target.value) }); }} required>
                  {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>

              <div className="leave-field">
                <span>Available Leave Balance</span>

                <div
                  style={{
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 12px",
                    borderRadius: 10,
                    background: "#10261d",
                    color: "#f4f7f5",
                    fontWeight: 700,
                    border: "1px solid rgba(206, 168, 27, 0.3)",
                  }}
                >
                  {!form.employeeNumber ||
                  !form.leavePolicyId
                    ? "Select employee and leave policy"
                    : balanceLoading
                      ? "Loading leave balance..."
                      : balanceError
                        ? "Unable to load leave balance."
                        : !balance
                          ? "-"
                          : !balance.hasEntitlement
                            ? "No applicable entitlement"
                            : `${balance.available} ${readableUnit(
                                balance.unit
                              )}`}
                </div>
              </div>

              <div className="leave-field">
                <span>Maximum Requestable</span>

                <div
                  style={{
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 12px",
                    borderRadius: 10,
                    background: "#10261d",
                    color: "#e2bd31",
                    fontWeight: 800,
                    border: "1px solid rgba(206, 168, 27, 0.4)",
                  }}
                >
                  {!form.employeeNumber ||
                  !form.leavePolicyId
                    ? "Select employee and leave policy"
                    : balanceLoading
                      ? "Loading..."
                      : !balance ||
                          !balance.hasEntitlement
                        ? "-"
                        : `${balance.maximumRequestable} ${readableUnit(
                            balance.unit
                          )}`}
                </div>
              </div>

              {balance?.hasEntitlement && (
                <div
                  className="leave-field--wide"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "#10261d",
                    border: "1px solid rgba(206, 168, 27, 0.18)",
                    color: "#a8b9b0",
                    fontSize: 13,
                  }}
                >
                  Entitlement: {balance.entitlement}
                  {balance.allocation?.method ? ` (${balance.allocation.method.replaceAll("_", " ").toLowerCase()})` : ""}
                  {" | "}
                  Carryover: {balance.carryover}
                  {" | "}
                  Adjustments: {balance.adjustments}
                  {" | "}
                  Used: {balance.used}
                  {" | "}
                  Pending / Committed: {balance.committed}
                </div>
              )}

              {balanceError && (
                <div className="leave-field--wide">
                  <Notice error>
                    {balanceError}
                  </Notice>
                </div>
              )}

              <label className="leave-field">
                <span>Leave Start Date *</span>

                <input
                  style={styles.input}
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    updateForm({
                      startDate: event.target.value,
                    })
                  }
                  required
                />
              </label>

              <label className="leave-field">
                <span>
                  Leave End Date (inclusive) *
                </span>

                <input
                  style={styles.input}
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(event) =>
                    updateForm({
                      endDate: event.target.value,
                    })
                  }
                  required
                />
              </label>

              <label className="leave-field">
                <span>Days Applied For</span>

                <input
                  style={styles.input}
                  value={
                    calculation?.requestedUnits ?? ""
                  }
                  readOnly
                  aria-readonly="true"
                  placeholder="Calculated from policy"
                />
              </label>

              <label className="leave-field leave-field--wide">
                <span>Reason</span>

                <textarea
                  style={{
                    ...styles.input,
                    minHeight: 90,
                  }}
                  value={form.reason}
                  onChange={(event) =>
                    updateForm({
                      reason: event.target.value,
                    })
                  }
                />
              </label>

              {calculation && (
                <div
                  className="leave-field--wide"
                  style={styles.muted}
                >
                  {calculation.policyName} v
                  {calculation.policyVersion}:{" "}
                  {readableUnit(calculation.unit)};
                  weekends{" "}
                  {calculation.countWeekends
                    ? "included"
                    : "excluded"}
                  ; public holidays{" "}
                  {calculation.countPublicHolidays
                    ? "included"
                    : "excluded"}
                  . {calculation.scheduleNote}
                </div>
              )}

              {exceedsMaximum && (
                <div className="leave-field--wide">
                  <Notice error>
                    Request exceeds the maximum
                    available entitlement of{" "}
                    {maximumRequestable}{" "}
                    {readableUnit(balance?.unit)}.
                  </Notice>
                </div>
              )}

              <footer className="leave-request-actions">
                <button
                  type="button"
                  style={styles.button}
                  onClick={closeRequestModal}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    !calculation ||
                    requestedUnits <= 0 ||
                    balanceLoading ||
                    !balance?.hasEntitlement ||
                    exceedsMaximum
                  }
                  style={{
                    ...styles.primary,
                    opacity:
                      !calculation ||
                      requestedUnits <= 0 ||
                      balanceLoading ||
                      !balance?.hasEntitlement ||
                      exceedsMaximum
                        ? 0.55
                        : 1,
                  }}
                >
                  Submit Leave Request
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </LeavePage>
  );
}
