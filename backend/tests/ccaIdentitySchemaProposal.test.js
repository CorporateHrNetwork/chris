"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "../../docs/cca/sql/cca_identity_schema_PROPOSAL.sql"), "utf8");

test("CCA identity proposal has its own schema and does not mutate CHRiS tenant tables", () => {
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS cca;/);
  for (const table of ["principals", "sessions", "role_assignments", "identity_audit"]) {
    assert.match(sql, new RegExp("CREATE TABLE cca\\." + table + " \\("));
  }
  assert.doesNotMatch(sql, /\b(?:ALTER|DROP|TRUNCATE|DELETE\s+FROM)\s+(?:TABLE\s+)?(?:public\.)?(?:organizations|users|employees|payroll_runs)\b/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO/i);
});

test("CCA identity proposal includes restrictive default and session safety constraints", () => {
  assert.match(sql, /active boolean NOT NULL DEFAULT false/);
  assert.match(sql, /revoked_at timestamptz/);
  assert.match(sql, /token_id_hash bytea NOT NULL UNIQUE/);
  assert.match(sql, /mfa_verified_at timestamptz NOT NULL/);
  assert.match(sql, /REVOKE ALL ON SCHEMA cca FROM PUBLIC/);
  assert.match(sql, /ON DELETE RESTRICT/);
});

test("proposal is never placed under automatic Prisma migrations", () => {
  const relative = "docs/cca/sql/cca_identity_schema_PROPOSAL.sql";
  assert.equal(relative.startsWith("backend/prisma/migrations"), false);
});
