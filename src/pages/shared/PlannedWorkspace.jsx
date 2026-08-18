import { useLocation, useNavigate } from "react-router-dom";

const WORKSPACES = {
  "/attendance/shift-schedule": { module: "attendance", title: "Shift Schedule" },
  "/attendance/worked-hours": { module: "attendance", title: "Worked Hours" },
  "/attendance/worked-days": { module: "attendance", title: "Worked Days" },
  "/attendance/off-days": { module: "attendance", title: "Off Days" },
  "/attendance/overtime": { module: "attendance", title: "Overtime" },
  "/attendance/public-holidays": { module: "attendance", title: "Public Holidays" },
  "/attendance/lateness-absence": { module: "attendance", title: "Lateness & Absence" },
  "/recruitment/job-requisitions": { module: "recruitment", title: "Job Requisitions" },
  "/recruitment/vacancies": { module: "recruitment", title: "Vacancies" },
  "/recruitment/candidates": { module: "recruitment", title: "Candidates" },
  "/recruitment/interviews": { module: "recruitment", title: "Interviews" },
  "/recruitment/offers": { module: "recruitment", title: "Offers" },
  "/recruitment/ats": { module: "recruitment", title: "Applicant Tracking System" },
  "/recruitment/talent-pool": { module: "recruitment", title: "Talent Pool" },
  "/leave/calendar": { module: "leave", title: "Leave Calendar" },
  "/leave/entitlements": { module: "leave", title: "Leave Entitlements" },
  "/payroll/execute": { module: "payroll", title: "Execute Payroll" },
  "/payroll/periods": { module: "payroll", title: "Payroll Periods" },
  "/payroll/salary-rates": { module: "payroll", title: "Salary Rates" },
  "/payroll/allowances": { module: "payroll", title: "Allowances" },
  "/payroll/deductions": { module: "payroll", title: "Deductions" },
  "/payroll/payslips": { module: "payroll", title: "Payslips" },
  "/payroll/salary-advances": { module: "payroll", title: "Salary Advances" },
  "/payroll/paid-leave": { module: "payroll", title: "Paid Leave" },
  "/compensation": { module: "compensation", title: "Compensation Dashboard" },
  "/compensation/salary-structure": { module: "compensation", title: "Salary Structure" },
  "/compensation/grades-levels": { module: "compensation", title: "Grades & Levels" },
  "/compensation/salary-bands": { module: "compensation", title: "Salary Bands" },
  "/compensation/reviews": { module: "compensation", title: "Compensation Reviews" },
  "/compensation/adjustments": { module: "compensation", title: "Salary Adjustments" },
  "/compensation/promotions": { module: "compensation", title: "Promotions" },
  "/compensation/bonuses-incentives": { module: "compensation", title: "Bonuses & Incentives" },
  "/compensation/total-rewards": { module: "compensation", title: "Total Rewards" },
  "/statutories": { module: "statutories", title: "Statutory Dashboard" },
  "/statutories/paye-tax": { module: "statutories", title: "PAYE / Tax" },
  "/statutories/pension-compliance": { module: "statutories", title: "Pension Compliance" },
  "/statutories/nhia": { module: "statutories", title: "NHIA" },
  "/statutories/nsitf": { module: "statutories", title: "NSITF" },
  "/statutories/itf": { module: "statutories", title: "ITF" },
  "/statutories/remittances": { module: "statutories", title: "Remittances" },
  "/statutories/reports": { module: "statutories", title: "Statutory Reports" },
  "/performance/goals-kpis": { module: "performance", title: "Goals / KPIs" },
  "/performance/cycles": { module: "performance", title: "Performance Cycles" },
  "/performance/reviews": { module: "performance", title: "Reviews" },
  "/performance/appraisals": { module: "performance", title: "Appraisals" },
  "/performance/improvement-plans": { module: "performance", title: "Improvement Plans" },
  "/performance/reports": { module: "performance", title: "Performance Reports" },
  "/training/programs": { module: "training", title: "Training Programs" },
  "/training/calendar": { module: "training", title: "Training Calendar" },
  "/training/employee-training": { module: "training", title: "Employee Training" },
  "/training/learning-records": { module: "training", title: "Learning Records" },
  "/training/assessments": { module: "training", title: "Assessments" },
  "/training/certifications": { module: "training", title: "Certifications" },
  "/training/reports": { module: "training", title: "Training Reports" },
  "/assets/register": { module: "assets", title: "Asset Register" },
  "/assets/categories": { module: "assets", title: "Asset Categories" },
  "/assets/assignment": { module: "assets", title: "Asset Assignment" },
  "/assets/transfers": { module: "assets", title: "Asset Transfers" },
  "/assets/returns": { module: "assets", title: "Asset Returns" },
  "/assets/maintenance": { module: "assets", title: "Maintenance" },
  "/assets/reports": { module: "assets", title: "Asset Reports" },
  "/documents/employee": { module: "documents", title: "Employee Documents" },
  "/documents/hr": { module: "documents", title: "HR Documents" },
  "/documents/policies": { module: "documents", title: "Company Policies" },
  "/documents/templates": { module: "documents", title: "Templates" },
  "/documents/categories": { module: "documents", title: "Document Categories" },
  "/documents/expiry-tracking": { module: "documents", title: "Expiry Tracking" },
  "/documents/requests": { module: "documents", title: "Document Requests" },
  "/reports/workforce-analytics": { module: "reports", title: "Workforce Analytics" },
  "/reports/employees": { module: "reports", title: "Employee Reports" },
  "/reports/headcount": { module: "reports", title: "Headcount Reports" },
  "/reports/branches": { module: "reports", title: "Branch Reports" },
  "/reports/recruitment": { module: "reports", title: "Recruitment Reports" },
  "/reports/attendance": { module: "reports", title: "Attendance Reports" },
  "/reports/leave": { module: "reports", title: "Leave Reports" },
  "/reports/payroll": { module: "reports", title: "Payroll Reports" },
  "/reports/compensation": { module: "reports", title: "Compensation Reports" },
  "/reports/benefits": { module: "reports", title: "Benefits Reports" },
  "/reports/custom": { module: "reports", title: "Custom Reports" },
  "/organization/profile": { module: "organization", title: "Organization Profile" },
  "/organization/departments": { module: "organization", title: "Departments" },
  "/organization/chart": { module: "organization", title: "Organization Chart" },
  "/organization/reporting-lines": { module: "organization", title: "Reporting Lines" },
  "/organization/cost-centres": { module: "organization", title: "Cost Centres" },
  "/workflows/approval-inbox": { module: "workflows", title: "Approval Inbox" },
  "/workflows/my-requests": { module: "workflows", title: "My Requests" },
  "/workflows/templates": { module: "workflows", title: "Workflow Templates" },
  "/workflows/approval-chains": { module: "workflows", title: "Approval Chains" },
  "/workflows/delegations": { module: "workflows", title: "Delegations" },
  "/workflows/history": { module: "workflows", title: "Workflow History" },
  "/employment-types": { module: "employment-types", title: "Type Management" },
  "/employment-types/permanent": { module: "employment-types", title: "Permanent" },
  "/employment-types/contract": { module: "employment-types", title: "Contract" },
  "/employment-types/temporary": { module: "employment-types", title: "Temporary" },
  "/employment-types/probation": { module: "employment-types", title: "Probation" },
  "/employment-types/intern-trainee": { module: "employment-types", title: "Intern / Trainee" },
  "/employment-types/expatriate": { module: "employment-types", title: "Expatriate" },
  "/employment-types/custom": { module: "employment-types", title: "Custom Types" },
  "/settings/employees": { module: "settings", title: "Employee Settings" },
  "/settings/payroll": { module: "settings", title: "Payroll Settings" },
  "/settings/attendance": { module: "settings", title: "Attendance Settings" },
  "/settings/leave": { module: "settings", title: "Leave Settings" },
  "/settings/benefits": { module: "settings", title: "Benefits Settings" },
  "/settings/recruitment": { module: "settings", title: "Recruitment Settings" },
  "/settings/notifications": { module: "settings", title: "Notifications" },
  "/settings/security": { module: "settings", title: "Security" },
  "/settings/system": { module: "settings", title: "System Settings" },
  "/billing": { module: "billing", title: "Current Plan" },
  "/billing/subscription": { module: "billing", title: "Subscription" },
  "/billing/usage": { module: "billing", title: "Usage" },
  "/billing/details": { module: "billing", title: "Billing Details" },
  "/billing/history": { module: "billing", title: "Billing History" },
  "/billing/invoices": { module: "billing", title: "Invoices" },
};

const MODULE_TITLES = {
  attendance: "Time & Attendance",
  recruitment: "Recruitment",
  leave: "Leave",
  payroll: "Payroll",
  compensation: "Compensation & Rewards",
  statutories: "Statutories",
  performance: "Performance",
  training: "Training & Development",
  assets: "Assets",
  documents: "Documents",
  reports: "Reports & Analytics",
  organization: "Organization",
  workflows: "Workflows & Approvals",
  "employment-types": "Employment Types",
  settings: "Settings",
  billing: "Billing & Subscription",
};

const MODULE_HOME = {
  attendance: "/attendance",
  recruitment: "/recruitment",
  leave: "/leave",
  payroll: "/payroll",
  compensation: "/compensation",
  statutories: "/statutories",
  performance: "/performance",
  training: "/training",
  assets: "/assets",
  documents: "/documents",
  reports: "/reports",
  organization: "/organization",
  workflows: "/workflows",
  "employment-types": "/employment-types",
  settings: "/settings",
  billing: "/billing",
};

function PlannedWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const cfg = WORKSPACES[location.pathname];

  if (!cfg) {
    return <div style={{ color: "var(--chris-text-main)" }}>Workspace route is not configured.</div>;
  }

  const moduleTitle = MODULE_TITLES[cfg.module] || "CHRIS";
  const home = MODULE_HOME[cfg.module] || "/";

  return (
    <div style={{ color: "var(--chris-text-main)" }}>
      <button type="button" onClick={() => navigate(home)} style={backStyle}>
        {"\u2190"} Back to {moduleTitle} Dashboard
      </button>

      <div style={{ marginBottom: 22 }}>
        <div style={eyebrowStyle}>{moduleTitle.toUpperCase()}</div>
        <h1 style={titleStyle}>{cfg.title}</h1>
        <p style={descriptionStyle}>
          This workspace is now independently routed in CHRIS and ready for operational data, workflows and reporting.
        </p>
      </div>

      <div style={metricGridStyle}>
        {["Records","Pending Actions","Exceptions","This Period"].map((label) => (
          <div key={label} style={cardStyle}>
            <div style={metricLabelStyle}>{label}</div>
            <div style={metricValueStyle}>{"\u2014"}</div>
            <div style={metricSubStyle}>Activates with live module data</div>
          </div>
        ))}
      </div>

      <section style={panelStyle}>
        <h2 style={{ margin: 0 }}>{cfg.title} Workspace</h2>
        <p style={sectionSubStyle}>
          Navigation is active. Operational functionality will be connected in the module implementation sprint.
        </p>
        <div style={emptyStyle}>
          No live operational records are connected yet.
        </div>
      </section>
    </div>
  );
}

const backStyle={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,cursor:"pointer"};
const eyebrowStyle={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const descriptionStyle={margin:0,maxWidth:900,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.55};
const metricGridStyle={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:16,marginBottom:18};
const cardStyle={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)"};
const metricLabelStyle={color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700};
const metricValueStyle={fontSize:28,fontWeight:800,marginTop:10};
const metricSubStyle={color:"var(--chris-text-muted)",fontSize:"var(--chris-font-xs)",marginTop:6};
const panelStyle={...cardStyle,marginTop:18};
const sectionSubStyle={margin:"6px 0 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
const emptyStyle={padding:"18px 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.6};

export default PlannedWorkspace;
