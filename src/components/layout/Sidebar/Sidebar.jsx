import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FaBriefcase,
  FaCalendarAlt,
  FaChartLine,
  FaChevronDown,
  FaChevronRight,
  FaClipboardCheck,
  FaClock,
  FaCog,
  FaFileAlt,
  FaFileInvoiceDollar,
  FaFolderOpen,
  FaGift,
  FaGraduationCap,
  FaHeadset,
  FaLaptop,
  FaMoneyBillWave,
  FaMoneyCheckAlt,
  FaShieldAlt,
  FaSignOutAlt,
  FaSitemap,
  FaTachometerAlt,
  FaUserPlus,
  FaUsers,
} from "react-icons/fa";

import chrisLogo from "../../../assets/images/chris-logo.png";
import { clearAuthSession } from "../../../services/api";
import useAuthorization from "../../../hooks/useAuthorization";

const MENU_GROUPS = [
  { id:"dashboard", label:"Dashboard", icon:<FaTachometerAlt/>, permission:"dashboard.view", path:"/", exact:true },
  { id:"client-support", label:"Support", icon:<FaHeadset/>, authenticated:true, path:"/support", exact:true },
  { id:"internal-support-desk", label:"CHRiS Support Desk", icon:<FaHeadset/>, permission:"support.internal.view", path:"/support-desk", exact:true },
  { id:"employees", label:"Employees", icon:<FaUsers/>, permission:"employees.view", children:[
    {label:"Add / Onboard Employee",path:"/employees/add"},{label:"Employee Dashboard",path:"/employees"},{label:"Employee Directory",path:"/employees/directory"},{label:"Employee Profiles",path:"/employees/profiles"},{label:"Onboarding Tracker",path:"/employees/onboarding"},{label:"Employee Analytics",path:"/employees/analytics"},{label:"Transfers",path:"/employees/transfers"},{label:"Promotions",path:"/employees/promotions"},{label:"Exits",path:"/employees/exits"},{label:"Line Managers",path:"/employees/line-managers"}
  ]},
  { id:"recruitment", label:"Recruitment", icon:<FaUserPlus/>, permission:"recruitment.view", children:[
    {label:"Recruitment Dashboard",path:"/recruitment"},{label:"Job Requisitions",path:"/recruitment?workspace=requisitions"},{label:"Vacancies",path:"/recruitment/vacancies"},{label:"Candidates",path:"/recruitment/candidates"},{label:"Interviews",path:"/recruitment/interviews"},{label:"Offers",path:"/recruitment/offers"},{label:"Applicant Tracking System",path:"/recruitment/ats"},{label:"Talent Pool",path:"/recruitment/talent-pool"}
  ]},
  { id:"time-attendance", label:"Time & Attendance", icon:<FaClock/>, permission:"attendance.view", children:[
    {label:"Attendance Dashboard",path:"/attendance"},{label:"Attendance Register",path:"/attendance/register"},{label:"Shifts",path:"/attendance/shifts"},{label:"Shift Schedule",path:"/attendance/shift-schedule"},{label:"Worked Hours",path:"/attendance/worked-hours"},{label:"Worked Days",path:"/attendance/worked-days"},{label:"Off Days",path:"/attendance/off-days"},{label:"Overtime",path:"/attendance/overtime"},{label:"Public Holidays",path:"/attendance/public-holidays"},{label:"Lateness & Absence",path:"/attendance/lateness-absence"}
  ]},
  { id:"leave", label:"Leave", icon:<FaCalendarAlt/>, permission:"leave.view", children:[
    {label:"Leave Overview",path:"/leave"},{label:"Leave Requests",path:"/leave/requests"},{label:"Active Leave",path:"/leave/active"},{label:"Return to Work",path:"/leave/returns"},{label:"Leave Calendar",path:"/leave/calendar"},{label:"Leave Balances",path:"/leave/balances"},{label:"Leave Entitlements",path:"/leave/entitlements"},{label:"Leave Policies",path:"/leave/policies"},{label:"Leave Exceptions",path:"/leave/exceptions"}
  ]},
  { id:"payroll", label:"Payroll", icon:<FaMoneyCheckAlt/>, permission:"payroll.view", children:[
    {label:"Payroll Dashboard",path:"/payroll"},{label:"Execute Payroll",path:"/payroll?workspace=execute"},{label:"Payroll Periods",path:"/payroll?workspace=periods"},{label:"Salary Rates",path:"/payroll?workspace=rates"},{label:"Allowances",path:"/payroll?workspace=allowances"},{label:"Deductions",path:"/payroll?workspace=deductions"},{label:"Payslips",path:"/payroll?workspace=payslips"},{label:"Loans",path:"/loans"},{label:"Salary Advances",path:"/payroll?workspace=salary-advances"},{label:"Paid Leave",path:"/payroll?workspace=paid-leave"},{label:"Payroll Approvals",path:"/payroll?workspace=approvals"}
  ]},
  { id:"compensation", label:"Compensation & Rewards", icon:<FaMoneyBillWave/>, adminOnly:true, children:[
    {label:"Compensation Dashboard",path:"/compensation"},{label:"Salary Structure",path:"/compensation/salary-structure"},{label:"Grades & Levels",path:"/compensation/grades-levels"},{label:"Salary Bands",path:"/compensation/salary-bands"},{label:"Compensation Reviews",path:"/compensation/reviews"},{label:"Salary Adjustments",path:"/compensation/adjustments"},{label:"Promotions",path:"/compensation/promotions"},{label:"Bonuses & Incentives",path:"/compensation/bonuses-incentives"},{label:"Total Rewards",path:"/compensation/total-rewards"}
  ]},
  { id:"benefits", label:"Benefits", icon:<FaGift/>, adminOnly:true, children:[
    {label:"Benefits Overview",path:"/benefits"},{label:"Pension",path:"/benefits/pension"},{label:"Gratuity",path:"/benefits/gratuity"},{label:"Health Insurance",path:"/benefits/health-insurance"},{label:"Life Insurance",path:"/benefits/life-insurance"},{label:"Medical Benefits",path:"/benefits/medical"},{label:"Housing / Rent",path:"/benefits/housing"},{label:"Transport Benefits",path:"/benefits/transport"},{label:"Meal Benefits",path:"/benefits/meals"},{label:"Other Benefits",path:"/benefits/other"},{label:"Benefit Enrolments",path:"/benefits/enrolments"}
  ]},
  { id:"statutories", label:"Statutories", icon:<FaShieldAlt/>, adminOnly:true, children:[
    {label:"Statutory Dashboard",path:"/statutories"},{label:"PAYE / Tax",path:"/statutories/paye-tax"},{label:"Pension Compliance",path:"/statutories/pension-compliance"},{label:"NHIA",path:"/statutories/nhia"},{label:"NSITF",path:"/statutories/nsitf"},{label:"ITF",path:"/statutories/itf"},{label:"Remittances",path:"/statutories/remittances"},{label:"Statutory Reports",path:"/statutories/reports"}
  ]},
  { id:"performance", label:"Performance", icon:<FaChartLine/>, permission:"performance.view", children:[
    {label:"Performance Dashboard",path:"/performance"},{label:"Goals / KPIs",path:"/performance/goals-kpis"},{label:"Performance Cycles",path:"/performance/cycles"},{label:"Reviews",path:"/performance/reviews"},{label:"Appraisals",path:"/performance/appraisals"},{label:"Improvement Plans",path:"/performance/improvement-plans"},{label:"Performance Reports",path:"/performance/reports"}
  ]},
  { id:"training", label:"Training & Development", icon:<FaGraduationCap/>, permission:"training.view", children:[
    {label:"Training Dashboard",path:"/training"},{label:"Training Programs",path:"/training/programs"},{label:"Training Calendar",path:"/training/calendar"},{label:"Employee Training",path:"/training/employee-training"},{label:"Learning Records",path:"/training/learning-records"},{label:"Assessments",path:"/training/assessments"},{label:"Certifications",path:"/training/certifications"},{label:"Training Reports",path:"/training/reports"}
  ]},
  { id:"assets", label:"Assets", icon:<FaLaptop/>, adminOnly:true, children:[
    {label:"Assets Dashboard",path:"/assets"},{label:"Asset Register",path:"/assets/register"},{label:"Asset Categories",path:"/assets/categories"},{label:"Asset Assignment",path:"/assets/assignment"},{label:"Asset Transfers",path:"/assets/transfers"},{label:"Asset Returns",path:"/assets/returns"},{label:"Maintenance",path:"/assets/maintenance"},{label:"Asset Reports",path:"/assets/reports"}
  ]},
  { id:"documents", label:"Documents", icon:<FaFolderOpen/>, adminOnly:true, children:[
    {label:"Documents Dashboard",path:"/documents"},{label:"Employee Documents",path:"/documents/employee"},{label:"HR Documents",path:"/documents/hr"},{label:"Company Policies",path:"/documents/policies"},{label:"Templates",path:"/documents/templates"},{label:"Document Categories",path:"/documents/categories"},{label:"Expiry Tracking",path:"/documents/expiry-tracking"},{label:"Document Requests",path:"/documents/requests"}
  ]},
  { id:"reports", label:"Reports & Analytics", icon:<FaFileAlt/>, permission:"reports.view", children:[
    {label:"Reports Dashboard",path:"/reports"},{label:"Workforce Analytics",path:"/reports?view=workforce"},{label:"Employee Reports",path:"/reports?view=employees"},{label:"Headcount Reports",path:"/reports?view=headcount"},{label:"Branch Reports",path:"/reports?view=branches"},{label:"Recruitment Reports",path:"/reports/recruitment"},{label:"Attendance Reports",path:"/reports?view=attendance",permission:"attendance.view"},{label:"Leave Reports",path:"/reports?view=leave",permission:"leave.view"},{label:"Payroll Reports",path:"/reports?view=payroll",permission:"payroll.view"},{label:"Compensation Reports",path:"/reports/compensation"},{label:"Benefits Reports",path:"/reports/benefits"},{label:"Custom Reports",path:"/reports/custom"}
  ]},
  { id:"organization", label:"Organization", icon:<FaSitemap/>, adminOnly:true, children:[
    {label:"Organization Profile",path:"/organization/profile"},{label:"Head Office & Branches",path:"/settings?workspace=locations"},{label:"Departments & Designations",path:"/designations"},{label:"Organization Chart",path:"/organization/chart"},{label:"Reporting Lines",path:"/organization/reporting-lines"},{label:"Cost Centres",path:"/organization/cost-centres"}
  ]},
  { id:"workflows", label:"Workflows & Approvals", icon:<FaClipboardCheck/>, adminOnly:true, children:[
    {label:"Workflows Dashboard",path:"/workflows"},{label:"Approval Inbox",path:"/workflows/approval-inbox"},{label:"My Requests",path:"/workflows/my-requests"},{label:"Workflow Templates",path:"/workflows/templates"},{label:"Approval Chains",path:"/workflows/approval-chains"},{label:"Delegations",path:"/workflows/delegations"},{label:"Workflow History",path:"/workflows/history"}
  ]},
  { id:"employment-types", label:"Employment Types", icon:<FaBriefcase/>, adminOnly:true, children:[
    {label:"Type Management",path:"/employment-types"},{label:"Permanent",path:"/employment-types/permanent"},{label:"Contract",path:"/employment-types/contract"},{label:"Temporary",path:"/employment-types/temporary"},{label:"Probation",path:"/employment-types/probation"},{label:"Intern / Trainee",path:"/employment-types/intern-trainee"},{label:"Expatriate",path:"/employment-types/expatriate"},{label:"Custom Types",path:"/employment-types/custom"}
  ]},
  { id:"settings", label:"Settings", icon:<FaCog/>, permission:"settings.view", children:[
    {label:"Users & Roles",path:"/settings"},{label:"Roles & Permissions",path:"/settings"},{label:"Location Access",path:"/settings?workspace=locations"},{label:"Employee Settings",path:"/settings?workspace=employees"},{label:"Payroll Settings",path:"/settings?workspace=payroll"},{label:"Attendance Settings",path:"/settings?workspace=attendance"},{label:"Leave Settings",path:"/settings?workspace=leave"},{label:"Benefits Settings",path:"/settings?workspace=benefits"},{label:"Recruitment Settings",path:"/settings?workspace=recruitment"},{label:"Notifications",path:"/settings?workspace=notifications"},{label:"Security",path:"/settings?workspace=security"},{label:"System Settings",path:"/settings?workspace=system"}
  ]},
  { id:"billing", label:"Billing & Subscription", icon:<FaFileInvoiceDollar/>, adminOnly:true, children:[
    {label:"Billing Dashboard",path:"/billing"},{label:"Current Plan",path:"/billing/current-plan"},{label:"Subscription",path:"/billing/subscription"},{label:"Usage",path:"/billing/usage"},{label:"Billing Details",path:"/billing/details"},{label:"Billing History",path:"/billing/history"},{label:"Invoices",path:"/billing/invoices"}
  ]},
];

function Sidebar() {
  const location = useLocation();
  const { hasPermission, loading: authorizationLoading } = useAuthorization();
  const [openGroups, setOpenGroups] = useState({});
  const canViewSettings = !authorizationLoading && hasPermission("settings.view");
  const visibleGroups = useMemo(() => {
    if (authorizationLoading) return [];
    return MENU_GROUPS.filter((group) => {
      if (group.authenticated) return true;
      if (group.adminOnly) return canViewSettings;
      if (group.permission) return hasPermission(group.permission);
      return false;
    }).map((group) => ({ ...group, children: group.children?.filter((child) => !child.permission || hasPermission(child.permission)) }));
  }, [authorizationLoading, canViewSettings, hasPermission]);

  const pathMatches = (childPath, includeQuery = false) => {
    if (!childPath) return false;
    const queryIndex = childPath.indexOf("?");
    const pathname = queryIndex === -1 ? childPath : childPath.slice(0, queryIndex);
    const search = queryIndex === -1 ? "" : childPath.slice(queryIndex);
    if (location.pathname !== pathname) return pathname !== "/" && location.pathname.startsWith(`${pathname}/`);
    if (includeQuery && queryIndex !== -1) return location.search === search;
    return true;
  };

  useEffect(() => {
    const activeGroup = visibleGroups.find((group) => group.children?.some((child) => pathMatches(child.path, false)));
    if (!activeGroup) return;
    setOpenGroups((current) => current[activeGroup.id] ? current : { ...current, [activeGroup.id]: true });
  }, [location.pathname, visibleGroups]);

  const isChildActive = (childPath, routerActive) => {
    if (!childPath) return false;
    const queryIndex = childPath.indexOf("?");
    if (queryIndex !== -1) return location.pathname === childPath.slice(0, queryIndex) && location.search === childPath.slice(queryIndex);
    if ((childPath === "/payroll" || childPath === "/reports" || childPath === "/settings") && location.pathname === childPath && location.search) return false;
    return routerActive;
  };

  const handlePlannedItem = (label) => window.alert(`${label} is part of the approved CHRIS architecture and will be activated during its implementation stage.`);

  return (
    <aside style={sidebarStyle}>
      <div aria-hidden="true" style={ambientStyle}><div style={greenGlowStyle}/><div style={goldGlowStyle}/><div style={gridTextureStyle}/></div>
      <style>{`@keyframes chrisLogoPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.68;transform:scale(1.035)}}@media (prefers-reduced-motion: reduce){.chris-sidebar-logo{animation:none!important}}`}</style>
      <div style={brandHeaderStyle}><img className="chris-sidebar-logo" src={chrisLogo} alt="CHRIS" style={logoStyle}/><div style={brandNameStyle}>CorporateHR Network</div><div style={brandSubtitleStyle}>Information System</div><div style={brandDividerStyle}/></div>
      <nav style={navStyle}><div style={mainMenuLabelStyle}>Main Menu</div>
        {visibleGroups.map((group) => {
          if (!group.children) return <NavLink key={group.id} to={group.path} end={group.exact} style={({isActive})=>mainItemVisual(isActive)}><span style={iconStyle}>{group.icon}</span><span style={{flex:1}}>{group.label}</span></NavLink>;
          const isOpen=Boolean(openGroups[group.id]); const groupActive=group.children.some((child)=>pathMatches(child.path,false));
          return <div key={group.id} style={{marginBottom:2}}><button type="button" onClick={()=>setOpenGroups((current)=>({...current,[group.id]:!current[group.id]}))} style={groupButtonVisual(groupActive)}><span style={iconStyle}>{group.icon}</span><span style={{flex:1,textAlign:"left"}}>{group.label}</span><span style={{fontSize:10,opacity:.9}}>{isOpen?<FaChevronDown/>:<FaChevronRight/>}</span></button>
            {isOpen&&<div style={childrenWrapStyle}>{group.children.map((child,index)=>child.planned?<button key={`${group.id}-${index}`} type="button" onClick={()=>handlePlannedItem(child.label)} style={plannedChildStyle}><span style={childDotStyle}/><span style={{flex:1,textAlign:"left"}}>{child.label}</span><span style={plannedBadgeStyle}>planned</span></button>:<NavLink key={`${group.id}-${index}`} to={child.path} end style={({isActive})=>childLinkVisual(isChildActive(child.path,isActive))}>{({isActive})=>{const active=isChildActive(child.path,isActive);return <><span style={{...childDotStyle,background:active?"var(--chris-gold, #D4AF37)":"rgba(255,255,255,.35)"}}/><span>{child.label}</span></>;}}</NavLink>)}</div>}
          </div>;
        })}
      </nav>
      <div style={logoutWrapStyle}><button type="button" onClick={()=>{clearAuthSession();window.location.replace("/login");}} style={logoutButtonStyle}><span style={iconStyle}><FaSignOutAlt/></span><span>Logout</span></button></div>
    </aside>
  );
}

const sidebarStyle={width:276,minWidth:276,height:"100vh",display:"flex",flexDirection:"column",background:"var(--tenant-sidebar-gradient, var(--tenant-shell-gradient, linear-gradient(180deg, #06110C 0%, #030705 100%)))",color:"#FFFFFF",boxShadow:"8px 0 28px rgba(0,0,0,.34)",overflow:"hidden",boxSizing:"border-box",position:"relative",zIndex:30};
const ambientStyle={position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden",zIndex:0}; const greenGlowStyle={position:"absolute",width:260,height:260,top:-85,left:-90,borderRadius:"50%",background:"radial-gradient(circle, rgba(0,150,78,.24) 0%, rgba(0,120,65,.10) 38%, transparent 72%)",filter:"blur(8px)"}; const goldGlowStyle={position:"absolute",width:220,height:220,right:-125,top:"34%",borderRadius:"50%",background:"radial-gradient(circle, rgba(212,175,55,.16) 0%, rgba(212,175,55,.06) 40%, transparent 74%)",filter:"blur(10px)"}; const gridTextureStyle={position:"absolute",inset:0,opacity:.24,backgroundImage:"radial-gradient(circle at center, rgba(212,175,55,.42) .8px, transparent .9px)",backgroundSize:"24px 24px"};
const brandHeaderStyle={flexShrink:0,position:"relative",zIndex:1,padding:"18px 12px 17px",textAlign:"center",borderBottom:"1px solid rgba(212,175,55,.18)",background:"linear-gradient(180deg, rgba(255,255,255,.018), rgba(255,255,255,0))"}; const logoStyle={display:"block",width:220,maxWidth:"96%",height:"auto",objectFit:"contain",margin:"0 auto",background:"transparent",animation:"chrisLogoPulse 2.5s ease-in-out infinite",transformOrigin:"center"}; const brandNameStyle={marginTop:4,color:"var(--chris-green, #087A43)",fontSize:15,fontWeight:900,lineHeight:1.25}; const brandSubtitleStyle={marginTop:5,color:"var(--tenant-accent, var(--chris-gold, #D4AF37))",fontSize:10,fontWeight:800,lineHeight:1.3,letterSpacing:".16em",textTransform:"uppercase"}; const brandDividerStyle={width:"74%",height:1,margin:"14px auto 0",background:"linear-gradient(90deg, transparent 0%, rgba(8,122,67,.72) 25%, rgba(212,175,55,.92) 50%, rgba(8,122,67,.72) 75%, transparent 100%)"};
const navStyle={flex:1,minHeight:0,overflowY:"auto",overflowX:"hidden",padding:"12px 8px 22px",scrollbarWidth:"thin",scrollbarColor:"rgba(212,175,55,.35) transparent",position:"relative",zIndex:1}; const mainMenuLabelStyle={padding:"5px 12px 9px",color:"var(--tenant-accent, var(--chris-gold, #D4AF37))",fontSize:9,fontWeight:900,textTransform:"uppercase",letterSpacing:".12em"}; const itemBase={minHeight:44,display:"flex",alignItems:"center",gap:11,margin:"2px 0",padding:"9px 11px",borderRadius:9,textDecoration:"none",fontSize:12,fontWeight:700,boxSizing:"border-box"}; const mainItemVisual=(active)=>({...itemBase,background:active?"linear-gradient(90deg, rgba(8,122,67,.24), rgba(8,122,67,.10))":"linear-gradient(90deg, rgba(8,122,67,.16), rgba(8,122,67,.055))",color:active?"#FFFFFF":"#DCEBE3",borderLeft:active?"3px solid rgba(212,175,55,.88)":"3px solid rgba(8,122,67,.42)"}); const groupButtonVisual=(active)=>({...itemBase,width:"100%",borderTop:"none",borderRight:"none",borderBottom:"none",cursor:"pointer",fontFamily:"inherit",background:active?"linear-gradient(90deg, rgba(8,122,67,.24), rgba(8,122,67,.10))":"linear-gradient(90deg, rgba(8,122,67,.16), rgba(8,122,67,.055))",color:active?"#FFFFFF":"#DCEBE3",borderLeft:active?"3px solid rgba(212,175,55,.88)":"3px solid rgba(8,122,67,.42)"}); const childrenWrapStyle={margin:"2px 0 5px 39px",paddingLeft:8,borderLeft:"1px solid rgba(212,175,55,.20)"}; const childBase={minHeight:34,display:"flex",alignItems:"center",gap:8,padding:"6px 9px",borderRadius:6,fontSize:11,boxSizing:"border-box"}; const childLinkVisual=(active)=>({...childBase,textDecoration:"none",background:active?"linear-gradient(90deg, rgba(212,175,55,.13), rgba(0,122,67,.16))":"rgba(8,122,67,.045)",color:active?"#FFFFFF":"#BFD5CA",fontWeight:active?800:500}); const plannedChildStyle={...childBase,width:"100%",border:"none",background:"rgba(8,122,67,.045)",color:"#BBD3C6",fontFamily:"inherit",cursor:"pointer"}; const childDotStyle={width:5,height:5,minWidth:5,borderRadius:"50%",background:"rgba(255,255,255,.35)"}; const plannedBadgeStyle={color:"#91B7A4",fontSize:8,fontWeight:800,textTransform:"uppercase"}; const iconStyle={width:20,minWidth:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}; const logoutWrapStyle={flexShrink:0,borderTop:"1px solid rgba(8,122,67,.20)",padding:"8px 8px 10px",position:"relative",zIndex:1}; const logoutButtonStyle={...itemBase,width:"100%",minHeight:42,borderTop:"none",borderRight:"none",borderBottom:"none",borderLeft:"3px solid rgba(8,122,67,.42)",background:"linear-gradient(90deg, rgba(8,122,67,.16), rgba(8,122,67,.055))",color:"#DCEBE3",fontFamily:"inherit",cursor:"pointer"};

export default Sidebar;
