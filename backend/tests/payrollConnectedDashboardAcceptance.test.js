const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "src/pages/payroll/PayrollIntegratedManaged.jsx"), "utf8");

test("connected payroll dashboard is responsive and linked to current payroll lines", () => {
  for (const expected of [
    'import { useCallback, useEffect, useMemo, useRef, useState } from "react";',
    'from "recharts";',
    "function PayrollConnectedDashboard",
    "allLines={lines}",
    "visibleLines={visibleLines}",
    "branchView={branchView}",
    "setBranchView={setBranchView}",
    "Branch Gross vs Net",
    "Statutory Composition",
    "Deduction & Recovery Mix",
    "Attendance & Cost Control",
    'label="Loan Recovery"',
    'label="Employee Pension"',
    'label="Employer Pension"',
    'label="Employer Cost"',
    'gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))"',
    '<ResponsiveContainer width="100%" height={280}>',
  ]) assert.ok(source.includes(expected), `Missing connected dashboard control: ${expected}`);
});

test("dashboard branch controls update the shared payroll branch filter", () => {
  assert.ok(source.includes('onClick={() => setBranchView("")}'));
  assert.ok(source.includes('onClick={() => setBranchView(branch.id)}'));
  assert.ok(source.includes("const visibleLines = branchView ? lines.filter"));
  assert.ok(source.includes("Branch selections update every KPI and chart instantly."));
});

test("dashboard uses authoritative payroll-line statutory and recovery values", () => {
  for (const expected of [
    'statutoryValue(row, "payeTax")',
    'statutoryValue(row, "employeePension")',
    'statutoryValue(row, "employerPension")',
    'statutoryValue(row, "nhfEmployee")',
    'statutoryValue(row, "nsitfEmployer")',
    'statutoryValue(row, "itfEmployerAccrual")',
    "row.loanRecovery",
    "row.advanceRecovery",
    "row.deductions",
    "row.grossPay",
    "row.netPreview",
  ]) assert.ok(source.includes(expected), `Missing connected payroll data source: ${expected}`);
});

test("approved payslip workspace has useMemo available at runtime", () => {
  assert.ok(source.includes("const approvedRuns = useMemo"));
  assert.ok(source.startsWith('import { useCallback, useEffect, useMemo, useRef, useState } from "react";'));
});
