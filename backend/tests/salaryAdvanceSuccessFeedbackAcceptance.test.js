const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "src/pages/payroll/SalaryAdvancesManaged.jsx"), "utf8");

test("Salary Advance success feedback auto-dismisses and clears on a new operation", () => {
  assert.ok(source.includes('window.setTimeout(() => setMessage(""), 5000)'), "success feedback must auto-dismiss after a short confirmation window");
  assert.ok(source.includes("window.clearTimeout(timer)"), "success-feedback timer must be cleaned up");
  assert.ok(source.includes("}, [message]);"), "success-feedback timer must react to the active message");
  assert.ok(source.includes('setMessage("");'), "new operations/reset must be able to clear stale success feedback");
  assert.ok(source.includes("GM-approved salary advance recorded as already paid outside CHRiS"), "success feedback must reflect the revised external approval/payment policy");
  console.log("PASS: Salary Advance success feedback auto-dismiss gate passed.");
});
