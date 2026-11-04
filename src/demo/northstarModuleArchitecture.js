// Independent fictional module previews. Never import customer records or tenant policies.
export const northstarArchitecture = Object.freeze([
  {key:"employees",name:"People & Organization",description:"Employee directory, roles, organizational units and reporting lines",route:"/employees",stage:"Existing shared module"},
  {key:"recruitment",name:"Talent Acquisition",description:"Requisitions, candidates, onboarding and talent pipeline",route:"/recruitment",stage:"Existing shared module"},
  {key:"attendance",name:"Time & Attendance",description:"Daily attendance, shifts, schedules and worked days",route:"/attendance",stage:"Existing shared module"},
  {key:"leave",name:"Leave Administration",description:"Entitlement, balance, requests, calendar and leave history",route:"/leave",stage:"Independent illustrative preview"},
  {key:"payroll",name:"Payroll & Rewards",description:"Payroll cycles, elements, reviews and statements",route:"/payroll",stage:"Existing shared module"},
  {key:"loans",name:"Loans & Recovery",description:"Loan balances, instalment schedules and history",route:"/loans",stage:"Independent illustrative preview"},
  {key:"benefits",name:"Benefits & Welfare",description:"Benefit programs, eligibility and enrolment summary",route:"/benefits",stage:"Independent illustrative preview"},
  {key:"performance",name:"Performance & Leadership",description:"Role goals, evidence, reviews and development plans",route:"/performance",stage:"Independent illustrative preview"},
  {key:"training",name:"Learning & Development",description:"Training calendar, learning records and certifications",route:"/training",stage:"Existing shared module"},
  {key:"reports",name:"Reporting & Analytics",description:"Workforce metrics, operational reports and audit visibility",route:"/reports",stage:"Existing shared module"}
]);

const history=[
 {id:"NS-LEAVE-001",period:"Aug 2026",description:"Annual leave · 5 days",status:"Approved"},
 {id:"NS-LEAVE-002",period:"Dec 2026",description:"Illustrative scheduled leave · 5 days",status:"Awaiting external confirmation"},
];
const loans=[
 {id:"NS-LOAN-001",period:"Oct 2026",description:"Sample staff loan · ₦120,000",status:"₦60,000 remaining"},
 {id:"NS-LOAN-002",period:"Nov 2026",description:"Sample installment · ₦20,000",status:"Scheduled"},
];
const benefits=[
 {id:"NS-BEN-001",period:"2026",description:"Employee health plan",status:"Sample enrolled"},
 {id:"NS-BEN-002",period:"2026",description:"Retirement savings plan",status:"Sample eligible"},
 {id:"NS-BEN-003",period:"2026",description:"Professional learning allowance",status:"Illustrative"},
];
const exits=[
 {id:"NS-EXIT-001",period:"Sep 2026",description:"Fictional separation checklist",status:"Sample closed"},
 {id:"NS-EXIT-002",period:"Oct 2026",description:"Knowledge transfer and property return",status:"Sample completed"},
];
const payroll=[
 {id:"NS-PAY-2026-09",period:"Sep 2026",description:"Illustrative approved monthly payroll",status:"Reviewed"},
 {id:"NS-PAY-2026-10",period:"Oct 2026",description:"Illustrative payroll preparation",status:"Draft"},
];
const performance=[
 {id:"NS-PE-2026-Q3",period:"Q3 2026",description:"Role duty objectives and evidence review",status:"Sample acknowledged"},
 {id:"NS-PE-2026-Q4",period:"Q4 2026",description:"Goals published for evaluation",status:"Illustrative"},
];
const documents=[
 {id:"NS-DOC-001",period:"2026",description:"Synthetic employment handbook",status:"Sample acknowledged"},
 {id:"NS-DOC-002",period:"2026",description:"Fictional employee document checklist",status:"Sample complete"},
];
const samples={
 leave:{title:"Leave administration",intro:"A company's leave types, entitlement settings, calendar, balances and approved leave history are visible together.",steps:["Define the organisation's own leave policies","Review sample employee entitlements and balances","Record an externally authorised leave decision","View historical leave and calendar"],rows:history,metrics:[["Illustrative annual entitlement","21 days"],["Illustrative days used","5 days"],["Illustrative available balance","16 days"]]},
 loan:{title:"Loans and recovery",intro:"Demonstrate loan profiles, instalment history and outstanding balances without initiating a payment or approval.",steps:["Review employee loan eligibility","Inspect an existing example loan record","Examine repayment schedule and reconciliations","View completed loan history"],rows:loans,metrics:[["Example principal","₦120,000"],["Example paid","₦60,000"],["Example outstanding","₦60,000"]]},
 benefit:{title:"Employee benefits",intro:"Explore how an organisation can model its own welfare, retirement and insurance programmes independently.",steps:["Set organisation-owned benefit categories","Assign illustrative programme eligibility","Review enrolment records","Summarise benefit utilisation"],rows:benefits,metrics:[["Illustrative programmes","3"],["Sample eligibility","Independent"],["Data source","Fictional"]]},
 exit:{title:"Employee exit and clearance",intro:"Explore separation, handover, clearance and exit settlement stages using imaginary cases.",steps:["Register an illustrative separation","Review clearance checklist","Prepare handover and settlement view","Retain read-only exit history"],rows:exits,metrics:[["Sample cases","2"],["Real employee changes","None"],["Payments","Disabled"]]},
 payroll:{title:"Payroll and compensation",intro:"Illustrate payroll structure and review stages without using another employer's formulas or approval chain.",steps:["Set fictional pay components and periods","Review a sample payroll calculation","Inspect validation and approval stages","View payslip and statutory report structure"],rows:payroll,metrics:[["Illustrative pay basis","Organisation-defined"],["Sample payroll status","Draft / Reviewed"],["Disbursements","Disabled"]]},
 performance:{title:"Performance and leadership",intro:"Role goals, manager evidence, self-review and HR validation appear through a fictional evaluation cycle.",steps:["Publish fictional role objectives","Review goal weights and evidence","Inspect manager and HR review stages","Track a sample development plan"],rows:performance,metrics:[["Example review cycle","Quarterly"],["Sample rating range","1–5"],["Linked employee data","Fictional"]]},
 document:{title:"Policy and employment resources",intro:"Review the structure of policy libraries, employee documents, templates and acknowledgement records.",steps:["Organise demo policy categories","View illustrative document checklist","Review acknowledgements","Monitor mock document expiry"],rows:documents,metrics:[["Sample documents","2"],["Policy ownership","Northstar"],["Downloads","Preview only"]]},
 generic:{title:"Independent organisation configuration",intro:"Shared CHRiS building blocks are reusable, but every customer defines its own policies, permissions and data.",steps:["Identify applicable CHRiS module","Configure company-owned rules","Assign tenant-scoped access","Validate on fictional records"],rows:[],metrics:[["Tenant","Northstar Demo Industries"],["Access","Read-only demonstration"],["Live operations","Disabled"]]}
};
export function getNorthstarPreview(pathname=""){
 const path=String(pathname).toLowerCase();
 const key=/loan/.test(path)?"loan":/leave/.test(path)?"leave":/benefit|gratuity|pension|insurance|welfare|housing|transport|meal/.test(path)?"benefit":/exit/.test(path)?"exit":/salary|payroll|deduction|allowance|pay-component/.test(path)?"payroll":/performance|evaluation|appraisal|goal/.test(path)?"performance":/document|policy|resource/.test(path)?"document":"generic";
 return {key,...samples[key]};
}
