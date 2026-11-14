const crypto=require('node:crypto');
const {splitSalary,dateOnly}=require('./zermattSalarySplit');
const {nextMonth}=require('./zermattMidmonthDomain');
// Called inside the employee-creation transaction shared by Add Employee and bulk onboarding.
// Only the explicitly entered opening full gross is mapped; reduced payroll amounts are never inferred.
async function createOpeningBenefitBasis(tx,{organizationId,actorUserId,employee,salary}) {
 if(salary.currency!=='NGN'||!employee.hireDate||!employee.employmentType)return null;
 const salaryDate=dateOnly(salary.effectiveFrom);
 const month=Number(salaryDate.slice(8))>15?nextMonth(salaryDate.slice(0,7)):salaryDate.slice(0,7);
 const effectiveFrom=month+'-01',hireDate=dateOnly(employee.hireDate);
 const allocation=splitSalary({fullMonthlyGross:salary.amount,employmentType:employee.employmentType,hireDate,periodMonth:month});
 if(salary.tspPercentage!=null)allocation.tspPercentageOverride=salary.tspPercentage;
 const id=crypto.randomUUID();
 await tx.$executeRawUnsafe(`INSERT INTO public.zermatt_salary_split_preparations
  (id,"organizationId","employeeId","fullMonthlyGross",currency,"effectiveFrom",reason,"employmentTypeSnapshot","hireDateSnapshot","allocationPreview","createdByUserId")
  VALUES($1,$2,$3,$4,'NGN',$5::date,$6,$7,$8::date,$9::jsonb,$10)`,id,organizationId,employee.id,salary.amount,effectiveFrom,'Opening full gross automatically mapped from employee onboarding',employee.employmentType,hireDate,JSON.stringify(allocation),actorUserId||null);
 await tx.organizationAudit.create({data:{organizationId,actorUserId:actorUserId||null,entityType:'SalarySplitPreparation',entityId:id,action:'ONBOARDING_BENEFIT_BASIS_CREATED',newValue:{employeeId:employee.id,fullMonthlyGross:salary.amount,effectiveFrom,salaryEffectiveFrom:salaryDate,allocation,source:'EMPLOYEE_OPENING_SALARY',payrollWrites:false},reason:'Automatically prepared Transport Support benefit basis from the explicitly entered opening full gross. No benefit payment or approval created.'}});
 return {id,effectiveFrom,allocation};
}
module.exports={createOpeningBenefitBasis};
