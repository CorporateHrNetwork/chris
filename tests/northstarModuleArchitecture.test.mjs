import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {getNorthstarPreview,northstarArchitecture} from "../src/demo/northstarModuleArchitecture.js";

test("Northstar architecture covers commercial HR module families with independent routes",()=>{
 assert.equal(northstarArchitecture.length,10);
 assert.equal(new Set(northstarArchitecture.map(x=>x.key)).size,northstarArchitecture.length);
 assert.ok(northstarArchitecture.every(x=>x.route.startsWith("/")&&x.description&&x.stage));
 for(const key of ["employees","recruitment","attendance","leave","payroll","loans","benefits","performance","training","reports"]){
  assert.ok(northstarArchitecture.find(x=>x.key===key),key);
 }
});

test("policy-sensitive modules have independent, fictional, read-only previews",()=>{
 for(const [path,key] of [["/leave","leave"],["/loans","loan"],["/benefits","benefit"],["/employees/exits","exit"],["/payroll/salary-rates","payroll"],["/performance/reviews","performance"],["/documents","document"]]){
  const preview=getNorthstarPreview(path);
  assert.equal(preview.key,key);
  assert.ok(preview.steps.length>=4&&preview.rows.length>=2);
  assert.ok(preview.rows.every(x=>/^NS-/.test(x.id)));
  assert.ok(preview.metrics.length>=2);
 }
 const f=fs.readFileSync(new URL("../src/demo/northstarModuleArchitecture.js",import.meta.url),"utf8");
 const ui=fs.readFileSync(new URL("../src/demo/DemoPolicyWorkspace.jsx",import.meta.url),"utf8");
 assert.doesNotMatch(f+ui,/zermatt|beer barn|\bZLL\b|chris-zermatt|chris\.crnetwork\.com\.ng/i);
 assert.match(ui,/apiRequest\("\/api\/loans"\)/);
 assert.doesNotMatch(ui,/method:\s*["'](?:POST|PATCH|DELETE|PUT)["']/);
 assert.match(ui,/Read-only fictional demonstration/);
 assert.match(ui,/organization\.slug==="chris-demo-company"/);
 assert.match(ui,/if\(!isNorthstar\) return/);
 assert.match(ui,/Northstar synthetic employee cohort/);
 assert.match(ui,/Independent demo configuration/);

});

test("existing sales-demo isolation boundary and demo build exclusion remain intact",()=>{
 const boundary=fs.readFileSync(new URL("../backend/src/middleware/salesDemoBoundary.js",import.meta.url),"utf8");
 const build=fs.readFileSync(new URL("../scripts/demo-build-isolation.mjs",import.meta.url),"utf8");
 assert.match(boundary,/DEMO_IDS/);
 assert.match(boundary,/if\(!\['GET','HEAD','OPTIONS'\]\.includes\(req\.method\)/);
 assert.match(build,/DemoPolicyWorkspace\.jsx/);
 assert.match(build,/DemoBillingSubscriptions\.jsx/);
});
