import test from "node:test";
import assert from "node:assert/strict";
import { deriveLoanRepaymentTerms } from "../src/utils/loanRepaymentTerm.js";

test("repayment months -> monthly instalment with kobo-accurate final recovery", () => {
  const result = deriveLoanRepaymentTerms(500000, "MONTHS", "", "12");
  assert.deepEqual(result, {
    installmentAmount: "41666.67",
    installmentCount: 12,
    finalInstallment: 41666.63,
  });
});

test("monthly instalment -> repayment months; final month is not over-deducted", () => {
  const result = deriveLoanRepaymentTerms(500000, "AMOUNT", "50000", "");
  assert.equal(result.installmentAmount, "50000.00");
  assert.equal(result.installmentCount, 10);
  assert.equal(result.finalInstallment, 50000);
});

test("monthly instalment handles partial final recovery", () => {
  const result = deriveLoanRepaymentTerms(100000, "AMOUNT", "30000", "");
  assert.equal(result.installmentCount, 4);
  assert.equal(result.finalInstallment, 10000);
});

test("duration option uses outstanding balance after previous recoveries or top-up", () => {
  const result = deriveLoanRepaymentTerms(25000, "MONTHS", "", "4");
  assert.equal(result.installmentAmount, "6250.00");
  assert.equal(result.installmentCount, 4);
});

test("rejects fractions, excessive months and months not achievable at kobo precision", () => {
  assert.match(deriveLoanRepaymentTerms(10000, "MONTHS", "", "3.5").invalidReason, /whole number/);
  assert.match(deriveLoanRepaymentTerms(10000, "MONTHS", "", "601").invalidReason, /600/);
  assert.match(deriveLoanRepaymentTerms(1.01, "MONTHS", "", "100").invalidReason, /not possible/);
});

test("rejects zero instalment and repayment periods over the allowed horizon", () => {
  assert.match(deriveLoanRepaymentTerms(100, "AMOUNT", "0", "").invalidReason, /positive/);
  assert.match(deriveLoanRepaymentTerms(1000000, "AMOUNT", "1", "").invalidReason, /600/);
  assert.equal(deriveLoanRepaymentTerms(100, "MONTHS", "", ""), null);
});

test("does not change approved loan principal or include interest", () => {
  const principal = 300000;
  const result = deriveLoanRepaymentTerms(principal, "MONTHS", "", "7");
  const sum = Math.round(Number(result.installmentAmount) * 100) * (result.installmentCount - 1)
    + Math.round(result.finalInstallment * 100);
  assert.equal(sum, principal * 100);
});
