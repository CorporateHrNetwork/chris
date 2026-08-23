/* eslint-disable react-hooks/set-state-in-effect */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  LeavePage,
  Notice,
  Panel,
  Table,
  styles,
} from "../components/leave/LeaveUi";
import useAuthorization from "../hooks/useAuthorization";
import { apiRequest } from "../services/api";

const today = () => new Date().toISOString().slice(0, 10);
const currentYear = () => new Date().getFullYear();

function employeeName(employee) {
  return [
    employee?.firstName,
    employee?.middleName,
    employee?.lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

function readableUnit(unit) {
  return String(unit || "units")
    .replaceAll("_", " ")
    .toLowerCase();
}

export default function LeaveEntitlements() {
  const {
    hasPermission,
    loading: permissionLoading,
  } = useAuthorization();
  const canManage = hasPermission("leave.manage");

  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [provisioningOpen, setProvisioningOpen] =
    useState(false);
  const [preview, setPreview] = useState(null);
  const [provisioning, setProvisioning] = useState({
    leaveYear: currentYear(),
    policyIds: [],
    employeeScope: "ALL",
    employeeNumber: "",
    reason: "Initial policy-derived entitlement allocation",
  });
  const [form, setForm] = useState({
    amount: "",
    reason: "",
    effectiveDate: today(),
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");

    try {
      const [
        entitlements,
        adjustments,
        policyResponse,
        employeeResponse,
      ] = await Promise.all([
        apiRequest("/api/leave/entitlements"),
        apiRequest(
          "/api/leave/entitlements/adjustments"
        ),
        apiRequest("/api/leave/policies"),
        apiRequest("/api/employees"),
      ]);

      setRows(entitlements.data || []);
      setHistory(adjustments.data || []);
      setPolicies(
        (policyResponse.data || []).filter(
          (policy) =>
            policy.status === "ACTIVE" &&
            policy.isActive === true
        )
      );

      const rawEmployees = Array.isArray(
        employeeResponse?.data
      )
        ? employeeResponse.data
        : employeeResponse?.data?.employees || [];

      setEmployees(rawEmployees);
    } catch (loadError) {
      setError(
        loadError.message ||
          "Unable to load leave entitlements."
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedEmployeeNumbers = useMemo(
    () =>
      provisioning.employeeScope === "SINGLE" &&
      provisioning.employeeNumber
        ? [provisioning.employeeNumber]
        : [],
    [
      provisioning.employeeNumber,
      provisioning.employeeScope,
    ]
  );

  function togglePolicy(policyId) {
    setPreview(null);
    setProvisioning((current) => ({
      ...current,
      policyIds: current.policyIds.includes(policyId)
        ? current.policyIds.filter(
            (id) => id !== policyId
          )
        : [...current.policyIds, policyId],
    }));
  }

  async function previewProvisioning(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!provisioning.policyIds.length) {
      setError(
        "Select at least one active tenant leave policy."
      );
      return;
    }

    if (
      provisioning.employeeScope === "SINGLE" &&
      !provisioning.employeeNumber
    ) {
      setError("Select an employee.");
      return;
    }

    setSaving(true);

    try {
      const response = await apiRequest(
        "/api/leave/entitlements/provisioning-preview",
        {
          method: "POST",
          body: JSON.stringify({
            leaveYear: Number(
              provisioning.leaveYear
            ),
            policyIds: provisioning.policyIds,
            employeeNumbers: selectedEmployeeNumbers,
          }),
        }
      );

      setPreview(response.data);
    } catch (previewError) {
      setError(
        previewError.message ||
          "Unable to preview entitlement provisioning."
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmProvisioning() {
    if (!preview?.summary?.ready) {
      setError(
        "There are no missing eligible entitlements to provision."
      );
      return;
    }

    if (preview.summary.conflicts) {
      setError(
        "Resolve policy conflicts before provisioning. Select only one policy for each leave type."
      );
      return;
    }

    if (!provisioning.reason.trim()) {
      setError(
        "Enter a provisioning reason for the audit record."
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await apiRequest(
        "/api/leave/entitlements/provision",
        {
          method: "POST",
          body: JSON.stringify({
            leaveYear: Number(
              provisioning.leaveYear
            ),
            policyIds: provisioning.policyIds,
            employeeNumbers: selectedEmployeeNumbers,
            reason: provisioning.reason,
          }),
        }
      );

      setMessage(
        `${response.data?.createdCount || 0} entitlement(s) provisioned. Existing balances were preserved.`
      );
      setProvisioningOpen(false);
      setPreview(null);
      setProvisioning({
        leaveYear: currentYear(),
        policyIds: [],
        employeeScope: "ALL",
        employeeNumber: "",
        reason:
          "Initial policy-derived entitlement allocation",
      });
      await load();
      window.setTimeout(() => setMessage(""), 4500);
    } catch (provisionError) {
      setError(
        provisionError.message ||
          "Unable to provision entitlements."
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjustment(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await apiRequest(
        "/api/leave/entitlements/adjustments",
        {
          method: "POST",
          body: JSON.stringify({
            employeeNumber: selected.employeeNumber,
            leavePolicyId: selected.policyId,
            leaveYear: selected.leaveYear,
            amount: Number(form.amount),
            reason: form.reason,
            effectiveDate: form.effectiveDate,
          }),
        }
      );

      setMessage(
        "Entitlement adjustment recorded. Corrections require a new offsetting adjustment."
      );
      setSelected(null);
      setForm({
        amount: "",
        reason: "",
        effectiveDate: today(),
      });
      await load();
      window.setTimeout(() => setMessage(""), 4500);
    } catch (saveError) {
      setError(
        saveError.message ||
          "Unable to record entitlement adjustment."
      );
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: "employeeName",
      label: "Employee",
      render: (row) =>
        `${row.employeeName} (${row.employeeNumber})`,
    },
    {
      key: "policyName",
      label: "Policy",
      render: (row) =>
        `${row.policyName} v${row.policyVersion}`,
    },
    {
      key: "entitlement",
      label: "Entitlement",
      render: (row) =>
        `${Number(row.entitlement)} ${readableUnit(
          row.unit
        )}`,
    },
    { key: "used", label: "Used" },
    { key: "committed", label: "Committed" },
    {
      key: "adjustments",
      label: "Adjustment",
      render: (row) =>
        Number(row.adjustments || 0).toLocaleString(),
    },
    { key: "available", label: "Available" },
    {
      key: "provisioningStatus",
      label: "Provisioning",
      render: (row) =>
        row.provisioningStatus === "PROVISIONED"
          ? "Provisioned"
          : "Not provisioned",
    },
    {
      key: "other",
      label: "Other Active Policies",
      render: (row) =>
        row.otherActivePolicies
          ?.map((item) => item.name)
          .join(", ") || "—",
    },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <button
          type="button"
          disabled={
            !canManage ||
            row.provisioningStatus !== "PROVISIONED"
          }
          style={{
            ...styles.primary,
            opacity:
              canManage &&
              row.provisioningStatus === "PROVISIONED"
                ? 1
                : 0.5,
          }}
          title={
            row.provisioningStatus !== "PROVISIONED"
              ? "Provision this entitlement before recording an adjustment."
              : ""
          }
          onClick={() => setSelected(row)}
        >
          Adjust
        </button>
      ),
    },
  ];

  const historyColumns = [
    {
      key: "employee",
      label: "Employee",
      render: (row) =>
        `${employeeName(row.employee)} (${
          row.employee?.employeeNumber
        })`,
    },
    {
      key: "policy",
      label: "Policy",
      render: (row) =>
        row.leavePolicy
          ? `${row.leavePolicy.name} v${row.leavePolicy.versionNumber}`
          : row.leaveType?.name,
    },
    {
      key: "amount",
      label: "Signed Adjustment",
      render: (row) =>
        Number(row.amount) > 0
          ? `+${Number(row.amount)}`
          : Number(row.amount),
    },
    { key: "reason", label: "Reason" },
    {
      key: "effectiveDate",
      label: "Effective",
      render: (row) =>
        new Date(row.effectiveDate).toLocaleDateString(),
    },
    {
      key: "createdBy",
      label: "Recorded By",
      render: (row) =>
        [
          row.createdBy?.firstName,
          row.createdBy?.lastName,
        ]
          .filter(Boolean)
          .join(" ") || "System",
    },
  ];

  const previewColumns = [
    {
      key: "employee",
      label: "Employee",
      render: (row) =>
        `${row.employeeName} (${row.employeeNumber})`,
    },
    {
      key: "policy",
      label: "Policy",
      render: (row) =>
        `${row.policyName} v${row.policyVersion}`,
    },
    {
      key: "entitlement",
      label: "Proposed Entitlement",
      render: (row) =>
        `${Number(
          row.proposedOpeningBalance
        )} ${readableUnit(row.unit)}`,
    },
    { key: "status", label: "Status" },
    { key: "message", label: "Result" },
  ];

  return (
    <LeavePage
      title="Leave Entitlements"
      description="Provision policy-derived annual entitlements, review authoritative balances and record controlled adjustments."
      actions={
        <button
          type="button"
          disabled={!canManage}
          style={{
            ...styles.primary,
            opacity: canManage ? 1 : 0.5,
          }}
          onClick={() => {
            setError("");
            setPreview(null);
            setProvisioningOpen(true);
          }}
        >
          Provision Entitlements
        </button>
      }
    >
      {!permissionLoading && !canManage && (
        <Notice error>
          Read-only access: leave.manage is required to
          provision or adjust entitlements.
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}

      <Panel
        title="Employee Entitlements"
        subtitle="Committed means PENDING requests only. APPROVED and ACTIVE leave is already represented in Used."
      >
        <Table
          rows={rows}
          columns={columns}
          empty="No eligible employee-policy combinations are currently produced by active tenant policies."
        />
      </Panel>

      <Panel
        title="Adjustment History"
        subtitle="Append-only audit history. Corrections are recorded as reversing or offsetting entries."
      >
        <Table
          rows={history}
          columns={historyColumns}
          empty="No entitlement adjustments have been recorded."
        />
      </Panel>

      {provisioningOpen && (
        <div
          style={overlay}
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget &&
            setProvisioningOpen(false)
          }
        >
          <form
            style={provisioningModal}
            onSubmit={previewProvisioning}
          >
            <header style={modalHeader}>
              <div>
                <h2 style={{ margin: 0 }}>
                  Provision Entitlements
                </h2>
                <p style={styles.muted}>
                  Create only missing employee-policy/year
                  balances. Existing balances and usage are
                  preserved.
                </p>
              </div>
              <button
                type="button"
                style={styles.button}
                onClick={() =>
                  setProvisioningOpen(false)
                }
              >
                Close
              </button>
            </header>

            <label>
              Leave Year
              <input
                style={styles.input}
                type="number"
                min="2000"
                max="2200"
                value={provisioning.leaveYear}
                onChange={(event) => {
                  setPreview(null);
                  setProvisioning({
                    ...provisioning,
                    leaveYear: event.target.value,
                  });
                }}
                required
              />
            </label>

            <fieldset style={fieldset}>
              <legend>Active Tenant Policies *</legend>
              <p style={styles.muted}>
                CHRIS recommended policies that clients use
                or clone become customizable tenant policies.
                Custom policies use the same engine and
                provisioning workflow.
              </p>
              <div style={checkGrid}>
                {policies.map((policy) => (
                  <label
                    key={policy.id}
                    style={checkOption}
                  >
                    <input
                      type="checkbox"
                      checked={provisioning.policyIds.includes(
                        policy.id
                      )}
                      onChange={() =>
                        togglePolicy(policy.id)
                      }
                    />
                    <span>
                      <strong>{policy.name}</strong>
                      <small
                        style={{
                          ...styles.muted,
                          display: "block",
                        }}
                      >
                        {policy.leaveType?.name} · Version{" "}
                        {policy.versionNumber} ·{" "}
                        {Number(policy.entitlementDays)}{" "}
                        {readableUnit(
                          policy.entitlementRules?.unit ||
                            policy.leaveType?.unit
                        )}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              {!policies.length && (
                <Notice error>
                  No active tenant policies are available.
                  Use, clone and customize a CHRIS policy or
                  activate a Custom Policy under Leave
                  Policies.
                </Notice>
              )}
            </fieldset>

            <fieldset style={fieldset}>
              <legend>Employee Scope *</legend>
              <label style={radioOption}>
                <input
                  type="radio"
                  name="employeeScope"
                  value="ALL"
                  checked={
                    provisioning.employeeScope === "ALL"
                  }
                  onChange={() => {
                    setPreview(null);
                    setProvisioning({
                      ...provisioning,
                      employeeScope: "ALL",
                      employeeNumber: "",
                    });
                  }}
                />
                All eligible current employees
              </label>
              <label style={radioOption}>
                <input
                  type="radio"
                  name="employeeScope"
                  value="SINGLE"
                  checked={
                    provisioning.employeeScope === "SINGLE"
                  }
                  onChange={() => {
                    setPreview(null);
                    setProvisioning({
                      ...provisioning,
                      employeeScope: "SINGLE",
                    });
                  }}
                />
                One employee
              </label>

              {provisioning.employeeScope === "SINGLE" && (
                <select
                  style={styles.input}
                  value={provisioning.employeeNumber}
                  onChange={(event) => {
                    setPreview(null);
                    setProvisioning({
                      ...provisioning,
                      employeeNumber: event.target.value,
                    });
                  }}
                  required
                >
                  <option value="">
                    Select employee
                  </option>
                  {employees.map((employee) => (
                    <option
                      key={employee.id}
                      value={employee.employeeNumber}
                    >
                      {employee.employeeNumber} —{" "}
                      {employeeName(employee)}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>

            <label>
              Provisioning Reason *
              <textarea
                style={{
                  ...styles.input,
                  minHeight: 72,
                }}
                value={provisioning.reason}
                onChange={(event) =>
                  setProvisioning({
                    ...provisioning,
                    reason: event.target.value,
                  })
                }
                required
              />
            </label>

            {preview && (
              <section style={previewPanel}>
                <h3>Provisioning Preview</h3>
                <div style={summaryGrid}>
                  <Summary
                    label="Ready"
                    value={preview.summary.ready}
                  />
                  <Summary
                    label="Existing—preserved"
                    value={preview.summary.existing}
                  />
                  <Summary
                    label="Ineligible"
                    value={preview.summary.ineligible}
                  />
                  <Summary
                    label="Policy conflicts"
                    value={preview.summary.conflicts}
                  />
                </div>
                <Table
                  rows={preview.rows}
                  columns={previewColumns}
                  empty="No employee-policy rows were produced."
                />
              </section>
            )}

            <div style={modalActions}>
              <button
                type="button"
                style={styles.button}
                onClick={() =>
                  setProvisioningOpen(false)
                }
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={styles.button}
              >
                {saving ? "Checking..." : "Preview"}
              </button>
              {preview && (
                <button
                  type="button"
                  disabled={
                    saving ||
                    !preview.summary.ready ||
                    preview.summary.conflicts > 0
                  }
                  style={{
                    ...styles.primary,
                    opacity:
                      !saving &&
                      preview.summary.ready &&
                      !preview.summary.conflicts
                        ? 1
                        : 0.5,
                  }}
                  onClick={confirmProvisioning}
                >
                  {saving
                    ? "Provisioning..."
                    : "Confirm Provisioning"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {selected && (
        <div
          style={overlay}
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget &&
            setSelected(null)
          }
        >
          <form style={modal} onSubmit={submitAdjustment}>
            <h2 style={{ marginTop: 0 }}>
              Adjust Entitlement
            </h2>
            <p style={styles.muted}>
              {selected.employeeName} ·{" "}
              {selected.policyName} · {selected.leaveYear}
            </p>
            <label>
              Signed Adjustment
              <input
                style={styles.input}
                type="number"
                step="0.5"
                value={form.amount}
                onChange={(event) =>
                  setForm({
                    ...form,
                    amount: event.target.value,
                  })
                }
                required
              />
            </label>
            <small style={styles.muted}>
              Use a positive amount to add and a negative
              amount to offset. Existing records cannot be
              edited or deleted.
            </small>
            <label>
              Effective Date
              <input
                style={styles.input}
                type="date"
                value={form.effectiveDate}
                onChange={(event) =>
                  setForm({
                    ...form,
                    effectiveDate: event.target.value,
                  })
                }
                required
              />
            </label>
            <label>
              Reason
              <textarea
                style={{
                  ...styles.input,
                  minHeight: 90,
                }}
                value={form.reason}
                onChange={(event) =>
                  setForm({
                    ...form,
                    reason: event.target.value,
                  })
                }
                required
              />
            </label>
            <div style={modalActions}>
              <button
                type="button"
                style={styles.button}
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={styles.primary}
              >
                {saving
                  ? "Recording..."
                  : "Record Adjustment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </LeavePage>
  );
}

function Summary({ label, value }) {
  return (
    <div style={summaryCard}>
      <small style={styles.muted}>{label}</small>
      <strong style={{ display: "block", fontSize: 20 }}>
        {Number(value || 0)}
      </strong>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  zIndex: 1200,
  display: "grid",
  placeItems: "center",
  padding: 16,
  background: "rgba(0,0,0,.76)",
};

const modal = {
  width: "min(100%,540px)",
  display: "grid",
  gap: 12,
  padding: 20,
  borderRadius: 16,
  border: "1px solid var(--chris-border-gold)",
  background: "#07150E",
  color: "var(--chris-text-main)",
};

const provisioningModal = {
  ...modal,
  width: "min(960px,calc(100vw - 32px))",
  maxHeight: "calc(100dvh - 32px)",
  overflowY: "auto",
};

const modalHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  position: "sticky",
  top: -20,
  zIndex: 3,
  padding: "14px 0",
  background: "#07150E",
};

const modalActions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  position: "sticky",
  bottom: -20,
  padding: "12px 0",
  background: "#07150E",
};

const fieldset = {
  minWidth: 0,
  display: "grid",
  gap: 10,
  padding: 14,
  borderRadius: 12,
  border: "1px solid var(--chris-border-soft)",
};

const checkGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(260px,1fr))",
  gap: 8,
};

const checkOption = {
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  padding: 10,
  borderRadius: 9,
  background: "rgba(255,255,255,.035)",
};

const radioOption = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const previewPanel = {
  display: "grid",
  gap: 10,
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--chris-border-gold)",
};

const summaryGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(130px,1fr))",
  gap: 8,
};

const summaryCard = {
  padding: 10,
  borderRadius: 9,
  background: "rgba(212,175,55,.07)",
};
