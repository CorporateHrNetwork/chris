import { useLocation, useNavigate } from "react-router-dom";
import DocumentsWorkspace from "../documents/DocumentsWorkspace";
import SalaryReviewManagement from "../SalaryReviewManagement";
import OperationalControlWorkspace from "./OperationalControlWorkspace";

const STATUTORY_AREAS = {
  "/statutories/paye-tax": "PAYE_TAX",
  "/statutories/pension-compliance": "PENSION_COMPLIANCE",
  "/statutories/nhia": "NHIA",
  "/statutories/nsitf": "NSITF",
  "/statutories/itf": "ITF",
  "/statutories/remittances": "REMITTANCES",
  "/statutories/reports": "REPORTS",
};

const PERFORMANCE_AREAS = {
  "/performance/goals-kpis": "GOALS_KPIS",
  "/performance/cycles": "CYCLES",
  "/performance/reviews": "REVIEWS",
  "/performance/appraisals": "APPRAISALS",
  "/performance/improvement-plans": "IMPROVEMENT_PLANS",
  "/performance/reports": "REPORTS",
};

const MODULE_TITLES = {
  attendance: "Time & Attendance",
  recruitment: "Recruitment",
  leave: "Leave",
  payroll: "Payroll",
  compensation: "Compensation & Rewards",
  training: "Training & Development",
  assets: "Assets",
  reports: "Reports & Analytics",
  organization: "Organization",
  workflows: "Workflows & Approvals",
  "employment-types": "Employment Types",
  settings: "Settings",
  billing: "Billing & Subscription",
};

function titleFromPath(pathname) {
  const segment = pathname.split("/").filter(Boolean).at(-1) || "workspace";
  return segment
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace("Paye Tax", "PAYE / Tax")
    .replace("Kpis", "KPIs");
}

export default function PlannedWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";

  // These modules now have live connected implementations. Legacy child URLs
  // must never fall back to the old planned placeholder again.
  if (pathname.startsWith("/documents/")) return <DocumentsWorkspace />;
  if (pathname === "/compensation/reviews") return <SalaryReviewManagement />;
  if (STATUTORY_AREAS[pathname]) {
    return <OperationalControlWorkspace module="STATUTORIES" area={STATUTORY_AREAS[pathname]} />;
  }
  if (PERFORMANCE_AREAS[pathname]) {
    return <OperationalControlWorkspace module="PERFORMANCE" area={PERFORMANCE_AREAS[pathname]} />;
  }

  const moduleKey = pathname.split("/").filter(Boolean)[0] || "";
  const moduleTitle = MODULE_TITLES[moduleKey] || "CHRiS";
  const home = moduleKey ? `/${moduleKey}` : "/";
  const title = titleFromPath(pathname);

  return (
    <div style={{ color: "var(--chris-text-main)" }}>
      <button type="button" onClick={() => navigate(home)} style={backStyle}>← Back to {moduleTitle} Dashboard</button>
      <div style={{ marginBottom: 22 }}>
        <div style={eyebrowStyle}>{moduleTitle.toUpperCase()}</div>
        <h1 style={titleStyle}>{title}</h1>
        <p style={descriptionStyle}>This routed workspace has not yet been connected to an operational data service.</p>
      </div>
      <section style={panelStyle}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p style={sectionSubStyle}>No live operational records are connected for this remaining workspace yet.</p>
      </section>
    </div>
  );
}

const backStyle={marginBottom:16,padding:0,border:"none",background:"transparent",color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,cursor:"pointer"};
const eyebrowStyle={color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"};
const titleStyle={margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800};
const descriptionStyle={margin:0,maxWidth:900,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.55};
const panelStyle={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)",marginTop:18};
const sectionSubStyle={margin:"6px 0 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"};
