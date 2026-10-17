"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {PGlite}=require("@electric-sql/pglite");
test("billing migration preserves populated pre-existing organizations and HR tables",async()=>{
 const db=new PGlite();
 try{
  const root=path.join(__dirname,"../prisma/migrations");
  const dirs=fs.readdirSync(root).filter(d=>fs.existsSync(path.join(root,d,"migration.sql"))).sort();
  const billing="20261018010000_billing_foundation";
  for(const name of dirs.filter(n=>n!==billing)){
   try{await db.exec(fs.readFileSync(path.join(root,name,"migration.sql"),"utf8"))}
   catch(e){throw new Error("Historical migration "+name+": "+e.message,{cause:e})}
  }
  await db.query('INSERT INTO "organizations" ("id","name","slug","updatedAt") VALUES ($1,$2,$3,NOW()),($4,$5,$6,NOW())',["org-z","Zermatt test fixture","zermatt-test-fixture","org-p","Platform test fixture","platform-test-fixture"]);
  const before=await db.query('SELECT "id","name","slug" FROM "organizations" ORDER BY "id"');
  const tableBefore=await db.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
  await db.exec(fs.readFileSync(path.join(root,billing,"migration.sql"),"utf8"));
  const after=await db.query('SELECT "id","name","slug" FROM "organizations" ORDER BY "id"');
  assert.deepEqual(after.rows,before.rows,"Existing organization records changed");
  const tableAfter=await db.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
  assert.equal(tableAfter.rows[0].count,tableBefore.rows[0].count+3);
  await db.query('INSERT INTO "billing_subscriptions" ("id","organizationId","planCode","contractedSeats","annualAmountMinor","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',["draft-z","org-z","PREMIUM",320,1000000000]);
  const z=await db.query('SELECT "status","annualAmountMinor" FROM "billing_subscriptions" WHERE "organizationId"=$1',["org-z"]);
  const p=await db.query('SELECT "id" FROM "billing_subscriptions" WHERE "organizationId"=$1',["org-p"]);
  assert.equal(z.rows[0].status,"DRAFT");assert.equal(String(z.rows[0].annualAmountMinor),"1000000000");
  assert.equal(p.rows.length,0);
 }finally{await db.close()}
});
