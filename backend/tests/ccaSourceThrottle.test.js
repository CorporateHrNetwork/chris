"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createSourceThrottle}=require("../../tools/cca-local-demo/sourceThrottle");
test("source throttle blocks repeated failures without trusting user account fields",()=>{
 let now=1000;
 const limiter=createSourceThrottle({clock:()=>now,maxAttempts:3,windowSeconds:60});
 assert.equal(limiter.limit("peer-a").allowed,true);
 limiter.recordFailure("peer-a");limiter.recordFailure("peer-a");
 assert.equal(limiter.limit("peer-a").allowed,true);
 assert.equal(limiter.recordFailure("peer-a").allowed,false);
 assert.equal(limiter.limit("peer-b").allowed,true);
 now+=61;
 assert.equal(limiter.limit("peer-a").allowed,true);
});
test("source limit fails closed when the number of tracked peers is exhausted",()=>{
 const limiter=createSourceThrottle({maxAttempts:2,maxSources:2});
 assert.equal(limiter.limit("peer-a").allowed,true);
 assert.equal(limiter.limit("peer-b").allowed,true);
 assert.equal(limiter.limit("peer-c").allowed,false);
 assert.throws(()=>limiter.limit(""),/TRUSTED_PEER_REQUIRED/);
 assert.throws(()=>limiter.recordFailure(null),/TRUSTED_PEER_REQUIRED/);
});
test("expired peer buckets are reclaimed before new source admission",()=>{
 let now=1000;
 const limiter=createSourceThrottle({clock:()=>now,maxSources:2,maxAttempts:1,windowSeconds:60});
 assert.equal(limiter.recordFailure("peer-a").allowed,false);
 assert.equal(limiter.recordFailure("peer-b").allowed,false);
 assert.equal(limiter.limit("peer-c").allowed,false);
 now+=60;
 assert.equal(limiter.limit("peer-c").allowed,true);
 assert.equal(limiter.limit("peer-a").allowed,true);
 assert.equal(limiter.limit("peer-d").allowed,false);
});
test("invalid clock fails closed rather than corrupting expiry state",()=>{
 const limiter=createSourceThrottle({clock:()=>NaN});
 assert.throws(()=>limiter.limit("peer-a"),/CCA_THROTTLE_BAD_CLOCK/);
});
