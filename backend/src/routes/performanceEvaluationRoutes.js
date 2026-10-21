const express=require("express");
const prisma=require("../config/prisma");
const {requireAuth,requireEssAuth}=require("../middleware/authMiddleware");
const S=require("../services/performanceEvaluationService");
const {generateRoleGoals}=require("../services/performanceEvaluationGoalAgent");
const router=express.Router();
function endpoint(fn){return async(req,res)=>{
  try{return res.json({status:"success",data:await fn(req)});}
  catch(e){const status=e.statusCode||500;if(status===500) console.error("PE request failed:",e.message);
    return res.status(status).json({status:"error",message:status===500?"Unable to complete performance evaluation request.":e.message});}
};}
router.get("/ess",requireEssAuth,endpoint(req=>S.workspace(prisma,req.essAuth,true)));
router.post("/ess/reviews/:id/:action",requireEssAuth,endpoint(req=>{
  if(!["self","manager","follow-up","acknowledge","dispute"].includes(req.params.action)){const e=new Error("Unsupported employee action.");e.statusCode=403;throw e;}
  return S.transition(prisma,req.essAuth,req.params.id,req.params.action,req.body,true);
}));
router.use(requireAuth);
router.get("/workspace",endpoint(req=>S.workspace(prisma,req.auth)));
router.post("/policy/publish",endpoint(req=>S.publishPolicy(prisma,req.auth)));
router.post("/standards/generate",endpoint(req=>S.generateStandards(prisma,req.auth,generateRoleGoals)));
router.put("/standards/:id",endpoint(req=>S.saveTemplate(prisma,req.auth,req.params.id,req.body)));
router.post("/standards/:id/revise",endpoint(req=>S.reviseTemplate(prisma,req.auth,req.params.id)));
router.post("/agent/open",endpoint(req=>{
  if(!S.hrAllowed(req.auth)){const e=new Error("Organization-wide performance management authority is required.");e.statusCode=403;throw e;}
  return S.tick(prisma,req.auth.organizationId,{manual:true,actorUserId:req.auth.userId});
}));
router.post("/reviews/:id/:action",endpoint(req=>S.transition(prisma,req.auth,req.params.id,req.params.action,req.body)));
module.exports=router;

