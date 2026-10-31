const express=require('express');
const prisma=require('../config/prisma');
const {requireAuth}=require('../middleware/authMiddleware');
const s=require('../services/zermattProbationService');
const p=require('../services/zermattProbationPolicy');
const router=express.Router();
router.use(requireAuth,(req,res,next)=>req.auth.organization?.slug===s.SLUG?next():res.status(404).json({status:'error',message:'Workflow not found.'}));
function error(res,e) { console.error('Probation workflow:',e.message);return res.status(e.statusCode||400).json({status:'error',message:e.message}); }
router.get('/',async(req,res)=>{try{return res.json({status:'success',data:await s.list(prisma,req.auth)});}catch(e){return error(res,e);}});
router.post('/synchronize',async(req,res)=>{try{
  if (!p.hasRole(req.auth.roles,p.HEAD)) return res.status(403).json({status:'error',message:'Head HR authority required.'});
  return res.json({status:'success',data:await s.synchronize(prisma)});
}catch(e){return error(res,e);}});
router.get('/notices',async(req,res)=>{try{
  const visible=new Set((await s.list(prisma,req.auth)).map(r=>r.id));
  const notices=await prisma.$queryRawUnsafe(`SELECT "id","reviewId","message","createdAt","readAt" FROM "zermatt_probation_notices" WHERE "organizationId"=$1 AND "recipientUserId"=$2 AND "readAt" IS NULL ORDER BY "createdAt" DESC`,req.auth.organizationId,req.auth.userId);
  return res.json({status:'success',data:notices.filter(n=>visible.has(n.reviewId))});
}catch(e){return error(res,e);}});
router.post('/notices/:id/read',async(req,res)=>{try{
  await prisma.$executeRawUnsafe(`UPDATE "zermatt_probation_notices" SET "readAt"=CURRENT_TIMESTAMP WHERE "organizationId"=$1 AND "recipientUserId"=$2 AND "id"=$3`,req.auth.organizationId,req.auth.userId,req.params.id);
  return res.json({status:'success'});
}catch(e){return error(res,e);}});
router.post('/:id/:action',async(req,res)=>{try{return res.json({status:'success',data:await s.change(prisma,req.auth,req.params.id,req.params.action,req.body||{})});}catch(e){return error(res,e);}});
module.exports=router;
