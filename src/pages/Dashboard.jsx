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

import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";

function Dashboard() {
  const [
    employeeSummary,
    setEmployeeSummary,
  ] = useState({
    total: 0,
    active: 0,
    leave: 0,
    probation: 0,
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
    <>
      <DashboardHeader />

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

          color="#0B5E3B"
        />

        <KpiCard
          title="Attendance"
          value="198"
          subtitle="81% Today"
          icon="🕒"
          color="#2563EB"
        />

        <KpiCard
          title="Pending Leave"
          value="12"
          subtitle="Awaiting Approval"
          icon="📅"
          color="#F59E0B"
        />

        {canViewPayroll && (
          <KpiCard
            title="Payroll"
            value="₦15.2M"
            subtitle="Completed"
            icon="💰"
            color="#8B5CF6"
          />
        )}
      </div>

      {/* EMPLOYEE STATUS SUMMARY */}
      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",

          gap: "16px",

          marginTop: "24px",
        }}
      >
        <MiniStat
          title="Active Employees"

          value={
            employeeLoading
              ? "..."
              : employeeSummary.active
          }
        />

        <MiniStat
          title="On Leave"

          value={
            employeeLoading
              ? "..."
              : employeeSummary.leave
          }
        />

        <MiniStat
          title="Probation"

          value={
            employeeLoading
              ? "..."
              : employeeSummary.probation
          }
        />

        <MiniStat
          title="Total Employees"

          value={
            employeeLoading
              ? "..."
              : employeeSummary.total
          }
        />
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
    </>
  );
}

function MiniStat({
  title,
  value,
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",

        border:
          "1px solid #E5E7EB",

        borderRadius: "14px",

        padding: "18px",

        boxShadow:
          "0 5px 18px rgba(15,23,42,0.04)",
      }}
    >
      <div
        style={{
          color: "#64748B",

          fontSize: "12px",

          fontWeight: "700",

          textTransform:
            "uppercase",

          letterSpacing:
            "0.03em",
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: "8px",

          color: "#0B5E3B",

          fontSize: "26px",

          fontWeight: "800",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default Dashboard;