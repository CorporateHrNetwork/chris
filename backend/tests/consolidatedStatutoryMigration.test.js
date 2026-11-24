"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

test("historical statutory migration is idempotent and tenant/hash/year scoped", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "organizations" ("id" TEXT PRIMARY KEY);');
    await db.exec('INSERT INTO "organizations" ("id") VALUES (\'org1\'),(\'org2\');');
    const migration = fs.readFileSync(path.resolve(__dirname,
      "../prisma/migrations/20261124110000_consolidated_statutory_historical_import/migration.sql"),"utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.query('INSERT INTO "consolidated_statutory_import_batches" ("id","organizationId","reportYear","sourceHash","originalFilename","payload") VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
      ["a","org1",2026,"hash1","source.xlsx","[]"]);
    await db.query('INSERT INTO "consolidated_statutory_import_batches" ("id","organizationId","reportYear","sourceHash","originalFilename","payload") VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
      ["b","org2",2026,"hash1","source.xlsx","[]"]);
    await assert.rejects(() => db.query('INSERT INTO "consolidated_statutory_import_batches" ("id","organizationId","reportYear","sourceHash","originalFilename","payload") VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
      ["c","org1",2026,"hash1","duplicate.xlsx","[]"]), /unique|duplicate/i);
    const result = await db.query('SELECT COUNT(*)::integer AS n FROM "consolidated_statutory_import_batches"');
    assert.equal(result.rows[0].n,2);
  } finally { await db.close(); }
});
