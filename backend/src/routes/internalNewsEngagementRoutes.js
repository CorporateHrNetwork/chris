"use strict";
const express = require("express");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const {requireAuth,requireEssAuth,requirePermission} = require("../middleware/authMiddleware");

const essRouter=express.Router();
const adminRouter=express.Router();
const ALLOWED_CATEGORIES=new Set(["PROMOTION","ANNOUNCEMENT","EVENT"]);
const ALLOWED_REACTIONS=new Set(["LIKE","CELEBRATE","SUPPORT","APPRECIATE"]);

function problem(res,code,message,status=400){return res.status(status).json({status:"error",code,message});}
async function publishedPost(organizationId,postId){
  const rows=await prisma.$queryRawUnsafe(
    `SELECT n."id",n."category",n."title",s."enabled",s."recognizedEmployeeId",s."notifyByEmail"
       FROM "internal_news_posts" n
       LEFT JOIN "internal_news_engagement_settings" s
         ON s."organizationId"=n."organizationId"::text AND s."postId"=n."id"::text
      WHERE n."organizationId"::text=$1 AND n."id"::text=$2 AND n."status"='PUBLISHED'
        AND (n."publishAt" IS NULL OR n."publishAt"<=CURRENT_TIMESTAMP)
        AND (n."expireAt" IS NULL OR n."expireAt">CURRENT_TIMESTAMP)
      LIMIT 1`,String(organizationId),String(postId));
  return rows[0]||null;
}
async function configuredPost(organizationId,postId){
  const rows=await prisma.$queryRawUnsafe(
    'SELECT "id","category","status" FROM "internal_news_posts" WHERE "organizationId"::text=$1 AND "id"::text=$2 LIMIT 1',
    String(organizationId),String(postId));
  return rows[0]||null;
}
async function feed(organizationId,postId,employeeId){
  const [reactions,comments]=await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT "reaction",COUNT(*)::int AS "count" FROM "internal_news_reactions"
       WHERE "organizationId"=$1 AND "postId"=$2 GROUP BY "reaction"`,organizationId,postId),
    prisma.$queryRawUnsafe(
      `SELECT c."id",c."parentId",c."body",c."createdAt",c."employeeId",
        e."firstName",e."lastName"
       FROM "internal_news_comments" c
       JOIN "employees" e ON e."id"::text=c."employeeId" AND e."organizationId"::text=c."organizationId"
       WHERE c."organizationId"=$1 AND c."postId"=$2 AND c."isHidden"=FALSE
       ORDER BY c."createdAt" DESC LIMIT 100`,organizationId,postId)
  ]);
  const own=await prisma.$queryRawUnsafe(
    'SELECT "reaction" FROM "internal_news_reactions" WHERE "organizationId"=$1 AND "postId"=$2 AND "employeeId"=$3 LIMIT 1',
    organizationId,postId,employeeId);
  return {reactions,comments:comments.reverse(),myReaction:own[0]?.reaction||null,myEmployeeId:employeeId};
}

essRouter.get("/:postId",requireEssAuth,async(req,res)=>{
  try{
    const org=String(req.essAuth.organizationId),post=String(req.params.postId);
    const target=await publishedPost(org,post);
    if(!target)return problem(res,"NEWS_NOT_FOUND","Announcement unavailable.",404);
    if(!target.enabled)return res.json({status:"success",data:{enabled:false}});
    return res.json({status:"success",data:{enabled:true,...await feed(org,post,String(req.essAuth.employeeId))}});
  }catch(error){console.error("Engagement feed failed",error);return problem(res,"ENGAGEMENT_UNAVAILABLE","Unable to load engagement.",500);}
});
essRouter.put("/:postId/reaction",requireEssAuth,async(req,res)=>{
  try{
    const org=String(req.essAuth.organizationId),post=String(req.params.postId),employee=String(req.essAuth.employeeId);
    const target=await publishedPost(org,post);
    if(!target||!target.enabled||!ALLOWED_CATEGORIES.has(target.category))return problem(res,"ENGAGEMENT_DISABLED","Engagement is not available on this announcement.",403);
    const choice=String(req.body?.reaction||"").toUpperCase();
    if(choice==="NONE"){
      await prisma.$executeRawUnsafe('DELETE FROM "internal_news_reactions" WHERE "organizationId"=$1 AND "postId"=$2 AND "employeeId"=$3',org,post,employee);
    }else{
      if(!ALLOWED_REACTIONS.has(choice))return problem(res,"INVALID_REACTION","Choose an available reaction.");
      await prisma.$executeRawUnsafe(
        `INSERT INTO "internal_news_reactions" ("id","organizationId","postId","employeeId","reaction")
         VALUES ($1::uuid,$2,$3,$4,$5)
         ON CONFLICT ("organizationId","postId","employeeId")
         DO UPDATE SET "reaction"=EXCLUDED."reaction","updatedAt"=CURRENT_TIMESTAMP`,
         crypto.randomUUID(),org,post,employee,choice);
    }
    return res.json({status:"success",data:await feed(org,post,employee)});
  }catch(error){console.error("Engagement reaction failed",error);return problem(res,"REACTION_FAILED","Unable to save reaction.",500);}
});
essRouter.post("/:postId/comments",requireEssAuth,async(req,res)=>{
  try{
    const org=String(req.essAuth.organizationId),post=String(req.params.postId),employee=String(req.essAuth.employeeId);
    const target=await publishedPost(org,post);
    if(!target||!target.enabled||!ALLOWED_CATEGORIES.has(target.category))return problem(res,"ENGAGEMENT_DISABLED","Comments are not available on this announcement.",403);
    const body=String(req.body?.body||"").trim();
    if(body.length<1||body.length>1000)return problem(res,"INVALID_COMMENT","Comments must contain 1–1000 characters.");
    const recent=await prisma.$queryRawUnsafe(
      `SELECT 1 FROM "internal_news_comments" WHERE "organizationId"=$1 AND "employeeId"=$2
       AND "createdAt">CURRENT_TIMESTAMP - INTERVAL '20 seconds' LIMIT 1`,org,employee);
    if(recent.length)return problem(res,"COMMENT_RATE_LIMIT","You can post another comment shortly.",429);
    const parent=String(req.body?.parentId||"").trim();
    if(parent){
      const existing=await prisma.$queryRawUnsafe(
        'SELECT "id" FROM "internal_news_comments" WHERE "id"::text=$1 AND "organizationId"=$2 AND "postId"=$3 AND "isHidden"=FALSE LIMIT 1',parent,org,post);
      if(!existing.length)return problem(res,"INVALID_PARENT","Reply target unavailable.",404);
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "internal_news_comments" ("id","organizationId","postId","employeeId","parentId","body")
       VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6)`,
      crypto.randomUUID(),org,post,employee,parent||null,body);
    return res.status(201).json({status:"success",data:await feed(org,post,employee)});
  }catch(error){console.error("Engagement comment failed",error);return problem(res,"COMMENT_FAILED","Unable to post comment.",500);}
});
essRouter.delete("/:postId/comments/:id",requireEssAuth,async(req,res)=>{
  try{
    const org=String(req.essAuth.organizationId),post=String(req.params.postId),employee=String(req.essAuth.employeeId);
    await prisma.$executeRawUnsafe(
      'UPDATE "internal_news_comments" SET "isHidden"=TRUE,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"::text=$1 AND "organizationId"=$2 AND "postId"=$3 AND "employeeId"=$4',
      String(req.params.id),org,post,employee);
    return res.json({status:"success"});
  }catch(error){console.error("Delete engagement comment failed",error);return problem(res,"COMMENT_DELETE_FAILED","Unable to remove comment.",500);}
});

adminRouter.get("/recipient-search",requireAuth,requirePermission("employees.view"),async(req,res)=>{
  try{
    const term=String(req.query?.q||"").trim();
    if(term.length<2)return res.json({status:"success",data:[]});
    if(term.length>100)return problem(res,"SEARCH_TOO_LONG","Search term is too long.");
    const escaped=term.replace(/[%_\\]/g,"\\adminRouter.put("/:postId/settings",requireAuth,requirePermission("employees.update"),async(req,res)=>{");
    const matches=await prisma.$queryRawUnsafe(
      `SELECT "id","employeeNumber","firstName","lastName" FROM "employees"
       WHERE "organizationId"::text=$1 AND "status" IN (\'ACTIVE\',\'PROBATION\',\'LEAVE\')
         AND ("employeeNumber" ILIKE $2 OR "firstName" ILIKE $2 OR "lastName" ILIKE $2 OR CONCAT_WS(\' \',"firstName","lastName") ILIKE $2)
       ORDER BY "firstName","lastName" LIMIT 15`,
      String(req.auth.organizationId),"%"+escaped+"%");
    return res.json({status:"success",data:matches});
  }catch(error){console.error("Recipient search failed",error);return problem(res,"RECIPIENT_SEARCH_FAILED","Unable to search employees.",500);}
});
adminRouter.put("/:postId/settings",requireAuth,requirePermission("employees.update"),async(req,res)=>{
  try{
    const org=String(req.auth.organizationId),post=String(req.params.postId);
    const target=await configuredPost(org,post);
    if(!target)return problem(res,"NEWS_NOT_FOUND","Announcement not found.",404);
    const enabled=req.body?.enabled===true;
    if(enabled&&!ALLOWED_CATEGORIES.has(target.category))return problem(res,"ENGAGEMENT_NOT_ALLOWED","Engagement is restricted to nonconfidential announcement categories.",403);
    const current=await prisma.$queryRawUnsafe(
      'SELECT "recognizedEmployeeId" FROM "internal_news_engagement_settings" WHERE "organizationId"=$1 AND "postId"=$2 LIMIT 1',org,post);
    const provided=Object.prototype.hasOwnProperty.call(req.body||{},"recognizedEmployeeId");
    const recipient=provided?(String(req.body.recognizedEmployeeId||"").trim()||null):(current[0]?.recognizedEmployeeId||null);
    if(recipient){
      const employees=await prisma.$queryRawUnsafe(
        'SELECT "id" FROM "employees" WHERE "id"::text=$1 AND "organizationId"::text=$2 LIMIT 1',recipient,org);
      if(!employees.length)return problem(res,"EMPLOYEE_NOT_FOUND","The selected recipient does not belong to this organization.",404);
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "internal_news_engagement_settings"
       ("organizationId","postId","enabled","recognizedEmployeeId","notifyByEmail","updatedByUserId")
       VALUES ($1,$2,$3,$4,FALSE,$5)
       ON CONFLICT ("organizationId","postId") DO UPDATE SET
       "enabled"=EXCLUDED."enabled","recognizedEmployeeId"=EXCLUDED."recognizedEmployeeId",
       "updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP`,
       org,post,enabled,recipient,String(req.auth.userId));
    await prisma.organizationAudit.create({
      data:{organizationId:req.auth.organizationId,actorUserId:req.auth.userId,
        entityType:"InternalNewsPost",entityId:post,action:enabled?"NEWS_ENGAGEMENT_ENABLED":"NEWS_ENGAGEMENT_DISABLED",
        newValue:{enabled,recognizedEmployeeId:recipient,notifyByEmail:false},reason:"Internal communications engagement configuration"}
    });
    return res.json({status:"success",data:{enabled,recognizedEmployeeId:recipient,notifyByEmail:false}});
  }catch(error){console.error("Engagement settings failed",error);return problem(res,"ENGAGEMENT_SETTINGS_FAILED","Unable to update engagement settings.",500);}
});
adminRouter.get("/:postId/moderation",requireAuth,requirePermission("employees.view"),async(req,res)=>{
  try{
    const org=String(req.auth.organizationId),post=String(req.params.postId);
    const target=await configuredPost(org,post);
    if(!target)return problem(res,"NEWS_NOT_FOUND","Announcement not found.",404);
    const [settings,comments]=await Promise.all([
      prisma.$queryRawUnsafe(
        'SELECT "enabled","recognizedEmployeeId","notifyByEmail" FROM "internal_news_engagement_settings" WHERE "organizationId"=$1 AND "postId"=$2 LIMIT 1',org,post),
      prisma.$queryRawUnsafe(
        `SELECT c."id",c."parentId",c."body",c."isHidden",c."createdAt",c."employeeId",
           e."firstName",e."lastName" FROM "internal_news_comments" c
           JOIN "employees" e ON e."id"::text=c."employeeId" AND e."organizationId"::text=c."organizationId"
           WHERE c."organizationId"=$1 AND c."postId"=$2
           ORDER BY c."createdAt" DESC LIMIT 250`,org,post)
    ]);
    return res.json({status:"success",data:{settings:settings[0]||{enabled:false,notifyByEmail:false},comments}});
  }catch(error){console.error("Engagement moderation feed failed",error);return problem(res,"MODERATION_FEED_FAILED","Unable to load engagement moderation.",500);}
});

adminRouter.patch("/:postId/comments/:id/hide",requireAuth,requirePermission("employees.update"),async(req,res)=>{
  try{
    const org=String(req.auth.organizationId),post=String(req.params.postId),id=String(req.params.id);
    const result=await prisma.$executeRawUnsafe(
      'UPDATE "internal_news_comments" SET "isHidden"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"::text=$1 AND "organizationId"=$2 AND "postId"=$3',
      id,org,post,req.body?.hidden!==false);
    if(!result)return problem(res,"COMMENT_NOT_FOUND","Comment not found.",404);
    await prisma.organizationAudit.create({
      data:{organizationId:req.auth.organizationId,actorUserId:req.auth.userId,
        entityType:"InternalNewsComment",entityId:id,action:req.body?.hidden!==false?"NEWS_COMMENT_HIDDEN":"NEWS_COMMENT_RESTORED",
        newValue:{postId:post,isHidden:req.body?.hidden!==false},reason:"Internal communications engagement moderation"}
    });
    return res.json({status:"success"});
  }catch(error){console.error("Engagement moderation failed",error);return problem(res,"MODERATION_FAILED","Unable to moderate comment.",500);}
});

module.exports={essRouter,adminRouter};
