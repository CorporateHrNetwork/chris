import {
  useEffect,
  useState,
} from "react";

import DashboardHeader from "../components/dashboard/DashboardHeader";
import KpiCard from "../components/dashboard/KpiCard";
import AttendanceChart from "../components/dashboard/AttendanceChart";
import LeaveCalendar from "../components/dashboard/LeaveCalendar";
import RecentEmployees from "../components/dashboard/RecentEmployees";
import Announcements from "../components/dashboard/Announcements";
import QuickActions from "../components/dashboard/QuickActions";
import PayrollSummary from "../components/dashboard/PayrollSummary";
import WorkforceKpis from "../components/dashboard/WorkforceKpis";

import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";

function Dashboard() {
  /*
    CHRIS_TENANT_SCOPED_DASHBOARD_KPIS

    Attendance and leave use authenticated APIs whose server-side
    queries resolve organizationId from the signed-in tenant context.

    Payroll must not display fabricated financial data.
  */
  const [operationalSummary, setOperationalSummary] = useState({
    attendanceRecords: null,
    pendingLeave: null,
    loading: true,
  });

  useEffect(() => {
    let live = true;

    const loadOperationalSummary = async () => {
      const now = new Date();
      const date =
        now.getFullYear() + "-" +
        String(now.getMonth() + 1).padStart(2, "0") + "-" +
        String(now.getDate()).padStart(2, "0");

      const [attendanceResult, leaveResult] =
        await Promise.allSettled([
          apiRequest(
            "/api/attendance/report?from=" +
              date +
              "&to=" +
              date
          ),
          apiRequest("/api/leave/requests"),
        ]);

      if (!live) return;

      const attendanceRecords =
        attendanceResult.status === "fulfilled"
          ? Number(
              attendanceResult.value?.data?.totals?.records ||
                0
            )
          : null;

      const leaveRows =
        leaveResult.status === "fulfilled" &&
        Array.isArray(leaveResult.value?.data)
          ? leaveResult.value.data
          : null;

      const pendingLeave =
        leaveRows === null
          ? null
          : leaveRows.filter(
              (request) =>
                request.status === "PENDING"
            ).length;

      setOperationalSummary({
        attendanceRecords,
        pendingLeave,
        loading: false,
      });
    };

    loadOperationalSummary().catch((error) => {
      console.error(
        "Dashboard operational summary error:",
        error
      );

      if (live) {
        setOperationalSummary({
          attendanceRecords: null,
          pendingLeave: null,
          loading: false,
        });
      }
    });

    return () => {
      live = false;
    };
  }, []);
  const [
    employeeSummary,
    setEmployeeSummary,
  ] = useState({
    total: 0,
    active: 0,
    leave: 0,
    probation: 0,
    male: 0,
    female: 0,
    genderPending: 0,
  });

  const [
    employeeLoading,
    setEmployeeLoading,
  ] = useState(true);

  const {
    hasPermission,
    loading: authorizationLoading,
  } = useAuthorization();

  const canViewPayroll =
    !authorizationLoading &&
    hasPermission("payroll.view");

  useEffect(() => {
    const loadEmployeeSummary =
      async () => {
        try {
          setEmployeeLoading(true);

          const result =
            await apiRequest(
              "/api/employees"
            );

          const employees =
            result.data || [];

          setEmployeeSummary({
            total:
              employees.length,

            active:
              employees.filter(
                (employee) =>
                  employee.status ===
                  "ACTIVE"
              ).length,

            leave:
              employees.filter(
                (employee) =>
                  employee.status ===
                  "LEAVE"
              ).length,

            probation:
              employees.filter(
                (employee) =>
                  employee.status ===
                  "PROBATION"
              ).length,
            male:
              employees.filter((employee) => employee.gender === "MALE").length,

            female:
              employees.filter((employee) => employee.gender === "FEMALE").length,

            genderPending:
              employees.filter(
                (employee) => !employee.gender || employee.gender === "UNSPECIFIED"
              ).length,
          });
        } catch (error) {
          console.error(
            "Dashboard employee summary error:",
            error
          );
        } finally {
          setEmployeeLoading(false);
        }
      };

    loadEmployeeSummary();
  }, []);

  return (
    <div className="chris-dashboard"
      style={{
        position: "relative",
        minHeight: "100%",
      }}
    >
      <DashboardHeader />

      <WorkforceKpis />

      {/* KPI CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "24px",
          marginTop: "30px",
        }}
      >
        <KpiCard
          title="Employees"
          value={
            employeeLoading
              ? "..."
              : String(
                  employeeSummary.total
                )
          }
          subtitle={
            employeeLoading
              ? "Loading employee data"
              : `${employeeSummary.active} Active • ${employeeSummary.probation} Probation`
          }
          icon="👥"
          color="var(--chris-green, #087A43)"
        />

        <KpiCard
          title="Attendance"
          value={
              operationalSummary.loading
                ? "..."
                : operationalSummary.attendanceRecords === null
                ? "—"
                : String(
                    operationalSummary.attendanceRecords
                  )
            }
          subtitle={
              operationalSummary.loading
                ? "Loading attendance"
                : operationalSummary.attendanceRecords === null
                ? "Attendance unavailable"
                : "Attendance records today"
            }
          icon="🕒"
          color="#2563EB"
        />

        <KpiCard
          title="Pending Leave"
          value={
              operationalSummary.loading
                ? "..."
                : operationalSummary.pendingLeave === null
                ? "—"
                : String(
                    operationalSummary.pendingLeave
                  )
            }
          subtitle={
              operationalSummary.loading
                ? "Loading leave requests"
                : operationalSummary.pendingLeave === null
                ? "Leave data unavailable"
                : "Awaiting Approval"
            }
          icon="📅"
          color="var(--chris-gold, #D4AF37)"
        />

        {canViewPayroll && (
          <KpiCard
            title="Payroll"
            value={
                employeeLoading
                  ? "..."
                  : employeeSummary.total === 0
                  ? "₦0"
                  : "—"
              }
            subtitle={
                employeeLoading
                  ? "Loading workforce"
                  : employeeSummary.total === 0
                  ? "No payroll records"
                  : "Awaiting authoritative payroll-run data"
              }
            icon="💰"
            color="#8B5CF6"
          />
        )}
      </div>

      {/* EMPLOYEE DEMOGRAPHICS */}
      <h2 style={{ margin: "28px 0 0", color: "#F7FAF8", fontSize: "17px" }}>Employee Demographics</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginTop: "12px" }}>
        <MiniStat title="Male Employees" value={employeeLoading ? "..." : employeeSummary.male} />
        <MiniStat title="Female Employees" value={employeeLoading ? "..." : employeeSummary.female} />
        <MiniStat title="Gender Data Pending" value={employeeLoading ? "..." : employeeSummary.genderPending} />
      </div>

      {/* DASHBOARD CONTENT */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "20px",
          marginTop: "35px",
        }}
      >
        <AttendanceChart />
        <LeaveCalendar />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "20px",
          marginTop: "20px",
        }}
      >
        <RecentEmployees />
        <Announcements />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            canViewPayroll
              ? "repeat(auto-fit, minmax(360px, 1fr))"
              : "1fr",
          gap: "20px",
          marginTop: "20px",
        }}
      >
        <QuickActions />

        {canViewPayroll && (
          <PayrollSummary />
        )}
      </div>
    </div>
  );
}

function MiniStat({
  title,
  value,
}) {
  return (
    <div className="chris-mini-stat"
      style={{
        background:
          "radial-gradient(circle at 18% 0%, rgba(36,217,118,.13), transparent 30%), linear-gradient(145deg, #063722, #02170f)",
        border: "1px solid var(--tenant-border, var(--chris-border-gold, rgba(212,175,55,.20)))",
        borderRadius: "16px",
        padding: "18px",
        boxShadow:
          "0 10px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.85)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          width: "90px",
          height: "90px",
          right: "-34px",
          top: "-34px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(212,175,55,0.14), transparent 68%)",
        }}
      />

      <div
        style={{
          color: "#F7FAF8",
          fontSize: "12px",
          fontWeight: "700",
          textTransform:
            "uppercase",
          letterSpacing:
            "0.03em",
          position: "relative",
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: "8px",
          color: "#2EE98B",
          fontSize: "26px",
          fontWeight: "800",
          position: "relative",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default Dashboard;
