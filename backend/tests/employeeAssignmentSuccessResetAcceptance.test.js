const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(
  path.join(root, "src/pages/BulkEmployeeImport.jsx"),
  "utf8"
);

test("successful employee assignment resets the form for the next employee", () => {
  for (const expected of [
    'setEmployeeSearch("");',
    "setEmployeeMatches([]);",
    "setSelectedAssignmentEmployee(null);",
    'employeeNumber: ""',
    'employmentType: ""',
    'costCentreId: ""',
    'reason: ""',
  ]) {
    assert.ok(source.includes(expected), `Missing assignment reset control: ${expected}`);
  }
});

test("success banner auto-clears after a short confirmation period", () => {
  assert.ok(source.includes("assignmentSuccessTimer = useRef(null)"));
  assert.ok(source.includes("window.clearTimeout(assignmentSuccessTimer.current)"));
  assert.ok(source.includes('setAssignmentNotice("");'));
  assert.ok(source.includes("}, 4000);"));
});

test("assignment success timer is cleaned up when the page unmounts", () => {
  assert.ok(source.includes("useEffect(() => () => {"));
  assert.ok(source.includes("if (assignmentSuccessTimer.current)"));
});
