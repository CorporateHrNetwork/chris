"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {PGlite}=require("@electric-sql/pglite");
test("entire historical Prisma migration chain applies on a clean isolated PostgreSQL-compatible database",async()=>{
 const db=new PGlite();
 try{
  const root=path.join(__dirname,"../prisma/migrations");
  const dirs=fs.readdirSync(root).filter(d=>fs.existsSync(path.join(root,d,"migration.sql"))).sort();
  assert.ok(dirs.length>=76,"Expected historical migrations are missing");
  assert.equal(dirs.at(-1),"20261018010000_billing_foundation");
  for(const name of dirs){
   const sql=fs.readFileSync(path.join(root,name,"migration.sql"),"utf8");
   try{await db.exec(sql)}catch(error){throw new Error("Migration "+name+" failed: "+error.message,{cause:error})}
  }
  const tables=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'billing_%' ORDER BY tablename");
  assert.deepEqual(tables.rows.map(r=>r.tablename),["billing_invoices","billing_payments","billing_subscriptions"]);
  const constraints=await db.query("SELECT conname FROM pg_constraint WHERE conname LIKE 'billing_%' AND contype='f'");
  assert.ok(constraints.rows.length>=5,"Tenant-aware billing foreign keys missing");
 }finally{await db.close()}
});
