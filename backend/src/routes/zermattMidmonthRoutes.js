const express=require('express');
const XLSX=require('xlsx');
const { appendTransportSupportAnalytics } = require('../services/transportSupportExportAnalytics');
const { HEADERS: registerHeaders, bankDetailIssues } = require('../services/zermattTransportBenefitControl');
const prisma=require('../config/prisma');
const {requireAuth}=require('../middleware/authMiddleware');
const {isZermatt}=require('../services/zermattHrFinancialAccessService');
const service=require('../services/zermattMidmonthService').createService(prisma,{benefitsOnly:true});
const {invalid}=require('../services/zermattMidmonthDomain');
const router=express.Router();
router.use(requireAuth,(req,res,next)=>isZermatt(req)?next():res.status(403).json({status:'error',message:'This portal is restricted to Zermatt.'}));
const sendError=(res,e)=>res.status(e.statusCode||500).json({status:'error',code:e.code||'MIDMONTH_ERROR',message:e.statusCode?e.message:'Unable to complete the transport benefit operation.',...(e.details?{details:e.details}:{})});
const ready=()=>{if(process.env.CHRIS_ZERMATT_SPLIT_PAYROLL_RELEASE_READY!=='true')invalid('Transport benefit processing is awaiting verified deployment.');};
router.get('/',async(req,res)=>{try{return res.json({status:'success',data:{...await service.list(req.auth.organizationId,req.auth.userId),registerHeaders,releaseReady:process.env.CHRIS_ZERMATT_SPLIT_PAYROLL_RELEASE_READY==='true'}});}catch(e){return sendError(res,e);}});
router.get('/readiness',async(req,res)=>{try{return res.json({status:'success',data:await service.getPreparationReadiness(req.auth.organizationId,req.auth.userId,req.query.periodMonth)});}catch(e){return sendError(res,e);}});
router.post('/activate',async(req,res)=>{try{ready();return res.json({status:'success',data:await service.activate(req.auth.organizationId,req.auth.userId,req.body?.periodMonth)});}catch(e){return sendError(res,e);}});
router.post('/runs',async(req,res)=>{try{ready();return res.status(201).json({status:'success',data:{runId:await service.generate(req.auth.organizationId,req.auth.userId,req.body?.periodMonth)}});}catch(e){return sendError(res,e);}});
router.get('/runs/:id',async(req,res)=>{try{return res.json({status:'success',data:await service.detail(req.auth.organizationId,req.auth.userId,req.params.id)});}catch(e){return sendError(res,e);}});
router.patch('/runs/:id/lines/:lineId/benefit-inputs',async(req,res)=>{try{ready();return res.json({status:'success',data:await service.saveBenefitInputs(req.auth.organizationId,req.auth.userId,req.params.id,req.params.lineId,req.body?.inputs||{},req.body?.notes)});}catch(e){return sendError(res,e);}});
const workedDaysHeaders=['Employee No','Extra Days Worked','Public Holiday Days Worked'];
const benefitsPath='/api/benefits/transport-support';
router.post('/runs/:id/worked-days',async(req,res)=>{
 try {
  if(req.baseUrl!==benefitsPath)invalid('Use the Benefits Transport Support workspace for worked-day uploads.',404);
  ready();
  const {file,confirmation,notes}=req.body||{};
  if(typeof file!=='string'||!file.length||file.length>95000)invalid('Choose an Excel or CSV file under 70 KB.',400);
  let values;
  try {
   const book=XLSX.read(Buffer.from(file,'base64'),{type:'buffer',sheetRows:1002,sheets:0});
   const sheet=book.Sheets[book.SheetNames[0]];
   if(sheet?.["!fullref"] && XLSX.utils.decode_range(sheet["!fullref"]).e.r>1000)throw new Error("Too many rows");
   values=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:true,range:0});
  } catch {
   invalid('The worked-day file could not be read.',400);
  }
  const [headers,...records]=values;
  if(workedDaysHeaders.some((label,index)=>String(headers?.[index]??'').trim()!==label))invalid('Use the Transport Support worked-day template headers.',400);
  const rows=records.map(([employeeNumber,extraDays,phDays],index)=>({employeeNumber,extraDays,phDays,rowNumber:index+2}))
   .filter(row=>row.extraDays!==''||row.phDays!=='');
  const data=await service.bulkWorkedDays(req.auth.organizationId,req.auth.userId,req.params.id,rows,confirmation,notes);
  return res.json({status:'success',data});
 }catch(e){return sendError(res,e);}
});
router.post('/runs/:id/action',async(req,res)=>{try{ready();return res.json({status:'success',data:await service.decide(req.auth.organizationId,req.auth.userId,req.params.id,req.body?.action,req.body?.notes,req.body?.payments)});}catch(e){return sendError(res,e);}});
router.get('/runs/:id/export',async(req,res)=>{
 try {
  const external=['external','payout'].includes(req.query.stage);
  const data=await service.detail(req.auth.organizationId,req.auth.userId,req.params.id,{useCurrentBankDetails:external,reviewExport:!external});
  if(!data.responsibilities.includes('HEAD_HR'))invalid('The assigned Head HR prepares and exports this benefit register.',403);
  const approved=['APPROVED','PAID'].includes(data.run.status);
  if(external&&!approved)invalid('Head HR approval is required before external-workflow export.');
  const bankExceptions=external?data.lines.filter(line=>Number(line.netPay)>0).map(line=>({...line,issues:bankDetailIssues(line.snapshot.paymentDetails)})).filter(line=>line.issues.length):[];
  if(req.query.stage==='payout'&&bankExceptions.length)invalid('Complete bank details before generating a payout export.');
  const workbook=XLSX.utils.book_new();
  appendTransportSupportAnalytics(workbook,data);
  const {appendRegisterSheets,selectedIndexes}=require('../services/payrollRegisterExport');
  const remarksIndex=data.register.headers.indexOf('Remark/Notes');
  const exceptionEmployees=new Map(bankExceptions.map(line=>[line.snapshot.employeeNumber,line.issues.join(', ')]));
  const columns=selectedIndexes(data.register.headers,req.query.columns);
  const movementIndex=data.register.headers.indexOf('Hire / Exit in Period');
  if(data.register.rows.some(row=>row[movementIndex])&&!columns.includes(movementIndex))columns.push(movementIndex);

  if((bankExceptions.length||data.register.rows.some(row=>row[remarksIndex]))&&!columns.includes(remarksIndex))columns.push(remarksIndex);
  const rows=data.register.rows.map(row=>{
   if(!exceptionEmployees.has(row[2]))return row;
   const flagged=[...row];
   flagged[remarksIndex]=['REQUIRES COMPLETE BANK DETAILS — HOLD PAYMENT',exceptionEmployees.get(row[2]),row[remarksIndex]].filter(Boolean).join(' · ');
   return flagged;
  });
  const indexes=appendRegisterSheets(workbook,{
   ...data.register,rows,columns,branchIndex:1,employeeIndex:2,serialIndex:0,masterName:'Combined',
  });
  const selected=indexes.length<data.register.headers.length;
  if(bankExceptions.length) {
   const sheet=XLSX.utils.aoa_to_sheet([
    ['REQUIRES COMPLETE BANK DETAILS — HOLD PAYMENT'],
    ['EmployeeNO','FullName','Location','Net','Payment status','Reason'],
    ...bankExceptions.map(({snapshot,netPay,issues})=>[
     snapshot.employeeNumber,snapshot.employeeName,snapshot.location,Number(netPay),'REQUIRES COMPLETE BANK DETAILS',issues.join(', '),
    ]),
   ]);
   sheet['!cols']=[{wch:20},{wch:32},{wch:22},{wch:16},{wch:40},{wch:58}];
   XLSX.utils.book_append_sheet(workbook,sheet,'Bank Details Required');
  }

  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
   ['Benefit stage',data.run.status],
   ['Selected columns',indexes.map(i=>data.register.headers[i]).join(', ')],
   ['Export stage',external?'HEAD HR APPROVED — FOR EXTERNAL APPROVAL':'DRAFT REVIEW — NOT APPROVED'],
   ['Workflow','Head HR prepares and approves in CHRiS; Auditor → General Manager → Chief Accountant approvals and payment processing occur externally.'],
   ['Payment date',`${new Date(data.run.periodMonth).toISOString().slice(0,7)}-15`],
   ['Net basis','Mid-Month + Bonus + Overtime Pay + Public Holiday Pay (or preserved legacy combined amount) + Previous Month Short Payment − applied overpayment deduction. End of the Month is a reference only.'],
   ['Extra / PH days','End-of-month gross ÷ 26 × days × 1.5 for overtime and × 2 for public holidays. Older manual amounts remain until recalculated.'],
   ['Overpayment control','Previous Month Overpayment is the opening balance. Deduction is capped at available benefit pay; remaining overpayment carries forward. See Reconciliation.'],
   ...(bankExceptions.length?[['Bank details required',`${bankExceptions.length} payable employee(s) require complete bank details. Hold payment for these employees. See Bank Details Required.`]]:[]),
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


