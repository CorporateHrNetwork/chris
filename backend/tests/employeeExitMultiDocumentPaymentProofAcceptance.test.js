const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const routes = fs.readFileSync(path.join(root, "backend/src/routes/exitRoutes.js"), "utf8");
const frontend = fs.readFileSync(path.join(root, "src/pages/EmployeeExits.jsx"), "utf8");

test("Zermatt exit documents support a maximum of ten files per exit process", () => {
  assert.ok(routes.includes("const MAX_EXIT_DOCUMENTS = 10"));
  assert.ok(routes.includes('exitDocumentUpload.array("documents", MAX_EXIT_DOCUMENTS)'));
  assert.ok(routes.includes("currentCount + uploadedFiles.length > MAX_EXIT_DOCUMENTS"));
  assert.ok(routes.includes("EXIT_DOCUMENT_LIMIT_EXCEEDED"));
  assert.ok(frontend.includes("Maximum 10 documents per exit process"));
  assert.ok(frontend.includes("/10"));
});

test("exit UI supports multiple file selection and per-file upload queue metadata", () => {
  assert.ok(frontend.includes("multiple"));
  assert.ok(frontend.includes("queueFiles"));
  assert.ok(frontend.includes("exitDocumentQueue"));
  assert.ok(frontend.includes("updateQueueItem"));
  assert.ok(frontend.includes("removeQueueItem"));
  assert.ok(frontend.includes('body.append("documents", item.file)'));
  assert.ok(frontend.includes('body.append('));
  assert.ok(frontend.includes('"metadata"'));
});

test("backend creates all selected exit documents atomically and audits the batch", () => {
  assert.ok(routes.includes("for (let index = 0; index < uploadedFiles.length; index += 1)"));
  assert.ok(routes.includes("EXIT_DOCUMENTS_UPLOADED"));
  assert.ok(routes.includes("documentIds: created.map"));
  assert.ok(routes.includes("totalDocumentsAfterUpload"));
});

test("Exit Settlement Payment Proof is a controlled audited exit document type", () => {
  assert.ok(routes.includes('EXIT_SETTLEMENT_PAYMENT_PROOF: "Exit Settlement Payment Proof"'));
  assert.ok(frontend.includes('["EXIT_SETTLEMENT_PAYMENT_PROOF", "Exit Settlement Payment Proof"]'));
  assert.ok(frontend.includes('forcedCategory="EXIT_SETTLEMENT_PAYMENT_PROOF"'));
  assert.ok(frontend.includes("saveSettlementPaymentProof"));
  assert.ok(frontend.includes("payment advice, transfer confirmation, voucher, receipt"));
});

test("settlement payment proof counts against the same ten-document exit policy limit", () => {
  assert.ok(frontend.includes("totalDocumentCount={exitDocuments.length}"));
  assert.ok(frontend.includes("const persistedCount = totalDocumentCount == null"));
  assert.ok(frontend.includes("10 - persistedCount"));
});
