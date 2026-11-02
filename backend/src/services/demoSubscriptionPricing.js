'use strict';
// Fictional demo tenant only. No commercial pricing changes to real customers.
const PLAN_IDS = ['basic','standard','premium'];
const PLANS = Object.freeze({
 basic: {label:'Basic', licenceMonthly:1500, essMonthly:1000, onboardingMonthly:800, supportMonthly:800, tier:1, profile:'Core employee administration, leave, payroll and statutory compliance.'},
 standard: {label:'Standard', licenceMonthly:1700, essMonthly:1000, onboardingMonthly:900, supportMonthly:900, tier:2, profile:'Integrated people operations, recruitment, attendance, benefits and approval workflows.'},
 premium: {label:'Premium', licenceMonthly:1900, essMonthly:1000, onboardingMonthly:1000, supportMonthly:1000, tier:3, profile:'Full HR lifecycle, performance, learning and advanced people analytics.'}
});
const HRIS = Object.freeze({
 dashboard:1,support_requests:1,employees:1,recruitment:2,time_attendance:2,leave:1,payroll:1,
 compensation_rewards:2,benefits:2,statutories:1,performance:3,training_development:3,assets:2,
 documents:1,reports_analytics:1,organization:1,workflows_approvals:2,employment_types:1,settings:1,billing_subscription:1
});
const ESS = Object.freeze({
 overview:1,my_profile:1,onboarding:1,statutory:1,payment_payroll:1,running_loans:2,
 payslips:1,leave_attendance:2,performance_evaluation:3,probation_assessments:2,
 disciplinary_cases:2,gratuity:3,birthdays_anniversaries:2,internal_communications:2,documents:1
});
const HRIS_LABELS = Object.freeze({
 dashboard:'Dashboard',support_requests:'My Support Requests',employees:'Employees',recruitment:'Recruitment',
 time_attendance:'Time & Attendance',leave:'Leave',payroll:'Payroll',compensation_rewards:'Compensation & Rewards',
 benefits:'Benefits',statutories:'Statutories',performance:'Performance',training_development:'Training & Development',
 assets:'Assets',documents:'Documents',reports_analytics:'Reports & Analytics',organization:'Organization',
 workflows_approvals:'Workflows & Approvals',employment_types:'Employment Types',settings:'Settings',
 billing_subscription:'Billing & Subscription'
});
const ESS_LABELS = Object.freeze({
 overview:'Overview',my_profile:'My Profile',onboarding:'Onboarding',statutory:'Statutory',
 payment_payroll:'Payment & Payroll',running_loans:'Running Loans',payslips:'Payslips',
 leave_attendance:'Leave & Attendance',performance_evaluation:'Performance Evaluation',
 probation_assessments:'Probation Assessments',disciplinary_cases:'My Disciplinary Cases',
 gratuity:'Gratuity',birthdays_anniversaries:'Birthday & Anniversaries',
 internal_communications:'Internal Communications',documents:'Documents'
});
const REPORTING_SCOPE=Object.freeze({basic:'Essential payroll, statutory and employee reports',standard:'Extended operational and management reports',premium:'Advanced analytics, performance and workforce insights'});
const MODULE_CATALOGUE=Object.freeze({hris:HRIS_LABELS,ess:ESS_LABELS,reportingScope:REPORTING_SCOPE});
function getEntitlements(planId,includeEss=true){
 const plan=PLANS[planId]; if(!plan)throw new RangeError('Unknown plan');
 const allowed=map=>Object.keys(map).filter(k=>map[k]<=plan.tier);
 return {hris:allowed(HRIS),ess:includeEss?allowed(ESS):[]};
}
function calculateQuote({planId,employeeCount,renewalEmployeeCount=employeeCount,includeEss=true,vatBasisPoints=750}){
 const p=PLANS[planId]; if(!p)throw new RangeError('Unknown plan');
 if(!Number.isSafeInteger(employeeCount)||employeeCount<1||employeeCount>100000)throw new RangeError('Invalid employee seats');
 if(!Number.isSafeInteger(renewalEmployeeCount)||renewalEmployeeCount<1||renewalEmployeeCount>100000)throw new RangeError('Invalid renewal employee seats');
 if(!Number.isSafeInteger(vatBasisPoints)||vatBasisPoints<0||vatBasisPoints>10000)throw new RangeError('Invalid VAT rate');
 const annual=(rate)=>rate*employeeCount*12;
 const lineItems={licence:annual(p.licenceMonthly),ess:includeEss?annual(p.essMonthly):0,
  onboarding:annual(p.onboardingMonthly),support:annual(p.supportMonthly)};
 const subtotal=Object.values(lineItems).reduce((a,b)=>a+b,0);
 const vat=Math.round(subtotal*vatBasisPoints/10000);
 // Recalculate at the then-current catalogue rates and actual renewal-year seat count.
 // This preview uses the catalogue active NOW; future rates are not forecast or guaranteed.
 const renewalLineItems={licence:p.licenceMonthly*renewalEmployeeCount*12,
  ess:includeEss?p.essMonthly*renewalEmployeeCount*12:0,onboarding:0,
  support:p.supportMonthly*renewalEmployeeCount*12};
 const renewalSubtotal=Object.values(renewalLineItems).reduce((a,b)=>a+b,0);
 const renewalVat=Math.round(renewalSubtotal*vatBasisPoints/10000);
 if(![subtotal,vat,renewalSubtotal,renewalVat,subtotal+vat].every(Number.isSafeInteger))throw new RangeError('Amount exceeds safe range');
 return {
  quote:{currency:'NGN',planId,employeeCount,includeEss,terms:{
   licence:'12-month subscription',ess:'optional 12-month ESS',
   onboarding:'per employee per month for the first 12 months only; not included in renewals',
   support:'annual support priced per employee per month (12 monthly equivalents)',
   vat:'7.5% illustrative, subject to invoice review',
   status:'NON_BINDING_DEMO_PROPOSAL'
  },lineItems,subtotal,vatBasisPoints,vat,total:subtotal+vat,entitlements:getEntitlements(planId,includeEss)},
  renewal:{currency:'NGN',planId,employeeCount:renewalEmployeeCount,includeEss,
   quoteType:'RENEWAL_ESTIMATE_AT_CURRENT_CATALOGUE_RATES',pricingBasis:'CURRENT_APPROVED_RATES_AT_ACTUAL_RENEWAL_DATE',
   pricingNote:'Illustration at currently published demo rates only. Actual renewal is recalculated using the approved catalogue effective on the renewal date and billable seats at that date; no onboarding charge.',
   lineItems:renewalLineItems,subtotal:renewalSubtotal,vat:renewalVat,total:renewalSubtotal+renewalVat}
 };
}
module.exports={PLANS,PLAN_IDS,HRIS,ESS,MODULE_CATALOGUE,getEntitlements,calculateQuote};
