import fs from "node:fs";
import assert from "node:assert/strict";
const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const app=read("src/App.jsx"),sidebar=read("src/components/layout/Sidebar/Sidebar.jsx");
const routes=["/leave","/leave/requests","/leave/active","/leave/returns","/leave/calendar","/leave/balances","/leave/entitlements","/leave/policies","/leave/exceptions"];
for(const route of routes){assert.ok(app.includes(`path="${route}"`),`missing route ${route}`);assert.ok(sidebar.includes(`"${route}"`),`missing sidebar path ${route}`)}
assert.doesNotMatch(sidebar.slice(sidebar.indexOf('"leave"'),sidebar.indexOf('"payroll"')),/planned:/);
assert.match(read("src/components/leave/LeaveUi.jsx"),/DRAFT.*PENDING.*APPROVED.*ACTIVE.*COMPLETED.*REJECTED.*CANCELLED/s);
assert.match(read("src/pages/LeaveActive.jsx"),/status=ACTIVE/);
assert.match(read("src/pages/LeaveReturns.jsx"),/Confirm Return/);
assert.match(read("src/pages/LeaveReturns.jsx"),/setMessage.*load\(\)/s);
assert.match(read("src/pages/LeaveRequests.jsx"),/Policy \/ Version/);
assert.match(read("src/pages/LeaveRequests.jsx"),/leave\.approve.*leave\.manage/s);
assert.match(read("src/pages/LeaveCalendarPage.jsx"),/calendarLeaves/);
assert.match(read("src/pages/LeaveExceptions.jsx"),/consistency/);
console.log("PASS: CHRIS operational leave frontend tests passed.");
