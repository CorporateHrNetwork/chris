import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaCalendarAlt,
  FaClipboardList,
  FaLayerGroup,
  FaBalanceScale,
  FaFileAlt,
  FaUmbrellaBeach,
} from "react-icons/fa";

import { apiRequest } from "../services/api";
import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";

function LeaveDashboard() {
  const navigate = useNavigate();

  const [types, setTypes] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setError("");

      try {
        const [typeResult, policyResult] =
          await Promise.all([
            apiRequest("/api/leave/types"),
            apiRequest("/api/leave/policies"),
          ]);

        if (!active) return;

        setTypes(
          Array.isArray(typeResult?.data)
            ? typeResult.data
            : []
        );

        setPolicies(
          Array.isArray(policyResult?.data)
            ? policyResult.data
            : []
        );
      } catch (err) {
        if (!active) return;

        setError(
          err?.message ||
            "Unable to load leave dashboard data."
        );
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const activeTypes = useMemo(
    () =>
      types.filter(
        (item) =>
          item.isActive !== false
      ),
    [types]
  );

  const activePolicies = useMemo(
    () =>
      policies.filter(
        (item) =>
          item.isActive !== false
      ),
    [policies]
  );

  const configuredEntitlementDays =
    useMemo(
      () =>
        activePolicies.reduce(
          (total, policy) =>
            total +
            Number(
              policy.entitlementDays ||
                0
            ),
          0
        ),
      [activePolicies]
    );

  const policiesByType = useMemo(() => {
    const result = {};

    activePolicies.forEach(
      (policy) => {
        const name =
          policy.leaveType?.name ||
          policy.name ||
          "Leave Policy";

        result[name] =
          (result[name] || 0) + 1;
      }
    );

    return result;
  }, [activePolicies]);

  const activity = useMemo(
    () => [
      {
        id: "leave-types",
        icon: <FaLayerGroup />,
        title:
          "Leave Types",
        description:
          `${activeTypes.length} active leave type${activeTypes.length === 1 ? "" : "s"} configured.`,
        time:
          "Current",
      },
      {
        id: "leave-policies",
        icon: <FaFileAlt />,
        title:
          "Leave Policies",
        description:
          `${activePolicies.length} active polic${activePolicies.length === 1 ? "y" : "ies"} available.`,
        time:
          "Current",
      },
      {
        id: "leave-entitlement",
        icon: <FaBalanceScale />,
        title:
          "Configured Entitlement",
        description:
          `${configuredEntitlementDays} total entitlement day${configuredEntitlementDays === 1 ? "" : "s"} across active policies.`,
        time:
          "Current",
      },
      {
        id: "leave-workflow",
        icon: <FaClipboardList />,
        title:
          "Request Workflow",
        description:
          "Request analytics will expand when a leave-request listing endpoint is activated.",
        time:
          "Planned",
        tone:
          "warning",
      },
    ],
    [
      activeTypes.length,
      activePolicies.length,
      configuredEntitlementDays,
    ]
  );

  return (
    <>
      {error ? (
        <div
          style={{
            marginBottom: 18,
            padding: "12px 16px",
            borderRadius: 12,
            border:
              "1px solid rgba(212,175,55,.30)",
            background:
              "rgba(212,175,55,.07)",
            color:
              "var(--chris-warning)",
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      ) : null}

      <ModuleDashboardShell
        eyebrow="PEOPLE OPERATIONS"
        title="Leave Dashboard"
        description="Monitor leave configuration, entitlements, policy readiness and workforce leave operations from one analytical home."
        metrics={[
          <DashboardCard
            key="types"
            title="Leave Types"
            value={activeTypes.length}
            subtitle="Active leave categories"
            icon={<FaUmbrellaBeach />}
            tone="green"
          />,
          <DashboardCard
            key="policies"
            title="Active Policies"
            value={activePolicies.length}
            subtitle="Configured leave policies"
            icon={<FaFileAlt />}
            tone="gold"
          />,
          <DashboardCard
            key="entitlements"
            title="Entitlement Days"
            value={configuredEntitlementDays}
            subtitle="Across active policies"
            icon={<FaBalanceScale />}
            tone="green"
          />,
          <DashboardCard
            key="pending"
            title="Pending Requests"
            value="—"
            subtitle="Activates with request analytics"
            icon={<FaClipboardList />}
            tone="gold"
          />,
        ]}
        analytics={
          <AnalyticsPanel
            title="Leave Policy Analytics"
            subtitle="Active policy distribution by leave category."
            icon={<FaUmbrellaBeach />}
            actionLabel="Open Policies"
            onAction={() =>
              navigate(
                "/leave/policies"
              )
            }
          >
            <div
              style={{
                display: "grid",
                gap: 14,
              }}
            >
              {Object.entries(
                policiesByType
              ).length ? (
                Object.entries(
                  policiesByType
                ).map(
                  ([
                    name,
                    count,
                  ]) => (
                    <div
                      key={name}
                      style={{
                        display:
                          "grid",
                        gridTemplateColumns:
                          "minmax(130px, 180px) 1fr 50px",
                        gap: 12,
                        alignItems:
                          "center",
                      }}
                    >
                      <span
                        style={{
                          color:
                            "var(--chris-dashboard-text)",
                          fontWeight:
                            800,
                        }}
                      >
                        {name}
                      </span>

                      <div className="chris-progress">
                        <div
                          className="chris-progress__bar"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (Number(
                                  count
                                ) /
                                  Math.max(
                                    1,
                                    activePolicies.length
                                  )) *
                                  100
                              )
                            )}%`,
                          }}
                        />
                      </div>

                      <strong
                        style={{
                          color:
                            "var(--chris-dashboard-gold-bright)",
                          textAlign:
                            "right",
                        }}
                      >
                        {count}
                      </strong>
                    </div>
                  )
                )
              ) : (
                <div className="chris-empty-state">
                  No active leave-policy distribution data yet.
                </div>
              )}
            </div>
          </AnalyticsPanel>
        }
        recentActivity={
          <AnalyticsPanel
            title="Leave Intelligence"
            subtitle="Current configuration and operational readiness indicators."
            icon={<FaClipboardList />}
            actionLabel="Open Balances"
            onAction={() =>
              navigate(
                "/leave/balances"
              )
            }
          >
            <RecentActivityList
              items={activity}
            />
          </AnalyticsPanel>
        }
        quickActions={[
          <QuickActionCard
            key="requests"
            title="Leave Requests"
            subtitle="Create and manage requests"
            icon={<FaClipboardList />}
            onClick={() =>
              navigate(
                "/leave/requests"
              )
            }
          />,
          <QuickActionCard
            key="balances"
            title="Leave Balances"
            subtitle="Review employee balances"
            icon={<FaBalanceScale />}
            onClick={() =>
              navigate(
                "/leave/balances"
              )
            }
          />,
          <QuickActionCard
            key="policies"
            title="Leave Policies"
            subtitle="Review entitlement rules"
            icon={<FaFileAlt />}
            onClick={() =>
              navigate(
                "/leave/policies"
              )
            }
          />,
          <QuickActionCard
            key="calendar"
            title="Leave Calendar"
            subtitle="Planned calendar workspace"
            icon={<FaCalendarAlt />}
            onClick={() => {}}
            disabled
          />,
          <QuickActionCard
            key="entitlements"
            title="Leave Entitlements"
            subtitle="Planned entitlement workspace"
            icon={<FaUmbrellaBeach />}
            onClick={() => {}}
            disabled
          />,
        ]}
      />
    </>
  );
}

export default LeaveDashboard;
