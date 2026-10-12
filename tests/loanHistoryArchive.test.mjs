import assert from "node:assert/strict";
import test from "node:test";
import { employeeLifetimeLoanHistory, selectLoanHistory } from "../src/utils/loanHistoryArchive.js";
const loans=[
 {id:"old",employeeNumber:"ZLL001",loanNumber:"L-1",status:"COMPLETED",principalAmount:600000,disbursedDate:"2026-01-01"},
 {id:"new",employeeNumber:"ZLL001",loanNumber:"L-2",status:"ACTIVE",principalAmount:200000,disbursedDate:"2026-08-01"},
 {id:"other",employeeNumber:"ZLL002",loanNumber:"L-3",status:"PAUSED"}
];
test("completed records remain accessible without replacing repeat loans",()=>{
 assert.equal(selectLoanHistory(loans,"COMPLETED").length,1);
 assert.equal(employeeLifetimeLoanHistory(loans,"zll001").length,2);
 assert.deepEqual(employeeLifetimeLoanHistory(loans,"ZLL001").map(x=>x.loanNumber),["L-2","L-1"]);
});
test("active filter covers paused and active, never completed",()=>{
 assert.deepEqual(selectLoanHistory(loans,"ACTIVE").map(x=>x.id),["new","other"]);
});
test("no query does not disclose any record beyond supplied tenant-scoped results",()=>{
 assert.deepEqual(selectLoanHistory([], "ALL"),[]);
 assert.deepEqual(employeeLifetimeLoanHistory(loans,""),[]);
});
