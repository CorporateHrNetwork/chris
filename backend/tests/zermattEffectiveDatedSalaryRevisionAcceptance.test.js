const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("Approved payroll rates cannot be overwritten and have a separate future-effective revision path",()=>{
 const service=read("backend/src/services/zermattSalaryRateControlService.js");
 assert.ok(service.includes("SALARY_RATE_APPROVED_PAYROLL_HISTORY_LOCKED"));
 assert.ok(service.includes("async function createEffectiveDatedSalaryRevision"));
 assert.ok(service.includes("SALARY_REVISION_APPROVED_MAIN_PAYROLL_LOCKED"));
 assert.ok(service.includes("SALARY_REVISION_PROTECTED_TSP_PERIOD"));
 assert.ok(service.includes("SALARY_REVISION_OVERLAPPING_RATE"));
 assert.ok(service.includes("SALARY_REVISION_FIRST_OF_MONTH_REQUIRED"));
 assert.ok(service.includes("salary rate must start") === false);
 assert.ok(service.includes('"effectiveTo"=($3::date - INTERVAL \'1 day\')::date'));
 assert.ok(service.includes('INSERT INTO public.payroll_salary_rates'));
 assert.ok(service.includes('"fullMonthlyGross"'));
 assert.ok(service.includes("allocation.endMonthGross"));
 assert.ok(service.includes("allocation.normalMidMonth"));
 assert.ok(service.includes("EFFECTIVE_DATED_SALARY_REVISION_CREATED"));
 assert.ok(service.includes("TSP_FUTURE_SALARY_BASIS_CREATED"));
 assert.ok(service.includes("markDraftRunsRecalculationRequired"));
});
test("Only assigned-branch HR may create a future-effective rate; payroll and TSP submission remain untouched",()=>{
 const routes=read("backend/src/routes/zermattHrPayrollInputRoutes.js");
 assert.ok(routes.includes('"/onboarding/salary-revision"'));
 assert.ok(routes.includes("requireEmployeeFinancialInputEditor"));
 assert.ok(routes.includes("assertSalaryRateAccess({req,rateId})"));
 const route=routes.slice(routes.indexOf('"/onboarding/salary-revision"'),routes.indexOf('router.patch(\n  "/payroll/salary-rates/:id"'));
 assert.ok(!route.includes("approvePayroll"));
 assert.ok(!route.includes("markPaid"));
});
test("Onboarding offers an explicit future-month revision with preview and clear confirmation",()=>{
 const ui=read("src/components/employees/OnboardingSalaryCorrection.jsx");
 assert.ok(ui.includes("Create new effective-dated salary allocation"));
 assert.ok(ui.includes('type="month" aria-label="New effective salary month"'));
 assert.ok(ui.includes('apiRequest("/api/onboarding/salary-revision"'));
 assert.ok(ui.includes("revisionMode ? newEffectiveFrom : selected.effectiveFrom"));
 assert.ok(ui.includes("Historical approved payroll and TSP runs remain unchanged"));
 assert.ok(ui.includes("Create effective-dated salary allocation"));
});

test("Approved November increase preserves paid midmonth and carries shortfall into December",()=>{
 const {splitSalary}=require("../src/services/zermattSalarySplit");
 const inputs={employmentType:"Full-Time",hireDate:"2025-01-01",periodMonth:"2026-11"};
 const old=splitSalary({...inputs,fullMonthlyGross:150000});
 const revised=splitSalary({...inputs,fullMonthlyGross:200000});
 assert.equal(old.midMonthPayable,37500);
 assert.equal(revised.endMonthGross,150000);
 assert.equal(revised.midMonthPayable-old.midMonthPayable,12500);
 assert.equal(revised.midMonthPayable+12500,62500);
 const service=read("backend/src/services/zermattSalaryRateControlService.js");
 assert.ok(service.includes("SALARY_REVISION_EXISTING_SHORTFALL"));
 assert.ok(service.includes("SALARY_REVISION_NEXT_TSP_EXISTS"));
 assert.ok(service.includes("INSERT INTO public.zermatt_midmonth_balances"));
});
