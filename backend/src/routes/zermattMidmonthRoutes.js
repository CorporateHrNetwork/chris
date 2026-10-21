const express=require('express');
const XLSX=require('xlsx');
const prisma=require('../config/prisma');
const {requireAuth}=require('../middleware/authMiddleware');
const {isZermatt}=require('../services/zermattHrFinancialAccessService');
const service=require('../services/zermattMidmonthService').createService(prisma);
const {invalid}=require('../services/zermattMidmonthDomain');
const router=express.Router();
router.use(requireAuth,(req,res,next)=>isZermatt(req)?next():res.status(403).json({status:'error',message:'This portal is restricted to Zermatt.'}));
const sendError=(res,e)=>res.status(e.statusCode||500).json({status:'error',code:e.code||'MIDMONTH_ERROR',message:e.statusCode?e.message:'Unable to complete the mid-month payroll operation.'});
const ready=()=>{if(process.env.CHRIS_ZERMATT_SPLIT_PAYROLL_RELEASE_READY!=='true')invalid('Payroll activation is awaiting verified deployment.');};
router.get('/',async(req,res)=>{try{return res.json({status:'success',data:{...await service.list(req.auth.organizationId,req.auth.userId),releaseReady:process.env.CHRIS_ZERMATT_SPLIT_PAYROLL_RELEASE_READY==='true'}});}catch(e){return sendError(res,e);}});
router.post('/activate',async(req,res)=>{try{ready();return res.json({status:'success',data:await service.activate(req.auth.organizationId,req.auth.userId,req.body?.periodMonth)});}catch(e){return sendError(res,e);}});
router.post('/runs',async(req,res)=>{try{ready();return res.status(201).json({status:'success',data:{runId:await service.generate(req.auth.organizationId,req.auth.userId,req.body?.periodMonth)}});}catch(e){return sendError(res,e);}});
router.get('/runs/:id',async(req,res)=>{try{return res.json({status:'success',data:await service.detail(req.auth.organizationId,req.auth.userId,req.params.id)});}catch(e){return sendError(res,e);}});
router.post('/runs/:id/action',async(req,res)=>{try{ready();return res.json({status:'success',data:await service.decide(req.auth.organizationId,req.auth.userId,req.params.id,req.body?.action,req.body?.notes,req.body?.payments)});}catch(e){return sendError(res,e);}});
router.get('/runs/:id/export',async(req,res)=>{
 try {
  const data=await service.detail(req.auth.organizationId,req.auth.userId,req.params.id);
  const approved=['APPROVED','PAID'].includes(data.run.status);
  if(req.query.stage==='payout'&&!approved)invalid('Payout export requires General Manager approval.');
  const rows=[['Employee No','Employee Name','Full Monthly Gross','Current Transport Support','Previous Unpaid','Previous Overpaid','Overpaid Deduction','Overpaid Remaining','Net Pay','Bank','Account Name','Account Number','Actual Paid','Payment Reference']];
  for(const l of data.lines) {
   const s=l.snapshot,b=s.paymentDetails||{};
   if(req.query.stage==='payout'&&Number(l.netPay)>0&&(!b.bankName||!b.accountNumber))invalid(`Complete bank details and regenerate payroll for ${s.employeeNumber} before payout export.`);
   rows.push([s.employeeNumber,s.employeeName,s.fullMonthlyGross,s.currentEntitlement,s.previousUnpaid,s.previousOverpaid,s.overpaidDeduction,s.overpaidRemaining,Number(l.netPay),b.bankName||'',b.accountName||'',b.accountNumber||'',l.actualPaid==null?'':Number(l.actualPaid),l.paymentReference||'']);
  }
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Transport Support Pay');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Payroll stage',data.run.status],['Payment date',`${new Date(data.run.periodMonth).toISOString().slice(0,7)}-15`],['Control','This export is not a payment confirmation. Record actual receipts, including zero payments, to create next-month balances.'],['Loan recovery',0]]),'Controls');
  res.setHeader('Content-Disposition',`attachment; filename="CHRiS_Transport_Support_${new Date(data.run.periodMonth).toISOString().slice(0,7)}_${approved?'Approved':'Review'}.xlsx"`);
  return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
 }catch(e){return sendError(res,e);}
});
module.exports=router;

