import { useNavigate } from "react-router-dom";

const MODULES = {
  recruitment:{eyebrow:"TALENT ACQUISITION",title:"Recruitment Dashboard",description:"Monitor recruitment activity, hiring pipeline and talent acquisition operations.",areas:["Job Requisitions","Candidates","Interviews","Offers","Onboarding Handover"]},
  payroll:{eyebrow:"PAYROLL OPERATIONS",title:"Payroll Dashboard",description:"Monitor payroll processing, pay-cycle readiness, exceptions and statutory outputs.",areas:["Payroll Runs","Salary Rates","Allowances","Deductions","Pay Advice"]},
  compensation:{eyebrow:"REWARDS MANAGEMENT",title:"Compensation & Rewards Dashboard",description:"Monitor compensation structures, rewards, salary positioning and employee reward programmes.",areas:["Salary Structure","Allowances","Bonuses","Rewards","Compensation Analytics"]},
  benefits:{eyebrow:"EMPLOYEE REWARDS",title:"Benefits Dashboard",description:"Monitor employee benefit participation, eligibility, enrolment and benefit administration.",areas:["Benefit Plans","Eligibility","Enrolment","Dependants","Benefit Analytics"]},
  statutories:{eyebrow:"COMPLIANCE OPERATIONS",title:"Statutories Dashboard",description:"Monitor statutory obligations, deductions, remittances, reconciliation and compliance status.",areas:["PAYE","Pension","NSITF","ITF","Health / Other Statutories"]},
  performance:{eyebrow:"PERFORMANCE MANAGEMENT",title:"Performance Dashboard",description:"Monitor goals, reviews, ratings, performance cycles and workforce performance trends.",areas:["Goals","Appraisals","Review Cycles","Ratings","Performance Analytics"]},
  training:{eyebrow:"LEARNING & DEVELOPMENT",title:"Training & Development Dashboard",description:"Monitor learning programmes, training participation, development plans and capability growth.",areas:["Training Calendar","Programmes","Participants","Development Plans","Learning Analytics"]},
  assets:{eyebrow:"ASSET ADMINISTRATION",title:"Assets Dashboard",description:"Monitor employee-assigned assets, inventory status, returns and asset accountability.",areas:["Asset Register","Assignments","Returns","Maintenance","Asset Analytics"]},
  documents:{eyebrow:"DOCUMENT MANAGEMENT",title:"Documents Dashboard",description:"Monitor HR documents, employee records, templates, expiries and document compliance.",areas:["Employee Documents","Templates","Expiry Tracking","Letters","Document Analytics"]},
  reports:{eyebrow:"WORKFORCE INTELLIGENCE",title:"Reports & Analytics Dashboard",description:"Access workforce analytics, operational reports, trends and management insights.",areas:["Workforce Reports","Lifecycle Reports","Attendance Reports","Leave Reports","Exports"]},
  organization:{eyebrow:"ORGANIZATION MANAGEMENT",title:"Organization Dashboard",description:"Monitor organizational structure, locations, departments, designations and reporting relationships.",areas:["Locations","Departments","Designations","Org Structure","Line Managers"]},
  workflows:{eyebrow:"WORKFLOW CONTROL",title:"Workflows & Approvals Dashboard",description:"Monitor pending approvals, workflow queues, turnaround times and process exceptions.",areas:["Pending Approvals","My Approvals","Workflow Rules","Escalations","Approval Analytics"]},
  employmentTypes:{eyebrow:"EMPLOYMENT FRAMEWORK",title:"Employment Types Dashboard",description:"Monitor employment categories, workforce distribution and employment-type configuration.",areas:["Permanent","Contract","Temporary","Internship","Custom Types"]},
  settings:{eyebrow:"SYSTEM ADMINISTRATION",title:"Settings Dashboard",description:"Manage CHRIS configuration, access controls, module settings and system administration.",areas:["Users & Roles","Permissions","Location Access","Module Settings","Security"]},
  billing:{eyebrow:"ACCOUNT ADMINISTRATION",title:"Billing & Subscription Dashboard",description:"Monitor subscription, plan usage, billing records and account administration.",areas:["Current Plan","Subscription","Usage","Invoices","Billing History"]},
};

function ModuleDashboard({moduleKey}) {
  const m = MODULES[moduleKey] || {eyebrow:"CHRIS MODULE",title:"Module Dashboard",description:"Operational and analytical overview.",areas:[]};

  return <div style={{color:"var(--chris-text-main)"}}>
    <div style={{marginBottom:22}}>
      <div style={{color:"var(--chris-gold)",fontSize:"var(--chris-font-sm)",fontWeight:800,letterSpacing:"0.15em"}}>{m.eyebrow}</div>
      <h1 style={{margin:"7px 0 6px",fontSize:"var(--chris-font-2xl)",fontWeight:800}}>{m.title}</h1>
      <p style={{margin:0,maxWidth:900,color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.55}}>{m.description}</p>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:16,marginBottom:18}}>
      {["Records","Pending Actions","Exceptions","This Period"].map((label)=><Metric key={label} label={label}/>)}
    </div>

    <section style={panelStyle}>
      <SectionHeader title="Operational Areas" subtitle="Functions connected to this module dashboard."/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
        {m.areas.map((area)=><div key={area} style={areaCard}>
          <div style={{fontSize:"var(--chris-font-lg)",fontWeight:800}}>{area}</div>
          <div style={{color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",lineHeight:1.5,marginTop:8}}>
            Live analytics and operational shortcuts will activate as this child feature is completed.
          </div>
          <div style={{color:"var(--chris-gold)",fontSize:"var(--chris-font-xs)",fontWeight:800,marginTop:14}}>PLANNED / CONNECTING</div>
        </div>)}
      </div>
    </section>

    <section style={{...panelStyle,marginTop:18}}>
      <SectionHeader title="Dashboard Intelligence" subtitle="This dashboard will populate automatically from its child modules as their data becomes available."/>
      <div style={{padding:"18px 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-md)",lineHeight:1.6}}>
        No analytical data is available yet for this module. CHRIS will replace these placeholders with live KPIs, trends, alerts and recent activity as the underlying functions are completed.
      </div>
    </section>
  </div>;
}

function Metric({label}) {
  return <div style={panelStyle}>
    <div style={{color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)",fontWeight:700}}>{label}</div>
    <div style={{fontSize:28,fontWeight:800,marginTop:10}}>—</div>
    <div style={{color:"var(--chris-text-muted)",fontSize:"var(--chris-font-xs)",marginTop:6}}>Activates with module data</div>
  </div>;
}
function SectionHeader({title,subtitle}) {
  return <div style={{marginBottom:18}}>
    <h2 style={{margin:0,fontSize:"var(--chris-font-xl)",fontWeight:800}}>{title}</h2>
    <p style={{margin:"6px 0 0",color:"var(--chris-text-secondary)",fontSize:"var(--chris-font-sm)"}}>{subtitle}</p>
  </div>;
}
const panelStyle={background:"linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))",border:"1px solid var(--chris-border-gold)",borderRadius:"var(--chris-radius-card)",padding:20,boxShadow:"var(--chris-shadow-card)"};
const areaCard={minHeight:145,padding:16,borderRadius:"var(--chris-radius-md)",border:"1px solid var(--chris-border-soft)",background:"rgba(255,255,255,.025)",color:"var(--chris-text-main)"};
export default ModuleDashboard;
