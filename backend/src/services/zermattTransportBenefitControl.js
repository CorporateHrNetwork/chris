const {cents,invalid}=require('./zermattMidmonthDomain');
const HEADERS=['S/No','Location','EmployeeNO','FullName','Position','Department','EmploymentType','Gross Salary','End of the Month','Mid-Month','No Of Extra Day(S)','No Of Ph Day(S)','Bonus','Overtime/Ph Pay','Previous Month Short Payment','Previous Month Overpayment','Net','AccountNO'];
function normalizeInputs(input={}) {
 const days=value=>{const n=Number(value||0);if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*10000))||Math.abs(n*10000-Math.round(n*10000))>0.0001)invalid('Days must be non-negative with at most four decimal places.',400);return n;};
 return {extraDays:days(input.extraDays),phDays:days(input.phDays),bonus:cents(input.bonus||0)/100,overtimePhPay:cents(input.overtimePhPay||0)/100,previousShortPayment:input.previousShortPayment==null||input.previousShortPayment===''?null:cents(input.previousShortPayment)/100,previousOverpayment:input.previousOverpayment==null||input.previousOverpayment===''?null:cents(input.previousOverpayment)/100};
}
function applyInputs(line,input) {
 const benefitInputs=normalizeInputs(input);
 const ledgerPreviousUnpaid=line.ledgerPreviousUnpaid??line.previousUnpaid;
 const ledgerPreviousOverpaid=line.ledgerPreviousOverpaid??line.previousOverpaid;
 const previousUnpaid=benefitInputs.previousShortPayment??ledgerPreviousUnpaid;
 const previousOverpaid=benefitInputs.previousOverpayment??ledgerPreviousOverpaid;
 const available=cents(line.currentEntitlement)+cents(previousUnpaid)+cents(benefitInputs.bonus)+cents(benefitInputs.overtimePhPay);
 if(!Number.isSafeInteger(available))invalid('Benefit total is too large to calculate safely.',400);
 const recovered=Math.min(cents(previousOverpaid),available);
 return {...line,ledgerPreviousUnpaid,ledgerPreviousOverpaid,previousUnpaid,previousOverpaid,benefitInputs,overpaidDeduction:recovered/100,overpaidRemaining:(cents(previousOverpaid)-recovered)/100,netPay:(available-recovered)/100};
}
function buildRegister(lines) {
 return {headers:HEADERS,rows:lines.map((line,index)=>{
  const s=line.snapshot||{},i=normalizeInputs(s.benefitInputs),bank=s.paymentDetails||{};
  return [index+1,s.location||'',s.employeeNumber||'',s.employeeName||'',s.position||'',s.department||'',s.employmentType||'',Number(s.fullMonthlyGross||0),Number(s.allocation?.endMonthGross||0),Number(s.currentEntitlement||0),i.extraDays,i.phDays,i.bonus,i.overtimePhPay,Number(s.previousUnpaid||0),Number(s.previousOverpaid||0),Number(line.netPay||0),String(bank.accountNumber||'')];
 })};
}
function benefitTransition(status,action,roles) {
 const rules={
  HEAD_HR_APPROVE:{from:['DRAFT','REJECTED'],role:'HEAD_HR',to:'APPROVED'},
  RETURN_TO_DRAFT:{from:['AUDIT_REVIEW','GM_APPROVAL','REJECTED'],role:'HEAD_HR',to:'DRAFT'},
  CONFIRM_PAYMENT:{from:['APPROVED'],role:'CHIEF_ACCOUNTANT',to:'PAID'},
 };
 const rule=rules[action];
 if(!rule||!rule.from.includes(status))invalid('This action is unavailable in the external benefit approval workflow.');
 if(!roles.includes(rule.role))invalid('The assigned '+rule.role.replaceAll('_',' ')+' must perform this action.',403);
 return rule.to;
}
module.exports={HEADERS,normalizeInputs,applyInputs,buildRegister,benefitTransition};

