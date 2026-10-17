"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const migration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261018010000_billing_foundation/migration.sql"), "utf8");
test("billing migration enforces tenant relationships and money constraints in isolated PostgreSQL", async () => {
 const db = new PGlite();
 try {
  await db.exec('CREATE TABLE "organizations" ("id" TEXT PRIMARY KEY)');
  await db.exec(migration);
  await db.query('INSERT INTO "organizations" ("id") VALUES ($1),($2)', ["tenant-a","tenant-b"]);
  await db.query('INSERT INTO "billing_subscriptions" ("id","organizationId","planCode","contractedSeats","annualAmountMinor","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())', ["sub-a","tenant-a","PREMIUM",320,1000000000]);
  const invoice = 'INSERT INTO "billing_invoices" ("id","organizationId","subscriptionId","invoiceNumber","subtotalMinor","totalMinor","lineItems","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())';
  await db.query(invoice,["invoice-a","tenant-a","sub-a","INV-A",10000,10000,"[]"]);
  await assert.rejects(db.query(invoice,["invoice-b","tenant-b","sub-a","INV-B",10000,10000,"[]"]));
  await assert.rejects(db.query(invoice,["invoice-neg","tenant-a","sub-a","INV-NEG",-1,-1,"[]"]));
  const payment='INSERT INTO "billing_payments" ("id","organizationId","invoiceId","amountMinor") VALUES ($1,$2,$3,$4)';
  await db.query(payment,["payment-a","tenant-a","invoice-a",10000]);
  await assert.rejects(db.query(payment,["payment-b","tenant-b","invoice-a",10000]));
  await assert.rejects(db.query(payment,["payment-neg","tenant-a","invoice-a",-1]));
  const result=await db.query('SELECT count(*)::int AS count FROM "billing_payments"');
  assert.equal(result.rows[0].count,1);
 } finally { await db.close(); }
});
