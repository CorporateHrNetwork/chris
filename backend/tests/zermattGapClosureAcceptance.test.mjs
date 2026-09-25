import test from "node:test";
import assert from "node:assert/strict";
import { documentTabFromLocation } from "../../src/utils/documentWorkspaceRoute.js";

test("document sidebar routes open the requested connected workspace", () => {
  assert.equal(documentTabFromLocation("/documents/employee"), "employee");
  assert.equal(documentTabFromLocation("/documents/hr"), "hr");
  assert.equal(documentTabFromLocation("/documents/policies"), "policies");
  assert.equal(documentTabFromLocation("/documents/templates"), "templates");
  assert.equal(documentTabFromLocation("/documents/categories"), "categories");
  assert.equal(documentTabFromLocation("/documents/expiry-tracking"), "expiry");
  assert.equal(documentTabFromLocation("/documents/requests"), "requests");
  assert.equal(documentTabFromLocation("/documents", "?workspace=resources"), "resources");
});
