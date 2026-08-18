import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaUsers,
  FaUserCheck,
  FaUserClock,
  FaUserTimes,
  FaAddressBook,
  FaUserPlus,
  FaChartPie,
  FaExchangeAlt,
} from "react-icons/fa";

import { apiRequest } from "../services/api";
import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";

function EmployeeDashboard() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setError("");

      try {
        const result = await apiRequest(
          "/api/employees"
        );

        if (!active) return;

        setEmployees(
          Array.isArray(result?.data)
            ? result.data
            : []
        );
      } catch (err) {
        if (!active) return;

        setError(
          err?.message ||
            "Unable to load employee dashboard data."
        );
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    const statusCount = {};

    employees.forEach((employee) => {
      const status =
        String(
          employee.status ||
            "UNSPECIFIED"
        ).toUpperCase();

      statusCount[status] =
        (statusCount[status] || 0) + 1;
    });

    return {
      total:
        employees.length,
      active:
        statusCount.ACTIVE || 0,
      probation:
        statusCount.PROBATION || 0,
      inactive:
        (statusCount.INACTIVE || 0) +
        (statusCount.EXITED || 0),
      statusCount,
    };
  }, [employees]);

  const activity = useMemo(() => {
    const latest =
      [...employees]
        .sort((a, b) => {
          const left =
            new Date(
              a.updatedAt ||
                a.createdAt ||
                0
            ).getTime();

          const right =
            new Date(
              b.updatedAt ||
                b.createdAt ||
                0
            ).getTime();

          return right - left;
        })
        .slice(0, 4);

    if (!latest.length) {
      return [];
    }

    return latest.map(
      (employee, index) => ({
        id:
          employee.id ||
          employee.employeeNumber ||
          index,
        icon:
          <FaUsers />,
        title:
          employee.fullName ||
          [
            employee.firstName,
            employee.middleName,
            employee.lastName,
          ]
            .filter(Boolean)
            .join(" ") ||
          employee.employeeNumber ||
          "Employee",
        description:
          `${employee.employeeNumber || "Employee"} • ${formatStatus(
            employee.status
          )}`,
        time:
          "Recent",
      })
    );
  }, [employees]);

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
        eyebrow="PEOPLE MANAGEMENT"
        title="Employee Dashboard"
        description="Monitor workforce headcount, employee status and people-management activity from the Employees analytical home."
        metrics={[
          <DashboardCard
            key="total"
            title="Employees"
            value={summary.total}
            subtitle="Total employee records"
            icon={<FaUsers />}
            tone="gold"
          />,
          <DashboardCard
            key="active"
            title="Active"
            value={summary.active}
            subtitle="Currently active"
            icon={<FaUserCheck />}
            tone="green"
            progress={
              summary.total
                ? Math.round(
                    (summary.active /
                      summary.total) *
                      100
                  )
                : 0
            }
          />,
          <DashboardCard
            key="probation"
            title="Probation"
            value={summary.probation}
            subtitle="Employees on probation"
            icon={<FaUserClock />}
            tone="gold"
          />,
          <DashboardCard
            key="inactive"
            title="Inactive / Exited"
            value={summary.inactive}
            subtitle="Inactive or exited records"
            icon={<FaUserTimes />}
            tone="green"
          />,
        ]}
        analytics={
          <AnalyticsPanel
            title="Workforce Status"
            subtitle="Distribution of employees by employment status."
            icon={<FaChartPie />}
            actionLabel="Open Directory"
            onAction={() =>
              navigate(
                "/employees/directory"
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
                summary.statusCount
              ).length ? (
                Object.entries(
                  summary.statusCount
                ).map(
                  ([
                    status,
                    count,
                  ]) => (
                    <div
                      key={status}
                      style={{
                        display:
                          "grid",
                        gridTemplateColumns:
                          "140px 1fr 60px",
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
                        {formatStatus(
                          status
                        )}
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
                                    summary.total
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
                  No workforce status data yet.
                </div>
              )}
            </div>
          </AnalyticsPanel>
        }
        recentActivity={
          <AnalyticsPanel
            title="Recent Employee Activity"
            subtitle="Latest employee records updated in CHRIS."
            icon={<FaAddressBook />}
            actionLabel="View Directory"
            onAction={() =>
              navigate(
                "/employees/directory"
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
            key="directory"
            title="Employee Directory"
            subtitle="Browse employee records"
            icon={<FaAddressBook />}
            onClick={() =>
              navigate(
                "/employees/directory"
              )
            }
          />,
          <QuickActionCard
            key="add"
            title="Add Employee"
            subtitle="Open employee directory"
            icon={<FaUserPlus />}
            onClick={() =>
              navigate(
                "/employees/directory"
              )
            }
          />,
          <QuickActionCard
            key="analytics"
            title="Employee Analytics"
            subtitle="Status and workforce insights"
            icon={<FaChartPie />}
            onClick={() => {}}
            disabled
          />,
          <QuickActionCard
            key="transfers"
            title="Transfers"
            subtitle="Planned employee movement"
            icon={<FaExchangeAlt />}
            onClick={() => {}}
            disabled
          />,
        ]}
      />
    </>
  );
}

function formatStatus(value) {
  if (!value) {
    return "Unspecified";
  }

  return String(value)
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

export default EmployeeDashboard;
