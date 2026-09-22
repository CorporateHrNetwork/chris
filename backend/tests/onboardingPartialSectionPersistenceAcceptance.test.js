const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(
  path.join(root, "backend/src/routes/onboardingRoutes.js"),
  "utf8"
);

test("non-personal onboarding sections preserve meaningful partial entries", () => {
  assert.ok(source.includes("Save-progress semantics:"));
  assert.ok(source.includes("Non-personal onboarding sections may be saved while incomplete."));
  assert.ok(source.includes("A completely blank required section is still"));
});

test("partial statutory details reach persistence instead of a second all-or-nothing validation rejection", () => {
  const savedDataIndex = source.indexOf("const savedData =");
  const completionIndex = source.indexOf("const completedItemKeys =", savedDataIndex);
  assert.ok(savedDataIndex >= 0);
  assert.ok(completionIndex > savedDataIndex);

  const persistenceWindow = source.slice(savedDataIndex, completionIndex);
  assert.equal(
    persistenceWindow.includes("return res.status(422)"),
    false,
    "Partial saved section data must not be rejected before progress persistence."
  );
});

test("blank required sections remain rejected and incomplete sections remain incomplete", () => {
  assert.ok(source.includes("submittedSectionIsBlank"));
  assert.ok(source.includes("!hasMeaningfulSectionInput(incomingData)"));
  assert.ok(source.includes("completedItems >= section.items.length"));
});
