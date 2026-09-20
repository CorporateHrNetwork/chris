const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("payroll loan balances are aggregated once per request instead of correlated per employee row", () => {
  const routes = read("backend/src/routes/payrollIntegrationRoutes.js");
  assert.equal(routes.includes('LEFT JOIN LATERAL (\n         SELECT COALESCE(SUM(l."outstandingAmount")'), false);
  assert.ok(routes.includes('GROUP BY l."organizationId",l."employeeId"'));
  assert.ok(routes.includes('ON loan."organizationId"=pl."organizationId"'));
  assert.ok(routes.includes('AND loan."employeeId"=pl."employeeId"'));
});

test("large payroll and payslip tables render in bounded pages", () => {
  const payroll = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  const selector = read("src/components/EmployeeBatchSelector.jsx");
  const pageSizeMatches = payroll.match(/pageSize=\{50\}/g) || [];
  assert.ok(pageSizeMatches.length >= 2, "Execute Payroll and Approved Payslips must both use 50-row pages.");
  for (const expected of [
    "const [page, setPage] = useState(1);",
    "const pageCount =",
    "unpagedDisplayRows.slice(pageStart, pageStart + effectivePageSize)",
    "Page {safePage} of {pageCount}",
    "Previous",
    "Next",
  ]) assert.ok(selector.includes(expected), `Missing employee table pagination control: ${expected}`);
});
