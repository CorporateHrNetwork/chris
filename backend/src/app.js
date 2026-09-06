const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const employeeCareerCatalogRoutes = require("./routes/employeeCareerCatalogRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");
const locationRoutes = require("./routes/locationRoutes");
const locationCatalogRoutes = require("./routes/locationCatalogRoutes");
const employmentServiceRoutes = require("./routes/employmentServiceRoutes");
const employmentEligibilityRoutes = require("./routes/employmentEligibilityRoutes");
const employeeReportRoutes = require("./routes/employeeReportRoutes");
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
const exitRoutes = require("./routes/exitRoutes");
const lineManagerRoutes = require("./routes/lineManagerRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const organizationRoutes = require("./routes/organizationRoutes");
const employeeDataOperationsRoutes = require("./routes/employeeDataOperationsRoutes");
const employeeEmploymentAssignmentRoutes = require("./routes/employeeEmploymentAssignmentRoutes");
const employeeInvitationPublicRoutes = require("./routes/employeeInvitationPublicRoutes");
const employmentGovernanceRoutes = require("./routes/employmentGovernanceRoutes");
const { corsOptionsDelegate, applySecurityHeaders } = require("./middleware/securityMiddleware");

const app = express();

app.disable("x-powered-by");
app.use(cors(corsOptionsDelegate));
app.use(applySecurityHeaders);
app.use(express.json());

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
app.use("/api/employees/onboarding", onboardingRoutes);
app.use("/api/employees", employeeCareerCatalogRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/employee-data", employeeDataOperationsRoutes);
app.use("/api/employee-assignments", employeeEmploymentAssignmentRoutes);
app.use("/api/public/employee-invitations", employeeInvitationPublicRoutes);
app.use("/api/employment-governance", employmentGovernanceRoutes);
app.use("/api/employment-service", employmentServiceRoutes);
app.use("/api/employment-eligibility", employmentEligibilityRoutes);
app.use("/api/employee-reports", employeeReportRoutes);
app.use("/api/employee-integrity", employeeIntegrityRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/attendance", attendanceRoutes);

app.use("/api/payroll/employee-options", payrollEmployeeOptionRoutes);

// Loan workflow routes are deliberately mounted before the generic /api liability editor.
// This lets loans.apply/verify/approve/disburse users use loan-scoped actions without broad payroll.manage.
app.use("/api/loans", loanOriginationWorkflowRoutes);

app.use("/api", payrollLiabilityEditRoutes);
app.use("/api/payroll", payrollReopenRoutes);
app.use("/api/payroll", payrollIntegrationRoutes);
app.use("/api/payroll", payrollRoutes);

// Legacy loan routes remain as a compatibility fallback for existing payroll-managed records.
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