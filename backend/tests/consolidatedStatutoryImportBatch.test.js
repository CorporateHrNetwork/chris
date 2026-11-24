"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { stageHistoricalImport, listHistoricalImports } = require("../src/services/consolidatedStatutoryImportBatchService");
function historicalBuffer() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Employee Name","Pension Employer","Pension Employee","Pension Number","Pension Provider","Total Pension Contribution","Period"],
    ["Test Pension",1000,800,"PEN001","PFA Test",1800,"9 Months"],
  ]),"STAFF PENSION");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Tax Report"],["Company: ABUJA"],[],
    ["Employee Name","Employee Number","Basic Salary","Housing Allowance","Transport Allowance","Gross Salary","PAYE","Tax Payer Number","Period"],
    ["Test PAYE","EMP01",100000,20000,10000,130000,8000,"TINTEST","9 Months"],
    ["Totals",null,100000,20000,10000,130000,8000,null,"JANUARY 2026"],
    [null,null,100000,20000,10000,130000,8000,null,"FEBRUARY 2026"],
  ]),"STAFF PAYE");
  return XLSX.write(book,{type:"buffer",bookType:"xlsx"});
}
test("staging stores a pending-reconciliation snapshot and audit, without mutating payroll", async ()=>{
  const calls=[],audit=[];
  const db = {
    $queryRawUnsafe:async (sql,...args)=>{ calls.push({sql,args}); return [{id:args[0],sourceHash:args[3],reportYear:args[2],status:"PENDING_RECONCILIATION"}]; },
    organizationAudit:{create:async x=>{audit.push(x.data);}},
  };
  const result=await stageHistoricalImport({organizationId:"ORG01",actorUserId:"HR01",year:2026,
    buffer:historicalBuffer(),originalFilename:"C:\\source.xlsx",prismaClient:db});
  assert.equal(result.importedRows,2);
  assert.equal(result.postedToPayroll,false);
  assert.equal(result.status,"PENDING_RECONCILIATION");
  assert.equal(audit.length,1);
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/ON CONFLICT/);
  assert.match(calls[0].sql,/RETURNING/);
  assert.equal(calls[0].args[1],"ORG01");
  assert.equal(calls[0].args[4],"C:source.xlsx");
  const data=JSON.parse(calls[0].args[5]);
  const diag=JSON.parse(calls[0].args[6]);
  assert.equal(data.length,2);
  assert.equal(diag.sheets.find(x=>x.sheet==="STAFF PAYE").sourceTotals.length,2);
});
test("batch index list is scoped by organization and year", async ()=>{
  const args=[];
  const db={$queryRawUnsafe:async (...a)=>{args.push(a);return [];}};
  await listHistoricalImports({organizationId:"ORG02",year:2027,prismaClient:db});
  assert.equal(args[0][1],"ORG02");
  assert.equal(args[0][2],2027);
  assert.match(args[0][0],/WHERE "organizationId"=\$1 AND "reportYear"=\$2/);
});
