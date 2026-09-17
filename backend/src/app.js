const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const activeBranchScopeRoutes = require("./routes/activeBranchScopeRoutes");
const activeBranchSupplementRoutes = require("./routes/activeBranchSupplementRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const employeeCareerCatalogRoutes = require("./routes/employeeCareerCatalogRoutes");
const employeeProfileGovernanceRoutes = require("./routes/employeeProfileGovernanceRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");
const locationRoutes = require("./routes/locationRoutes");
const locationCatalogRoutes = require("./routes/locationCatalogRoutes");
const employmentServiceRoutes = require("./routes/employmentServiceRoutes");
const employmentEligibilityRoutes = require("./routes/employmentEligibilityRoutes");
const employeeReportRoutes = require("./routes/employeeReportRoutes");
const reportsRelease1Routes = require("./routes/reportsRelease1Routes");
const reportsOperationalRoutes = require("./routes/reportsOperationalRoutes");
const recruitmentRoutes = require("./routes/recruitmentRoutes");
const recruitmentVacancyRoutes = require("./routes/recruitmentVacancyRoutes");
const recruitmentTalentRoutes = require("./routes/recruitmentTalentRoutes");
const employeeIntegrityRoutes = require("./routes/employeeIntegrityRoutes");
const leaveRoutes = require("./routes/leaveRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const payrollRoutes = require("./routes/payrollRoutes");
const payrollEmployeeOptionRoutes = require("./routes/payrollEmployeeOptionRoutes");
const payrollLiabilityEditRoutes = require("./routes/payrollLiabilityEditRoutes");
const payrollIntegrationRoutes = require("./routes/payrollIntegrationRoutes");
const payrollReopenRoutes = require("./routes/payrollReopenRoutes");
const loanOriginationWorkflowRoutes = require("./routes/loanOriginationWorkflowRoutes");
const loanRoutes = require("./routes/loanRoutes");
const zermattFinancialSupportRoutes = require("./routes/zermattFinancialSupportRoutes");
const zermattHrLoanOptionRoutes = require("./routes/zermattHrLoanOptionRoutes");
const zermattHrPayrollInputRoutes = require("./routes/zermattHrPayrollInputRoutes");
const zermattLeaveAllowanceRoutes = require("./routes/zermattLeaveAllowanceRoutes");
const zermattSalaryReviewRoutes = require("./routes/zermattSalaryReviewRoutes");
const exitRoutes = require("./routes/exitRoutes");
const lineManagerRoutes = require("./routes/lineManagerRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const organizationRoutes = require("./routes/organizationRoutes");
const employeeDataOperationsRoutes = require("./routes/employeeDataOperationsRoutes");
const employeeEmploymentAssignmentRoutes = require("./routes/employeeEmploymentAssignmentRoutes");
const employeeEmploymentTypeRoutes = require("./routes/employeeEmploymentTypeRoutes");
const employeeInvitationPublicRoutes = require("./routes/employeeInvitationPublicRoutes");
const employmentGovernanceRoutes = require("./routes/employmentGovernanceRoutes");
const zermattOperationsRoutes = require("./routes/zermattOperationsRoutes");
const supportDeskCancellationRoutes = require("./routes/supportDeskCancellationRoutes");
const supportDeskClientLifecycleGuardRoutes = require("./routes/supportDeskClientLifecycleGuardRoutes");
const supportDeskRoutes = require("./routes/supportDeskRoutes");
const commercialDemoRoutes = require("./routes/commercialDemoRoutes");
const organizationSettingsRoutes = require("./routes/organizationSettingsRoutes");
const documentRoutes = require("./routes/documentRoutes");
const operationalControlRoutes = require("./routes/operationalControlRoutes");
const eosbRoutes = require("./routes/eosbRoutes");
const { corsOptionsDelegate, applySecurityHeaders } = require("./middleware/securityMiddleware");

const app = express();

app.disable("x-powered-by");
app.use(cors(corsOptionsDelegate));
app.use(applySecurityHeaders);
app.use(express.json({
  verify: (req, res, buffer) => {
    if (req.path.includes("/support-desk/whatsapp/webhook")) req.rawBody = Buffer.from(buffer);
  },
}));

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });
  }
  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "success", message: "CHRIS API is running", service: "CHRIS Backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/support-desk", supportDeskCancellationRoutes);
app.use("/api/support-desk", supportDeskClientLifecycleGuardRoutes);
app.use("/api/support-desk", supportDeskRoutes);
app.use("/api/commercial", commercialDemoRoutes);
app.use("/api/settings", organizationSettingsRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/operations", operationalControlRoutes);
app.use("/api/eosb", eosbRoutes);

app.use("/api", zermattHrLoanOptionRoutes);
app.use("/api", activeBranchScopeRoutes);
app.use("/api", activeBranchSupplementRoutes);

app.use("/api/employees/onboarding", onboardingRoutes);
app.use("/api/employees", employeeCareerCatalogRoutes);
app.use("/api/employees", employeeProfileGovernanceRoutes);
app.use("/api/employees", employeeEmploymentTypeRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/employee-data", employeeDataOperationsRoutes);
app.use("/api/employee-assignments", employeeEmploymentAssignmentRoutes);
app.use("/api/public/employee-invitations", employeeInvitationPublicRoutes);
app.use("/api/employment-governance", employmentGovernanceRoutes);
app.use("/api/employment-service", employmentServiceRoutes);
app.use("/api/employment-eligibility", employmentEligibilityRoutes);
app.use("/api/employee-reports", employeeReportRoutes);
app.use("/api/reports", reportsRelease1Routes);
app.use("/api/reports", reportsOperationalRoutes);
app.use("/api/recruitment", recruitmentRoutes);
app.use("/api/recruitment", recruitmentVacancyRoutes);
app.use("/api/recruitment", recruitmentTalentRoutes);
app.use("/api/employee-integrity", employeeIntegrityRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/zermatt", zermattOperationsRoutes);

app.use("/api/payroll/employee-options", payrollEmployeeOptionRoutes);
app.use("/api", zermattFinancialSupportRoutes);
app.use("/api", zermattHrPayrollInputRoutes);
app.use("/api", zermattLeaveAllowanceRoutes);
app.use("/api", zermattSalaryReviewRoutes);
app.use("/api/loans", loanOriginationWorkflowRoutes);
app.use("/api", payrollLiabilityEditRoutes);
app.use("/api/payroll", payrollReopenRoutes);
app.use("/api/payroll", payrollIntegrationRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/loans", loanRoutes);

app.use("/api/exits", exitRoutes);
app.use("/api/line-managers", lineManagerRoutes);
app.use("/api/organization", organizationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/location-catalog", locationCatalogRoutes);
app.use("/api/analytics", analyticsRoutes);

module.exports = app;