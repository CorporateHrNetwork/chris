const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "compliance-api-acceptance-secret";
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/chris_test";

function permissions(keys) {
  return [{ role: { name: "Compliance Manager", rolePermissions: keys.map((key) => ({ permission: { key } })) } }];
}

function createHarness() {
  const state = {
    batches: [],
    obligations: [{
      id: "obligation-1", organizationId: "org-1", obligationType: "PAYE",
      periodYear: 2026, periodMonth: 9, totalLiability: 1000, amountRemitted: 0,
      status: "CONFIRMED", currency: "NGN", employee: { employeeNumber: "CHR001" },
    }],
    allocations: [],
    reconciliations: [],
    events: [],
  };
  const users = {
    maker: {
      id: "maker", organizationId: "org-1", email: "maker@example.test", isActive: true,
      organization: { id: "org-1", slug: "client-one", status: "ACTIVE" },
      locationScope: "ALL_LOCATIONS", userLocations: [],
      userRoles: permissions(["compliance.view", "remittances.view", "remittances.manage"]),
    },
    checker: {
      id: "checker", organizationId: "org-1", email: "checker@example.test", isActive: true,
      organization: { id: "org-1", slug: "client-one", status: "ACTIVE" },
      locationScope: "ALL_LOCATIONS", userLocations: [],
      userRoles: permissions(["compliance.view", "remittances.view", "remittances.manage"]),
    },
    branch: {
      id: "branch", organizationId: "org-1", email: "branch@example.test", isActive: true,
      organization: { id: "org-1", slug: "client-one", status: "ACTIVE" },
      locationScope: "ASSIGNED_LOCATIONS",
      userLocations: [{ location: { id: "location-1", organizationId: "org-1", name: "Branch", code: "BR", type: "BRANCH", isActive: true } }],
      userRoles: permissions(["compliance.view", "remittances.view", "remittances.manage"]),
    },
    viewer: {
      id: "viewer", organizationId: "org-1", email: "viewer@example.test", isActive: true,
      organization: { id: "org-1", slug: "client-one", status: "ACTIVE" },
      locationScope: "ALL_LOCATIONS", userLocations: [],
      userRoles: permissions(["remittances.view"]),
    },
  };

  const fake = {
    user: {
      findFirst: async ({ where, include }) => {
        const user = users[where.id];
        if (!user || user.organizationId !== where.organizationId || !user.isActive) return null;
        return include ? user : { id: user.id };
      },
    },
    organizationLocation: { findMany: async () => [] },
    complianceRule: { findMany: async () => [] },
    statutoryLifecycleEvent: { create: async ({ data }) => { state.events.push(data); return data; } },
    statutoryRemittanceBatch: {
      create: async ({ data }) => {
        const batch = { id: `batch-${state.batches.length + 1}`, status: "DRAFT", allocatedAmount: 0, allocations: [], reconciliation: null, ...data };
        state.batches.push(batch); return batch;
      },
      findFirst: async ({ where }) => {
        const batch = state.batches.find((item) => item.id === where.id && item.organizationId === where.organizationId);
        return batch ? { ...batch, allocations: state.allocations.filter((item) => item.batchId === batch.id) } : null;
      },
      findMany: async ({ where }) => state.batches.filter((item) => item.organizationId === where.organizationId).map((item) => ({ ...item, allocations: state.allocations.filter((allocation) => allocation.batchId === item.id), reconciliation: state.reconciliations.find((row) => row.batchId === item.id) || null })),
      update: async ({ where, data }) => {
        const index = state.batches.findIndex((item) => item.id === where.id);
        state.batches[index] = { ...state.batches[index], ...data };
        return state.batches[index];
      },
    },
    statutoryObligation: {
      findMany: async ({ where }) => state.obligations.filter((item) => item.organizationId === where.organizationId),
      findFirst: async ({ where }) => state.obligations.find((item) => item.id === where.id && item.organizationId === where.organizationId) || null,
      update: async ({ where, data }) => {
        const index = state.obligations.findIndex((item) => item.id === where.id);
        state.obligations[index] = { ...state.obligations[index], ...data };
        return state.obligations[index];
      },
      updateMany: async ({ where, data }) => {
        const batchId = where.allocations?.some?.batchId;
        for (const obligation of state.obligations) {
          if (obligation.organizationId === where.organizationId && obligation.status === where.status && state.allocations.some((item) => item.batchId === batchId && item.obligationId === obligation.id)) Object.assign(obligation, data);
        }
        return { count: 1 };
      },
    },
    statutoryRemittanceAllocation: {
      upsert: async ({ where, create, update }) => {
        const key = where.batchId_obligationId;
        const existing = state.allocations.find((item) => item.batchId === key.batchId && item.obligationId === key.obligationId);
        if (existing) { existing.amount += Number(update.amount.increment); return existing; }
        state.allocations.push({ id: `allocation-${state.allocations.length + 1}`, ...create });
        return state.allocations.at(-1);
      },
    },
    statutoryReconciliation: {
      upsert: async ({ where, create, update }) => {
        const existing = state.reconciliations.find((item) => item.batchId === where.batchId);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = { id: "reconciliation-1", ...create }; state.reconciliations.push(row); return row;
      },
      updateMany: async ({ where, data }) => {
        state.reconciliations.filter((item) => item.batchId === where.batchId && item.organizationId === where.organizationId).forEach((item) => Object.assign(item, data));
        return { count: 1 };
      },
    },
    $transaction: async (callback) => callback(fake),
  };
  return { fake, state };
}

function token(userId) {
  return jwt.sign({ userId, organizationId: "org-1" }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

async function json(base, endpoint, { userId, method = "GET", body } = {}) {
  const response = await fetch(`${base}${endpoint}`, {
    method,
    headers: {
      ...(userId ? { Authorization: `Bearer ${token(userId)}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, result: await response.json() };
}

test("remittance administrative API enforces scope, permissions and the complete internal lifecycle", async (t) => {
  const { fake, state } = createHarness();
  const prismaPath = require.resolve("../src/config/prisma");
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fake };
  const routePath = require.resolve("../src/routes/complianceRoutes");
  const servicePath = require.resolve("../src/services/statutoryRemittanceService");
  delete require.cache[routePath]; delete require.cache[servicePath];
  const router = require("../src/routes/complianceRoutes");
  const app = express(); app.use(express.json()); app.use("/api/compliance", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  let call = await json(base, "/api/compliance/remittances");
  assert.equal(call.response.status, 401);
  call = await json(base, "/api/compliance/remittances", { userId: "branch" });
  assert.equal(call.response.status, 403); assert.equal(call.result.code, "CONSOLIDATED_COMPLIANCE_SCOPE_REQUIRED");
  call = await json(base, "/api/compliance/remittances", { userId: "viewer", method: "POST", body: {} });
  assert.equal(call.response.status, 403);

  call = await json(base, "/api/compliance/remittances", { userId: "maker", method: "POST", body: { reference: "PAYE-2026-09", obligationType: "PAYE", authorityName: "LIRS", periodYear: 2026, periodMonth: 9, declaredAmount: 1000 } });
  assert.equal(call.response.status, 201); const batchId = call.result.data.id;
  call = await json(base, `/api/compliance/remittances/${batchId}/submit`, { userId: "maker", method: "POST", body: {} });
  assert.equal(call.response.status, 200); assert.equal(call.result.data.status, "SUBMITTED");
  call = await json(base, `/api/compliance/remittances/${batchId}/approve`, { userId: "maker", method: "POST", body: {} });
  assert.equal(call.response.status, 409); assert.equal(call.result.code, "REMITTANCE_MAKER_CHECKER_REQUIRED");
  call = await json(base, `/api/compliance/remittances/${batchId}/approve`, { userId: "checker", method: "POST", body: {} });
  assert.equal(call.response.status, 200); assert.equal(call.result.data.status, "APPROVED");

  call = await json(base, `/api/compliance/remittances/${batchId}/payment`, { userId: "checker", method: "POST", body: { paymentReference: "BANK-1", paymentDate: "2026-09-30" } });
  assert.equal(call.response.status, 400); assert.equal(call.result.code, "PAYMENT_EVIDENCE_REQUIRED");
  call = await json(base, `/api/compliance/remittances/${batchId}/payment`, { userId: "checker", method: "POST", body: { paymentReference: "BANK-1", paymentDate: "2026-09-30", evidenceReference: "DOC-1" } });
  assert.equal(call.response.status, 200); assert.equal(call.result.data.status, "PAID");
  call = await json(base, `/api/compliance/remittances/${batchId}/allocations`, { userId: "checker", method: "POST", body: { allocations: [{ obligationId: "obligation-1", amount: 1000 }] } });
  assert.equal(call.response.status, 200); assert.equal(call.result.data.status, "ALLOCATED");
  call = await json(base, `/api/compliance/remittances/${batchId}/reconcile`, { userId: "checker", method: "POST", body: { paidAmount: 1000, notes: "Matched to evidence" } });
  assert.equal(call.response.status, 200); assert.equal(call.result.data.status, "MATCHED");
  assert.equal(state.batches[0].status, "RECONCILED"); assert.equal(state.obligations[0].status, "RECONCILED");
  call = await json(base, `/api/compliance/remittances/${batchId}/reverse`, { userId: "checker", method: "POST", body: { reason: "Bank reversal confirmed" } });
  assert.equal(call.response.status, 200); assert.equal(call.result.data.status, "REVERSED");
  assert.equal(state.obligations[0].amountRemitted, 0); assert.equal(state.obligations[0].status, "CONFIRMED");
  assert.ok(state.events.some((event) => event.eventType === "BATCH_REVERSED"));
});

test("administrative UI exposes remittance operations and exit financial closure", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const app = read("src/App.jsx");
  const consolidatedRoute = read("src/components/auth/ConsolidatedComplianceRoute.jsx");
  const authRoutes = read("backend/src/routes/authRoutes.js");
  const remittance = read("src/pages/statutories/RemittanceWorkspace.jsx");
  const payroll = read("src/pages/payroll/PayrollIntegratedManaged.jsx");
  const exits = read("src/pages/EmployeeExits.jsx");
  const exitRoutes = read("backend/src/routes/exitRoutes.js");
  const register = read("backend/src/services/exitRegisterService.js");
  assert.match(app, /statutories\/remittances.*ConsolidatedComplianceRoute.*RemittanceWorkspace/);
  for (const contract of ["consolidatedOrganization", "activeLocationId", "Consolidated access required"]) assert.ok(consolidatedRoute.includes(contract) || authRoutes.includes(contract), `frontend consolidated-scope gate missing ${contract}`);
  for (const contract of ["/api/compliance/remittances", "/api/compliance/obligations", "Record Payment", "Record Allocation", "Reconcile", "Reverse Batch"]) assert.ok(remittance.includes(contract), `remittance UI missing ${contract}`);
  for (const contract of ["organization-logo", "organization-name", "watermark", "Employee Payslip", "window.open(\"\", \"_blank\""]) assert.ok(payroll.includes(contract), `payslip print document missing ${contract}`);
  for (const contract of ["runSettlementAction(\"calculate\"", "runSettlementAction(\"submit\"", "runSettlementAction(\"approve\"", "runSettlementAction(\"payment\"", "runSettlementAction(\"waive\"", "Loan and salary-advance recoveries are read from authoritative outstanding balances"]) assert.ok(exits.includes(contract), `exit settlement UI missing ${contract}`);
  for (const endpoint of ["settlement/calculate", "settlement/submit", "settlement/approve", "settlement/payment", "settlement/waive"]) assert.ok(exitRoutes.includes(endpoint), `exit API missing ${endpoint}`);
  for (const contract of ["financialStatus", "finalClosureAt", "settlement:"]) assert.ok(register.includes(contract), `exit register missing ${contract}`);
});
