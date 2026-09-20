import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import MainLayout from "./layouts/MainLayout";
const PlannedWorkspace = lazy(() => import("./pages/shared/PlannedWorkspace"));
import ModuleDashboard from "./components/dashboard/ModuleDashboard";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PermissionRoute from "./components/auth/PermissionRoute";
import ConsolidatedComplianceRoute from "./components/auth/ConsolidatedComplianceRoute";

const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Employees = lazy(() => import("./pages/Employees"));
const EmployeeDashboard = lazy(() => import("./pages/EmployeeDashboard"));
const EmployeeAnalytics = lazy(() => import("./pages/EmployeeAnalytics"));
const EmployeeModuleWorkspace = lazy(() => import("./pages/EmployeeModuleWorkspace"));
const EmployeeOnboarding = lazy(() => import("./pages/EmployeeOnboarding"));
const AddOnboardEmployeeEntry = lazy(() => import("./pages/AddOnboardEmployeeEntry"));
const OnboardingTracker = lazy(() => import("./pages/OnboardingTracker"));
const BulkEmployeeImport = lazy(() => import("./pages/BulkEmployeeImport"));
const EmployeeInvitations = lazy(() => import("./pages/EmployeeInvitations"));
const EmployeeExportQueue = lazy(() => import("./pages/EmployeeExportQueue"));
const EmployeeSelfOnboardingPublic = lazy(() => import("./pages/EmployeeSelfOnboardingPublic"));
const EmployeeGovernance = lazy(() => import("./pages/EmployeeGovernance"));
const EmployeeExits = lazy(() => import("./pages/EmployeeExits"));
const LineManagers = lazy(() => import("./pages/LineManagers"));
import EmployeeProfile from "./components/employees/EmployeeProfile";
import EmployeeProfileErrorBoundary from "./components/employees/EmployeeProfileErrorBoundary";
const Recruitment = lazy(() => import("./pages/Recruitment"));
const RecruitmentVacancies = lazy(() => import("./pages/RecruitmentVacancies"));
const RecruitmentTalentWorkspace = lazy(() => import("./pages/RecruitmentTalentWorkspace"));
const AttendanceDashboard = lazy(() => import("./pages/AttendanceDashboard"));
const AttendanceRegister = lazy(() => import("./pages/AttendanceRegister"));
const ShiftManagement = lazy(() => import("./pages/ShiftManagement"));
const ShiftSchedule = lazy(() => import("./pages/ShiftSchedule"));
const AttendanceAnalyticsPage = lazy(() => import("./pages/AttendanceAnalyticsPage"));
const WorkedHours = lazy(() => import("./pages/WorkedHours"));
const PublicHolidays = lazy(() => import("./pages/PublicHolidays"));
const LeaveDashboard = lazy(() => import("./pages/LeaveDashboard"));
const LeaveRequests = lazy(() => import("./pages/LeaveRequests"));
const LeaveBalances = lazy(() => import("./pages/LeaveBalances"));
const LeavePolicies = lazy(() => import("./pages/LeavePolicies"));
const LeaveActive = lazy(() => import("./pages/LeaveActive"));
const LeaveReturns = lazy(() => import("./pages/LeaveReturns"));
const LeaveCalendarPage = lazy(() => import("./pages/LeaveCalendarPage"));
const LeaveEntitlements = lazy(() => import("./pages/LeaveEntitlements"));
const LeaveExceptions = lazy(() => import("./pages/LeaveExceptions"));
const Payroll = lazy(() => import("./pages/Payroll"));
const Benefits = lazy(() => import("./pages/Benefits"));
const BenefitChildPage = lazy(() => import("./pages/benefits/BenefitChildPage"));
const Loans = lazy(() => import("./pages/Loans"));
const Performance = lazy(() => import("./pages/Performance"));
const Training = lazy(() => import("./pages/Training"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Designations = lazy(() => import("./pages/Designations"));
const OrganizationProfile = lazy(() => import("./pages/OrganizationProfile"));
const OrganizationChart = lazy(() => import("./pages/OrganizationChart"));
const ReportingLines = lazy(() => import("./pages/ReportingLines"));
const CostCentres = lazy(() => import("./pages/CostCentres"));
const MySupportRequests = lazy(() => import("./pages/MySupportRequests"));
const SupportDesk = lazy(() => import("./pages/SupportDesk"));
const CommercialOperations = lazy(() => import("./pages/CommercialOperations"));
const RemittanceWorkspace = lazy(() => import("./pages/statutories/RemittanceWorkspace"));

function ProtectedLayout({ children }) {
  return (
    <ProtectedRoute>
      <MainLayout>{children}</MainLayout>
    </ProtectedRoute>
  );
}

function PermissionLayout({ permission, children }) {
  return (
    <ProtectedLayout>
      <PermissionRoute permission={permission}>{children}</PermissionRoute>
    </ProtectedLayout>
  );
}

function AppLoading() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#07110C", color: "#F7D66A", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div role="status" aria-live="polite" style={{ textAlign: "center" }}>
        <div style={{ width: 52, height: 52, margin: "0 auto 14px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#D4AF37", color: "#07140D", fontWeight: 900 }}>CH</div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Loading CHRiS…</div>
        <div style={{ marginTop: 6, color: "#AFC0B6", fontSize: 12 }}>Opening the selected workspace</div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<AppLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/employee-invite/:token" element={<EmployeeSelfOnboardingPublic />} />

        <Route path="/" element={<PermissionLayout permission="dashboard.view"><Dashboard /></PermissionLayout>} />

        <Route path="/employees" element={<PermissionLayout permission="employees.view"><EmployeeDashboard /></PermissionLayout>} />
        <Route path="/employees/add" element={<PermissionLayout permission="employees.create"><AddOnboardEmployeeEntry /></PermissionLayout>} />
        <Route path="/employees/bulk-upload" element={<PermissionLayout permission="employees.create"><BulkEmployeeImport /></PermissionLayout>} />
        <Route path="/employees/invitations" element={<PermissionLayout permission="employees.create"><EmployeeInvitations /></PermissionLayout>} />
        <Route path="/employees/export-queue" element={<PermissionLayout permission="employees.update"><EmployeeExportQueue /></PermissionLayout>} />
        <Route path="/employees/governance" element={<PermissionLayout permission="employees.update"><EmployeeGovernance /></PermissionLayout>} />
        <Route path="/employees/directory" element={<PermissionLayout permission="employees.view"><Employees /></PermissionLayout>} />
        <Route path="/employees/profiles" element={<PermissionLayout permission="employees.view"><EmployeeModuleWorkspace mode="profiles" /></PermissionLayout>} />
        <Route path="/employees/onboarding" element={<PermissionLayout permission="employees.view"><OnboardingTracker /></PermissionLayout>} />
        <Route path="/employees/onboarding/workflows" element={<PermissionLayout permission="employees.view"><EmployeeOnboarding /></PermissionLayout>} />
        <Route path="/employees/:employeeNumber/onboarding" element={<PermissionLayout permission="employees.view"><EmployeeOnboarding initialTab="STATUS" /></PermissionLayout>} />
        <Route path="/employees/analytics" element={<PermissionLayout permission="employees.view"><EmployeeAnalytics /></PermissionLayout>} />
        <Route path="/employees/transfers" element={<PermissionLayout permission="employees.view"><EmployeeModuleWorkspace mode="transfers" /></PermissionLayout>} />
        <Route path="/employees/promotions" element={<PermissionLayout permission="employees.view"><EmployeeModuleWorkspace mode="promotions" /></PermissionLayout>} />
        <Route path="/employees/exits" element={<PermissionLayout permission="employees.view"><EmployeeExits /></PermissionLayout>} />
        <Route path="/employees/line-managers" element={<PermissionLayout permission="employees.view"><LineManagers /></PermissionLayout>} />
        <Route path="/employees/:employeeNumber" element={<PermissionLayout permission="employees.view"><EmployeeProfileErrorBoundary><EmployeeProfile /></EmployeeProfileErrorBoundary></PermissionLayout>} />

        <Route path="/recruitment" element={<PermissionLayout permission="recruitment.view"><Recruitment /></PermissionLayout>} />
        <Route path="/recruitment/vacancies" element={<PermissionLayout permission="recruitment.view"><RecruitmentVacancies /></PermissionLayout>} />
        <Route path="/recruitment/candidates" element={<PermissionLayout permission="recruitment.view"><RecruitmentTalentWorkspace mode="candidates" /></PermissionLayout>} />
        <Route path="/recruitment/interviews" element={<PermissionLayout permission="recruitment.view"><RecruitmentTalentWorkspace mode="interviews" /></PermissionLayout>} />
        <Route path="/recruitment/offers" element={<PermissionLayout permission="recruitment.view"><RecruitmentTalentWorkspace mode="offers" /></PermissionLayout>} />
        <Route path="/recruitment/ats" element={<PermissionLayout permission="recruitment.view"><RecruitmentTalentWorkspace mode="ats" /></PermissionLayout>} />
        <Route path="/recruitment/talent-pool" element={<PermissionLayout permission="recruitment.view"><RecruitmentTalentWorkspace mode="talent-pool" /></PermissionLayout>} />

        <Route path="/attendance" element={<PermissionLayout permission="attendance.view"><AttendanceDashboard /></PermissionLayout>} />
        <Route path="/attendance/register" element={<PermissionLayout permission="attendance.view"><AttendanceRegister /></PermissionLayout>} />
        <Route path="/attendance/shifts" element={<PermissionLayout permission="attendance.view"><ShiftManagement /></PermissionLayout>} />
        <Route path="/attendance/shift-schedule" element={<PermissionLayout permission="attendance.view"><ShiftSchedule /></PermissionLayout>} />
        <Route path="/attendance/worked-hours" element={<PermissionLayout permission="attendance.view"><WorkedHours /></PermissionLayout>} />
        <Route path="/attendance/worked-days" element={<PermissionLayout permission="attendance.view"><AttendanceAnalyticsPage mode="worked-days" /></PermissionLayout>} />
        <Route path="/attendance/off-days" element={<PermissionLayout permission="attendance.view"><AttendanceAnalyticsPage mode="off-days" /></PermissionLayout>} />
        <Route path="/attendance/overtime" element={<PermissionLayout permission="attendance.view"><AttendanceAnalyticsPage mode="overtime" /></PermissionLayout>} />
        <Route path="/attendance/public-holidays" element={<PermissionLayout permission="attendance.view"><PublicHolidays /></PermissionLayout>} />
        <Route path="/attendance/lateness-absence" element={<PermissionLayout permission="attendance.view"><AttendanceAnalyticsPage mode="lateness-absence" /></PermissionLayout>} />

        <Route path="/leave" element={<PermissionLayout permission="leave.view"><LeaveDashboard /></PermissionLayout>} />
        <Route path="/leave/requests" element={<PermissionLayout permission="leave.view"><LeaveRequests /></PermissionLayout>} />
        <Route path="/leave/active" element={<PermissionLayout permission="leave.view"><LeaveActive /></PermissionLayout>} />
        <Route path="/leave/returns" element={<PermissionLayout permission="leave.view"><LeaveReturns /></PermissionLayout>} />
        <Route path="/leave/calendar" element={<PermissionLayout permission="leave.view"><LeaveCalendarPage /></PermissionLayout>} />
        <Route path="/leave/entitlements" element={<PermissionLayout permission="leave.view"><LeaveEntitlements /></PermissionLayout>} />
        <Route path="/leave/exceptions" element={<PermissionLayout permission="leave.view"><LeaveExceptions /></PermissionLayout>} />
        <Route path="/leave/balances" element={<PermissionLayout permission="leave.view"><LeaveBalances /></PermissionLayout>} />
        <Route path="/leave/policies" element={<PermissionLayout permission="leave.view"><LeavePolicies /></PermissionLayout>} />

        <Route path="/payroll" element={<PermissionLayout permission="payroll.view"><Payroll /></PermissionLayout>} />
        <Route path="/loans" element={<PermissionLayout permission="loans.view"><Loans /></PermissionLayout>} />
        <Route path="/performance" element={<PermissionLayout permission="performance.view"><Performance /></PermissionLayout>} />
        <Route path="/training" element={<PermissionLayout permission="training.view"><Training /></PermissionLayout>} />
        <Route path="/reports" element={<PermissionLayout permission="reports.view"><Reports /></PermissionLayout>} />
        <Route path="/settings" element={<PermissionLayout permission="settings.view"><Settings /></PermissionLayout>} />
        <Route path="/designations" element={<PermissionLayout permission="settings.view"><Designations /></PermissionLayout>} />

        {/* Client support is available to every authenticated tenant user. */}
        <Route path="/support" element={<ProtectedLayout><MySupportRequests /></ProtectedLayout>} />
        {/* Internal Support Desk requires platform support permissions in the API and UI. */}
        <Route path="/support-desk" element={<PermissionLayout permission="support.internal.view"><SupportDesk /></PermissionLayout>} />
        {/* Commercial Operations is platform-scoped in the API and is not available to client tenants. */}
        <Route path="/commercial" element={<ProtectedLayout><CommercialOperations /></ProtectedLayout>} />

        <Route path="/compensation" element={<ProtectedLayout><ModuleDashboard moduleKey="compensation" /></ProtectedLayout>} />
        <Route path="/benefits" element={<ProtectedLayout><Benefits /></ProtectedLayout>} />
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

        <Route path="/recruitment/job-requisitions" element={<Navigate to="/recruitment?workspace=requisitions" replace />} />
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
        <Route path="/statutories/remittances" element={<ProtectedLayout><ConsolidatedComplianceRoute><RemittanceWorkspace /></ConsolidatedComplianceRoute></ProtectedLayout>} />
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
        <Route path="/organization/profile" element={<PermissionLayout permission="settings.view"><OrganizationProfile /></PermissionLayout>} />
        <Route path="/organization/departments" element={<Navigate to="/designations" replace />} />
        <Route path="/organization/chart" element={<PermissionLayout permission="settings.view"><OrganizationChart /></PermissionLayout>} />
        <Route path="/organization/reporting-lines" element={<PermissionLayout permission="settings.view"><ReportingLines /></PermissionLayout>} />
        <Route path="/organization/cost-centres" element={<PermissionLayout permission="settings.view"><CostCentres /></PermissionLayout>} />
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;