const HEAD = new Set(['HEAD HR','HEAD OF HR','HEAD_HR','HEAD OF HUMAN RESOURCES','HEAD OF HR & ADMIN','HEAD OF HUMAN RESOURCES & ADMINISTRATION']);
const BRANCH = new Set(['HR & ADMIN OFFICER - BRANCH','BRANCH HR & ADMIN OFFICER','HR & ADMIN OFFICER','HR AND ADMIN OFFICER']);
const normalize = value => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const hasRole = (roles, set) => (roles || []).some(r => set.has(normalize(r)));
function dateOnly(value) {
  const s = value instanceof Date ? value.toISOString().slice(0,10) : String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('A valid date (YYYY-MM-DD) is required.');
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== s) throw new Error('Invalid calendar date.');
  return s;
}
function addDays(s, days) { const d = new Date(dateOnly(s) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return dateOnly(d); }
function probationDates(start) {
  const d = new Date(dateOnly(start) + 'T00:00:00Z');
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+3, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth()+1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(),lastDay));
  const endDate = dateOnly(target);
  return {startDate:dateOnly(d),endDate,noticeDate:addDays(endDate,-7)};
}
function lagosDate(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
function access({roles, manager=false, sameBranch=false}) {
  const head = hasRole(roles,HEAD), branch = hasRole(roles,BRANCH) && sameBranch;
  return {canRead:head || branch || manager,canAssess:manager,canVerify:branch,canDecide:head};
}
const OUTCOMES = new Set(['CONFIRM_EMPLOYMENT','TERMINATE_EMPLOYMENT','EXTEND_PROBATION']);
function required(value,label) { const s=String(value||'').trim(); if (!s || s.length>10000) throw new Error(`${label} is required (maximum 10,000 characters).`); return s; }
function assessment(input) {
  if (!OUTCOMES.has(input.recommendation)) throw new Error('Select a valid assessment outcome.');
  return Object.fromEntries(['performance','conduct','attendance','evidence','reason'].map(k=>[k,required(input[k],k)]).concat([['recommendation',input.recommendation]]));
}
function decision(input,review,today) {
  if (!OUTCOMES.has(input.outcome)) throw new Error('Select a valid final outcome.');
  const effectiveDate=dateOnly(input.effectiveDate);
  if (effectiveDate>today || effectiveDate<dateOnly(review.startDate)) throw new Error('Effective date must be within this probation cycle and no later than today.');
  const result={outcome:input.outcome,reason:required(input.reason,'Decision reason'),effectiveDate};
  if (input.outcome==='EXTEND_PROBATION') {
    result.newEndDate=dateOnly(input.newEndDate);
    if (result.newEndDate<=today || result.newEndDate<=dateOnly(review.endDate)) throw new Error('New probation end must be after today and the current end date.');
    result.improvementGoals=required(input.improvementGoals,'Improvement goals');
  }
  return result;
}
module.exports={HEAD,BRANCH,required,hasRole,normalize,dateOnly,addDays,probationDates,lagosDate,access,assessment,decision};
