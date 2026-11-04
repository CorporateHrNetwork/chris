"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname,"../src/routes/essRoutes.js"),"utf8");

test("ESS leave and loan write endpoints explicitly deny submissions",()=>{
  for(const route of ["/leave/preview","/leave/applications","/loans/applications"]){
    assert.ok(source.includes(`router.post("${route}",requireEssAuth,essApplicationDisabled)`),route);
  }
  assert.match(source,/code:"ESS_APPLICATIONS_DISABLED"/);
});
test("ESS leave and loan profile endpoints remain available",()=>{
  assert.match(source,/router.get\("\/leave\/applications",requireEssAuth,essLeaveEndpoint\("options"\)\)/);
  assert.match(source,/router.get\("\/loans", requireEssAuth/);
});
test("external authorization preserves internal HR processing instead of ESS approval flow",()=>{
  assert.doesNotMatch(source,/router.post\("\/leave\/applications",requireEssAuth,essLeaveEndpoint\("submit"\)\)/);
});
