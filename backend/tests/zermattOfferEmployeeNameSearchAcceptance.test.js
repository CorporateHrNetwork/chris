const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("offer letter uses name search and selection instead of number entry", () => {
  const ui = read("src/pages/documents/ZermattOfferLetterComposer.jsx");
  assert.ok(ui.includes("Search employee by name"));
  assert.ok(ui.includes("first, middle or surname"));
  assert.ok(ui.includes("/api/zermatt/offer-terms/search?name="));
  assert.ok(ui.includes("onClick={() => load(person.employeeNumber)}"));
  assert.ok(ui.includes("setSelectedEmployeeNumber(employeeNumber)"));
  assert.ok(!ui.includes("Employee No. <input"));
});
test("name search requires auth, verifies tenant, limits results, and filters to assigned locations", () => {
  const route = read("backend/src/routes/zermattOfferTermsRoutes.js");
  assert.ok(route.includes('router.use(requireAuth, requireAnyPermission("employees.view", "recruitment.view"))'));
  assert.ok(route.indexOf('router.get("/search"') < route.indexOf('router.get("/:employeeNumber"'));
  assert.ok(route.includes('req.auth.locationScope === "ALL_LOCATIONS"'));
  assert.ok(route.includes('locationId: { in: assignedLocations }'));
  assert.ok(route.includes('firstName: { contains: token, mode: "insensitive" }'));
  assert.ok(route.includes('middleName: { contains: token, mode: "insensitive" }'));
  assert.ok(route.includes('lastName: { contains: token, mode: "insensitive" }'));
  assert.ok(route.includes("take: 25"));
  assert.ok(route.includes('replace(/\\s+/g, " ")'));
});
