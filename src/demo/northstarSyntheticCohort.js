// INDEPENDENT NORTHSTAR FICTIONAL COHORT — generated locally for a read-only sales walkthrough.
// Never query or import customer/production employee lists, pay, policies or credentials.
const teams=["People Operations","Finance & Administration","Sales Operations","Customer Experience","Technology","Logistics","Facilities","Business Development"];
const sites=["Northstar Central","Northstar East","Northstar West","Northstar South"];
const roleTitles=["Team Lead","Operations Analyst","Coordinator","Associate","Specialist","Officer"];
const primary=["Ada","Bola","Chidi","Dara","Efe","Femi","Gina","Hassan","Ife","Jide","Kemi","Lami"];
const family=["Adebayo","Bello","Chukwu","Danjuma","Eze","Farouk","Garba","Hassan","Ibrahim","James","Kalu","Lawal"];
const iso=(year,month,day)=>[year,String(month).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
const makeEmployee=i=>{
 const n=i+1;
 const department=teams[i%teams.length],location=sites[Math.floor(i/12)%sites.length];
 const monthlyGross=150000+(i%8)*25000;
 const deduction=Math.round(monthlyGross*.12);
 return {
  id:`NS-DEMO-EMP-${String(n).padStart(3,"0")}`,employeeNumber:`NS-FICTION-${String(n).padStart(3,"0")}`,
  displayName:`${primary[i%primary.length]} ${family[Math.floor(i/primary.length)%family.length]} (fictional ${n})`,
  department,location,designation:roleTitles[i%roleTitles.length],
  status:i===47?"ON_LEAVE":"ACTIVE",hireDate:iso(2023+Math.floor(i/16),1+i%12,1+(i%20)),
  managerId:i%6===0?null:`NS-DEMO-EMP-${String(Math.floor(i/6)*6+1).padStart(3,"0")}`,
  grossPay:monthlyGross,deduction,netPay:monthlyGross-deduction,currency:"NGN",demoOnly:true
 };
};
export const northstarEmployees=Object.freeze(Array.from({length:48},(_,i)=>Object.freeze(makeEmployee(i))));
export const northstarDepartments=Object.freeze(teams.map((name,i)=>({id:`NS-DEPT-${i+1}`,name})));
export const northstarLocations=Object.freeze(sites.map((name,i)=>({id:`NS-LOC-${i+1}`,name})));
export const northstarAttendance=Object.freeze(northstarEmployees.flatMap((e,i)=>[3,4,5,6,7].map((day)=>({
 id:`NS-ATT-${e.id}-${day}`,employeeId:e.id,date:iso(2026,10,day),
 status:i===47?"LEAVE":day===7&&i%9===0?"ABSENT":"PRESENT",demoOnly:true
}))));
export const northstarLeave=Object.freeze(northstarEmployees.map((e,i)=>{
 const entitlement=20+i%5,used=i%8;
 return {id:`NS-LEAVE-${e.id}`,employeeId:e.id,year:2026,leaveType:"Annual Leave",
 entitlementDays:entitlement,usedDays:used,availableDays:entitlement-used,
 latestStatus:i===47?"APPROVED":"HISTORY_ONLY",demoOnly:true};
}));
export const northstarPayroll=Object.freeze(northstarEmployees.flatMap(e=>[9,10].map(month=>({
 id:`NS-PAY-${e.id}-${month}`,employeeId:e.id,period:iso(2026,month,1).slice(0,7),
 gross:e.grossPay,deductions:e.deduction,net:e.netPay,
 status:month===9?"APPROVED_SAMPLE":"DRAFT_SAMPLE",demoOnly:true
}))));
export const northstarLoans=Object.freeze(northstarEmployees.filter((_,i)=>i%8===0).map(e=>{
 const principal=120000,installment=20000,paid=60000;
 return {id:`NS-LOAN-${e.id}`,employeeId:e.id,principal,installment,totalPaid:paid,
 balance:principal-paid,periods:[
 {month:"2026-08",paid:20000},{month:"2026-09",paid:20000},{month:"2026-10",paid:20000},
 {month:"2026-11",paid:0},{month:"2026-12",paid:0},{month:"2027-01",paid:0}
 ],demoOnly:true};
}));
export const northstarBenefits=Object.freeze(northstarEmployees.map((e,i)=>({
 id:`NS-BEN-${e.id}`,employeeId:e.id,program:i%3===0?"Health plan":i%3===1?"Learning allowance":"Retirement savings",
 status:"ILLUSTRATIVE_ENROLMENT",demoOnly:true
})));
export const northstarPerformance=Object.freeze(northstarEmployees.map((e,i)=>({
 id:`NS-PE-${e.id}`,employeeId:e.id,period:"2026-Q3",rating:Number((3+(i%5)*.3).toFixed(1)),
 status:"SAMPLE_ACKNOWLEDGED",nextCycle:"2026-Q4",demoOnly:true
})));
export const northstarRecruitment=Object.freeze(Array.from({length:12},(_,i)=>({
 id:`NS-REC-${String(i+1).padStart(3,"0")}`,candidate:`Sample Candidate ${i+1}`,
 department:teams[i%teams.length],stage:["SCREENING","INTERVIEW","OFFER","TALENT_POOL"][i%4],
 vacancy:`Fictional ${roleTitles[i%roleTitles.length]}`,demoOnly:true
})));
export const northstarCohort={
 employees:northstarEmployees,departments:northstarDepartments,locations:northstarLocations,
 attendance:northstarAttendance,leave:northstarLeave,payroll:northstarPayroll,
 loans:northstarLoans,benefits:northstarBenefits,performance:northstarPerformance,
 recruitment:northstarRecruitment
};
export function northstarCohortOverview(){
 return {
 employeeCount:northstarEmployees.length,departmentCount:teams.length,locationCount:sites.length,
 attendanceRecords:northstarAttendance.length,leaveProfiles:northstarLeave.length,
 payrollLines:northstarPayroll.length,loanProfiles:northstarLoans.length,
 benefitEnrolments:northstarBenefits.length,performanceReviews:northstarPerformance.length,
 recruitmentCandidates:northstarRecruitment.length
 };
}
