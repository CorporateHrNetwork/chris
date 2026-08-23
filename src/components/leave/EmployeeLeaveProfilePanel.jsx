/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import useAuthorization from "../../hooks/useAuthorization";
import { apiRequest } from "../../services/api";
import {
  Notice,
  StatusBadge,
  formatDate,
  styles,
} from "./LeaveUi";

function readableUnit(unit) {
  return String(unit || "units")
    .replaceAll("_", " ")
    .toLowerCase();
}

function employeeName(employee) {
  return [
    employee?.firstName,
    employee?.middleName,
    employee?.lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function EmployeeLeaveProfilePanel({
  employeeNumber,
  open,
  onClose,
}) {
  const navigate = useNavigate();
  const { hasPermission } = useAuthorization();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canRequest =
    hasPermission("leave.request") ||
    hasPermission("leave.manage");
  const canManage = hasPermission("leave.manage");

  useEffect(() => {
    if (!open) return undefined;

    let active = true;
    setLoading(true);
    setError("");

    apiRequest(
      `/api/leave/employees/${encodeURIComponent(
        employeeNumber
      )}/profile`
    )
      .then((response) => {
        if (active) setData(response.data);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.message ||
              "Unable to load employee Leave Profile."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [employeeNumber, open]);

  if (!open) return null;

  const employee = data?.employee;

  return (
    <div
      style={overlay}
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <section
        style={modal}
        role="dialog"
        aria-modal="true"
        aria-label="Employee Leave Profile"
      >
        <header style={header}>
          <div>
            <b style={{ color: "var(--chris-gold)" }}>
              EMPLOYEE LEAVE PROFILE
            </b>
            <h2 style={{ margin: "6px 0" }}>
              {employee
                ? employeeName(employee)
                : employeeNumber}
            </h2>
            {employee && (
              <div style={styles.muted}>
                {employee.employeeNumber} ·{" "}
                {employee.department?.name || "No department"} ·{" "}
                {employee.designation?.name || "No designation"} ·{" "}
                {employee.location?.name || "No location"} ·{" "}
                {employee.status}
              </div>
            )}
          </div>

          <button
            type="button"
            style={styles.button}
            onClick={onClose}
          >
            Close
          </button>
        </header>

        {loading && (
          <div style={styles.empty}>
            Loading Leave Profile...
          </div>
        )}

        {error && <Notice error>{error}</Notice>}

        {data && (
          <>
            {data.exceptionWarnings?.length > 0 && (
              <Notice error>
                {data.exceptionWarnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </Notice>
            )}

            <div style={quickActions}>
              {canRequest && (
                <button
                  type="button"
                  style={styles.primary}
                  onClick={() =>
                    navigate(
                      `/leave/requests?employeeNumber=${encodeURIComponent(
                        employeeNumber
                      )}`
                    )
                  }
                >
                  New Leave Request
                </button>
              )}
              <button
                type="button"
                style={styles.button}
                onClick={() => navigate("/leave/requests")}
              >
                View All Leave Requests
              </button>
              {canManage && (
                <>
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() =>
                      navigate(
                        `/leave/entitlements?employeeNumber=${encodeURIComponent(
                          employeeNumber
                        )}`
                      )
                    }
                  >
                    Adjust Entitlement
                  </button>
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => navigate("/leave/requests")}
                  >
                    Commence Leave
                  </button>
                  <button
                    type="button"
                    style={styles.button}
                    onClick={() => navigate("/leave/returns")}
                  >
                    Return to Work
                  </button>
                </>
              )}
            </div>

            <div style={definitionGrid}>
              {Object.entries(
                data.balanceDefinitions || {}
              ).map(([key, value]) => (
                <div key={key}>
                  <strong
                    style={{
                      textTransform: "capitalize",
                      color: "var(--chris-gold)",
                    }}
                  >
                    {key}
                  </strong>
                  <div style={styles.muted}>{value}</div>
                </div>
              ))}
            </div>

            <ProfileSection title="Applicable Policies & Balances">
              {data.balances?.length ? (
                <div style={cardGrid}>
                  {data.balances.map((row) => {
                    const assigned =
                      data.assignedPolicies?.find(
                        (policy) =>
                          policy.id === row.policyId
                      );

                    return (
                      <article
                        key={row.policyId}
                        style={card}
                      >
                        <strong>{row.policyName}</strong>
                        <small style={styles.muted}>
                          Version{" "}
                          {assigned?.versionNumber || "-"} ·{" "}
                          {row.leaveYear} ·{" "}
                          {readableUnit(row.unit)}
                        </small>
                        <div style={metrics}>
                          <Metric
                            label="Entitlement"
                            value={row.entitlement}
                          />
                          <Metric
                            label="Carryover"
                            value={row.carryover}
                          />
                          <Metric
                            label="Adjustments"
                            value={row.adjustment}
                          />
                          <Metric
                            label="Used"
                            value={row.used}
                          />
                          <Metric
                            label="Committed"
                            value={row.committed}
                          />
                          <Metric
                            label="Available"
                            value={row.available}
                          />
                          <Metric
                            label="Maximum Requestable"
                            value={row.maximumRequestable}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div style={styles.empty}>
                  No active applicable policies.
                </div>
              )}
            </ProfileSection>

            <div style={twoColumns}>
              <ProfileSection title="Active Leave">
                {data.activeLeave ? (
                  <LeaveSummary
                    request={data.activeLeave}
                    active
                  />
                ) : (
                  <div style={styles.empty}>
                    No active leave.
                  </div>
                )}
              </ProfileSection>

              <ProfileSection title="Next Upcoming Approved Leave">
                {data.nextUpcomingApprovedLeave ? (
                  <LeaveSummary
                    request={
                      data.nextUpcomingApprovedLeave
                    }
                  />
                ) : (
                  <div style={styles.empty}>
                    No upcoming approved leave.
                  </div>
                )}
              </ProfileSection>
            </div>

            <ProfileSection title="Utilization History">
              {data.utilizationHistory?.length ? (
                data.utilizationHistory.map((request) => (
                  <div key={request.id} style={historyRow}>
                    <span>
                      {request.leavePolicy?.name ||
                        request.leaveType?.name}
                    </span>
                    <span>
                      {formatDate(request.startDate)} –{" "}
                      {formatDate(request.endDate)}
                    </span>
                    <strong>
                      {Number(request.requestedUnits)}{" "}
                      {readableUnit(
                        request.leavePolicy
                          ?.entitlementRules?.unit ||
                          request.leaveType?.unit
                      )}
                    </strong>
                    <StatusBadge status={request.status} />
                    <small style={styles.muted}>
                      Approved:{" "}
                      {request.reviewedAt
                        ? formatDate(request.reviewedAt)
                        : "—"}
                      <br />
                      Commenced:{" "}
                      {request.commencedAt
                        ? formatDate(request.commencedAt)
                        : "—"}
                      <br />
                      Returned:{" "}
                      {request.returnedAt
                        ? formatDate(
                            request.returnedAt
                          )
                        : "—"}
                    </small>
                  </div>
                ))
              ) : (
                <div style={styles.empty}>
                  No utilization history.
                </div>
              )}
            </ProfileSection>
          </>
        )}
      </section>
    </div>
  );
}

function ProfileSection({ title, children }) {
  return (
    <section style={section}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <small style={styles.muted}>{label}</small>
      <strong
        style={{ display: "block", fontSize: 18 }}
      >
        {Number(value || 0)}
      </strong>
    </div>
  );
}

function LeaveSummary({ request, active = false }) {
  return (
    <div>
      <StatusBadge status={request.status} />
      <p>
        {request.leavePolicy?.name ||
          request.leaveType?.name}
      </p>
      <strong>
        {formatDate(
          active
            ? request.commencedAt || request.startDate
            : request.startDate
        )}{" "}
        – {formatDate(request.endDate)}
      </strong>
      <div style={styles.muted}>
        {Number(request.requestedUnits)}{" "}
        {readableUnit(
          request.leavePolicy?.entitlementRules?.unit ||
            request.leaveType?.unit
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  zIndex: 1400,
  display: "grid",
  placeItems: "center",
  padding: 16,
  background: "rgba(0,0,0,.78)",
};

const modal = {
  width: "min(1100px,100%)",
  maxHeight: "calc(100dvh - 28px)",
  overflowY: "auto",
  padding: 20,
  borderRadius: 18,
  border: "1px solid var(--chris-border-gold)",
  background: "#07150E",
  color: "var(--chris-text-main)",
};

const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  position: "sticky",
  top: -20,
  padding: "16px 0",
  zIndex: 2,
  background: "#07150E",
};

const quickActions = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 12,
};

const section = {
  padding: 15,
  marginTop: 14,
  border: "1px solid var(--chris-border-soft)",
  borderRadius: 12,
  background: "rgba(255,255,255,.025)",
};

const definitionGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(170px,1fr))",
  gap: 10,
  padding: 12,
  borderRadius: 10,
  background: "rgba(212,175,55,.07)",
};

const cardGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(260px,1fr))",
  gap: 10,
};

const card = {
  display: "grid",
  gap: 7,
  padding: 13,
  borderRadius: 10,
  border: "1px solid var(--chris-border-soft)",
};

const metrics = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(105px,1fr))",
  gap: 8,
};

const twoColumns = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(280px,1fr))",
  gap: 14,
};

const historyRow = {
  display: "grid",
  gridTemplateColumns:
    "minmax(150px,1fr) minmax(180px,1fr) auto auto minmax(130px,auto)",
  alignItems: "center",
  gap: 12,
  padding: "10px 0",
  borderBottom:
    "1px solid rgba(255,255,255,.06)",
};
