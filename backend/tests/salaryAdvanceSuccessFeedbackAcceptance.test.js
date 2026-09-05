const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "src/pages/payroll/SalaryAdvancesManaged.jsx"), "utf8");

test("Salary Advance success feedback auto-dismisses and clears on a new operation", () => {
  assert.ok(source.includes('window.setTimeout(() => setMessage(""), 4000)'), "success feedback must auto-dismiss after about 4 seconds");
  assert.ok(source.includes("window.clearTimeout(timer)"), "success-feedback timer must be cleaned up");
  assert.ok(source.includes("}, [message]);"), "success-feedback timer must react to the active message");
  assert.ok(source.includes('setMessage("");\n  };\n\n  const startEdit'), "reset must clear stale success feedback");
  assert.ok(source.includes('setMessage("");\n    window.scrollTo'), "starting another edit must clear stale success feedback");
  assert.ok(source.includes('setMessage("");\n      if (editing)'), "starting save/create must clear stale success feedback");
  console.log("PASS: Salary Advance success feedback auto-dismiss gate passed.");
});
