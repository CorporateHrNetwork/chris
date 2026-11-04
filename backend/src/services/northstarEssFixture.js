// Northstar sample-only ESS fixture. All names, numbers, policies and events are invented.
const sections=[
["personal-details","Personal details",{dateOfBirth:"1996-07-15",gender:"FEMALE",maritalStatus:"SINGLE",nationality:"Nigerian",residentialAddress:"Fictional demo residence",state:"FCT",idType:"Sample identification",idNumber:"DEMO-NOT-VALID"}],
["contact-details","Contact details",{email:"employee@northstar-demo.example",phone:"Demo only"}],
["employment-details","Employment details",{employeeNumber:"NSTAR-DEMO-001",department:"People Operations",designation:"HR Operations Specialist",employmentType:"FULL_TIME",lineManager:"Tunde Bello (fictional)"}],
["next-of-kin","Next of kin",{fullName:"Chika Okafor (fictional)",relationship:"Sibling",phone:"Demo only"}],
["emergency-contact","Emergency contact",{fullName:"Mira Okoro (fictional)",relationship:"Friend",phone:"Demo only"}],
["education","Qualifications",{qualification:"B.Sc. Business Administration (sample)",institution:"Fictional Northstar College",year:"2018"}],
["employment-history","Employment history",{employer:"Sample Services (fictional)",position:"HR Assistant",period:"2019–2023"}],
["payment-details","Bank and payment",{bankName:"Northstar Sample Bank",accountName:"Ada Okafor (fictional)",accountNumber:"DEMO-NOT-VALID",paymentMethod:"BANK_TRANSFER",payrollCurrency:"NGN"}],
["statutory-details","Statutory registration",{taxIdentificationNumber:"DEMO-TIN-NOT-VALID",payeState:"FCT",pensionPfa:"Northstar Sample PFA",pensionPfaCode:"DEMO",pensionPin:"DEMO-PIN-NOT-VALID",nhiaStatus:"SAMPLE_REGISTERED",nhiaNumber:"DEMO-NHIA-NOT-VALID"}],
["policy-acknowledgement","Policy acknowledgements",{handbook:"Sample acknowledged",codeOfConduct:"Sample acknowledged",privacyNotice:"Sample acknowledged"}],
["document-checklist","Document checklist",{employmentLetter:"Sample filed",qualificationEvidence:"Sample filed",identityEvidence:"Sample only"}]
];
const samplePay=(id,periodName,periodCode,periodEnd,payDate,grossPay,deductions,runStatus)=>({id,periodName,periodCode,periodEnd,payDate,grossPay,deductions,netPreview:grossPay-deductions,runStatus,currency:"NGN",demoOnly:true});
const {evaluationOfDuty}=require("./northstarPerformanceFixture");
function fixture(){
 const approved=[samplePay("sample-payslip-sep","September 2026","2026-09","2026-09-30","2026-09-30",450000,78000,"APPROVED"),samplePay("sample-payslip-aug","August 2026","2026-08","2026-08-31","2026-08-31",450000,78000,"APPROVED")];
 const draft=samplePay("sample-preview-oct","October 2026","2026-10","2026-10-31",null,460000,80000,"DRAFT");
 return {demoOnly:true,evaluationOfDuty:evaluationOfDuty(),profile:{id:"northstar-fictional-ess-employee",employeeNumber:"NSTAR-DEMO-001",firstName:"Ada",lastName:"Okafor",name:"Ada Okafor",email:"employee@northstar-demo.example",phone:"Demo only",gender:"FEMALE",status:"ACTIVE",employmentType:"FULL_TIME",hireDate:"2024-02-01",confirmationDate:"2024-08-01",department:{name:"People Operations"},designation:{name:"HR Operations Specialist"},employmentLevel:{name:"Level 3"},location:{name:"Northstar Demo Office"},costCentre:{name:"People Operations"},lineManager:{name:"Tunde Bello (fictional)",designation:"Head of People Operations"},employmentEpisodes:[{startDate:"2024-02-01"}]},
 onboarding:{completionPercent:100,currentStage:"Completed",status:"COMPLETED",sections:sections.map(([key,label])=>({key,label})),sectionProgress:Object.fromEntries(sections.map(([key])=>[key,{completed:true,completedItems:4,totalItems:4,required:true}])),data:Object.fromEntries(sections.map(([key,,values])=>[key,values])),documents:["Sample employment letter","Sample handbook acknowledgement","Sample training certificate","Sample onboarding checklist"].map((originalName,i)=>({id:"sample-doc-"+i,originalName,category:"SAMPLE",mimeType:"application/pdf",createdAt:"2026-09-15",demoOnly:true}))},
 statutory:{registered:sections[8][2],obligations:[{id:"sample-paye",periodYear:2026,periodMonth:9,obligationType:"PAYE",employeeAmount:42000,employerAmount:0,amountRemitted:42000,currency:"NGN",runStatus:"APPROVED",status:"SAMPLE_REMITTED",recordKind:"CURRENT"},{id:"sample-pension",periodYear:2026,periodMonth:9,obligationType:"PENSION",employeeAmount:36000,employerAmount:45000,amountRemitted:81000,currency:"NGN",runStatus:"APPROVED",status:"SAMPLE_REMITTED",recordKind:"CURRENT"}]},
 payment:sections[7][2],payroll:{payslips:approved,latestPayslip:approved[0],previews:[draft],latestCalculation:draft,sampleComponents:[{name:"Basic salary",amount:240000},{name:"Housing allowance",amount:120000},{name:"Transport allowance",amount:60000},{name:"Other allowance",amount:30000}],sampleDeductions:[{name:"Illustrative PAYE",amount:42000},{name:"Illustrative pension",amount:36000}]},
 leaveBalances:[{id:"sample-annual",leaveType:"Annual Leave",leaveYear:2026,openingBalance:21,accrued:0,used:5,adjusted:0,carriedForward:0},{id:"sample-compassionate",leaveType:"Compassionate Leave",leaveYear:2026,openingBalance:5,accrued:0,used:0,adjusted:0,carriedForward:0}],
 leaveApplications:[{id:"sample-leave-1",leaveType:"Annual Leave",startDate:"2026-08-10",endDate:"2026-08-14",days:5,status:"APPROVED"},{id:"sample-leave-2",leaveType:"Annual Leave",startDate:"2026-12-07",endDate:"2026-12-11",days:5,status:"PENDING"}],
 attendance:["2026-10-26","2026-10-27","2026-10-28","2026-10-29","2026-10-30"].map((attendanceDate,i)=>({id:"sample-attendance-"+i,attendanceDate,status:"PRESENT",clockIn:"08:0"+i,clockOut:"17:00"})),
 performance:[{cycle:{id:"sample-cycle",year:2026,quarter:3},kpis:[{id:"sample-kpi-1",title:"Employee support",objective:"Resolve staff enquiries",measurement:"Response SLA",target:"95%",weight:40},{id:"sample-kpi-2",title:"Employee data accuracy",objective:"Maintain quality records",measurement:"Accuracy",target:"98%",weight:35},{id:"sample-kpi-3",title:"Onboarding",objective:"Complete registrations",measurement:"On-time completion",target:"90%",weight:25}],assessment:{status:"FINAL",finalRating:"SATISFACTORY",improvementNotes:"Fictional manager feedback.",selfAssessment:{kpis:[]}}}],
 probation:{status:"CONFIRMED",startDate:"2024-02-01",endDate:"2024-08-01",reviewDate:"2024-07-25",reviewer:"Tunde Bello (fictional)",rating:"SATISFACTORY",outcome:"CONFIRMED"},
 disciplinary:[{id:"sample-case",caseNumber:"NSTAR-SAMPLE-01",category:"Attendance clarification",openedAt:"2025-05-12",closedAt:"2025-05-16",status:"CLOSED",outcome:"Resolved without sanction",note:"Fictional example only."}],
 gratuity:{status:"SAMPLE_ONLY",currency:"NGN",serviceStartDate:"2024-02-01",accruedAmount:150000,policySummary:"Illustrative only. No customer-specific gratuity rule."},
 birthday:{dateOfBirth:"1996-07-15"},birthdays:[],workAnniversaries:[],
 news:[["ANNOUNCEMENT","Welcome to Northstar MY CHRiS","Fictional employee records only."],["MEMO","Sample learning calendar","Illustrative staff development memo."],["POLICY_HR_UPDATE","Sample handbook update","No customer policies included."],["INTERNAL_CAREER","Sample internal vacancy","Fictional People Operations role."],["PROMOTION","Sample colleague recognition","Illustrative promotion notice."],["TRANSFER","Sample transfer notice","Fictional employee movement."]].map(([category,title,body],i)=>({id:"sample-news-"+i,category,title,summary:body,body,isPinned:i===0,publishAt:"2026-10-20"}))
 };
}
function loans(){return [{
 id:"sample-loan",loanNumber:"NSTAR-SAMPLE-LOAN-01",loanAmount:120000,
 monthlyInstallment:20000,totalPaid:60000,balance:60000,
 expectedFinalDeductionMonth:"2027-01",lastRecordedDeductionMonth:"2026-10",
 status:"ACTIVE",currency:"NGN",demoOnly:true,
 repaymentSchedule:[
  {installmentNumber:1,dueDate:"2026-08-31",scheduledAmount:20000,amountPaid:20000,outstandingAfter:100000,status:"PAID"},
  {installmentNumber:2,dueDate:"2026-09-30",scheduledAmount:20000,amountPaid:20000,outstandingAfter:80000,status:"PAID"},
  {installmentNumber:3,dueDate:"2026-10-31",scheduledAmount:20000,amountPaid:20000,outstandingAfter:60000,status:"PAID"},
  {installmentNumber:4,dueDate:"2026-11-30",scheduledAmount:20000,amountPaid:0,outstandingAfter:40000,status:"SCHEDULED"},
  {installmentNumber:5,dueDate:"2026-12-31",scheduledAmount:20000,amountPaid:0,outstandingAfter:20000,status:"SCHEDULED"},
  {installmentNumber:6,dueDate:"2027-01-31",scheduledAmount:20000,amountPaid:0,outstandingAfter:0,status:"SCHEDULED"}
 ]
}]}
module.exports={fixture,loans};
