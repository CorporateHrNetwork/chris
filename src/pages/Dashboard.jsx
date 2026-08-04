import DashboardHeader from "../components/dashboard/DashboardHeader";
import KpiCard from "../components/dashboard/KpiCard";
import AttendanceChart from "../components/dashboard/AttendanceChart";
import LeaveCalendar from "../components/dashboard/LeaveCalendar";
import RecentEmployees from "../components/dashboard/RecentEmployees";
import Announcements from "../components/dashboard/Announcements";
import QuickActions from "../components/dashboard/QuickActions";
import PayrollSummary from "../components/dashboard/PayrollSummary";
function Dashboard() {
  return (
    <>
      <DashboardHeader />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))",
          gap: "24px",
          marginTop: "30px",
        }}
      >
        <KpiCard
          title="Employees"
          value="245"
          subtitle="+12 this month"
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

        <KpiCard
          title="Payroll"
          value="₦15.2M"
          subtitle="Completed"
          icon="💰"
          color="#8B5CF6"
        />
      </div>
      <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "20px",
    marginTop: "35px",
  }}
>
  <AttendanceChart />
  <LeaveCalendar />

  <RecentEmployees />
  <Announcements />

  <QuickActions />
  <PayrollSummary />
</div>
    </>
  );
}

export default Dashboard;