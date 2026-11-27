"use strict";

// Read-only payroll snapshot comparison. Employment events and attendance are
// deliberately separate evidence sources; payroll presence is not proof of either.
function comparePayrollWorkforce(previous, current) {
  function index(lines) {
    const map = new Map();
    for (const line of lines) {
      if (!line.employeeId || map.has(line.employeeId)) throw new Error("Missing or duplicate payroll employee ID");
      map.set(line.employeeId, line);
    }
    return map;
  }
  const before = index(previous), after = index(current);
  const dimension = (line, key) => line?.details?.organizationSnapshot?.[key] || "Unknown";
  const gross = line => Number(line?.grossPay ?? 0);
  const rate = (n,d) => d > 0 ? n / d : null;
  const movements = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id), b = after.get(id);
    const oldBranch = a ? dimension(a,"locationName") : null;
    const newBranch = b ? dimension(b,"locationName") : null;
    const classification = !a ? "Hire candidate" : !b ? "Exit/deactivated candidate" :
      oldBranch !== "Unknown" && newBranch !== "Unknown" && oldBranch !== newBranch ? "Transfer candidate" : "Retained on payroll";
    movements.push({ employeeId:id, employeeNumber:(b || a).employeeNumber, employeeName:(b || a).employeeName,
      oldBranch,newBranch,oldDepartment:a ? dimension(a,"departmentName") : null,
      newDepartment:b ? dimension(b,"departmentName") : null,
      classification, previousGross:gross(a),currentGross:gross(b),grossVariance:gross(b)-gross(a) });
  }
  function summarize(label, oldRows, newRows) {
    const oldIds = new Set(oldRows.map(x=>x.employeeId)), newIds = new Set(newRows.map(x=>x.employeeId));
    const additions = newRows.filter(x=>!oldIds.has(x.employeeId)).length;
    const removals = oldRows.filter(x=>!newIds.has(x.employeeId)).length;
    const opening = oldRows.length, closing = newRows.length;
    const previousGross = oldRows.reduce((s,x)=>s+gross(x),0), currentGross = newRows.reduce((s,x)=>s+gross(x),0);
    return {label,opening,closing,additions,removals,averagePaidHeadcount:(opening+closing)/2,
      payrollRemovalRate:rate(removals,(opening+closing)/2),payrollRetentionRate:rate(opening-removals,opening),
      payrollGrowthRate:rate(currentGross-previousGross,previousGross),headcountGrowthRate:rate(closing-opening,opening),
      previousGross,currentGross,grossVariance:currentGross-previousGross,averageCurrentGross:rate(currentGross,closing),
      labourTurnoverRate:null,absenteeismRate:null,
      implications:[removals ? "Reconcile payroll removals against employment events; branch removals may be transfers." : "No payroll removals observed.",
      additions ? "Verify additions against onboarding, reactivation and transfer records." : "No payroll additions observed.",
      currentGross>previousGross ? "Gross payroll increased; review headcount, salary and allowance changes." : "Gross payroll did not increase.",
      "Actual turnover and absenteeism require verified employment events and scheduled attendance evidence."]};
  }
  const summaries=[summarize("Consolidated",previous,current)];
  for (const key of ["locationName","departmentName"]) {
    for (const name of new Set([...previous,...current].map(x=>dimension(x,key)))) {
      summaries.push(summarize(key+": "+name,previous.filter(x=>dimension(x,key)===name),current.filter(x=>dimension(x,key)===name)));
    }
  }
  return {movements,summaries};
}
module.exports={comparePayrollWorkforce};
