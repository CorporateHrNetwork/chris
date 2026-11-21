// Mocked route smoke tests only. No production database, email or WhatsApp calls.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const path = require("path");
const fixtures = { enabled: false, reactions: [], comments: [], audits: [] };
const postId = "news-one";
const orgId = "tenant-one";
const employeeId = "employee-one";
const prisma = {
  $queryRawUnsafe: async (sql, ...args) => {
    if (sql.includes('FROM "internal_news_posts" n')) {
      return args[0] === orgId && args[1] === postId
        ? [{ id:postId, category:"PROMOTION", title:"Staff Promotion", enabled:fixtures.enabled, recognizedEmployeeId:null, notifyByEmail:false }] : [];
    }
    if (sql.includes('FROM "internal_news_posts" WHERE')) {
      return args[0] === orgId && args[1] === postId ? [{ id:postId, category:"PROMOTION", status:"PUBLISHED" }] : [];
    }
    if (sql.includes('FROM "internal_news_reactions"') && sql.includes("GROUP BY")) {
      return fixtures.reactions.filter(x=>x.org===args[0] && x.post===args[1]).map(x=>({ reaction:x.choice,count:1 }));
    }
    if (sql.includes('FROM "internal_news_reactions"') && sql.includes('"employeeId"=$3')) {
      return fixtures.reactions.filter(x=>x.org===args[0] && x.post===args[1] && x.employee===args[2]).map(x=>({reaction:x.choice}));
    }
    if (sql.includes('FROM "internal_news_comments" c') && sql.includes('JOIN "employees"')) {
      return fixtures.comments.filter(x=>x.org===args[0] && x.post===args[1] && !x.hidden).map(x=>({
        id:x.id, parentId:null, body:x.body, createdAt:new Date(),employeeId:x.employee,firstName:"Staff",lastName:"Member"
      }));
    }
    if (sql.includes('FROM "internal_news_comments" WHERE') && sql.includes('INTERVAL')) return [];
    if (sql.includes('FROM "internal_news_engagement_settings"')) return [];
    if (sql.includes('FROM "employees"')) return [];
    return [];
  },
  $executeRawUnsafe: async (sql, ...args) => {
    if (sql.includes('INSERT INTO "internal_news_reactions"')) {
      fixtures.reactions = fixtures.reactions.filter(x=>!(x.org===args[1]&&x.post===args[2]&&x.employee===args[3]));
      fixtures.reactions.push({org:args[1],post:args[2],employee:args[3],choice:args[4]});return 1;
    }
    if (sql.includes('DELETE FROM "internal_news_reactions"')) {
      fixtures.reactions=fixtures.reactions.filter(x=>!(x.org===args[0]&&x.post===args[1]&&x.employee===args[2]));return 1;
    }
    if (sql.includes('INSERT INTO "internal_news_comments"')) {
      fixtures.comments.push({id:args[0],org:args[1],post:args[2],employee:args[3],body:args[5],hidden:false});return 1;
    }
    if (sql.includes('UPDATE "internal_news_comments"')) {
      const matches=fixtures.comments.filter(x=>x.id===args[0] && x.org===args[1]&&x.post===args[2]);
      for(const x of matches){if(args.length===4 && typeof args[3]==="boolean") x.hidden=args[3]; else if(x.employee===args[3]) x.hidden=true;}
      return matches.length;
    }
    if (sql.includes('INSERT INTO "internal_news_engagement_settings"')) {fixtures.enabled=args[2];return 1;}
    return 0;
  },
  organizationAudit:{create:async({data})=>{fixtures.audits.push(data);}}
};
const p = require.resolve("../src/config/prisma");
require.cache[p]={id:p,filename:p,loaded:true,exports:prisma};
const m = require.resolve("../src/middleware/authMiddleware");
const pseudoAuth=(req,_res,next)=> {
  req.auth={organizationId:req.headers["x-tenant"]||orgId,userId:"hr-user"};
  req.essAuth={organizationId:req.headers["x-tenant"]||orgId,userId:"user-one",employeeId:req.headers["x-employee"]||employeeId};
  next();
};
require.cache[m]={id:m,filename:m,loaded:true,exports:{requireAuth:pseudoAuth,requireEssAuth:pseudoAuth,requirePermission:()=>pseudoAuth}};
const {essRouter,adminRouter}=require("../src/routes/internalNewsEngagementRoutes");

test("announcement engagement is opt-in, tenant-scoped, and supports reactions/comments",async()=>{
  const app=express();app.use(express.json());
  app.use("/api/ess/news-engagement",essRouter);app.use("/api/news-engagement",adminRouter);
  const server=await new Promise(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  const origin="http://127.0.0.1:"+server.address().port;
  const request=async(path,method="GET",body,headers={})=>{
    const response=await fetch(origin+path,{method,headers:{"Content-Type":"application/json",...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,json:await response.json()};
  };
  try{
    const path="/api/ess/news-engagement/"+postId;
    assert.equal((await request(path)).json.data.enabled,false);
    assert.equal((await request(path+"/reaction","PUT",{reaction:"LIKE"})).status,403);
    fixtures.enabled=true;
    const foreign=await request(path,"GET",undefined,{"x-tenant":"tenant-other"});
    assert.equal(foreign.status,404);
    assert.equal((await request(path+"/reaction","PUT",{reaction:"CELEBRATE"},{"x-tenant":"tenant-other"})).status,403);
    const reaction=await request(path+"/reaction","PUT",{reaction:"CELEBRATE"});
    assert.equal(reaction.status,200);
    assert.equal(reaction.json.data.myReaction,"CELEBRATE");
    assert.equal(fixtures.reactions.length,1);
    assert.equal((await request(path+"/comments","POST",{body:"x".repeat(1001)})).status,400);
    const posted=await request(path+"/comments","POST",{body:"Congratulations on your promotion!"});
    assert.equal(posted.status,201);
    assert.equal(posted.json.data.comments.length,1);
    const commentId=posted.json.data.comments[0].id;
    assert.equal((await request(path+"/comments/"+commentId,"DELETE",undefined,{"x-employee":"other-employee"})).status,200);
    assert.equal(fixtures.comments[0].hidden,false);
    assert.equal((await request(path+"/comments/"+commentId,"DELETE")).status,200);
    assert.equal(fixtures.comments[0].hidden,true);
    assert.equal((await request(path+"/reaction","PUT",{reaction:"NONE"})).status,200);
    assert.equal(fixtures.reactions.length,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
