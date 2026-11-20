const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const page = fs.readFileSync(path.join(root,"src/pages/benefits/TransportSupportPreparation.jsx"),"utf8");
const css = fs.readFileSync(path.join(root,"src/pages/benefits/TransportSupportPreparation.css"),"utf8");
test("TSP salary-basis setup uses scoped CHRiS visual language with readable controls", () => {
  assert.ok(page.includes("import './TransportSupportPreparation.css'"));
  assert.ok(page.includes('className="chris-salary-basis"'));
  assert.ok(page.includes('className="sb-hero"'));
  assert.ok(page.includes('className="sb-card"'));
  assert.ok(page.includes('className="sb-toolbar"'));
  assert.ok(page.includes('className="sb-form-grid"'));
  assert.ok(page.includes('className="sb-table-scroll"'));
  assert.ok(css.includes(".chris-salary-basis button:disabled"));
  assert.ok(css.includes(".chris-salary-basis button:focus-visible"));
  assert.ok(css.includes("@media(max-width:640px)"));
  assert.ok(css.includes("overflow-x:auto"));
});
test("TSP action workflows and permission gating are retained",()=>{
  for(const route of ["/template","/preview","/import","/individual/preview","/individual"]) {
    assert.ok(page.includes(route),route);
  }
  assert.ok(page.includes("disabled={busy||!enabled||!preview||preview.invalidRows>0}"));
  assert.ok(page.includes("disabled={busy||!enabled||!individualPreview}"));
  assert.ok(page.includes("EmployeeSearchSelect"));
  assert.ok(page.includes("Correct benefit basis"));
  assert.ok(page.includes("Open Monthly Register &amp; Excel Export"));
});
