"use strict";
// Independent local CCA audit ledger PROTOTYPE. The HMAC key must be supplied
// by a trusted caller and stored separately from the ledger file.
// No filesystem concurrency / immutable remote anchor: not production audit.
const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const MAX=1024*1024;
function createAuditLedger({file,key,clock=()=>new Date().toISOString()}) {
  if(typeof file!=="string" || !path.isAbsolute(file) ||
     !Buffer.isBuffer(key) || key.length!==32)throw Error("CCA_AUDIT_CONFIG_REQUIRED");
  const sign=(entry)=>crypto.createHmac("sha256",key).update(JSON.stringify(entry)).digest("hex");
  const read=()=>{
    if(!fs.existsSync(file))return [];
    const content=fs.readFileSync(file,"utf8");
    if(Buffer.byteLength(content)>MAX)throw Error("CCA_AUDIT_TOO_LARGE");
    if(!content)return [];
    if(!content.endsWith("\n"))throw Error("CCA_AUDIT_TRUNCATED");
    const rows=content.trimEnd().split("\n").map(line=>JSON.parse(line));
    let previous="GENESIS";
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(!row || row.sequence!==i+1 || row.previous!==previous ||
         !row.payload || typeof row.mac!=="string")throw Error("CCA_AUDIT_CHAIN_INVALID");
      const entry={sequence:row.sequence,previous:row.previous,payload:row.payload};
      const expected=sign(entry);
      if(!/^[a-f0-9]{64}$/.test(row.mac) ||
         !crypto.timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(row.mac,"hex")))
        throw Error("CCA_AUDIT_SIGNATURE_INVALID");
      previous=row.mac;
    }
    return rows;
  };
  function append({event,actor,target}) {
    if(typeof event!=="string"||!/^CCA_[A-Z_]{3,50}$/.test(event) ||
       typeof actor!=="string"||actor.length<1||actor.length>100||
       typeof target!=="string"||target.length<1||target.length>100)
      throw Error("CCA_AUDIT_INVALID_EVENT");
    const rows=read(),previous=rows.length?rows[rows.length-1].mac:"GENESIS";
    const entry={sequence:rows.length+1,previous,payload:{event,actor,target,time:clock()}};
    const signed={...entry,mac:sign(entry)};
    const next=JSON.stringify(signed)+"\n";
    if(Buffer.byteLength(next)+Buffer.byteLength(rows.map(r=>JSON.stringify(r)+"\n").join(""))>MAX)
      throw Error("CCA_AUDIT_TOO_LARGE");
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    // Single-writer offline test use only. No concurrent append contract.
    const fd=fs.openSync(file,"a",0o600);
    try{fs.writeSync(fd,next);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    return {sequence:signed.sequence,mac:signed.mac};
  }
  return Object.freeze({verify:()=>({ok:true,count:read().length,tip:read().at(-1)?.mac||"GENESIS"}),append});
}
module.exports={createAuditLedger};
