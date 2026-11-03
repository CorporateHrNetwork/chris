// Entirely fictional Northstar Evaluation of Duty example.
// The schema illustrates workflow structure; it does not import customer policies or records.
const anchors=[
 "1 — Substantially below agreed duty requirements",
 "2 — Some agreed duty requirements not met",
 "3 — Agreed duty requirements met",
 "4 — Consistently exceeds agreed duty requirements",
 "5 — Exceptional, independently evidenced duty outcomes"
];
const goal=(id,category,title,weight,target,measurement,evidence)=>({id,category,title,weight,target,measurement,evidence,anchors:[...anchors]});
const goals=[
 goal("ns-duty-1","results","Employee enquiries resolved",25,"At least 95% of assigned enquiries resolved within the agreed service window","Ticket closure report","Fictional service desk summary"),
 goal("ns-duty-2","results","Employee records maintained",20,"At least 98% completeness of assigned employee record checks","Sample quality audit","Fictional record-audit log"),
 goal("ns-duty-3","results","New hire onboarding delivered",15,"At least 90% of assigned onboarding tasks completed on time","Onboarding task completion","Fictional onboarding register"),
 goal("ns-duty-4","quality","Work quality and service",20,"Accurate, respectful and timely support to internal customers","Independent quality review","Fictional service review"),
 goal("ns-duty-5","teamwork","Teamwork and workplace conduct",20,"Collaborative handovers, punctuality and professional conduct","Manager observation and peer feedback","Fictional team feedback")
];
const policy={
 version:"NORTHSTAR-DEMO-PE-1",title:"Northstar illustrative quarterly duty evaluation",
 weights:{results:60,quality:20,teamwork:20},
 ratingScale:["Unsatisfactory","Needs improvement","Meets expectations","Exceeds expectations","Exceptional"],
 rules:[
  "The employee receives a role-specific duty scorecard with targets, measurement methods and evidence requirements.",
  "At quarter end, the employee records achievements and evidence before the line manager evaluates each duty.",
  "The manager records a 1–5 evidence-based rating and feedback discussion; HR validates before releasing the result.",
  "Acknowledgement confirms receipt, not agreement. A disputed result is referred for independent review.",
  "Development follow-up is separate from the rating. This sample never changes pay, promotion or disciplinary records."
 ]
};
const current={id:"northstar-review-q4",cycleId:"2026-Q4",periodStart:"2026-10-01",periodEnd:"2026-12-31",status:"GOALS_PUBLISHED",roleName:"HR Operations Specialist",employeeName:"Ada Okafor (fictional)",managerName:"Tunde Bello (fictional)",policyVersion:policy.version,goals,deadlines:{self:"2027-01-07",manager:"2027-01-14",hr:"2027-01-21"},selfAssessment:null,managerAssessment:null,finalScore:null,hrComment:null,employeeResponse:null,followUp:null};
const past={...current,id:"northstar-review-q3",cycleId:"2026-Q3",periodStart:"2026-07-01",periodEnd:"2026-09-30",status:"ACKNOWLEDGED",deadlines:{self:"2026-10-07",manager:"2026-10-14",hr:"2026-10-21"},
 selfAssessment:{comments:"Illustrative self-review: completed assigned employee support and onboarding tasks.",evidence:"Fictional service desk and onboarding summaries.",submittedAt:"2026-10-05T11:00:00Z"},
 managerAssessment:{discussion:"Illustrative feedback: maintain record accuracy and proactive communication.",development:"Example learning plan: strengthen reporting and employee data quality.",ratings:goals.map((g,i)=>({goalId:g.id,rating:[4,3,4,4,4][i],evidence:"Fictional evidence reviewed for "+g.title.toLowerCase()}))},
 finalScore:{score:3.8,band:"Exceeds expectations"},hrComment:"Illustrative HR validation completed.",employeeResponse:{action:"acknowledge",comments:"Sample acknowledgement of receipt.",submittedAt:"2026-10-19T12:00:00Z"},followUp:{status:"OPEN",date:"2026-11-15",notes:"Sample development coaching session."},releasedAt:"2026-10-18T09:00:00Z",appealDeadline:"2026-10-25"};
function evaluationOfDuty(){return {demoOnly:true,policy,roleStandard:{roleName:"HR Operations Specialist",department:"People Operations",description:"Fictional role standard for employee support, records and onboarding.",status:"PUBLISHED",version:1,goals},reviews:[current,past].map(r=>({...r,goals:r.goals.map(g=>({...g,anchors:[...g.anchors]}))})),notifications:[{id:"ns-notice-1",message:"Q4 illustrative duty objectives published",createdAt:"2026-10-01"},{id:"ns-notice-2",message:"Q3 sample evaluation acknowledged",createdAt:"2026-10-19"}]};}
module.exports={evaluationOfDuty};
