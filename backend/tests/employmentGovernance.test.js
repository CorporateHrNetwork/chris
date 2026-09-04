const assert = require("node:assert/strict");
const {
  CONTRACT_TRANSITIONS,
  VERIFICATION_STATUSES,
  transitionContractLifecycle,
  addExternalProceeding,
  appendDisciplinaryEvidence,
  recordVerification,
} = require("../src/services/employmentGovernanceService");

async function testContractStateMachine() {
  assert.deepEqual(CONTRACT_TRANSITIONS.OFFER_ISSUED.sort(), ["OFFER_ACCEPTED", "OFFER_DECLINED", "OFFER_EXPIRED", "OFFER_WITHDRAWN"].sort());
  assert.ok(CONTRACT_TRANSITIONS.COMMENCEMENT_PENDING.includes("ACTIVE"));
  assert.equal(CONTRACT_TRANSITIONS.ACTIVE.length, 0);

  const writes = [];
  const tx = {
    employmentContractLifecycle: {
      findFirst: async () => ({ id: "c1", organizationId: "o1", currentState: "OFFER_ISSUED", employeeId: null, effectiveEmploymentDate: null }),
      update: async ({ data }) => { writes.push(["lifecycle.update", data]); return { id: "c1", ...data }; },
    },
    employmentContractTransition: {
      create: async ({ data }) => { writes.push(["transition.create", data]); return data; },
    },
  };
  const prisma = { $transaction: async (fn) => fn(tx) };
  const result = await transitionContractLifecycle(prisma, {
    organizationId: "o1",
    lifecycleId: "c1",
    actorUserId: "u1",
    toState: "OFFER_ACCEPTED",
    authority: "Approved appointment authority",
  });
  assert.equal(result.lifecycle.currentState, "OFFER_ACCEPTED");
  assert.equal(writes[0][1].fromState, "OFFER_ISSUED");
  assert.equal(writes[0][1].toState, "OFFER_ACCEPTED");
}

async function testExternalOutcomeDoesNotMutateInternalCase() {
  let caseUpdateCalled = false;
  const prisma = {
    disciplinaryCase: {
      findFirst: async () => ({ id: "d1", status: "INVESTIGATING" }),
      update: async () => { caseUpdateCalled = true; },
    },
    disciplinaryExternalProceeding: {
      create: async ({ data }) => ({ id: "e1", ...data }),
    },
  };
  const result = await addExternalProceeding(prisma, {
    organizationId: "o1",
    caseId: "d1",
    proceedingType: "CRIMINAL",
    authority: "Court",
    status: "CLOSED",
    outcome: "ACQUITTED",
  });
  assert.equal(result.outcome, "ACQUITTED");
  assert.equal(caseUpdateCalled, false, "external acquittal must not mutate internal disciplinary state");
}

async function testEvidenceIsVersionedAppendOnly() {
  const created = [];
  const tx = {
    disciplinaryCase: { findFirst: async () => ({ id: "d1" }) },
    disciplinaryEvidenceVersion: {
      findFirst: async () => ({ versionNumber: 2 }),
      create: async ({ data }) => { created.push(data); return data; },
    },
  };
  const prisma = { $transaction: async (fn) => fn(tx) };
  const evidence = await appendDisciplinaryEvidence(prisma, {
    organizationId: "o1",
    caseId: "d1",
    logicalEvidenceKey: "query-letter",
    category: "ALLEGATION_QUERY",
    title: "Employee query",
    content: { text: "Version three correction" },
    finalized: true,
    actorUserId: "u1",
  });
  assert.equal(evidence.versionNumber, 3);
  assert.ok(evidence.contentHash);
  assert.ok(evidence.finalizedAt instanceof Date);
  assert.equal(created.length, 1, "corrections must append one new version, not overwrite old evidence");
}

async function testVerificationOutageIsNotMismatch() {
  assert.ok(VERIFICATION_STATUSES.includes("SERVICE_UNAVAILABLE"));
  assert.ok(VERIFICATION_STATUSES.includes("VERIFICATION_PENDING"));
  assert.ok(VERIFICATION_STATUSES.includes("MANUAL_REVIEW"));
  const prisma = {
    employee: { findFirst: async () => ({ id: "emp1", employeeNumber: "CHR000001" }) },
    externalVerificationRecord: { create: async ({ data }) => data },
  };
  const record = await recordVerification(prisma, {
    organizationId: "o1",
    employeeNumber: "CHR000001",
    identifierType: "TAX_ID",
    identifierValue: "12345678901",
    provider: "Nigeria Revenue Service",
    status: "SERVICE_UNAVAILABLE",
    errorCode: "UPSTREAM_503",
  });
  assert.equal(record.status, "SERVICE_UNAVAILABLE");
  assert.notEqual(record.status, "MISMATCH");
  assert.ok(record.maskedIdentifier.endsWith("8901"));
}

(async () => {
  await testContractStateMachine();
  await testExternalOutcomeDoesNotMutateInternalCase();
  await testEvidenceIsVersionedAppendOnly();
  await testVerificationOutageIsNotMismatch();
  console.log("PASS: employment governance judicial/compliance contracts.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
