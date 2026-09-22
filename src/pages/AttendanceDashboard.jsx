import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaUsers,
  FaClock,
  FaBusinessTime,
  FaExclamationTriangle,
  FaClipboardCheck,
  FaCalendarAlt,
} from "react-icons/fa";

import { apiRequest } from "../services/api";
import {
  AnalyticsPanel,
  DashboardCard,
  ModuleDashboardShell,
  QuickActionCard,
  RecentActivityList,
} from "../components/dashboard";

function AttendanceDashboard() {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setError("");

      try {
        const [shiftResult, reportResult] =
          await Promise.all([
            apiRequest("/api/attendance/shifts"),
            apiRequest("/api/attendance/report"),
          ]);

        if (!active) return;

        setShifts(shiftResult?.data || []);
        setReport(reportResult?.data || null);
      } catch (err) {
        if (!active) return;
        setError(
          err?.message ||
            "Unable to load attendance dashboard data."
        );
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const totals = report?.totals || {};

  const present =
    totals.byStatus?.PRESENT ??
    totals.present ??
    0;

  const absent =
    totals.byStatus?.ABSENT ??
    totals.absent ??
    0;

  const attendanceRate = useMemo(() => {
    const records =
      Number(totals.records || 0);

    if (!records) return 0;

    return Math.round(
      (Number(present || 0) /
        records) *
        100
    );
  }, [totals.records, present]);

  const activeShifts =
    shifts.filter(
      (shift) =>
        shift.isActive !== false
    ).length;

  const activity = useMemo(
    () => [
      {
        id: "attendance-records",
        icon: <FaClipboardCheck />,
        title: "Attendance Records",
        description:
          `${totals.records || 0} attendance records available in the current report.`,
        time: "Current",
      },
      {
        id: "late-minutes",
        icon: <FaClock />,
        title: "Lateness",
        description:
          `${totals.lateMinutes || 0} late minutes recorded.`,
        time: "Current",
        tone:
          Number(totals.lateMinutes || 0) > 0
            ? "warning"
            : undefined,
      },
      {
        id: "overtime",
        icon: <FaBusinessTime />,
        title: "Overtime",
        description:
          `${totals.overtimeMinutes || 0} overtime minutes recorded.`,
        time: "Current",
      },
      {
        id: "absence",
        icon: <FaExclamationTriangle />,
        title: "Absence",
        description:
          `${absent} absence record${absent === 1 ? "" : "s"} detected.`,
        time: "Current",
        tone:
          absent > 0
            ? "danger"
            : undefined,
      },
    ],
    [
      totals.records,
      totals.lateMinutes,
      totals.overtimeMinutes,
      absent,
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
        eyebrow="WORKFORCE OPERATIONS"
        title="Time & Attendance Dashboard"
        description="Monitor attendance, shifts, lateness, overtime and workforce attendance exceptions from one analytical home."
        metrics={[
          <DashboardCard
            key="records"
            title="Attendance Records"
            value={totals.records || 0}
            subtitle={`${attendanceRate}% attendance rate`}
            icon={<FaUsers />}
            progress={attendanceRate}
          />,
          <DashboardCard
            key="present"
            title="Present"
            value={present}
            subtitle="Recorded present"
            icon={<FaClipboardCheck />}
            tone="green"
          />,
          <DashboardCard
            key="late"
            title="Late Minutes"
            value={totals.lateMinutes || 0}
            subtitle="Attendance exception"
            icon={<FaClock />}
            tone="gold"
          />,
          <DashboardCard
            key="shifts"
            title="Active Shifts"
            value={activeShifts}
            subtitle="Configured active shifts"
            icon={<FaBusinessTime />}
            tone="green"
          />,
        ]}
        analytics={
          <AnalyticsPanel
            title="Attendance Analytics"
            subtitle="Current attendance distribution and workforce exceptions."
            icon={<FaUsers />}
            actionLabel="Open Register"
            onAction={() =>
              navigate("/attendance/register")
            }
          >
            <div
              style={{
                display: "grid",
                gap: 14,
              }}
            >
              {Object.entries(
                totals.byStatus || {}
              ).length ? (
                Object.entries(
                  totals.byStatus || {}
                ).map(
                  ([status, count]) => (
                    <div
                      key={status}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "140px 1fr 60px",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          color:
                            "var(--chris-dashboard-text)",
                          fontWeight: 800,
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
                                (Number(count) /
                                  Math.max(
                                    1,
                                    Number(
                                      totals.records ||
                                        0
                                    )
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
                          textAlign: "right",
                        }}
                      >
                        {count}
                      </strong>
                    </div>
                  )
                )
              ) : (
                <div className="chris-empty-state">
                  No attendance distribution data yet.
                </div>
              )}
            </div>
          </AnalyticsPanel>
        }
        recentActivity={
          <AnalyticsPanel
            title="Attendance Intelligence"
            subtitle="Operational indicators from the attendance engine."
            icon={<FaExclamationTriangle />}
            actionLabel="Manage Shifts"
            onAction={() =>
              navigate("/attendance/shifts")
            }
          >
            <RecentActivityList
              items={activity}
            />
          </AnalyticsPanel>
        }
        quickActions={[
          <QuickActionCard
            key="register"
            title="Attendance Register"
            subtitle="Capture daily attendance"
            icon={<FaClipboardCheck />}
            onClick={() =>
              navigate("/attendance/register")
            }
          />,
          <QuickActionCard
            key="shifts"
            title="Work Shifts"
            subtitle="Configure shift rules"
            icon={<FaBusinessTime />}
            onClick={() =>
              navigate("/attendance/shifts")
            }
          />,
          <QuickActionCard
            key="schedule"
            title="Shift Schedule"
            subtitle="Review employee shift assignments"
            icon={<FaCalendarAlt />}
            onClick={() =>
              navigate("/attendance/shift-schedule")
            }
          />,
          <QuickActionCard
            key="overtime"
            title="Overtime"
            subtitle="Review overtime analytics"
            icon={<FaClock />}
            onClick={() =>
              navigate("/attendance/overtime")
            }
          />,
        ]}
      />
    </>
  );
}

function formatStatus(value) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

export default AttendanceDashboard;
