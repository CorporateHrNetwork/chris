const RULE='ZERMATT_FULL_TIME_SIX_DAY_WEEK_FROM_EMPLOYMENT_DATE';
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
function resolvePayableDays({hireDate,periodStart,periodEnd,standardDays,attendanceInput,employmentType}) {
 const window=employmentWindow({hireDate,periodStart,periodEnd});
 const supplied=attendanceInput?.workedDays!==null && attendanceInput?.workedDays!==undefined && attendanceInput?.workedDays!=='';
 const inputDays=supplied?Number(attendanceInput.workedDays):null;
 if(window.futureHire)return {...window,payableDays:0,source:'NOT_EMPLOYED_IN_PERIOD',notes:'Employment takes effect after this payroll period.'};
 const fullTime=String(employmentType || '').toLowerCase().replace(/[\s_-]+/g,'')==='fulltime';
 const automatic=window.newHire && fullTime && !supplied;
 const weeklyOffDays=automatic?Math.floor(window.maximumCalendarDays/7):null;
 const automaticPayableDays=automatic?Math.min(Number(standardDays),window.maximumCalendarDays-weeklyOffDays):null;
 if(supplied && (!Number.isFinite(inputDays) || inputDays<0 || (window.newHire && inputDays>window.maximumCalendarDays))) return {...window,invalidDays:true,payableDays:inputDays,source:'INVALID_EMPLOYMENT_PERIOD_WORKED_DAYS'};
 const payableDays=supplied?inputDays:automatic?automaticPayableDays:Number(standardDays);
 const reason=automatic?`Automatic full-time new-hire proration from ${window.hireDate} to ${window.periodEnd}: ${window.maximumCalendarDays} calendar days less ${weeklyOffDays} weekly off days (one per complete seven days), capped at ${standardDays} normal days = ${payableDays} payable days. Gross basis ÷ ${standardDays} × ${payableDays}.`:window.newHire && supplied?`New hire effective ${window.hireDate}; ${payableDays} HR-confirmed payable workdays from ${window.eligibleFrom} to ${window.periodEnd}. Gross basis ÷ ${standardDays} × ${payableDays}.`:'';
 return {...window,automatic,weeklyOffDays,payableDays,source:automatic?'NEW_HIRE_AUTOMATIC_SIX_DAY_WEEK':window.newHire && supplied?'NEW_HIRE_VERIFIED_WORKED_DAYS':supplied?'ATTENDANCE_PAYROLL_INPUT':'STANDARD_DAYS_DEFAULT',notes:[reason,attendanceInput?.notes].filter(Boolean).join(' ')};
}
module.exports={RULE,dateOnly,employmentWindow,resolvePayableDays};
