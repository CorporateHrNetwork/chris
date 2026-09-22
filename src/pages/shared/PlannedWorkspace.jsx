import { useLocation, useNavigate } from "react-router-dom";
import DocumentsWorkspace from "../documents/DocumentsWorkspace";
import EmploymentTypeManagement from "../EmploymentTypeManagement";
import SalaryReviewManagement from "../SalaryReviewManagement";
import OperationalControlWorkspace from "./OperationalControlWorkspace";

const STATUTORY_AREAS = { "/statutories/paye-tax":"PAYE_TAX", "/statutories/pension-compliance":"PENSION_COMPLIANCE", "/statutories/nhia":"NHIA", "/statutories/nsitf":"NSITF", "/statutories/itf":"ITF", "/statutories/remittances":"REMITTANCES", "/statutories/reports":"REPORTS" };
const PERFORMANCE_AREAS = { "/performance/goals-kpis":"GOALS_KPIS", "/performance/cycles":"CYCLES", "/performance/reviews":"REVIEWS", "/performance/appraisals":"APPRAISALS", "/performance/improvement-plans":"IMPROVEMENT_PLANS", "/performance/reports":"REPORTS" };
const ASSET_AREAS = { "/assets/register":"REGISTER", "/assets/categories":"CATEGORIES", "/assets/assignment":"ASSIGNMENT", "/assets/transfers":"TRANSFERS", "/assets/returns":"RETURNS", "/assets/maintenance":"MAINTENANCE", "/assets/reports":"REPORTS" };
const WORKFLOW_AREAS = { "/workflows/approval-inbox":"APPROVAL_INBOX", "/workflows/my-requests":"MY_REQUESTS", "/workflows/templates":"TEMPLATES", "/workflows/approval-chains":"APPROVAL_CHAINS", "/workflows/delegations":"DELEGATIONS", "/workflows/history":"HISTORY" };
const TRAINING_AREAS = { "/training/programs":"PROGRAMS", "/training/calendar":"CALENDAR", "/training/employee-training":"EMPLOYEE_TRAINING", "/training/learning-records":"LEARNING_RECORDS", "/training/assessments":"ASSESSMENTS", "/training/certifications":"CERTIFICATIONS", "/training/reports":"REPORTS" };
const REPORT_AREAS = { "/reports/recruitment":"RECRUITMENT", "/reports/compensation":"COMPENSATION", "/reports/benefits":"BENEFITS", "/reports/custom":"CUSTOM" };
const COMPENSATION_AREAS = { "/compensation/salary-structure":"SALARY_STRUCTURE", "/compensation/grades-levels":"GRADES_LEVELS", "/compensation/salary-bands":"SALARY_BANDS", "/compensation/adjustments":"ADJUSTMENTS", "/compensation/promotions":"PROMOTIONS", "/compensation/bonuses-incentives":"BONUSES_INCENTIVES", "/compensation/total-rewards":"TOTAL_REWARDS" };
const BILLING_AREAS = { "/billing/current-plan":"CURRENT_PLAN", "/billing/subscription":"SUBSCRIPTION", "/billing/usage":"USAGE", "/billing/details":"BILLING_DETAILS", "/billing/history":"BILLING_HISTORY", "/billing/invoices":"INVOICES" };

const MODULE_TITLES = { attendance:"Time & Attendance", recruitment:"Recruitment", leave:"Leave", payroll:"Payroll", compensation:"Compensation & Rewards", training:"Training & Development", assets:"Assets", reports:"Reports & Analytics", organization:"Organization", workflows:"Workflows & Approvals", "employment-types":"Employment Types", settings:"Settings", billing:"Billing & Subscription" };
function titleFromPath(pathname){const segment=pathname.split("/").filter(Boolean).at(-1)||"workspace";return segment.replaceAll("-"," ").replace(/\b\w/g,(c)=>c.toUpperCase()).replace("Paye Tax","PAYE / Tax").replace("Kpis","KPIs");}

export default function PlannedWorkspace(){
  const location=useLocation(); const navigate=useNavigate(); const pathname=location.pathname.replace(/\/+$/," ").trim()||"/";
  if(pathname.startsWith("/documents/")) return <DocumentsWorkspace/>;
  if(pathname==="/compensation/reviews") return <SalaryReviewManagement/>;
  if(pathname.startsWith("/employment-types/")) return <EmploymentTypeManagement/>;
  if(STATUTORY_AREAS[pathname]) return <OperationalControlWorkspace module="STATUTORIES" area={STATUTORY_AREAS[pathname]}/>;
  if(PERFORMANCE_AREAS[pathname]) return <OperationalControlWorkspace module="PERFORMANCE" area={PERFORMANCE_AREAS[pathname]}/>;
  if(ASSET_AREAS[pathname]) return <OperationalControlWorkspace module="ASSETS" area={ASSET_AREAS[pathname]}/>;
  if(WORKFLOW_AREAS[pathname]) return <OperationalControlWorkspace module="WORKFLOWS" area={WORKFLOW_AREAS[pathname]}/>;
  if(TRAINING_AREAS[pathname]) return <OperationalControlWorkspace module="TRAINING" area={TRAINING_AREAS[pathname]}/>;
  if(REPORT_AREAS[pathname]) return <OperationalControlWorkspace module="REPORTS" area={REPORT_AREAS[pathname]}/>;
  if(COMPENSATION_AREAS[pathname]) return <OperationalControlWorkspace module="COMPENSATION" area={COMPENSATION_AREAS[pathname]}/>;
  if(BILLING_AREAS[pathname]) return <OperationalControlWorkspace module="BILLING" area={BILLING_AREAS[pathname]}/>;

  const moduleKey=pathname.split("/").filter(Boolean)[0]||""; const moduleTitle=MODULE_TITLES[moduleKey]||"CHRiS"; const home=moduleKey?`/${moduleKey}`:"/"; const title=titleFromPath(pathname);
  return <div style={{color:"var(--chris-text-main)"}}><button type="button" onClick={()=>navigate(home)} style={backStyle}>← Back to {moduleTitle} Dashboard</button><div style={{marginBottom:22}}><div style={eyebrowStyle}>{moduleTitle.toUpperCase()}</div><h1 style={titleStyle}>{title}</h1><p style={descriptionStyle}>This routed workspace has not yet been connected to an operational data service.</p></div><section style={panelStyle}><h2 style={{margin:0}}>{title}</h2><p style={sectionSubStyle}>No live operational records are connected for this remaining workspace yet.</p></section></div>;
}
const backStyle={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,cursor:"pointer"}; const eyebrowStyle={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"}; const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800}; const descriptionStyle={margin:0,maxWidth:900,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.55}; const panelStyle={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)",marginTop:18}; const sectionSubStyle={margin:"6px 0 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};