const express=require('express');
const prisma=require('../config/prisma');
const {requireAuth,requireEssAuth}=require('../middleware/authMiddleware');
const s=require('../services/simpleDisciplinaryService');
const p=require('../services/simpleDisciplinaryPolicy');
const {appendDisciplinaryEvidence,buildEmploymentDecisionEvidencePack}=require('../services/employmentGovernanceService');
function routerFor(ess=false){
 const router=express.Router();router.use(ess?requireEssAuth:requireAuth);
 const auth=req=>({...ess?req.essAuth:req.auth,ess});
 const handle=fn=>async(req,res)=>{try{res.json({status:'success',data:await fn(req,auth(req))});}catch(e){res.status(e.statusCode||400).json({status:'error',message:e.message,code:e.code||'DISCIPLINARY_WORKFLOW_ERROR'});}};
 router.get('/cases',handle((req,a)=>s.list(prisma,a)));
 router.get('/cases/:id',handle(async(req,a)=>{const {row,s:state,rights}=await s.get(prisma,a,req.params.id);return ess?s.employeeView(row,state):s.adminView(row,state,rights);}));
 router.post('/cases/:id/actions',handle((req,a)=>s.action(prisma,a,req.params.id,req.body||{})));
 router.post('/cases/:id/evidence',handle(async(req,a)=>{
  const c=await s.get(prisma,a,req.params.id);if(ess&&c.s?.stage!=='EMPLOYEE_RESPONSE')throw p.fail('Supporting response evidence can be added while your response is pending.');
  const file=req.body?.attachment;
  if(file){const allowed={'application/pdf':'JVBER','image/jpeg':'/9j/','image/png':'iVBOR'};const data=String(file.dataUrl||'');const prefix=`data:${file.mimeType};base64,`;if(!allowed[file.mimeType]||!data.startsWith(prefix)||!data.slice(prefix.length).startsWith(allowed[file.mimeType])||Buffer.from(data.slice(prefix.length),'base64').length>5*1024*1024)throw p.fail('Upload a valid PDF, JPG or PNG no larger than 5 MB.',400);}
  return appendDisciplinaryEvidence(prisma,{organizationId:a.organizationId,actorUserId:a.userId,caseId:req.params.id,category:ess?'EMPLOYEE_RESPONSE':'OTHER',title:p.required(req.body?.title,'Evidence title'),content:{text:String(req.body?.text||'').slice(0,10000),attachment:file?{fileName:String(file.fileName||'attachment').slice(0,200),mimeType:file.mimeType,dataUrl:file.dataUrl}:null},finalized:true});
 }));
 if(!ess){
  router.get('/tasks',handle(async(req,a)=>({count:(await s.list(prisma,a)).filter(r=>r.workflow?.ownerUserId===a.userId&&r.workflow?.stage!=='CLOSED').length})));
  router.get('/employee-options',handle(async(req,a)=>{
   const dateScope={effectiveFrom:{lte:new Date()},OR:[{effectiveTo:null},{effectiveTo:{gte:new Date()}}]};
   const actor=await prisma.user.findFirst({where:{id:a.userId,organizationId:a.organizationId,isActive:true},include:{userLocations:true}});
   const scope=p.hr(a.roles)&&!p.head(a.roles)?{locationId:{in:(actor?.userLocations||[]).map(l=>l.locationId).filter(id=>!a.activeLocationId||id===a.activeLocationId)}}:p.hr(a.roles)?{...(a.activeLocationId?{locationId:a.activeLocationId}:a.locationScope==='ASSIGNED_LOCATIONS'?{locationId:{in:(a.availableLocations||[]).map(l=>l.id)}}:{})}:{lineManagerAssignments:{some:{managerEmployeeId:a.employeeId||'NO_MANAGER',...dateScope}}};
   return prisma.employee.findMany({where:{organizationId:a.organizationId,...scope},select:{employeeNumber:true,firstName:true,middleName:true,lastName:true},orderBy:{firstName:'asc'}});
  }));
  router.get('/configuration',handle(async(req,a)=>({targets:await s.policy(prisma,a),outcomes:p.OUTCOMES,canConfigure:p.head(a.roles),userId:a.userId})));
  router.put('/configuration',handle((req,a)=>s.configure(prisma,a,req.body?.targets)));
  router.get('/owners',handle(async(req,a)=>{
   const all=await s.roster(prisma,a.organizationId);const actor=all.find(u=>u.id===a.userId);
   const manager=actor?.employeeId?await prisma.employeeLineManagerAssignment.findFirst({where:{organizationId:a.organizationId,managerEmployeeId:actor.employeeId,effectiveFrom:{lte:new Date()},OR:[{effectiveTo:null},{effectiveTo:{gte:new Date()}}]}}):null;
   const accessible=await s.list(prisma,a);const ids=new Set([a.userId,...accessible.flatMap(r=>[r.workflow?.hrOwnerId,r.workflow?.reviewerUserId,r.workflow?.decisionOwnerId,r.workflow?.appealOwnerId])]);
   return all.filter(u=>p.hr(s.roles(actor))||manager||ids.has(u.id)).map(u=>({id:u.id,name:[u.firstName,u.lastName].filter(Boolean).join(' ')||u.email,roles:s.roles(u)}));
  }));
  router.post('/cases',handle((req,a)=>s.create(prisma,a,req.body||{})));
  router.get('/cases/:id/evidence-pack',handle(async(req,a)=>{await s.get(prisma,a,req.params.id);return buildEmploymentDecisionEvidencePack(prisma,a.organizationId,req.params.id);}));
 }
 return router;
}
module.exports={adminRouter:routerFor(),essRouter:routerFor(true)};
