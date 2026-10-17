"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessStaging}=require("../scripts/billing-staging-preflight.cjs");
const base={CHRIS_ENVIRONMENT:"staging",CHRIS_BILLING_STAGING_APPROVED:"true",DATABASE_URL:"postgresql://test:secret@staging-db.invalid/chris_billing_staging",CHRIS_BILLING_STAGING_DB_FINGERPRINT:"staging-verified-by-operator",CHRIS_BILLING_STAGING_BACKUP_VERIFIED:"true"};
test("billing staging preflight fails closed without approvals",()=>{
 const r=assessStaging({});
 assert.equal(r.ready,false);assert.ok(r.errors.length>=4);
});
test("billing staging preflight rejects production-like database names",()=>{
 for(const name of ["postgres","chris","zermatt","production"]){
  assert.equal(assessStaging({...base,DATABASE_URL:"postgresql://test:secret@staging-db.invalid/"+name}).ready,false);
 }
});
test("billing staging preflight accepts only explicitly identified and approved isolated staging configuration",()=>{
 assert.equal(assessStaging(base).ready,true);
 assert.equal(assessStaging({...base,CHRIS_ENVIRONMENT:"production"}).ready,false);
 assert.equal(assessStaging({...base,CHRIS_BILLING_STAGING_BACKUP_VERIFIED:""}).ready,false);
});
