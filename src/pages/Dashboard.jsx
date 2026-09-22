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

function formatNaira(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function Dashboard() {
  /*
    CHRIS_BRANCH_SCOPED_DASHBOARD_KPIS

    The active X-CHRiS-Location-Id is carried automatically by apiRequest.
    Workforce analytics is therefore the authoritative source for dashboard
    attendance and leave counts so those KPIs change with the selected branch.
    Head Office omits the location header and shows the consolidated company.

    Payroll uses /api/payroll/runs as the authoritative calculated-payroll
    source. In branch context that route returns only the active branch totals;
    in Head Office it returns the consolidated organization payroll run.
  */
  const [operationalSummary, setOperationalSummary] = useState({
    attendanceRecords: null,
    pendingLeave: null,
    loading: true,
  });

  useEffect(() => {
    let live = true;

    const loadOperationalSummary = async () => {
      const result = await apiRequest("/api/analytics/workforce");
      if (!live) return;

      setOperationalSummary({
        attendanceRecords: Number(result?.data?.attendance?.recordsToday || 0),
        pendingLeave: Number(result?.data?.leave?.pendingRequests || 0),
        loading: false,
      });
    };

    loadOperationalSummary().catch((error) => {
      console.error("Dashboard operational summary error:", error);
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

  const [employeeSummary, setEmployeeSummary] = useState({
    total: 0,
    active: 0,
    leave: 0,
    probation: 0,
    male: 0,
    female: 0,
    genderPending: 0,
  });

  const [employeeLoading, setEmployeeLoading] = useState(true);

  const {
    hasPermission,
    loading: authorizationLoading,
  } = useAuthorization();

  const canViewPayroll =
    !authorizationLoading && hasPermission("payroll.view");

  const [payrollSummary, setPayrollSummary] = useState({
    latestRun: null,
    loading: false,
    error: false,
  });

  useEffect(() => {
    const loadEmployeeSummary = async () => {
      try {
        setEmployeeLoading(true);

        const result = await apiRequest("/api/employees");
        const employees = result.data || [];

        setEmployeeSummary({
          total: employees.length,
          active: employees.filter((employee) => employee.status === "ACTIVE").length,
          leave: employees.filter((employee) => employee.status === "LEAVE").length,
          probation: employees.filter((employee) => employee.status === "PROBATION").length,
          male: employees.filter((employee) => employee.gender === "MALE").length,
          female: employees.filter((employee) => employee.gender === "FEMALE").length,
          genderPending: employees.filter(
            (employee) => !employee.gender || employee.gender === "UNSPECIFIED"
          ).length,
        });
      } catch (error) {
        console.error("Dashboard employee summary error:", error);
      } finally {
        setEmployeeLoading(false);
      }
    };

    loadEmployeeSummary();
  }, []);

  useEffect(() => {
    if (!canViewPayroll) {
      setPayrollSummary({
        latestRun: null,
        loading: false,
        error: false,
      });
      return undefined;
    }

    let live = true;

    const loadPayrollSummary = async () => {
      try {
        setPayrollSummary((current) => ({
          ...current,
          loading: true,
          error: false,
        }));

        const result = await apiRequest("/api/payroll/runs");
        if (!live) return;

        const runs = Array.isArray(result?.data) ? result.data : [];

        setPayrollSummary({
          latestRun: runs[0] || null,
          loading: false,
          error: false,
        });
      } catch (error) {
        console.error("Dashboard payroll summary error:", error);
        if (live) {
          setPayrollSummary({
            latestRun: null,
            loading: false,
            error: true,
          });
        }
      }
    };

    loadPayrollSummary();

    return () => {
      live = false;
    };
  }, [canViewPayroll]);

  const latestPayrollRun = payrollSummary.latestRun;

  const payrollValue = payrollSummary.loading
    ? "..."
    : payrollSummary.error
    ? "—"
    : latestPayrollRun
    ? formatNaira(latestPayrollRun.netPreviewTotal)
    : "₦0";

  const payrollSubtitle = payrollSummary.loading
    ? "Loading payroll"
    : payrollSummary.error
    ? "Payroll data unavailable"
    : !latestPayrollRun
    ? "No payroll run available"
    : `${latestPayrollRun.periodName || latestPayrollRun.periodCode || "Latest payroll"} · ${
        latestPayrollRun.status || "UNKNOWN"
      } · Net payroll`;

  return (
    <div
      className="chris-dashboard"
      style={{
        position: "relative",
        minHeight: "100%",
      }}
    >
      <DashboardHeader />

      <WorkforceKpis />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "24px",
          marginTop: "30px",
        }}
      >
        <KpiCard
          title="Employees"
          value={employeeLoading ? "..." : String(employeeSummary.total)}
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
              : String(operationalSummary.attendanceRecords)
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
              : String(operationalSummary.pendingLeave)
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
            value={payrollValue}
            subtitle={payrollSubtitle}
            icon="💰"
            color="#8B5CF6"
          />
        )}
      </div>

      <h2
        style={{
          margin: "28px 0 0",
          color: "#F7FAF8",
          fontSize: "17px",
        }}
      >
        Employee Demographics
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginTop: "12px",
        }}
      >
        <MiniStat
          title="Male Employees"
          value={employeeLoading ? "..." : employeeSummary.male}
        />
        <MiniStat
          title="Female Employees"
          value={employeeLoading ? "..." : employeeSummary.female}
        />
        <MiniStat
          title="Gender Data Pending"
          value={employeeLoading ? "..." : employeeSummary.genderPending}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
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
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
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
          gridTemplateColumns: canViewPayroll
            ? "repeat(auto-fit, minmax(360px, 1fr))"
            : "1fr",
          gap: "20px",
          marginTop: "20px",
        }}
      >
        <QuickActions />
        {canViewPayroll && <PayrollSummary summary={payrollSummary} />}
      </div>
    </div>
  );
}

function MiniStat({ title, value }) {
  return (
    <div
      className="chris-mini-stat"
      style={{
        background:
          "radial-gradient(circle at 18% 0%, rgba(36,217,118,.13), transparent 30%), linear-gradient(145deg, #063722, #02170f)",
        border:
          "1px solid var(--tenant-border, var(--chris-border-gold, rgba(212,175,55,.20)))",
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
          textTransform: "uppercase",
          letterSpacing: "0.03em",
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
