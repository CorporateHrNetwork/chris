const express=require('express');
const XLSX=require('xlsx');
const prisma=require('../config/prisma');
const {requireAuth}=require('../middleware/authMiddleware');
const {isZermatt}=require('../services/zermattHrFinancialAccessService');
const service=require('../services/zermattMidmonthService').createService(prisma,{benefitsOnly:true});
const {invalid}=require('../services/zermattMidmonthDomain');
const router=express.Router();
router.use(requireAuth,(req,res,next)=>isZermatt(req)?next():res.status(403).json({status:'error',message:'This portal is restricted to Zermatt.'}));
const sendError=(res,e)=>res.status(e.statusCode||500).json({status:'error',code:e.code||'MIDMONTH_ERROR',message:e.statusCode?e.message:'Unable to complete the transport benefit operation.',...(e.details?{details:e.details}:{})});
const ready=()=>{if(process.env.CHRIS_ZERMATT_SPLIT_PAYROLL_RELEASE_READY!=='true')invalid('Transport benefit processing is awaiting verified deployment.');};
router.get('/',async(req,res)=>{try{return res.json({status:'success',data:{...await service.list(req.auth.organizationId,req.auth.userId),releaseReady:process.env.CHRIS_ZERMATT_SPLIT_PAYROLL_RELEASE_READY==='true'}});}catch(e){return sendError(res,e);}});
router.get('/readiness',async(req,res)=>{try{return res.json({status:'success',data:await service.getPreparationReadiness(req.auth.organizationId,req.auth.userId,req.query.periodMonth)});}catch(e){return sendError(res,e);}});
router.post('/activate',async(req,res)=>{try{ready();return res.json({status:'success',data:await service.activate(req.auth.organizationId,req.auth.userId,req.body?.periodMonth)});}catch(e){return sendError(res,e);}});
router.post('/runs',async(req,res)=>{try{ready();return res.status(201).json({status:'success',data:{runId:await service.generate(req.auth.organizationId,req.auth.userId,req.body?.periodMonth)}});}catch(e){return sendError(res,e);}});
router.get('/runs/:id',async(req,res)=>{try{return res.json({status:'success',data:await service.detail(req.auth.organizationId,req.auth.userId,req.params.id)});}catch(e){return sendError(res,e);}});
router.patch('/runs/:id/lines/:lineId/benefit-inputs',async(req,res)=>{try{ready();return res.json({status:'success',data:await service.saveBenefitInputs(req.auth.organizationId,req.auth.userId,req.params.id,req.params.lineId,req.body?.inputs||{},req.body?.notes)});}catch(e){return sendError(res,e);}});
router.post('/runs/:id/action',async(req,res)=>{try{ready();return res.json({status:'success',data:await service.decide(req.auth.organizationId,req.auth.userId,req.params.id,req.body?.action,req.body?.notes,req.body?.payments)});}catch(e){return sendError(res,e);}});
router.get('/runs/:id/export',async(req,res)=>{
 try {
  const data=await service.detail(req.auth.organizationId,req.auth.userId,req.params.id);
  if(!data.responsibilities.includes('HEAD_HR'))invalid('The assigned Head HR prepares and exports this benefit register.',403);
  const external=['external','payout'].includes(req.query.stage);
  const approved=['APPROVED','PAID'].includes(data.run.status);
  if(external&&!approved)invalid('Head HR approval is required before external-workflow export.');
  for(const line of data.lines) {
   const bank=line.snapshot.paymentDetails||{};
   if(external&&Number(line.netPay)>0&&(!bank.bankName||!bank.accountName||!bank.accountNumber))invalid('Complete payment details and regenerate the draft before approval.');
  }
  const workbook=XLSX.utils.book_new();
  const indexes=require('../services/payrollRegisterExport').appendRegisterSheets(workbook,{
   ...data.register,columns:req.query.columns,branchIndex:1,employeeIndex:2,serialIndex:0,masterName:'Transport Support Pay',
  });
  const selected=indexes.length<data.register.headers.length;
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
   ['Benefit stage',data.run.status],
   ['Selected columns',indexes.map(i=>data.register.headers[i]).join(', ')],
   ['Export stage',external?'HEAD HR APPROVED — FOR EXTERNAL APPROVAL':'DRAFT REVIEW — NOT APPROVED'],
   ['Workflow','Head HR prepares and approves in CHRiS; Auditor → General Manager → Chief Accountant approvals and payment processing occur externally.'],
   ['Payment date',`${new Date(data.run.periodMonth).toISOString().slice(0,7)}-15`],
   ['Net basis','Mid-Month + Bonus + approved Overtime/Ph Pay + Previous Month Short Payment − applied overpayment deduction. End of the Month is a reference only.'],
   ['Extra / PH days','Reference counts. Overtime/Ph Pay is the approved benefit amount entered by Head HR; days do not automatically create a payment.'],
   ['Overpayment control','Previous Month Overpayment is the opening balance. Deduction is capped at available benefit pay; remaining overpayment carries forward. See Reconciliation.'],
   ['Payment control','This export does not confirm external approval or payment. Record actual receipts, including explicit zero payments, after the external process.'],
   ['Loan recovery',0],
  ]),'Controls');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
   ['Stage','Name','Signature','Date','Decision / Reference'],
   ['Head HR — Prepared and Approved','','','',''],
   ['Auditor — External Review','','','',''],
   ['General Manager — External Approval','','','',''],
   ['Chief Accountant — External Payment Processing','','','',''],
  ]),'External Approvals');
  if(!selected)XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
   ['EmployeeNO','FullName','Opening Overpayment','Applied Deduction','Remaining Overpayment','Actual Paid','Payment Reference'],
   ...data.lines.map(line=>{const s=line.snapshot;return [s.employeeNumber,s.employeeName,Number(s.previousOverpaid||0),Number(s.overpaidDeduction||0),Number(s.overpaidRemaining||0),line.actualPaid==null?'':Number(line.actualPaid),line.paymentReference||''];}),
  ]),'Reconciliation');
  await service.recordExternalExport(req.auth.organizationId,req.auth.userId,req.params.id,external?'external':'review');
  res.setHeader('Content-Disposition',`attachment; filename="CHRiS_Transport_Support_${new Date(data.run.periodMonth).toISOString().slice(0,7)}_${external?'External_Approval':'Draft_Review'}.xlsx"`);
  return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
 }catch(e){return sendError(res,e);}
});
module.exports=router;


