const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../..");
const css=fs.readFileSync(path.join(root,"src/pages/benefits/TransportSupportPreparation.css"),"utf8");
const jsx=fs.readFileSync(path.join(root,"src/pages/benefits/TransportSupportPreparation.jsx"),"utf8");
test("salary setup inherits canonical CHRiS dark theme rather than a conflicting light canvas",()=>{
  assert.ok(css.includes("var(--chris-dashboard-text"));
  assert.ok(css.includes("var(--chris-dashboard-muted"));
  assert.ok(css.includes("var(--chris-ui-panel-background"));
  assert.ok(css.includes("var(--chris-dashboard-gold"));
  assert.ok(css.includes("background:transparent"));
  assert.ok(!css.includes("background:#f9faf7"));
  assert.ok(!css.includes("--sb-surface:#ffffff"));
  assert.ok(!css.includes("color:#183026"));
  assert.ok(!css.includes("background:#ffffff"));
  assert.ok(css.includes(".chris-salary-basis .sb-card"));
  assert.ok(css.includes(".chris-salary-basis .sb-hero"));
});
test("global theme retained for headings, descriptions and disabled controls",()=>{
  assert.ok(css.includes(".chris-salary-basis :is(h1,h2,h3)"));
  assert.ok(css.includes(".chris-salary-basis p"));
  assert.ok(css.includes(".chris-salary-basis button:disabled"));
  assert.ok(css.includes(".chris-salary-basis :is(button,input,select,textarea):focus-visible"));
  assert.ok(css.includes("@media (max-width:640px)"));
});
test("salary import/preview/correction UI remains unchanged",()=>{
  assert.ok(jsx.includes("TransportSupportPreparation.css"));
  assert.ok(jsx.includes("EmployeeSearchSelect"));
  assert.ok(jsx.includes("Download Full Salary Template"));
  assert.ok(jsx.includes("Preview Salary Allocations"));
  assert.ok(jsx.includes("Import for Review"));
  assert.ok(jsx.includes("Correct benefit basis"));
  assert.ok(jsx.includes("disabled={busy||!enabled||!preview||preview.invalidRows>0}"));
});
