const {splitSalary,dateOnly}=require('./zermattSalarySplit');
function invalid(message,statusCode=409) { const e=new Error(message);e.statusCode=statusCode;e.code='MIDMONTH_CONTROL';throw e; }
function month(value) { const s=String(value||'');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(s))invalid('Enter payroll month as YYYY-MM.',400);return s; }
function nextMonth(value) { const [y,m]=month(value).split('-').map(Number);return `${y+(m===12?1:0)}-${String(m===12?1:m+1).padStart(2,'0')}`; }
function cents(value) { const n=Number(value);if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*100))||Math.abs(n*100-Math.round(n*100))>0.0001)invalid('Enter a non-negative amount with at most two decimal places.',400);return Math.round(n*100); }
function buildLine({employee,salary,periodMonth,unpaid=0,overpaid=0}) {
  const allocation=salary ? splitSalary({fullMonthlyGross:salary.fullMonthlyGross,employmentType:employee.employmentType,hireDate:dateOnly(employee.hireDate),periodMonth:month(periodMonth)}) : null;
  const active=['ACTIVE','PROBATION','LEAVE','SUSPENDED'].includes(employee.status);
  const current=active&&allocation?cents(allocation.midMonthPayable):0;
  const u=cents(unpaid),o=cents(overpaid),recovered=Math.min(o,current+u);
  return {employeeId:employee.id,employeeNumber:employee.employeeNumber,employeeName:employee.employeeName||'',
    fullMonthlyGross:allocation?.fullMonthlyGross||0,employmentType:employee.employmentType,hireDate:dateOnly(employee.hireDate),
    allocation,currentEntitlement:current/100,previousUnpaid:u/100,previousOverpaid:o/100,
    overpaidDeduction:recovered/100,overpaidRemaining:(o-recovered)/100,netPay:(current+u-recovered)/100,
    loanRecovery:0,salaryAdvanceRecovery:0,statutoryDeductions:0,payrollElement:'MID_MONTH_TRANSPORT_SUPPORT'};
}
function settleLine(line,actualPaid) {
  const expected=cents(line.netPay),actual=cents(actualPaid);
  return {actualPaid:actual/100,newUnpaid:Math.max(0,expected-actual)/100,newOverpaid:Math.max(0,actual-expected)/100};
}
const transitions={
  SUBMIT:{from:['DRAFT','REJECTED'],responsibility:'HEAD_HR',to:'AUDIT_REVIEW'},
  AUDIT_APPROVE:{from:['AUDIT_REVIEW'],responsibility:'PAYROLL_AUDITOR',to:'GM_APPROVAL'},
  AUDIT_REJECT:{from:['AUDIT_REVIEW'],responsibility:'PAYROLL_AUDITOR',to:'REJECTED'},
  GM_APPROVE:{from:['GM_APPROVAL'],responsibility:'GENERAL_MANAGER',to:'APPROVED'},
  GM_REJECT:{from:['GM_APPROVAL'],responsibility:'GENERAL_MANAGER',to:'REJECTED'},
  CONFIRM_PAYMENT:{from:['APPROVED'],responsibility:'CHIEF_ACCOUNTANT',to:'PAID'},
};
function transition(status,action,responsibilities) {
  const t=transitions[action];if(!t||!t.from.includes(status))invalid('This action is not available at the current approval stage.');
  if(!responsibilities.includes(t.responsibility))invalid('The current regular-payroll assignee must perform this action.',403);
  return t.to;
}
module.exports={invalid,month,nextMonth,cents,buildLine,settleLine,transition,transitions};
