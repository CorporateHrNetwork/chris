'use strict';
const express=require('express');
const crypto=require('crypto');
const prisma=require('../config/prisma');
const {calculateQuote,PLANS}=require('../services/subscriptionPricing');
const {pdfInvoice}=require('../services/subscriptionInvoicePdf');
const {requireAuth}=require('../middleware/authMiddleware');
const {PLATFORM_SLUG,getPlatformOrganization}=require('../services/commercialLeadService');
const router=express.Router();
const enabled=(req,res,next)=>process.env.CHRIS_PUBLIC_SUBSCRIPTIONS_ENABLED==='true'?next():res.status(503).json({status:'unavailable',message:'Subscription invoices are not enabled yet'});
const emailOk=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<255;
const clean=s=>String(s||'').trim();
const ENTITY='ChrisSubscriptionInvoice';
async function events(org,id){
 const rows=await prisma.organizationAudit.findMany({where:{organizationId:org,entityType:ENTITY,entityId:id},orderBy:{createdAt:'asc'}});
 if(!rows.length)return null;
 return rows.reduce((a,r)=>({...a,...r.newValue}),{});
}
async function sendInvoice(invoice,pdf){
 if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM)return {status:'PENDING_CONFIGURATION'};
 const attachments=[{filename:invoice.invoiceNumber+'.pdf',content:pdf.toString('base64')}];
 const body={from:process.env.RESEND_FROM,to:[invoice.billingEmail],subject:'CHRiS Pro Forma Invoice '+invoice.invoiceNumber,
 text:'Thank you for selecting CHRiS '+invoice.quote.planId+'. Invoice '+invoice.invoiceNumber+' is attached. Payment is subject to independent verification.',attachments};
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)throw new Error('Email provider rejected invoice delivery: '+r.status);
 const internalEmail=process.env.CHRIS_BILLING_NOTIFICATION_EMAIL;
 if(internalEmail && emailOk(internalEmail)) {
   const adminBody={...body,to:[internalEmail],subject:'CHRiS client selection '+invoice.invoiceNumber};
   const adminResponse=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(adminBody)});
   if(!adminResponse.ok) console.error('[subscription-invoice] billing notification delivery failed',adminResponse.status);
 }
 return {status:'SENT'};
}
router.get('/catalogue',enabled,(req,res)=>res.json({plans:PLANS,vatBasisPoints:750}));
router.post('/quotes',enabled,(req,res)=>{
 try{
 const count=Number(req.body?.employeeCount);
 const q=calculateQuote({planId:req.body?.planId,employeeCount:count,includeEss:req.body?.includeEss!==false});
 res.json({quote:q});
 }catch(e){res.status(400).json({error:e.message});}
});
const recent=new Map();
router.post('/invoice-requests',enabled,async(req,res)=>{
 try{
 const companyName=clean(req.body?.companyName).slice(0,160),billingEmail=clean(req.body?.billingEmail).toLowerCase();
 if(companyName.length<2||!emailOk(billingEmail)||req.body?.consent!==true)return res.status(400).json({error:'Valid company, billing email and consent are required'});
 const employeeCount=Number(req.body?.employeeCount);
 const quote=calculateQuote({planId:req.body?.planId,employeeCount,includeEss:req.body?.includeEss!==false,waiveOnboarding:false});
 if(employeeCount>100000)return res.status(400).json({error:'Employee count exceeds self-service limit'});
 const key=crypto.createHash('sha256').update(billingEmail+':'+String(req.ip)).digest('hex');
 if(recent.get(key)&&Date.now()-recent.get(key)<60000)return res.status(429).json({error:'Please avoid repeated submissions'});
 recent.set(key,Date.now());
 const organization=await getPlatformOrganization(prisma);
 const issuedAt=new Date().toISOString();
 const invoiceNumber='CHRIS-PF-'+issuedAt.slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(6).toString('hex').toUpperCase();
 const invoice={invoiceNumber,companyName,billingEmail,issuedAt,quote,status:'AWAITING_PAYMENT',emailStatus:'PENDING'};
 await prisma.organizationAudit.create({data:{organizationId:organization.id,entityType:ENTITY,entityId:invoiceNumber,action:'INVOICE_REQUESTED',newValue:invoice}});
 let emailStatus='PENDING_CONFIGURATION';
 try{emailStatus=(await sendInvoice(invoice,pdfInvoice(invoice))).status;}catch(err){console.error('[subscription-invoice] delivery failure',err.message);emailStatus='FAILED';}
 await prisma.organizationAudit.create({data:{organizationId:organization.id,entityType:ENTITY,entityId:invoiceNumber,action:'EMAIL_DELIVERY_ATTEMPT',newValue:{emailStatus}}});
 return res.status(201).json({invoiceNumber,status:invoice.status,emailStatus,total:quote.total});
 }catch(e){console.error('[subscription-invoice] request failure',e.message);return res.status(500).json({error:'Invoice request could not be completed'});}
});
router.use('/internal',requireAuth,async(req,res,next)=>{
 if(req.auth?.organization?.slug!==PLATFORM_SLUG)return res.status(403).json({error:'Platform access required'});
 if(!new Set(req.auth?.permissions||[]).has('settings.view'))return res.status(403).json({error:'Commercial permission required'});
 next();
});
router.get('/internal/invoices/:number/pdf',enabled,async(req,res)=>{
 const org=await getPlatformOrganization(prisma);
 const invoice=await events(org.id,req.params.number);
 if(!invoice)return res.status(404).json({error:'Invoice not found'});
 res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+invoice.invoiceNumber+'.pdf"'}).send(pdfInvoice(invoice));
});
router.post('/internal/invoices/:number/confirm-payment',enabled,async(req,res)=>{
 try{
 if(clean(req.body?.verificationReference).length<5)return res.status(400).json({error:'Payment verification reference required'});
 const org=await getPlatformOrganization(prisma), invoice=await events(org.id,req.params.number);
 if(!invoice)return res.status(404).json({error:'Invoice not found'});
 if(invoice.status!=='AWAITING_PAYMENT')return res.status(409).json({error:'Invoice not eligible for confirmation'});
 await prisma.organizationAudit.create({data:{organizationId:org.id,actorUserId:req.auth.userId,entityType:ENTITY,entityId:invoice.invoiceNumber,action:'PAYMENT_MANUALLY_VERIFIED',reason:clean(req.body.verificationReference).slice(0,200),newValue:{status:'PAID',verifiedAt:new Date().toISOString()}}});
 return res.json({invoiceNumber:invoice.invoiceNumber,status:'PAID',subscriptionActivation:'NOT_AUTOMATIC'});
 }catch(e){return res.status(500).json({error:'Unable to record verification'});}
});
module.exports=router;
