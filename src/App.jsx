import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import MainLayout from "./layouts/MainLayout";
import PlannedWorkspace from "./pages/shared/PlannedWorkspace";
import ModuleDashboard from "./components/dashboard/ModuleDashboard";

import ProtectedRoute from "./components/auth/ProtectedRoute";
import PermissionRoute from "./components/auth/PermissionRoute";

import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";

import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import EmployeeModuleWorkspace from "./pages/EmployeeModuleWorkspace";
import EmployeeOnboarding from "./pages/EmployeeOnboarding";
import EmployeeProfile from "./components/employees/EmployeeProfile";
import Recruitment from "./pages/Recruitment";
import AttendanceDashboard from "./pages/AttendanceDashboard";
import AttendanceRegister from "./pages/AttendanceRegister";
import ShiftManagement from "./pages/ShiftManagement";
import LeaveDashboard from "./pages/LeaveDashboard";
import LeaveRequests from "./pages/LeaveRequests";
import LeaveBalances from "./pages/LeaveBalances";
import LeavePolicies from "./pages/LeavePolicies";
import Payroll from "./pages/Payroll";
import Benefits from "./pages/Benefits";
import BenefitChildPage from "./pages/benefits/BenefitChildPage";
import Loans from "./pages/Loans";
import Performance from "./pages/Performance";
import Training from "./pages/Training";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Designations from "./pages/Designations";

import ShiftSchedule from "./pages/ShiftSchedule";
import AttendanceAnalyticsPage from "./pages/AttendanceAnalyticsPage";
import WorkedHours from "./pages/WorkedHours";
import PublicHolidays from "./pages/PublicHolidays";
function ProtectedLayout({
  children,
}) {
  return (
    <ProtectedRoute>
      <MainLayout>
        {children}
      </MainLayout>
    </ProtectedRoute>
  );
}

function PermissionLayout({
  permission,
  children,
}) {
  return (
    <ProtectedLayout>
      <PermissionRoute
        permission={permission}
      >
        {children}
      </PermissionRoute>
    </ProtectedLayout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC AUTHENTICATION */}

        <Route
          path="/login"
          element={
            <Login />
          }
        />

        <Route
          path="/reset-password"
          element={
            <ResetPassword />
          }
        />

        {/* DASHBOARD */}

        <Route
          path="/"
          element={
            <PermissionLayout
              permission="dashboard.view"
            >
              <Dashboard />
            </PermissionLayout>
          }
        />

        {/* EMPLOYEES */}

                <Route
          path="/employees"
          element={
            <PermissionLayout
              permission="employees.view"
            >
              <EmployeeDashboard />
            </PermissionLayout>
          }
        />

        <Route
          path="/employees/directory"
          element={
            <PermissionLayout
              permission="employees.view"
            >
              <Employees />
            </PermissionLayout>
          }
        />

                <Route
          path="/employees/profiles"
          element={
            <PermissionLayout permission="employees.view">
              <EmployeeModuleWorkspace mode="profiles" />
            </PermissionLayout>
          }
        />

        <Route
          path="/employees/onboarding"
          element={
            <PermissionLayout permission="employees.view">
              <EmployeeOnboarding />
            </PermissionLayout>
          }
        />

        <Route
          path="/employees/analytics"
          element={
            <PermissionLayout permission="employees.view">
              <EmployeeModuleWorkspace mode="analytics" />
            </PermissionLayout>
          }
        />

        <Route
          path="/employees/transfers"
          element={
            <PermissionLayout permission="employees.view">
              <EmployeeModuleWorkspace mode="transfers" />
            </PermissionLayout>
          }
        />

        <Route
          path="/employees/promotions"
          element={
            <PermissionLayout permission="employees.view">
              <EmployeeModuleWorkspace mode="promotions" />
            </PermissionLayout>
          }
        />

        <Route
          path="/employees/exits"
          element={
            <PermissionLayout permission="employees.view">
              <EmployeeModuleWorkspace mode="exits" />
            </PermissionLayout>
          }
        />

        <Route
          path="/employees/line-managers"
          element={
            <PermissionLayout permission="employees.view">
              <EmployeeModuleWorkspace mode="line-managers" />
            </PermissionLayout>
          }
        />
<Route
          path="/employees/:employeeNumber"
          element={
            <PermissionLayout
              permission="employees.view"
            >
              <EmployeeProfile />
            </PermissionLayout>
          }
        />

        {/* RECRUITMENT */}

        <Route
          path="/recruitment"
          element={
            <PermissionLayout
              permission="recruitment.view"
            >
              <Recruitment />
            </PermissionLayout>
          }
        />

        {/* TIME & ATTENDANCE */}

        <Route
          path="/attendance"
          element={
            <PermissionLayout permission="attendance.view">
              <AttendanceDashboard />
            </PermissionLayout>
          }
        />

        <Route
          path="/attendance/register"
          element={
            <PermissionLayout permission="attendance.view">
              <AttendanceRegister />
            </PermissionLayout>
          }
        />

        <Route
          path="/attendance/shifts"
          element={
            <PermissionLayout permission="attendance.view">
              <ShiftManagement />
            </PermissionLayout>
          }
        />

        <Route
          path="/attendance/shift-schedule"
          element={
            <PermissionLayout permission="attendance.view">
              <ShiftSchedule />
            </PermissionLayout>
          }
        />

        <Route
          path="/attendance/worked-hours"
          element={
            <PermissionLayout permission="attendance.view">
              <WorkedHours />
            </PermissionLayout>
          }
        />

        <Route
          path="/attendance/worked-days"
          element={
            <PermissionLayout permission="attendance.view">
              <AttendanceAnalyticsPage mode="worked-days" />
            </PermissionLayout>
          }
        />

        <Route
          path="/attendance/off-days"
          element={
            <PermissionLayout permission="attendance.view">
              <AttendanceAnalyticsPage mode="off-days" />
            </PermissionLayout>
          }
        />

        <Route
          path="/attendance/overtime"
          element={
            <PermissionLayout permission="attendance.view">
              <AttendanceAnalyticsPage mode="overtime" />
            </PermissionLayout>
          }
        />

        <Route
          path="/attendance/public-holidays"
          element={
            <PermissionLayout permission="attendance.view">
              <PublicHolidays />
            </PermissionLayout>
          }
        />

        <Route
          path="/attendance/lateness-absence"
          element={
            <PermissionLayout permission="attendance.view">
              <AttendanceAnalyticsPage mode="lateness-absence" />
            </PermissionLayout>
          }
        />

        {/* LEAVE */}

        <Route
          path="/leave"
          element={
            <PermissionLayout
              permission="leave.view"
            >
              <LeaveDashboard />
            </PermissionLayout>
          }
        />

        <Route
          path="/leave/requests"
          element={
            <PermissionLayout
              permission="leave.view"
            >
              <LeaveRequests />
            </PermissionLayout>
          }
        />

        <Route
          path="/leave/balances"
          element={
            <PermissionLayout
              permission="leave.view"
            >
              <LeaveBalances />
            </PermissionLayout>
          }
        />

        <Route
          path="/leave/policies"
          element={
            <PermissionLayout
              permission="leave.view"
            >
              <LeavePolicies />
            </PermissionLayout>
          }
        />

        {/* PAYROLL */}

        <Route
          path="/payroll"
          element={
            <PermissionLayout
              permission="payroll.view"
            >
              <Payroll />
            </PermissionLayout>
          }
        />

        {/* LOANS */}

        <Route
          path="/loans"
          element={
            <PermissionLayout
              permission="loans.view"
            >
              <Loans />
            </PermissionLayout>
          }
        />

        {/* PERFORMANCE */}

        <Route
          path="/performance"
          element={
            <PermissionLayout
              permission="performance.view"
            >
              <Performance />
            </PermissionLayout>
          }
        />

        {/* TRAINING */}

        <Route
          path="/training"
          element={
            <PermissionLayout
              permission="training.view"
            >
              <Training />
            </PermissionLayout>
          }
        />

        {/* REPORTS */}

        <Route
          path="/reports"
          element={
            <PermissionLayout
              permission="reports.view"
            >
              <Reports />
            </PermissionLayout>
          }
        />

        {/* SETTINGS */}

        <Route
          path="/settings"
          element={
            <PermissionLayout
              permission="settings.view"
            >
              <Settings />
            </PermissionLayout>
          }
        />

        {/* DESIGNATIONS & CAREER STRUCTURE */}

        <Route
          path="/designations"
          element={
            <PermissionLayout
              permission="settings.view"
            >
              <Designations />
            </PermissionLayout>
          }
        />
        {/* UNKNOWN ROUTES */}

        
        {/* CHRIS PARENT MODULE DASHBOARDS */}
        <Route path="/compensation" element={<ProtectedLayout><ModuleDashboard moduleKey="compensation" /></ProtectedLayout>} />
        <Route path="/benefits" element={<ProtectedLayout><Benefits /></ProtectedLayout>} />
        {/* CHRIS BENEFITS CHILD ROUTES */}

        <Route path="/benefits/pension" element={<ProtectedLayout><BenefitChildPage title="Pension" description="Manage pension-related employee benefits, participation and contribution readiness." metricLabels={["Eligible Employees","Enrolled Employees","Employer Contribution","Exceptions"]} /></ProtectedLayout>} />

        <Route path="/benefits/gratuity" element={<ProtectedLayout><BenefitChildPage title="Gratuity" description="Manage gratuity eligibility, service-based benefit rules and accrued obligations." metricLabels={["Eligible Employees","Accrued Liability","Upcoming Eligibility","Exceptions"]} /></ProtectedLayout>} />

        <Route path="/benefits/health-insurance" element={<ProtectedLayout><BenefitChildPage title="Health Insurance" description="Manage employee health-insurance coverage, dependants, eligibility and plan participation." metricLabels={["Active Plans","Covered Employees","Dependants","Coverage Exceptions"]} /></ProtectedLayout>} />

        <Route path="/benefits/life-insurance" element={<ProtectedLayout><BenefitChildPage title="Life Insurance" description="Manage employee life-insurance participation, coverage levels and eligibility." metricLabels={["Covered Employees","Active Policies","Coverage Value","Exceptions"]} /></ProtectedLayout>} />

        <Route path="/benefits/medical" element={<ProtectedLayout><BenefitChildPage title="Medical Benefits" description="Manage medical-benefit programmes, utilization readiness and employee coverage." metricLabels={["Eligible Employees","Active Coverage","Claims / Usage","Exceptions"]} /></ProtectedLayout>} />

        <Route path="/benefits/housing" element={<ProtectedLayout><BenefitChildPage title="Housing / Rent" description="Manage housing and rent-related employee benefit programmes and eligibility." metricLabels={["Eligible Employees","Active Beneficiaries","Employer Cost","Exceptions"]} /></ProtectedLayout>} />

        <Route path="/benefits/transport" element={<ProtectedLayout><BenefitChildPage title="Transport Benefits" description="Manage transport benefit programmes, employee eligibility and employer support." metricLabels={["Eligible Employees","Active Beneficiaries","Employer Cost","Exceptions"]} /></ProtectedLayout>} />

        <Route path="/benefits/meals" element={<ProtectedLayout><BenefitChildPage title="Meal Benefits" description="Manage meal benefit programmes, eligibility, participation and employer support." metricLabels={["Eligible Employees","Active Beneficiaries","Employer Cost","Exceptions"]} /></ProtectedLayout>} />

        <Route path="/benefits/other" element={<ProtectedLayout><BenefitChildPage title="Other Benefits" description="Manage additional employee benefit programmes outside the standard benefit categories." metricLabels={["Benefit Types","Eligible Employees","Active Beneficiaries","Exceptions"]} /></ProtectedLayout>} />

        <Route path="/benefits/enrolments" element={<ProtectedLayout><BenefitChildPage title="Benefit Enrolments" description="Manage employee benefit enrolments, status, eligibility and participation workflows." metricLabels={["Eligible Employees","Enrolled Employees","Pending Enrolments","Exceptions"]} activityTitle="Enrolment Activity" /></ProtectedLayout>} />
        <Route path="/statutories" element={<ProtectedLayout><ModuleDashboard moduleKey="statutories" /></ProtectedLayout>} />
        <Route path="/assets" element={<ProtectedLayout><ModuleDashboard moduleKey="assets" /></ProtectedLayout>} />
        <Route path="/documents" element={<ProtectedLayout><ModuleDashboard moduleKey="documents" /></ProtectedLayout>} />
        <Route path="/organization" element={<ProtectedLayout><ModuleDashboard moduleKey="organization" /></ProtectedLayout>} />
        <Route path="/workflows" element={<ProtectedLayout><ModuleDashboard moduleKey="workflows" /></ProtectedLayout>} />
        <Route path="/employment-types" element={<ProtectedLayout><ModuleDashboard moduleKey="employmentTypes" /></ProtectedLayout>} />
        <Route path="/billing" element={<ProtectedLayout><ModuleDashboard moduleKey="billing" /></ProtectedLayout>} />

        {/* CHRIS PLANNED WORKSPACE ROUTES */}
        <Route path="/recruitment/job-requisitions" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/recruitment/vacancies" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/recruitment/candidates" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/recruitment/interviews" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/recruitment/offers" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/recruitment/ats" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/recruitment/talent-pool" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/leave/calendar" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/leave/entitlements" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/payroll/execute" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/payroll/periods" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/payroll/salary-rates" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/payroll/allowances" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/payroll/deductions" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/payroll/payslips" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/payroll/salary-advances" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/payroll/paid-leave" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/compensation/salary-structure" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/compensation/grades-levels" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/compensation/salary-bands" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/compensation/reviews" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/compensation/adjustments" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/compensation/promotions" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/compensation/bonuses-incentives" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/compensation/total-rewards" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/statutories/paye-tax" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/statutories/pension-compliance" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/statutories/nhia" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/statutories/nsitf" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/statutories/itf" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/statutories/remittances" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/statutories/reports" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/performance/goals-kpis" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/performance/cycles" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/performance/reviews" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/performance/appraisals" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/performance/improvement-plans" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/performance/reports" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/training/programs" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/training/calendar" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/training/employee-training" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/training/learning-records" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/training/assessments" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/training/certifications" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/training/reports" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/assets/register" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/assets/categories" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/assets/assignment" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/assets/transfers" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/assets/returns" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/assets/maintenance" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/assets/reports" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/documents/employee" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/documents/hr" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/documents/policies" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/documents/templates" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/documents/categories" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/documents/expiry-tracking" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/documents/requests" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/workforce-analytics" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/employees" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/headcount" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/branches" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/recruitment" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/attendance" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/leave" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/payroll" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/compensation" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/benefits" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/reports/custom" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/organization/profile" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/organization/departments" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/organization/chart" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/organization/reporting-lines" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/organization/cost-centres" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/workflows/approval-inbox" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/workflows/my-requests" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/workflows/templates" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/workflows/approval-chains" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/workflows/delegations" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/workflows/history" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/employment-types/permanent" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/employment-types/contract" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/employment-types/temporary" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/employment-types/probation" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/employment-types/intern-trainee" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/employment-types/expatriate" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/employment-types/custom" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/settings/employees" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/settings/payroll" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/settings/attendance" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/settings/leave" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/settings/benefits" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/settings/recruitment" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/settings/notifications" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/settings/security" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/settings/system" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/billing/subscription" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/billing/usage" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/billing/details" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/billing/history" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
        <Route path="/billing/invoices" element={<ProtectedLayout><PlannedWorkspace /></ProtectedLayout>} />
<Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

