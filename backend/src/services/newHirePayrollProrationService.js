const RULE='ACTUAL_PAYABLE_WORKDAYS_FROM_EMPLOYMENT_DATE';
function dateOnly(value) {
 if(!value)return null;
 const raw=value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
 const d=new Date(`${raw}T00:00:00.000Z`);
 return /^\d{4}-\d{2}-\d{2}$/.test(raw) && Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===raw?raw:null;
}
function employmentWindow({hireDate,periodStart,periodEnd}) {
 const hire=dateOnly(hireDate),start=dateOnly(periodStart),end=dateOnly(periodEnd);
 if(!start || !end || end<start)throw new Error('INVALID_PAYROLL_EMPLOYMENT_PERIOD');
 const newHire=!!hire && hire>start && hire<=end;
 const futureHire=!!hire && hire>end;
 return {rule:RULE,hireDate:hire,periodStart:start,periodEnd:end,newHire,futureHire,eligibleFrom:hire && hire>start?hire:start,maximumCalendarDays:futureHire?0:Math.floor((new Date(end)-new Date(hire && hire>start?hire:start))/86400000)+1};
}
function resolvePayableDays({hireDate,periodStart,periodEnd,standardDays,attendanceInput}) {
 const window=employmentWindow({hireDate,periodStart,periodEnd});
 const supplied=attendanceInput?.workedDays!==null && attendanceInput?.workedDays!==undefined && attendanceInput?.workedDays!=='';
 const inputDays=supplied?Number(attendanceInput.workedDays):null;
 if(window.futureHire)return {...window,payableDays:0,source:'NOT_EMPLOYED_IN_PERIOD',notes:'Employment takes effect after this payroll period.'};
 if(window.newHire && !supplied) return {...window,requiresVerifiedDays:true,source:'NEW_HIRE_WORKED_DAYS_REQUIRED'};
 if(supplied && (!Number.isFinite(inputDays) || inputDays<0 || (window.newHire && inputDays>window.maximumCalendarDays))) return {...window,invalidDays:true,payableDays:inputDays,source:'INVALID_EMPLOYMENT_PERIOD_WORKED_DAYS'};
 const payableDays=supplied?inputDays:Number(standardDays);
 const reason=window.newHire?`New hire effective ${window.hireDate}; ${payableDays} HR-confirmed payable workdays from ${window.eligibleFrom} to ${window.periodEnd}. Gross basis ÷ ${standardDays} × ${payableDays}.`:'';
 return {...window,payableDays,source:window.newHire?'NEW_HIRE_VERIFIED_WORKED_DAYS':supplied?'ATTENDANCE_PAYROLL_INPUT':'STANDARD_DAYS_DEFAULT',notes:[reason,attendanceInput?.notes].filter(Boolean).join(' ')};
}
module.exports={RULE,dateOnly,employmentWindow,resolvePayableDays};
