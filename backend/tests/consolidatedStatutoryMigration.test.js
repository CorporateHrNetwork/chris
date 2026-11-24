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
test("reviewed-match migration enforces tenant-safe foreign keys and one verified batch", async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "organizations" ("id" TEXT PRIMARY KEY);
      INSERT INTO "organizations" VALUES ('org1'),('org2');
      CREATE TABLE "employees" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,
         UNIQUE ("organizationId","id"));
      CREATE TABLE "organization_locations" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,
         UNIQUE ("organizationId","id"));
      INSERT INTO "employees" VALUES ('e1','org1'),('e2','org2');
      INSERT INTO "organization_locations" VALUES ('l1','org1'),('l2','org2');
    `);
    const a=fs.readFileSync(path.resolve(__dirname,
      "../prisma/migrations/20261124110000_consolidated_statutory_historical_import/migration.sql"),"utf8");
    const b=fs.readFileSync(path.resolve(__dirname,
      "../prisma/migrations/20261124114500_consolidated_statutory_reviewed_matches/migration.sql"),"utf8");
    await db.exec(a);await db.exec(b);await db.exec(b);
    await db.exec(`
      INSERT INTO "consolidated_statutory_import_batches"
        ("id","organizationId","reportYear","sourceHash","originalFilename","payload")
        VALUES ('batch1','org1',2026,'h1','a.xlsx','[]'),('batch2','org1',2026,'h2','b.xlsx','[]');
    `);
    const sql=`INSERT INTO "consolidated_statutory_import_matches"
      ("id","organizationId","batchId","sourceId","employeeId","locationId","reviewNote","reviewedByUserId")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;
    await db.query(sql,["match1","org1","batch1","hash:row1","e1","l1","Verified against original HR register","hr"]);
    await assert.rejects(()=>db.query(sql,["match2","org1","batch1","hash:row2","e2","l1","Cross tenant","hr"]),/foreign key/i);
    await assert.rejects(()=>db.query(sql,["match3","org1","batch1","hash:row3","e1","l2","Cross tenant branch","hr"]),/foreign key/i);
    await assert.rejects(()=>db.query(sql,["match4","org1","batch1","hash:row1","e1","l1","Duplicated","hr"]),/unique|duplicate/i);
    await db.exec(`UPDATE "consolidated_statutory_import_batches" SET "status"='VERIFIED' WHERE "id"='batch1';`);
    await assert.rejects(()=>db.exec(`UPDATE "consolidated_statutory_import_batches" SET "status"='VERIFIED' WHERE "id"='batch2';`),/unique|duplicate/i);
  } finally {await db.close();}
});
