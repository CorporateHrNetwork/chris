const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DISCIPLINARY_TRANSITIONS,
  transitionDisciplinaryCase,
} = require("../src/services/disciplinaryGovernanceControlService");

const root = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("ZERMATT R1 enforces auditable disciplinary due-process progression", async () => {
  assert.deepEqual(DISCIPLINARY_TRANSITIONS.OPEN, ["INVESTIGATING"]);
  assert.deepEqual(DISCIPLINARY_TRANSITIONS.DECISION_PENDING, ["CLOSED"]);
  assert.deepEqual(DISCIPLINARY_TRANSITIONS.CLOSED, []);

  const rejectedPrisma = {
    $transaction: async (fn) =>
      fn({
        disciplinaryCase: {
          findFirst: async () => ({
            id: "case-1",
            organizationId: "org-1",
            status: "OPEN",
            outcome: null,
            decidedAt: null,
          }),
        },
      }),
  };

  await assert.rejects(
    transitionDisciplinaryCase(rejectedPrisma, {
      organizationId: "org-1",
      caseId: "case-1",
      actorUserId: "user-1",
      status: "CLOSED",
      outcome: "TERMINATION",
    }),
    (error) => {
      assert.equal(error.code, "DISCIPLINARY_TRANSITION_NOT_PERMITTED");
      return true;
    }
  );

  const writes = [];
  const validPrisma = {
    $transaction: async (fn) =>
      fn({
        disciplinaryCase: {
          findFirst: async () => ({
            id: "case-1",
            organizationId: "org-1",
            status: "OPEN",
            outcome: null,
            decidedAt: null,
          }),
          update: async ({ data }) => {
            writes.push(["case.update", data]);
            return { id: "case-1", ...data };
          },
        },
        disciplinaryProcessEvent: {
          create: async ({ data }) => {
            writes.push(["event.create", data]);
            return data;
          },
        },
      }),
  };

  const advanced = await transitionDisciplinaryCase(validPrisma, {
    organizationId: "org-1",
    caseId: "case-1",
    actorUserId: "user-1",
    status: "INVESTIGATING",
    reason: "Investigation authorised by HR Manager",
  });

  assert.equal(advanced.status, "INVESTIGATING");
  assert.equal(writes.length, 2);
  assert.equal(writes[1][0], "event.create");
  assert.equal(writes[1][1].eventType, "CASE_STATUS_CHANGED");
  assert.equal(writes[1][1].actorUserId, "user-1");
  assert.deepEqual(writes[1][1].metadata, {
    fromStatus: "OPEN",
    toStatus: "INVESTIGATING",
    outcome: null,
  });

  const route = read("backend/src/routes/employmentGovernanceRoutes.js");
  const page = read("src/pages/EmployeeGovernance.jsx");
  const controls = read("src/components/employees/DisciplinaryProcessControls.jsx");
  const service = read("backend/src/services/employmentGovernanceService.js");

  assert.match(route, /disciplinaryTransitions:\s*DISCIPLINARY_TRANSITIONS/);
  assert.match(route, /transitionDisciplinaryCase/);
  assert.match(page, /DisciplinaryProcessControls/);
  assert.match(controls, /PIP_STARTED/);
  assert.match(controls, /EMPLOYEE_RESPONSE/);
  assert.match(controls, /\/evidence`/);
  assert.match(controls, /\/process-events`/);
  assert.match(controls, /Record Case Transition/);
  assert.match(
    service,
    /External criminal, civil or regulatory outcomes are linked but do not automatically determine the internal employment decision\./
  );
});
