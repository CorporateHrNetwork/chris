"use strict";
// Standalone CCA source throttle prototype. Callers MUST supply a server-
// verified peer identifier, not X-Forwarded-For or any browser-provided ID.
// This isolated component has no HTTP or CHRiS production integration.
const crypto = require("node:crypto");
function createSourceThrottle({ clock = () => Math.floor(Date.now()/1000), windowSeconds=300,
  maxAttempts=10, maxSources=500 }={}) {
  const buckets=new Map();
  if(!Number.isSafeInteger(windowSeconds)||windowSeconds<1||
     !Number.isSafeInteger(maxAttempts)||maxAttempts<1||
     !Number.isSafeInteger(maxSources)||maxSources<1)throw Error("CCA_THROTTLE_BAD_CONFIG");
  function sourceKey(peerId) {
    if(typeof peerId!=="string" || peerId.length<1 || peerId.length>256)
      throw Error("CCA_TRUSTED_PEER_REQUIRED");
    return crypto.createHash("sha256").update(peerId).digest("hex");
  }
  function expireBuckets(now) {
    // Sweep before enforcing capacity: otherwise stale entries can deny all
    // new trusted peers until those expired peers happen to return.
    for(const [key,item] of buckets) {
      if(now>=item.resetAt) buckets.delete(key);
    }
  }
  function limit(peerId) {
    const key=sourceKey(peerId), now=clock();
    if(!Number.isFinite(now)) throw Error("CCA_THROTTLE_BAD_CLOCK");
    expireBuckets(now);
    let item=buckets.get(key);
    if(!item){
      // Resource exhaustion must fail closed. Do not evict active blocked
      // sources to make room for an attacker to reset their count.
      if(buckets.size>=maxSources)return {allowed:false,retryAfterSeconds:windowSeconds};
      item={failures:0,resetAt:now+windowSeconds};buckets.set(key,item);
    }
    if(item.failures>=maxAttempts)
      return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil(item.resetAt-now))};
    return {allowed:true,retryAfterSeconds:0};
  }
  function recordFailure(peerId) {
    const previous=limit(peerId);
    if(!previous.allowed)return previous;
    const item=buckets.get(sourceKey(peerId));item.failures++;
    return limit(peerId);
  }
  return Object.freeze({limit,recordFailure});
}
module.exports={createSourceThrottle};
