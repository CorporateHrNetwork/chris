const {cents,invalid}=require('./zermattMidmonthDomain');
const {dateOnly}=require('./zermattSalarySplit');
const HEADERS=['S/No','Location','EmployeeNO','FullName','Position','Department','EmploymentType','Gross Salary','End of the Month','Mid-Month','No Of Extra Day(S)','No Of Ph Day(S)','Bonus','Overtime Pay','Public Holiday Pay','Previous Month Short Payment','Previous Month Overpayment','Net','AccountNO','Remark/Notes','Hire / Exit in Period'];
function normalizeInputs(input={}) {
 const days=value=>{const n=Number(value||0);if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*10000))||Math.abs(n*10000-Math.round(n*10000))>0.0001)invalid('Days must be non-negative with at most four decimal places.',400);return n;};
 return {...(input.lastPayableDate?{lastPayableDate:dateOnly(input.lastPayableDate)}:{}),...(input.calculateFromDays===true?{calculateFromDays:true}:{}),extraDays:days(input.extraDays),phDays:days(input.phDays),bonus:cents(input.bonus||0)/100,overtimePhPay:cents(input.overtimePhPay||0)/100,previousShortPayment:input.previousShortPayment==null||input.previousShortPayment===''?null:cents(input.previousShortPayment)/100,previousOverpayment:input.previousOverpayment==null||input.previousOverpayment===''?null:cents(input.previousOverpayment)/100};
}
function applyLastPayableDate(line,value,periodMonth) {
 const cutoff=value?dateOnly(value):null;
 if(cutoff&&!cutoff.startsWith(periodMonth+'-'))invalid('Last payable date must be in the selected benefit month.',400);
 const base=line.cutoffBase||{allocation:line.allocation,currentEntitlement:line.currentEntitlement,periodMovement:line.periodMovement};
 if(!cutoff)return {...line,...base,cutoffBase:undefined};
 if(!base.allocation)invalid('A salary basis is required for TSP proration.',400);
 const last=periodMonth+'-15';
 const start=line.hireDate>periodMonth+'-01'?line.hireDate:periodMonth+'-01';
 const cutoffDays=start>last||cutoff<start?0:Math.min(15,Number(cutoff.slice(8)))-Number(start.slice(8))+1;
 const eligibleDays=Math.min(base.allocation.eligibleDays,cutoffDays);
 const currentEntitlement=Math.round(cents(base.allocation.normalMidMonth)*eligibleDays/15)/100;
 return {...line,cutoffBase:base,currentEntitlement,
  allocation:{...base.allocation,eligibleDays,midMonthPayable:currentEntitlement},
  periodMovement:[base.periodMovement,'TSP last payable day '+cutoff+' (inclusive)'].filter(Boolean).join(' · ')};
}
function applyInputs(line,input) {
 const benefitInputs=normalizeInputs(input);
 let overtimePay=null,publicHolidayPay=null;
 if(benefitInputs.calculateFromDays){
  const gross=Number(line.allocation?.endMonthGross||0);
  if((benefitInputs.extraDays||benefitInputs.phDays)&&!(gross>0))invalid('An End of the Month gross salary is required to calculate worked days.',400);
  overtimePay=Math.round(gross/26*benefitInputs.extraDays*150)/100;
  publicHolidayPay=Math.round(gross/26*benefitInputs.phDays*200)/100;
  benefitInputs.overtimePhPay=(cents(overtimePay)+cents(publicHolidayPay))/100;
 }
 const ledgerPreviousUnpaid=line.ledgerPreviousUnpaid??line.previousUnpaid;
 const ledgerPreviousOverpaid=line.ledgerPreviousOverpaid??line.previousOverpaid;
 const previousUnpaid=benefitInputs.previousShortPayment??ledgerPreviousUnpaid;
 const previousOverpaid=benefitInputs.previousOverpayment??ledgerPreviousOverpaid;
 const available=cents(line.currentEntitlement)+cents(previousUnpaid)+cents(benefitInputs.bonus)+cents(benefitInputs.overtimePhPay);
 if(!Number.isSafeInteger(available))invalid('Benefit total is too large to calculate safely.',400);
 const recovered=Math.min(cents(previousOverpaid),available);
 return {...line,overtimePay,publicHolidayPay,ledgerPreviousUnpaid,ledgerPreviousOverpaid,previousUnpaid,previousOverpaid,benefitInputs,overpaidDeduction:recovered/100,overpaidRemaining:(cents(previousOverpaid)-recovered)/100,netPay:(available-recovered)/100};
}
function bankDetailIssues(details) {
 const bank=details||{};
 const accountNumber=String(bank.accountNumber||'').trim();
 return [
  !String(bank.bankName||'').trim()&&'Bank name missing',
  !String(bank.accountName||'').trim()&&'Account name missing',
  !accountNumber?'Account number missing':!/^\d{10}$/.test(accountNumber)&&'Account number must contain exactly 10 digits',
 ].filter(Boolean);
}
function requiresBankDetails(details) {
 return bankDetailIssues(details).length>0;
}
function withImpactNote(snapshot,note) {
 const impactNotes=[...new Set([...(snapshot.impactNotes||[]),String(note).trim()])];
 return {...snapshot,impactNotes};
}
function applyPeriodProration(line,employee,salary,periodMonth) {
 const hire=dateOnly(employee.hireDate);
 const exit=employee.exitDate?dateOnly(employee.exitDate):null;
 const first=periodMonth+'-01',last=periodMonth+'-15';
 const movements=[];
 if(hire.startsWith(periodMonth+'-'))movements.push('Hired '+hire);
 if(exit?.startsWith(periodMonth+'-'))movements.push('Exited '+exit+' (last payable day, inclusive)');
 line.periodMovement=movements.join(' · ');
 const allocation=line.allocation;
 if(!allocation)return;
 const active=['ACTIVE','PROBATION','LEAVE','SUSPENDED'].includes(employee.status);
 const eligible=active||Boolean(exit&&exit>=first);
 const days=eligible&&(!exit||exit>=first)
  ? Math.max(0,allocation.eligibleDays-Math.max(0,exit&&exit<last?15-Number(exit.slice(8,10)):0))
  : 0;
 const rate=allocation.midMonthPercentage>0&&salary?.tspPercentage!=null
  ? Number(salary.tspPercentage):allocation.midMonthPercentage;
 const normalMidMonth=Math.round(cents(allocation.fullMonthlyGross)*rate/100);
 line.currentEntitlement=Math.round(normalMidMonth*days/15)/100;
 line.allocation={...allocation,midMonthPercentage:rate,normalMidMonth:normalMidMonth/100,eligibleDays:days,midMonthPayable:line.currentEntitlement};
}
function buildRegister(lines) {
 return {headers:HEADERS,rows:lines.map((line,index)=>{
  const s=line.snapshot||{},i=normalizeInputs(s.benefitInputs),bank=s.paymentDetails||{};
  const notes=[s.eligibilityNote,s.remark,s.periodMovement,...(s.impactNotes||[])].filter(Boolean);
  const days=s.allocation?.eligibleDays;
  if(days<15&&(days>0||i.lastPayableDate))notes.push(`Mid-Month prorated: ${days}/15 eligible days`);
  if(!i.calculateFromDays&&i.overtimePhPay>0)notes.push(`Previously recorded combined overtime/PH pay: NGN ${i.overtimePhPay.toFixed(2)}`);
  return [index+1,s.location||'',s.employeeNumber||'',s.employeeName||'',s.position||'',s.department||'',s.employmentType||'',Number(s.fullMonthlyGross||0),Number(s.allocation?.endMonthGross||0),Number(s.currentEntitlement||0),i.extraDays,i.phDays,i.bonus,s.overtimePay??'',s.publicHolidayPay??'',Number(s.previousUnpaid||0),Number(s.previousOverpaid||0),Number(line.netPay||0),String(bank.accountNumber||''),notes.join(' · '),s.periodMovement||''];
 })};
}
function benefitTransition(status,action,roles) {
 const rules={
  HEAD_HR_APPROVE:{from:['DRAFT','REJECTED'],role:'HEAD_HR',to:'APPROVED'},
  REOPEN_FOR_CORRECTION:{from:['APPROVED'],role:'HEAD_HR',to:'DRAFT'},
  RETURN_TO_DRAFT:{from:['AUDIT_REVIEW','GM_APPROVAL','REJECTED'],role:'HEAD_HR',to:'DRAFT'},
  CONFIRM_PAYMENT:{from:['APPROVED'],role:'CHIEF_ACCOUNTANT',to:'PAID'},
 };
 const rule=rules[action];
 if(!rule||!rule.from.includes(status))invalid('This action is unavailable in the external benefit approval workflow.');
 if(!roles.includes(rule.role))invalid('The assigned '+rule.role.replaceAll('_',' ')+' must perform this action.',403);
 return rule.to;
}
module.exports={HEADERS,applyLastPayableDate,applyPeriodProration,withImpactNote,bankDetailIssues,requiresBankDetails,normalizeInputs,applyInputs,buildRegister,benefitTransition};

