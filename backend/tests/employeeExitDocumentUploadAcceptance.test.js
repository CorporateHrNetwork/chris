const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const routes = fs.readFileSync(
  path.join(root, "backend/src/routes/exitRoutes.js"),
  "utf8"
);
const frontend = fs.readFileSync(
  path.join(root, "src/pages/EmployeeExits.jsx"),
  "utf8"
);
const schema = fs.readFileSync(
  path.join(root, "backend/prisma/schema.prisma"),
  "utf8"
);

test("exit workflow provides dedicated supporting-document upload controls", () => {
  for (const expected of [
    "EXIT DOCUMENTS",
    "Supporting Exit Documents",
    "Default Document Type",
    "Choose File(s)",
    "Optional reference / note",
    "Upload ",
    "RESIGNATION_LETTER",
    "TERMINATION_LETTER",
    "RETIREMENT_NOTICE",
    "EXIT_ACCEPTANCE_LETTER",
    "CLEARANCE_DOCUMENT",
    "HANDOVER_DOCUMENT",
  ]) {
    assert.ok(frontend.includes(expected), `Missing exit document control: ${expected}`);
  }
});

test("document can be staged before initiation and linked after exit process creation", () => {
  assert.ok(frontend.includes("createdExit?.id && hadDocument"));
  assert.ok(frontend.includes("await uploadExitDocument(createdExit.id)"));
  assert.ok(frontend.includes("Exit process initiated and"));
});

test("additional exit documents can be added during clearance", () => {
  assert.ok(frontend.includes("documents={exitDocuments}"));
  assert.ok(frontend.includes("onUpload={saveExitDocument}"));
  assert.ok(frontend.includes("onDelete={deleteExitDocument}"));
});

test("exit document API is audited and linked to the specific exit process", () => {
  for (const expected of [
    '"/:id/documents"',
    'exitDocumentUpload.array("documents", MAX_EXIT_DOCUMENTS)',
    "exitProcessId: exitProcess.id",
    "EXIT_DOCUMENTS_UPLOADED",
    "EXIT_DOCUMENT_DELETED",
    "exitProcessId: req.params.id",
  ]) {
    assert.ok(routes.includes(expected), `Missing exit document backend control: ${expected}`);
  }
});

test("EmployeeDocument schema retains exit-process ownership", () => {
  assert.ok(schema.includes("exitProcessId    String?"));
  assert.ok(schema.includes("exitProcess  EmployeeExitProcess?"));
  assert.ok(schema.includes("documents            EmployeeDocument[]"));
  assert.ok(schema.includes("@@index([exitProcessId])"));
});
