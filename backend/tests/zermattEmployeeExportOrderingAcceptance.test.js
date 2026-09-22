const assert = require("node:assert/strict");

const {
  DEFAULT_EXPORT_COLUMNS,
  compareZermattEmployeeExportRows,
} = require("../src/services/employeeDataOperationsService");

assert.ok(
  DEFAULT_EXPORT_COLUMNS.includes("employmentType"),
  "Employment Type must be included in the default employee export."
);

const rows = [
  { employeeNumber: "ZLL0009", hireDate: new Date("2021-04-01"), location: { code: "PHC", name: "PHC Branch" } },
  { employeeNumber: "ZLL0005", hireDate: new Date("2023-01-01"), location: { code: "LAG", name: "Lagos Branch" } },
  { employeeNumber: "ZLL0004", hireDate: new Date("2019-06-01"), location: { code: "LAG", name: "Lagos Branch" } },
  { employeeNumber: "ZLL0003", hireDate: new Date("2024-01-01"), location: { code: "ABJ", name: "Abuja Branch" } },
  { employeeNumber: "ZLL0001", hireDate: new Date("2018-02-01"), location: { code: "HO", name: "Head Office" } },
  { employeeNumber: "ZLL0002", hireDate: new Date("2020-07-01"), location: { code: "ABJ", name: "Abuja Branch" } },
  { employeeNumber: "ZLL0010", hireDate: null, location: { code: "PHC", name: "Port Harcourt Branch" } },
];

const ordered = [...rows].sort(compareZermattEmployeeExportRows);

assert.deepEqual(
  ordered.map((row) => row.employeeNumber),
  ["ZLL0001", "ZLL0002", "ZLL0003", "ZLL0004", "ZLL0005", "ZLL0009", "ZLL0010"],
  "Zermatt export must order Abuja/Head Office, then Lagos, then PHC, with oldest employment dates first inside each branch and blank dates last."
);

console.log("PASS: Zermatt employee export Employment Type and branch/seniority ordering.");


const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(
  path.resolve(__dirname, "../src/services/employeeDataOperationsService.js"),
  "utf8"
);

assert.ok(source.includes('{ key: "grossSalary", label: "Gross Salary" }'));
assert.ok(source.includes('FROM "payroll_salary_rates"'));
assert.ok(source.includes('"status"=\'ACTIVE\''));
assert.ok(source.includes('"effectiveFrom" <= $2::date'));
assert.ok(source.includes('currentGrossSalary'));
