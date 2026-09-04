import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) =>
  fs.readFileSync(
    new URL(`../../${path}`, import.meta.url),
    "utf8"
  );

const app = read("src/App.jsx");
const attendanceDashboard = read("src/pages/AttendanceDashboard.jsx");
const leaveDashboard = read("src/pages/LeaveDashboard.jsx");
const attendanceRoutes = read("backend/src/routes/attendanceRoutes.js");
const leaveRoutes = read("backend/src/routes/leaveRoutes.js");

for (const route of [
  "/attendance",
  "/attendance/register",
  "/attendance/shifts",
  "/attendance/shift-schedule",
  "/attendance/worked-hours",
  "/attendance/overtime",
  "/leave",
  "/leave/requests",
  "/leave/active",
  "/leave/returns",
  "/leave/balances",
  "/leave/entitlements",
  "/leave/policies",
  "/leave/exceptions",
]) {
  assert.ok(
    app.includes(`path="${route}"`),
    `Release-1 route missing: ${route}`
  );
}

assert.match(
  attendanceDashboard,
  /api\/attendance\/shifts/
);
assert.match(
  attendanceDashboard,
  /api\/attendance\/report/
);
assert.match(
  attendanceDashboard,
  /navigate\("\/attendance\/shift-schedule"\)/
);
assert.match(
  attendanceDashboard,
  /navigate\("\/attendance\/overtime"\)/
);
assert.doesNotMatch(
  attendanceDashboard,
  /Planned scheduling workspace|Planned overtime analytics/
);

assert.match(
  attendanceRoutes,
  /"\/worked-hours"/
);
assert.match(
  attendanceRoutes,
  /"\/payroll-basis"/
);
assert.match(
  attendanceRoutes,
  /"\/manual-payroll-inputs"/
);
assert.match(
  attendanceRoutes,
  /req\.auth\.organizationId/
);

assert.match(
  leaveDashboard,
  /api\/leave\/overview/
);
for (const route of [
  "/leave/requests",
  "/leave/returns",
  "/leave/entitlements",
  "/leave/policies",
  "/leave/exceptions",
]) {
  assert.ok(
    leaveDashboard.includes(route),
    `Leave dashboard operation missing: ${route}`
  );
}

assert.match(
  leaveRoutes,
  /"\/requests\/:id\/commence"/
);
assert.match(
  leaveRoutes,
  /"\/requests\/:id\/return"/
);
assert.match(
  leaveRoutes,
  /leavePolicyId:\s*req\.body\.leavePolicyId/
);
assert.match(
  leaveRoutes,
  /organizationId:\s*req\.auth\.organizationId/
);

console.log(
  "PASS: ZERMATT Release-1 Leave / Attendance acceptance gate passed."
);
